import { lazy, Suspense, useRef } from "react";
import { motion, useScroll, useSpring, useTransform, useMotionValue, useMotionTemplate } from "motion/react";
import { CursorLight, Magnetic, TiltCard, CountUp, Reveal, ProximityText, VeilMark, IntroLoader } from "./effects";
import { VeilLoop, PipelineStory } from "./demos";
import { PrivacyLens } from "./lens";
import { LiquidGlassDefs } from "./liquid";

const Hero3D = lazy(() => import("./Hero3D"));
const STUDIO = "/app/";

function Nav() {
  const { scrollYProgress } = useScroll();
  const w = useSpring(scrollYProgress, { stiffness: 120, damping: 30 });
  return (
    <>
      <motion.div className="fixed inset-x-0 top-0 z-50 h-[3px] origin-left bg-marker" style={{ scaleX: w }} />
      <motion.nav className="liquid fixed inset-x-0 top-4 z-40 mx-auto flex w-[min(92%,880px)] items-center justify-between rounded-full px-3 py-2 pl-4"
        initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1.6, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}>
        <a href="#top" className="flex items-center gap-2 font-semibold tracking-tight"><VeilMark size={22} />Veil</a>
        <div className="hidden items-center gap-1 text-sm text-mist md:flex">
          {[["Lens", "#lens"], ["How it works", "#how"], ["Proof", "#proof"], ["Research", "#research"], ["Who it's for", "#who"]].map(([l, h]) => (
            <a key={h} href={h} className="rounded-full px-3 py-1.5 transition-colors hover:bg-black/5 hover:text-fog">{l}</a>
          ))}
        </div>
        <a href={STUDIO} className="rounded-full bg-fog px-4 py-1.5 text-sm font-medium text-ink transition-transform hover:scale-[1.03] active:scale-95">Open Studio</a>
      </motion.nav>
    </>
  );
}

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  // Pinned scene: the page scrolls 230vh while the hero stays put and the 3D tells the story.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const fade = useTransform(scrollYProgress, [0.05, 0.3], [1, 0]);
  const lift = useTransform(scrollYProgress, [0.05, 0.3], [0, -60]);
  const cap = useTransform(scrollYProgress, [0.42, 0.6], [0, 1]);
  const capY = useTransform(scrollYProgress, [0.42, 0.6], [30, 0]);
  const hint = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  return (
    <section id="top" ref={ref} className="relative" style={{ height: "230vh" }}>
      <div className="sticky top-0 h-screen overflow-hidden">
        <div aria-hidden className="dots absolute inset-0" />
        <div aria-hidden className="absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse,rgb(124_108_255/.22),transparent_60%)] blur-2xl" />
        <motion.div className="absolute inset-0" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1.5, duration: 1.4, ease: [0.16, 1, 0.3, 1] }}>
          <Suspense fallback={null}><Hero3D progress={scrollYProgress} /></Suspense>
        </motion.div>

        {/* Scene 2 captions: appear when the 3D has split into device and cloud */}
        <motion.div className="pointer-events-none absolute inset-x-0 bottom-[14vh] mx-auto grid max-w-6xl grid-cols-2 px-6 md:px-10" style={{ opacity: cap, y: capY }}>
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-device">Your device</p>
            <p className="mt-2 max-w-xs text-2xl font-semibold tracking-tight md:text-3xl">Keeps every secret.</p>
            <p className="mt-2 max-w-xs text-sm text-mist">Gemini Nano finds and hides personal data right here.</p>
          </div>
          <div className="text-right">
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-cloud">The cloud</p>
            <p className="ml-auto mt-2 max-w-xs text-2xl font-semibold tracking-tight md:text-3xl">Does the thinking.</p>
            <p className="ml-auto mt-2 max-w-xs text-sm text-mist">Gemini reasons over tags. Only tags ever cross.</p>
          </div>
        </motion.div>

        <div className="relative mx-auto flex h-full max-w-6xl items-center px-4 md:px-8">
        <motion.div style={{ opacity: fade, y: lift }} className="relative z-10 max-w-[38rem] pt-16">
          <motion.a href="https://firebasehybridaihackathon.devpost.com/" target="_blank" rel="noreferrer"
            className="liquid inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-mist hover:text-fog"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.7 }}>
            <span className="h-1.5 w-1.5 rounded-full bg-device shadow-[0_0_10px_#0f7b5f]" />
            Hybrid AI · Firebase AI Logic · Gemini Nano + Gemini
          </motion.a>
          <h1 className="mt-6 text-[clamp(2.6rem,6.4vw,5.2rem)] leading-[0.98] tracking-[-0.035em]">
            <ProximityText text="The cloud gets the thinking." delay={1.75} />
            <br />
            <ProximityText text="Never your" delay={2.1} />{" "}
            <motion.span className="font-serif font-normal italic text-gradient" style={{ ["--marker-delay" as string]: "2.6s" }} initial={{ opacity: 0, filter: "blur(12px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }} transition={{ delay: 2.3, duration: 1 }}>secrets.</motion.span>
          </h1>
          <motion.p className="mt-6 max-w-xl text-lg leading-relaxed text-mist"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.5, duration: 0.8 }}>
            Veil hides names, IDs and tell-tale details <span className="text-device">on your device</span> with Gemini Nano,
            lets cloud Gemini do the hard reasoning on placeholders, then puts your real values back — locally.
          </motion.p>
          <motion.div className="mt-9 flex flex-wrap items-center gap-4"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.65, duration: 0.8 }}>
            <Magnetic>
              <a href={STUDIO} className="liquid ring-spin group inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-medium">
                Open Veil Studio
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </a>
            </Magnetic>
            <a href="#lens" className="rounded-full px-5 py-3 text-mist transition-colors hover:text-fog">See what the cloud sees</a>
          </motion.div>
          <motion.div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-xs text-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.9 }}>
            <span>● 98.5% recall, measured</span><span>● Works offline</span><span>● Nothing stored, nothing sent raw</span>
          </motion.div>
        </motion.div>
        </div>

        <motion.div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center" style={{ opacity: hint }}>
          <motion.div className="flex flex-col items-center gap-2 text-[11px] text-dim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 3.2 }}>
            scroll
            <motion.span className="block h-8 w-px bg-gradient-to-b from-mist to-transparent" animate={{ scaleY: [0.3, 1, 0.3], originY: 0 }} transition={{ duration: 1.8, repeat: Infinity }} />
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

