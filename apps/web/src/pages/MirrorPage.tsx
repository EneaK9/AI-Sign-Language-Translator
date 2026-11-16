import { useEffect, useRef, useState } from "react";
import type { HolisticLandmarker } from "@mediapipe/tasks-vision";
import { FrameFilter } from "../solver/filter";
import { solveFrame } from "../solver/solve";
import { useStage } from "../stage/store";
import { createHolistic, resultToFrame } from "../tracking/holistic";

export function MirrorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [arms, setArms] = useState(true);
  const [hands, setHands] = useState(true);
  const [face, setFace] = useState(true);
  const [message, setMessage] = useState("Po hapet kamera…");
  const handle = useStage((state) => state.handle);
  const bendSign = useStage((state) => state.bendSign);

  useEffect(() => {
    if (!handle) return;
    let stream: MediaStream | null = null;
    let tracker: HolisticLandmarker | null = null;
    let frame = 0;
    let stopped = false;
    const filter = new FrameFilter();
    void (async () => {
      try {
        tracker = await createHolistic();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        setMessage("");
        const loop = () => {
          if (stopped || !tracker) return;
          const raw = resultToFrame(tracker.detectForVideo(video, performance.now()));
          const smooth = filter.next(raw, performance.now() / 1000);
          const player = useStage.getState().player;
          if (!player || player.idle) {
            solveFrame(handle, smooth, { arms, hands, face, bendSign });
          }
          frame = window.requestAnimationFrame(loop);
        };
        frame = window.requestAnimationFrame(loop);
      } catch {
        setMessage("Kamera ose modeli nuk u hap. Duhet internet herën e parë.");
      }
    })();
    return () => {
      stopped = true;
      window.cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      tracker?.close();
    };
  }, [handle, arms, hands, face, bendSign]);

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Pasqyra</h1>
      <video ref={videoRef} className="w-full rounded-2xl bg-black" muted playsInline />
      <div className="flex gap-2 text-sm">
        <Toggle label="Krahët" value={arms} onChange={setArms} />
        <Toggle label="Duart" value={hands} onChange={setHands} />
        <Toggle label="Fytyra" value={face} onChange={setFace} />
      </div>
      {message && <p className="text-sm text-slate-600">{message}</p>}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button className={`rounded-full px-3 py-1 ${value ? "bg-teal-700 text-white" : "bg-slate-200"}`} onClick={() => onChange(!value)} type="button">
      {label}
    </button>
  );
}
