import type { Bone, Mesh, Object3D, Quaternion } from "three";
import type { RestPose } from "../solver/aim";

export type HandRig = {
  basis: Partial<Record<"left" | "right", Quaternion>>;
  handWorld: Partial<Record<"left" | "right", Quaternion>>;
};

export type AvatarHandle = {
  root: Object3D;
  bones: Record<string, Bone>;
  meshes: Mesh[];
  rest: RestPose;
  hands: HandRig;
  resetPose: () => void;
  setMorph: (name: string, value: number) => void;
};

export type CameraPreset = "front" | "angle" | "hand";

export const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  front: { position: [0, 1.42, 2.15], target: [0, 1.28, 0] },
  angle: { position: [0.85, 1.48, 1.75], target: [0, 1.28, 0] },
  hand: { position: [-0.32, 1.12, 0.78], target: [-0.22, 1.02, 0.1] },
};

export function restQuaternion(bone: Bone): Quaternion {
  return bone.userData.restQuat as Quaternion;
}
