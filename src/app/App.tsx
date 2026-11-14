import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  runVeil, applyDecisions, extendNeverMask, mask, rehydrate, maskOptionsFor, spanKey, buildCloudPayload,
  type VeilResult, type RegionId, type Span,
} from "../engine";
import { availability, detectDirect, askCloud, nanoDetector, configure, currentCloudModel } from "../nano";
import { loadSettings, watchUser, signInWithGoogle, signOutUser, saveReceipt, DEFAULT_SETTINGS, type Settings } from "../cloud";
import type { User } from "firebase/auth";
import { SAMPLES } from "../samples";
import { buildReceipt, type Receipt } from "./receipt";
import { DocView, CloudView, StageBar, RiskCard, ReceiptCard, ModelPill, Channel, StepGuide, RestoredView, Tabs, VaultTiles, HybridSplit, HistoryDrawer } from "./components";
import { CursorLight, VeilMark, TiltCard } from "../site/effects";
import { LiquidGlassDefs } from "../site/liquid";
import { Aurora } from "../site/ambient";

export type ModelState = "checking" | "warming" | "ready" | "safe" | "downloadable";

const REGIONS: { id: RegionId; label: string }[] = [
  { id: "IN", label: "India · DPDP" },
  { id: "EU", label: "EU · GDPR" },
  { id: "UK", label: "UK · UK GDPR" },
  { id: "US", label: "United States" },
];

interface Answer {
  raw: string;
  restored: string;
  invented: string[];
  ms: number;
  source?: string;
  maskedQuestion: string;
  gateAutoMasked: string[];
  vault: Map<string, string>;
  reserved: Set<string>;
}

/** Turn SDK/network errors into something a person can act on. Nothing was sent in any of these cases. */
function friendlyCloudError(e: any): string {
  const msg = String(e?.message ?? e);
  if (!navigator.onLine || /failed to fetch|network|ERR_INTERNET|offline/i.test(msg)) {
    return "You're offline — the cloud can't be reached. On-device protection still works; nothing was sent. Try again when you're back online.";
  }
  if (/app.?check|attestation|403|PERMISSION_DENIED/i.test(msg)) {
    return "The cloud refused the request (App Check). Nothing was sent. If you're on localhost, make sure your debug token is registered in the Firebase console.";
  }
  if (/timed out/i.test(msg)) return "The cloud took too long to answer. Nothing was lost — please try again.";
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) return "The cloud's free quota is used up for now. Please try again in a minute.";
  return `The cloud request failed: ${msg.slice(0, 160)}`;
}

function useModel(): ModelState {
  const [state, setState] = useState<ModelState>("checking");
  useEffect(() => {
    let alive = true;
    (async () => {
      const a = await availability().catch(() => "unavailable");
      if (!alive) return;
      if (a === "downloadable" || a === "downloading") return setState("downloadable");
      if (a !== "available") return setState("safe");
      setState("warming");
      try { await detectDirect("Warm-up."); } catch { /* first real call will load it */ }
      if (alive) setState("ready");
    })();
    return () => { alive = false; };
  }, []);
  return state;
}

/** Feeds the cursor position into every glass panel so its rim light follows the mouse. */
function RimLight() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      document.querySelectorAll<HTMLElement>(".pane, .ask").forEach((el) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);
  return null;
}

