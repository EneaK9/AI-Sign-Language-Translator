import { FINGERS, dot, palmOf, segment, toPalm } from "./hands";
import type { LandmarkFrame, Vec3 } from "./types";

type Shape = { normal: Vec3; fingers: Vec3[] };

const WINDOW = 3;
/** A palm that turns this far from most of its neighbours for a frame or two is a tracking flip, not motion. */
const PALM_OUTLIER = (65 * Math.PI) / 180;
const FINGER_OUTLIER = (38 * Math.PI) / 180;

function angle(a: Vec3, b: Vec3): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(a, b))));
}

function shapeOf(hand: Vec3[]): Shape {
  const palm = palmOf(hand);
  const fingers: Vec3[] = [];
  for (const finger of FINGERS) {
    for (let joint = 0; joint < 3; joint += 1) {
      fingers.push(toPalm(segment(hand, finger.joints[joint], finger.joints[joint + 1]), palm));
    }
  }
  return { normal: palm.normal, fingers };
}

function fingerDistance(a: Shape, b: Shape): number {
  let total = 0;
  for (let index = 0; index < a.fingers.length; index += 1) total += angle(a.fingers[index], b.fingers[index]);
  return total / a.fingers.length;
}

function lerpHand(a: Vec3[], b: Vec3[], weight: number): Vec3[] {
  return a.map((point, index) => [
    point[0] + (b[index][0] - point[0]) * weight,
    point[1] + (b[index][1] - point[1]) * weight,
    point[2] + (b[index][2] - point[2]) * weight,
  ]);
}

/** Indices of frames whose hand disagrees with most of its neighbours (a palm flip or a finger glitch). */
export function handOutliers(hands: (Vec3[] | null)[]): Set<number> {
  const shapes = hands.map((hand) => (hand && hand.length === 21 ? shapeOf(hand) : null));
  const outliers = new Set<number>();
  shapes.forEach((shape, index) => {
    if (!shape) return;
    const neighbours: Shape[] = [];
    for (let offset = -WINDOW; offset <= WINDOW; offset += 1) {
      const other = shapes[index + offset];
      if (offset !== 0 && other) neighbours.push(other);
    }
    if (neighbours.length < 3) return;
    const palmOff = neighbours.filter((other) => angle(shape.normal, other.normal) > PALM_OUTLIER).length;
    const fingerOff = neighbours.filter((other) => fingerDistance(shape, other) > FINGER_OUTLIER).length;
    const majority = neighbours.length * 0.66;
    if (palmOff >= majority || fingerOff >= majority) outliers.add(index);
  });
  return outliers;
}

/** Replace outlier hands by blending the nearest good frames on either side. */
function repairHands(frames: LandmarkFrame[], key: "lh" | "rh" | "lhi" | "rhi"): LandmarkFrame[] {
  const hands = frames.map((frame) => frame[key] ?? null);
  const bad = handOutliers(hands);
  if (!bad.size) return frames;
  const good = (index: number) => !!hands[index] && !bad.has(index);
  return frames.map((frame, index) => {
    if (!bad.has(index)) return frame;
    let before = index - 1;
    while (before >= 0 && !good(before)) before -= 1;
    let after = index + 1;
    while (after < frames.length && !good(after)) after += 1;
    const left = before >= 0 ? hands[before] : null;
    const right = after < frames.length ? hands[after] : null;
    let hand: Vec3[] | null = frame[key] ?? null;
    if (left && right) hand = lerpHand(left, right, (index - before) / (after - before));
    else hand = left ?? right ?? hand;
    return { ...frame, [key]: hand };
  });
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Head angles from video carry a constant bias (camera height, how ears and nose sit). Measure the signer's
 * resting head over the whole recording and keep only the movement around it.
 */
function centreHead(frames: LandmarkFrame[]): LandmarkFrame[] {
  const heads = frames.map((frame) => frame.head).filter((head) => head && head.length >= 3);
  if (!heads.length) return frames;
  const neutral = [0, 1, 2].map((axis) => median(heads.map((head) => head[axis])));
  return frames.map((frame) => ({
    ...frame,
    head: frame.head && frame.head.length >= 3 ? frame.head.map((value, axis) => value - (neutral[axis] ?? 0)) : [0, 0, 0],
  }));
}

function percentile(values: number[], fraction: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))];
}

/**
 * Face blendshapes carry a constant per-person bias: this signer reads as brows-down ~0.55, squint ~0.4 and
 * half-blink ~0.15 with a relaxed face. Take each channel's low point over the whole recording as that
 * person's neutral face, subtract it, and stretch the rest back to the full range.
 */
export function neutralFace(frames: LandmarkFrame[]): LandmarkFrame[] {
  const names = new Set<string>();
  for (const frame of frames) for (const name of Object.keys(frame.face)) names.add(name);
  const rest: Record<string, number> = {};
  for (const name of names) rest[name] = percentile(frames.map((frame) => frame.face[name] ?? 0), 0.1);
  return frames.map((frame) => {
    const face: Record<string, number> = {};
    for (const [name, value] of Object.entries(frame.face)) {
      const base = Math.min(rest[name] ?? 0, 0.9);
      face[name] = Math.max(0, value - base) / (1 - base);
    }
    return { ...frame, face };
  });
}

/** Clean landmark frames before solving: repair tracking flips, remove head and face bias. */
export function prepareFrames(frames: LandmarkFrame[]): LandmarkFrame[] {
  let repaired = frames;
  for (const key of ["lh", "rh", "lhi", "rhi"] as const) repaired = repairHands(repaired, key);
  return neutralFace(centreHead(repaired));
}
