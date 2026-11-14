// Spatial hero: three layered windows in real CSS 3D (visionOS-style depth), tilting toward the mouse.
//   front  — your document, being read and redacted on device (auto-loops, no scrolling needed)
//   middle — exactly what the cloud receives (cobalt tags)
//   back   — the privacy receipt
// Floating tags sit at different depths, so parallax makes the stack feel physical. No WebGL.
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useTransform, AnimatePresence } from "motion/react";
import { Scramble } from "./effects";

type Seg = string | { real: string; tag: string };
const DOC: Seg[] = [
  "Hi CA ", { real: "Priya", tag: "person 1" }, ",\nThe notice for ", { real: "Rohan Mehta", tag: "person 2" }, ", PAN ",
  { real: "BQRPM4821K", tag: "pan 1" }, ", says income of Rs ", { real: "18,45,000", tag: "amount 1" },
  " doesn't match Form 26AS.\nCall me on ", { real: "98220 14567", tag: "phone 1" }, ".",
];
const N = DOC.filter((s) => typeof s !== "string").length;

export function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0), py = useMotionValue(0);
  const rx = useSpring(useTransform(py, [-0.5, 0.5], [14, -6]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(px, [-0.5, 0.5], [-26, -4]), { stiffness: 120, damping: 18 });

  // phase: 0 plain → 1 Nano highlights one by one → 2 redacted → back to 0
  const [phase, setPhase] = useState(0);
  const [lit, setLit] = useState(0);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const seq = () => {
      setPhase(0); setLit(0);
      t = setTimeout(() => {
        setPhase(1);
        let n = 0;
        const step = () => { n++; setLit(n); if (n < N) t = setTimeout(step, 330); else t = setTimeout(() => { setPhase(2); t = setTimeout(seq, 3600); }, 650); };
        step();
      }, 1300);
    };
    seq();
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const m = (e: PointerEvent) => { px.set(e.clientX / window.innerWidth - 0.5); py.set(e.clientY / window.innerHeight - 0.5); };
    window.addEventListener("pointermove", m);
    return () => window.removeEventListener("pointermove", m);
  }, [px, py]);

  let k = 0;
  return (
    <div ref={ref} className="relative h-[460px] w-full md:h-[560px]" style={{ perspective: 1600 }}>
      <motion.div className="absolute inset-0" style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        animate={{ y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}>

        {/* back: receipt */}
        <div className="spatial absolute right-[2%] top-[4%] w-[52%] rounded-2xl p-4 font-mono text-[11px] text-mist"
          style={{ transform: "translateZ(-170px) translateX(40px)" }}>
          <p className="border-b border-dashed border-fog/30 pb-2 text-[10px] tracking-[0.2em] text-fog">PRIVACY RECEIPT</p>
          <p className="mt-2"><b className="text-fog">5</b> values stayed on this device</p>
          <p>payload sha256 · 4f51 6973 1a28…</p>
          <p>leak check · <span className="text-device">passed</span></p>
        </div>

        {/* middle: what the cloud sees */}
        <div className="spatial absolute right-[6%] top-[16%] w-[66%] rounded-2xl p-5 font-mono text-[12px] leading-6 text-fog/80"
          style={{ transform: "translateZ(-80px)", background: "linear-gradient(180deg, rgb(238 241 255 / .85), rgb(238 241 255 / .6))" }}>
          <p className="mb-2 font-sans text-[11px] font-medium text-cloud">☁ what Gemini in the cloud receives</p>
          {DOC.map((s, i) => typeof s === "string" ? <span key={i}>{s}</span> : <span key={i} className="vchip cloud mx-0.5">{s.tag}</span>)}
        </div>

        {/* front: your document, redacted live */}
        <div className="spatial absolute left-[2%] top-[34%] w-[78%] rounded-2xl p-6"
          style={{ transform: "translateZ(40px)" }}>
          <div className="mb-3 flex items-center justify-between text-[11px]">
            <span className="font-mono text-mist">client-email.txt</span>
            <AnimatePresence mode="wait">
              <motion.span key={phase} className={`rounded-full px-2 py-0.5 font-medium ${phase === 2 ? "bg-fog text-marker" : "bg-marker text-fog"}`}
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
                {phase === 0 ? "● on your device" : phase === 1 ? "Gemini Nano reading…" : "✓ redacted on device"}
              </motion.span>
            </AnimatePresence>
          </div>
          <p className="relative whitespace-pre-wrap font-mono text-[13px] leading-7 text-fog">
            {DOC.map((s, i) => {
              if (typeof s === "string") return <span key={i}>{s}</span>;
              const n = ++k;
              if (phase === 2) return (
                <motion.span key={`r${i}`} className="vchip mx-0.5" initial={{ scaleX: 0.2, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 380, damping: 26, delay: n * 0.06 }} style={{ originX: 0 }}>
                  <Scramble text={s.tag} duration={420} />
                </motion.span>
              );
              const on = phase === 1 && n <= lit;
              return (
                <motion.span key={`h${i}`} className="rounded-[3px] px-0.5"
                  animate={{ backgroundColor: on ? "rgba(255,194,26,.85)" : "rgba(255,194,26,0)" }} transition={{ duration: 0.25 }}>{s.real}</motion.span>
              );
            })}
            {phase === 1 && (
              <motion.span aria-hidden className="pointer-events-none absolute -inset-y-1 w-16"
                style={{ background: "linear-gradient(90deg, transparent, rgb(255 194 26 / .45), transparent)", mixBlendMode: "multiply" }}
                initial={{ left: "-15%" }} animate={{ left: "105%" }} transition={{ duration: N * 0.33 + 0.4, ease: "linear" }} />
            )}
          </p>
        </div>

        {/* floating tags at different depths */}
        {[
          { t: "aadhaar 1", c: "", s: { left: "12%", top: "4%", z: 120 } },
          { t: "iban 1", c: "cloud", s: { left: "84%", top: "70%", z: 160 } },
          { t: "email 1", c: "", s: { left: "70%", top: "-2%", z: 90 } },
          { t: "place 1", c: "cloud", s: { left: "6%", top: "86%", z: 70 } },
        ].map((f, i) => (
          <motion.span key={f.t} className={`vchip ${f.c} absolute shadow-[0_18px_30px_-12px_rgb(22_21_15/.45)]`}
            style={{ left: f.s.left, top: f.s.top, z: f.s.z }}
            animate={{ y: [0, -12, 0], rotate: [i % 2 ? -4 : 4, i % 2 ? 2 : -2, i % 2 ? -4 : 4] }}
            transition={{ duration: 5 + i, repeat: Infinity, ease: "easeInOut" }}>{f.t}</motion.span>
        ))}
      </motion.div>
    </div>
  );
}
