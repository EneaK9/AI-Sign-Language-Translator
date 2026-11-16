import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, bestClip } from "../api/client";
import type { SearchHit } from "../api/schema";

export function DictionaryPage() {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.topics().then(setTopics).catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      api.search(query, topic).then(setHits).catch((error: Error) => setMessage(error.message));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, topic]);

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Fjalori</h1>
      <input
        className="w-full rounded-xl border border-slate-300 px-3 py-2"
        placeholder="Kërko, p.sh. spitalit"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Kërko"
      />
      <select className="rounded-xl border border-slate-300 px-3 py-2" value={topic} onChange={(event) => setTopic(event.target.value)}>
        <option value="">Të gjitha temat</option>
        {topics.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
      <ul className="max-h-[48vh] space-y-2 overflow-auto">
        {hits.map((hit) => (
          <li key={hit.sign.id}>
            <Link className="block rounded-2xl bg-white px-3 py-2 shadow-sm" to={`/sign/${hit.sign.id}`}>
              <span className="font-semibold">{hit.sign.gloss}</span>
              <span className="ml-2 text-sm text-slate-500">{hit.sign.lemmas.join(", ")}</span>
              {!bestClip(hit.sign.clips) && <span className="mt-1 block text-xs text-amber-700">Pa regjistrim — gërmëzohet</span>}
            </Link>
          </li>
        ))}
      </ul>
      {query && !hits.length && (
        <Link className="text-sm text-teal-800 underline" to={`/fingerspell?text=${encodeURIComponent(query)}`}>
          S’u gjet. Gërmëzoje.
        </Link>
      )}
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
