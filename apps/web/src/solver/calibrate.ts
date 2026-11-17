import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from "three";
import type { HandRig } from "../avatar/types";
import { FINGERS, fingerBoneName, palmFrom, toPalm, type Palm } from "./hands";
import type { RestPose } from "./aim";
import type { Vec3 } from "./types";

export const HAND_SIDES = [
  { key: "right", prefix: "Right", hand: "rightHand" },
  { key: "left", prefix: "Left", hand: "leftHand" },
] as const;

function position(bone: Bone): Vec3 {
  const point = bone.getWorldPosition(new Vector3());
  return [point.x, point.y, point.z];
}

export function avatarPalm(bones: Record<string, Bone>, prefix: "Left" | "Right"): Palm | null {
  const hand = bones[prefix === "Left" ? "leftHand" : "rightHand"];
  const index = bones[`${prefix}HandIndex1`];
  const middle = bones[`${prefix}HandMiddle1`];
  const pinky = bones[`${prefix}HandPinky1`];
  if (!hand || !index || !middle || !pinky) return null;
  return palmFrom(position(hand), position(index), position(middle), position(pinky));
}

export function palmQuaternion(palm: Palm): Quaternion {
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(new Vector3(...palm.across), new Vector3(...palm.forward), new Vector3(...palm.normal)),
  );
}

/** Rest palm orientation of each avatar hand, used to turn the wrist toward a tracked palm. */
export function calibrateHands(root: Object3D, bones: Record<string, Bone>, rest: RestPose): HandRig {
  root.updateWorldMatrix(true, true);
  const rig: HandRig = { basis: {}, handWorld: {}, fingers: {} };
  for (const side of HAND_SIDES) {
    const palm = avatarPalm(bones, side.prefix);
    const hand = bones[side.hand];
    if (!palm || !hand) continue;
    rig.basis[side.key] = palmQuaternion(palm);
    rig.handWorld[side.key] = hand.getWorldQuaternion(new Quaternion());
    const fingers: Record<string, Vec3[]> = {};
    for (const finger of FINGERS) {
      const chain: Vec3[] = [];
      for (let joint = 0; joint < 3; joint += 1) {
        const bone = bones[fingerBoneName(side.prefix, finger.name, joint)];
        const direction = bone ? rest.dir.get(bone.uuid) : undefined;
        chain.push(direction ? toPalm([direction.x, direction.y, direction.z], palm) : [0, 1, 0]);
      }
      fingers[finger.name] = chain;
    }
    rig.fingers[side.key] = fingers;
  }
  return rig;
}
