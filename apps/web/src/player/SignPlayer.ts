import { Quaternion, Vector3, type Bone } from "three";
import type { AvatarHandle } from "../avatar/types";
import { RESTING_LID } from "../solver/face";
import { channelsOf, sampleMotion, type MorphChannel, type SignMotion } from "./motion";

/** `rate` speeds a clip up (letters inside a fingerspelled word are not held as long as a letter shown alone). */
export type PlayItem = { clip: SignMotion; label: string; rate?: number; pause?: number };

/**
 * Transition lengths in seconds. A transition removes the gap between the pose on screen and the next source
 * with a quintic curve that starts from the current velocity and ends with zero velocity and acceleration
 * (inertialization). From a standstill it is the minimum-jerk profile of human reaching, so the hand never
 * snaps, freezes, or moves at constant speed. Raising the arm takes about as long as it does for a person.
 */
const BLEND = { enter: 0.55, between: 0.3, exit: 0.62, stop: 0.5 };
/** How long the first frame of a sign is held while the hand travels toward it. */
const LEAD_IN = { enter: 0.32, between: 0.05 };
/** Final handshape is held a moment before the arms relax, so the last letter can be read. */
const END_HOLD = 0.32;
const MAX_SPIN = 14;

type Mode = "idle" | "play" | "hold" | "settle";

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

export class SignPlayer {
  loop = false;
  question = false;
  private mode: Mode = "idle";
  private externalControl = false;
  private speed = 1;
  private pause = 0.1;

  private items: PlayItem[] = [];
  private index = -1;
  private motion: SignMotion | null = null;
  private time = 0;
  private holdAt = 0;

  private bones: Bone[];
  private morphChannels: MorphChannel[];
  private neutral: Float32Array;
  private source: Float32Array;
  private sourceMorph: Float32Array;
  private current: Float32Array;
  private previous: Float32Array;
  private currentMorph: Float32Array;
  private previousMorph: Float32Array;
  /** Per bone: unit axis of the remaining offset. */
  private axes: Float32Array;
  /** Per bone and per morph: quintic coefficients [x0, v0, a0/2, c3, c4, c5, duration]. */
  private curves: Float32Array;
  private morphCurves: Float32Array;
  private blendTime = 0;
  private blendEnd = 0;
  private lastStep = 0;
  private started = false;

  private clock = 0;
  private idleWeight = 1;
  private questionWeight = 0;
  private nextBlink = 2.5;
  private blinkAge = -1;

  private handle: AvatarHandle;
  private onLabel: (label: string) => void;
  private scratchA = new Quaternion();
  private scratchB = new Quaternion();
  private scratchC = new Quaternion();
  private axis = new Vector3();

  constructor(handle: AvatarHandle, onLabel: (label: string) => void) {
    this.handle = handle;
    this.onLabel = onLabel;
    const channels = channelsOf(handle);
    this.bones = channels.bones;
    this.morphChannels = channels.morphs;
    const quatSize = this.bones.length * 4;
    this.neutral = new Float32Array(quatSize);
    this.bones.forEach((bone, slot) => {
      const pose = handle.neutral.get(bone.uuid) ?? (bone.userData.restQuat as Quaternion);
      pose.toArray(this.neutral, slot * 4);
    });
    this.source = this.neutral.slice();
    this.current = this.neutral.slice();
    this.previous = this.neutral.slice();
    this.sourceMorph = new Float32Array(this.morphChannels.length);
    this.currentMorph = new Float32Array(this.morphChannels.length);
    this.previousMorph = new Float32Array(this.morphChannels.length);
    this.axes = new Float32Array(this.bones.length * 3);
    this.curves = new Float32Array(this.bones.length * 7);
    this.morphCurves = new Float32Array(this.morphChannels.length * 7);
  }

  get playing(): boolean {
    return this.mode === "play";
  }

  get idle(): boolean {
    return this.mode === "idle";
  }

  /** While true, another page drives the skeleton directly and the player keeps its hands off. */
  get external(): boolean {
    return this.externalControl;
  }

