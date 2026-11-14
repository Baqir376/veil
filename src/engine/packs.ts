// Region rule packs. Layer 1 of detection: deterministic, offline, and the safety net when
// no on-device model exists. In the product these definitions are served by Remote Config.
import type { Category, RegionId, Span } from "./types";

export interface Rule {
  kind: string;          // placeholder label, e.g. "PAN"
  category: Category;
  re: RegExp;            // must have the g flag
  group?: number;        // capture group holding the sensitive value
  /** High-precision identifiers are checked whatever region the user picked. */
  strong?: boolean;
  /** Extra check on a match (checksums, context labels). `at` is the value's index in the normalised text. */
  validate?: (value: string, text: string, at: number) => boolean;
}

export interface Pack {
  id: "COMMON" | "ALWAYS" | RegionId;
  label: string;
  rules: Rule[];
  /** Domain words the cloud needs to reason; never masked. */
  neverMask: string[];
  /** Patterns that are never masked (tax years, legal sections). */
  protect: RegExp[];
  /** Currency for amount hints. */
  currency?: "INR" | "EUR" | "GBP" | "USD";
}

// ---------- validators ----------
const digits = (s: string) => s.replace(/\D/g, "");

export function luhn(num: string): boolean {
  const d = digits(num);
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = +d[d.length - 1 - i];
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}

// Verhoeff checksum (used by Aadhaar).
const VD = [[0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],[3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],
  [5,9,8,7,6,0,4,3,2,1],[6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],[9,8,7,6,5,4,3,2,1,0]];
const VP = [[0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],[8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],
  [4,2,8,6,5,7,3,9,0,1],[2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]];
export function verhoeff(num: string): boolean {
  const d = digits(num);
  let c = 0;
  for (let i = 0; i < d.length; i++) c = VD[c][VP[i % 8][+d[d.length - 1 - i]]];
  return c === 0;
}

/** True if one of the labels appears shortly before position `at`. */
const labelledBefore = (labels: RegExp, window = 30) => (_v: string, text: string, at: number) =>
  labels.test(text.slice(Math.max(0, at - window), at));

// ---------- packs ----------
export const COMMON: Pack = {
  id: "COMMON",
  label: "Common",
  rules: [
    { kind: "EMAIL", category: "CONTACT", re: /[\w.+-]+@[\w-]+\.[\w.-]*[a-z]{2,}/gi },
    { kind: "PHONE", category: "CONTACT", re: /\+\d{1,3}(?:[\s-]?\d{2,5}){2,4}(?!\d)/g },
    { kind: "IP", category: "OTHER", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g },
    { kind: "CARD", category: "FINANCIAL_ID", strong: true, re: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g, validate: (v) => luhn(v) },
    { kind: "CVV", category: "FINANCIAL_ID", strong: true, re: /\b(?:cvv2?|cvc|security code)["'\s:=]*(\d{3,4})\b/gi, group: 1 },
    { kind: "SECRET", category: "OTHER", strong: true,
      re: /\b(?:(?:sk|pk|rk)[-_](?:live|test)[-_][A-Za-z0-9]{8,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})/g },
    { kind: "SECRET", category: "OTHER", strong: true,
      re: /\b(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?token|token|aws_secret(?:_access_key)?)["'\s]*[:=]\s*["']?([^\s"',;}]{4,})/gi, group: 1 },
    { kind: "DOB", category: "DATE", strong: true,
      re: /\b(?:DOB|D\.O\.B\.?|date of birth|born(?:\s+on)?)\s*[:\-]?\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Z][a-z]+\s+\d{4}|[A-Z][a-z]+\s+\d{1,2},?\s+\d{4})/gi, group: 1 },
  ],
  neverMask: ["Section", "Notice", "Invoice", "Article"],
  protect: [],
};

