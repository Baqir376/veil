// The hero scene: a glass "device" core with a glowing on-device heart. Teal data tokens orbit it;
// every few seconds one leaves for the cloud — and turns blue as it becomes a placeholder.
// The whole rig leans toward the mouse. Paused when off-screen to keep the GPU free for Gemini Nano.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Float, MeshTransmissionMaterial, RoundedBox, Sparkles, Environment, Lightformer } from "@react-three/drei";
import * as THREE from "three";

const TEAL = new THREE.Color("#2dd4bf");
const BLUE = new THREE.Color("#60a5fa");
const VIOLET = new THREE.Color("#7c6cff");

function Rig({ children }: { children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  const { pointer } = useThree();
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, pointer.x * 0.45, 3, dt);
    g.current.rotation.x = THREE.MathUtils.damp(g.current.rotation.x, -pointer.y * 0.3, 3, dt);
    g.current.position.x = THREE.MathUtils.damp(g.current.position.x, pointer.x * 0.25, 2, dt);
  });
  return <group ref={g}>{children}</group>;
}

function Core() {
  const shell = useRef<THREE.Mesh>(null);
  const heart = useRef<THREE.Mesh>(null);
  useFrame((s, dt) => {
    if (shell.current) { shell.current.rotation.y += dt * 0.18; shell.current.rotation.z += dt * 0.07; }
    if (heart.current) {
      const p = 1 + Math.sin(s.clock.elapsedTime * 2.2) * 0.06;
      heart.current.scale.setScalar(p);
    }
  });
  return (
    <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.7}>
      <mesh ref={shell}>
        <icosahedronGeometry args={[1.35, 1]} />
        <MeshTransmissionMaterial backside samples={6} resolution={512} thickness={0.55} roughness={0.08}
          transmission={1} ior={1.35} chromaticAberration={0.08} anisotropy={0.2} distortion={0.25} distortionScale={0.4}
          temporalDistortion={0.12} color="#cfeee9" attenuationColor="#7c6cff" attenuationDistance={2.2} />
      </mesh>
      <mesh ref={heart}>
        <sphereGeometry args={[0.42, 48, 48]} />
        <meshStandardMaterial color={TEAL} emissive={TEAL} emissiveIntensity={2.4} toneMapped={false} />
      </mesh>
      <pointLight color={TEAL} intensity={6} distance={6} />
    </Float>
  );
}

/** Orbiting tokens. One at a time leaves for the cloud on a curve and changes colour on the way. */
function Tokens({ count = 14 }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const mats = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const seeds = useMemo(() => Array.from({ length: count }, (_, i) => ({
    r: 2.05 + (i % 3) * 0.28, tilt: (i / count) * Math.PI, speed: 0.25 + (i % 5) * 0.05, phase: (i / count) * Math.PI * 2,
  })), [count]);
  const flight = useRef({ idx: 0, t: -1, next: 1.5 });
  const cloud = useMemo(() => new THREE.Vector3(4.6, 1.6, -2.2), []);
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const col = useMemo(() => new THREE.Color(), []);

  useFrame((s, dt) => {
    const time = s.clock.elapsedTime;
    const f = flight.current;
    if (f.t < 0 && time > f.next) { f.idx = (f.idx + 5) % count; f.t = 0; }
    seeds.forEach((sd, i) => {
      const m = refs.current[i];
      const mat = mats.current[i];
      if (!m || !mat) return;
      const a = sd.phase + time * sd.speed;
      const orbit = tmp.set(Math.cos(a) * sd.r, Math.sin(a) * sd.r * Math.sin(sd.tilt) * 0.5, Math.sin(a) * sd.r * Math.cos(sd.tilt) * 0.6);
      if (i === f.idx && f.t >= 0) {
        f.t += dt * 0.45;
        const k = Math.min(1, f.t);
        const e = k * k * (3 - 2 * k);
        const mid = orbit.clone().lerp(cloud, 0.5).add(new THREE.Vector3(0, 1.2, 0));
        const p = new THREE.QuadraticBezierCurve3(orbit.clone(), mid, cloud).getPoint(e);
        m.position.copy(p);
        m.scale.setScalar(1 - e * 0.6);
        col.copy(TEAL).lerp(BLUE, Math.min(1, e * 1.6));
        mat.color.copy(col); mat.emissive.copy(col);
        if (k >= 1) { f.t = -1; f.next = time + 1.6; }
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
      {/* The cloud, far away: everything that arrives here is already a placeholder. */}
      <mesh position={cloud}>
        <sphereGeometry args={[0.32, 32, 32]} />
        <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={2} toneMapped={false} transparent opacity={0.85} />
      </mesh>
      <pointLight position={cloud} color={BLUE} intensity={4} distance={5} />
    </>
  );
}

function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function Hero3D() {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [ok] = useState(webglOk);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.05 });
    if (wrap.current) io.observe(wrap.current);
    return () => io.disconnect();
  }, []);

  if (!ok) {
    return <div ref={wrap} className="h-full w-full rounded-full bg-[radial-gradient(circle_at_40%_40%,#2dd4bf55,#7c6cff22_45%,transparent_70%)]" />;
  }
  return (
    <div ref={wrap} className="h-full w-full">
      <Canvas camera={{ position: [0, 0, 7], fov: 38 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        frameloop={visible ? "always" : "never"}>
        <ambientLight intensity={0.35} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <Rig>
          <Core />
          <Tokens />
          <Sparkles count={70} scale={[9, 5, 4]} size={2.2} speed={0.35} color="#a99fff" opacity={0.7} />
        </Rig>
        <Environment resolution={256} frames={1}>
          <Lightformer intensity={2} position={[0, 4, -6]} scale={[10, 3, 1]} color="#ffffff" />
          <Lightformer intensity={1.4} position={[-6, 0, 2]} scale={[2, 8, 1]} color="#7c6cff" />
          <Lightformer intensity={1.4} position={[6, -1, 2]} scale={[2, 8, 1]} color="#2dd4bf" />
        </Environment>
      </Canvas>
    </div>
  );
}