function LensSection() {
  return (
    <section id="lens" className="relative mx-auto max-w-6xl px-4 py-28 md:px-8">
      <div className="grid items-center gap-12 md:grid-cols-[0.8fr_1.2fr]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Privacy lens</p>
          <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">See it the way <span className="font-serif font-normal italic text-cloud">the cloud</span> does.</h2>
          <p className="mt-4 text-mist">Move your cursor over the email. Inside the lens is exactly what Gemini in the cloud receives — every name, ID,
            amount and address swapped for a tag. Everything outside the lens never leaves your device.</p>
          <div className="mt-8"><VeilLoop /></div>
        </Reveal>
        <Reveal delay={0.1}><PrivacyLens /></Reveal>
      </div>
    </section>
  );
}

const HIDES = ["Names", "PAN", "Aadhaar", "IBAN", "Card numbers", "CVV", "API keys", "Phone numbers", "Emails", "UPI IDs", "NI numbers", "Bank accounts", "Addresses", "Health details", "“The only … in …”", "Dates of birth", "Salaries", "SSN"];

function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-line/70 py-5 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
      <motion.div className="flex w-max gap-10 whitespace-nowrap text-sm text-mist" animate={{ x: ["0%", "-50%"] }} transition={{ duration: 38, ease: "linear", repeat: Infinity }}>
        {[...HIDES, ...HIDES].map((h, i) => (
          <span key={i} className="inline-flex items-center gap-3"><span className="vchip">{h.toLowerCase()}</span><span className="text-dim">stays on your device</span></span>
        ))}
      </motion.div>
    </div>
  );
}

