import { existsSync, readFileSync } from "node:fs";
import { NodeIO, type Node } from "@gltf-transform/core";
import { Bone, Object3D, Quaternion, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { bindAvatar } from "../avatar/bind";
import type { AvatarHandle } from "../avatar/types";
import { avatarPalm } from "./calibrate";
import { FINGERS, dot, fingerBoneName, palmOf, segment, toPalm } from "./hands";
import { solveFrame, syntheticHand } from "./solve";
import { toAvatarSpace } from "./space";
import type { LmClip, Vec3 } from "./types";

const AVATAR = new URL("../../public/avatars/mpfb.glb", import.meta.url);
const CLIPS = new URL("../../../../data/clips/gjshsh/letter/", import.meta.url);

async function loadSkeleton(): Promise<Object3D> {
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

function position(avatar: AvatarHandle, name: string): Vec3 {
  const point = avatar.bones[name].getWorldPosition(new Vector3());
  return [point.x, point.y, point.z];
}

/** Current world direction of a bone, using the same rest direction the solver aims. */
function boneDirection(avatar: AvatarHandle, name: string): Vec3 {
  const bone = avatar.bones[name];
  const restDir = avatar.rest.dir.get(bone.uuid);
  const restWorld = avatar.rest.world.get(bone.uuid);
  if (!restDir || !restWorld) throw new Error(`no rest for ${name}`);
  const local = restDir.clone().applyQuaternion(restWorld.clone().invert());
  const now = local.applyQuaternion(bone.getWorldQuaternion(new Quaternion())).normalize();
  return [now.x, now.y, now.z];
}

/** Mean angle in degrees between tracked and avatar finger segments, both seen from their own palm. */
function fingerError(avatar: AvatarHandle, side: "Left" | "Right", landmarks: Vec3[]): number {
  const converted = landmarks.map((point) => toAvatarSpace(point));
  const tracked = palmOf(converted);
  const palm = avatarPalm(avatar.bones, side);
  if (!palm) throw new Error("no palm");
  const errors: number[] = [];
  for (const finger of FINGERS) {
    for (let joint = 0; joint < 3; joint += 1) {
      const name = fingerBoneName(side, finger.name, joint);
      const want = toPalm(segment(converted, finger.joints[joint], finger.joints[joint + 1]), tracked);
      const got = toPalm(boneDirection(avatar, name), palm);
      const lw = Math.hypot(...want) || 1;
      errors.push((Math.acos(Math.min(1, Math.max(-1, dot(want, got) / lw))) * 180) / Math.PI);
    }
  }
  return errors.reduce((sum, value) => sum + value, 0) / errors.length;
}

function tipTowardPalm(avatar: AvatarHandle, side: "Left" | "Right", finger: string): number {
  const palm = avatarPalm(avatar.bones, side);
  if (!palm) throw new Error("no palm");
  const base = position(avatar, `${side}Hand${finger}1`);
  const last = position(avatar, `${side}Hand${finger}3`);
  const tip = boneDirection(avatar, `${side}Hand${finger}3`);
  const end: Vec3 = [last[0] + tip[0] * 0.02, last[1] + tip[1] * 0.02, last[2] + tip[2] * 0.02];
  const offset: Vec3 = [end[0] - base[0], end[1] - base[1], end[2] - base[2]];
  return dot(offset, palm.normal) * (side === "Right" ? 1 : -1);
}

describe("hand retargeting on the real avatar skeleton", () => {
  let avatar: AvatarHandle;

  beforeAll(async () => {
    avatar = bindAvatar(await loadSkeleton());
  });

  it("closes a fist into the palm instead of bending fingers backward", () => {
    const solve = { arms: false, hands: true, face: false, bendSign: 1 };
    solveFrame(avatar, { pose: null, lh: null, rh: syntheticHand(0), face: {}, head: [0, 0, 0] }, solve);
    const flat = tipTowardPalm(avatar, "Right", "Index");
    solveFrame(avatar, { pose: null, lh: null, rh: syntheticHand(1.3), face: {}, head: [0, 0, 0] }, solve);
    const fist = tipTowardPalm(avatar, "Right", "Index");
    expect(Math.abs(flat)).toBeLessThan(0.01);
    expect(fist).toBeGreaterThan(0.015);
  });

  it("curls a left hand into its own palm too", () => {
    const solve = { arms: false, hands: true, face: false, bendSign: 1 };
    const mirrored = syntheticHand(1.3).map(([x, y, z]) => [-x, y, z] as Vec3);
    solveFrame(avatar, { pose: null, lh: mirrored, rh: null, face: {}, head: [0, 0, 0] }, solve);
    expect(tipTowardPalm(avatar, "Left", "Middle")).toBeGreaterThan(0.015);
  });

  it("matches the tracked finger directions of the alphabet clips", () => {
    if (!existsSync(CLIPS.pathname)) return;
    const solve = { arms: true, hands: true, face: false, bendSign: 1 };
    const report: string[] = [];
    for (const letter of ["a", "b", "c", "e", "i", "l", "o", "v", "y"]) {
      const file = new URL(`${letter}.json`, CLIPS);
      if (!existsSync(file.pathname)) continue;
      const clip = JSON.parse(readFileSync(file.pathname, "utf8")) as LmClip;
      const frames = clip.frames.filter((frame) => frame.rh);
      const frame = frames[Math.floor(frames.length / 2)];
      solveFrame(avatar, frame, { ...solve, dominant: "right" });
      const error = fingerError(avatar, "Right", frame.rh as Vec3[]);
      report.push(`${letter}:${error.toFixed(1)}°`);
      expect(error).toBeLessThan(12);
    }
    console.info(`finger error per letter ${report.join(" ")}`);
  });
});
