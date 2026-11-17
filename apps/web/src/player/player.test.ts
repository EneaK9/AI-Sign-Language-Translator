import { existsSync, readFileSync } from "node:fs";
import { Quaternion, Vector3 } from "three";
import { beforeAll, describe, expect, it } from "vitest";
import { bindAvatar } from "../avatar/bind";
import type { AvatarHandle } from "../avatar/types";
import { bakeClip } from "../solver/bake";
import { loadSkeleton } from "../test/skeleton";
import type { LmClip } from "../solver/types";
import { SignPlayer } from "./SignPlayer";

const CLIPS = new URL("../../../../data/clips/gjshsh/letter/", import.meta.url);
const STEP = 1 / 60;

function loadClip(letter: string): LmClip | null {
  const file = new URL(`${letter}.json`, CLIPS);
  return existsSync(file.pathname) ? (JSON.parse(readFileSync(file.pathname, "utf8")) as LmClip) : null;
}

/** Run the player at 60 fps and record the right wrist position and the index knuckle rotation. */
function record(avatar: AvatarHandle, player: SignPlayer, seconds: number) {
  const wrist: Vector3[] = [];
  const knuckle: Quaternion[] = [];
  for (let frame = 0; frame < seconds / STEP; frame += 1) {
    player.update(STEP);
    avatar.root.updateWorldMatrix(true, true);
    wrist.push(avatar.bones.rightHand.getWorldPosition(new Vector3()));
    knuckle.push(avatar.bones.RightHandIndex1.quaternion.clone());
  }
  return { wrist, knuckle };
}

describe("sign player motion", () => {
  let avatar: AvatarHandle;

  beforeAll(async () => {
    avatar = bindAvatar(await loadSkeleton());
  });

  it("starts in a relaxed pose with arms down, not the bind A-pose", () => {
    const player = new SignPlayer(avatar, () => {});
    player.update(STEP);
    avatar.root.updateWorldMatrix(true, true);
    const shoulder = avatar.bones.rightUpperArm.getWorldPosition(new Vector3());
    const elbow = avatar.bones.rightForeArm.getWorldPosition(new Vector3());
    const down = elbow.sub(shoulder).normalize();
    expect(down.y).toBeLessThan(-0.95);
  });

  it("moves continuously through a fingerspelled word and relaxes afterwards", () => {
    const letters = ["s", "h", "q", "i", "p"].map(loadClip);
    if (letters.some((clip) => !clip)) return;
    const player = new SignPlayer(avatar, () => {});
    player.update(STEP);
    player.play(letters.map((clip, index) => ({ clip: bakeClip(avatar, clip as LmClip), label: String(index) })));
    const { wrist, knuckle } = record(avatar, player, 9);

    const speeds = wrist.slice(1).map((point, index) => point.distanceTo(wrist[index]) / STEP);
    const accelerations = speeds.slice(1).map((speed, index) => Math.abs(speed - speeds[index]) / STEP);
    const spins = knuckle.slice(1).map((q, index) => q.angleTo(knuckle[index]) / STEP);
    const maxSpeed = Math.max(...speeds);
    const maxAcceleration = Math.max(...accelerations);
    const maxSpin = Math.max(...spins);
    console.info(
      `wrist max ${maxSpeed.toFixed(2)} m/s, max accel ${maxAcceleration.toFixed(1)} m/s², knuckle max ${(
        (maxSpin * 180) /
        Math.PI
      ).toFixed(0)}°/s`,
    );
    // A human wrist rarely exceeds ~2 m/s while fingerspelling; a snap shows up as a huge one-frame jump.
    expect(maxSpeed).toBeLessThan(1.8);
    expect(maxAcceleration).toBeLessThan(25);
    expect(maxSpin).toBeLessThan((900 * Math.PI) / 180);
    // The hand actually rises to sign and comes back down.
    const lowest = Math.min(...wrist.map((point) => point.y));
    const highest = Math.max(...wrist.map((point) => point.y));
    expect(highest - lowest).toBeGreaterThan(0.12);
    expect(player.idle).toBe(true);
  });

  it("relaxes smoothly when stopped mid-sign", () => {
    const clip = loadClip("b");
    if (!clip) return;
    const player = new SignPlayer(avatar, () => {});
    player.update(STEP);
    player.play([{ clip: bakeClip(avatar, clip), label: "B" }]);
    record(avatar, player, 0.6);
    player.stop();
    const { wrist } = record(avatar, player, 1.5);
    const speeds = wrist.slice(1).map((point, index) => point.distanceTo(wrist[index]) / STEP);
    const accelerations = speeds.slice(1).map((speed, index) => Math.abs(speed - speeds[index]) / STEP);
    expect(Math.max(...speeds)).toBeLessThan(1.8);
    expect(Math.max(...accelerations)).toBeLessThan(25);
    expect(player.idle).toBe(true);
  });
});
