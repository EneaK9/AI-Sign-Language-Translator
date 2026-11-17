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

/**
 * Palm frame corrected by where the fingers curl. Fingers can only flex toward the palm, and the camera sees
 * their curl clearly, while the knuckle line that defines `across` is often edge-on (a fist seen from the side)
 * where tracking depth is poor. The more the fingers curl, the more their curl direction sets the palm normal.
 * `palmSide` is +1 when the palm faces +normal (right hand), -1 for a left hand.
 */
export function refinedPalm(landmarks: Vec3[], palmSide: 1 | -1): Palm {
  const palm = palmOf(landmarks);
  const sum: Vec3 = [0, 0, 0];
  let weight = 0;
  for (const finger of FINGERS.slice(1)) {
    const [mcp, pip, dip, tip] = finger.joints;
    const local = [segment(landmarks, mcp, pip), segment(landmarks, pip, dip), segment(landmarks, dip, tip)];
    const curl = 1 - straightness(local);
    if (curl < 0.05) continue;
    const reach: Vec3 = [
      (landmarks[dip][0] + landmarks[tip][0]) / 2 - landmarks[mcp][0],
      (landmarks[dip][1] + landmarks[tip][1]) / 2 - landmarks[mcp][1],
      (landmarks[dip][2] + landmarks[tip][2]) / 2 - landmarks[mcp][2],
    ];
    const along = dot(reach, palm.forward);
    const side = norm([reach[0] - palm.forward[0] * along, reach[1] - palm.forward[1] * along, reach[2] - palm.forward[2] * along]);
    for (let k = 0; k < 3; k += 1) sum[k] += side[k] * curl;
    weight += curl;
  }
  if (weight < 0.4) return palm;
  const curled = norm([sum[0] * palmSide, sum[1] * palmSide, sum[2] * palmSide]);
  // Signed angle from the tracked normal to the curl-implied normal, around the forward axis.
  const angle = Math.atan2(dot(cross(palm.normal, curled), palm.forward), dot(palm.normal, curled));
  // Fingers also converge toward the thumb by ~15–20°, so only correct the part beyond that.
  const excess = Math.sign(angle) * Math.max(0, Math.abs(angle) - 0.3);
  const amount = excess * smoothstep(0.4, 2.2, weight);
  if (Math.abs(amount) < 1e-3) return palm;
  const normal = rotateAbout(palm.normal, palm.forward, amount);
  return { across: norm(cross(palm.forward, normal)), forward: palm.forward, normal };
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

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

const clampTo = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Rotate `direction` (perpendicular to unit `axis`) about `axis` by `angle`. */
function rotateAbout(direction: Vec3, axis: Vec3, angle: number): Vec3 {
  const side = cross(axis, direction);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return norm([direction[0] * c + side[0] * s, direction[1] * c + side[1] * s, direction[2] * c + side[2] * s]);
}

/** Joint limits in radians. Positive flexion curls toward the palm. */
export const FINGER_LIMITS = {
  /** Little and ring fingers fold past 90° at the knuckle in a fist. */
  mcpFlex: [-0.35, 1.75],
  /** Measured from the palm's middle axis, so it includes each finger's natural fan (a wide V needs ~40°). */
  mcpSpread: 0.75,
  pipFlex: [-0.1, 1.95],
  dipFlex: [-0.15, 1.5],
  /** Flexed fingers converge toward the thumb base, so their hinges are oblique; allow that, not sideways bends. */
  tilt: 0.3,
} as const;

/**
 * MediaPipe compresses strong bends toward neutral when a finger folds in depth, so a fist reads as a claw.
 * Clearly bent joints are deepened a little (up to +22% past ~60°); gentle curves like C are left alone.
 */
export function deepenBend(angle: number): number {
  if (angle <= 0) return angle;
  return angle * (1 + 0.22 * smoothstep(0.55, 1.15, angle));
}

/** Rough share of finger length per segment (proximal, middle, distal). */
const SEGMENT_SHARE = [0.45, 0.3, 0.25];

/** How straight a finger is, 1 = straight, 0 = curled; from its three palm-local segment directions. */
export function straightness(local: Vec3[]): number {
  const a = norm(local[0]);
  const b = norm(local[1]);
  const c = norm(local[2]);
  // Mean joint cosine: ~0.95 for a straight finger, ~0.55 once the middle joint bends 80°.
  return smoothstep(0.6, 0.92, (dot(a, b) + dot(b, c)) / 2);
}

/**
 * Knuckle spread of one finger, in radians from the palm's middle axis. An extended finger's overall direction
 * is far steadier than its first segment alone (tracking makes fingers laterally wavy), so blend toward it.
 */
export function fingerSpread(local: Vec3[]): number {
  const base = norm(local[0]);
  const whole: Vec3 = [0, 0, 0];
  local.forEach((segment, index) => {
    const unit = norm(segment);
    for (let k = 0; k < 3; k += 1) whole[k] += unit[k] * SEGMENT_SHARE[index];
  });
  const fromBase = Math.atan2(base[0], Math.max(base[1], 1e-4));
  const fromWhole = Math.atan2(whole[0], Math.max(whole[1], 1e-4));
  const weight = straightness(local);
  return fromBase + (fromWhole - fromBase) * weight;
}

/**
 * How strongly each neighbouring pair of long fingers (index–middle, middle–ring, ring–little) is held together,
 * 0–1. Fingers count as together when both are extended and the tracker shows them parallel: similar spread, or
 * fingertips about as far apart as the knuckles. This is what separates U from V and keeps B tidy.
 */
export function togetherness(spreads: number[], straight: number[], tipGaps: number[], lifts: number[]): number[] {
  return spreads.slice(0, -1).map((spread, index) => {
    const both = Math.min(straight[index], straight[index + 1]);
    const byAngle = 1 - smoothstep(0.16, 0.28, Math.abs(spread - spreads[index + 1]));
    const byTips = 1 - smoothstep(1.25, 1.6, tipGaps[index]);
    // Side by side also means bent by a similar amount at the knuckle (X's half-bent middle is not with the index).
    const byFlex = 1 - smoothstep(0.3, 0.5, Math.abs(lifts[index] - lifts[index + 1]));
    return both * byFlex * Math.max(byAngle, byTips);
  });
}

/** How far a whole finger rises out of the palm plane toward the palm, in radians. */
export function fingerLift(local: Vec3[], palmSide: 1 | -1): number {
  const whole: Vec3 = [0, 0, 0];
  local.forEach((segment, index) => {
    const unit = norm(segment);
    for (let k = 0; k < 3; k += 1) whole[k] += unit[k] * SEGMENT_SHARE[index];
  });
  return Math.atan2(whole[2] * palmSide, Math.hypot(whole[0], whole[1]));
}

/** Pull neighbouring spreads to a shared value where fingers are held together, keeping a hair of natural fan. */
export function holdTogether(spreads: number[], weights: number[]): number[] {
  const out = [...spreads];
  weights.forEach((weight, index) => {
    if (weight <= 0) return;
    const middle = (out[index] + out[index + 1]) / 2;
    const fan = 0.012;
    out[index] += (middle + fan - out[index]) * weight;
    out[index + 1] += (middle - fan - out[index + 1]) * weight;
  });
  return out;
}

/**
 * Give fingers held together the same bend, so they lie side by side instead of one curling past the other.
 * Each finger moves toward the weighted mean of itself and its held neighbours, all from the original values,
 * so a chain of neighbours cannot drag one another apart.
 */
export function alignChains(chains: Vec3[][], weights: number[]): Vec3[][] {
  return chains.map((chain, index) => {
    const left = index > 0 ? weights[index - 1] : 0;
    const right = index < weights.length ? weights[index] : 0;
    if (left <= 0 && right <= 0) return chain;
    return chain.map((direction, joint) => {
      let z = direction[2];
      if (left > 0) z += chains[index - 1][joint][2] * left;
      if (right > 0) z += chains[index + 1][joint][2] * right;
      z /= 1 + Math.max(0, left) + Math.max(0, right);
      // Share the flexion (palm-normal part) but leave each finger its own spread.
      const planar = Math.hypot(direction[0], direction[1]) || 1e-6;
      const scale = Math.sqrt(Math.max(0, 1 - z * z)) / planar;
      return norm([direction[0] * scale, direction[1] * scale, z]);
    });
  });
}

/**
 * Turn three palm-local segment directions of one long finger into an anatomically possible chain.
 * The knuckle (MCP) can flex and spread; the two upper joints mostly hinge toward the palm, with a little
 * oblique tilt and no backward bending beyond a few degrees. The size of each bend is kept even when its
 * plane is oblique, so a fist stays a fist.
 * `palmSide` is +1 when the palm faces +normal (right hand), -1 when it faces -normal (left hand).
 */
export function constrainFinger(local: Vec3[], palmSide: 1 | -1, spreadOverride?: number, cup = 0, deepen = true): Vec3[] {
  const bendMore = deepen ? deepenBend : (angle: number) => angle;
  const curlDir: Vec3 = [0, 0, palmSide];
  const base = norm(local[0]);
  const inPlane = Math.hypot(base[0], base[1]);
  // Spread is meaningless once the knuckle is folded 90°, so fade it out instead of letting noise twist the hinge.
  const rawSpread = spreadOverride ?? Math.atan2(base[0], Math.max(base[1], 1e-4));
  const spread = clampTo(rawSpread, -FINGER_LIMITS.mcpSpread, FINGER_LIMITS.mcpSpread) * smoothstep(0.2, 0.55, inPlane);
  // `cup` is how far this finger's metacarpal folds toward the palm (the palm arches in a fist). The avatar has
  // a flat palm, so that fold is added at the knuckle to land the fingertip in the same place.
  const flex = clampTo(bendMore(Math.atan2(base[2] * palmSide, inPlane) + cup), FINGER_LIMITS.mcpFlex[0], FINGER_LIMITS.mcpFlex[1]);
  const planar: Vec3 = [Math.sin(spread), Math.cos(spread), 0];
  const palmHinge = norm(cross(planar, curlDir));
  const out: Vec3[] = [rotateAbout(planar, palmHinge, flex)];
  // A curled finger bends in its own plane, which tilts as fingers converge in a fist. Follow that plane when the
  // tracker shows a clear bend that is not far from the anatomical hinge; otherwise use the palm's hinge.
  let hinge = palmHinge;
  const bendAxis = cross(norm(local[0]), norm(local[1]));
  const bendSize = Math.hypot(...bendAxis);
  if (bendSize > 0.26) {
    let axis = norm(bendAxis);
    if (dot(axis, palmHinge) < 0) axis = [-axis[0], -axis[1], -axis[2]];
    const agree = dot(axis, palmHinge);
    if (agree > Math.cos(0.95)) {
      const along = dot(axis, out[0]);
      const ortho = norm([axis[0] - out[0][0] * along, axis[1] - out[0][1] * along, axis[2] - out[0][2] * along]);
      const weight = smoothstep(0.26, 0.5, bendSize) * smoothstep(Math.cos(0.95), Math.cos(0.6), agree);
      hinge = norm([
        palmHinge[0] + (ortho[0] - palmHinge[0]) * weight,
        palmHinge[1] + (ortho[1] - palmHinge[1]) * weight,
        palmHinge[2] + (ortho[2] - palmHinge[2]) * weight,
      ]);
      const fix = dot(hinge, out[0]);
      hinge = norm([hinge[0] - out[0][0] * fix, hinge[1] - out[0][1] * fix, hinge[2] - out[0][2] * fix]);
    }
  }
  // Bend is tracked within the hinge plane; `flat` is the chain projected onto it.
  let flat = out[0];
  let previous = norm(local[0]);
  for (let joint = 1; joint < 3; joint += 1) {
    const target = norm(local[joint]);
    const along = dot(target, hinge);
    const onPlane: Vec3 = [target[0] - hinge[0] * along, target[1] - hinge[1] * along, target[2] - hinge[2] * along];
    const lateral = Math.asin(clampTo(along, -1, 1));
    const tilt = clampTo(lateral, -FINGER_LIMITS.tilt, FINGER_LIMITS.tilt);
    // Signed direction of the bend from the in-plane component; its size from the full tracked joint angle.
    let sign = 1;
    if (Math.hypot(...onPlane) > 1e-4) {
      sign = Math.sign(Math.atan2(dot(cross(flat, onPlane), hinge), dot(flat, onPlane))) || 1;
    }
    const full = Math.acos(clampTo(dot(previous, target), -1, 1));
    const bend = sign * bendMore(Math.acos(clampTo(Math.cos(full) / Math.cos(tilt), -1, 1)));
    const [min, max] = joint === 1 ? FINGER_LIMITS.pipFlex : FINGER_LIMITS.dipFlex;
    flat = rotateAbout(flat, hinge, clampTo(bend, min, max));
    out.push(norm([
      flat[0] * Math.cos(tilt) + hinge[0] * Math.sin(tilt),
      flat[1] * Math.cos(tilt) + hinge[1] * Math.sin(tilt),
      flat[2] * Math.cos(tilt) + hinge[2] * Math.sin(tilt),
    ]));
    previous = target;
  }
  return out;
}

/**
 * Resolve the depth ambiguity of a monocular hand. A finger segment seen in 2D could lean toward or away from the
 * camera; the tracker's guess at that depth is its weakest output and sometimes puts a curl on the wrong side.
 * Fingers cannot bend backward, so where a segment would, mirror its depth (camera z) and keep the 2D shape.
 * Works in a camera-aligned frame where z is depth. Points are returned in the same frame.
 */
export function repairFingerDepth(landmarks: Vec3[], palmSide: 1 | -1): Vec3[] {
  const out = landmarks.map((point) => [...point] as Vec3);
  const palm = palmOf(landmarks);
  const curlDir: Vec3 = [0, 0, palmSide];
  const backward = Math.sin(0.26);
  for (const finger of FINGERS.slice(1)) {
    let parent: Vec3 | null = null;
    let hinge: Vec3 = [1, 0, 0];
    for (let joint = 0; joint < 3; joint += 1) {
      const from = finger.joints[joint];
      const to = finger.joints[joint + 1];
      const offset: Vec3 = [
        landmarks[to][0] - landmarks[from][0],
        landmarks[to][1] - landmarks[from][1],
        landmarks[to][2] - landmarks[from][2],
      ];
      const mirrored: Vec3 = [offset[0], offset[1], -offset[2]];
      const score = (candidate: Vec3): number => {
        const local = toPalm(norm(candidate), palm);
        if (!parent) return local[2] * palmSide; // knuckle: how far it folds toward the palm
        return dot(local, norm(cross(hinge, parent)));
      };
      let chosen = offset;
      const original = score(offset);
      const limit = parent ? -backward : Math.sin(-0.35);
      if (original < limit && score(mirrored) > original) chosen = mirrored;
      const local = toPalm(norm(chosen), palm);
      if (!parent) {
        const planar = norm([local[0], local[1], 0]);
        hinge = norm(cross(Math.hypot(local[0], local[1]) > 0.2 ? planar : [0, 1, 0], curlDir));
      }
      parent = local;
      out[to] = [out[from][0] + chosen[0], out[from][1] + chosen[1], out[from][2] + chosen[2]];
    }
  }
  return out;
}

/** How far each long finger's metacarpal (wrist to knuckle) folds toward the palm, in radians, never negative. */
export function metacarpalCup(landmarks: Vec3[], palm: Palm, palmSide: 1 | -1): number[] {
  return [5, 9, 13, 17].map((knuckle) => {
    const direction = toPalm(segment(landmarks, 0, knuckle), palm);
    return Math.max(0, Math.atan2(direction[2] * palmSide, Math.hypot(direction[0], direction[1])));
  });
}

/** Relaxed finger chain: the avatar's own rest directions with a gentle cumulative curl toward the palm. */
export function curlFinger(rest: Vec3[], palmSide: 1 | -1, curls: readonly number[]): Vec3[] {
  const curlDir: Vec3 = [0, 0, palmSide];
  const out: Vec3[] = [];
  let total = 0;
  for (let joint = 0; joint < rest.length; joint += 1) {
    total += curls[joint] ?? 0;
    const direction = norm(rest[joint]);
    let hinge = cross(direction, curlDir);
    if (Math.hypot(...hinge) < 1e-4) hinge = [1, 0, 0];
    out.push(rotateAbout(direction, norm(hinge), total));
  }
  return out;
}
