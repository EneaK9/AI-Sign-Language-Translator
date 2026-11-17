export type Vec3 = [number, number, number];

export type LandmarkFrame = {
  pose: Vec3[] | null;
  lh: Vec3[] | null;
  rh: Vec3[] | null;
  /** Image-space hand landmarks (units of image width). Better finger curl than the world landmarks. */
  lhi?: Vec3[] | null;
  rhi?: Vec3[] | null;
  face: Record<string, number>;
  head: number[];
};

export type LmClip = {
  format: "lm-v1";
  fps: number;
  frames: LandmarkFrame[];
  meta: {
    trimStart: number;
    trimEnd: number;
    dominant: "left" | "right";
    source: "video" | "webcam";
    handDetected: number;
  };
};

export type SolveOptions = {
  arms: boolean;
  hands: boolean;
  face: boolean;
  bendSign: number;
  dominant?: "left" | "right";
  /** Which landmarks drive the palm and the fingers. */
  handSource?: "world" | "image" | "hybrid" | "fused";
  /** Pick each finger segment's depth sign so no joint bends backward (monocular depth is ambiguous). */
  depthRepair?: boolean;
  /** Correct the palm normal from the direction the fingers curl. */
  refinePalm?: boolean;
  /** Deepen clearly bent finger joints, which MediaPipe under-reports. */
  deepen?: boolean;
};

export const DEFAULT_SOLVE: SolveOptions = {
  arms: true,
  hands: true,
  face: true,
  bendSign: 1,
};
