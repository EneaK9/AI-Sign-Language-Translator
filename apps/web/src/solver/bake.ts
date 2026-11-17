import type { AvatarHandle } from "../avatar/types";
import { channelsOf, smoothQuaternions, smoothSeries, type SignMotion } from "../player/motion";
import { prepareFrames } from "./prepare";
import { solveFrame } from "./solve";
import type { LmClip, SolveOptions } from "./types";
import { DEFAULT_SOLVE } from "./types";

/**
 * Smoothing per bone, in frames (sigma). Fingers keep crisp shapes; the big joints and the head get more,
 * because their jitter reads as tremor and their real motion is slow.
 */
function sigmaFor(key: string): number {
  if (/Hand(Thumb|Index|Middle|Ring|Pinky)\d$/.test(key)) return 0.9;
  if (key === "leftHand" || key === "rightHand") return 1.1;
  if (/(UpperArm|ForeArm|Shoulder)$/.test(key)) return 1.4;
  if (key === "head" || key === "neck") return 1.8;
  return 0;
}

const MORPH_SIGMA = 1.2;

export function bakeClip(avatar: AvatarHandle, clip: LmClip, options: SolveOptions = DEFAULT_SOLVE): SignMotion {
  const start = Math.max(0, Math.min(clip.meta.trimStart, clip.frames.length - 1));
  const end = Math.max(start + 1, Math.min(clip.meta.trimEnd || clip.frames.length, clip.frames.length));
  const frames = prepareFrames(clip.frames);
  const { bones, morphs } = channelsOf(avatar);
  const count = end - start;
  const quats = new Float32Array(count * bones.length * 4);
  const morphValues = morphs.map(() => new Float32Array(count));
  for (let index = start; index < end; index += 1) {
    const frame = index - start;
    solveFrame(avatar, frames[index], { dominant: clip.meta.dominant, ...options });
    bones.forEach((bone, slot) => bone.quaternion.toArray(quats, (frame * bones.length + slot) * 4));
    morphs.forEach((channel, slot) => {
      morphValues[slot][frame] = channel.mesh.morphTargetInfluences?.[channel.index] ?? 0;
    });
  }
  avatar.resetPose();
  const keys = Object.keys(avatar.bones);
  keys.forEach((key, slot) => smoothQuaternions(quats, count, bones.length, slot, sigmaFor(key)));
  const moving: SignMotion["morphs"] = [];
  morphValues.forEach((values, channel) => {
    if (values.some((value) => value > 1e-3)) moving.push({ channel, values: smoothSeries(values, MORPH_SIGMA) });
  });
  return {
    name: `sign-${start}-${end}`,
    fps: clip.fps,
    frames: count,
    duration: Math.max((count - 1) / clip.fps, 1 / clip.fps),
    quats,
    morphs: moving,
  };
}
