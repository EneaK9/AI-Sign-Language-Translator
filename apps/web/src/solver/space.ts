import type { Vec3 } from "./types";

/** MediaPipe's Y points down in these clips. Flip Y and Z into the avatar's frame. */
export function toAvatarSpace(point: Vec3, _mode: "world" | "image" = "world"): Vec3 {
  return [point[0], -point[1], -point[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function angleBetween(a: Vec3, b: Vec3): number {
  const denom = length(a) * length(b);
  if (denom < 1e-8) return 0;
  return Math.acos(clamp(dot(a, b) / denom, -1, 1));
}
