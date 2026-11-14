// The Veil pipeline: rules → on-device names/places → on-device clues → "Guess Who" attacker.
// Model calls are injected so the same code runs in the app, the spike/benchmark and tests.
import type { Category, RegionId, Span } from "./types";
import { packsFor, runRules, protectedRanges, neverMaskTerms, modelView, type Pack } from "./packs";
import { SpanTools, PERSONAL_RE } from "./spans";
import { mask, type MaskResult } from "./placeholders";

export interface Clue { quote: string; why: string }

export interface ModelCall<T> { data: T; ms: number; source?: string }

export interface Detector {
  direct(text: string): Promise<ModelCall<{ items: { text: string; category: Category }[] }>>;
  indirect(text: string): Promise<ModelCall<{ items: { text: string; category: Category }[] }>>;
  attack(maskedText: string): Promise<ModelCall<{ clues: Clue[] }>>;
}

export type Stage = "rules" | "direct" | "indirect" | "attack" | "done";

export interface StageLog { stage: Stage; ms: number; source?: string; note: string; failed?: boolean }

export interface VeilResult {
  spans: Span[];
  suggestions: Clue[];
  rounds: { visible: number; clues: Clue[] }[];
  stages: StageLog[];
  stage: Stage;
  packs: Pack[];
  /** "full" = on-device model ran; "rules-only" = safe mode (no model on this device). */
  mode: "full" | "rules-only";
  /** An on-device step failed or timed out; results are rules + whatever succeeded. */
  degraded: boolean;
  /** Text contains non-Latin scripts that on-device detection doesn't cover yet. */
  nonLatin: boolean;
  ms: number;
}

export interface RunOptions {
  regions: RegionId[];
  /** null → safe mode: rules only. */
  detector: Detector | null;
  /** Round 1 always runs; extra rounds only while the attacker still finds maskable clues. */
  maxRounds?: number;
  onUpdate?: (r: VeilResult) => void;
}

/** If a model pass returns this many names, there are probably more: hide them and ask again. */
const RESCAN_AT = 20;
const NON_LATIN = /[Ѐ-ӿ֐-׿؀-ۿऀ-෿฀-๿぀-ヿ一-鿿가-힯]/;

export function riskOf(visible: number): "low" | "medium" | "high" {
  return visible === 0 ? "low" : visible <= 2 ? "medium" : "high";
}

export const spanKey = (s: { start: number; end: number }) => `${s.start}:${s.end}`;

/**
 * ~1,500 tokens per chunk keeps prompt + output well under Gemini Nano's on-device limit
 * (9,216 tokens in Chrome; 4,000 on Android). Splits on paragraph, then sentence boundaries.
 */
export const MAX_CHUNK_CHARS = 6000;

export function chunkText(text: string, max = MAX_CHUNK_CHARS): { offset: number; text: string }[] {
  if (text.length <= max) return [{ offset: 0, text }];
  const out: { offset: number; text: string }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const window = text.slice(start, end);
      const cut = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf("\n"), window.lastIndexOf(". "));
      if (cut > max * 0.5) end = start + cut + 1;
    }
    out.push({ offset: start, text: text.slice(start, end) });
    start = end;
  }
  return out;
}

/** Move chunk-relative spans to whole-document offsets. */
function shift(spans: Span[], offset: number, full: string): Span[] {
  return offset === 0 ? spans : spans.map((s) => ({ ...s, start: s.start + offset, end: s.end + offset, text: full.slice(s.start + offset, s.end + offset) }));
}

/** Replace found spans with same-length blanks, so offsets stay valid for a re-scan. */
function blankOut(text: string, spans: Span[]): string {
  const chars = [...text];
  for (const s of spans) for (let i = s.start; i < s.end && i < chars.length; i++) if (chars[i] !== "\n") chars[i] = "_";
  return chars.join("");
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 120);