// Name backup that doesn't depend on the model: names right after a label, salutation, honorific,
// email header or JSON key. If Gemini Nano fails or is unavailable, these are still masked.
const NAME = String.raw`\p{Lu}[\p{L}'’.-]+(?:[ \t]+\p{Lu}[\p{L}'’.-]+){0,3}`;
COMMON.rules.push(
  { kind: "PERSON", category: "PERSON", strong: false,
    re: new RegExp(String.raw`"(?:name|full_?name|first_?name|last_?name|customer|client|patient|employee|contact|holder|owner)"\s*:\s*"(${NAME})"`, "giu"), group: 1 },
  { kind: "PERSON", category: "PERSON",
    re: new RegExp(String.raw`(?:^|\n|[|;]|\.\s)[ \t]*(?:From|To|Cc|Bcc|Attn|Name|Nm|Client|Cust|Customer|Patient|Pt|Employee|Emp|Applicant|Tenant|Account holder|Holder|Beneficiary|Assessee|Taxpayer)[ \t]*[:\-]?[ \t]+(${NAME})`, "giu"), group: 1 },
  { kind: "ORG", category: "ORG",
    re: /\b(?:\p{Lu}[\p{L}&.'’-]*\s+){0,4}\p{Lu}[\p{L}&.'’-]*\s+(?:&\s+\p{Lu}[\p{L}]+\s+)?(?:GmbH|AG|KG|Ltd\.?|Limited|LLP|LLC|Inc\.?|Pvt\.?\s+Ltd\.?|Private Limited|SARL|SAS|Srl|S\.p\.A\.|BV|NV|plc)\b/gu },
  { kind: "PERSON", category: "PERSON",
    re: new RegExp(String.raw`\b(?:Dear|Hi|Hello|Regards,?|Sincerely,?|Thanks,?)[ \t]+(${NAME})`, "gu"), group: 1 },
  { kind: "PERSON", category: "PERSON",
    re: new RegExp(String.raw`\b(?:Mr|Mrs|Ms|Miss|Dr|Prof|Shri|Smt|Sri|Kumari|Herr|Frau|Mme)\.?[ \t]+(${NAME})`, "gu"), group: 1 },
);
// Name/org rule spans should get a plain PERSON / ORG placeholder, not a kind-specific one.
for (const r of COMMON.rules) if (r.kind === "PERSON" || r.kind === "ORG") r.kind = "";

export const IN: Pack = {
  id: "IN",
  label: "India (DPDP)",
  currency: "INR",
  rules: [
    { kind: "UPI", category: "FINANCIAL_ID", strong: true, re: /[\w.-]{2,}@(?:ok[a-z]+|ybl|ibl|axl|paytm|upi|apl)\b/gi },
    // No left word-boundary on purpose: "PANBQRPM4821K" must still match.
    { kind: "PAN", category: "GOV_ID", strong: true, re: /[A-Z]{5}\d{4}[A-Z](?![A-Z0-9])/g },
    { kind: "AADHAAR", category: "GOV_ID", strong: true, re: /(?<!\d)[2-9]\d{3}[\s.\-]?\d{4}[\s.\-]?\d{4}(?!\d)/g,
      validate: (v, t, at) => verhoeff(v) || labelledBefore(/aadhaa?r|\buid\b|आधार/i)(v, t, at) },
    { kind: "GSTIN", category: "GOV_ID", strong: true, re: /\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]/g },
    { kind: "IFSC", category: "FINANCIAL_ID", strong: true, re: /[A-Z]{4}0[A-Z0-9]{6}(?![A-Z0-9])/g },
    { kind: "BANK_ACCOUNT", category: "FINANCIAL_ID", strong: true, re: /(?:a\/c|account)(?:\s*(?:no\.?|number))?[\s:#]*(\d{9,18})(?!\d)/gi, group: 1 },
    { kind: "PHONE", category: "CONTACT", re: /(?<!\d)(?:\+91[\s-]?|0[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g },
    { kind: "PIN_CODE", category: "LOCATION", re: /(?<!\d)[1-8]\d{5}(?!\d)/g },
    { kind: "ADDRESS_LINE", category: "LOCATION", re: /\b(?:Flat|House|H\.?\s?No\.?|Plot|Shop|Room|Door|Unit)\s*(?:No\.?\s*)?[A-Z]?-?\d+[A-Z]?\b/g },
    { kind: "AMOUNT", category: "AMOUNT", re: /(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d+)?(?:\s?(?:lakh|lakhs|crore|crores|cr|L))?)/gi, group: 1 },
  ],
  neverMask: ["Form 26AS", "26AS", "AIS", "TIS", "ITR", "AY", "FY", "u/s", "TDS", "TCS", "GST", "GSTIN", "FD", "RD",
    "PAN", "Aadhaar", "IFSC", "UPI", "Income Tax", "CA", "HUF", "NRI", "EPF", "PPF", "a/c", "A/c", "Rs", "Rs."],
  protect: [
    /\b(?:AY|FY|A\.Y\.|F\.Y\.)\s?\d{4}\s?[-–]\s?\d{2,4}\b/g,
    /\bu\/s\s?\d+[A-Z]*(?:\([0-9a-zA-Z]+\))*/g,
    /\bSection\s\d+[A-Z]*(?:\([0-9a-zA-Z]+\))*/g,
  ],
};

export const EU: Pack = {
  id: "EU",
  label: "European Union (GDPR)",
  currency: "EUR",
  rules: [
    { kind: "IBAN", category: "FINANCIAL_ID", strong: true, re: /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/g },
    { kind: "BIC", category: "FINANCIAL_ID", re: /\b[A-Z]{4}(?:DE|FR|NL|IT|ES|BE|AT|IE|PT|PL|SE|DK|FI)[A-Z0-9]{2}(?:[A-Z0-9]{3})?\b/g },
    { kind: "VAT_ID", category: "GOV_ID", strong: true, re: /\b(?:DE\d{9}|FR[A-Z0-9]{2}\d{9}|NL\d{9}B\d{2}|IT\d{11}|ES[A-Z0-9]\d{7}[A-Z0-9]|BE0\d{9}|ATU\d{8})\b/g },
    { kind: "POSTCODE", category: "LOCATION", re: /(?<!\d)\d{5}(?=\s+[A-ZÄÖÜ][a-zäöüß]+)/g },
    { kind: "AMOUNT", category: "AMOUNT", re: /(?:EUR|€)\s?([\d.,]+)|([\d.,]+)\s?(?:EUR|€)/g, group: 1 },
  ],
  neverMask: ["IBAN", "BIC", "VAT", "USt-IdNr.", "GmbH", "GDPR", "SEPA"],
  protect: [],
};

export const UK: Pack = {
  id: "UK",
  label: "United Kingdom (UK GDPR)",
  currency: "GBP",
  rules: [
    { kind: "NI_NUMBER", category: "GOV_ID", strong: true, re: /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/g },
    { kind: "NHS_NUMBER", category: "HEALTH", re: /\b\d{3}\s\d{3}\s\d{4}\b/g },
    { kind: "POSTCODE", category: "LOCATION", re: /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g },
    { kind: "SORT_CODE", category: "FINANCIAL_ID", re: /\b\d{2}-\d{2}-\d{2}\b/g },
    { kind: "AMOUNT", category: "AMOUNT", re: /(?:GBP|£)\s?([\d,]+(?:\.\d+)?)/g, group: 1 },
  ],
  neverMask: ["HMRC", "NHS", "NI number", "PAYE", "P60", "P45"],
  protect: [],
};

export const US: Pack = {
  id: "US",
  label: "United States",
  currency: "USD",
  rules: [
    { kind: "SSN", category: "GOV_ID", strong: true, re: /(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g },
    { kind: "EIN", category: "GOV_ID", re: /\b\d{2}-\d{7}\b/g },
    { kind: "PHONE", category: "CONTACT", re: /(?:\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]\d{4}\b/g },
    { kind: "ZIP", category: "LOCATION", re: /\b\d{5}(?:-\d{4})?\b/g },
    { kind: "AMOUNT", category: "AMOUNT", re: /(?:USD|\$)\s?([\d,]+(?:\.\d+)?)/g, group: 1 },
  ],
  neverMask: ["IRS", "W-2", "1099", "SSN", "EIN", "HIPAA"],
  protect: [],
};

export const PACKS: Record<RegionId | "COMMON", Pack> = { COMMON, IN, EU, UK, US };

/**
 * COMMON is always on; then the user's regions; then the high-precision ("strong") IDs of every
 * other region, so an Indian PAN is still caught with the UK pack selected.
 */
export function packsFor(regions: RegionId[]): Pack[] {
  const others = (["IN", "EU", "UK", "US"] as RegionId[]).filter((r) => !regions.includes(r));
  const always: Pack = {
    id: "ALWAYS", label: "Always-on IDs", neverMask: [], protect: [],
    rules: others.flatMap((r) => PACKS[r].rules.filter((rule) => rule.strong)),
  };
  return [COMMON, ...regions.map((r) => PACKS[r]), always];
}

// ---------- normalisation ----------
const ZERO_WIDTH = /[​-‍⁠﻿­]/;
const HOMOGLYPHS: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S",
  а: "a", е: "e", о: "o", р: "p", с: "c", х: "x", у: "y", і: "i", ј: "j", ѕ: "s",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
};

/**
 * Normalise text for rule matching (full-width → ASCII, strip zero-width characters, Cyrillic/Greek
 * look-alikes → Latin) and keep a map back to original offsets, so masking still applies to the
 * user's exact characters.
 */
export function normalizeForRules(text: string): { norm: string; map: number[] } {
  let norm = "";
  let map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ZERO_WIDTH.test(ch)) continue;
    const out = HOMOGLYPHS[ch] ?? ch.normalize("NFKC");
    for (const c of out) { norm += c; map.push(i); }
  }
  map.push(text.length);
  // Decode common obfuscations so the rules see what a human would read.
  ({ norm, map } = rewrite(norm, map, SPELLED_DIGITS, (m) =>
    (m.match(/[a-z]+/gi) ?? []).map((w) => DIGIT_WORDS[w.toLowerCase()] ?? "").join("")));
  ({ norm, map } = rewrite(norm, map, OBFUSCATED_EMAIL, (_m, user, domain, tld) => `${user}@${domain}.${tld}`));
  return { norm, map };
}

const DIGIT_WORDS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9",
};
/** Seven or more spelled-out digits in a row ("nine eight two two zero one four…"). */
const SPELLED_DIGITS = /\b(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b[\s,-]*){7,}/gi;
/** "rohan [at] gmail [dot] com", "rohan(at)gmail(dot)com", "rohan at gmail dot com". */
const OBFUSCATED_EMAIL = /([\w.+-]+)\s*[[({]?\s*\bat\b\s*[\])}]?\s*([\w-]+)\s*[[({]?\s*\bdot\b\s*[\])}]?\s*([a-z]{2,6})\b/gi;

