import { useState } from "react";
import { api } from "../api/client";
import type { SignPlanOut } from "../api/schema";
import { PlayerControls } from "../components/Controls";
import { playPlan } from "../player/playback";
import { canListen, listenAlbanian } from "../speech";
import { useStage } from "../stage/store";

export function TranslatePage() {
  const [text, setText] = useState("Si jeni sot?");
  const [plan, setPlan] = useState<SignPlanOut | null>(null);
  const [useLlm, setUseLlm] = useState(false);
  const [message, setMessage] = useState("");
  const setQuestion = useStage((state) => state.setQuestion);

  async function translate(source = text) {
    setMessage("");
    const next = await api.translate(source, useLlm);
    setPlan(next);
    setQuestion(next.sentence_type === "question");
    await playPlan(next.segments);
  }

  async function listen() {
    try {
      const heard = await listenAlbanian();
      setText(heard);
      await translate(heard);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nuk u dëgjua.");
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Përkthe</h1>
      <p className="text-sm text-slate-600">
        Fjalët e njohura shfaqen si shenja. Të tjerat gërmëzohen. Renditja nuk është gramatikë e vërtetë e GjShSh.
      </p>
      <PlayerControls />
      <textarea
        className="h-24 w-full rounded-xl border border-slate-300 px-3 py-2"
        value={text}
        onChange={(event) => setText(event.target.value)}
        aria-label="Teksti"
      />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={useLlm} onChange={(event) => setUseLlm(event.target.checked)} />
        Provo modelin lokal (Ollama), i fikur si parazgjedhje
      </label>
      <div className="flex gap-2">
        <button className="rounded-full bg-slate-900 px-4 py-2 text-white" onClick={() => void translate()} type="button">
          Shenja
        </button>
        <button className="rounded-full bg-teal-700 px-4 py-2 text-white" onClick={() => void listen()} type="button" disabled={!canListen()}>
          Fol
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {plan?.segments.map((segment, index) => (
          <span key={`${segment.type}-${index}`} className={`rounded-full px-3 py-1 text-sm ${segment.type === "sign" ? "bg-teal-100" : "bg-amber-100"}`}>
            {segment.gloss || segment.text}
          </span>
        ))}
      </div>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
