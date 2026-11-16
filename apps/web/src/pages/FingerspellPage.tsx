import { useState, type FormEvent } from "react";
import { api } from "../api/client";
import { PlayerControls } from "../components/Controls";
import { playLetters } from "../player/playback";
import { useStage } from "../stage/store";

export function FingerspellPage() {
  const [text, setText] = useState("Shqipëri");
  const [letters, setLetters] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const label = useStage((state) => state.label);

  async function spell(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const plan = await api.fingerspell(text);
    setLetters(plan.letters.map((item) => item.letter));
    const count = await playLetters(plan.letters.map((item) => ({ letter: item.letter, signId: item.sign_id })));
    if (!count) setMessage("S’ka klip për shkronjat. Nxirr fillimisht alfabetin.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Gërmëzim</h1>
      <PlayerControls />
      <form className="flex gap-2" onSubmit={(event) => void spell(event)}>
        <input
          className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
          aria-label="Fjala"
        />
        <button className="rounded-xl bg-slate-900 px-4 py-2 text-white" type="submit">
          Shkruaj
        </button>
      </form>
      <p className="flex flex-wrap gap-1">
        {letters.map((letter, index) => (
          <span
            key={`${letter}-${index}`}
            className={`rounded-lg px-2 py-1 text-sm font-semibold uppercase ${
              label.toLowerCase() === letter ? "bg-teal-700 text-white" : "bg-white"
            }`}
          >
            {letter}
          </span>
        ))}
      </p>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
