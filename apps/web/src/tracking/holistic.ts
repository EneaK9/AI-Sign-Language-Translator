import {
  FilesetResolver,
  HolisticLandmarker,
  type HolisticLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type { LandmarkFrame, Vec3 } from "../solver/types";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm";
const MODEL =
  "https://storage.googleapis.com/mediapipe-models/holistic_landmarker/holistic_landmarker/float16/latest/holistic_landmarker.task";

type Point = { x: number; y: number; z: number };

function points(groups: Point[][] | undefined): Vec3[] | null {
  const first = groups?.[0];
  if (!first?.length) return null;
  return first.map((point) => [point.x, point.y, point.z]);
}

export function resultToFrame(result: HolisticLandmarkerResult): LandmarkFrame {
  const face: Record<string, number> = {};
  for (const category of result.faceBlendshapes?.[0]?.categories ?? []) {
    if (category.categoryName && category.categoryName !== "_neutral") face[category.categoryName] = category.score;
  }
  return {
    pose: points(result.poseWorldLandmarks),
    lh: points(result.leftHandWorldLandmarks),
    rh: points(result.rightHandWorldLandmarks),
    face,
    head: [0, 0, 0],
  };
}

export async function createHolistic(): Promise<HolisticLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM);
  return HolisticLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL },
    runningMode: "VIDEO",
    outputFaceBlendshapes: true,
  });
}
