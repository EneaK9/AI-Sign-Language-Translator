import { api, bestClip } from "../api/client";
import type { SegmentOut, SignOut } from "../api/schema";
import type { AvatarHandle } from "../avatar/types";
import { bakeClip } from "../solver/bake";
import type { LmClip, SolveOptions } from "../solver/types";
import { DEFAULT_SOLVE } from "../solver/types";
import { useStage } from "../stage/store";
import { anchorSequence } from "./anchor";
import type { SignMotion } from "./motion";
import type { PlayItem, SignPlayer } from "./SignPlayer";

const rawClips = new Map<string, Promise<LmClip>>();
const baked = new WeakMap<AvatarHandle, Map<string, SignMotion>>();

/** Each user action takes a ticket; only the newest one is allowed to start playing. */
let latest = 0;
const claim = () => ++latest;
const isCurrent = (ticket: number) => ticket === latest;

function fetchClip(url: string): Promise<LmClip> {
  let pending = rawClips.get(url);
  if (!pending) {
    pending = api.clip(url);
    pending.catch(() => rawClips.delete(url));
    rawClips.set(url, pending);
  }
  return pending;
}

async function bakeSign(handle: AvatarHandle, sign: SignOut, options: SolveOptions): Promise<SignMotion | null> {
  const clip = bestClip(sign.clips);
  if (!clip) return null;
  let cache = baked.get(handle);
  if (!cache) {
    cache = new Map();
    baked.set(handle, cache);
  }
  const key = `${clip.url}|${clip.trim_start}|${clip.trim_end}|${clip.dominant_hand}|${options.arms}${options.hands}${options.face}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = await fetchClip(clip.url);
  // The database holds the reviewed trim and hand; the JSON file keeps what extraction first guessed.
  const dominant = clip.dominant_hand === "left" || clip.dominant_hand === "right" ? clip.dominant_hand : raw.meta.dominant;
  const reviewed: LmClip = {
    ...raw,
    meta: { ...raw.meta, trimStart: clip.trim_start, trimEnd: clip.trim_end || raw.meta.trimEnd, dominant },
  };
  const motion = bakeClip(handle, reviewed, options);
  motion.name = sign.id;
  cache.set(key, motion);
  return motion;
}

async function waitForStage(): Promise<{ handle: AvatarHandle; player: SignPlayer }> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const { handle, player } = useStage.getState();
    if (handle && player) return { handle, player };
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Avatari po ngarkohet.");
}

/** Entries that share a `word` number were fingerspelled together and are signed as one flowing word. */
type Entry = { sign: SignOut; label: string; word?: number };

/** A letter inside a word lasts about this long before the hand moves on (fluent signers spell faster still). */
const LETTER_IN_WORD = 0.6;
const LETTER_PAUSE = 0.04;
/** A beat between fingerspelled words, so a sentence does not run together into one long word. */
const WORD_PAUSE = 0.3;

async function playItems(signs: Entry[], ticket: number): Promise<void> {
  const { handle, player } = await waitForStage();
  const options: SolveOptions = { ...DEFAULT_SOLVE, bendSign: useStage.getState().bendSign };
  const motions = await Promise.all(signs.map((entry) => bakeSign(handle, entry.sign, options)));
  if (!isCurrent(ticket)) return;
  const items: PlayItem[] = [];
  let index = 0;
  while (index < signs.length) {
    const word = signs[index].word;
    let end = index + 1;
    while (word !== undefined && end < signs.length && signs[end].word === word) end += 1;
    const group = motions.slice(index, end).map((clip, offset) => ({ clip, entry: signs[index + offset] }));
    const playable = group.filter((item): item is { clip: SignMotion; entry: Entry } => !!item.clip);
    if (playable.length > 1 && word !== undefined) {
      const anchored = anchorSequence(handle, playable.map((item) => item.clip), playable[0].entry.sign.clips[0]?.dominant_hand === "left" ? "left" : "right");
      anchored.forEach((clip, offset) => {
        items.push({
          clip,
          label: playable[offset].entry.label,
          rate: Math.min(1.7, Math.max(1, clip.duration / LETTER_IN_WORD)),
          pause: offset === anchored.length - 1 ? WORD_PAUSE : LETTER_PAUSE,
        });
      });
    } else {
      for (const item of playable) items.push({ clip: item.clip, label: item.entry.label });
    }
    index = end;
  }
  player.play(items, items.some((item) => item.rate) ? LETTER_PAUSE : undefined);
}

export async function playSigns(signs: { sign: SignOut; label: string }[]): Promise<void> {
  await playItems(signs, claim());
}

export async function playLetters(letters: { letter: string; signId: string }[]): Promise<number> {
  const ticket = claim();
  const signs = await Promise.all(
    letters.map(async (item) => ({ label: item.letter, sign: await api.sign(item.signId) })),
  );
  const playable = signs.filter((item) => bestClip(item.sign.clips));
  if (!isCurrent(ticket)) return playable.length;
  await playItems(
    playable.map((item) => ({ sign: item.sign, label: item.label.toUpperCase(), word: 0 })),
    ticket,
  );
  return playable.length;
}

/** Fingerspell text word by word; each word gets its own group so it flows on its own and ends with a beat. */
async function spell(text: string, group: number): Promise<Entry[]> {
  const words = text.split(/\s+/).filter(Boolean);
  const spelled = await Promise.all(words.map((word) => api.fingerspell(word)));
  const entries = await Promise.all(
    spelled.flatMap((plan, index) =>
      plan.letters.map(async (letter) => ({
        sign: await api.sign(letter.sign_id),
        label: letter.letter.toUpperCase(),
        word: group * 100 + index,
      })),
    ),
  );
  return entries;
}

export async function playPlan(segments: SegmentOut[]): Promise<void> {
  const ticket = claim();
  const groups = await Promise.all(
    segments.map(async (segment, index): Promise<Entry[]> => {
      if (segment.type === "sign" && segment.sign_id) {
        const sign = await api.sign(segment.sign_id);
        if (bestClip(sign.clips)) return [{ sign, label: sign.gloss }];
        return spell(segment.gloss ?? segment.text ?? "", index);
      }
      return spell(segment.text ?? "", index);
    }),
  );
  if (!isCurrent(ticket)) return;
  await playItems(
    groups.flat().filter((item) => bestClip(item.sign.clips)),
    ticket,
  );
}

export function previewClip(raw: LmClip, label: string): void {
  const { handle, player } = useStage.getState();
  if (!handle || !player) return;
  claim();
  const options: SolveOptions = { ...DEFAULT_SOLVE, bendSign: useStage.getState().bendSign };
  player.play([{ clip: bakeClip(handle, raw, options), label }]);
}
