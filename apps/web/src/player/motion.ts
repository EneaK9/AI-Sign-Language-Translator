import { Quaternion, type Bone, type Mesh } from "three";
import type { AvatarHandle } from "../avatar/types";

export type MorphChannel = { mesh: Mesh; index: number };

export type Channels = { bones: Bone[]; morphs: MorphChannel[] };

/** A baked sign: local bone rotations and morph weights per frame, in the handle's channel order. */
export type SignMotion = {
  name: string;
  fps: number;
  frames: number;
  duration: number;
  /** frames × bones × 4 */
  quats: Float32Array;
  /** Only morphs that move; everything else stays at zero. */
  morphs: { channel: number; values: Float32Array }[];
};

const cache = new WeakMap<AvatarHandle, Channels>();

/** Stable bone and morph order shared by the baker and the player. */
export function channelsOf(handle: AvatarHandle): Channels {
  let channels = cache.get(handle);
  if (!channels) {
    const morphs: MorphChannel[] = [];
    for (const mesh of handle.meshes) {
      mesh.morphTargetInfluences?.forEach((_, index) => morphs.push({ mesh, index }));
    }
    channels = { bones: Object.values(handle.bones), morphs };
    cache.set(handle, channels);
  }
  return channels;
}

/** Write the pose at `time` (seconds, clamped to the clip) into the output buffers. */
export function sampleMotion(motion: SignMotion, time: number, quats: Float32Array, morphs: Float32Array): void {
  const boneCount = quats.length / 4;
  const position = Math.min(motion.frames - 1, Math.max(0, time * motion.fps));
  const first = Math.floor(position);
  const second = Math.min(first + 1, motion.frames - 1);
  const weight = position - first;
  // slerpFlat is typed for number[] but only indexes, so typed arrays work.
  const out = quats as unknown as number[];
  const src = motion.quats as unknown as number[];
  for (let bone = 0; bone < boneCount; bone += 1) {
    Quaternion.slerpFlat(
      out,
      bone * 4,
      src,
      (first * boneCount + bone) * 4,
      src,
      (second * boneCount + bone) * 4,
      weight,
    );
  }
  morphs.fill(0);
  for (const track of motion.morphs) {
    const a = track.values[first];
    morphs[track.channel] = a + (track.values[second] - a) * weight;
  }
}

function gaussian(sigma: number): Float32Array {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = new Float32Array(radius * 2 + 1);
  let total = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const value = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    kernel[offset + radius] = value;
    total += value;
  }
  return kernel.map((value) => value / total);
}

/**
 * Zero-phase Gaussian smoothing of one bone's rotations across frames. Runs offline, so unlike a live
 * filter it adds no lag. Signs are aligned to one hemisphere first so averaging is valid.
 */
export function smoothQuaternions(values: Float32Array, frames: number, boneCount: number, bone: number, sigma: number): void {
  if (sigma <= 0 || frames < 3) return;
  const series = new Float32Array(frames * 4);
  for (let frame = 0; frame < frames; frame += 1) {
    const at = (frame * boneCount + bone) * 4;
    let sign = 1;
    if (frame > 0) {
      const previous = (frame - 1) * 4;
      const d =
        series[previous] * values[at] +
        series[previous + 1] * values[at + 1] +
        series[previous + 2] * values[at + 2] +
        series[previous + 3] * values[at + 3];
      if (d < 0) sign = -1;
    }
    for (let k = 0; k < 4; k += 1) series[frame * 4 + k] = values[at + k] * sign;
  }
  const kernel = gaussian(sigma);
  const radius = (kernel.length - 1) / 2;
  for (let frame = 0; frame < frames; frame += 1) {
    let x = 0;
    let y = 0;
    let z = 0;
    let w = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const source = Math.min(frames - 1, Math.max(0, frame + offset)) * 4;
      const weight = kernel[offset + radius];
      x += series[source] * weight;
      y += series[source + 1] * weight;
      z += series[source + 2] * weight;
      w += series[source + 3] * weight;
    }
    const length = Math.hypot(x, y, z, w) || 1;
    const at = (frame * boneCount + bone) * 4;
    values[at] = x / length;
    values[at + 1] = y / length;
    values[at + 2] = z / length;
    values[at + 3] = w / length;
  }
}

export function smoothSeries(values: Float32Array, sigma: number): Float32Array {
  if (sigma <= 0 || values.length < 3) return values;
  const kernel = gaussian(sigma);
  const radius = (kernel.length - 1) / 2;
  const out = new Float32Array(values.length);
  for (let frame = 0; frame < values.length; frame += 1) {
    let total = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      total += values[Math.min(values.length - 1, Math.max(0, frame + offset))] * kernel[offset + radius];
    }
    out[frame] = total;
  }
  return out;
}
