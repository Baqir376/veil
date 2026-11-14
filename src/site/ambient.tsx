// Living backgrounds and the scroll rail.
//  • Aurora: a slow mesh of soft palette colours, drifting on its own and leaning toward the mouse.
//  • FloatingTokens: redaction bars and tags drifting at different depths (mouse + scroll parallax).
//  • ScrollRail: a vertical line on the left that draws itself as you scroll, with a dot per section.
import { useEffect, useMemo, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, useScroll, type MotionValue } from "motion/react";

function usePointer() {
  const x = useMotionValue(0), y = useMotionValue(0);
  useEffect(() => {
    const m = (e: PointerEvent) => { x.set(e.clientX / window.innerWidth - 0.5); y.set(e.clientY / window.innerHeight - 0.5); };
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, [x, y]);
  return { x: useSpring(x, { stiffness: 40, damping: 18 }), y: useSpring(y, { stiffness: 40, damping: 18 }) };
}

const BLOBS = [
  { c: "#ffc21a", s: 620, x: "8%", y: "6%", d: 22, k: 60 },
  { c: "#2a44e8", s: 560, x: "70%", y: "12%", d: 26, k: -50 },
  { c: "#ff9b7a", s: 480, x: "55%", y: "62%", d: 30, k: 40 },
  { c: "#7fd8b6", s: 520, x: "-6%", y: "58%", d: 28, k: -40 },
];

/** Soft, slowly breathing colour field. Fixed behind the page; pointer-events none. */
export function Aurora({ intensity = 1 }: { intensity?: number }) {
  const p = usePointer();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {BLOBS.map((b, i) => <Blob key={i} b={b} p={p} intensity={intensity} />)}
      <div className="absolute inset-0 [background-image:linear-gradient(rgb(22_21_15/.045)_1px,transparent_1px),linear-gradient(90deg,rgb(22_21_15/.035)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_at_50%_30%,#000_25%,transparent_80%)]" />
    </div>
  );
}

function Blob({ b, p, intensity }: { b: typeof BLOBS[number]; p: { x: MotionValue<number>; y: MotionValue<number> }; intensity: number }) {
  const tx = useTransform(p.x, (v) => v * b.k);
  const ty = useTransform(p.y, (v) => v * b.k);
  return (
    <motion.div className="absolute rounded-full" style={{ left: b.x, top: b.y, width: b.s, height: b.s, x: tx, y: ty,
      background: `radial-gradient(circle at 50% 50%, ${b.c}, transparent 68%)`, opacity: 0.32 * intensity, filter: "blur(40px)" }}
      animate={{ scale: [1, 1.15, 0.95, 1], rotate: [0, 25, -15, 0], borderRadius: ["50%", "42% 58% 55% 45%", "55% 45% 40% 60%", "50%"] }}
      transition={{ duration: b.d, repeat: Infinity, ease: "easeInOut" }} />
  );
}

const TOKENS = ["person 1", "pan 1", "aadhaar 1", "amount · ₹15–20L", "iban 1", "email 1", "phone 1", "place 1", "org 1", "upi 1", "card 1", "clue 1"];

/** Redaction bars and tags drifting at different depths. Near ones move more with the mouse and scroll. */
export function FloatingTokens({ count = 10 }: { count?: number }) {
  const p = usePointer();
  const { scrollY } = useScroll();
  const items = useMemo(() => Array.from({ length: count }, (_, i) => {
    const r = (n: number) => { const v = Math.sin((i + 1) * 9301 + n * 49297) * 233280; return v - Math.floor(v); };
    return {
      left: `${4 + r(1) * 90}%`, top: `${4 + r(2) * 88}%`, depth: 0.25 + r(3) * 0.9, rot: -12 + r(4) * 24,
      kind: r(5) > 0.55 ? "bar" : r(5) > 0.25 ? "tag" : "cloud", label: TOKENS[i % TOKENS.length], w: 60 + r(6) * 70, dur: 9 + r(7) * 8,
    };
  }), [count]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {items.map((it, i) => <Floater key={i} it={it} p={p} scrollY={scrollY} />)}
    </div>
  );
}

function Floater({ it, p, scrollY }: { it: any; p: { x: MotionValue<number>; y: MotionValue<number> }; scrollY: MotionValue<number> }) {
  const x = useTransform(p.x, (v) => v * 70 * it.depth);
  const yMouse = useTransform(p.y, (v) => v * 50 * it.depth);
  const yScroll = useTransform(scrollY, (v) => -v * 0.12 * it.depth);
  const y = useTransform([yMouse, yScroll], ([a, b]: number[]) => a + b);
  const style = { left: it.left, top: it.top, x, y, rotate: it.rot, opacity: 0.07 + it.depth * 0.2, filter: `blur(${(1.15 - it.depth) * 2.2}px)`, scale: 0.7 + it.depth * 0.5 };
  return (
    <motion.div className="absolute" style={style}>
      <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: it.dur, repeat: Infinity, ease: "easeInOut" }}>
        {it.kind === "bar" ? <span className="block h-[14px] rounded-[3px] bg-fog" style={{ width: it.w }} />
          : <span className={`vchip ${it.kind === "cloud" ? "cloud" : ""}`}>{it.label}</span>}
      </motion.div>
    </motion.div>
  );
}

export interface RailSection { id: string; label: string }

/** Left-side scroll rail: the line draws with scroll; dots light up as each section is reached. */
export function ScrollRail({ sections }: { sections: RailSection[] }) {
  const { scrollYProgress } = useScroll();
  const draw = useSpring(scrollYProgress, { stiffness: 90, damping: 25 });
  const [active, setActive] = useState(sections[0]?.id);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (vis) setActive(vis.target.id);
    }, { rootMargin: "-35% 0px -55% 0px", threshold: [0, 0.25, 0.5] });
    sections.forEach((s) => { const el = document.getElementById(s.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, [sections]);
  const idx = Math.max(0, sections.findIndex((s) => s.id === active));
  return (
    <nav aria-label="Page sections" className="fixed left-6 top-1/2 z-40 hidden -translate-y-1/2 xl:block">
      <div className="relative flex flex-col gap-7 py-2">
        <div className="absolute left-[7px] top-0 h-full w-[2px] rounded-full bg-fog/10" />
        <motion.div className="absolute left-[7px] top-0 h-full w-[2px] origin-top rounded-full bg-fog" style={{ scaleY: draw }} />
        {sections.map((s, i) => {
          const on = i <= idx, current = i === idx;
          return (
            <a key={s.id} href={`#${s.id}`} className="group relative flex items-center gap-3" aria-current={current ? "true" : undefined}>
              <motion.span className="relative z-10 block h-4 w-4 rounded-full border-2 border-fog"
                animate={{ backgroundColor: current ? "#ffc21a" : on ? "#16150f" : "#f4efe6", scale: current ? 1.25 : 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 22 }} />
              <motion.span className="whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.18em]"
                animate={{ opacity: current ? 1 : 0, x: current ? 0 : -6, backgroundColor: current ? "rgba(255,194,26,1)" : "rgba(255,194,26,0)" }}
                transition={{ duration: 0.3 }}>
                {s.label}
              </motion.span>
              <span className="pointer-events-none absolute left-7 whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.18em] text-mist opacity-0 transition-opacity group-hover:opacity-100">
                {current ? "" : s.label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
