// The hero scene. At rest: a glass "device" core with a glowing on-device heart and teal data tokens in
// orbit; every few seconds one leaves for the distant cloud, turning blue as it becomes a placeholder.
// On scroll (Apple-style, but live 3D instead of a video): the core slides left, the cloud rises to meet
// it, and tags stream across — "two places, one rule". The rig leans toward the mouse throughout.
// Paused when off-screen so the GPU stays free for Gemini Nano.
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial, RoundedBox, Sparkles, Environment, Lightformer } from "@react-three/drei";
import type { MotionValue } from "motion/react";
import * as THREE from "three";

// "Redacted" palette in 3D: highlighter-yellow data on the device, ink bars, cobalt in the cloud.
const TEAL = new THREE.Color("#ffb800");   // on-device data (highlighter)
const BLUE = new THREE.Color("#2a44e8");   // cloud tags (cobalt)
const VIOLET = new THREE.Color("#16150f"); // redaction ink

const Progress = createContext<MotionValue<number> | null>(null);
const smooth = (a: number, b: number, v: number) => { const t = THREE.MathUtils.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function useSplit() {
  const p = useContext(Progress);
  return () => smooth(0.08, 0.55, p?.get() ?? 0);
}

/** Shared, mutable positions so tokens know where the core and the cloud are this frame. */
const anchors = { core: new THREE.Vector3(), cloud: new THREE.Vector3(4.6, 1.6, -2.2) };

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { pointer, camera } = useThree();
  const split = useSplit();
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, pointer.x * 0.4, 3, dt);
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -pointer.y * 0.28, 3, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, 7 + split() * 0.6, 4, dt);
  });
  return <group ref={g}>{children}</group>;
}

function Core() {
  const group = useRef<THREE.Group>(null);
  const shell = useRef<THREE.Mesh>(null);
  const heart = useRef<THREE.Mesh>(null);
  const split = useSplit();
  const viewport = useThree((s) => s.viewport);
  useFrame((s, dt) => {
    const k = split();
    // At rest the core sits to the right of the headline (wide screens); split → left third.
    const wide = viewport.aspect > 1.2;
    const restX = wide ? Math.min(1.9, viewport.width * 0.22) : 0;
    const splitX = -Math.min(2.1, viewport.width * 0.27);
    if (group.current) {
      group.current.position.x = THREE.MathUtils.damp(group.current.position.x, THREE.MathUtils.lerp(restX, splitX, k), 5, dt);
      group.current.position.y = THREE.MathUtils.damp(group.current.position.y, wide ? 0 : -0.9 * (1 - k), 5, dt);
      group.current.scale.setScalar(THREE.MathUtils.damp(group.current.scale.x, 1 - 0.28 * k, 5, dt));
      anchors.core.copy(group.current.position);
    }
    if (shell.current) { shell.current.rotation.y += dt * 0.18; shell.current.rotation.z += dt * 0.07; }
    if (heart.current) heart.current.scale.setScalar(1 + Math.sin(s.clock.elapsedTime * 2.2) * 0.06);
  });
  return (
    <group ref={group}>
      <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.7}>
        <mesh ref={shell}>
          <icosahedronGeometry args={[1.35, 1]} />
          <MeshTransmissionMaterial backside samples={6} resolution={512} thickness={0.55} roughness={0.08}
            transmission={1} ior={1.35} chromaticAberration={0.08} anisotropy={0.2} distortion={0.25} distortionScale={0.4}
            temporalDistortion={0.12} color="#ffffff" attenuationColor="#ffe08a" attenuationDistance={3} />
        </mesh>
        <mesh ref={heart}>
          <sphereGeometry args={[0.42, 48, 48]} />
          <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>
        <pointLight color={TEAL} intensity={6} distance={6} />
      </Float>
    </group>
  );
}

/** The cloud: far and small at rest; on scroll it rises to meet the device as a wireframe sphere. */
function Cloud() {
  const g = useRef<THREE.Group>(null);
  const wire = useRef<THREE.Mesh>(null);
  const split = useSplit();
  const viewport = useThree((s) => s.viewport);
  const far = useMemo(() => new THREE.Vector3(4.6, 1.6, -2.2), []);
  const near = useMemo(() => new THREE.Vector3(2.2, 0.05, 0), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = split();
    if (!g.current) return;
    far.set(Math.min(4.6, viewport.width * 0.45), viewport.aspect > 1.2 ? 1.6 : 1.2, -2.2);
    near.set(Math.min(2.2, viewport.width * 0.28), 0.05, 0);
    tmp.copy(far).lerp(near, k);
    g.current.position.x = THREE.MathUtils.damp(g.current.position.x, tmp.x, 5, dt);
    g.current.position.y = THREE.MathUtils.damp(g.current.position.y, tmp.y, 5, dt);
    g.current.position.z = THREE.MathUtils.damp(g.current.position.z, tmp.z, 5, dt);
    g.current.scale.setScalar(THREE.MathUtils.damp(g.current.scale.x, 1 + 1.4 * k, 5, dt));
    anchors.cloud.copy(g.current.position);
    if (wire.current) { wire.current.rotation.y += dt * 0.25; wire.current.rotation.x += dt * 0.1; }
  });
  return (
    <group ref={g} position={[4.6, 1.6, -2.2]}>
      <mesh>
        <sphereGeometry args={[0.3, 32, 32]} />
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={2} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <mesh ref={wire}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshBasicMaterial color={BLUE} wireframe transparent opacity={0.35} />
      </mesh>
      <pointLight color={BLUE} intensity={4} distance={5} />
    </group>
  );
}

