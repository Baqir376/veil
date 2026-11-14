// Interaction primitives: cursor light, magnetic buttons, 3D tilt cards, spotlight borders,
// decrypt/scramble text, count-up numbers, scroll reveals and the intro loader.
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { motion, useMotionValue, useSpring, useTransform, useInView, animate, AnimatePresence, useReducedMotion } from "motion/react";

const finePointer = () => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches;

/** A soft light that follows the mouse across the whole page, plus a springy ring cursor. */
export function CursorLight() {
  const x = useMotionValue(-400), y = useMotionValue(-400);
  const rx = useSpring(x, { stiffness: 500, damping: 40, mass: 0.4 });
  const ry = useSpring(y, { stiffness: 500, damping: 40, mass: 0.4 });
  const lx = useSpring(x, { stiffness: 80, damping: 20 });
  const ly = useSpring(y, { stiffness: 80, damping: 20 });
  const [hover, setHover] = useState(false);
  const [down, setDown] = useState(false);
  const [enabled] = useState(finePointer);

  useEffect(() => {
    if (!enabled) return;
    const move = (e: PointerEvent) => {
      x.set(e.clientX); y.set(e.clientY);
      const t = e.target as HTMLElement | null;
      setHover(!!t?.closest("a,button,[data-cursor='hover']"));
    };
    const d = () => setDown(true), u = () => setDown(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerdown", d);
    window.addEventListener("pointerup", u);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerdown", d); window.removeEventListener("pointerup", u); };
  }, [enabled, x, y]);

  if (!enabled) return null;
  return (
    <>
      <motion.div aria-hidden className="pointer-events-none fixed left-0 top-0 z-0 h-[640px] w-[640px] rounded-full"
        style={{ x: lx, y: ly, translateX: "-50%", translateY: "-50%",
          background: "radial-gradient(circle, rgb(124 108 255 / .16), rgb(45 212 191 / .07) 35%, transparent 65%)" }} />
      <motion.div aria-hidden className="pointer-events-none fixed left-0 top-0 z-[70] rounded-full border border-white/60 mix-blend-difference"
        style={{ x: rx, y: ry, translateX: "-50%", translateY: "-50%" }}
        animate={{ width: hover ? 44 : 18, height: hover ? 44 : 18, backgroundColor: down ? "rgba(255,255,255,.9)" : "rgba(255,255,255,0)" }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }} />
    </>
  );
}

/** Pulls toward the cursor while hovered (Apple-style magnetic CTA). */
export function Magnetic({ children, strength = 0.35, className = "" }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(0, { stiffness: 260, damping: 18 });
  const y = useSpring(0, { stiffness: 260, damping: 18 });
  return (
    <motion.div ref={ref} className={`inline-block ${className}`} style={{ x, y }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

/** Card that tilts in 3D toward the cursor, with a moving glare and a spotlight border. */
export function TiltCard({ children, className = "", max = 10, glow = "#7c6cff" }: { children: ReactNode; className?: string; max?: number; glow?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5), py = useMotionValue(0.5);
  const rx = useSpring(useTransform(py, [0, 1], [max, -max]), { stiffness: 220, damping: 20 });
  const ry = useSpring(useTransform(px, [0, 1], [-max, max]), { stiffness: 220, damping: 20 });
  const glare = useTransform([px, py], ([a, b]: number[]) =>
    `radial-gradient(420px circle at ${a * 100}% ${b * 100}%, ${glow}33, transparent 45%)`);
  const [hot, setHot] = useState(false);
  return (
    <div style={{ perspective: 1000 }} className={className}>
      <motion.div ref={ref} data-cursor="hover"
        className="glass relative h-full overflow-hidden rounded-3xl"
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => {
          const r = ref.current!.getBoundingClientRect();
          px.set((e.clientX - r.left) / r.width);
          py.set((e.clientY - r.top) / r.height);
        }}
        onPointerEnter={() => setHot(true)}
        onPointerLeave={() => { setHot(false); px.set(0.5); py.set(0.5); }}>
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-300"
          style={{ opacity: hot ? 1 : 0, background: glare }} />
        <div className="relative h-full" style={{ transform: "translateZ(30px)" }}>{children}</div>
      </motion.div>
    </div>
  );
}

const GLYPHS = "▓▒░█<>/\\[]{}=+*#%$@&01";

/** Text that decrypts from noise into its final value (or encrypts into a chip). */
export function Scramble({ text, play = true, duration = 900, className = "", style }: { text: string; play?: boolean; duration?: number; className?: string; style?: CSSProperties }) {
  const [out, setOut] = useState(play ? "" : text);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!play || reduce) { setOut(text); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const settled = Math.floor(p * text.length);
      let s = text.slice(0, settled);
      for (let i = settled; i < text.length; i++) s += text[i] === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      setOut(s);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, play, duration, reduce]);
  return <span className={className} style={style}>{out}</span>;
}

