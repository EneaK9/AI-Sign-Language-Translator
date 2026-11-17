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

function points(groups: Point[][] | undefined, aspect = 1): Vec3[] | null {
  const first = groups?.[0];
  if (!first?.length) return null;
  return first.map((point) => [point.x, point.y * aspect, point.z]);
}

/** Pitch, yaw and roll of the head from pose landmarks; the same formula the extraction pipeline uses. */
export function headFromPose(pose: Vec3[] | null): number[] {
  if (!pose || pose.length < 13) return [0, 0, 0];
  const [nose, leftEar, rightEar, leftShoulder, rightShoulder] = [pose[0], pose[7], pose[8], pose[11], pose[12]];
  const ear = [0, 1, 2].map((axis) => leftEar[axis] - rightEar[axis]);
  const shoulder = [0, 1, 2].map((axis) => leftShoulder[axis] - rightShoulder[axis]);
  const yaw = (vector: number[]) => Math.atan2(vector[0], Math.abs(vector[2]) > 1e-6 ? vector[2] : 1e-6);
  const pitch = Math.atan2(nose[1] - (leftEar[1] + rightEar[1]) / 2, 0.2);
  const roll = Math.atan2(ear[1], Math.hypot(ear[0], ear[2]) + 1e-6);
  return [pitch, yaw(ear) - yaw(shoulder), roll];
}

/**
 * `aspect` is the video's height over width; image-space hand landmarks are scaled by it so x, y and z share one
 * unit (image width), as the extraction pipeline stores them.
 */
export function resultToFrame(result: HolisticLandmarkerResult, aspect = 0.75): LandmarkFrame {
  const face: Record<string, number> = {};
  for (const category of result.faceBlendshapes?.[0]?.categories ?? []) {
    if (category.categoryName && category.categoryName !== "_neutral") face[category.categoryName] = category.score;
  }
  const pose = points(result.poseWorldLandmarks);
  return {
    pose,
    lh: points(result.leftHandWorldLandmarks),
    rh: points(result.rightHandWorldLandmarks),
    lhi: points(result.leftHandLandmarks, aspect),
    rhi: points(result.rightHandLandmarks, aspect),
    face,
    head: headFromPose(pose),
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
