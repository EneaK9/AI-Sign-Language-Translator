import { useEffect, useRef, useState } from "react";
import type { HolisticLandmarker } from "@mediapipe/tasks-vision";
import { FrameFilter } from "../solver/filter";
import { solveFrame } from "../solver/solve";
import type { LandmarkFrame, Vec3 } from "../solver/types";
import { useStage } from "../stage/store";
import { createHolistic, resultToFrame } from "../tracking/holistic";

/** A hand that drops out for a moment keeps its last shape this long before it relaxes. */
const HAND_GRACE = 0.35;
/** The head's resting angle drifts toward the current angle this slowly, so camera bias cancels out. */
const HEAD_BASELINE_TAU = 4;

type HandMemory = { points: Vec3[] | null; seen: number };

export function MirrorPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [arms, setArms] = useState(true);
  const [hands, setHands] = useState(true);
  const [face, setFace] = useState(true);
  const [message, setMessage] = useState("Po hapet kamera…");
  const handle = useStage((state) => state.handle);
  const player = useStage((state) => state.player);
  const bendSign = useStage((state) => state.bendSign);
  const options = useRef({ arms, hands, face, bendSign });
  useEffect(() => {
    options.current = { arms, hands, face, bendSign };
  }, [arms, hands, face, bendSign]);

  useEffect(() => {
    if (!player) return;
    player.stop();
    player.setExternal(true);
    return () => {
      player.setExternal(false);
    };
  }, [player]);

  useEffect(() => {
    if (!handle) return;
    let stream: MediaStream | null = null;
    let tracker: HolisticLandmarker | null = null;
    let frame = 0;
    let stopped = false;
    let lastVideoTime = -1;
    let lastTime = 0;
    let baseline: number[] | null = null;
    const filter = new FrameFilter();
    const memory: Record<"lh" | "rh" | "lhi" | "rhi", HandMemory> = {
      lh: { points: null, seen: -1 },
      rh: { points: null, seen: -1 },
      lhi: { points: null, seen: -1 },
      rhi: { points: null, seen: -1 },
    };

    const keepHand = (key: "lh" | "rh" | "lhi" | "rhi", points: Vec3[] | null, now: number): Vec3[] | null => {
      const slot = memory[key];
      if (points) {
        if (now - slot.seen > HAND_GRACE) filter.reset(key);
        slot.points = points;
        slot.seen = now;
        return points;
      }
      return now - slot.seen <= HAND_GRACE ? slot.points : null;
    };

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
          frame = window.requestAnimationFrame(loop);
          // Only track new camera frames; the screen usually refreshes faster than the camera.
          if (video.currentTime === lastVideoTime || video.readyState < 2) return;
          lastVideoTime = video.currentTime;
          const now = performance.now() / 1000;
          const dt = lastTime ? Math.min(0.2, now - lastTime) : 0;
          lastTime = now;
          const aspect = video.videoWidth ? video.videoHeight / video.videoWidth : 0.75;
          const raw = resultToFrame(tracker.detectForVideo(video, performance.now()), aspect);
          const smooth = filter.next(raw, now);
          const head = smooth.head;
          if (raw.pose) {
            if (!baseline) baseline = [...head];
            const blend = dt ? 1 - Math.exp(-dt / HEAD_BASELINE_TAU) : 0;
            baseline = baseline.map((value, axis) => value + (head[axis] - value) * blend);
          }
          const solved: LandmarkFrame = {
            ...smooth,
            lh: keepHand("lh", smooth.lh, now),
            rh: keepHand("rh", smooth.rh, now),
            lhi: keepHand("lhi", smooth.lhi ?? null, now),
            rhi: keepHand("rhi", smooth.rhi ?? null, now),
            head: baseline ? head.map((value, axis) => value - (baseline as number[])[axis]) : [0, 0, 0],
          };
          solveFrame(handle, solved, options.current);
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
  }, [handle]);

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
