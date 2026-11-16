import { Vector3 } from "three";
import type { AvatarHandle } from "../avatar/types";
import { aimBone, type RestPose } from "./aim";
import { toAvatarSpace } from "./space";
import type { Vec3 } from "./types";

const SIDES = {
  left: { shoulder: 11, elbow: 13, wrist: 15, upper: "leftUpperArm", fore: "leftForeArm" },
  right: { shoulder: 12, elbow: 14, wrist: 16, upper: "rightUpperArm", fore: "rightForeArm" },
} as const;

function vec(point: Vec3): Vector3 {
  const converted = toAvatarSpace(point);
  return new Vector3(converted[0], converted[1], converted[2]);
}

export function solveArms(pose: Vec3[] | null, avatar: AvatarHandle, rest: RestPose): void {
  if (!pose || pose.length < 17) return;
  for (const side of Object.values(SIDES)) {
    const upper = avatar.bones[side.upper];
    const fore = avatar.bones[side.fore];
    if (!upper || !fore) continue;
    const shoulder = vec(pose[side.shoulder]);
    const elbow = vec(pose[side.elbow]);
    const wrist = vec(pose[side.wrist]);
    aimBone(upper, elbow.clone().sub(shoulder), rest);
    aimBone(fore, wrist.clone().sub(elbow), rest);
  }
}
