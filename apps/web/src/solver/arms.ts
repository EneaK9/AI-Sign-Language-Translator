import { Matrix4, Quaternion, Vector3, type Bone } from "three";
import type { AvatarHandle } from "../avatar/types";
import { aimBone, type RestPose } from "./aim";
import { toAvatarSpace } from "./space";
import type { Vec3 } from "./types";

export const ARM_SIDES = {
  left: { shoulder: 11, elbow: 13, wrist: 15, clavicle: "leftShoulder", upper: "leftUpperArm", fore: "leftForeArm", out: 1 },
  right: { shoulder: 12, elbow: 14, wrist: 16, clavicle: "rightShoulder", upper: "rightUpperArm", fore: "rightForeArm", out: -1 },
} as const;

export type ArmSide = (typeof ARM_SIDES)[keyof typeof ARM_SIDES];

function vec(point: Vec3): Vector3 {
  const converted = toAvatarSpace(point);
  return new Vector3(converted[0], converted[1], converted[2]);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** World rotation that carries the frame (fromDir, fromUp) onto (toDir, toUp). */
function frameRotation(fromDir: Vector3, fromUp: Vector3, toDir: Vector3, toUp: Vector3): Quaternion {
  const basis = (dir: Vector3, up: Vector3) => {
    const x = dir.clone().normalize();
    const z = new Vector3().crossVectors(x, up).normalize();
    const y = new Vector3().crossVectors(z, x);
    return new Matrix4().makeBasis(x, y, z);
  };
  const from = basis(fromDir, fromUp);
  const to = basis(toDir, toUp);
  return new Quaternion().setFromRotationMatrix(to.multiply(from.invert()));
}

/**
 * Aim the upper arm along `upperDir` and roll it so the elbow hinges in the plane that holds the forearm.
 * The avatar's bind pose already has a bent elbow, which tells us where its hinge plane is.
 * A nearly straight arm has no defined plane, so it falls back to the shortest rotation.
 */
export function aimUpperArm(upper: Bone, fore: Bone, upperDir: Vector3, foreDir: Vector3, rest: RestPose): void {
  const parent = upper.parent;
  const restDir = rest.dir.get(upper.uuid);
  const restFore = rest.dir.get(fore.uuid);
  const boneRest = rest.world.get(upper.uuid);
  if (!parent || !restDir || !restFore || !boneRest || upperDir.lengthSq() < 1e-8) return;
  parent.updateWorldMatrix(true, false);
  const parentNow = parent.getWorldQuaternion(new Quaternion());
  const parentRest = rest.world.get(parent.uuid) ?? new Quaternion();
  const carry = parentNow.clone().multiply(parentRest.clone().invert());
  const dirNow = restDir.clone().applyQuaternion(carry).normalize();
  const target = upperDir.clone().normalize();
  let delta = new Quaternion().setFromUnitVectors(dirNow, target);

  const fore3 = foreDir.clone().normalize();
  const bend = fore3.clone().addScaledVector(target, -fore3.dot(target));
  const weight = smoothstep(0.12, 0.38, bend.length());
  const foreNow = restFore.clone().applyQuaternion(carry);
  const restBend = foreNow.addScaledVector(dirNow, -foreNow.dot(dirNow));
  if (weight > 0 && restBend.lengthSq() > 1e-6) {
    delta = delta.slerp(frameRotation(dirNow, restBend, target, bend), weight);
  }
  const world = delta.multiply(carry).multiply(boneRest);
  upper.quaternion.copy(parentNow.invert().multiply(world));
  upper.updateWorldMatrix(false, true);
}

/** The collarbone lifts and rolls forward a little as the arm rises or reaches, like a real shoulder. */
export function liftClavicle(clavicle: Bone, upperDir: Vector3, out: 1 | -1, rest: RestPose): void {
  const restDir = rest.dir.get(clavicle.uuid);
  if (!restDir) return;
  const dir = upperDir.clone().normalize();
  const elevation = Math.asin(Math.min(1, Math.max(-1, dir.y)));
  const lift = 0.32 * smoothstep(-0.7, 1.0, elevation);
  const reach = 0.16 * smoothstep(0.25, 0.95, dir.z);
  const target = restDir
    .clone()
    .applyAxisAngle(new Vector3(0, 0, out), lift)
    .applyAxisAngle(new Vector3(0, -out, 0), reach);
  aimBone(clavicle, target, rest);
  clavicle.updateWorldMatrix(false, true);
}

/** Pose one arm from world-space directions of the upper arm and forearm. */
export function poseArm(avatar: AvatarHandle, side: ArmSide, upperDir: Vector3, foreDir: Vector3): void {
  const upper = avatar.bones[side.upper];
  const fore = avatar.bones[side.fore];
  const clavicle = avatar.bones[side.clavicle];
  if (!upper || !fore) return;
  // MediaPipe depth is the noisiest axis; elbows pushed far behind the torso are almost always a tracking error.
  const dir = upperDir.clone().normalize();
  if (dir.z < -0.35) {
    dir.z = -0.35;
    dir.normalize();
  }
  if (clavicle) liftClavicle(clavicle, dir, side.out, avatar.rest);
  aimUpperArm(upper, fore, dir, foreDir, avatar.rest);
  aimBone(fore, foreDir, avatar.rest);
  fore.updateWorldMatrix(false, true);
}

export function solveArms(pose: Vec3[] | null, avatar: AvatarHandle, _rest?: RestPose): void {
  if (!pose || pose.length < 17) return;
  for (const side of Object.values(ARM_SIDES)) {
    const shoulder = vec(pose[side.shoulder]);
    const elbow = vec(pose[side.elbow]);
    const wrist = vec(pose[side.wrist]);
    const upperDir = elbow.clone().sub(shoulder);
    const foreDir = wrist.clone().sub(elbow);
    if (upperDir.lengthSq() < 1e-8 || foreDir.lengthSq() < 1e-8) continue;
    poseArm(avatar, side, upperDir, foreDir);
  }
}
