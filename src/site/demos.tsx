// Animated explainers: the live "veil" loop and the scroll-driven pipeline story.
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Scramble } from "./effects";

type Seg = string | { real: string; tag: string; hint?: string };

const DOC: Seg[] = [
  "Notice to ", { real: "Rohan Mehta", tag: "person 1" }, ", PAN ", { real: "BQRPM4821K", tag: "pan 1" },
  ". Income of Rs ", { real: "18,45,000", tag: "amount 1", hint: "₹15–20L" }, " does not match Form 26AS. Call ",
  { real: "98220 14567", tag: "phone 1" }, ".",
];
const ANSWER: Seg[] = [
  "Dear ", { real: "Rohan Mehta", tag: "person 1" }, ", this is a routine 143(1)(a) mismatch. Declare Rs ",
  { real: "18,45,000", tag: "amount 1" }, " correctly and file a revised return.",
];

/** One full Veil round-trip, on loop: scan → mask → send tags → answer → restore locally. */
export function VeilLoop() {
  const [phase, setPhase] = useState(0); // 0 plain, 1 scanning, 2 masked+sending, 3 answer(tags), 4 restored
  const [masked, setMasked] = useState(0);
  useEffect(() => {
    const steps: [number, number][] = [[0, 1300], [1, 2400], [2, 1800], [3, 1500], [4, 2600]];
    let i = 0, t: ReturnType<typeof setTimeout>;
    const run = () => { setPhase(steps[i][0]); t = setTimeout(() => { i = (i + 1) % steps.length; run(); }, steps[i][1]); };
    run();
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (phase === 0) { setMasked(0); return; }
    if (phase !== 1) return;
    const total = DOC.filter((s) => typeof s !== "string").length;
    let n = 0;
    const iv = setInterval(() => { n++; setMasked(n); if (n >= total) clearInterval(iv); }, 480);
    return () => clearInterval(iv);
  }, [phase]);

  let idx = 0;
  const label = ["Your text, on your device", "Gemini Nano is reading — on device", "Only tags leave your device", "The cloud answers with tags", "Real values restored — locally"][phase];
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-2 text-mist">
          <span className={`h-2 w-2 rounded-full ${phase >= 2 && phase <= 3 ? "bg-cloud" : "bg-device"} shadow-[0_0_12px_currentColor]`} />
          <AnimatePresence mode="wait">
            <motion.span key={label} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>{label}</motion.span>
          </AnimatePresence>
        </span>
        <span className="font-mono text-dim">veil://live</span>
      </div>

      <div className="relative min-h-[132px] font-mono text-[13.5px] leading-7 text-fog/90">
        {phase <= 2 ? (
          <p>
            {DOC.map((s, i) => {
              if (typeof s === "string") return <span key={i}>{s}</span>;
              const n = ++idx;
              const on = phase >= 2 || n <= masked;
              return on ? (
                <motion.span key={i} className="vchip mx-0.5" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 22 }}>
                  <Scramble text={s.tag} duration={420} />{s.hint && <em className="not-italic opacity-60">· {s.hint}</em>}
                </motion.span>
              ) : <span key={i} className="rounded bg-amber/15 px-0.5 text-amber">{s.real}</span>;
            })}
          </p>
        ) : (
          <p>
            {ANSWER.map((s, i) => typeof s === "string" ? <span key={i}>{s}</span> : phase === 3
              ? <span key={i} className="vchip cloud mx-0.5">{s.tag}</span>
              : <motion.span key={i} className="mx-0.5 rounded px-1 text-device" initial={{ backgroundColor: "rgba(255,194,26,.35)" }}
                  animate={{ backgroundColor: "rgba(255,194,26,0)" }} transition={{ duration: 1.6 }}><Scramble text={s.real} duration={600} /></motion.span>)}
          </p>
        )}
        {phase === 1 && (
          <motion.div aria-hidden className="pointer-events-none absolute -inset-y-2 w-24"
            style={{ background: "linear-gradient(90deg, transparent, rgb(255 194 26 / .35), transparent)", filter: "blur(4px)" }}
            initial={{ left: "-20%" }} animate={{ left: "110%" }} transition={{ duration: 2.2, ease: "easeInOut" }} />
        )}
      </div>

      {/* Device ↔ cloud channel */}
      <div className="mt-5 flex items-center gap-3 text-[11px] text-mist">
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-device" />device</span>
        <div className="relative h-px flex-1 bg-gradient-to-r from-device/60 to-cloud/60">
          <AnimatePresence>
            {(phase === 2 || phase === 3) && [0, 1, 2].map((k) => (
              <motion.span key={`${phase}-${k}`} className={`absolute -top-[5px] h-[11px] w-6 rounded-full ${phase === 2 ? "bg-device" : "bg-cloud"} shadow-[0_0_14px_currentColor]`}
                initial={{ left: phase === 2 ? "0%" : "92%", opacity: 0 }} animate={{ left: phase === 2 ? "92%" : "0%", opacity: [0, 1, 1, 0] }}
                transition={{ duration: 1.3, delay: k * 0.22, ease: "easeInOut" }} />
            ))}
          </AnimatePresence>
        </div>
        <span className="inline-flex items-center gap-1.5">cloud<span className="h-1.5 w-1.5 rounded-full bg-cloud" /></span>
      </div>
    </div>
  );
}

