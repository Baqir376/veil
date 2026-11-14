import { Fragment, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { PLACEHOLDER_RE, LOOSE_PLACEHOLDER_RE, riskOf, spanKey, type Span, type VeilResult, type Clue } from "../engine";
import { Scramble } from "../site/effects";
import type { Receipt } from "./receipt";
import type { ModelState } from "./App";

const LABELS: Record<string, string> = {
  PERSON: "Person", ORG: "Organisation", LOCATION: "Place", GOV_ID: "Gov ID", FINANCIAL_ID: "Account",
  CONTACT: "Contact", AMOUNT: "Amount", DATE: "Date", HEALTH: "Health", SENSITIVE: "Sensitive", QUASI: "Clue", OTHER: "Private",
};

const kindLabel = (s: Span) => s.kind ? s.kind.replace(/_/g, " ") : LABELS[s.category];

export function ModelPill({ state }: { state: ModelState }) {
  const map: Record<ModelState, [string, string]> = {
    checking: ["Checking on-device AI…", "pill"],
    warming: ["Gemini Nano · warming up", "pill busy"],
    ready: ["Gemini Nano · on-device", "pill ok"],
    downloadable: ["On-device model not downloaded · safe mode", "pill warn"],
    safe: ["No on-device AI · safe mode", "pill warn"],
  };
  const [label, cls] = map[state];
  return <span className={cls} title="Detection runs on this device. Nothing is sent until you press Ask.">{label}</span>;
}

/** The user's original text with every detected value highlighted. Click a highlight to keep it. */
export function DocView({ text, spans, keep, onToggle }: {
  text: string; spans: Span[]; keep: Set<string>; onToggle: (s: Span) => void;
}) {
  const parts: React.ReactNode[] = [];
  let cur = 0;
  spans.forEach((s, i) => {
    if (s.start > cur) parts.push(<Fragment key={`t${i}`}>{text.slice(cur, s.start)}</Fragment>);
    const kept = keep.has(spanKey(s));
    const cls = `hl ${s.origin === "attacker" ? "hl-attack" : s.source === "rule" ? "hl-rule" : "hl-nano"}${kept ? " kept" : ""}`;
    parts.push(
      <button key={`s${i}`} className={cls} onClick={() => onToggle(s)}
        title={`${kindLabel(s)} · found by ${s.source === "rule" ? "rules" : s.origin === "attacker" ? "Guess Who" : "Gemini Nano"} · click to ${kept ? "mask" : "keep"}`}>
        {text.slice(s.start, s.end)}
      </button>,
    );
    cur = s.end;
  });
  if (cur < text.length) parts.push(<Fragment key="end">{text.slice(cur)}</Fragment>);
  return (
    <>
      <div className="doc">{parts}</div>
      <div className="legend small">
        <span className="hl hl-rule">rules</span>
        <span className="hl hl-nano">Gemini Nano</span>
        <span className="hl hl-attack">Guess Who</span>
        <span className="muted">· click any highlight to keep it visible</span>
      </div>
    </>
  );
}

/** Masked text with placeholders rendered as chips. */
export function CloudView({ masked, inline }: { masked: string; inline?: boolean }) {
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  const parts: React.ReactNode[] = [];
  let cur = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(masked))) {
    if (m.index > cur) parts.push(<Fragment key={`t${i}`}>{masked.slice(cur, m.index)}</Fragment>);
    const body = m[0].slice(1, -1);
    const [id, hint] = body.split(/\s*·\s*/);
    const label = id.replace(/_\d+$/, "").replace(/_/g, " ");
    const n = id.match(/_(\d+)$/)?.[1];
    parts.push(
      <motion.span key={`p${i}-${m[0]}`} className="chip" title={m[0]}
        initial={{ opacity: 0, scale: 0.6, filter: "blur(4px)" }} animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ type: "spring", stiffness: 420, damping: 24, delay: Math.min(i, 20) * 0.025 }}>
        {label.toLowerCase()} {n}{hint && <em> · {hint}</em>}
      </motion.span>,
    );
    cur = m.index + m[0].length;
    i++;
  }
  if (cur < masked.length) parts.push(<Fragment key="end">{masked.slice(cur)}</Fragment>);
  return inline ? <span className="cloud-inline">{parts}</span> : <div className="doc cloud">{parts}</div>;
}

const STAGES: { id: VeilResult["stage"]; label: string }[] = [
  { id: "rules", label: "Rules" },
  { id: "direct", label: "Names & places" },
  { id: "indirect", label: "Indirect clues" },
  { id: "attack", label: "Guess Who" },
];

