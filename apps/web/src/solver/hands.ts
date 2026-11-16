import type { Vec3 } from "./types";
import { sub } from "./space";

export const FINGERS = [
  { name: "Thumb", joints: [1, 2, 3, 4] },
  { name: "Index", joints: [5, 6, 7, 8] },
  { name: "Middle", joints: [9, 10, 11, 12] },
  { name: "Ring", joints: [13, 14, 15, 16] },
  { name: "Pinky", joints: [17, 18, 19, 20] },
] as const;

export type Palm = { across: Vec3; forward: Vec3; normal: Vec3 };

export function norm(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]) || 1;
  return [value[0] / length, value[1] / length, value[2] / length];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Palm axes from wrist, index knuckle, middle knuckle and pinky knuckle.
 * For a right hand `normal` points out of the palm; for a left hand, out of the back.
 */
export function palmFrom(wrist: Vec3, index: Vec3, middle: Vec3, pinky: Vec3): Palm {
  const across = norm(sub(index, pinky));
  const rawForward = norm(sub(middle, wrist));
  const projected = dot(rawForward, across);
  const forward = norm([
    rawForward[0] - across[0] * projected,
    rawForward[1] - across[1] * projected,
    rawForward[2] - across[2] * projected,
  ]);
  return { across, forward, normal: norm(cross(across, forward)) };
}

export function palmOf(landmarks: Vec3[]): Palm {
  return palmFrom(landmarks[0], landmarks[5], landmarks[9], landmarks[17]);
}

export function segment(landmarks: Vec3[], from: number, to: number): Vec3 {
  return norm(sub(landmarks[to], landmarks[from]));
}

export function toPalm(direction: Vec3, palm: Palm): Vec3 {
  return [dot(direction, palm.across), dot(direction, palm.forward), dot(direction, palm.normal)];
}

export function fromPalm(local: Vec3, palm: Palm): Vec3 {
  return norm([
    palm.across[0] * local[0] + palm.forward[0] * local[1] + palm.normal[0] * local[2],
    palm.across[1] * local[0] + palm.forward[1] * local[1] + palm.normal[1] * local[2],
    palm.across[2] * local[0] + palm.forward[2] * local[1] + palm.normal[2] * local[2],
  ]);
}

/** Angle between two segments of one finger. 0 is straight. */
export function jointCurl(landmarks: Vec3[], a: number, b: number, c: number): number {
  const first = segment(landmarks, a, b);
  const second = segment(landmarks, b, c);
  return Math.acos(Math.min(1, Math.max(-1, dot(first, second))));
}

export function fingerBoneName(side: "Left" | "Right", finger: string, joint: number): string {
  return `${side}Hand${finger}${joint + 1}`;
}
