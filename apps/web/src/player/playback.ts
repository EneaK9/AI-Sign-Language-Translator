import type { AnimationClip } from "three";
import { api, bestClip } from "../api/client";
import type { SegmentOut, SignOut } from "../api/schema";
import type { AvatarHandle } from "../avatar/types";
import { bakeClip } from "../solver/bake";
import type { LmClip, SolveOptions } from "../solver/types";
import { DEFAULT_SOLVE } from "../solver/types";
import type { PlayItem } from "./SignPlayer";
import { useStage } from "../stage/store";

async function bakeSign(handle: AvatarHandle, sign: SignOut, options: SolveOptions): Promise<AnimationClip | null> {
  const clip = bestClip(sign.clips);
  if (!clip) return null;
  const raw = await api.clip(clip.url);
  const baked = bakeClip(handle, raw, options);
  baked.name = sign.id;
  return baked;
}

async function waitForStage(): Promise<{ handle: AvatarHandle; player: NonNullable<ReturnType<typeof useStage.getState>["player"]> }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { handle, player } = useStage.getState();
    if (handle && player) return { handle, player };
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Avatari po ngarkohet.");
}

export async function playSigns(signs: { sign: SignOut; label: string }[]): Promise<void> {
  const { handle, player } = await waitForStage();
  const options: SolveOptions = { ...DEFAULT_SOLVE, bendSign: useStage.getState().bendSign };
  const items: PlayItem[] = [];
  for (const entry of signs) {
    const clip = await bakeSign(handle, entry.sign, options);
    if (clip) items.push({ clip, label: entry.label });
  }
  player.play(items);
}

export async function playLetters(letters: { letter: string; signId: string }[]): Promise<number> {
  const signs = await Promise.all(
    letters.map(async (item) => ({ label: item.letter, sign: await api.sign(item.signId) })),
  );
  const playable = signs.filter((item) => bestClip(item.sign.clips));
  await playSigns(playable.map((item) => ({ sign: item.sign, label: item.label.toUpperCase() })));
  return playable.length;
}

export async function playPlan(segments: SegmentOut[]): Promise<void> {
  const items: { sign: SignOut; label: string }[] = [];
  for (const segment of segments) {
    if (segment.type === "sign" && segment.sign_id) {
      const sign = await api.sign(segment.sign_id);
      if (bestClip(sign.clips)) {
        items.push({ sign, label: sign.gloss });
        continue;
      }
      const spelled = await api.fingerspell(segment.gloss ?? segment.text ?? "");
      for (const letter of spelled.letters) {
        items.push({ sign: await api.sign(letter.sign_id), label: letter.letter.toUpperCase() });
      }
      continue;
    }
    const spelled = await api.fingerspell(segment.text ?? "");
    for (const letter of spelled.letters) {
      items.push({ sign: await api.sign(letter.sign_id), label: letter.letter.toUpperCase() });
    }
  }
  await playSigns(items.filter((item) => bestClip(item.sign.clips)));
}

export function previewClip(raw: LmClip, label: string): void {
  const handle = useStage.getState().handle;
  const player = useStage.getState().player;
  if (!handle || !player) return;
  const options: SolveOptions = { ...DEFAULT_SOLVE, bendSign: useStage.getState().bendSign };
  player.play([{ clip: bakeClip(handle, raw, options), label }]);
}
