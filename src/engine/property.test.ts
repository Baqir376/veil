// Property-based tests (fast-check): instead of hand-picked examples, generate hundreds of random
// documents with real-format identifiers in random places, and check invariants that must ALWAYS hold.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { runVeil, buildCloudPayload, mask, rehydrate, packsFor, runRules, SpanTools, neverMaskTerms, luhn, verhoeff, type Span } from "./index";

const IN = packsFor(["IN"]);
const WORDS = ["please", "check", "the", "notice", "for", "my", "client", "and", "reply", "today", "regarding", "refund", "ITR", "Form", "26AS", "AY", "2026-27", "thanks", "urgent", "details", "below"];

const digit = fc.integer({ min: 0, max: 9 });
const upper = fc.integer({ min: 65, max: 90 }).map((c) => String.fromCharCode(c));
const pan = fc.tuple(fc.array(upper, { minLength: 3, maxLength: 3 }), upper, fc.array(digit, { minLength: 4, maxLength: 4 }), upper)
  .map(([a, b, d, e]) => `${a.join("")}P${b}${d.join("")}${e}`);
const phone = fc.tuple(fc.integer({ min: 6, max: 9 }), fc.array(digit, { minLength: 9, maxLength: 9 })).map(([a, d]) => `${a}${d.join("")}`);
const email = fc.tuple(fc.stringMatching(/^[a-z]{3,8}$/), fc.integer({ min: 10, max: 99 })).map(([u, n]) => `${u}.${n}@example.com`);
const card = fc.array(digit, { minLength: 15, maxLength: 15 }).map((d) => {
  for (let c = 0; c < 10; c++) { const n = `4${d.slice(1).join("")}${c}`; if (luhn(n)) return n.match(/.{4}/g)!.join(" "); }
  return "4111 1111 1111 1111";
});
const aadhaar = fc.array(digit, { minLength: 11, maxLength: 11 }).map((d) => {
  for (let c = 0; c < 10; c++) { const n = `${Math.max(2, d[0])}${d.slice(1).join("")}${c}`; if (verhoeff(n)) return `${n.slice(0, 4)} ${n.slice(4, 8)} ${n.slice(8)}`; }
  return "2345 6789 0124";
});
const secret = fc.oneof(pan.map((v) => ({ v, label: "PAN " })), phone.map((v) => ({ v, label: "call " })), email.map((v) => ({ v, label: "mail " })),
  card.map((v) => ({ v, label: "card " })), aadhaar.map((v) => ({ v, label: "Aadhaar " })));
const filler = fc.array(fc.constantFrom(...WORDS), { minLength: 0, maxLength: 8 }).map((w) => w.join(" "));
const doc = fc.array(fc.tuple(filler, secret), { minLength: 1, maxLength: 6 });

describe("property: identifiers never leave the device (rules only, no model)", () => {
  it("for any document, no generated ID appears in the cloud payload", async () => {
    await fc.assert(fc.asyncProperty(doc, async (parts) => {
      const text = parts.map(([f, s]) => `${f} ${s.label}${s.v}.`).join(" ");
      const r = await runVeil(text, { regions: ["IN"], detector: null });
      const b = buildCloudPayload({ question: "Help.", questionSpans: [], doc: text, docSpans: r.spans, packs: r.packs });
      for (const [, s] of parts) expect(b.payload).not.toContain(s.v);
    }), { numRuns: 300 });
  });

  it("the same IDs inside the QUESTION are masked too", async () => {
    await fc.assert(fc.asyncProperty(fc.array(secret, { minLength: 1, maxLength: 3 }), async (ids) => {
      const question = `Explain for ${ids.map((s) => s.label + s.v).join(" and ")}`;
      const b = buildCloudPayload({ question, questionSpans: [], doc: "See above.", docSpans: [], packs: IN });
      for (const s of ids) expect(b.maskedQuestion).not.toContain(s.v);
    }), { numRuns: 200 });
  });
});

describe("property: masking is reversible on the device", () => {
  it("restoring the masked text gives back the original exactly", () => {
    fc.assert(fc.property(doc, (parts) => {
      const text = parts.map(([f, s]) => `${f} ${s.label}${s.v}.`).join(" ");
      const tools = new SpanTools(neverMaskTerms(IN));
      const spans = tools.merge(text, runRules(text, IN));
      const m = mask(text, spans);
      expect(rehydrate(m.masked, m.vault, m.reserved).text).toBe(text);
    }), { numRuns: 300 });
  });
});

describe("property: merged spans are well-formed whatever the model returns", () => {
  it("sorted, non-overlapping, inside the text, never inside a protected tax year", () => {
    const text = "Notice u/s 143(1)(a) for AY 2026-27: Rohan Mehta, PAN BQRPM4821K, lives in Kothrud with wife Sneha.";
    const tools = new SpanTools(neverMaskTerms(IN));
    const anyRange = fc.tuple(fc.nat({ max: text.length }), fc.nat({ max: 40 })).map(([s, l]) => ({ s, e: Math.min(text.length, s + l) }));
    fc.assert(fc.property(fc.array(anyRange, { maxLength: 12 }), (ranges) => {
      const model: Span[] = ranges.filter((r) => r.e > r.s).map((r) => ({ start: r.s, end: r.e, text: text.slice(r.s, r.e), category: "QUASI", source: "nano", origin: "indirect" }));
      const prot = [{ start: text.indexOf("AY 2026-27"), end: text.indexOf("AY 2026-27") + 10 }];
      const out = tools.merge(text, [...runRules(text, IN), ...tools.clean(model)], prot);
      for (let i = 0; i < out.length; i++) {
        expect(out[i].start).toBeGreaterThanOrEqual(0);
        expect(out[i].end).toBeLessThanOrEqual(text.length);
        expect(out[i].end).toBeGreaterThan(out[i].start);
        if (i > 0) expect(out[i].start).toBeGreaterThanOrEqual(out[i - 1].end);
        expect(out[i].start < prot[0].end && out[i].end > prot[0].start).toBe(false);
      }
    }), { numRuns: 500 });
  });
});
