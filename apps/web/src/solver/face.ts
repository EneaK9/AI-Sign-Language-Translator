import { Euler, Quaternion, type Bone, type Mesh } from "three";
import { clamp } from "./space";

export function applyFace(
  meshes: Mesh[],
  weights: Record<string, number>,
  head: Bone | undefined,
  rotation: number[],
): void {
  for (const mesh of meshes) {
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!dictionary || !influences) continue;
    for (const [name, index] of Object.entries(dictionary)) {
      const value = weights[name];
      if (value !== undefined) influences[index] = value;
    }
  }
  if (!head) return;
  const rest = head.userData.restQuat as Quaternion | undefined;
  if (!rest) return;
  const euler = new Euler(
    clamp(rotation[0] ?? 0, -0.45, 0.45),
    clamp(rotation[1] ?? 0, -0.6, 0.6),
    clamp(rotation[2] ?? 0, -0.4, 0.4),
    "XYZ",
  );
  head.quaternion.copy(rest.clone().multiply(new Quaternion().setFromEuler(euler)));
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
