import { AnimationMixer, LoopOnce, type AnimationAction, type AnimationClip } from "three";
import type { AvatarHandle } from "../avatar/types";
import { addMorph } from "../solver/face";

export type PlayItem = { clip: AnimationClip; label: string };

const RETURN_TIME = 0.35;

export class SignPlayer {
  loop = false;
  question = false;
  playing = false;
  idle = true;
  private mixer: AnimationMixer;
  private items: PlayItem[] = [];
  private index = -1;
  private action: AnimationAction | null = null;
  private elapsed = 0;
  private duration = 0;
  private speed = 1;
  private pause = 0.12;
  private ending = 0;

  private handle: AvatarHandle;
  private onLabel: (label: string) => void;

  constructor(handle: AvatarHandle, onLabel: (label: string) => void) {
    this.handle = handle;
    this.onLabel = onLabel;
    this.mixer = new AnimationMixer(handle.root);
  }

  setSpeed(speed: number): void {
    this.speed = speed;
  }

  play(items: PlayItem[], pause = 0.12): void {
    this.stop();
    this.idle = false;
    this.items = items.filter((item) => item.clip.tracks.length > 0);
    this.pause = pause;
    if (!this.items.length) {
      this.idle = true;
      this.onLabel("");
      return;
    }
    this.playing = true;
    this.start(0);
  }

  stop(): void {
    this.mixer.stopAllAction();
    this.ending = 0;
    this.playing = false;
    this.idle = true;
    this.action = null;
    this.index = -1;
    this.handle.resetPose();
  }

  hold(clip: AnimationClip, time: number): void {
    this.stop();
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    action.paused = true;
    action.time = Math.min(time, clip.duration);
    this.mixer.update(0);
    this.action = action;
    this.idle = false;
  }

  update(dt: number): void {
    if (!this.playing) return;
    const step = dt * this.speed;
    this.mixer.update(step);
    if (this.question) addMorph(this.handle.meshes, "browInnerUp", 0.45);
    this.elapsed += step;
    if (this.ending > 0) {
      this.ending -= step;
      if (this.ending <= 0) {
        this.stop();
        this.onLabel("");
      }
      return;
    }
    if (this.elapsed < this.duration + this.pause) return;
    if (this.index + 1 < this.items.length) this.start(this.index + 1);
    else if (this.loop && this.items.length) this.start(0);
    else {
      this.action?.fadeOut(RETURN_TIME);
      this.ending = RETURN_TIME;
    }
  }

  private start(index: number): void {
    this.index = index;
    this.elapsed = 0;
    const item = this.items[index];
    this.duration = item.clip.duration;
    this.onLabel(item.label);
    const next = this.mixer.clipAction(item.clip);
    next.reset();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.fadeIn(0.16);
    const previous = this.action;
    next.play();
    if (previous && previous !== next) previous.fadeOut(0.16);
    this.action = next;
  }
}
