import { Bone, Quaternion, Vector3, type Object3D } from "three";

export type RestPose = {
  world: Map<string, Quaternion>;
  dir: Map<string, Vector3>;
};

export function captureRest(root: Object3D, bones: Bone[]): RestPose {
  root.updateWorldMatrix(true, true);
  const world = new Map<string, Quaternion>();
  const dir = new Map<string, Vector3>();
  const nodes = new Set<Object3D>();
  for (const bone of bones) {
    nodes.add(bone);
    if (bone.parent) nodes.add(bone.parent);
  }
  for (const node of nodes) world.set(node.uuid, node.getWorldQuaternion(new Quaternion()));
  for (const bone of bones) {
    const child = bone.children.find((item) => (item as Bone).isBone) as Bone | undefined;
    const origin = bone.getWorldPosition(new Vector3());
    if (child) {
      dir.set(bone.uuid, child.getWorldPosition(new Vector3()).sub(origin).normalize());
    } else if (bone.parent && (bone.parent as Bone).isBone) {
      dir.set(bone.uuid, origin.clone().sub(bone.parent.getWorldPosition(new Vector3())).normalize());
    } else {
      const axis = new Vector3(0, 1, 0).applyQuaternion(bone.getWorldQuaternion(new Quaternion()));
      dir.set(bone.uuid, axis.normalize());
    }
  }
  return { world, dir };
}

/** Rotate `bone` so its rest child direction points along `target` in world space. */
export function aimBone(bone: Bone, target: Vector3, rest: RestPose): void {
  const parent = bone.parent;
  if (!parent) return;
  parent.updateWorldMatrix(true, false);
  const parentNow = parent.getWorldQuaternion(new Quaternion());
  const parentRest = rest.world.get(parent.uuid) ?? new Quaternion();
  const carry = parentNow.clone().multiply(parentRest.clone().invert());
  const restDir = rest.dir.get(bone.uuid);
  const boneRest = rest.world.get(bone.uuid);
  if (!restDir || !boneRest || restDir.lengthSq() < 1e-8 || target.lengthSq() < 1e-8) return;
  const dirNow = restDir.clone().applyQuaternion(carry).normalize();
  const delta = new Quaternion().setFromUnitVectors(dirNow, target.clone().normalize());
  const world = delta.multiply(carry).multiply(boneRest);
  bone.quaternion.copy(parentNow.invert().multiply(world));
}
