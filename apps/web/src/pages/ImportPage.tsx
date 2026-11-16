import { useState, type FormEvent } from "react";
import { api } from "../api/client";

export function ImportPage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await api.importVideo(form);
    setMessage(`U importua ${saved.gloss}.`);
  }

  return (
    <form className="space-y-3" onSubmit={(event) => void submit(event)}>
      <h1 className="text-2xl font-semibold">Importo video</h1>
      <input name="file" type="file" accept="video/mp4,video/webm,video/quicktime" required />
      <input name="gloss" className="w-full rounded-xl border px-3 py-2" placeholder="Shenja" required />
      <input name="lemmas" className="w-full rounded-xl border px-3 py-2" placeholder="fjalë, fjalë" required />
      <input name="topics" className="w-full rounded-xl border px-3 py-2" placeholder="tema" />
      <button className="rounded-full bg-slate-900 px-4 py-2 text-white" type="submit">
        Nxirr lëvizjen
      </button>
      {message && <p className="text-sm">{message}</p>}
    </form>
  );
}
