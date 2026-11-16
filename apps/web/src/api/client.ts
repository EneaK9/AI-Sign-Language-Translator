import type { LmClip } from "../solver/types";
import type {
  AlphabetItem,
  ClipOut,
  FingerspellOut,
  SearchHit,
  SignOut,
  SignPlanOut,
} from "./schema";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: string };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      detail = response.statusText;
    }
    throw new Error(detail || `Kërkesa dështoi (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function bestClip(clips: ClipOut[]): ClipOut | null {
  if (!clips.length) return null;
  const approved = clips.filter((clip) => clip.review === "approved");
  const pool = approved.length ? approved : clips;
  return pool.reduce((left, right) => (left.id > right.id ? left : right));
}

export const api = {
  alphabet: () => request<AlphabetItem[]>("/v1/alphabet"),
  topics: () => request<string[]>("/v1/topics"),
  sign: (id: string) => request<SignOut>(`/v1/signs/${encodeURIComponent(id)}`),
  search: (q: string, topic = "") =>
    request<SearchHit[]>(`/v1/signs/search?q=${encodeURIComponent(q)}&topic=${encodeURIComponent(topic)}&limit=40`),
  fingerspell: (text: string) => request<FingerspellOut>(`/v1/fingerspell?text=${encodeURIComponent(text)}`),
  translate: (text: string, useLlm = false) =>
    request<SignPlanOut>("/v1/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, use_llm: useLlm }),
    }),
  tts: (text: string) => request<{ url: string; voice: string }>(`/v1/tts?text=${encodeURIComponent(text)}`),
  clip: (url: string) => request<LmClip>(url),
  studioSigns: () => request<SignOut[]>("/v1/studio/signs"),
  record: (body: unknown) =>
    request<SignOut>("/v1/studio/clips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  importVideo: (form: FormData) => request<SignOut>("/v1/studio/import", { method: "POST", body: form }),
  updateClip: (id: number, body: unknown) =>
    request<SignOut>(`/v1/studio/clips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  updateSign: (id: string, body: unknown) =>
    request<SignOut>(`/v1/studio/signs/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  deleteSign: (id: string) =>
    request<{ ok: boolean }>(`/v1/studio/signs/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export async function speak(text: string): Promise<void> {
  try {
    const result = await api.tts(text);
    const audio = new Audio(result.url);
    await audio.play();
  } catch {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "sq-AL";
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  }
}