/** Number that counts up when scrolled into view. */
export function CountUp({ to, decimals = 0, suffix = "", prefix = "", className = "" }: { to: number; decimals?: number; suffix?: string; prefix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const c = animate(0, to, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: setV });
    return () => c.stop();
  }, [inView, to]);
  return <span ref={ref} className={className}>{prefix}{v.toFixed(decimals)}{suffix}</span>;
}

/** Fade-and-rise when scrolled into view; children stagger. */
export function Reveal({ children, delay = 0, className = "", y = 24 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y, filter: "blur(8px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }} viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </motion.div>
  );
}

/** Word-by-word headline reveal. */
export function WordsReveal({ text, className = "", delay = 0 }: { text: string; className?: string; delay?: number }) {
  return (
    <span className={className}>
      {text.split(" ").map((w, i) => (
        <motion.span key={i} className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: "0.6em", filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: delay + i * 0.07, ease: [0.16, 1, 0.3, 1] }}>
          {w + " "}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * Headline whose letters swell in weight as the cursor approaches (Geist is a variable font).
 * Words still reveal one by one on load. Updates go straight to the DOM — no React re-render per move.
 */
export function ProximityText({ text, delay = 0, className = "", base = 560, max = 820, radius = 170 }:
  { text: string; delay?: number; className?: string; base?: number; max?: number; radius?: number }) {
  const letters = useRef<HTMLSpanElement[]>([]);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce || !finePointer()) return;
    let centers: { x: number; y: number }[] = [];
    let raf = 0;
    const measure = () => { centers = letters.current.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); };
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!centers.length) measure();
        letters.current.forEach((el, i) => {
          const c = centers[i]; if (!c) return;
          const d = Math.hypot(e.clientX - c.x, e.clientY - c.y);
          const t = Math.max(0, 1 - d / radius);
          el.style.fontVariationSettings = `"wght" ${Math.round(base + (max - base) * t * t)}`;
        });
      });
    };
    const reset = () => { centers = []; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("scroll", reset, { passive: true });
    window.addEventListener("resize", reset);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onMove); window.removeEventListener("scroll", reset); window.removeEventListener("resize", reset); };
  }, [reduce, base, max, radius]);

  let k = 0;
  return (
    <span className={className} style={{ fontVariationSettings: `"wght" ${base}` }}>
      {text.split(" ").map((w, wi) => (
        <motion.span key={wi} className="inline-block whitespace-pre"
          initial={{ opacity: 0, y: "0.6em", filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.8, delay: delay + wi * 0.07, ease: [0.16, 1, 0.3, 1] }}>
          {[...w].map((ch) => {
            const i = k++;
            return <span key={i} ref={(el) => { if (el) letters.current[i] = el; }} className="inline-block transition-[font-variation-settings] duration-200"
              style={{ fontVariationSettings: `"wght" ${base}` }}>{ch}</span>;
          })}
          {" "}
        </motion.span>
      ))}
    </span>
  );
}

/** The Veil mark: two flowing bands. `draw` animates the stroke in. */
export function VeilMark({ size = 32, draw = false }: { size?: number; draw?: boolean }) {
  const t = { duration: 1.1, ease: [0.65, 0, 0.35, 1] as const };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <defs>
        <linearGradient id="vg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cff" /><stop offset=".55" stopColor="#2dd4bf" /><stop offset="1" stopColor="#60a5fa" />
        </linearGradient>
      </defs>
      <motion.path d="M10 22c7 0 12 5 22 5s15-5 22-5" stroke="url(#vg)" strokeWidth="6" strokeLinecap="round"
        initial={draw ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 1 }} transition={t} />
      <motion.path d="M10 38c7 0 12 5 22 5s15-5 22-5" stroke="url(#vg)" strokeWidth="6" strokeLinecap="round" opacity=".55"
        initial={draw ? { pathLength: 0, opacity: 0 } : false} animate={{ pathLength: 1, opacity: 0.55 }} transition={{ ...t, delay: 0.18 }} />
    </svg>
  );
}

/** Cinematic intro: the mark draws itself, the word decrypts, then the curtain lifts. Shown once per session. */
export function IntroLoader() {
  const reduce = useReducedMotion();
  const [show, setShow] = useState(() => {
    try { return !sessionStorage.getItem("veil-intro"); } catch { return true; }
  });
  useEffect(() => {
    if (!show) return;
    if (reduce) { setShow(false); return; }
    const t = setTimeout(() => { setShow(false); try { sessionStorage.setItem("veil-intro", "1"); } catch { /* ignore */ } }, 1700);
    return () => clearTimeout(t);
  }, [show, reduce]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="fixed inset-0 z-[80] grid place-items-center bg-ink"
          exit={{ clipPath: "inset(0 0 100% 0)" }} transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
          initial={{ clipPath: "inset(0 0 0% 0)" }}>
          <div className="flex flex-col items-center gap-5">
            <VeilMark size={72} draw />
            <motion.div className="font-mono text-sm tracking-[0.5em] text-mist" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
              <Scramble text="VEIL" duration={900} />
            </motion.div>
            <motion.div className="h-px w-40 origin-left bg-gradient-to-r from-veil via-device to-cloud"
              initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 1.3, ease: [0.65, 0, 0.35, 1] }} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