  setExternal(value: boolean): void {
    if (value === this.externalControl) return;
    this.externalControl = value;
    if (value) return;
    // Take over from whatever pose the page left behind and relax from there.
    this.readSkeleton();
    this.items = [];
    this.motion = null;
    this.mode = "settle";
    this.transition(BLEND.stop);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  play(items: PlayItem[], pause = 0.1): void {
    this.items = items.filter((item) => item.clip.frames > 0);
    this.pause = pause;
    if (!this.items.length) {
      this.stop();
      return;
    }
    const fromRest = this.mode === "idle" || this.mode === "settle" || this.motion === null;
    this.mode = "play";
    this.start(0, fromRest ? "enter" : "between");
  }

  /** Relax back to the neutral pose from wherever the avatar is. */
  stop(): void {
    this.items = [];
    this.index = -1;
    this.onLabel("");
    if (this.mode === "idle" && !this.motion) return;
    this.motion = null;
    this.mode = "settle";
    this.transition(BLEND.stop);
  }

  /** Freeze one exact frame, for scrubbing and review. */
  hold(clip: SignMotion, time: number): void {
    this.items = [];
    this.motion = clip;
    this.holdAt = Math.min(Math.max(0, time), clip.duration);
    this.mode = "hold";
    this.clearBlend();
  }

  update(dt: number): void {
    const real = Math.min(Math.max(dt, 0), 0.1);
    this.clock += real;
    if (this.externalControl) return;
    const step = real * this.speed;

    if (this.mode === "play" && this.motion) {
      this.time += step * (this.items[this.index]?.rate ?? 1);
      const last = this.index + 1 >= this.items.length && !this.loop;
      const hold = last ? Math.max(this.pause, END_HOLD) : (this.items[this.index]?.pause ?? this.pause);
      if (this.time >= this.motion.duration + hold) {
        if (!last) this.start(this.index + 1 < this.items.length ? this.index + 1 : 0, "between");
        else {
          this.motion = null;
          this.mode = "settle";
          this.onLabel("");
          this.transition(BLEND.exit);
        }
      }
    }

    this.sampleSource(this.source, this.sourceMorph);
    if (this.mode !== "hold") this.blendTime += step;
    this.compose();
    this.lastStep = step;
    this.started = true;

    if (this.mode === "settle" && this.blendTime >= this.blendEnd) {
      this.mode = "idle";
      this.clearBlend();
    }

    this.write();
    this.overlay(real);
  }

  private start(index: number, kind: "enter" | "between"): void {
    this.index = index;
    const item = this.items[index];
    this.motion = item.clip;
    this.time = -LEAD_IN[kind];
    this.onLabel(item.label);
    this.transition(BLEND[kind]);
  }

  private sampleSource(quats: Float32Array, morphs: Float32Array): void {
    if (this.motion) {
      sampleMotion(this.motion, this.mode === "hold" ? this.holdAt : Math.max(0, this.time), quats, morphs);
    } else {
      quats.set(this.neutral);
      morphs.fill(0);
    }
  }

  private clearBlend(): void {
    this.curves.fill(0);
    this.morphCurves.fill(0);
    this.blendTime = 0;
    this.blendEnd = 0;
  }

  /**
   * Fit the quintic that takes an offset x0 moving at v0 to rest within `duration` (Bollo, "Inertialization",
   * GDC 2018). Motion away from the target is dropped, and the time shrinks when needed so nothing overshoots.
   */
  private fit(curves: Float32Array, at: number, x0: number, v0: number, duration: number): number {
    if (Math.abs(x0) < 1e-6) {
      curves.fill(0, at, at + 7);
      return 0;
    }
    const sign = x0 < 0 ? -1 : 1;
    const x = x0 * sign;
    let v = v0 * sign;
    if (v > 0) v = 0;
    const t1 = Math.max(1e-3, v < 0 ? Math.min(duration, (-5 * x) / v) : duration);
    const a0 = Math.max(0, (-8 * v * t1 - 20 * x) / (t1 * t1));
    curves[at] = x * sign;
    curves[at + 1] = v * sign;
    curves[at + 2] = (a0 / 2) * sign;
    curves[at + 3] = (-(3 * a0 * t1 * t1 + 12 * v * t1 + 20 * x) / (2 * t1 ** 3)) * sign;
    curves[at + 4] = ((3 * a0 * t1 * t1 + 16 * v * t1 + 30 * x) / (2 * t1 ** 4)) * sign;
    curves[at + 5] = (-(a0 * t1 * t1 + 6 * v * t1 + 12 * x) / (2 * t1 ** 5)) * sign;
    curves[at + 6] = t1;
    return t1;
  }

  private evaluate(curves: Float32Array, at: number, t: number): number {
    if (t >= curves[at + 6]) return 0;
    return curves[at] + t * (curves[at + 1] + t * (curves[at + 2] + t * (curves[at + 3] + t * (curves[at + 4] + t * curves[at + 5]))));
  }

  /**
   * Start an inertial transition: record how far the displayed pose is from the new source and how fast it
   * was moving, then fade that difference out along a smooth curve while the new source plays underneath.
   */
  private transition(duration: number): void {
    this.sampleSource(this.source, this.sourceMorph);
    const dt = this.started ? this.lastStep : 0;
    const spin = new Float32Array(3);
    const gap = new Float32Array(3);
    let end = 0;
    for (let bone = 0; bone < this.bones.length; bone += 1) {
      const shown = this.scratchA.fromArray(this.current, bone * 4);
      const target = this.scratchB.fromArray(this.source, bone * 4).invert();
      this.toRotationVector(this.scratchC.copy(shown).multiply(target), gap, 0);
      const x0 = Math.hypot(gap[0], gap[1], gap[2]);
      let v0 = 0;
      if (x0 > 1e-6) {
        for (let k = 0; k < 3; k += 1) this.axes[bone * 3 + k] = gap[k] / x0;
        if (dt > 1e-4) {
          const before = this.scratchB.fromArray(this.previous, bone * 4).invert();
          this.toRotationVector(this.scratchC.copy(shown).multiply(before), spin, 0);
          for (let k = 0; k < 3; k += 1) v0 += (spin[k] / dt) * this.axes[bone * 3 + k];
          v0 = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, v0));
        }
      }
      end = Math.max(end, this.fit(this.curves, bone * 7, x0, v0, duration));
    }
    for (let channel = 0; channel < this.morphChannels.length; channel += 1) {
      const x0 = this.currentMorph[channel] - this.sourceMorph[channel];
      const v0 = dt > 1e-4 ? (this.currentMorph[channel] - this.previousMorph[channel]) / dt : 0;
      end = Math.max(end, this.fit(this.morphCurves, channel * 7, x0, v0, duration));
    }
    this.blendTime = 0;
    this.blendEnd = end;
  }

  private compose(): void {
    this.previous.set(this.current);
    this.previousMorph.set(this.currentMorph);
    const t = this.blendTime;
    const blending = t < this.blendEnd;
    for (let bone = 0; bone < this.bones.length; bone += 1) {
      const source = this.scratchB.fromArray(this.source, bone * 4);
      const angle = blending ? this.evaluate(this.curves, bone * 7, t) : 0;
      if (Math.abs(angle) > 1e-7) {
        this.axis.fromArray(this.axes, bone * 3);
        this.scratchA.setFromAxisAngle(this.axis, angle).multiply(source).normalize().toArray(this.current, bone * 4);
      } else {
        source.toArray(this.current, bone * 4);
      }
    }
    for (let channel = 0; channel < this.morphChannels.length; channel += 1) {
      const offset = blending ? this.evaluate(this.morphCurves, channel * 7, t) : 0;
      this.currentMorph[channel] = this.sourceMorph[channel] + offset;
    }
  }

  private write(): void {
    this.bones.forEach((bone, slot) => bone.quaternion.fromArray(this.current, slot * 4));
    this.morphChannels.forEach((channel, slot) => {
      const influences = channel.mesh.morphTargetInfluences;
      if (influences) influences[channel.index] = Math.min(1, Math.max(0, this.currentMorph[slot]));
    });
  }

  private readSkeleton(): void {
    this.bones.forEach((bone, slot) => bone.quaternion.toArray(this.current, slot * 4));
    this.previous.set(this.current);
    this.morphChannels.forEach((channel, slot) => {
      this.currentMorph[slot] = channel.mesh.morphTargetInfluences?.[channel.index] ?? 0;
    });
    this.previousMorph.set(this.currentMorph);
    this.started = false;
  }

  /** Small signs of life that sit on top of whatever is playing: breathing, blinking, a drifting gaze. */
  private overlay(dt: number): void {
    const resting = !this.motion;
    this.idleWeight += ((resting ? 1 : 0) - this.idleWeight) * (1 - Math.exp(-dt / 0.35));
    const wantQuestion = this.question && this.mode === "play" ? 1 : 0;
    this.questionWeight += (wantQuestion - this.questionWeight) * (1 - Math.exp(-dt / 0.18));

    const breath = Math.sin(this.clock * ((2 * Math.PI) / 4.2));
    this.turn("spine", 1, 0, 0, breath * 0.012);
    this.turn("upperChest", 1, 0, 0, -breath * 0.006);

    const idle = this.idleWeight;
    if (idle > 1e-3) {
      // Relaxed lids at rest; while signing the clip's own face (retargeted) carries them.
      this.addMorph("eyeBlinkLeft", RESTING_LID * idle);
      this.addMorph("eyeBlinkRight", RESTING_LID * idle);
      const t = this.clock;
      this.turn("head", 0, 1, 0, idle * (0.03 * Math.sin(t * 0.31) + 0.012 * Math.sin(t * 0.83 + 1.3)));
      this.turn("head", 1, 0, 0, idle * (0.018 * Math.sin(t * 0.23 + 0.7) + 0.008 * Math.sin(t * 0.61)));
      this.turn("neck", 0, 0, 1, idle * 0.012 * Math.sin(t * 0.19 + 2.1));
      this.blink(dt, idle);
    }
    if (this.questionWeight > 1e-3) this.addMorph("browInnerUp", 0.45 * this.questionWeight);
  }

  private blink(dt: number, weight: number): void {
    if (this.blinkAge < 0) {
      this.nextBlink -= dt;
      if (this.nextBlink <= 0) this.blinkAge = 0;
      return;
    }
    this.blinkAge += dt;
    const close = 0.07;
    const open = 0.16;
    const value = this.blinkAge < close ? smooth(this.blinkAge / close) : 1 - smooth((this.blinkAge - close) / open);
    this.addMorph("eyeBlinkLeft", value * weight * (1 - RESTING_LID));
    this.addMorph("eyeBlinkRight", value * weight * (1 - RESTING_LID));
    if (this.blinkAge >= close + open) {
      this.blinkAge = -1;
      // People blink every 2–6 s, sometimes twice in a row.
      this.nextBlink = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4;
    }
  }

  private turn(name: string, x: number, y: number, z: number, angle: number): void {
    const bone = this.handle.bones[name];
    if (!bone || Math.abs(angle) < 1e-6) return;
    bone.quaternion.multiply(this.scratchA.setFromAxisAngle(this.axis.set(x, y, z), angle));
  }

  private addMorph(name: string, amount: number): void {
    for (const mesh of this.handle.meshes) {
      const index = mesh.morphTargetDictionary?.[name];
      const influences = mesh.morphTargetInfluences;
      if (index === undefined || !influences) continue;
      influences[index] = Math.min(1, influences[index] + amount);
    }
  }

  private toRotationVector(q: Quaternion, out: Float32Array, at: number): void {
    let { x, y, z, w } = q;
    if (w < 0) {
      x = -x;
      y = -y;
      z = -z;
      w = -w;
    }
    const sinHalf = Math.hypot(x, y, z);
    if (sinHalf < 1e-8) {
      out[at] = out[at + 1] = out[at + 2] = 0;
      return;
    }
    const angle = 2 * Math.atan2(sinHalf, w);
    out[at] = (x / sinHalf) * angle;
    out[at + 1] = (y / sinHalf) * angle;
    out[at + 2] = (z / sinHalf) * angle;
  }
}
