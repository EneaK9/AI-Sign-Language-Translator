import { useControls } from "leva";
import { useEffect } from "react";
import { Quaternion, Vector3 } from "three";
import { restQuaternion } from "../avatar/types";
import { solveFrame, syntheticHand } from "../solver/solve";
import { useStage } from "../stage/store";

export function RigPage() {
  const handle = useStage((state) => state.handle);
  const player = useStage((state) => state.player);
  const bendSign = useStage((state) => state.bendSign);
  const setBendSign = useStage((state) => state.setBendSign);
  const controls = useControls({
    curl: { value: 0, min: -1.5, max: 1.5 },
    brow: { value: 0, min: 0, max: 1 },
    jaw: { value: 0, min: 0, max: 1 },
  });

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
    handle.neutralPose();
    const index = handle.bones.RightHandIndex1;
    if (index) {
      const bend = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), controls.curl);
      index.quaternion.copy(restQuaternion(index).clone().multiply(bend));
    }
    handle.setMorph("browInnerUp", controls.brow);
    handle.setMorph("jawOpen", controls.jaw);
  }, [handle, controls.curl, controls.brow, controls.jaw]);

  function pose(curl: number, straight: number[] = []) {
    if (!handle) return;
    const hand = syntheticHand(curl, new Set(straight));
    solveFrame(handle, { pose: null, lh: null, rh: hand, face: { browInnerUp: controls.brow, jawOpen: controls.jaw }, head: [0, 0, 0] }, {
      arms: false,
      hands: true,
      face: true,
      bendSign,
    });
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-semibold">Prova e skeletit</h1>
      <p className="text-sm text-slate-600">Rrëshqitësit lëvizin gishtin dhe fytyrën. Butonat provojnë zgjidhësin e dorës.</p>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-full bg-slate-200 px-3 py-1" onClick={() => pose(0)} type="button">
          Dorë e sheshtë
        </button>
        <button className="rounded-full bg-slate-900 px-3 py-1 text-white" onClick={() => pose(1.2)} type="button">
          Grusht
        </button>
        <button className="rounded-full bg-teal-700 px-3 py-1 text-white" onClick={() => pose(1.2, [5, 6, 7, 8])} type="button">
          Tregues
        </button>
        <button className="rounded-full bg-slate-200 px-3 py-1" onClick={() => setBendSign(bendSign * -1)} type="button">
          Kthe përkuljen ({bendSign > 0 ? "+" : "−"})
        </button>
      </div>
    </div>
  );
}