/** Orbiting tokens. Some leave for the cloud on a curve and change colour on the way. */
function Tokens({ count = 16 }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const split = useSplit();
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    r: 2.05 + (i % 3) * 0.28, tilt: (i / count) * Math.PI, speed: 0.25 + (i % 5) * 0.05, phase: (i / count) * Math.PI * 2,
  })), [count]);
  const flights = useRef<{ idx: number; t: number; from: THREE.Vector3 }[]>([]);
  const nextAt = useRef(1.2);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), []);

  useFrame((s, dt) => {
    const time = s.clock.elapsedTime;
    const k = split();
    // More traffic once the cloud is close: the round-trip is the story.
    if (time > nextAt.current) {
      const free = seeds.map((_, i) => i).filter((i) => !flights.current.some((f) => f.idx === i));
      const idx = free[(Math.random() * free.length) | 0];
      if (idx !== undefined && refs.current[idx]) flights.current.push({ idx, t: 0, from: refs.current[idx]!.position.clone() });
      nextAt.current = time + (k > 0.5 ? 0.35 : 1.6);
    }
    seeds.forEach((sd, i) => {
      const m = refs.current[i], mat = mats.current[i];
      if (!m || !mat) return;
      const a = sd.phase + time * sd.speed;
      const orbitR = sd.r * (1 - 0.3 * k);
      const orbit = tmp.set(Math.cos(a) * orbitR, Math.sin(a) * orbitR * Math.sin(sd.tilt) * 0.5, Math.sin(a) * orbitR * Math.cos(sd.tilt) * 0.6).add(anchors.core);
      const f = flights.current.find((x) => x.idx === i);
      if (f) {
        f.t += dt * (k > 0.5 ? 0.8 : 0.45);
        const e = Math.min(1, f.t);
        const ease = e * e * (3 - 2 * e);
        curve.v0.copy(f.from);
        curve.v2.copy(anchors.cloud);
        curve.v1.copy(f.from).lerp(anchors.cloud, 0.5).add(tmp.set(0, 1.1 - k * 0.6, 0));
        m.position.copy(curve.getPoint(ease));
        m.scale.setScalar(1 - ease * 0.55);
        col.copy(TEAL).lerp(BLUE, Math.min(1, ease * 1.6));
        mat.color.copy(col); mat.emissive.copy(col);
        if (e >= 1) flights.current = flights.current.filter((x) => x !== f);
      } else {
        m.position.lerp(orbit, 0.12);
        m.scale.lerp(tmp.set(1, 1, 1), 0.1);
        mat.color.lerp(i % 4 === 0 ? VIOLET : TEAL, 0.08);
        mat.emissive.copy(mat.color);
      }
      m.rotation.x += dt * 0.6; m.rotation.y += dt * 0.4;
    });
  });

  return (
    <>
      {seeds.map((_, i) => (
        <RoundedBox key={i} ref={(el) => { refs.current[i] = el as unknown as THREE.Mesh; }} args={[0.34, 0.16, 0.16]} radius={0.06} smoothness={4}>
          <meshStandardMaterial ref={(el) => { mats.current[i] = el; }} color={TEAL} emissive={TEAL} emissiveIntensity={1.3} roughness={0.25} metalness={0.2} toneMapped={false} />
        </RoundedBox>
      ))}
    </>
  );
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function Hero3D({ progress }: { progress?: MotionValue<number> }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ok] = useState(webglOk);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.02 });
    if (wrap.current) io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  if (!ok) {
    return <div ref={wrap} className="h-full w-full rounded-full bg-[radial-gradient(circle_at_40%_40%,#0f7b5f55,#ffc21a22_45%,transparent_70%)]" />;
  }
  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas camera={{ position: [0, 0, 7], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}>
        <Progress.Provider value={progress ?? null}>
          <ambientLight intensity={0.35} />
          <directionalLight position={[3, 4, 5]} intensity={1.1} />
          <Rig>
            <Core />
            <Cloud />
            <Tokens />
            <Sparkles count={60} scale={[10, 5, 4]} size={2.6} speed={0.35} color="#16150f" opacity={0.35} />
          </Rig>
          <Environment resolution={256} frames={1}>
            <Lightformer intensity={2} position={[0, 4, -6]} scale={[10, 3, 1]} color="#ffffff" />
            <Lightformer intensity={1.4} position={[-6, 0, 2]} scale={[2, 8, 1]} color="#ffc21a" />
            <Lightformer intensity={1.4} position={[6, -1, 2]} scale={[2, 8, 1]} color="#0f7b5f" />
          </Environment>
        </Progress.Provider>
      </Canvas>
    </div>
  );
}
