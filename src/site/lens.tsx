// Privacy Lens: move the cursor over a real document; inside the glass circle you see it the way the
// cloud does — names and IDs replaced by tags. Each private value renders BOTH versions stacked in the
// same grid cell, so the two layers line up exactly and only the lens decides which one you see.
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useMotionTemplate, animate } from "motion/react";

type Seg = string | { real: string; tag: string };

const DOC: Seg[] = [
  "Hi CA ", { real: "Priya", tag: "person 1" }, " ji,\n\nPlease see the notice for ", { real: "Rohan Mehta", tag: "person 2" },
  ", PAN ", { real: "BQRPM4821K", tag: "pan 1" }, ", Aadhaar ", { real: "4821 7733 9045", tag: "aadhaar 1" },
  ".\nIncome of Rs ", { real: "18,45,000", tag: "amount 1 · ₹15–20L" }, " reported in the ITR does not match Form 26AS for AY 2026-27.\n",
  "Interest from ", { real: "HDFC Bank", tag: "org 1" }, " a/c ", { real: "50100234567812", tag: "bank account 1" },
  " appears unreported.\n\nMy wife ", { real: "Sneha", tag: "person 3" }, " handles the FD. We live in ",
  { real: "Kothrud, Pune", tag: "place 1" }, ".\nCall me on ", { real: "98220 14567", tag: "phone 1" }, ".",
];

const R = 110; // lens radius in px

export function PrivacyLens() {
  const box = useRef<HTMLDivElement>(null);
  const x = useMotionValue(-999), y = useMotionValue(-999);
  const sx = useSpring(x, { stiffness: 350, damping: 32 });
  const sy = useSpring(y, { stiffness: 350, damping: 32 });
  const clip = useMotionTemplate`circle(${R}px at ${sx}px ${sy}px)`;
  const [active, setActive] = useState(false);

  // No mouse (touch, or before the first move): the lens drifts across the document on its own.
  useEffect(() => {
    if (active || !box.current) return;
    const w = box.current.clientWidth, h = box.current.clientHeight;
    const ax = animate(x, [w * 0.2, w * 0.75, w * 0.45, w * 0.2], { duration: 9, repeat: Infinity, ease: "easeInOut" });
    const ay = animate(y, [h * 0.3, h * 0.45, h * 0.75, h * 0.3], { duration: 9, repeat: Infinity, ease: "easeInOut" });
    return () => { ax.stop(); ay.stop(); };
  }, [active, x, y]);

  const render = (cloud: boolean) => DOC.map((s, i) =>
    typeof s === "string" ? <span key={i}>{s}</span> : (
      <span key={i} className="inline-grid align-baseline">
        <span className={`col-start-1 row-start-1 ${cloud ? "invisible" : "rounded bg-amber/10 px-0.5 text-fog"}`}>{s.real}</span>
        <span className={`col-start-1 row-start-1 ${cloud ? "vchip cloud justify-center" : "invisible"}`}>{s.tag}</span>
      </span>
    ));

  return (
    <div className="relative">
      <div ref={box} data-cursor="hover"
        className="glass relative cursor-none overflow-hidden rounded-3xl p-6 font-mono text-[13.5px] leading-8 sm:p-8"
        onPointerMove={(e) => {
          const r = box.current!.getBoundingClientRect();
          x.set(e.clientX - r.left); y.set(e.clientY - r.top);
          if (!active) setActive(true);
        }}
        onPointerLeave={() => setActive(false)}>
        <div className="mb-4 flex items-center justify-between font-sans text-xs text-mist">
          <span>client-email.txt · <span className="text-device">on your device</span></span>
          <span className="hidden sm:inline">move your cursor over the text</span>
        </div>
        <p className="whitespace-pre-wrap text-fog/85">{render(false)}</p>
        {/* The cloud's view, revealed only inside the lens */}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 p-6 sm:p-8" style={{ clipPath: clip, WebkitClipPath: clip }}>
          <div className="absolute inset-0 bg-[#0b1324]/95" />
          <div className="relative">
            <div className="mb-4 flex items-center justify-between font-sans text-xs text-cloud"><span>what the cloud sees</span></div>
            <p className="whitespace-pre-wrap text-fog/85">{render(true)}</p>
          </div>
        </motion.div>
        {/* Lens rim */}
        <motion.div aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-full"
          style={{ x: sx, y: sy, width: R * 2, height: R * 2, translateX: "-50%", translateY: "-50%",
            boxShadow: "inset 0 0 0 1.5px rgb(255 255 255 / .55), inset 0 0 30px rgb(96 165 250 / .35), 0 0 40px rgb(96 165 250 / .25), 0 20px 60px -10px rgb(0 0 0 / .6)",
            background: "radial-gradient(circle at 30% 25%, rgb(255 255 255 / .18), transparent 40%)" }} />
        <motion.div aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-full bg-cloud/90 px-2 py-0.5 font-sans text-[10px] font-medium text-ink"
          style={{ x: sx, y: sy, translateX: "-50%", translateY: R + 6 }}>cloud view</motion.div>
      </div>
    </div>
  );
}
