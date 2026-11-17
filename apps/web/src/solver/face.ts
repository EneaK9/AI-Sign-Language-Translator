import { Euler, Quaternion, type Bone, type Mesh } from "three";
import { clamp } from "./space";

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Gain per blendshape family, from MediaPipe's scale to this avatar's morphs. MediaPipe under-reads the jaw and
 * lip movement of mouthing, over-reads lip pucker, and this avatar's pucker morph is strong, so rounded vowels
 * are carried more by funnel. Brows and squint are softened: they read as tension on a calm signer.
 */
const FACE_GAIN: [RegExp, number][] = [
  [/^jawOpen$/, 1.6],
  [/^mouthPucker$/, 0.8],
  [/^mouthFunnel$/, 0.6],
  [/^mouth(UpperUp|LowerDown)(Left|Right)$/, 1.5],
  [/^mouthStretch(Left|Right)$/, 1.2],
  [/^mouth(Press)(Left|Right)$/, 0.7],
  [/^mouthRoll(Upper|Lower)$/, 0.7],
  [/^mouthShrug(Upper|Lower)$/, 0.8],
  [/^browDown(Left|Right)$/, 0.6],
  [/^(eyeSquint|cheekSquint)(Left|Right)$/, 0.6],
];

/** How far the upper eyelids rest over the iris on a relaxed face (blink weight). */
export const RESTING_LID = 0.14;

/** Map MediaPipe face blendshapes (with the signer's neutral already removed) onto the avatar's morphs. */
export function retargetFace(weights: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(weights)) {
    const gain = FACE_GAIN.find(([pattern]) => pattern.test(name))?.[1] ?? 1;
    out[name] = clamp(value * gain, 0, 1);
  }
  // Blinks: MediaPipe reports a lazy ramp; real lids snap shut and open. A relaxed upper lid also rests over the
  // top of the iris, which this avatar's open-eye pose does not, so the eyes never quite stare.
  for (const side of ["Left", "Right"]) {
    const key = `eyeBlink${side}`;
    out[key] = Math.max(RESTING_LID, smoothstep(0.22, 0.6, out[key] ?? 0));
  }
  if (out.jawOpen !== undefined) out.jawOpen = Math.min(out.jawOpen, 0.75);
  // Rounded lips (o, u, y): this avatar's pucker parts the lips over its static upper teeth. Rolling the upper
  // lip in and closing the gap slightly gives the small dark rounded opening a real "o" has.
  const round = out.mouthPucker ?? 0;
  if (round > 0) {
    // A rounded vowel keeps the jaw fairly closed; the lips do the work.
    if (out.jawOpen !== undefined) out.jawOpen *= 1 - 0.45 * round;
    out.mouthRollUpper = clamp((out.mouthRollUpper ?? 0) + 0.55 * round, 0, 1);
    out.mouthClose = Math.max(out.mouthClose ?? 0, Math.min(0.08, (out.jawOpen ?? 0) * 0.6) * round);
  }
  // mouthClose presses the lips together against an open jaw; without the jaw it pushes them through each other.
  if (out.mouthClose !== undefined) out.mouthClose = Math.min(out.mouthClose, (out.jawOpen ?? 0) * 0.9);
  return out;
}

/** Share of head rotation carried by the neck. People turn from both joints, not from the skull alone. */
const NECK_SHARE = 0.4;

function turn(bone: Bone, pitch: number, yaw: number, roll: number): void {
  const rest = bone.userData.restQuat as Quaternion | undefined;
  if (!rest) return;
  bone.quaternion.copy(rest).multiply(new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, "XYZ")));
}

export function applyFace(
  meshes: Mesh[],
  weights: Record<string, number>,
  head: Bone | undefined,
  rotation: number[],
  neck?: Bone,
): void {
  const mapped = retargetFace(weights);
  for (const mesh of meshes) {
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences) continue;
    for (const [name, index] of Object.entries(dictionary)) {
      const value = mapped[name];
      if (value !== undefined) influences[index] = value;
    }
  }
  if (!head) return;
  const pitch = clamp(rotation[0] ?? 0, -0.45, 0.45);
  const yaw = clamp(rotation[1] ?? 0, -0.6, 0.6);
  const roll = clamp(rotation[2] ?? 0, -0.4, 0.4);
  const share = neck?.userData.restQuat ? NECK_SHARE : 0;
  if (neck && share) turn(neck, pitch * share, yaw * share, roll * share);
  turn(head, pitch * (1 - share), yaw * (1 - share), roll * (1 - share));
}

export function addMorph(meshes: Mesh[], name: string, extra: number): void {
  for (const mesh of meshes) {
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences || dictionary[name] === undefined) continue;
    const index = dictionary[name];
    influences[index] = Math.min(1, influences[index] + extra);
  }
}
