export const BODY_BONES = {
  hips: "Hips",
  spine: "Spine",
  chest: "Spine1",
  upperChest: "Spine2",
  neck: "Neck",
  head: "Head",
  leftShoulder: "LeftShoulder",
  leftUpperArm: "LeftArm",
  leftForeArm: "LeftForeArm",
  leftHand: "LeftHand",
  rightShoulder: "RightShoulder",
  rightUpperArm: "RightArm",
  rightForeArm: "RightForeArm",
  rightHand: "RightHand",
} as const;

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Pinky"] as const;

export function allBoneNames(): Record<string, string> {
  const names: Record<string, string> = { ...BODY_BONES };
  for (const side of ["Left", "Right"] as const) {
    for (const finger of FINGERS) {
      for (const joint of [1, 2, 3]) names[`${side}Hand${finger}${joint}`] = `${side}Hand${finger}${joint}`;
    }
  }
  return names;
}
