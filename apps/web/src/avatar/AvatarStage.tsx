import { OrbitControls } from "@react-three/drei";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { ACESFilmicToneMapping, Vector3, type Group } from "three";
import { useStage } from "../stage/store";
import { bindAvatar } from "./bind";
import { CAMERA_PRESETS } from "./types";

function AvatarModel() {
  const gltf = useGLTF("/avatars/mpfb.glb");
  const group = useRef<Group>(null);
  const mirrored = useStage((state) => state.mirrored);
  const setHandle = useStage((state) => state.setHandle);

  const handle = useMemo(() => bindAvatar(gltf.scene), [gltf.scene]);

  useEffect(() => {
    setHandle(handle);
  }, [handle, setHandle]);

  useFrame((_, delta) => {
    useStage.getState().player?.update(delta);
  });

  return (
    <group ref={group} scale={[mirrored ? -1 : 1, 1, 1]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

type Controls = { target: Vector3; update: () => void };

/** Where the hand camera sits relative to the hand it follows. */
const HAND_VIEW = new Vector3(
  CAMERA_PRESETS.hand.position[0] - CAMERA_PRESETS.hand.target[0],
  CAMERA_PRESETS.hand.position[1] - CAMERA_PRESETS.hand.target[1],
  CAMERA_PRESETS.hand.position[2] - CAMERA_PRESETS.hand.target[2],
);

function CameraRig() {
  const preset = useStage((state) => state.preset);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as unknown as Controls | null;
  const follow = useMemo(() => new Vector3(), []);
  const wanted = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const next = CAMERA_PRESETS[preset];
    camera.position.set(...next.position);
    controls?.target.set(...next.target);
    controls?.update();
    if (preset === "hand") {
      const hand = useStage.getState().handle?.bones.rightHand;
      if (hand && controls) {
        hand.getWorldPosition(follow);
        controls.target.copy(follow);
        camera.position.copy(follow).add(HAND_VIEW);
        controls.update();
      }
    }
  }, [preset, camera, controls, follow]);

  // The hand view follows the signing hand smoothly, keeping whatever angle the user orbited to.
  useFrame((_, delta) => {
    if (preset !== "hand" || !controls) return;
    const hand = useStage.getState().handle?.bones.rightHand;
    if (!hand) return;
    hand.getWorldPosition(wanted);
    const ease = 1 - Math.exp(-Math.min(delta, 0.1) / 0.25);
    const shift = wanted.sub(controls.target).multiplyScalar(ease);
    controls.target.add(shift);
    camera.position.add(shift);
    controls.update();
  });
  return null;
}

function DevHook() {
  const state = useThree();
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as { __three: typeof state }).__three = state;
  }, [state]);
  return null;
}

export function AvatarStage() {
  return (
    <Canvas
      className="h-full w-full"
      camera={{ position: [0, 1.42, 2.15], fov: 28, near: 0.05, far: 30 }}
      dpr={[1, 1.75]}
      shadows
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      <color attach="background" args={["#dfe7ea"]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[1.6, 2.4, 2.2]} intensity={1.35} castShadow />
      <directionalLight position={[-1.8, 1.4, -0.6]} intensity={0.35} />
      <hemisphereLight args={["#f4f7fb", "#c4b4a4", 0.45]} />
      <AvatarModel />
      <CameraRig />
      <DevHook />
      <OrbitControls makeDefault target={[0, 1.28, 0]} minDistance={0.45} maxDistance={4} maxPolarAngle={Math.PI / 1.7} />
    </Canvas>
  );
}

useGLTF.preload("/avatars/mpfb.glb");
