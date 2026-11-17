import type { LandmarkFrame, Vec3 } from "./types";

function alpha(dt: number, cutoff: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / Math.max(dt, 1e-3));
}

/** One Euro filter: low lag when the signal moves, smoother when it is still. */
export class OneEuro {
  private value = 0;
  private derivative = 0;
  private time = 0;
  private ready = false;

  private minCutoff: number;
  private beta: number;

  constructor(minCutoff = 1.4, beta = 0.6) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  next(sample: number, time: number): number {
    if (!this.ready) {
      this.ready = true;
      this.value = sample;
      this.time = time;
      return sample;
    }
    const dt = Math.max(1e-3, time - this.time);
    this.time = time;
    const derivative = (sample - this.value) / dt;
    const derivativeAlpha = alpha(dt, 1);
    this.derivative += derivativeAlpha * (derivative - this.derivative);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.derivative);
    const sampleAlpha = alpha(dt, cutoff);
    this.value += sampleAlpha * (sample - this.value);
    return this.value;
  }
}

/**
 * Tuning per signal, by its units. Landmarks are in metres, so `beta` must be large enough that a hand moving
 * at 0.5 m/s opens the filter to several hertz; blendshapes and angles move in different ranges.
 */
const TUNING: Record<string, [number, number]> = {
  pose: [1.0, 6],
  lh: [1.6, 14],
  rh: [1.6, 14],
  lhi: [1.6, 14],
  rhi: [1.6, 14],
  face: [1.5, 0.6],
  head: [1.0, 0.8],
};

export class FrameFilter {
  private filters = new Map<string, OneEuro>();

  private sample(key: string, value: number, time: number): number {
    let filter = this.filters.get(key);
    if (!filter) {
      const [minCutoff, beta] = TUNING[key.slice(0, key.indexOf(":"))] ?? [1.4, 0.6];
      filter = new OneEuro(minCutoff, beta);
      this.filters.set(key, filter);
    }
    return filter.next(value, time);
  }

  /** Forget one stream, so a hand that comes back after a gap starts fresh instead of sliding in from old data. */
  reset(prefix: string): void {
    for (const key of [...this.filters.keys()]) if (key.startsWith(`${prefix}:`)) this.filters.delete(key);
  }

  private points(key: string, points: Vec3[] | null, time: number): Vec3[] | null {
    if (!points) return null;
    return points.map((point, index) => [
      this.sample(`${key}:${index}:0`, point[0], time),
      this.sample(`${key}:${index}:1`, point[1], time),
      this.sample(`${key}:${index}:2`, point[2], time),
    ]);
  }

  next(frame: LandmarkFrame, time: number): LandmarkFrame {
    const face: Record<string, number> = {};
    for (const [name, value] of Object.entries(frame.face)) face[name] = this.sample(`face:${name}`, value, time);
    return {
      pose: this.points("pose", frame.pose, time),
      lh: this.points("lh", frame.lh, time),
      rh: this.points("rh", frame.rh, time),
      lhi: this.points("lhi", frame.lhi ?? null, time),
      rhi: this.points("rhi", frame.rhi ?? null, time),
      face,
      head: (frame.head.length ? frame.head : [0, 0, 0]).map((value, index) => this.sample(`head:${index}`, value, time)),
    };
  }
}
