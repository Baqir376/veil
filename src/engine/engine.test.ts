import { describe, it, expect } from "vitest";
import {
  packsFor, runRules, protectedRanges, neverMaskTerms, SpanTools, mask, rehydrate, fuzzyWindow,
  parseAmount, amountBand, type Span, type Category,
} from "./index";
import { SAMPLES } from "../samples";

const IN_PACKS = packsFor(["IN"]);
const tools = new SpanTools(neverMaskTerms(IN_PACKS));
const kinds = (text: string, packs = IN_PACKS) => runRules(text, packs).map((s) => `${s.kind}:${s.text}`);

/** Simulate Nano output: locate strings and tag them as model spans. */
const model = (text: string, items: [string, Category][]) =>
  tools.locate(text, items.map(([t, category]) => ({ text: t, category })), "direct").spans;

const pipeline = (text: string, modelSpans: Span[] = []) =>
  tools.merge(text, [...runRules(text, IN_PACKS), ...tools.clean(modelSpans)], protectedRanges(text, IN_PACKS));

describe("rule packs", () => {
  it("India: PAN, Aadhaar, GSTIN, IFSC, UPI, bank a/c, phone, PIN, amounts", () => {
    const k = kinds(SAMPLES[0].text);
    for (const want of ["PAN:BQRPM4821K", "AADHAAR:4821 7733 9045", "IFSC:HDFC0001234", "UPI:rohanm@okhdfcbank",
      "BANK_ACCOUNT:50100234567812", "PHONE:9822014567", "PIN_CODE:411038", "AMOUNT:18,45,000", "EMAIL:rohan.mehta88@gmail.com"]) {
      expect(k).toContain(want);
    }
    expect(kinds("GSTIN is 27AAPFU0939F1ZV")).toContain("GSTIN:27AAPFU0939F1ZV");
  });

  it("EU: IBAN, BIC, VAT id", () => {
    const k = kinds(SAMPLES[2].text, packsFor(["EU"]));
    expect(k).toContain("IBAN:DE89 3704 0044 0532 0130 00");
    expect(k).toContain("BIC:COBADEFFXXX");
    expect(k).toContain("VAT_ID:DE287654321");
  });

  it("UK: NI number and NHS number; US: SSN", () => {
    const k = kinds(SAMPLES[3].text, packsFor(["UK"]));
    expect(k).toContain("NI_NUMBER:JK 48 21 93 C");
    expect(k).toContain("NHS_NUMBER:943 476 5919");
    expect(kinds("SSN 123-45-6789", packsFor(["US"]))).toContain("SSN:123-45-6789");
  });

  it("does not flag a 14-digit account number as Aadhaar or phone", () => {
    const k = kinds("a/c 50100234567812");
    expect(k).toEqual(["BANK_ACCOUNT:50100234567812"]);
  });
});

describe("merge: protecting meaning from a noisy model", () => {
  const t = SAMPLES[0].text;

  it("keeps domain terms and context the cloud needs", () => {
    const spans = pipeline(t, model(t, [
      ["Rohan Mehta, PAN BQRPM4821K", "GOV_ID"],
      ["income of Rs 18,45,000 reported", "AMOUNT"],
      ["Form 26AS", "GOV_ID"],
      ["FD", "AMOUNT"],
    ]));
    const { masked } = mask(t, spans);
    expect(masked).toMatch(/To: \[PERSON_\d\], PAN \[PAN_1\], Aadhaar \[AADHAAR_1\]/);
    expect(masked).toContain("The income of Rs [AMOUNT_1] reported in your ITR does not match Form 26AS");
    expect(masked).toContain("handles the FD");
  });

  it("never masks the tax year or legal section, even if the model or attacker flags it", () => {
    const spans = pipeline(t, model(t, [["AY 2026-27", "DATE"], ["2026-27", "QUASI"], ["143(1)(a)", "OTHER"]]));
    const { masked } = mask(t, spans);
    expect(masked).toContain("Notice u/s 143(1)(a) for AY 2026-27");
  });

  it("drops generic model spans like 'from' or 'Call me on'", () => {
    const spans = pipeline(t, model(t, [["from", "QUASI"], ["Call me on", "QUASI"], ["second flat", "QUASI"]]));
    const { masked } = mask(t, spans);
    expect(masked).toContain("My salary is from");
    expect(masked).toContain("Call me on [PHONE_1]");
    expect(masked).toContain("rent from my [CLUE_1]");
  });

  it("rejects over-long model spans that cross lines", () => {
    const long = "Address: Flat 302, Sai Krupa Apartments, Kothrud, Pune 411038\nSubject: Notice";
    expect(tools.clean(model(t, [[long, "LOCATION"]]))).toHaveLength(0);
  });

  it("rule spans win over a loose model span covering them", () => {
    const spans = pipeline(t, model(t, [["HDFC Bank a/c 50100234567812", "FINANCIAL_ID"]]));
    const acct = spans.find((s) => s.text === "50100234567812");
    expect(acct?.kind).toBe("BANK_ACCOUNT");
    expect(spans.find((s) => s.text === "HDFC Bank")?.category).toBe("ORG");
  });
});

