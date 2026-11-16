import { useStage } from "../stage/store";

export function PlayerControls() {
  const speed = useStage((state) => state.speed);
  const loop = useStage((state) => state.loop);
  const mirrored = useStage((state) => state.mirrored);
  const preset = useStage((state) => state.preset);
  const label = useStage((state) => state.label);
  const setSpeed = useStage((state) => state.setSpeed);
  const setLoop = useStage((state) => state.setLoop);
  const setMirrored = useStage((state) => state.setMirrored);
  const setPreset = useStage((state) => state.setPreset);
  const player = useStage((state) => state.player);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-16 rounded-full bg-slate-900 px-3 py-1 text-center font-semibold text-white">
        {label || "—"}
      </span>
      <label className="flex items-center gap-2">
        Shpejtësia
        <input
          aria-label="Shpejtësia"
          type="range"
          min={0.25}
          max={1.5}
          step={0.05}
          value={speed}
          onChange={(event) => setSpeed(Number(event.target.value))}
        />
        <span>{speed.toFixed(2)}×</span>
      </label>
      <button className={button(loop)} onClick={() => setLoop(!loop)} type="button">
        Përsërit
      </button>
      <button className={button(mirrored)} onClick={() => setMirrored(!mirrored)} type="button">
        Majtas
      </button>
      <button className={button(preset === "front")} onClick={() => setPreset("front")} type="button">
        Përballë
      </button>
      <button className={button(preset === "angle")} onClick={() => setPreset("angle")} type="button">
        Kënd
      </button>
      <button className={button(preset === "hand")} onClick={() => setPreset("hand")} type="button">
        Dora
      </button>
      <button className="rounded-full bg-slate-200 px-3 py-1" onClick={() => player?.stop()} type="button">
        Ndal
      </button>
    </div>
  );
}

function button(active: boolean): string {
  return `rounded-full px-3 py-1 ${active ? "bg-teal-700 text-white" : "bg-slate-200"}`;
}