export async function runVeil(text: string, opts: RunOptions): Promise<VeilResult> {
  const t0 = performance.now();
  const packs = packsFor(opts.regions);
  const tools = new SpanTools(neverMaskTerms(packs));
  const prot = protectedRanges(text, packs);
  const stages: StageLog[] = [];
  const rounds: VeilResult["rounds"] = [];
  const suggestions: Clue[] = [];
  const suggestionKeys = new Set<string>();
  const mode = opts.detector ? "full" : "rules-only";
  const nonLatin = NON_LATIN.test(text);
  let degraded = false;
  let stage: Stage = "rules";

  let spans = tools.merge(text, runRules(text, packs), prot);
  // Propagate rule-found names right away, so "Arjun" is masked even if the model never runs.
  spans = tools.merge(text, [...spans, ...tools.propagate(text, spans)], prot);
  stages.push({ stage: "rules", ms: Math.round(performance.now() - t0), note: `${spans.length} matches (${packs.map((p) => p.id).join("+")})` });

  const snapshot = (): VeilResult => ({
    spans, suggestions: [...suggestions], rounds: [...rounds], stages: [...stages], stage, packs, mode, degraded, nonLatin,
    ms: Math.round(performance.now() - t0),
  });
  const emit = (s: Stage) => { stage = s; opts.onUpdate?.(snapshot()); };
  const addSpans = (more: Span[]) => {
    spans = tools.merge(text, [...spans, ...more], prot);
    spans = tools.merge(text, [...spans, ...tools.propagate(text, spans)], prot);
  };
  const fail = (s: Stage, e: unknown) => {
    degraded = true;
    stages.push({ stage: s, ms: 0, failed: true, note: `failed — ${errMsg(e)}` });
  };

  const det = opts.detector;
  if (det) {
    const chunks = chunkText(text);
    const chunkNote = chunks.length > 1 ? ` across ${chunks.length} chunks` : "";

    // ---- Names & places, chunk by chunk (the on-device model has a context limit) ----
    emit("direct");
    try {
      let ms = 0, n = 0, fz = 0, source: string | undefined;
      for (const c of chunks) {
        const view = modelView(c.text); // same length, model-friendly copy
        let scan = view;
        for (let pass = 0; pass < 3; pass++) {
          const d = await det.direct(scan);
          const ld = tools.locate(view, d.data.items ?? [], "direct");
          const found = tools.clean(shift(ld.spans, c.offset, text));
          addSpans(found);
          ms += d.ms; n += d.data.items?.length ?? 0; fz += ld.fuzzy.length; source = d.source;
          opts.onUpdate?.(snapshot());
          if ((d.data.items?.length ?? 0) < RESCAN_AT) break;
          // Long list of people: hide everything found so far and ask for the rest.
          const local = spans.filter((s) => s.start >= c.offset && s.end <= c.offset + c.text.length)
            .map((s) => ({ ...s, start: s.start - c.offset, end: s.end - c.offset }));
          scan = blankOut(view, local);
        }
      }
      stages.push({ stage: "direct", ms, source, note: `${n} names & places${chunkNote}` + (fz ? `, ${fz} fuzzy` : "") });
    } catch (e) { fail("direct", e); }

    // ---- Indirect clues — only if the text is about someone ----
    const personal = spans.length > 0 || PERSONAL_RE.test(text);
    if (!personal) {
      stages.push({ stage: "indirect", ms: 0, note: "skipped — no person in this text" });
    } else {
      emit("indirect");
      try {
        let ms = 0, n = 0, fz = 0, source: string | undefined;
        for (const c of chunks) {
          const view = modelView(c.text);
          const i = await det.indirect(view);
          const li = tools.locate(view, i.data.items ?? [], "indirect");
          addSpans(tools.clean(shift(li.spans, c.offset, text)));
          ms += i.ms; n += i.data.items?.length ?? 0; fz += li.fuzzy.length; source = i.source;
          opts.onUpdate?.(snapshot());
        }
        stages.push({ stage: "indirect", ms, source, note: `${n} indirect clues${chunkNote}` + (fz ? `, ${fz} fuzzy` : "") });
      } catch (e) { fail("indirect", e); }
    }

    // ---- "Guess Who" attacker: reads the whole masked text, so only when it fits ----
    if (!personal) stages.push({ stage: "attack", ms: 0, note: "skipped — no person in this text" });
    else if (chunks.length > 1) stages.push({ stage: "attack", ms: 0, note: "skipped — document too long for one on-device pass" });
    const maxRounds = !personal || chunks.length > 1 ? 0 : opts.maxRounds ?? 2;
    try {
      for (let r = 0; r < maxRounds; r++) {
        emit("attack");
        const masked = modelView(mask(text, spans).masked);
        const a = await det.attack(masked);
        const seen = new Set<string>();
        const apply: Clue[] = [];
        const suggest: Clue[] = [];
        for (const c of a.data.clues ?? []) {
          const key = tools.clueKey(c.quote);
          if (!key || seen.has(key)) continue;
          seen.add(key);
          const kind = tools.classifyClue(masked, c.quote);
          if (kind === "apply") apply.push(c);
          else if (kind === "suggest") {
            suggest.push(c);
            if (!suggestionKeys.has(key)) { suggestionKeys.add(key); suggestions.push(c); }
          }
        }
        rounds.push({ visible: apply.length + suggest.length, clues: [...apply, ...suggest] });
        stages.push({ stage: "attack", ms: a.ms, source: a.source, note: `round ${r + 1}: ${apply.length} masked, ${suggest.length} suggested` });
        if (apply.length === 0) break;
        const extra = tools.clean(tools.quotesToSpans(text, apply.map((c) => c.quote)));
        if (extra.length === 0) break;
        addSpans(extra);
      }
    } catch (e) { fail("attack", e); }
  }
  emit("done");
  return snapshot();
}

