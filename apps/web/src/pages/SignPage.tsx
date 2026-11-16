import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api, bestClip } from "../api/client";
import type { SignOut } from "../api/schema";
import { PlayerControls } from "../components/Controls";
import { playLetters, playSigns } from "../player/playback";

export function SignPage() {
  const { id = "" } = useParams();
  const [sign, setSign] = useState<SignOut | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.sign(id).then(setSign).catch((error: Error) => setMessage(error.message));
  }, [id]);

  async function play() {
    if (!sign) return;
    if (bestClip(sign.clips)) {
      await playSigns([{ sign, label: sign.gloss }]);
      return;
    }
    const spelled = await api.fingerspell(sign.gloss);
    const count = await playLetters(spelled.letters.map((item) => ({ letter: item.letter, signId: item.sign_id })));
    setMessage(count ? "Nuk ka regjistrim, prandaj gërmëzohet." : "Nuk ka as regjistrim, as klip alfabeti.");
  }

  if (!sign) return <p>{message || "Po ngarkohet…"}</p>;
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">{sign.gloss}</h1>
      <PlayerControls />
      <p className="text-sm text-slate-600">{sign.lemmas.join(" · ")}</p>
      <p className="text-sm">{sign.topics.join(", ")}</p>
      <p className="text-sm text-slate-700">{sign.notes}</p>
      <button className="rounded-full bg-slate-900 px-4 py-2 text-white" onClick={() => void play()} type="button">
        Luaj
      </button>
      {message && <p className="text-sm text-amber-800">{message}</p>}
    </div>
  );
}
