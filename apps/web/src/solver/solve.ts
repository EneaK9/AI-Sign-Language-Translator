import { Quaternion, Vector3 } from "three";
import type { AvatarHandle } from "../avatar/types";
import { aimBone } from "./aim";
import { solveArms } from "./arms";
import { avatarPalm, palmQuaternion } from "./calibrate";
import { applyFace } from "./face";
import { evidenceOf, fuseEvidence, type HandEvidence } from "./fuse";
import {
  FINGERS,
  constrainFinger,
  fingerBoneName,
  fingerLift,
  fingerSpread,
  fromPalm,
  alignChains,
  holdTogether,
  norm,
  repairFingerDepth,
  straightness,
  togetherness,
  type Palm,
} from "./hands";
import { toAvatarSpace } from "./space";
import type { LandmarkFrame, SolveOptions, Vec3 } from "./types";

export type HandSide = "Left" | "Right";

const HAND = {
  Left: { key: "left", hand: "leftHand", fore: "leftForeArm" },
  Right: { key: "right", hand: "rightHand", fore: "rightForeArm" },
} as const;

/** Share of forearm roll given to the forearm bone. The rest stays in the wrist, so neither joint candy-wraps. */
const FOREARM_TWIST_SHARE = 0.5;
const MAX_TWIST = 2.7;
const MAX_WRIST_TWIST = 1.0;
/** Wrist flexion, extension and deviation together; real wrists stop around 70–85°. */
const MAX_WRIST_SWING = 1.3;
const Y_AXIS = new Vector3(0, 1, 0);

function convert(landmarks: Vec3[]): Vec3[] {
  return landmarks.map((point) => toAvatarSpace(point));
}

function wrapAngle(angle: number): number {
  if (angle > Math.PI) return angle - 2 * Math.PI;
  if (angle < -Math.PI) return angle + 2 * Math.PI;
  return angle;
}