/** Regex-replace on the normalised string while keeping the map to original offsets. */
function rewrite(norm: string, map: number[], re: RegExp, fn: (m: string, ...g: string[]) => string) {
  let out = "";
  const outMap: number[] = [];
  let last = 0;
  for (const m of norm.matchAll(re)) {
    const start = m.index!, end = start + m[0].length;
    for (let i = last; i < start; i++) { out += norm[i]; outMap.push(map[i]); }
    const rep = fn(m[0], ...(m.slice(1) as string[]));
    // Every replacement character maps into the original match, so masking covers the whole obfuscated span.
    for (let k = 0; k < rep.length; k++) {
      out += rep[k];
      outMap.push(map[start + Math.min(end - start - 1, Math.floor((k * (end - start)) / Math.max(1, rep.length)))]);
    }
    // Make sure the last replacement character maps to the end of the original match.
    if (rep.length) outMap[outMap.length - 1] = map[end - 1];
    last = end;
  }
  for (let i = last; i < norm.length; i++) { out += norm[i]; outMap.push(map[i]); }
  outMap.push(map[norm.length]);
  return { norm: out, map: outMap };
}

const OTHER_SCRIPT = /[Ѐ-ӿ֐-׿؀-ۿऀ-෿฀-๿぀-ヿ一-鿿가-힯]/;