/** Progress through the on-device stages, with the inference source the SDK reported. */
export function StageBar({ result }: { result: VeilResult }) {
  const order = ["rules", "direct", "indirect", "attack", "done"];
  const at = order.indexOf(result.stage);
  return (
    <ol className="stages">
      {STAGES.map((s, i) => {
        const log = [...result.stages].reverse().find((l) => l.stage === s.id);
        const safe = result.mode === "rules-only" && i > 0;
        const skippedNote = log?.failed ? "failed" : log?.note.startsWith("skipped") ? log.note.replace(/^skipped — /, "") : null;
        const state = log?.failed ? "fail" : safe || skippedNote ? "skip" : log && (at > i || result.stage === "done") ? "done" : at === i ? "now" : "wait";
        return (
          <li key={s.id} className={state} title={log?.note}>
            <span className="dot" />
            <span>{s.label}</span>
            {log && !safe && !skippedNote && <span className="muted small">{log.ms < 1000 ? `${log.ms} ms` : `${(log.ms / 1000).toFixed(1)} s`}{log.source ? " · on-device" : ""}</span>}
            {safe && <span className="muted small">safe mode</span>}
            {skippedNote && <span className="muted small">skipped · {skippedNote}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Residual re-identification risk from the "Guess Who" attacker, plus Mask/Keep suggestions. */
export function RiskCard({ result, suggestions, onMask, onKeep }: {
  result: VeilResult; suggestions: Clue[]; onMask: (q: string) => void; onKeep: (q: string) => void;
}) {
  if (result.mode === "rules-only") {
    return <div className="risk risk-unknown"><strong>Guess Who skipped</strong> — needs on-device AI.</div>;
  }
  const rounds = result.rounds;
  if (rounds.length === 0) {
    const skipped = result.stages.find((s) => s.stage === "attack" && s.note.startsWith("skipped"));
    if (skipped || result.stage === "done") {
      return <div className="risk"><strong>Guess Who</strong> <span className="muted">— {skipped ? skipped.note : "not needed"}.</span></div>;
    }
    return <div className="risk"><strong>Guess Who</strong> <span className="muted">— waiting for detection…</span></div>;
  }
  const first = rounds[0].visible;
  // Short, specific clues were already masked automatically; what's left is waiting for the user.
  const level = riskOf(suggestions.length);
  return (
    <div className={`risk risk-${level}`}>
      <div className="risk-head">
        <strong>Guess Who:</strong> could a stranger work out who this is?
        <span className="badge">{level.toUpperCase()}</span>
      </div>
      <div className="meter" aria-hidden>
        <i style={{ width: level === "low" ? "12%" : level === "medium" ? "55%" : "90%", background: level === "low" ? "var(--ok)" : level === "medium" ? "var(--warn)" : "var(--bad)" }} />
      </div>
      <p className="small muted">
        An on-device attacker tried to identify the person from the masked text and found {first} clue{first === 1 ? "" : "s"}.
        {" "}{rounds.length > 1 ? `Veil masked the specific ones and checked again. ` : ""}
        {suggestions.length ? `${suggestions.length} need${suggestions.length === 1 ? "s" : ""} your decision.` : "Nothing identifying is left."}
      </p>
      {suggestions.length > 0 && (
        <ul className="suggest">
          {suggestions.map((c) => (
            <li key={c.quote}>
              <q>{c.quote}</q> <span className="muted small">{c.why}</span>
              <span className="actions">
                <button onClick={() => onMask(c.quote)}>Mask</button>
                <button className="ghost" onClick={() => onKeep(c.quote)}>Keep</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The cloud's answer with real values restored — each value decrypts into place with a teal glow,
 * so you can see exactly what was put back on this device.
 */
export function RestoredView({ raw, vault, reserved }: { raw: string; vault: Map<string, string>; reserved: Set<string> }) {
  const re = new RegExp(LOOSE_PLACEHOLDER_RE.source, "g");
  const parts: React.ReactNode[] = [];
  let cur = 0, i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const id = m[1].toUpperCase();
    const v = reserved.has(id) ? undefined : vault.get(id);
    if (m.index > cur) parts.push(<Fragment key={`t${i}`}>{raw.slice(cur, m.index)}</Fragment>);
    parts.push(v === undefined ? <Fragment key={`k${i}`}>{m[0]}</Fragment> : (
      <motion.span key={`v${i}`} className="restored" title={`restored on this device · was ${m[0]}`}
        initial={{ backgroundColor: "rgba(45,212,191,.35)", boxShadow: "0 0 18px rgba(45,212,191,.6)" }}
        animate={{ backgroundColor: "rgba(45,212,191,.08)", boxShadow: "0 0 0px rgba(45,212,191,0)" }}
        transition={{ duration: 1.8, delay: 0.3 + Math.min(i, 24) * 0.06 }}>
        <Scramble text={v} duration={700} />
      </motion.span>
    ));
    cur = m.index + m[0].length;
    i++;
  }
  if (cur < raw.length) parts.push(<Fragment key="end">{raw.slice(cur)}</Fragment>);
  return <div className="doc prose">{parts}</div>;
}

/** A short burst of teal particles — the "your data came home" moment. Pure DOM, no WebGL. */
export function Burst() {
  const dots = Array.from({ length: 18 }, (_, k) => {
    const a = (k / 18) * Math.PI * 2;
    return { x: Math.cos(a) * (40 + (k % 3) * 18), y: Math.sin(a) * (26 + (k % 4) * 10) };
  });
  return (
    <span className="burst" aria-hidden>
      {dots.map((d, k) => (
        <motion.i key={k} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: d.x, y: d.y, opacity: 0, scale: 0.3 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: k * 0.01 }} />
      ))}
    </span>
  );
}

/** 1 Paste → 2 Review → 3 Ask. Always visible so it's obvious what to do next. */
export function StepGuide({ step, running }: { step: 1 | 2 | 3; running: boolean }) {
  const items = [
    { t: "Paste or pick a sample", d: "Your text never leaves this device" },
    { t: running ? "Veil is checking…" : "Review what's hidden", d: "Click a highlight to keep it visible" },
    { t: "Ask the cloud", d: "Only tags travel; answers come back real" },
  ];
  return (
    <div className="steps-guide">
      {items.map((it, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        return (
          <motion.div key={i} layout className={`s ${n === step ? "on" : n < step ? "done" : ""}`}>
            <b>{n < step ? "✓" : n}</b>
            <div>{it.t}<small>{it.d}</small></div>
          </motion.div>
        );
      })}
    </div>
  );
}

/** The hybrid boundary, live: device → cloud carries only tags; the answer comes back and is restored locally. */
export function Channel({ sending, answered, values }: { sending: boolean; answered: boolean; values: number }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const label = !online ? "offline — on-device protection still works"
    : sending ? "sending tags only…" : answered ? "answer restored on this device" : `${values} values will stay here`;
  return (
    <div className="channel" aria-live="polite">
      <span className="node d" style={{ position: "relative" }}>● this device{answered && !sending && <Burst key={values} />}</span>
      <div className={`wire ${online ? "" : "off"}`}>
        <AnimatePresence>
          {online && sending && [0, 1, 2].map((k) => (
            <motion.span key={`up${k}`} className="pkt" style={{ background: "var(--device)", boxShadow: "0 0 14px var(--device)" }}
              initial={{ left: "0%", opacity: 0 }} animate={{ left: "94%", opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.1, delay: k * 0.25, repeat: Infinity, repeatDelay: 0.3, ease: "easeInOut" }} />
          ))}
          {online && answered && !sending && [0, 1].map((k) => (
            <motion.span key={`down${k}`} className="pkt" style={{ background: "var(--cloud)", boxShadow: "0 0 14px var(--cloud)" }}
              initial={{ left: "94%", opacity: 0 }} animate={{ left: "0%", opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.1, delay: k * 0.25, ease: "easeInOut" }} />
          ))}
        </AnimatePresence>
      </div>
      <span className={`node c ${online ? "" : "off"}`} style={{ position: "relative" }}>cloud ●</span>
      <span className="muted" style={{ minWidth: 220 }}>{label}</span>
    </div>
  );
}

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  const total = Object.values(receipt.heldBack).reduce((a, b) => a + b, 0);
  const download = () => {
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `veil-receipt-${receipt.createdAt.slice(0, 10)}-${receipt.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="receipt">
      <div className="receipt-head">
        <h2>Privacy receipt</h2>
        <button className="ghost" onClick={download}>Download</button>
      </div>
      <p><strong>{total}</strong> personal values stayed on this device. The cloud received only placeholders.</p>
      <div className="kinds">
        {Object.entries(receipt.heldBack).map(([k, n]) => <span key={k} className="chip">{k.replace(/_/g, " ").toLowerCase()} × {n}</span>)}
      </div>
      <dl>
        <dt>Detection</dt><dd>{receipt.mode === "full" ? "On-device Gemini Nano + rules" : "Rules only (safe mode)"}</dd>
        <dt>Reasoning</dt><dd>Cloud Gemini ({receipt.cloud.model}) · masked text only</dd>
        <dt>Residual clues</dt><dd>{receipt.residualClues}</dd>
        <dt>Leak check</dt><dd>Passed on the exact payload{receipt.leakGate.autoMasked ? ` · caught ${receipt.leakGate.autoMasked} more` : ""}</dd>
        <dt>Payload SHA-256</dt><dd className="mono">{receipt.payloadSha256.slice(0, 16)}…</dd>
        <dt>When</dt><dd>{new Date(receipt.createdAt).toLocaleString()}</dd>
      </dl>
    </div>
  );
}