function clampRotation(rotation: Quaternion, max: number): Quaternion {
  if (rotation.w < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
  const angle = 2 * Math.acos(Math.min(1, rotation.w));
  if (angle <= max || angle < 1e-6) return rotation;
  return new Quaternion().slerp(rotation, max / angle);
}

/**
 * Turn the wrist so the avatar's palm matches `palm` (world space), within anatomical limits.
 * Roll around the forearm is split between the forearm and the wrist.
 */
export function poseWrist(side: HandSide, palm: Palm, avatar: AvatarHandle): void {
  const names = HAND[side];
  const hand = avatar.bones[names.hand];
  const fore = avatar.bones[names.fore];
  const restBasis = avatar.hands.basis[names.key];
  const restWorld = avatar.hands.handWorld[names.key];
  const restLocal = hand?.userData.restQuat as Quaternion | undefined;
  if (!hand || !fore || !restBasis || !restWorld || !restLocal || hand.parent !== fore) return;
  fore.updateWorldMatrix(true, false);
  const desired = palmQuaternion(palm).multiply(restBasis.clone().invert()).multiply(restWorld);
  const local = fore.getWorldQuaternion(new Quaternion()).invert().multiply(desired);
  const delta = restLocal.clone().invert().multiply(local);
  const axis = Y_AXIS.clone().applyQuaternion(restLocal.clone().invert()).normalize();
  const projected = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  const twist = wrapAngle(2 * Math.atan2(projected, delta.w));
  const swing = new Quaternion().setFromAxisAngle(axis, twist).invert().multiply(delta);
  const total = Math.max(-MAX_TWIST, Math.min(MAX_TWIST, twist));
  const foreTwist = total * FOREARM_TWIST_SHARE;
  const wristTwist = Math.max(-MAX_WRIST_TWIST, Math.min(MAX_WRIST_TWIST, total - foreTwist));
  fore.quaternion.multiply(new Quaternion().setFromAxisAngle(Y_AXIS, foreTwist));
  fore.updateWorldMatrix(false, true);
  hand.quaternion
    .copy(restLocal)
    .multiply(new Quaternion().setFromAxisAngle(axis, wristTwist))
    .multiply(clampRotation(swing, MAX_WRIST_SWING));
  hand.updateWorldMatrix(false, true);
}

/** Aim each segment of one finger along palm-local directions, measured on the avatar's current palm. */
export function poseFinger(avatar: AvatarHandle, side: HandSide, finger: string, chain: Vec3[], palm: Palm): void {
  for (let joint = 0; joint < chain.length; joint += 1) {
    const bone = avatar.bones[fingerBoneName(side, finger, joint)];
    if (!bone) continue;
    aimBone(bone, new Vector3(...fromPalm(norm(chain[joint]), palm)), avatar.rest);
    bone.updateWorldMatrix(false, true);
  }
}

/**
 * Pose one hand from tracked evidence: turn the wrist to the tracked palm, then shape each finger from its
 * palm-local directions, measured on the avatar's own palm.
 */
function solveHand(side: HandSide, evidence: HandEvidence, avatar: AvatarHandle, deepen = true): void {
  const palmSide = side === "Right" ? 1 : -1;
  poseWrist(side, evidence.palm, avatar);
  const palm = avatarPalm(avatar.bones, side);
  if (!palm) return;
  // Long fingers (index to little) share decisions, so fingers held together stay together.
  const long = evidence.locals.slice(1);
  const straight = long.map(straightness);
  const rawSpreads = long.map(fingerSpread);
  const together = togetherness(rawSpreads, straight, evidence.tipGaps, long.map((local) => fingerLift(local, palmSide)));
  const spreads = holdTogether(rawSpreads, together);
  const chains = alignChains(
    long.map((local, index) => constrainFinger(local, palmSide, spreads[index], evidence.cups[index], deepen)),
    together,
  );
  poseFinger(avatar, side, "Thumb", evidence.locals[0], palm);
  FINGERS.slice(1).forEach((finger, index) => poseFinger(avatar, side, finger.name, chains[index], palm));
}

export function solveFrame(avatar: AvatarHandle, frame: LandmarkFrame, options: SolveOptions): void {
  avatar.neutralPose();
  if (options.arms) solveArms(frame.pose, avatar);
  avatar.root.updateWorldMatrix(true, true);
  if (options.hands) {
    const source = options.handSource ?? "fused";
    const refine = options.refinePalm ?? true;
    const evidence = (side: HandSide, world: Vec3[] | null | undefined, image: Vec3[] | null | undefined): HandEvidence | null => {
      const palmSide = side === "Right" ? 1 : -1;
      const w = world ? convert(world) : null;
      const i = image && image.length === 21 ? convert(image) : null;
      if (!i || source === "world") return w ? evidenceOf(w, palmSide, refine) : null;
      const repaired = options.depthRepair === false ? i : repairFingerDepth(i, palmSide);
      if (!w || source === "image") return evidenceOf(repaired, palmSide);
      if (source === "hybrid") {
        const fromWorld = evidenceOf(w, palmSide, refine);
        return { ...evidenceOf(repaired, palmSide), palm: fromWorld.palm };
      }
      return fuseEvidence(w, i, palmSide, refine);
    };
    const left = options.dominant !== "right" ? evidence("Left", frame.lh, frame.lhi) : null;
    const right = options.dominant !== "left" ? evidence("Right", frame.rh, frame.rhi) : null;
    const deepen = options.deepen ?? true;
    if (left) solveHand("Left", left, avatar, deepen);
    if (right) solveHand("Right", right, avatar, deepen);
  }
  if (options.face) applyFace(avatar.meshes, frame.face, avatar.bones.head, frame.head ?? [], avatar.bones.neck);
}

/** A right hand, palm toward the camera and fingers up, returned in MediaPipe's frame. */
export function syntheticHand(curl: number, straight: ReadonlySet<number> = new Set()): Vec3[] {
  const points = Array.from({ length: 21 }, () => [0, 0, 0] as Vec3);
  const chains = FINGERS.map((finger, index) => ({ joints: finger.joints, x: (index - 2) * -0.02 }));
  for (const chain of chains) {
    let y = 0.02;
    let z = 0;
    let angle = 0;
    chain.joints.forEach((joint, step) => {
      if (step > 0) angle += straight.has(joint) ? 0 : curl;
      y += Math.cos(angle) * 0.02;
      z += Math.sin(angle) * 0.02;
      points[joint] = [chain.x, y, z];
    });
  }
  return points.map((point) => toAvatarSpace(point));
}
