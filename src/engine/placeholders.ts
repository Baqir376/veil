// Meaningful placeholders: the cloud learns WHAT kind of value was hidden (PAN vs Aadhaar, rough size
// of an amount) but never the value itself. The vault stays in memory on this device.
import type { Category, Span } from "./types";
import { PLACEHOLDER_RE, LOOSE_PLACEHOLDER_RE } from "./spans";

const CATEGORY_LABEL: Record<Category, string> = {
  PERSON: "PERSON", ORG: "ORG", LOCATION: "PLACE", GOV_ID: "ID", FINANCIAL_ID: "ACCOUNT",
  CONTACT: "CONTACT", AMOUNT: "AMOUNT", DATE: "DATE", HEALTH: "HEALTH", SENSITIVE: "SENSITIVE", QUASI: "CLUE", OTHER: "PRIVATE",
};

export type Currency = "INR" | "EUR" | "GBP" | "USD";

export interface MaskOptions {
  /** Add a coarse size band to amounts, e.g. [AMOUNT_1 · ₹15–20L], so tax slabs and thresholds still work. */
  amountHints?: boolean;
  currency?: Currency;
}

export interface MaskResult {
  masked: string;
  /** placeholder id (e.g. "PAN_1") → original value. Never persisted, never sent. */
  vault: Map<string, string>;
  /** Placeholder-like tokens that were already in the user's text (e.g. a template's "[PERSON_1]"). Never reused, never restored. */
  reserved: Set<string>;
}

/** Parse "18,45,000", "2.3 crore", "7,800", "7.800,50" into a number. */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().toLowerCase();
  let mult = 1;
  const unit = s.match(/\s?(lakhs?|crores?|cr|l)$/);
  if (unit) {
    mult = unit[1].startsWith("l") ? 1e5 : 1e7;
    s = s.slice(0, unit.index).trim();
  }
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // European format
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n * mult : null;
}

const SYMBOL: Record<Currency, string> = { INR: "₹", EUR: "€", GBP: "£", USD: "$" };

/** Coarse band, wide enough not to identify anyone, narrow enough for slab/threshold reasoning. */
export function amountBand(n: number, currency: Currency): string {
  const sym = SYMBOL[currency];
  if (currency === "INR") {
    const L = 1e5, Cr = 1e7;
    const edges: [number, string][] = [
      [L, `<${sym}1L`], [5 * L, `${sym}1–5L`], [10 * L, `${sym}5–10L`], [15 * L, `${sym}10–15L`],
      [20 * L, `${sym}15–20L`], [30 * L, `${sym}20–30L`], [50 * L, `${sym}30–50L`], [Cr, `${sym}50L–1Cr`],
      [5 * Cr, `${sym}1–5Cr`],
    ];
    for (const [lim, label] of edges) if (n < lim) return label;
    return `>${sym}5Cr`;
  }
  const edges: [number, string][] = [
    [1e3, `<${sym}1k`], [5e3, `${sym}1–5k`], [1e4, `${sym}5–10k`], [2.5e4, `${sym}10–25k`],
    [5e4, `${sym}25–50k`], [1e5, `${sym}50–100k`], [1e6, `${sym}100k–1M`],
  ];
  for (const [lim, label] of edges) if (n < lim) return label;
  return `>${sym}1M`;
}

/** Replace spans with stable, meaningful placeholders. The same value always gets the same placeholder. */
export function mask(text: string, spans: Span[], opts: MaskOptions = {}): MaskResult {
  const vault = new Map<string, string>();
  const byValue = new Map<string, string>(); // original → token
  const counters: Record<string, number> = {};
  // Tokens already present in the user's own text must never collide with ours.
  const reserved = new Set([...text.matchAll(new RegExp(PLACEHOLDER_RE.source, "g"))].map((m) => m[1]));
  let out = "";
  let cursor = 0;
  for (const s of [...spans].sort((a, b) => a.start - b.start)) {
    if (s.start < cursor) continue;
    const original = s.alias ?? text.slice(s.start, s.end);
    let token = byValue.get(original);
    if (!token) {
      const label = s.kind && s.kind !== "AMOUNT" ? s.kind : CATEGORY_LABEL[s.category];
      let id: string;
      do {
        counters[label] = (counters[label] ?? 0) + 1;
        id = `${label}_${counters[label]}`;
      } while (reserved.has(id));
      let hint = "";
      if (opts.amountHints && s.category === "AMOUNT" && opts.currency) {
        const n = parseAmount(original);
        if (n !== null) hint = ` · ${amountBand(n, opts.currency)}`;
      }
      token = `[${id}${hint}]`;
      byValue.set(original, token);
      vault.set(id, original);
    }
    out += text.slice(cursor, s.start) + token;
    cursor = s.end;
  }
  return { masked: out + text.slice(cursor), vault, reserved };
}

export interface RehydrateResult {
  text: string;
  /** Placeholders in the answer that we never issued — the cloud made them up. */
  invented: string[];
  /** Placeholders we issued that the answer doesn't mention (informational). */
  unused: string[];
}

/** Put real values back into the cloud's answer, on the device. Accepts [ID] and [ID · hint]. */
export function rehydrate(answer: string, vault: Map<string, string>, reserved: Set<string> = new Set()): RehydrateResult {
  const seen = new Set<string>();
  const invented = new Set<string>();
  const text = answer.replace(new RegExp(LOOSE_PLACEHOLDER_RE.source, "g"), (whole, raw: string) => {
    const id = raw.toUpperCase();
    if (reserved.has(id)) return whole; // the user's own template token — leave it exactly as is
    const v = vault.get(id);
    if (v === undefined) { invented.add(whole); return whole; }
    seen.add(id);
    return v;
  });
  return { text, invented: [...invented], unused: [...vault.keys()].filter((k) => !seen.has(k)) };
}