/**
 * Apply the user's decisions on top of the pipeline result:
 * keep    = span keys the user chose NOT to mask
 * accept  = suggestion quotes the user chose to mask
 */
export function applyDecisions(text: string, res: VeilResult, keep: Set<string>, accept: string[]) {
  const tools = new SpanTools(neverMaskTerms(res.packs));
  const extra = tools.clean(tools.quotesToSpans(text, accept));
  const merged = tools.merge(text, [...res.spans, ...extra], protectedRanges(text, res.packs));
  return merged.filter((s) => !keep.has(spanKey(s)));
}

/** Mask options derived from the active packs (amount bands in the pack's currency). */
export function maskOptionsFor(packs: Pack[]) {
  return { amountHints: true, currency: packs.find((p) => p.currency)?.currency };
}

export const PAYLOAD_SEPARATOR = "\n\n---\n";

/**
 * Build exactly what goes to the cloud: the user's question AND the document, both masked with one
 * shared vault — so "Rohan Mehta" typed in the question gets the same placeholder as in the document.
 */
export interface LeakGate {
  /** Rule matches that were not masked yet and got masked by the gate itself. */
  autoMasked: string[];
  /** Hidden values that would still appear in the payload. If non-empty, sending must be blocked. */
  blocked: string[];
}

export function buildCloudPayload(args: {
  question: string; questionSpans: Span[]; doc: string; docSpans: Span[]; packs: Pack[];
}): MaskResult & { payload: string; maskedQuestion: string; gate: LeakGate } {
  const { question, doc, packs } = args;
  const combined = `${question}${PAYLOAD_SEPARATOR}${doc}`;
  const off = question.length + PAYLOAD_SEPARATOR.length;
  const tools = new SpanTools(neverMaskTerms(packs));
  const prot = protectedRanges(combined, packs);
  // Re-run rules on the question (cheap, deterministic) on top of whatever the caller detected.
  const qRules = runRules(question, packs);
  let spans = tools.merge(combined, [
    ...qRules, ...args.questionSpans,
    ...args.docSpans.map((s) => ({ ...s, start: s.start + off, end: s.end + off })),
  ], prot);
  // Any value already masked in the document is masked wherever it appears in the question.
  const values = [...new Set(args.docSpans.map((s) => s.text).filter((v) => v.length >= 3))];
  const escQ = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const extra: Span[] = [];
  for (const v of values) {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escQ(v)}(?![\\p{L}\\p{N}])`, "gu");
    for (const m of question.matchAll(re)) {
      const src = args.docSpans.find((s) => s.text === v)!;
      extra.push({ ...src, start: m.index!, end: m.index! + v.length, text: v });
    }
  }
  spans = tools.merge(combined, [...spans, ...extra], prot);
  spans = tools.merge(combined, [...spans, ...tools.propagate(combined, spans)], prot);

  // ---- Leak gate (fail-closed) ----
  // 1. High-precision IDs (PAN, Aadhaar, card, IBAN, SSN, secrets…) are never allowed out, from any
  //    region's rules — even if a model step failed or the user un-masked one by accident.
  const strongKinds = new Set(packsFor(["IN", "EU", "UK", "US"]).flatMap((p) => p.rules.filter((r) => r.strong).map((r) => r.kind)));
  const uncovered = runRules(combined, packsFor(["IN", "EU", "UK", "US"]))
    .filter((r) => strongKinds.has(r.kind ?? "") && !spans.some((s) => s.start <= r.start && s.end >= r.end));
  if (uncovered.length) spans = tools.merge(combined, [...spans, ...uncovered], prot);
  const m = mask(combined, spans, maskOptionsFor(packs));

  // 2. No hidden value may appear anywhere in the payload (any case, any spacing, whole words only).
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blocked = [...new Set([...m.vault.values()])].filter((v) => {
    if (v.trim().length < 4) return false;
    const pattern = v.trim().split(/\s+/).map(esc).join("[\\s\\u200B-\\u200D\\uFEFF]*");
    return new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "iu").test(m.masked);
  });

  const sep = m.masked.indexOf(PAYLOAD_SEPARATOR);
  return {
    ...m, payload: m.masked, maskedQuestion: sep >= 0 ? m.masked.slice(0, sep) : m.masked,
    gate: { autoMasked: uncovered.map((u) => u.kind ?? u.category), blocked },
  };
}
