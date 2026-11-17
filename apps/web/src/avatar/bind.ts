import type { Bone, Mesh, Object3D, Quaternion } from "three";
import { captureRest } from "../solver/aim";
import { calibrateHands } from "../solver/calibrate";
import { computeNeutral } from "../solver/neutral";
import { allBoneNames } from "./bones";
import type { AvatarHandle } from "./types";

export function bindAvatar(root: Object3D): AvatarHandle {
  const wanted = allBoneNames();
  const bones: Record<string, Bone> = {};
  const meshes: Mesh[] = [];
  const allBones: Bone[] = [];
  root.traverse((node) => {
    const bone = node as Bone;
    if (bone.isBone) {
      bone.userData.restQuat = bone.quaternion.clone();
      allBones.push(bone);
      for (const [key, name] of Object.entries(wanted)) {
        if (bone.name === name) bones[key] = bone;
      }
    }
    const mesh = node as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  const rest = captureRest(root, Object.values(bones));
  const handle: AvatarHandle = {
    root,
    bones,
    meshes,
    rest,
    hands: calibrateHands(root, bones, rest),
    neutral: new Map(),
    resetPose: () => {
      for (const bone of allBones) bone.quaternion.copy(bone.userData.restQuat as Quaternion);
      for (const mesh of meshes) mesh.morphTargetInfluences?.fill(0);
    },
    neutralPose: () => {
      handle.resetPose();
      for (const bone of Object.values(bones)) {
        const pose = handle.neutral.get(bone.uuid);
        if (pose) bone.quaternion.copy(pose);
      }
    },
    setMorph: (name, value) => {
      for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary?.[name];
        if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
      }
    },
  };
  handle.neutral = computeNeutral(handle);
  return handle;
}