/**
 * What the on-device model reads: a SAME-LENGTH copy of the text with look-alike letters mapped to
 * Latin, full-width characters narrowed, invisible characters turned into spaces and scripts the model
 * doesn't support blanked out. Same length means every offset the model reports is valid in the
 * original text. (Rules still run on the original, so IDs in those scripts are still caught.)
 */
export function modelView(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ZERO_WIDTH.test(ch)) { out += " "; continue; }
    const h = HOMOGLYPHS[ch];
    if (h) { out += h; continue; }
    if (OTHER_SCRIPT.test(ch)) { out += " ".repeat(ch.length); continue; }
    const n = ch.normalize("NFKC");
    out += n.length === ch.length ? n : ch;
  }
  return out;
}

// ---------- structured (CSV / spreadsheet) ----------
const AMOUNT_HEADER = /salary|income|amount|ctc|pay|wage|balance|turnover|revenue|price|fee|bonus|rent/i;
const NAME_HEADER = /^(?:name|full ?name|first ?name|last ?name|customer|client|employee|emp(?:loyee)? ?name|patient|tenant|contact|holder|nominee|beneficiary)$/i;

/** In pasted CSV/TSV, mask numeric cells under amount-like headers and names under name-like headers. */
export function tableAmountSpans(text: string): Span[] {
  const lines = text.split("\n");
  const spans: Span[] = [];
  let offset = 0;
  const starts = lines.map((l) => { const s = offset; offset += l.length + 1; return s; });
  for (const delim of [",", "\t", ";", "|"]) {
    const counts = lines.map((l) => l.split(delim).length - 1);
    for (let h = 0; h < lines.length; h++) {
      if (counts[h] < 1) continue;
      const cols = lines[h].split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));
      const amountCols = cols.map((c, i) => (AMOUNT_HEADER.test(c) && !/\d/.test(c) ? i : -1)).filter((i) => i >= 0);
      const nameCols = cols.map((c, i) => (NAME_HEADER.test(c) ? i : -1)).filter((i) => i >= 0);
      if (!amountCols.length && !nameCols.length) continue;
      for (let r = h + 1; r < lines.length && counts[r] === counts[h]; r++) {
        let pos = starts[r];
        lines[r].split(delim).forEach((cell, i) => {
          const trimmed = cell.trim().replace(/^"|"$/g, "");
          const s = pos + cell.indexOf(trimmed);
          if (amountCols.includes(i) && /^[₹$€£]?\s?\d[\d,.]*$/.test(trimmed)) {
            spans.push({ start: s, end: s + trimmed.length, text: trimmed, category: "AMOUNT", source: "rule", kind: "AMOUNT", origin: "table:AMOUNT" });
          } else if (nameCols.includes(i) && /\p{L}/u.test(trimmed) && trimmed.length >= 2) {
            spans.push({ start: s, end: s + trimmed.length, text: trimmed, category: "PERSON", source: "rule", origin: "table:PERSON" });
          }
          pos += cell.length + delim.length;
        });
      }
    }
    if (spans.length) break;
  }
  return spans;
}