export function App() {
  const model = useModel();
  const [region, setRegion] = useState<RegionId>("IN");
  const [text, setText] = useState("");
  const [result, setResult] = useState<VeilResult | null>(null);
  const [keep, setKeep] = useState<Set<string>>(new Set());
  const [accept, setAccept] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [sending, setSending] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [settings, setSettings] = useState<Settings & { source: "remote" | "default" }>({ ...DEFAULT_SETTINGS, source: "default" });
  const [user, setUser] = useState<User | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [saved, setSaved] = useState<"" | "saving" | "saved" | "error">("");

  // Remote Config (cloud model, timeout, never-mask terms) and the signed-in user.
  useEffect(() => {
    loadSettings().then((s) => { configure(s); extendNeverMask(s.neverMaskExtra); setSettings(s); });
    let off: (() => void) | undefined;
    watchUser(setUser).then((u) => { off = u; }).catch(() => {});
    return () => off?.();
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(true);
  const [tab, setTab] = useState<"cloud" | "vault">("cloud");
  const runId = useRef(0);

  const safeMode = model === "safe" || model === "downloadable";

  // Re-run the pipeline when the text, region or model readiness changes (debounced while typing).
  useEffect(() => {
    setKeep(new Set()); setAccept([]); setDismissed([]); setAnswer(null); setReceipt(null); setReviewed(false);
    if (!text.trim()) { setResult(null); return; }
    if (model === "checking" || model === "warming") {
      // Show instant rule matches while the model warms up; the full run follows once ready.
      runVeil(text, { regions: [region], detector: null }).then(setResult);
      return;
    }
    const id = ++runId.current;
    const t = setTimeout(() => {
      runVeil(text, {
        regions: [region],
        detector: safeMode ? null : nanoDetector, maxRounds: settings.maxAttackRounds,
        onUpdate: (r) => { if (id === runId.current) setResult(r); },
      }).then((r) => { if (id === runId.current) setResult(r); })
        .catch((e) => { if (id === runId.current) setError(String(e?.message ?? e)); });
    }, 600);
    return () => clearTimeout(t);
  }, [text, region, model, safeMode]);

  // Every span Veil would mask (incl. accepted suggestions); the user can click any of them to keep it.
  const candidates: Span[] = useMemo(
    () => (result ? applyDecisions(text, result, new Set(), accept) : []),
    [text, result, accept],
  );
  const spans = useMemo(() => candidates.filter((s) => !keep.has(spanKey(s))), [candidates, keep]);
  const masked = useMemo(
    () => (result ? mask(text, spans, maskOptionsFor(result.packs)) : null),
    [text, spans, result],
  );

  const running = !!result && result.stage !== "done";
  // Extra care is needed when detection was incomplete: safe mode, a failed step, or a non-Latin script.
  const needsReview = safeMode || !!result?.degraded || !!result?.nonLatin;
  const canSend = !!masked && !!question.trim() && !running && !sending && (!needsReview || reviewed);

  async function send() {
    if (!masked || !result) return;
    setSending(true); setError(null); setAnswer(null); setReceipt(null);
    try {
      // The question is personal data too: mask it with the same vault as the document.
      const q = await runVeil(question, { regions: [region], detector: safeMode ? null : nanoDetector, maxRounds: 0 });
      const built = buildCloudPayload({ question, questionSpans: q.spans, doc: text, docSpans: spans, packs: result.packs });
      // Fail closed: if any hidden value would still leave the device, nothing is sent.
      if (built.gate.blocked.length) {
        setError(`Blocked before sending — ${built.gate.blocked.length} private value(s) would still have left this device: ` +
          `${built.gate.blocked.map((v) => `“${v}”`).join(", ")}. Mask them (click the highlight) and try again.`);
        return;
      }
      const cloud = await askCloud(built.payload);
      const r = rehydrate(cloud.text, built.vault, built.reserved);
      setAnswer({ raw: cloud.text, restored: r.text, invented: r.invented, ms: cloud.ms, source: cloud.source, maskedQuestion: built.maskedQuestion,
        gateAutoMasked: built.gate.autoMasked, vault: built.vault, reserved: built.reserved });
      const rc = await buildReceipt({ result, vault: built.vault, payload: built.payload, cloudSource: cloud.source, invented: r.invented, region,
        gateAutoMasked: built.gate.autoMasked.length, cloudModel: currentCloudModel(), settings: settings.source });
      setReceipt(rc);
      if (user) { setSaved("saving"); saveReceipt(user.uid, rc).then(() => setSaved("saved")).catch(() => setSaved("error")); } else setSaved("");
    } catch (e: any) {
      setError(friendlyCloudError(e));
    } finally {
      setSending(false);
    }
  }

  const toggleKeep = (s: Span) => setKeep((prev) => {
    const next = new Set(prev);
    const k = spanKey(s);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });

  const suggestions = (result?.suggestions ?? []).filter((c) => !accept.includes(c.quote) && !dismissed.includes(c.quote));

  const step: 1 | 2 | 3 = !text ? 1 : answer || sending ? 3 : 2;

  return (
    <>
    <Aurora intensity={1.1} />
    <RimLight />
    <LiquidGlassDefs />
    <CursorLight />
    <div className="shell">
      <header className="top top-glass">
        <a className="brand" href="/" title="Back to the Veil homepage">
          <VeilMark size={28} />
          <div>
            <strong>Veil Studio</strong>
            <span className="tag">The cloud gets the thinking. Never your secrets.</span>
          </div>
        </a>
        <div className="top-right">
          <a href="/" className="ghost-link small muted">← Home</a>
          <select value={region} onChange={(e) => setRegion(e.target.value as RegionId)} aria-label="Region rules">
            {REGIONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <ModelPill state={model} />
          {user ? (
            <span className="account">
              <button className="ghost" onClick={() => setHistoryOpen(true)} title="Your privacy receipts (counts and hashes only)">History</button>
              <button className="avatar" onClick={() => signOutUser()} title={`Signed in as ${user.email ?? "you"} — click to sign out`}>
                {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (user.displayName ?? "U").slice(0, 1)}
              </button>
            </span>
          ) : (
            <button className="ghost" onClick={() => signInWithGoogle().catch((e) => setError(`Sign-in failed: ${e?.message ?? e}`))}>Sign in to keep receipts</button>
          )}
        </div>
      </header>

      <StepGuide step={step} running={running} />

      {safeMode && (
        <div className="banner warn">
          <strong>Safe mode.</strong> On-device AI isn't available on this device, so Veil is using its
          {" "}{REGIONS.find((r) => r.id === region)!.label} rules only. Names and indirect clues may be missed —
          review the right-hand panel carefully before sending.
        </div>
      )}

      {result?.nonLatin && (
        <div className="banner warn">
          <strong>Text in another script detected.</strong> On-device detection covers English / Latin script today, so names
          written in Devanagari, Cyrillic and other scripts may be missed. ID numbers are still caught by rules. Review before sending.
        </div>
      )}
      {result?.degraded && (
        <div className="banner warn">
          <strong>An on-device step didn't finish.</strong> Rule-based masking (IDs, labelled names) is still applied, but other names or
          clues may be missing. Review the right-hand panel before sending, or press Edit → Done to retry.
          <span className="small muted"> Reason: {result.stages.filter((s) => s.failed).map((s) => `${s.stage}: ${s.note.replace(/^failed — /, "")}`).join(" · ")}</span>
        </div>
      )}

      {!text && (
        <section className="empty">
          <h1>Paste anything you're about to send to an AI. <em>Veil</em> keeps the secrets.</h1>
          <p>Veil finds personal data <em>on this device</em> with Gemini Nano, replaces it with meaningful placeholders,
            asks the cloud, then puts the real values back — locally.</p>
          <div className="sample-grid">
            {SAMPLES.map((s, i) => (
              <motion.div key={s.id} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + i * 0.07, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
                <TiltCard className="h-full" max={9} glow={s.region === "IN" ? "#0f7b5f" : s.region === "EU" ? "#ffc21a" : "#2a44e8"}>
                  <button className="sample-card" onClick={() => { setRegion(s.region); setText(s.text); setEditing(false); }}>
                    <span className="region-badge">{s.region}</span>
                    <strong>{s.label.split(" ").slice(1).join(" ")}</strong>
                    <span className="snip">{s.text.replace(/\s+/g, " ").slice(0, 140)}…</span>
                    <span className="go">Try this sample →</span>
                  </button>
                </TiltCard>
              </motion.div>
            ))}
          </div>
          <div className="or-line">or paste your own text below</div>
        </section>
      )}

      <main className={text ? "panes" : "panes compact"}>
        <section className="pane device">
          <div className="pane-head">
            <h2><span className="zone device">on device</span> Your text</h2>
            <div className="row-gap">
              {text && !editing && <button className="ghost" onClick={() => setEditing(true)}>Edit</button>}
              {text && editing && <button className="ghost" onClick={() => setEditing(false)}>Done</button>}
              {text && <button className="ghost" onClick={() => { setText(""); setEditing(true); }}>Clear</button>}
            </div>
          </div>
          {text && result && !editing ? (
            <div className="doc-wrap">
              {running && <div className="scanbeam" aria-hidden />}
              <DocView text={text} spans={candidates} keep={keep} onToggle={toggleKeep} />
            </div>
          ) : (
            <textarea
              className="input"
              placeholder="Paste a tax notice, contract, HR note, client email…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={() => setTimeout(() => setEditing(false), 0)}
              autoFocus
            />
          )}
          {result && <StageBar result={result} />}
        </section>

        {text && (
          <section className="pane cloud">
            <div className="pane-head">
              <h2><span className="zone cloud">to cloud</span></h2>
              <Tabs value={tab} onChange={setTab} options={[
                { id: "cloud", label: "What the cloud sees" },
                { id: "vault", label: "Vault", count: masked?.vault.size ?? 0 },
              ]} />
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={tab} initial={{ opacity: 0, x: tab === "vault" ? 24 : -24, filter: "blur(4px)" }}
                animate={{ opacity: 1, x: 0, filter: "blur(0px)" }} exit={{ opacity: 0, x: tab === "vault" ? -24 : 24, filter: "blur(4px)" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}>
                {tab === "cloud"
                  ? (masked ? <CloudView masked={masked.masked} /> : <div className="doc muted">Analysing…</div>)
                  : (masked ? <VaultTiles vault={masked.vault} /> : <div className="doc muted">Analysing…</div>)}
              </motion.div>
            </AnimatePresence>
          </section>
        )}
      </main>

      {text && result && (
        <motion.section className="bento" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
          <div className="pane bento-card">
            <p className="eyebrow">Held back on this device</p>
            <p className="big-number"><motion.span key={masked?.vault.size} initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>{masked?.vault.size ?? 0}</motion.span><small> values</small></p>
            <div className="kind-bars">
              {Object.entries([...(masked?.vault.keys() ?? [])].reduce<Record<string, number>>((a, id) => { const k = id.replace(/_\d+$/, ""); a[k] = (a[k] ?? 0) + 1; return a; }, {}))
                .sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => (
                  <div key={k} className="kind-row"><span>{k.replace(/_/g, " ").toLowerCase()}</span>
                    <i><motion.b initial={{ width: 0 }} animate={{ width: `${Math.min(100, n * 34)}%` }} transition={{ type: "spring", stiffness: 140, damping: 20 }} /></i><em>{n}</em></div>
                ))}
            </div>
          </div>
          <div className="pane bento-card">
            <RiskCard result={result} suggestions={suggestions}
              onMask={(q) => setAccept((a) => [...a, q])} onKeep={(q) => setDismissed((d) => [...d, q])} />
          </div>
          <div className="pane bento-card">
            <p className="eyebrow">Hybrid split</p>
            <HybridSplit result={result} cloudMs={answer?.ms} />
          </div>
        </motion.section>
      )}

      {text && (
        <section className="ask liquid">
          <div className="ask-row">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && canSend) send(); }}
              placeholder="Ask the cloud — e.g. “Explain this notice and draft a polite reply”"
            />
            <button className="primary" disabled={!canSend} onClick={send}>
              {sending ? "Asking…" : running ? "Still checking…" : "Ask with Veil"}
            </button>
          </div>
          <Channel sending={sending} answered={!!answer} values={masked?.vault.size ?? 0} />
          {needsReview && (
            <label className="review">
              <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
              I reviewed what the cloud will see
              {" "}({safeMode ? "required in safe mode" : result?.degraded ? "an on-device step failed" : "text in a script on-device detection doesn't cover yet"})
            </label>
          )}
          {error && <p className="error">{error}</p>}

          {answer && (
            <div className="answer">
              <div className="answer-head">
                <h2>Answer</h2>
                <div className="seg">
                  <button className={!showRaw ? "on" : ""} onClick={() => setShowRaw(false)}>With your real values</button>
                  <button className={showRaw ? "on" : ""} onClick={() => setShowRaw(true)}>Exactly what the cloud saw</button>
                </div>
              </div>
              <p className="small muted sent-q">Your question, as sent: <CloudView masked={answer.maskedQuestion} inline /></p>
              <AnimatePresence mode="wait">
                <motion.div key={showRaw ? "raw" : "real"} initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(6px)" }} transition={{ duration: 0.35 }}>
                  {showRaw ? <CloudView masked={answer.raw} /> : <RestoredView raw={answer.raw} vault={answer.vault} reserved={answer.reserved} />}
                </motion.div>
              </AnimatePresence>
              <p className="muted small">
                Cloud ({answer.source === "in_cloud" ? "Gemini" : answer.source}) answered in {answer.ms} ms ·
                {" "}real values restored on this device · leak check passed
                {answer.gateAutoMasked.length > 0 && <> (it caught and masked {answer.gateAutoMasked.length} more: {answer.gateAutoMasked.join(", ").toLowerCase()})</>}
                {answer.invented.length > 0 && <span className="bad"> · cloud invented {answer.invented.join(", ")} (left unrestored)</span>}
              </p>
            </div>
          )}
          {receipt && <ReceiptCard receipt={receipt} />}
          {receipt && (
            <p className="small muted save-note">
              {user ? (saved === "saving" ? "Saving this receipt to your history…" : saved === "saved" ? "✓ Saved to your history (counts and hash only)." : saved === "error" ? "Couldn't save to your history." : "")
                : "Sign in to keep a history of receipts — only counts and hashes are stored."}
            </p>
          )}
        </section>
      )}

      {user && <HistoryDrawer uid={user.uid} open={historyOpen} onClose={() => setHistoryOpen(false)} />}
      <footer className="foot muted small">
        Veil · on-device Gemini Nano + cloud Gemini ({currentCloudModel()}, {settings.source === "remote" ? "Remote Config" : "defaults"}) via Firebase AI Logic · <a href="/">home</a> · <a href="/spike.html">benchmark</a>
      </footer>
    </div>
    </>
  );
}
