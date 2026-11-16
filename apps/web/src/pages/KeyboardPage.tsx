import { useState } from "react";
import { api } from "../api/client";
import { speak } from "../api/client";
import { PlayerControls } from "../components/Controls";
import { playLetters } from "../player/playback";

const LETTERS = [
  "a", "b", "c", "ç", "d", "dh", "e", "ë", "f", "g", "gj", "h", "i", "j", "k", "l", "ll", "m",
  "n", "nj", "o", "p", "q", "r", "rr", "s", "sh", "t", "th", "u", "v", "x", "xh", "y", "z", "zh",
];

export function KeyboardPage() {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");

  async function sign() {
    const plan = await api.fingerspell(text);
    const count = await playLetters(plan.letters.map((item) => ({ letter: item.letter, signId: item.sign_id })));
    setMessage(count ? "" : "S’ka klip për këto shkronja.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Tastiera</h1>
      <PlayerControls />
      <p className="min-h-8 text-lg font-semibold">{text || "…"}</p>
      <div className="grid grid-cols-6 gap-2">
        {LETTERS.map((letter) => (
          <button
            key={letter}
            className="rounded-xl bg-white px-2 py-2 text-sm font-semibold uppercase"
            onClick={() => setText((value) => value + letter)}
            type="button"
          >
            {letter}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-full bg-slate-900 px-4 py-2 text-white" onClick={() => void sign()} type="button">
          Shenja
        </button>
        <button className="rounded-full bg-teal-700 px-4 py-2 text-white" onClick={() => void speak(text)} type="button">
          Fol
        </button>
        <button className="rounded-full bg-slate-200 px-4 py-2" onClick={() => setText("")} type="button">
          Pastro
        </button>
      </div>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
