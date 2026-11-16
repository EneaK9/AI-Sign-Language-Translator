import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api } from "../api/client";
import type { SignOut } from "../api/schema";

export function StudioPage() {
  const [signs, setSigns] = useState<SignOut[]>([]);
  const [message, setMessage] = useState("");

  function load() {
    api.studioSigns().then(setSigns).catch((error: Error) => setMessage(error.message));
  }

  useEffect(load, []);

  async function remove(sign: SignOut) {
    if (!window.confirm(`Fshij ${sign.gloss}?`)) return;
    await api.deleteSign(sign.id);
    load();
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Studio</h1>
      <p className="text-sm text-slate-600">Regjistrimet e tua janë të dhëna prove, jo shenja të verifikuara.</p>
      <div className="flex gap-2">
        <Link className="rounded-full bg-slate-900 px-4 py-2 text-white" to="/studio/record">
          Regjistro
        </Link>
        <Link className="rounded-full bg-slate-200 px-4 py-2" to="/studio/import">
          Importo video
        </Link>
      </div>
      <ul className="max-h-[50vh] space-y-2 overflow-auto">
        {signs.filter((sign) => sign.kind !== "letter").map((sign) => (
          <li key={sign.id} className="flex items-center justify-between gap-2 rounded-2xl bg-white px-3 py-2">
            <Link to={`/sign/${sign.id}`}>
              <span className="font-semibold">{sign.gloss}</span>
              <span className="ml-2 text-xs text-slate-500">{sign.status}</span>
            </Link>
            <button className="text-sm text-red-700" onClick={() => void remove(sign)} type="button">
              Fshij
            </button>
          </li>
        ))}
      </ul>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
