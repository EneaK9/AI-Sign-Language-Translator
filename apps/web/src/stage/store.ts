import { create } from "zustand";
import type { AvatarHandle, CameraPreset } from "../avatar/types";
import { SignPlayer } from "../player/SignPlayer";

type StageState = {
  handle: AvatarHandle | null;
  player: SignPlayer | null;
  speed: number;
  loop: boolean;
  mirrored: boolean;
  preset: CameraPreset;
  label: string;
  question: boolean;
  bendSign: number;
  setHandle: (handle: AvatarHandle) => void;
  setSpeed: (speed: number) => void;
  setLoop: (loop: boolean) => void;
  setMirrored: (mirrored: boolean) => void;
  setPreset: (preset: CameraPreset) => void;
  setLabel: (label: string) => void;
  setQuestion: (question: boolean) => void;
  setBendSign: (bendSign: number) => void;
};

export const useStage = create<StageState>((set, get) => ({
  handle: null,
  player: null,
  speed: 1,
  loop: false,
  mirrored: false,
  preset: "front",
  label: "",
  question: false,
  bendSign: 1,
  setHandle: (handle) => {
    if (get().handle?.root === handle.root) return;
    const player = new SignPlayer(handle, (label) => set({ label }));
    player.loop = get().loop;
    player.question = get().question;
    player.setSpeed(get().speed);
    set({ handle, player });
  },
  setSpeed: (speed) => {
    get().player?.setSpeed(speed);
    set({ speed });
  },
  setLoop: (loop) => {
    const player = get().player;
    if (player) player.loop = loop;
    set({ loop });
  },
  setMirrored: (mirrored) => set({ mirrored }),
  setPreset: (preset) => set({ preset }),
  setLabel: (label) => set({ label }),
  setQuestion: (question) => {
    const player = get().player;
    if (player) player.question = question;
    set({ question });
  },
  setBendSign: (bendSign) => set({ bendSign }),
}));

if (import.meta.env.DEV) (window as unknown as { __stage: typeof useStage }).__stage = useStage;