export function runRules(text: string, packs: Pack[]): Span[] {
  const { norm, map } = normalizeForRules(text);
  const spans: Span[] = [];
  for (const pack of packs) {
    for (const rule of pack.rules) {
      for (const m of norm.matchAll(rule.re)) {
        const g = rule.group ? (m[rule.group] !== undefined ? rule.group : m.findIndex((x, i) => i > 0 && x !== undefined)) : 0;
        const value = m[g > 0 ? g : 0];
        if (!value) continue;
        const nStart = m.index! + m[0].indexOf(value);
        if (rule.validate && !rule.validate(value, norm, nStart)) continue;
        const start = map[nStart];
        const end = map[nStart + value.length - 1] + 1;
        spans.push({ start, end, text: text.slice(start, end), category: rule.category, source: "rule", kind: rule.kind || undefined, origin: `${pack.id}:${rule.kind || rule.category}` });
      }
    }
  }
  return [...spans, ...tableAmountSpans(text)];
}

/** Character ranges that must never be masked (tax years, legal sections). */
export function protectedRanges(text: string, packs: Pack[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const p of packs) for (const re of p.protect) for (const m of text.matchAll(re)) out.push({ start: m.index!, end: m.index! + m[0].length });
  return out;
}

export function neverMaskTerms(packs: Pack[]): string[] {
  return [...new Set(packs.flatMap((p) => p.neverMask))];
}
