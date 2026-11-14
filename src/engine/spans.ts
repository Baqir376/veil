// Turning model output into safe, minimal spans — and keeping the model from over-masking.
import type { Category, Span } from "./types";

// Function words and generic finance/admin words: a phrase made only of these carries no identity.
const BASE_STOPWORDS = `a an the and or but if of to in on at by for from with without into onto over under
about above below after before between during through via per as is are was were be been being am do does did
have has had i me my mine we us our you your he him his she her they them their it its this that these those
there here who whom which what when where why how not no yes so than then too very can could should would will
shall may might must call email reach pay paid please see tell reply send sent get got also just only still
appears reported unreported shows show handles handle like next week day days month year years
does match matches form fee fees income interest salary rent amount amounts tax taxes bank account
notice reply return due total payment invoice overdue client
lives live living lived works work working worked stays stay staying called calls says said wants
uses used using needs need needed sends send document text sample page click turn open load run
salaried employed self-employed retired
phone mobile email mail address name card cvv cvc key api api_key token password customer details
space inside zero-width width letters digits look latin full number numbers id
monday tuesday wednesday thursday friday saturday sunday today tomorrow yesterday tonight morning evening
january february march april may june july august september october november december
whatsapp gmail google outlook instagram facebook linkedin telegram zoom teams excel chatgpt gemini wifi wi-fi`.split(/\s+/);

const HONORIFICS = new Set("mr mrs ms miss dr shri smt sri kumari prof sir madam ji bhai sahab".split(" "));

/** Signals that a text is about a specific person. Without them, clue-hunting is skipped. */
export const PERSONAL_RE = /\b(?:he|she|him|his|her|hers|my\s+(?:client|wife|husband|son|daughter|mother|father|boss|employee|patient|friend|neighbou?r)|client|patient|employee|customer|tenant|applicant|candidate|wife|husband|son|daughter|twins?|mother|father|mr|mrs|ms|dr|shri|smt)\b\.?/i;

export const MAX_MODEL_SPAN = 60;
export const MAX_CLUE_WORDS = 6;
export const MAX_SUGGEST_WORDS = 12;
const STRUCTURED = new Set<Category>(["AMOUNT", "GOV_ID", "FINANCIAL_ID", "CONTACT"]);
const EDGE = /[\s,.;:()"'“”‘’]/;
export const PLACEHOLDER_RE = /\[([A-Z][A-Z0-9_]*_\d+)(?:\s*·[^\]]*)?\]/g;
/** Tolerant form for reading the cloud's answer: any case, optional hint after ·, •, |, :, - or a space. */
export const LOOSE_PLACEHOLDER_RE = /\[\s*([A-Za-z][A-Za-z0-9_]*?_\d+)\s*(?:[·•|:\-–—\s][^\]\n]*)?\]/g;

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’,.@/-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu;
const MAX_GAP_WORDS = 2;

/** Shortest window in `text` containing all words of `phrase` in order, at most 2 extra words between each. */
export function fuzzyWindow(text: string, phrase: string): { start: number; end: number } | null {
  const norm = (w: string) => w.toLowerCase().replace(/[.,]+$/, "");
  const want = (phrase.match(WORD_RE) ?? []).map(norm);
  if (want.length === 0) return null;
  const toks = [...text.matchAll(WORD_RE)].map((m) => ({ w: norm(m[0]), start: m.index!, end: m.index! + m[0].length }));
  let best: { start: number; end: number } | null = null;
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].w !== want[0]) continue;
    let j = i, k = 1;
    while (k < want.length) {
      let found = -1;
      for (let g = j + 1; g <= Math.min(toks.length - 1, j + 1 + MAX_GAP_WORDS); g++) if (toks[g].w === want[k]) { found = g; break; }
      if (found < 0) break;
      j = found; k++;
    }
    if (k < want.length) continue;
    const cand = { start: toks[i].start, end: toks[j].end };
    if (cand.end - cand.start > MAX_MODEL_SPAN) continue;
    if (!best || cand.end - cand.start < best.end - best.start) best = cand;
  }
  return best;
}

