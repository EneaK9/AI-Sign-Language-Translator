import { OrbitControls } from "@react-three/drei";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { ACESFilmicToneMapping, Quaternion, Vector3, type Group } from "three";
import { useStage } from "../stage/store";
import { bindAvatar } from "./bind";
import { CAMERA_PRESETS } from "./types";

function AvatarModel() {
  const gltf = useGLTF("/avatars/mpfb.glb");
  const group = useRef<Group>(null);
  const mirrored = useStage((state) => state.mirrored);
  const setHandle = useStage((state) => state.setHandle);
  const blink = useRef(0);

  const handle = useMemo(() => bindAvatar(gltf.scene), [gltf.scene]);

  useEffect(() => {
    setHandle(handle);
  }, [handle, setHandle]);

  useFrame((_, delta) => {
    const { player } = useStage.getState();
    if (player && !player.idle) {
      if (player.playing) player.update(delta);
      return;
    }
    blink.current += delta;
    const wave = Math.max(0, Math.sin(blink.current * 0.7) - 0.92) * 12;
    handle.setMorph("eyeBlinkLeft", wave);
    handle.setMorph("eyeBlinkRight", wave);
    const spine = handle.bones.spine;
    const rest = spine?.userData.restQuat as Quaternion | undefined;
    if (spine && rest) {
      const breath = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.sin(blink.current * 1.4) * 0.015);
      spine.quaternion.copy(rest.clone().multiply(breath));
    }
  });

  return (
    <group ref={group} scale={[mirrored ? -1 : 1, 1, 1]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function CameraRig() {
  const preset = useStage((state) => state.preset);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls) as { target: { set: (...v: number[]) => void }; update: () => void } | null;
  useEffect(() => {
    const next = CAMERA_PRESETS[preset];
    camera.position.set(...next.position);
    controls?.target.set(...next.target);
    controls?.update();
  }, [preset, camera, controls]);
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
      <OrbitControls makeDefault target={[0, 1.28, 0]} minDistance={0.45} maxDistance={4} maxPolarAngle={Math.PI / 1.7} />
    </Canvas>
  );
}

useGLTF.preload("/avatars/mpfb.glb");
