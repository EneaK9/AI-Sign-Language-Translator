import { Quaternion, Vector3 } from "three";
import type { AvatarHandle } from "../avatar/types";
import { ARM_SIDES, poseArm } from "./arms";
import { avatarPalm } from "./calibrate";
import { FINGERS, curlFinger, norm, type Palm } from "./hands";
import { poseFinger, poseWrist, type HandSide } from "./solve";
import type { Vec3 } from "./types";

/** Gentle curl per joint (knuckle, middle, tip). The little finger curls most, like a hand at rest. */
const RELAXED_CURL: Record<string, readonly number[]> = {
  Thumb: [0.08, 0.12, 0.12],
  Index: [0.16, 0.28, 0.16],
  Middle: [0.2, 0.34, 0.2],
  Ring: [0.25, 0.4, 0.22],
  Pinky: [0.32, 0.46, 0.25],
};

/** Palm from where the fingers point and where the palm's `normal` (as defined by `palmFrom`) points. */
function palmToward(forward: Vec3, normal: Vec3): Palm {
  const f = norm(forward);
  const along = normal[0] * f[0] + normal[1] * f[1] + normal[2] * f[2];
  const n = norm([normal[0] - f[0] * along, normal[1] - f[1] * along, normal[2] - f[2] * along]);
  const across: Vec3 = norm([f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]]);
  return { across, forward: f, normal: n };
}

/** Relax every finger of one hand from the avatar's own rest shape. */
export function relaxFingers(avatar: AvatarHandle, side: HandSide): void {
  const key = side === "Left" ? "left" : "right";
  const rest = avatar.hands.fingers[key];
  const palm = avatarPalm(avatar.bones, side);
  if (!rest || !palm) return;
  const palmSide = side === "Right" ? 1 : -1;
  for (const finger of FINGERS) {
    const chain = rest[finger.name];
    if (!chain) continue;
    poseFinger(avatar, side, finger.name, curlFinger(chain, palmSide, RELAXED_CURL[finger.name]), palm);
  }
}

/**
 * Relaxed standing pose: arms hanging slightly away from the hips with soft elbows,
 * palms turned toward the thighs and fingers loosely curled. Returns local rotations by bone uuid.
 */
export function computeNeutral(avatar: AvatarHandle): Map<string, Quaternion> {
  avatar.resetPose();
  avatar.root.updateWorldMatrix(true, true);
  for (const [name, side] of [
    ["Left", ARM_SIDES.left],
    ["Right", ARM_SIDES.right],
  ] as const) {
    const out = side.out;
    poseArm(avatar, side, new Vector3(0.22 * out, -0.975, -0.04), new Vector3(0.2 * out, -0.9, 0.36));
    poseWrist(name, palmToward([0.06 * out, -0.95, 0.26], [1, 0, 0.45 * out]), avatar);
    relaxFingers(avatar, name);
  }
  const pose = new Map<string, Quaternion>();
  for (const bone of Object.values(avatar.bones)) pose.set(bone.uuid, bone.quaternion.clone());
  avatar.resetPose();
  return pose;
}
