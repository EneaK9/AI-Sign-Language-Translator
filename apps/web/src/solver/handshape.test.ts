import { existsSync, readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { bindAvatar } from "../avatar/bind";
import type { AvatarHandle } from "../avatar/types";
import { anchorSequence } from "../player/anchor";
import { loadSkeleton } from "../test/skeleton";
import { bakeClip } from "./bake";
import { neutralFace } from "./prepare";
import { retargetFace } from "./face";
import { worldMismatch } from "./fuse";
import { palmOf, repairFingerDepth, segment, toPalm, togetherness } from "./hands";
import { solveFrame, syntheticHand } from "./solve";
import type { LandmarkFrame, LmClip, Vec3 } from "./types";

const CLIPS = new URL("../../../../data/clips/gjshsh/letter/", import.meta.url);
const haveClips = existsSync(new URL("n.json", CLIPS).pathname);

function load(letter: string): LmClip {
  return JSON.parse(readFileSync(new URL(`${letter}.json`, CLIPS).pathname, "utf8")) as LmClip;
}

function middleFrame(clip: LmClip): LandmarkFrame {
  return clip.frames[Math.floor((clip.meta.trimStart + clip.meta.trimEnd) / 2)];
}

/** Angle in degrees at a finger's middle joint on the avatar (0 = straight). */
function middleJoint(avatar: AvatarHandle, finger: string): number {
  const p = (n: number) => avatar.bones[`RightHand${finger}${n}`].getWorldPosition(new Vector3());
  const a = p(2).sub(p(1)).normalize();
  const b = p(3).sub(p(2)).normalize();
  return (Math.acos(Math.min(1, Math.max(-1, a.dot(b)))) * 180) / Math.PI;
}

describe("depth and source fusion", () => {
  it("mirrors a finger segment's depth when the tracker bends it backward", () => {
    const hand = syntheticHand(0.9);
    // Push the index finger's middle segment backward, away from the palm, by flipping its depth.
    const bent = hand.map((p) => [...p] as Vec3);
    for (const joint of [7, 8]) bent[joint][2] = 2 * bent[6][2] - bent[joint][2];
    const repaired = repairFingerDepth(bent, 1);
    const palm = palmOf(repaired);
    const before = toPalm(segment(bent, 6, 7), palmOf(bent));
    const after = toPalm(segment(repaired, 6, 7), palm);
    expect(after[2]).toBeGreaterThan(before[2]);
  });

  it("finds no mismatch when world and image landmarks agree", () => {
    const hand = syntheticHand(0.5);
    const image = hand.map(([x, y, z]) => [x * 3 + 0.5, y * 3 + 0.2, z * 3] as Vec3);
    const mismatch = worldMismatch(hand, image);
    expect(mismatch.palm).toBeLessThan(0.01);
    for (const value of mismatch.fingers) expect(value).toBeLessThan(0.01);
  });

  it("holds U's fingers together but keeps V's apart", () => {
    const straight = [1, 1, 0, 0];
    const lifts = [0, 0, 1, 1];
    expect(togetherness([0.2, 0.15, 0, 0], straight, [1.1, 3, 3], lifts)[0]).toBeGreaterThan(0.9);
    expect(togetherness([0.5, 0.1, 0, 0], straight, [2.4, 3, 3], lifts)[0]).toBeLessThan(0.1);
  });
});

describe("face", () => {
  it("removes the signer's resting bias so a calm face stays calm", () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      pose: null, lh: null, rh: null, head: [0, 0, 0],
      face: { browDownLeft: 0.55, eyeSquintLeft: 0.4, jawOpen: index === 10 ? 0.4 : 0.01 },
    }));
    const cleaned = neutralFace(frames);
    expect(cleaned[0].face.browDownLeft).toBeCloseTo(0, 5);
    expect(cleaned[0].face.eyeSquintLeft).toBeCloseTo(0, 5);
    expect(cleaned[10].face.jawOpen).toBeGreaterThan(0.3);
  });

  it("never presses the lips through each other and rolls the lip in for rounded vowels", () => {
    const closed = retargetFace({ mouthClose: 0.5, jawOpen: 0 });
    expect(closed.mouthClose).toBe(0);
    const round = retargetFace({ mouthPucker: 1, jawOpen: 0.2 });
    expect(round.mouthRollUpper).toBeGreaterThan(0.3);
    expect(round.jawOpen).toBeLessThan(0.2 * 1.6);
  });
});

describe.skipIf(!haveClips)("alphabet handshapes on the real clips", () => {
  let avatar: AvatarHandle;
  beforeAll(async () => {
    avatar = bindAvatar(await loadSkeleton());
  });
  const solve = (letter: string) => {
    const clip = load(letter);
    solveFrame(avatar, middleFrame(clip), { arms: true, hands: true, face: false, bendSign: 1, dominant: clip.meta.dominant });
    avatar.root.updateWorldMatrix(true, true);
  };

  it("N points a finger straight down (the world landmarks alone curl them all)", () => {
    // The two MediaPipe outputs disagree about depth here and the 2D image cannot settle it, so only the middle
    // finger is reliably recovered; the world-only solve curls both.
    solve("n");
    expect(Math.min(middleJoint(avatar, "Index"), middleJoint(avatar, "Middle"))).toBeLessThan(35);
  });

  it("S closes the fingers into a fist", () => {
    solve("s");
    for (const finger of ["Index", "Middle", "Ring"]) expect(middleJoint(avatar, finger)).toBeGreaterThan(55);
  });

  it("R points the index while the others fold", () => {
    solve("r");
    expect(middleJoint(avatar, "Index")).toBeLessThan(30);
  });

  it("anchors a fingerspelled word to one place and keeps every palm orientation", () => {
    const letters = ["t", "h", "a"].map((letter) => bakeClip(avatar, load(letter)));
    const anchored = anchorSequence(avatar, letters);
    const keys = Object.keys(avatar.bones);
    const bones = Object.values(avatar.bones);
    const measure = (motion: (typeof letters)[number]) => {
      const frame = Math.floor(motion.frames / 2);
      bones.forEach((bone, slot) => bone.quaternion.fromArray(motion.quats, (frame * bones.length + slot) * 4));
      avatar.root.updateWorldMatrix(true, true);
      return {
        wrist: avatar.bones.rightHand.getWorldPosition(new Vector3()),
        palm: avatar.bones.rightHand.getWorldQuaternion(new Quaternion()),
      };
    };
    const spread = (points: Vector3[]) => Math.max(...points.flatMap((a) => points.map((b) => a.distanceTo(b))));
    const before = letters.map(measure);
    const after = anchored.map(measure);
    expect(keys.length).toBeGreaterThan(0);
    expect(spread(after.map((m) => m.wrist))).toBeLessThan(spread(before.map((m) => m.wrist)) * 0.5 + 0.005);
    after.forEach((m, index) => expect(m.palm.angleTo(before[index].palm)).toBeLessThan(0.02));
  });
});
