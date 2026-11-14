// "Beat Veil" — the visitor plays the role of Veil. The cursor becomes a highlighter; drag across words
// to redact them. Then Veil's real engine (the same code that runs in Studio) takes its turn, and the
// scoreboard shows what each of you caught, what you missed, and how fast Veil was.
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { runVeil, type Span } from "../engine";
import { Scramble } from "./effects";
import { GAME_MESSAGE } from "./gameMessage";

const MESSAGE = GAME_MESSAGE;

interface Word { i: number; text: string; start: number; end: number; ws: boolean }
type Phase = "play" | "veil" | "done";

// Highlighter-nib cursor (SVG data URI), hotspot at the tip.
const MARKER_CURSOR = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'><g transform='rotate(35 16 16)'><rect x='11' y='3' width='10' height='18' rx='2' fill='%2316150f'/><path d='M11 21h10l-2 6h-6z' fill='%23ffc21a' stroke='%2316150f' stroke-width='1.5'/></g></svg>") 4 28, crosshair`;

export function BeatVeil() {
  const words = useMemo<Word[]>(() => {
    const out: Word[] = [];
    let i = 0;
    for (const m of MESSAGE.matchAll(/\S+|\s+/g)) out.push({ i: i++, text: m[0], start: m.index!, end: m.index! + m[0].length, ws: /^\s+$/.test(m[0]) });
    return out;
  }, []);
  const [spans, setSpans] = useState<Span[]>([]);
  const [ms, setMs] = useState(0);
  const [mine, setMine] = useState<Set<number>>(new Set());
  const [phase, setPhase] = useState<Phase>("play");
  const painting = useRef<null | "add" | "remove">(null);

  // Veil's answer key comes from the real engine (rules + label-based names; no model needed here).
  useEffect(() => {
    const t0 = performance.now();
    runVeil(MESSAGE, { regions: ["IN"], detector: null }).then((r) => { setSpans(r.spans); setMs(performance.now() - t0); });
  }, []);

  const secretOf = (w: Word) => spans.findIndex((s) => w.start < s.end && w.end > s.start && !w.ws);
  const secrets = spans.length;
  const caughtByYou = spans.filter((s) => words.filter((w) => !w.ws && w.start < s.end && w.end > s.start).every((w) => mine.has(w.i))).length;
  const falseAlarms = [...mine].filter((i) => secretOf(words[i]) < 0).length;

  useEffect(() => {
    const up = () => { painting.current = null; };
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const touch = (w: Word, mode: "add" | "remove") => {
    if (w.ws || phase !== "play") return;
    setMine((prev) => { const n = new Set(prev); mode === "add" ? n.add(w.i) : n.delete(w.i); return n; });
  };

  const reveal = () => { setPhase("veil"); setTimeout(() => setPhase("done"), 1400); };
  const reset = () => { setMine(new Set()); setPhase("play"); };

  return (
    <section id="play" className="relative mx-auto max-w-6xl px-4 py-28 md:px-8">
      <div className="grid items-start gap-12 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Your turn</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">
            Can you <span className="font-serif font-normal italic text-gradient">beat Veil</span>?
          </h2>
          <p className="mt-4 max-w-md text-mist">Your cursor is a highlighter. <b className="text-fog">Drag across every secret</b> in the message —
            names, IDs, numbers. Then let Veil take its turn with the real engine.</p>

          <div className="mt-8 grid grid-cols-2 gap-3">
            <Score label="You" value={phase === "play" ? mine.size ? `${caughtByYou}/${secrets}` : "—" : `${caughtByYou}/${secrets}`}
              sub={phase === "play" ? `${mine.size} word${mine.size === 1 ? "" : "s"} redacted` : `${falseAlarms} false alarm${falseAlarms === 1 ? "" : "s"}`} tone="ink" />
            <Score label="Veil" value={phase === "done" ? `${secrets}/${secrets}` : "?"} sub={phase === "done" ? `in ${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms, on device` : "waiting for you…"} tone="marker" />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {phase === "play" ? (
              <button onClick={reveal} className="rounded-full bg-fog px-6 py-3 font-medium text-ink shadow-[4px_4px_0_#ffc21a] transition-transform hover:-translate-y-0.5 active:translate-y-0.5">
                Let Veil try →
              </button>
            ) : (
              <button onClick={reset} className="rounded-full border-[1.5px] border-fog px-6 py-3 font-medium transition-colors hover:bg-marker">Play again</button>
            )}
            {phase === "play" && mine.size > 0 && <button onClick={() => setMine(new Set())} className="px-3 text-sm text-mist underline underline-offset-4">clear</button>}
          </div>
          <AnimatePresence>
            {phase === "done" && (
              <motion.p className="mt-5 max-w-md text-sm text-mist" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {caughtByYou === secrets ? "Perfect — you'd make a great privacy filter. Veil does this on every message, before anything leaves your device."
                  : `You missed ${secrets - caughtByYou}. Highlighted in red. Now imagine doing this for every message you paste into an AI.`}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        <div className="relative select-none">
          <div className="glass relative rounded-3xl p-6 sm:p-8" style={{ cursor: phase === "play" ? MARKER_CURSOR : "default", touchAction: "none" }}
            onPointerDown={(e) => {
              const t = (e.target as HTMLElement).closest<HTMLElement>("[data-w]");
              if (!t) return;
              const w = words[+t.dataset.w!];
              painting.current = mine.has(w.i) ? "remove" : "add";
              touch(w, painting.current);
            }}>
            <div className="mb-4 flex items-center justify-between font-mono text-[11px] text-mist">
              <span>refund-request.txt</span>
              <span className={phase === "play" ? "text-fog" : "text-device"}>{phase === "play" ? "✎ drag to redact" : phase === "veil" ? "Veil is reading…" : "✓ Veil's turn done"}</span>
            </div>
            <p className="whitespace-pre-wrap font-mono text-[14px] leading-9 text-fog">
              {words.map((w) => {
                if (w.ws) return <span key={w.i}>{w.text}</span>;
                const sec = secretOf(w);
                const redacted = mine.has(w.i);
                const showVeil = phase !== "play" && sec >= 0;
                const missed = phase === "done" && sec >= 0 && !redacted;
                const wrong = phase === "done" && sec < 0 && redacted;
                return (
                  <span key={w.i} data-w={w.i} className="relative inline-block"
                    onPointerEnter={() => painting.current && touch(w, painting.current)}>
                    <span className={redacted ? "invisible" : missed ? "rounded-[3px] bg-coral/20 text-coral" : ""}>{w.text}</span>
                    {redacted && (
                      <motion.span aria-hidden className={`absolute inset-x-[-2px] inset-y-[5px] rounded-[3px] ${wrong ? "bg-mist/60" : "bg-fog"}`}
                        initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }} />
                    )}
                    {showVeil && (
                      <motion.span aria-hidden className="pointer-events-none absolute inset-x-[-3px] inset-y-[3px] rounded-[4px] border-2 border-marker"
                        initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: (sec % 10) * 0.12, type: "spring", stiffness: 300, damping: 20 }} />
                    )}
                  </span>
                );
              })}
            </p>
            {/* Veil's tags, shown after its turn */}
            <AnimatePresence>
              {phase === "done" && (
                <motion.div className="mt-5 flex flex-wrap gap-2 border-t border-dashed border-fog/25 pt-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span className="text-xs text-mist">Veil sends the cloud:</span>
                  {spans.map((s, i) => (
                    <motion.span key={i} className="vchip cloud" initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.07 }}>
                      <Scramble text={`${(s.kind ?? s.category).toLowerCase().replace(/_/g, " ")} ${i + 1}`} duration={500} />
                    </motion.span>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            {phase === "veil" && (
              <motion.div aria-hidden className="pointer-events-none absolute inset-y-6 w-24 rounded-xl"
                style={{ background: "linear-gradient(90deg, transparent, rgb(255 194 26 / .5), transparent)", mixBlendMode: "multiply" }}
                initial={{ left: "-10%" }} animate={{ left: "100%" }} transition={{ duration: 1.2, ease: "easeInOut" }} />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Score({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: "ink" | "marker" }) {
  return (
    <div className={`rounded-2xl p-4 ${tone === "marker" ? "bg-marker" : "glass-soft"}`}>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-fog/70">{label}</p>
      <AnimatePresence mode="wait">
        <motion.p key={value} className="mt-1 text-4xl font-semibold tracking-tight" initial={{ y: 12, opacity: 0, filter: "blur(6px)" }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)" }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.35 }}>{value}</motion.p>
      </AnimatePresence>
      <p className="mt-1 text-xs text-fog/70">{sub}</p>
    </div>
  );
}
