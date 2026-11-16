import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { AlphabetItem } from "../api/schema";
import { PlayerControls } from "../components/Controls";
import { playLetters } from "../player/playback";

export function AlphabetPage() {
  const [letters, setLetters] = useState<AlphabetItem[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.alphabet().then(setLetters).catch((error: Error) => setMessage(error.message));
  }, []);

  async function play(letter: AlphabetItem) {
    setMessage("");
    try {
      const count = await playLetters([{ letter: letter.letter, signId: letter.sign_id }]);
      if (!count) setMessage("Kjo shkronjë s’ka klip ende. Nxirr klipet nga videot te faqja Klipet.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u luajt.");
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Alfabeti</h1>
      <PlayerControls />
      <div className="grid grid-cols-6 gap-2">
        {letters.map((letter) => (
          <button
            key={letter.sign_id}
            className="rounded-xl bg-white px-2 py-3 text-lg font-semibold uppercase shadow-sm hover:bg-teal-50"
            onClick={() => void play(letter)}
            type="button"
          >
            {letter.letter}
          </button>
        ))}
      </div>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