function Proof() {
  return (
    <section id="proof" className="mx-auto max-w-6xl px-4 py-28 md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Proof, not promises</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">Measured on 113 adversarial documents.</h2>
        <p className="mt-4 max-w-2xl text-mist">Run-on text, typos, Hinglish, obfuscated emails, Cyrillic look-alikes, CSVs, quasi-identifiers — scored on the exact payload that would leave the device.</p>
      </Reveal>
      <div className="mt-12 grid auto-rows-[minmax(190px,auto)] gap-4 md:grid-cols-6">
        <TiltCard className="md:col-span-3 md:row-span-2" glow="#0f7b5f">
          <div className="flex h-full flex-col justify-between p-7">
            <p className="text-sm text-mist">Private items that never reached the cloud</p>
            <div>
              <p className="text-7xl font-semibold tracking-tight md:text-8xl"><CountUp to={98.5} decimals={1} suffix="%" className="text-gradient" /></p>
              <div className="mt-6 space-y-3 text-xs">
                {[["Rules only (safe mode)", 69.7, "#8b867a"], ["Veil · rules + Gemini Nano", 98.5, "#0f7b5f"]].map(([l, v, c]) => (
                  <div key={l as string}>
                    <div className="mb-1 flex justify-between text-mist"><span>{l}</span><span>{v}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-black/5">
                      <motion.div className="h-full rounded-full" style={{ background: c as string }} initial={{ width: 0 }}
                        whileInView={{ width: `${v}%` }} viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TiltCard>
        <TiltCard className="md:col-span-3" glow="#ffc21a">
          <div className="flex h-full items-end justify-between p-7">
            <div><p className="text-sm text-mist">Documents with zero leaks</p><p className="mt-2 text-5xl font-semibold"><CountUp to={110} />/113</p></div>
            <p className="max-w-[12rem] text-right text-xs text-dim">All 3 leaks happened during a model timeout — Veil flagged each and required review.</p>
          </div>
        </TiltCard>
        <TiltCard className="md:col-span-2" glow="#2a44e8">
          <div className="flex h-full flex-col justify-between p-6">
            <p className="text-sm text-mist">Personal values in the network payload</p>
            <p className="text-5xl font-semibold text-cloud">0</p>
            <p className="text-xs text-dim">Verified in Chrome DevTools.</p>
          </div>
        </TiltCard>
        <TiltCard className="md:col-span-1" glow="#0f7b5f">
          <div className="flex h-full flex-col items-center justify-center gap-3 p-5 text-center">
            <span className="relative grid h-12 w-12 place-items-center rounded-full bg-device/15">
              <span className="absolute inset-0 animate-ping rounded-full bg-device/20" /><span className="h-3 w-3 rounded-full bg-device" />
            </span>
            <p className="text-sm">Works offline</p>
          </div>
        </TiltCard>
        <TiltCard className="md:col-span-3" glow="#ffc21a">
          <div className="p-7">
            <p className="text-sm text-mist">One SDK, both worlds — Firebase AI Logic</p>
            <pre className="mt-4 overflow-x-auto rounded-xl bg-fog p-4 font-mono text-[12.5px] leading-6 text-ink">
{`detect  = getGenerativeModel(ai, { mode: `}<span className="text-marker">ONLY_ON_DEVICE</span>{` })
reason  = getGenerativeModel(ai, { mode: `}<span className="text-[#9db0ff]">ONLY_IN_CLOUD</span>{` })
result.response.inferenceSource  `}<span className="text-[#a7a294]">// "on_device" | "in_cloud"</span></pre>
          </div>
        </TiltCard>
        <TiltCard className="md:col-span-3" glow="#c63a1f">
          <div className="p-7">
            <p className="text-sm text-mist">Fail-closed leak gate</p>
            <p className="mt-3 text-lg leading-snug">Right before sending, the exact payload is re-scanned. If any hidden value would still leave the device, <span className="text-coral">nothing is sent.</span></p>
          </div>
        </TiltCard>
      </div>
    </section>
  );
}

const PAPERS = [
  { t: "PAPILLON", v: "Columbia · 2024", d: "A local model as a privacy proxy for a cloud LLM — the architecture Veil runs inside Chrome.", h: "https://arxiv.org/abs/2410.17127" },
  { t: "Hide and Seek", v: "2023", d: "Hide values locally, let the cloud answer, restore them locally. Label-based hiding protects best.", h: "https://arxiv.org/abs/2309.03057" },
  { t: "Adversarial anonymization", v: "ETH Zürich · ICLR 2025", d: "An attacker LLM guides the anonymiser — our “Guess Who” loop.", h: "https://arxiv.org/abs/2402.13846" },
  { t: "Mind the Gap", v: "2026", d: "Regex + model + merger + human review + regression suite. The benchmark taxonomy we test against.", h: "https://arxiv.org/abs/2609.03464" },
];

function Research() {
  return (
    <section id="research" className="mx-auto max-w-6xl px-4 py-24 md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Built on research</p>
        <h2 className="mt-3 text-4xl font-semibold tracking-tight md:text-5xl">Not a hunch. <span className="font-serif font-normal italic text-mist">A literature.</span></h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-4">
        {PAPERS.map((p, i) => (
          <Reveal key={p.t} delay={i * 0.08}>
            <TiltCard className="h-full" max={8}>
              <a href={p.h} target="_blank" rel="noreferrer" className="flex h-full flex-col gap-3 p-6">
                <span className="font-mono text-[11px] text-dim">{p.v}</span>
                <span className="text-lg font-medium">{p.t}</span>
                <span className="text-sm leading-relaxed text-mist">{p.d}</span>
                <span className="mt-auto text-xs text-device">Read the paper ↗</span>
              </a>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

const PEOPLE = [
  { who: "Priya, chartered accountant · Pune", line: "Explains a client's 143(1)(a) notice with AI — without the client's PAN, Aadhaar or income leaving her laptop.", law: "India · DPDP Act — obligations from May 2027", c: "#0f7b5f" },
  { who: "Lena, freelance designer · Leipzig", line: "Drafts a firm overdue-invoice reply. Her IBAN and her client's name never reach the model.", law: "EU · GDPR", c: "#ffc21a" },
  { who: "Aisha, HR manager · London", line: "Summarises a sensitive absence case for the board. Health and family details stay on the device.", law: "UK · UK GDPR", c: "#2a44e8" },
];

function Who() {
  return (
    <section id="who" className="mx-auto max-w-6xl px-4 py-24 md:px-8">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Who it's for</p>
        <h2 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">For people who hold other people's secrets.</h2>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {PEOPLE.map((p, i) => (
          <Reveal key={p.who} delay={i * 0.1}>
            <TiltCard glow={p.c} className="h-full">
              <div className="flex h-full flex-col gap-4 p-7">
                <span className="h-10 w-10 rounded-2xl" style={{ background: `linear-gradient(135deg, ${p.c}, transparent)` }} />
                <p className="font-medium">{p.who}</p>
                <p className="text-sm leading-relaxed text-mist">{p.line}</p>
                <p className="mt-auto font-mono text-[11px] text-dim">{p.law}</p>
              </div>
            </TiltCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Finale() {
  const mx = useMotionValue(50), my = useMotionValue(50);
  const mask = useMotionTemplate`radial-gradient(360px circle at ${mx}% ${my}%, #000 30%, transparent 70%)`;
  return (
    <footer className="relative overflow-hidden border-t border-line/70 pt-24"
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mx.set(((e.clientX - r.left) / r.width) * 100); my.set(((e.clientY - r.top) / r.height) * 100); }}>
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 text-center md:px-8">
        <Reveal>
          <h2 className="text-4xl font-semibold tracking-tight md:text-6xl">Ask anything.<br /><span className="font-serif font-normal italic text-gradient">Reveal nothing.</span></h2>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-10">
            <Magnetic strength={0.4}>
              <a href={STUDIO} className="liquid ring-spin inline-flex items-center gap-2 rounded-full px-8 py-4 text-lg font-medium">Open Veil Studio →</a>
            </Magnetic>
          </div>
          <p className="mt-5 text-xs text-dim">Best in desktop Chrome with on-device Gemini Nano. Works in any browser in safe mode.</p>
        </Reveal>
      </div>
      <div className="relative mt-20 select-none">
        <p className="text-center text-[24vw] font-semibold leading-[0.8] tracking-[-0.06em] text-black/[.04]">Veil</p>
        <motion.p aria-hidden className="absolute inset-0 text-center text-[24vw] font-semibold leading-[0.8] tracking-[-0.06em] text-gradient"
          style={{ WebkitMaskImage: mask, maskImage: mask }}>Veil</motion.p>
      </div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-xs text-dim md:px-8">
        <span className="flex items-center gap-2"><VeilMark size={16} />Veil — built for #BuildHybridAI</span>
        <span className="flex gap-5"><a href={STUDIO} className="hover:text-fog">Studio</a><a href="/spike.html" className="hover:text-fog">Benchmark</a><a href="#research" className="hover:text-fog">Research</a></span>
      </div>
    </footer>
  );
}

export function Landing() {
  return (
    <div className="grain relative">
      <LiquidGlassDefs />
      <IntroLoader />
      <CursorLight />
      <Nav />
      <main className="relative z-10">
        <Hero />
        <Marquee />
        <LensSection />
        <section id="how"><PipelineStory /></section>
        <Proof />
        <Research />
        <Who />
      </main>
      <div className="relative z-10"><Finale /></div>
    </div>
  );
}
