import { Quaternion, Vector3, type Bone } from "three";
import type { AvatarHandle } from "../avatar/types";
import { channelsOf, type SignMotion } from "./motion";

const SIDES = {
  right: { upper: "rightUpperArm", fore: "rightForeArm", hand: "rightHand" },
  left: { upper: "leftUpperArm", fore: "leftForeArm", hand: "leftHand" },
} as const;

/** How much of each letter's own placement survives anchoring (its own movement is always kept). */
const KEEP_PLACEMENT = 0.2;

type ArmSample = { shoulder: Vector3; elbow: Vector3; wrist: Vector3; upperWorld: Quaternion; foreWorld: Quaternion; handWorld: Quaternion };

function applyFrame(bones: Bone[], motion: SignMotion, frame: number): void {
  const offset = frame * bones.length * 4;
  bones.forEach((bone, slot) => bone.quaternion.fromArray(motion.quats, offset + slot * 4));
}

/**
 * Fingerspelled letters come from separate recordings, each with the arm in a slightly different place, so a
 * word would wander. A signer keeps the hand in one spot: shift every letter's wrist path toward a shared
 * anchor, re-solve the arm with two-bone IK (keeping the elbow's side and the forearm's roll), and keep the
 * palm's world orientation exactly as recorded, since it is part of the letter.
 */
export function anchorSequence(handle: AvatarHandle, motions: SignMotion[], side: "left" | "right" = "right"): SignMotion[] {
  if (motions.length < 2) return motions;
  const { bones } = channelsOf(handle);
  const names = SIDES[side];
  const upper = handle.bones[names.upper];
  const fore = handle.bones[names.fore];
  const hand = handle.bones[names.hand];
  const parent = upper?.parent;
  if (!upper || !fore || !hand || !parent) return motions;
  const slot = (bone: Bone) => bones.indexOf(bone);
  const [upperSlot, foreSlot, handSlot] = [slot(upper), slot(fore), slot(hand)];
  if (upperSlot < 0 || foreSlot < 0 || handSlot < 0) return motions;

  const samples: ArmSample[][] = motions.map((motion) => {
    const out: ArmSample[] = [];
    for (let frame = 0; frame < motion.frames; frame += 1) {
      applyFrame(bones, motion, frame);
      handle.root.updateWorldMatrix(true, true);
      out.push({
        shoulder: upper.getWorldPosition(new Vector3()),
        elbow: fore.getWorldPosition(new Vector3()),
        wrist: hand.getWorldPosition(new Vector3()),
        upperWorld: upper.getWorldQuaternion(new Quaternion()),
        foreWorld: fore.getWorldQuaternion(new Quaternion()),
        handWorld: hand.getWorldQuaternion(new Quaternion()),
      });
    }
    return out;
  });
  const placement = samples.map((frames) => {
    const mean = new Vector3();
    for (const sample of frames) mean.add(sample.wrist.clone().sub(sample.shoulder));
    return mean.divideScalar(Math.max(frames.length, 1));
  });
  const anchor = placement.reduce((sum, value) => sum.add(value), new Vector3()).divideScalar(placement.length);

  const result = motions.map((motion, index) => {
    const shift = anchor.clone().sub(placement[index]).multiplyScalar(1 - KEEP_PLACEMENT);
    const quats = motion.quats.slice();
    samples[index].forEach((sample, frame) => {
      const upperLength = sample.elbow.distanceTo(sample.shoulder);
      const foreLength = sample.wrist.distanceTo(sample.elbow);
      const target = sample.wrist.clone().add(shift);
      const toTarget = target.clone().sub(sample.shoulder);
      const reach = Math.min(Math.max(toTarget.length(), Math.abs(upperLength - foreLength) + 1e-3), upperLength + foreLength - 1e-3);
      const axis = toTarget.normalize();
      // Keep the elbow on the same side of the shoulder–wrist line as recorded.
      const pole = sample.elbow.clone().sub(sample.shoulder);
      pole.addScaledVector(axis, -pole.dot(axis));
      if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0).addScaledVector(axis, axis.y);
      pole.normalize();
      const along = (upperLength * upperLength - foreLength * foreLength + reach * reach) / (2 * reach);
      const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
      const elbow = sample.shoulder.clone().addScaledVector(axis, along).addScaledVector(pole, height);
      const wrist = sample.shoulder.clone().addScaledVector(axis, reach);
      // Swing each segment by the smallest rotation from its old direction to its new one, which keeps its roll.
      const swing = (from: Vector3, to: Vector3) => new Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
      const upperWorld = swing(sample.elbow.clone().sub(sample.shoulder), elbow.clone().sub(sample.shoulder)).multiply(sample.upperWorld);
      const foreWorld = swing(sample.wrist.clone().sub(sample.elbow), wrist.clone().sub(elbow)).multiply(sample.foreWorld);
      // Parent of the upper arm is unchanged by this edit, so its world rotation comes from the recorded pose.
      applyFrame(bones, motion, frame);
      parent.updateWorldMatrix(true, false);
      const parentWorld = parent.getWorldQuaternion(new Quaternion());
      const offset = frame * bones.length * 4;
      parentWorld.invert().multiply(upperWorld).toArray(quats, offset + upperSlot * 4);
      upperWorld.clone().invert().multiply(foreWorld).toArray(quats, offset + foreSlot * 4);
      foreWorld.clone().invert().multiply(sample.handWorld).toArray(quats, offset + handSlot * 4);
    });
    return { ...motion, quats };
  });
  handle.resetPose();
  return result;
}