/** Location kinds that are codes and stay separate placeholders even when adjacent to an address. */
const CODE_KINDS = new Set(["PIN_CODE", "POSTCODE", "ZIP"]);

export class SpanTools {
  private stop: Set<string>;
  private never: string[];
  private neverLower: Set<string>;

  constructor(neverMask: string[]) {
    this.never = neverMask;
    this.neverLower = new Set(neverMask.map((t) => t.toLowerCase()));
    this.stop = new Set(BASE_STOPWORDS);
    for (const t of neverMask) for (const w of t.toLowerCase().split(/\s+/)) this.stop.add(w);
  }

  /** True if the phrase contains at least one specific (non-generic) word of 3+ characters. */
  isSpecific(phrase: string): boolean {
    const words = phrase.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
    return words.some((w) => w.length >= 3 && !this.stop.has(w));
  }

  /**
   * Locate model-reported strings in the text. Exact match first; if the model paraphrased
   * ("wife handles FD" for "wife Sneha handles the FD"), fall back to the shortest window that
   * contains the same words in the same order with small gaps.
   */
  locate(text: string, items: { text: string; category: Category }[], origin: string) {
    const spans: Span[] = [];
    const notFound: string[] = [];
    const fuzzy: string[] = [];
    for (const item of items) {
      const needle = (item.text ?? "").trim();
      if (needle.length < 2) continue;
      let idx = text.indexOf(needle);
      if (idx >= 0) {
        while (idx >= 0) {
          spans.push({ start: idx, end: idx + needle.length, text: needle, category: item.category, source: "nano", origin });
          idx = text.indexOf(needle, idx + needle.length);
        }
        continue;
      }
      const win = fuzzyWindow(text, needle);
      if (win) {
        spans.push({ ...win, text: text.slice(win.start, win.end), category: item.category, source: "nano", origin: `${origin}~fuzzy` });
        fuzzy.push(needle);
      } else notFound.push(needle);
    }
    return { spans, notFound, fuzzy };
  }

  /** Drop model spans that are too long, cross a line, are generic, or are a protected term. */
  clean(spans: Span[]): Span[] {
    return spans.filter((s) => {
      const t = s.text.trim();
      if (t.length > MAX_MODEL_SPAN || /\n/.test(t)) return false;
      if (this.neverLower.has(t.toLowerCase())) return false;
      if (new RegExp(PLACEHOLDER_RE.source).test(t)) return false; // the model echoed a placeholder, not a value
      if (!/[\d@]/.test(t) && !this.isSpecific(t)) return false;
      return true;
    });
  }

  private trim(text: string, start: number, end: number) {
    while (start < end && EDGE.test(text[start])) start++;
    while (end > start && EDGE.test(text[end - 1])) end--;
    return { start, end };
  }