describe("paraphrase recovery, precedence and addresses", () => {
  const t = SAMPLES[0].text;

  it("fuzzy-locates paraphrased model output", () => {
    expect(fuzzyWindow(t, "wife handles FD")).not.toBeNull();
    const w = fuzzyWindow(t, "wife handles FD")!;
    expect(t.slice(w.start, w.end)).toBe("wife Sneha handles the FD");
    const q = SAMPLES[1].text;
    const w2 = fuzzyWindow(q, "only woman-owned pharmacy in Chiplun")!;
    expect(q.slice(w2.start, w2.end)).toBe("only woman-owned\nayurvedic pharmacy in Chiplun");
    expect(fuzzyWindow(t, "completely unrelated words")).toBeNull();
  });

  it("a broad clue cannot swallow a name found by the direct pass", () => {
    const direct = model(t, [["Sneha", "PERSON"]]);
    const broad = tools.locate(t, [{ text: "wife handles FD", category: "QUASI" }], "indirect").spans;
    const spans = tools.merge(t, [...runRules(t, IN_PACKS), ...direct, ...tools.clean(broad)], protectedRanges(t, IN_PACKS));
    const { masked } = mask(t, spans);
    expect(masked).toContain("[PERSON_1]");
    expect(masked).toContain("handles the FD");
  });

  it("joins address pieces into one place and catches the flat number", () => {
    const spans = pipeline(t, model(t, [["Sai Krupa Apartments", "LOCATION"], ["Kothrud", "LOCATION"], ["Pune", "LOCATION"]]));
    const { masked } = mask(t, spans);
    expect(masked).toContain("Address: [PLACE_1] [PIN_CODE_1]");
  });
});

describe("meaningful placeholders and on-device restore", () => {
  const t = SAMPLES[0].text;
  const spans = pipeline(t, model(t, [["Rohan Mehta", "PERSON"], ["Sneha", "PERSON"], ["Infosys", "ORG"]]));

  it("labels IDs by kind and adds coarse amount bands", () => {
    const { masked } = mask(t, spans, { amountHints: true, currency: "INR" });
    expect(masked).toContain("[PAN_1]");
    expect(masked).toContain("[AADHAAR_1]");
    expect(masked).toContain("Rs [AMOUNT_1 · ₹15–20L]");
    expect(masked).toContain("Rs [AMOUNT_2 · ₹20–30L]");
    expect(masked).toContain("Rs [AMOUNT_3 · ₹1–5L]");
  });

  it("same value → same placeholder; masked text contains no original value", () => {
    const { masked, vault } = mask(t, spans);
    for (const v of vault.values()) expect(masked).not.toContain(v);
    const twice = "Rohan Mehta wrote to Rohan Mehta";
    const r = mask(twice, tools.merge(twice, model(twice, [["Rohan Mehta", "PERSON"]])));
    expect(r.masked).toBe("[PERSON_1] wrote to [PERSON_1]");
  });

  it("restores values, accepts tokens with or without the hint, and reports invented placeholders", () => {
    const { vault } = mask(t, spans, { amountHints: true, currency: "INR" });
    const rohan = [...vault].find(([, v]) => v === "Rohan Mehta")![0];
    const answer = `Dear [${rohan}], the gap of Rs [AMOUNT_2 · ₹20–30L] vs [AMOUNT_1] needs a reply. See [FINANCIAL_2].`;
    const r = rehydrate(answer, vault);
    expect(r.text).toBe("Dear Rohan Mehta, the gap of Rs 21,10,500 vs 18,45,000 needs a reply. See [FINANCIAL_2].");
    expect(r.invented).toEqual(["[FINANCIAL_2]"]);
  });
});

describe("attacker clue handling", () => {
  const masked = `My salary is from [ORG_1] and I also got rent from my second flat. My wife [PERSON_2] handles the FD.
Call me on [PHONE_1]. UPI me the fee at [UPI_1].
She is the only woman-owned ayurvedic pharmacy in [PLACE_1], right next to the Parshuram temple.`;

  it.each([
    ["second flat", "apply"],
    ["only woman-owned ayurvedic pharmacy", "apply"],
    ["next to the Parshuram temple", "apply"],
    ["My wife [PERSON_2] handles the FD.", "apply"],
    ["only woman-owned ayurvedic pharmacy in [PLACE_1]", "apply"],
    ["She is the only woman-owned ayurvedic pharmacy in [PLACE_1]", "suggest"],
    ["She is the only woman-owned ayurvedic pharmacy in [PLACE_1], right next to the Parshuram temple, since 2019", "ignore"],
    ["Call me on [PHONE_1]", "ignore"],
    ["UPI me the fee at [UPI_1]", "ignore"],
    ["from", "ignore"],
    ["a phrase that is not in the text at all", "ignore"],
  ])("%s → %s", (quote, want) => {
    expect(tools.classifyClue(masked, quote)).toBe(want);
  });

  it("dedupes near-identical clues", () => {
    expect(tools.clueKey("My wife [PERSON_2] handles the FD.")).toBe(tools.clueKey("Wife [PERSON_2] handles the FD"));
  });
});

describe("amount parsing and bands", () => {
  it.each([
    ["18,45,000", 1845000], ["2.3 crore", 23000000], ["12 lakh", 1200000], ["7,800", 7800], ["7.800,50", 7800.5],
  ])("parses %s", (raw, n) => expect(parseAmount(raw)).toBe(n));

  it("bands", () => {
    expect(amountBand(1845000, "INR")).toBe("₹15–20L");
    expect(amountBand(23000000, "INR")).toBe("₹1–5Cr");
    expect(amountBand(7800, "EUR")).toBe("€5–10k");
  });
});
