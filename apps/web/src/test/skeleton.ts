import { NodeIO, type Node } from "@gltf-transform/core";
import { Bone, Object3D } from "three";

const AVATAR = new URL("../../public/avatars/mpfb.glb", import.meta.url);

/** The avatar's skeleton without meshes, built from the real GLB so tests run in Node. */
export async function loadSkeleton(): Promise<Object3D> {
  const document = await new NodeIO().read(AVATAR.pathname);
  const joints = new Set(document.getRoot().listSkins().flatMap((skin) => skin.listJoints()));
  const made = new Map<Node, Object3D>();
  const build = (node: Node): Object3D => {
    const object = joints.has(node) ? new Bone() : new Object3D();
    object.name = node.getName();
    object.position.fromArray(node.getTranslation());
    object.quaternion.fromArray(node.getRotation());
    object.scale.fromArray(node.getScale());
    made.set(node, object);
    for (const child of node.listChildren()) object.add(build(child));
    return object;
  };
  const root = new Object3D();
  for (const scene of document.getRoot().listScenes()) {
    for (const node of scene.listChildren()) root.add(build(node));
  }
  return root;
}
