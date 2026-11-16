export type Vec3 = [number, number, number];

export type LandmarkFrame = {
  pose: Vec3[] | null;
  lh: Vec3[] | null;
  rh: Vec3[] | null;
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
};

export const DEFAULT_SOLVE: SolveOptions = {
  arms: true,
  hands: true,
  face: true,
  bendSign: 1,
};
