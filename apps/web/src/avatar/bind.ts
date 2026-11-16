import type { Bone, Mesh, Object3D, Quaternion } from "three";
import { captureRest } from "../solver/aim";
import { calibrateHands } from "../solver/calibrate";
import { allBoneNames } from "./bones";
import type { AvatarHandle } from "./types";

export function bindAvatar(root: Object3D): AvatarHandle {
  const wanted = allBoneNames();
  const bones: Record<string, Bone> = {};
  const meshes: Mesh[] = [];
  root.traverse((node) => {
    const bone = node as Bone;
    if (bone.isBone) {
      bone.userData.restQuat = bone.quaternion.clone();
      for (const [key, name] of Object.entries(wanted)) {
        if (bone.name === name) bones[key] = bone;
      }
    }
    const mesh = node as Mesh;
    if (mesh.isMesh) meshes.push(mesh);
  });
  return {
    root,
    bones,
    meshes,
    rest: captureRest(root, Object.values(bones)),
    hands: calibrateHands(root, bones),
    resetPose: () => {
      root.traverse((node) => {
        const bone = node as Bone;
        const rest = bone.userData.restQuat as Quaternion | undefined;
        if (bone.isBone && rest) bone.quaternion.copy(rest);
        const mesh = node as Mesh;
        if (mesh.isMesh && mesh.morphTargetInfluences) mesh.morphTargetInfluences.fill(0);
      });
    },
    setMorph: (name, value) => {
      for (const mesh of meshes) {
        const index = mesh.morphTargetDictionary?.[name];
        if (index !== undefined && mesh.morphTargetInfluences) mesh.morphTargetInfluences[index] = value;
      }
    },
  };
}
