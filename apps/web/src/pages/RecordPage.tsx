import { useEffect, useRef, useState } from "react";
import type { HolisticLandmarker } from "@mediapipe/tasks-vision";
import { api } from "../api/client";
import { previewClip } from "../player/playback";
import type { LandmarkFrame, LmClip } from "../solver/types";
import { createHolistic, resultToFrame } from "../tracking/holistic";

export function RecordPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const tracker = useRef<HolisticLandmarker | null>(null);
  const frames = useRef<LandmarkFrame[]>([]);
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<LmClip | null>(null);
  const [gloss, setGloss] = useState("");
  const [lemmas, setLemmas] = useState("");
  const [topics, setTopics] = useState("");
  const [message, setMessage] = useState("");
  const [trim, setTrim] = useState({ start: 0, end: 0 });

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    void (async () => {
      try {
        tracker.current = await createHolistic();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!videoRef.current || stop) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } catch {
        setMessage("Kamera ose modeli i ndjekjes nuk u hap.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((track) => track.stop());
      tracker.current?.close();
    };
  }, []);

  async function record() {
    const video = videoRef.current;
    const landmarker = tracker.current;
    if (!video || !landmarker) return;
    frames.current = [];
    setRecording(true);
    const started = performance.now();
    const capture = () => {
      if (performance.now() - started > 4000) {
        setRecording(false);
        const raw: LmClip = {
          format: "lm-v1",
          fps: 20,
          frames: frames.current,
          meta: { trimStart: 0, trimEnd: frames.current.length, dominant: "right", source: "webcam", handDetected: 1 },
        };
        setClip(raw);
        setTrim({ start: 0, end: raw.frames.length });
        previewClip(raw, gloss || "prova");
        return;
      }
      const result = landmarker.detectForVideo(video, performance.now());
      frames.current.push(resultToFrame(result, video.videoWidth ? video.videoHeight / video.videoWidth : 0.75));
      window.setTimeout(capture, 50);
    };
    window.setTimeout(capture, 50);
  }

  async function save() {
    if (!clip) return;
    const saved = await api.record({
      gloss,
      lemmas: lemmas.split(",").map((item) => item.trim()).filter(Boolean),
      topics: topics.split(",").map((item) => item.trim()).filter(Boolean),
      fps: clip.fps,
      frames: clip.frames,
      trim_start: trim.start,
      trim_end: trim.end,
    });
    setMessage(`U ruajt ${saved.gloss}.`);
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Regjistro</h1>
      <video ref={videoRef} className="w-full rounded-2xl bg-black" muted playsInline />
      <button className="rounded-full bg-slate-900 px-4 py-2 text-white" onClick={() => void record()} type="button" disabled={recording}>
        {recording ? "Po regjistrohet…" : "Regjistro 4 sekonda"}
      </button>
      {clip && (
        <>
          <label className="block text-sm">
            Fillimi {trim.start}
            <input type="range" min={0} max={clip.frames.length} value={trim.start} onChange={(event) => setTrim({ ...trim, start: Number(event.target.value) })} />
          </label>
          <label className="block text-sm">
            Fundi {trim.end}
            <input type="range" min={0} max={clip.frames.length} value={trim.end} onChange={(event) => setTrim({ ...trim, end: Number(event.target.value) })} />
          </label>
          <input className="w-full rounded-xl border px-3 py-2" placeholder="Shenja" value={gloss} onChange={(event) => setGloss(event.target.value)} aria-label="Shenja" />
          <input className="w-full rounded-xl border px-3 py-2" placeholder="Fjalët, me presje" value={lemmas} onChange={(event) => setLemmas(event.target.value)} aria-label="Fjalët" />
          <input className="w-full rounded-xl border px-3 py-2" placeholder="Tema" value={topics} onChange={(event) => setTopics(event.target.value)} aria-label="Tema" />
          <button className="rounded-full bg-teal-700 px-4 py-2 text-white" onClick={() => void save()} type="button">
            Ruaj
          </button>
        </>
      )}
      {message && <p className="text-sm">{message}</p>}
    </div>
  );
}