const STEPS = [
  { k: "01", title: "Rules catch every ID", body: "In 2 ms, region rule packs find PAN, Aadhaar, IBAN, cards, keys — even hidden in Cyrillic look-alikes, full-width digits or “[at] gmail [dot] com”.", tint: "#8a5d00" },
  { k: "02", title: "Gemini Nano reads like a human", body: "On your device, Gemini Nano finds names, places and the quiet giveaways regex can't: “the only female cardiologist in Ratnagiri”.", tint: "#0f7b5f" },
  { k: "03", title: "Guess Who attacks it", body: "A second on-device pass plays detective. Whatever it can still infer about the person — location, job, family — gets masked too.", tint: "#c63a1f" },
  { k: "04", title: "Only tags reach the cloud", body: "Gemini in the cloud does the thinking with [person 1] and [amount 1 · ₹15–20L]. Your real values come back — on your device only.", tint: "#2a44e8" },
];

/** The four stages. You're in control: hover (or tap / focus) a step to see it — no timers. */
export function PipelineStory() {
  const [active, setActive] = useState(0);
  return (
    <div className="relative py-28">
      <div className="flex items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 md:grid-cols-2 md:px-8">
          <div className="flex flex-col justify-center gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">How it works</p>
            <h2 className="text-4xl font-semibold tracking-tight md:text-5xl">Four checks.<br /><span className="font-serif italic text-device">One</span> round-trip.</h2>
            <ol className="mt-6 flex flex-col gap-2">
              {STEPS.map((s, i) => (
                <li key={s.k} className={`relative cursor-pointer overflow-hidden rounded-2xl transition-all ${i === active ? "glass-soft" : "hover:bg-black/[.03]"}`}
                  onPointerEnter={() => setActive(i)}>
                  {i === active && <motion.span layoutId="step-bar" className="absolute left-0 top-0 h-full w-[3px]" style={{ background: s.tint }} />}
                  <button type="button" aria-pressed={i === active} onClick={() => setActive(i)} onFocus={() => setActive(i)}
                    className="flex w-full gap-4 rounded-2xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-fog">
                    <span className="font-mono text-sm" style={{ color: i === active ? s.tint : "#6b665c" }}>{s.k}</span>
                    <span className="block">
                      <span className={`block font-medium ${i === active ? "text-fog" : "text-mist"}`}>{s.title}</span>
                      <AnimatePresence initial={false}>
                        {i === active && (
                          <motion.span className="mt-1 block overflow-hidden text-sm leading-relaxed text-mist" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                            {s.body}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="relative flex items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div key={active} className="w-full" initial={{ opacity: 0, y: 30, rotateX: 12 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: -30, rotateX: -12 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }} style={{ perspective: 900 }}>
                <StepVisual i={active} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function Doc({ children }: { children: React.ReactNode }) {
  return <div className="glass rounded-3xl p-6 font-mono text-[13.5px] leading-8 text-fog/90">{children}</div>;
}
const HL = ({ c, children, d = 0 }: { c: string; children: React.ReactNode; d?: number }) => (
  <motion.span className="rounded px-1" initial={{ backgroundColor: "rgba(0,0,0,0)" }} animate={{ backgroundColor: c }} transition={{ delay: d, duration: 0.4 }}>{children}</motion.span>
);

function StepVisual({ i }: { i: number }) {
  if (i === 0) return (
    <Doc>
      <p>PAN: <HL c="#ffc21a66" d={0.1}>ВQRPМ4821К</HL> <span className="text-dim">← Cyrillic look-alikes</span></p>
      <p>Aadhaar: <HL c="#ffc21a66" d={0.25}>４８２１ ７７３３ ９０４５</HL></p>
      <p>Mail: <HL c="#ffc21a66" d={0.4}>rohan [at] gmail [dot] com</HL></p>
      <p>Card: <HL c="#ffc21a66" d={0.55}>4111 1111 1111 1111</HL></p>
      <p className="mt-3 text-xs text-amber">17 ID formats · 4 regions · checksums verified · 2 ms</p>
    </Doc>
  );
  if (i === 1) return (
    <Doc>
      <p>My client is <HL c="#ffc21a99" d={0.2}>the only female cardiologist</HL> in <HL c="#ffc21a99" d={0.4}>Ratnagiri</HL>.</p>
      <p>She was on <HL c="#ffc21a99" d={0.6}>Zee Marathi</HL> after <HL c="#ffc21a99" d={0.8}>her twins topped the SSC exams</HL>.</p>
      <p className="mt-3 inline-flex items-center gap-2 text-xs text-device"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-device" />Gemini Nano · on-device · ONLY_ON_DEVICE</p>
    </Doc>
  );
  if (i === 2) return <Detective />;
  return (
    <Doc>
      <p className="text-xs text-cloud">→ sent to Gemini (cloud)</p>
      <p>Dear <span className="vchip cloud">person 1</span>, PAN <span className="vchip cloud">pan 1</span>, income Rs <span className="vchip cloud">amount 1 · ₹15–20L</span>…</p>
      <p className="mt-3 text-xs text-device">← restored on your device</p>
      <p>Dear <motion.span className="text-device" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}><Scramble text="Rohan Mehta" duration={700} /></motion.span>, PAN <span className="text-device">BQRPM4821K</span>…</p>
    </Doc>
  );
}

function Detective() {
  const lines = [
    { a: "location", g: "Ratnagiri", e: "“in Ratnagiri”" },
    { a: "occupation", g: "cardiologist", e: "“the only female cardiologist”" },
    { a: "family", g: "has twins", e: "“her twins topped…”" },
  ];
  return (
    <div className="glass relative overflow-hidden rounded-3xl p-6">
      <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-coral">Guess Who · on-device attacker</p>
      {lines.map((l, k) => (
        <motion.div key={l.a} className="relative mb-3 flex items-center justify-between rounded-xl bg-black/[.03] px-4 py-3"
          initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.25 + k * 0.35 }}>
          <div className="text-sm"><span className="text-mist">{l.a}:</span> <span className="text-fog">{l.g}</span> <span className="text-dim">{l.e}</span></div>
          <motion.span className="stamp text-[11px] text-coral"
            initial={{ scale: 2.2, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }}
            transition={{ delay: 0.75 + k * 0.35, type: "spring", stiffness: 500, damping: 18 }}>MASKED</motion.span>
        </motion.div>
      ))}
      <div className="mt-4 flex items-center gap-3 text-xs text-mist">
        Re-identification risk
        <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-black/10">
          <motion.div className="absolute inset-y-0 left-0 rounded-full" initial={{ width: "85%", backgroundColor: "#c63a1f" }}
            animate={{ width: "12%", backgroundColor: "#0f7b5f" }} transition={{ delay: 1.9, duration: 1, ease: [0.16, 1, 0.3, 1] }} />
        </div>
        <motion.span initial={{ color: "#c63a1f" }} animate={{ color: "#0f7b5f" }} transition={{ delay: 1.9 }}>LOW</motion.span>
      </div>
    </div>
  );
}
