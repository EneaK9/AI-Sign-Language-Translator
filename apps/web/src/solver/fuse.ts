import { FINGERS, metacarpalCup, norm, palmOf, refinedPalm, repairFingerDepth, segment, toPalm, type Palm } from "./hands";
import type { Vec3 } from "./types";

/** Everything the hand solver needs from one set of landmarks, all relative to that set's own palm. */
export type HandEvidence = {
  palm: Palm;
  /** Five fingers (thumb first), three palm-local segment directions each. */
  locals: Vec3[][];
  /** Metacarpal fold of the four long fingers. */
  cups: number[];
  /** Fingertip gap over knuckle gap for index–middle, middle–ring, ring–little. */
  tipGaps: number[];
};

const PALM_POINTS = [0, 5, 9, 13, 17];
const TIP_PAIRS = [
  [8, 12, 5, 9],
  [12, 16, 9, 13],
  [16, 20, 13, 17],
];

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function evidenceOf(marks: Vec3[], palmSide: 1 | -1, refine = false): HandEvidence {
  const palm = refine ? refinedPalm(marks, palmSide) : palmOf(marks);
  return {
    palm,
    locals: FINGERS.map((finger) =>
      [0, 1, 2].map((joint) => toPalm(segment(marks, finger.joints[joint], finger.joints[joint + 1]), palm)),
    ),
    cups: metacarpalCup(marks, palm, palmSide),
    tipGaps: TIP_PAIRS.map(([a, b, c, d]) => distance(marks[a], marks[b]) / Math.max(distance(marks[c], marks[d]), 1e-6)),
  };
}

/**
 * How far the world-landmark hand disagrees with what the camera actually saw. Image landmarks are exact in x
 * and y, so the world hand is projected onto the image plane (both are camera-aligned; only scale and offset
 * differ) and compared there. Returns the palm's mismatch and each finger's, in palm widths.
 */
export function worldMismatch(world: Vec3[], image: Vec3[]): { palm: number; fingers: number[] } {
  const centre = (points: Vec3[]) => {
    const sum = [0, 0];
    for (const index of PALM_POINTS) {
      sum[0] += points[index][0];
      sum[1] += points[index][1];
    }
    return [sum[0] / PALM_POINTS.length, sum[1] / PALM_POINTS.length];
  };
  const cw = centre(world);
  const ci = centre(image);
  const spread = (points: Vec3[], c: number[]) =>
    PALM_POINTS.reduce((sum, index) => sum + Math.hypot(points[index][0] - c[0], points[index][1] - c[1]), 0);
  const imageSpread = spread(image, ci);
  const scale = imageSpread / Math.max(spread(world, cw), 1e-9);
  const size = Math.max((imageSpread / PALM_POINTS.length) * 2, 1e-9);
  const error = (index: number) =>
    Math.hypot((world[index][0] - cw[0]) * scale + ci[0] - image[index][0], (world[index][1] - cw[1]) * scale + ci[1] - image[index][1]);
  const mean = (indices: readonly number[]) => indices.reduce((sum, index) => sum + error(index), 0) / indices.length / size;
  return { palm: mean(PALM_POINTS), fingers: FINGERS.map((finger) => mean(finger.joints)) };
}

function mix(a: Vec3, b: Vec3, weight: number): Vec3 {
  return norm([a[0] + (b[0] - a[0]) * weight, a[1] + (b[1] - a[1]) * weight, a[2] + (b[2] - a[2]) * weight]);
}

function mixPalm(a: Palm, b: Palm, weight: number): Palm {
  if (weight <= 0) return a;
  if (weight >= 1) return b;
  const forward = mix(a.forward, b.forward, weight);
  const rawNormal = mix(a.normal, b.normal, weight);
  const along = rawNormal[0] * forward[0] + rawNormal[1] * forward[1] + rawNormal[2] * forward[2];
  const normal = norm([rawNormal[0] - forward[0] * along, rawNormal[1] - forward[1] * along, rawNormal[2] - forward[2] * along]);
  const across = norm([
    forward[1] * normal[2] - forward[2] * normal[1],
    forward[2] * normal[0] - forward[0] * normal[2],
    forward[0] * normal[1] - forward[1] * normal[0],
  ]);
  return { across, forward, normal };
}

/**
 * Combine MediaPipe's two hand outputs. World landmarks give steadier depth and are kept wherever they agree
 * with the image; where they contradict what the camera saw (a finger the world model curls but the image
 * shows straight, or a palm turned the wrong way), the image landmarks take over, with their depth sign
 * repaired so no joint bends backward. Each finger is judged on its own and on how wrong the hand is overall.
 */
export function fuseEvidence(world: Vec3[], image: Vec3[], palmSide: 1 | -1, refine = false): HandEvidence & { imageShare: number[] } {
  const repaired = repairFingerDepth(image, palmSide);
  const fromWorld = evidenceOf(world, palmSide, refine);
  const fromImage = evidenceOf(repaired, palmSide, false);
  const mismatch = worldMismatch(world, image);
  const overall = mismatch.fingers.reduce((sum, value) => sum + value, 0) / mismatch.fingers.length;
  const imageShare = mismatch.fingers.map((value) => smoothstep(0.28, 0.4, (value + overall) / 2));
  const palmShare = smoothstep(0.15, 0.3, mismatch.palm);
  return {
    palm: mixPalm(fromWorld.palm, fromImage.palm, palmShare),
    locals: fromWorld.locals.map((chain, finger) => chain.map((direction, joint) => mix(direction, fromImage.locals[finger][joint], imageShare[finger]))),
    cups: fromWorld.cups.map((cup, index) => cup + (fromImage.cups[index] - cup) * imageShare[index + 1]),
    tipGaps: fromWorld.tipGaps.map((gap, index) => {
      const share = (imageShare[index + 1] + imageShare[index + 2]) / 2;
      return gap + (fromImage.tipGaps[index] - gap) * share;
    }),
    imageShare,
  };
}
