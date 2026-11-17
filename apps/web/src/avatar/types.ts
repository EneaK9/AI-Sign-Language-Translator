import type { Bone, Mesh, Object3D, Quaternion } from "three";
import type { RestPose } from "../solver/aim";

export type HandRig = {
  basis: Partial<Record<"left" | "right", Quaternion>>;
  handWorld: Partial<Record<"left" | "right", Quaternion>>;
  /** Rest direction of every finger segment, measured in the avatar's own palm frame. */
  fingers: Partial<Record<"left" | "right", Record<string, [number, number, number][]>>>;
};

export type AvatarHandle = {
  root: Object3D;
  bones: Record<string, Bone>;
  meshes: Mesh[];
  rest: RestPose;
  hands: HandRig;
  /** Relaxed standing pose (local bone rotations), used between signs and while idle. */
  neutral: Map<string, Quaternion>;
  resetPose: () => void;
  /** Bind pose, then the relaxed neutral pose on top. */
  neutralPose: () => void;
  setMorph: (name: string, value: number) => void;
};

export type CameraPreset = "front" | "angle" | "hand";

export const CAMERA_PRESETS: Record<CameraPreset, { position: [number, number, number]; target: [number, number, number] }> = {
  front: { position: [0, 1.42, 2.15], target: [0, 1.28, 0] },
  angle: { position: [0.85, 1.48, 1.75], target: [0, 1.28, 0] },
  hand: { position: [-0.38, 1.36, 0.95], target: [-0.18, 1.22, 0.2] },
};

export function restQuaternion(bone: Bone): Quaternion {
  return bone.userData.restQuat as Quaternion;
}
