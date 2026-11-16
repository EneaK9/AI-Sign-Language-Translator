import { Quaternion, Vector3 } from "three";
import type { AvatarHandle } from "../avatar/types";
import { aimBone } from "./aim";
import { solveArms } from "./arms";
import { avatarPalm, palmQuaternion } from "./calibrate";
import { applyFace } from "./face";
import { FINGERS, fingerBoneName, fromPalm, norm, palmOf, segment, toPalm } from "./hands";
import { toAvatarSpace } from "./space";
import type { LandmarkFrame, SolveOptions, Vec3 } from "./types";

function convert(landmarks: Vec3[]): Vec3[] {
  return landmarks.map((point) => toAvatarSpace(point));
}

function solveWrist(side: "Left" | "Right", landmarks: Vec3[], avatar: AvatarHandle): void {
  const key = side === "Left" ? "left" : "right";
  const hand = avatar.bones[side === "Left" ? "leftHand" : "rightHand"];
  const restBasis = avatar.hands.basis[key];
  const restWorld = avatar.hands.handWorld[key];
  const parent = hand?.parent;
  if (!hand || !restBasis || !restWorld || !parent) return;
  parent.updateWorldMatrix(true, false);
  const parentNow = parent.getWorldQuaternion(new Quaternion());
  const world = palmQuaternion(palmOf(landmarks)).multiply(restBasis.clone().invert()).multiply(restWorld);
  hand.quaternion.copy(parentNow.invert().multiply(world));
  hand.updateWorldMatrix(false, true);
}

/** Copy each tracked finger segment, measured against the tracked palm, onto the avatar's palm. */
function solveHand(side: "Left" | "Right", landmarks: Vec3[], avatar: AvatarHandle): void {
  const tracked = palmOf(landmarks);
  solveWrist(side, landmarks, avatar);
  const palm = avatarPalm(avatar.bones, side);
  if (!palm) return;
  const palmSide = side === "Right" ? 1 : -1;
  for (const finger of FINGERS) {
    for (let joint = 0; joint < 3; joint += 1) {
      const bone = avatar.bones[fingerBoneName(side, finger.name, joint)];
      if (!bone) continue;
      const local = toPalm(segment(landmarks, finger.joints[joint], finger.joints[joint + 1]), tracked);
      if (finger.name !== "Thumb" && joint === 0) {
        local[2] = palmSide > 0 ? Math.max(local[2], -0.25) : Math.min(local[2], 0.25);
      }
      aimBone(bone, new Vector3(...fromPalm(norm(local), palm)), avatar.rest);
      bone.updateWorldMatrix(false, true);
    }
  }
}

export function solveFrame(avatar: AvatarHandle, frame: LandmarkFrame, options: SolveOptions): void {
  avatar.resetPose();
  if (options.arms) solveArms(frame.pose, avatar, avatar.rest);
  avatar.root.updateWorldMatrix(true, true);
  if (options.hands) {
    if (frame.lh && options.dominant !== "right") solveHand("Left", convert(frame.lh), avatar);
    if (frame.rh && options.dominant !== "left") solveHand("Right", convert(frame.rh), avatar);
  }
  if (options.face) applyFace(avatar.meshes, frame.face, avatar.bones.head, frame.head ?? []);
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