  /** Every occurrence of a never-mask term in the text (word-bounded, any case). Model spans are cut around these. */
  private termRanges(text: string): { start: number; end: number }[] {
    const out: { start: number; end: number }[] = [];
    for (const term of this.never) {
      const re = new RegExp(`(?<![A-Za-z0-9])${term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(?![A-Za-z0-9])`, "gi");
      for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length });
    }
    return out;
  }

  /**
   * Merge spans. Precedence: protected ranges (never masked) > rule spans (exact) > model spans (loose).
   * Model spans are cut around higher-precedence ranges; leftover fragments that are only context are dropped.
   */
  merge(text: string, spans: Span[], protectedRanges: { start: number; end: number }[] = []): Span[] {
    // Rules never mask protected ranges either (e.g. "2026" inside "AY 2026-27").
    // Label-based name rules are fuzzy by nature ("Dear Tax Officer"), so they are treated like the
    // direct model pass: cut around protected terms, and never allowed to override exact ID rules.
    const isNameRule = (s: Span) => s.source === "rule" && s.category === "PERSON";
    const rules = spans.filter((s) => s.source === "rule" && !isNameRule(s) && !protectedRanges.some((p) => s.start < p.end && s.end > p.start));
    const base = [...protectedRanges, ...this.termRanges(text), ...rules];
    const model = spans.filter((s) => s.source !== "rule" || isNameRule(s));
    // Precedence among model spans: names/orgs/places (direct pass + name rules) are cut first;
    // broader clues (indirect pass, attacker) are then cut around them so they can't swallow a name.
    const isDirect = (s: Span) => (s.origin ?? "").startsWith("direct") || isNameRule(s);
    const direct = this.cut(text, model.filter(isDirect), base);
    const broad = this.cut(text, model.filter((s) => !isDirect(s)), [...base, ...direct]);
    return this.combine(text, [...rules, ...direct, ...broad]);
  }

  /** Cut model spans around blocker ranges; drop fragments that are only context. */
  private cut(text: string, model: Span[], blockers: { start: number; end: number }[]): Span[] {
    const pieces: Span[] = [];
    for (const m of model) {
      let segs = [{ start: m.start, end: m.end }];
      for (const b of blockers) {
        segs = segs.flatMap((g) => {
          if (b.end <= g.start || b.start >= g.end) return [g];
          const parts: { start: number; end: number }[] = [];
          if (b.start > g.start) parts.push({ start: g.start, end: b.start });
          if (b.end < g.end) parts.push({ start: b.end, end: g.end });
          return parts;
        });
      }
      for (const g of segs) {
        const { start, end } = this.trim(text, g.start, g.end);
        if (end - start < 2) continue;
        const frag = text.slice(start, end);
        if (this.neverLower.has(frag.toLowerCase()) || /^(Rs\.?|INR|EUR|GBP|USD|a\/c)$/i.test(frag)) continue;
        const piece: Span = { ...m, start, end, text: frag };
        if (STRUCTURED.has(m.category) && !/[\d@]/.test(frag)) {
          // A digit-free fragment of an amount/ID span is either a name ("Rohan Mehta") or just context.
          if (/\b(?:Bank|Ltd|Limited|GmbH|Inc|LLP|Pvt|AG|SA|plc)\b/.test(frag)) piece.category = "ORG";
          else if (/^(?:[A-Z][\p{L}'’-]+)(?:\s+[A-Z][\p{L}'’-]+){0,3}$/u.test(frag)) piece.category = "PERSON";
          else continue;
        }
        if (!/[\d@]/.test(frag) && !this.isSpecific(frag)) continue;
        pieces.push(piece);
      }
    }
    return pieces;
  }

  /** Resolve overlaps (rules win) and join adjacent address pieces into one place. */
  private combine(text: string, spans: Span[]): Span[] {
    const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end || (a.source === "rule" ? -1 : 1));
    const out: Span[] = [];
    for (const s of sorted) {
      const last = out[out.length - 1];
      if (last && s.start < last.end) {
        if (s.end > last.end && last.source !== "rule" && s.source !== "rule") {
          last.end = s.end;
          last.text = text.slice(last.start, last.end);
        }
        continue;
      }
      const joinable = (x: Span) => x.category === "LOCATION" && !CODE_KINDS.has(x.kind ?? "");
      if (last && joinable(last) && joinable(s) && /^[\s,]+$/.test(text.slice(last.end, s.start))) {
        last.end = s.end;
        last.text = text.slice(last.start, last.end);
        last.kind = undefined; // becomes a generic PLACE
        continue;
      }
      out.push({ ...s });
    }
    return out;
  }

  /**
   * Classify an attacker clue quoted from the masked text:
   * apply   = short, specific, still visible → mask automatically
   * suggest = visible but long or mixed with placeholders → user decides
   * ignore  = generic, or only points at values that are already masked
   */
  classifyClue(maskedText: string, quote: string): "apply" | "suggest" | "ignore" {
    const parts = quote.split(PLACEHOLDER_RE).filter((_, i) => i % 2 === 0); // drop captured labels
    const literal = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!literal || !this.isSpecific(literal)) return "ignore";
    if (!parts.some((p) => p.trim().length >= 3 && maskedText.includes(p.trim()))) return "ignore";
    // The attacker quoting half the document isn't evidence — it's noise.
    if (/\n/.test(quote.trim()) || literal.split(" ").length > MAX_SUGGEST_WORDS) return "ignore";
    // Placeholders inside the quote are already safe; judge only the visible words.
    return literal.split(" ").length <= MAX_CLUE_WORDS ? "apply" : "suggest";
  }

  /** Normalised key so "My wife [PERSON_2] handles the FD." and "Wife [PERSON_2] handles the FD" dedupe. */
  clueKey(quote: string): string {
    return quote.replace(PLACEHOLDER_RE, " ").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/).filter((w) => w && !["my", "the", "a", "an", "his", "her", "their", "our"].includes(w)).join(" ");
  }

  /**
   * Propagate names: every other occurrence of a detected person/organisation is masked too, and the
   * parts of a person's name ("Arjun", "Mehta", "Rohan's") are masked with the SAME placeholder as the
   * full name, so the cloud still knows they are one person.
   */
  propagate(text: string, spans: Span[]): Span[] {
    const extra: Span[] = [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const add = (needle: string, s: Span, alias?: string, isPart = false) => {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(needle)}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of text.matchAll(re)) {
        const start = m.index!, end = start + m[0].length;
        if (spans.some((x) => x.start <= start && x.end >= end)) continue;
        // A lone name part ("Mehta") that sits next to another capitalised word belongs to a
        // DIFFERENT full name ("Rohan Mehta" vs "Sneha Mehta") — don't link it to this person.
        if (isPart && (/\p{Lu}[\p{L}'’.-]*[ \t]+$/u.test(text.slice(Math.max(0, start - 30), start)) || /^[ \t]+\p{Lu}/u.test(text.slice(end, end + 3)))) continue;
        extra.push({ start, end, text: m[0], category: s.category, source: "nano", origin: "propagated", alias });
      }
    };
    // Single-word person spans that are part of a longer detected name ("Mehta" in "Mr. Mehta" vs
    // "Rohan Mehta") are linked to that full name so both share one placeholder.
    const fullNames = spans.filter((s) => s.category === "PERSON" && /\s/.test((s.alias ?? s.text).trim())).map((s) => s.alias ?? s.text);
    for (const s of spans) {
      if (s.category !== "PERSON" || s.alias || /\s/.test(s.text.trim())) continue;
      const owner = fullNames.find((f) => f.split(/\s+/).includes(s.text.trim()));
      if (owner) s.alias = owner;
    }

    const seen = new Set<string>();
    for (const s of spans) {
      if (s.category !== "PERSON" && s.category !== "ORG") continue;
      const full = s.alias ?? s.text;
      if (seen.has(full) || full.length < 3) continue;
      seen.add(full);
      add(full, s, s.alias);
      if (s.category !== "PERSON") continue;
      const parts = full.split(/\s+/).map((p) => p.replace(/[.,]$/, ""));
      if (parts.length < 2) continue;
      for (const p of parts) {
        if (p.length < 3 || HONORIFICS.has(p.toLowerCase()) || this.stop.has(p.toLowerCase()) || !/^\p{Lu}/u.test(p)) continue;
        add(p, s, full, true);
      }
    }
    return extra;
  }

  /** Map attacker quotes (from the masked text) back to spans on the original text. */
  quotesToSpans(original: string, quotes: string[]): Span[] {
    const spans: Span[] = [];
    for (const q of quotes) {
      const parts = q.split(PLACEHOLDER_RE).filter((_, i) => i % 2 === 0);
      for (const piece of parts) {
        const p = piece.trim().replace(/^[,.;:]+|[,.;:]+$/g, "").trim();
        if (p.length < 3) continue;
        let idx = original.indexOf(p);
        while (idx >= 0) {
          spans.push({ start: idx, end: idx + p.length, text: p, category: "QUASI", source: "nano", origin: "attacker" });
          idx = original.indexOf(p, idx + p.length);
        }
      }
    }
    return spans;
  }
}
