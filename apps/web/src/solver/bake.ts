import { AnimationClip, NumberKeyframeTrack, QuaternionKeyframeTrack, type Object3D } from "three";
import type { AvatarHandle } from "../avatar/types";
import { solveFrame } from "./solve";
import type { LmClip, SolveOptions } from "./types";
import { DEFAULT_SOLVE } from "./types";

function objectPath(root: Object3D, object: Object3D): string {
  const parts: string[] = [];
  let current: Object3D | null = object;
  while (current && current !== root) {
    parts.push(current.name || current.uuid);
    current = current.parent;
  }
  return parts.reverse().join("/");
}

export function bakeClip(avatar: AvatarHandle, clip: LmClip, options: SolveOptions = DEFAULT_SOLVE): AnimationClip {
  const start = Math.max(0, Math.min(clip.meta.trimStart, clip.frames.length - 1));
  const end = Math.max(start + 1, Math.min(clip.meta.trimEnd || clip.frames.length, clip.frames.length));
  const times: number[] = [];
  const boneSamples = new Map<string, number[]>();
  const morphSamples = new Map<string, number[]>();
  for (let index = start; index < end; index += 1) {
    times.push((index - start) / clip.fps);
    solveFrame(avatar, clip.frames[index], { dominant: clip.meta.dominant, ...options });
    for (const bone of Object.values(avatar.bones)) {
      const sample = boneSamples.get(bone.uuid) ?? [];
      sample.push(bone.quaternion.x, bone.quaternion.y, bone.quaternion.z, bone.quaternion.w);
      boneSamples.set(bone.uuid, sample);
    }
    for (const mesh of avatar.meshes) {
      mesh.morphTargetInfluences?.forEach((value, influence) => {
        const key = `${mesh.uuid}:${influence}`;
        const sample = morphSamples.get(key) ?? [];
        sample.push(value);
        morphSamples.set(key, sample);
      });
    }
  }
  avatar.resetPose();
  const tracks = Object.values(avatar.bones).map(
    (bone) => new QuaternionKeyframeTrack(`${objectPath(avatar.root, bone)}.quaternion`, times, boneSamples.get(bone.uuid) ?? []),
  );
  for (const mesh of avatar.meshes) {
    const path = objectPath(avatar.root, mesh);
    mesh.morphTargetInfluences?.forEach((_, influence) => {
      tracks.push(
        new NumberKeyframeTrack(
          `${path}.morphTargetInfluences[${influence}]`,
          times,
          morphSamples.get(`${mesh.uuid}:${influence}`) ?? [],
        ),
      );
    });
  }
  const duration = times.length ? times[times.length - 1] : 0;
  return new AnimationClip(`sign-${start}-${end}`, Math.max(duration, 1 / clip.fps), tracks);
}
