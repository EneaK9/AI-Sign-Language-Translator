import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AlphabetItem } from "../api/schema";
import type { LmClip } from "../solver/types";
import { bakeClip } from "../solver/bake";
import { useStage } from "../stage/store";

export function ClipPage() {
  const [letters, setLetters] = useState<AlphabetItem[]>([]);
  const [current, setCurrent] = useState<AlphabetItem | null>(null);
  const [clip, setClip] = useState<LmClip | null>(null);
  const [time, setTime] = useState(0);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const handle = useStage((state) => state.handle);
  const player = useStage((state) => state.player);
  const bendSign = useStage((state) => state.bendSign);

  useEffect(() => {
    api.alphabet().then(setLetters).catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => () => player?.stop(), [player]);

  async function open(letter: AlphabetItem) {
    setCurrent(letter);
    setMessage("");
    if (!letter.clip) {
      setClip(null);
      setMessage("S’ka klip. Nxirr alfabetin me komandën e pipeline-it.");
      return;
    }
    const raw = await api.clip(letter.clip.url);
    setClip(raw);
    setNote(letter.clip.note);
    setTime(0);
    show(raw, 0);
  }

  function show(raw: LmClip, at: number) {
    if (!handle || !player) return;
    const baked = bakeClip(handle, raw, { arms: true, hands: true, face: true, bendSign });
    player.hold(baked, at);
  }

  async function review(status: "approved" | "needs_fix") {
    if (!current?.clip) return;
    await api.updateClip(current.clip.id, { review: status, note, trim_start: current.clip.trim_start, trim_end: current.clip.trim_end });
    setMessage(status === "approved" ? "U miratua." : "Shënuar për ndreqje.");
    const next = await api.alphabet();
    setLetters(next);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Klipet</h1>
      <div className="flex gap-3">
        <video className="h-28 w-36 rounded-xl bg-black" src={current?.video_url ?? undefined} controls />
        <div className="flex flex-wrap gap-1">
          {letters.map((letter) => (
            <button key={letter.sign_id} className="rounded-lg bg-white px-2 py-1 text-sm uppercase" onClick={() => void open(letter)} type="button">
              {letter.letter}
            </button>
          ))}
        </div>
      </div>
      {clip && (
        <>
          <input
            aria-label="Koha"
            type="range"
            min={0}
            max={Math.max(0.1, (clip.meta.trimEnd - clip.meta.trimStart) / clip.fps)}
            step={0.04}
            value={time}
            onChange={(event) => {
              const next = Number(event.target.value);
              setTime(next);
              show(clip, next);
            }}
          />
          <textarea className="w-full rounded-xl border px-3 py-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Shënim" />
          <div className="flex gap-2">
            <button className="rounded-full bg-teal-700 px-3 py-1 text-white" onClick={() => void review("approved")} type="button">
              Mirato
            </button>
            <button className="rounded-full bg-amber-200 px-3 py-1" onClick={() => void review("needs_fix")} type="button">
              Duhet ndreqje
            </button>
          </div>
          <p className="text-xs text-slate-500">Dora e kapur: {Math.round(clip.meta.handDetected * 100)}%</p>
        </>
      )}
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
