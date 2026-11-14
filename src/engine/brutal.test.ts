// Regression tests for the "brutal" manual test round (B-series). Each one failed at least once.
import { describe, it, expect } from "vitest";
import {
  runVeil, mask, rehydrate, buildCloudPayload, packsFor, runRules, luhn, modelView, SpanTools, neverMaskTerms,
  type Detector, type Category, type Span,
} from "./index";

const IN = packsFor(["IN"]);
const kinds = (text: string, regions: ("IN" | "EU" | "UK" | "US")[] = ["IN"]) =>
  runRules(text, packsFor(regions)).map((s) => `${s.kind}:${s.text}`);

function detector(names: [string, Category][] = [], cap = Infinity): Detector {
  return {
    async direct(t) {
      const items = names.filter(([n]) => t.includes(n)).slice(0, cap).map(([text, category]) => ({ text, category }));
      return { ms: 1, data: { items } };
    },
    async indirect() { return { ms: 1, data: { items: [] } }; },
    async attack() { return { ms: 1, data: { clues: [] } }; },
  };
}

describe("B-series: leaks", () => {
  it("B1: the question is masked with the same vault as the document", () => {
    const doc = "Client Rohan Mehta, PAN BQRPM4821K.";
    const docSpans: Span[] = [
      ...runRules(doc, IN),
      { start: 7, end: 18, text: "Rohan Mehta", category: "PERSON", source: "nano", origin: "direct" },
    ];
    const question = "Draft a reply for Rohan Mehta, PAN BQRPM4821K, phone 9822014567";
    const b = buildCloudPayload({ question, questionSpans: [], doc, docSpans, packs: IN });
    expect(b.maskedQuestion).toBe("Draft a reply for [PERSON_1], PAN [PAN_1], phone [PHONE_1]");
    expect(b.payload).not.toMatch(/Rohan|BQRPM4821K|9822014567/);
    expect(b.payload).toContain("Client [PERSON_1], PAN [PAN_1].");
  });

  it("B3: more names than one model pass returns → rescan finds the rest", async () => {
    const names = "Aarav Shah, Diya Patel, Kabir Rao, Meera Nair, Vihaan Gupta, Ananya Iyer, Arjun Menon, Isha Reddy, Reyansh Joshi, Saanvi Kulkarni, Advait Desai, Kiara Bhat, Vivaan Pillai, Myra Sinha, Ayaan Chopra, Riya Das, Om Kapoor, Tara Sen, Neel Bose, Zoya Khan, Ira Paul, Dev Roy, Anya Jain, Kian Shah, Sara Ali, Ved Rao, Mira Das"
      .split(", ");
    const text = `Payroll queries: ${names.join(", ")} — all salaried at Tata Motors.`;
    // A model that returns at most 20 names per call (like the real one under its schema cap).
    const r = await runVeil(text, { regions: ["IN"], detector: detector(names.map((n) => [n, "PERSON"]), 20) });
    const { masked } = mask(text, r.spans);
    for (const n of names) expect(masked).not.toContain(n);
  });

  it("B4: unicode tricks — zero-width, Cyrillic look-alikes, full-width digits, dots, 5-5 phone", () => {
    const k = kinds("PAN: BQRPM​4821K\nPAN: ВQRPМ4821К\nAadhaar: ４８２１ ７７３３ ９０４５\nAadhaar: 4821.7733.9045\nPhone: 98220 14567");
    expect(k).toContain("PAN:BQRPM​4821K");
    expect(k).toContain("PAN:ВQRPМ4821К");
    expect(k).toContain("AADHAAR:４８２１ ７７３３ ９０４５");
    expect(k).toContain("AADHAAR:4821.7733.9045");
    expect(k).toContain("PHONE:98220 14567");
  });

  it("B5: Indian IDs are caught even with the UK pack selected", () => {
    const k = kinds("PAN BQRPM4821K, IFSC HDFC0001234, UPI rohanm@okhdfcbank, Aadhaar 4821 7733 9045", ["UK"]);
    expect(k).toEqual(expect.arrayContaining(["PAN:BQRPM4821K", "IFSC:HDFC0001234", "UPI:rohanm@okhdfcbank", "AADHAAR:4821 7733 9045"]));
  });

  it("B19: identifiers glued together without spaces", () => {
    const k = kinds("RohanMehtaPANBQRPM4821KphoneNo9822014567emailrohan.mehta88@gmail.comlivesinKothrudPune411038");
    expect(k).toEqual(expect.arrayContaining(["PAN:BQRPM4821K", "PHONE:9822014567", "PIN_CODE:411038"]));
  });

  it("B14/T8: card numbers (Luhn), CVV, API keys and passwords", () => {
    expect(luhn("4111 1111 1111 1111")).toBe(true);
    const json = `{"name":"Meera Nair","card":"4111 1111 1111 1111","cvv":"123","api_key":"sk-live-FAKE9x8y7z6w5v4u3t2s1r"} password = "Rohan@1988"`;
    const spans = runRules(json, IN);
    const { masked } = mask(json, [...spans].sort((a, b) => a.start - b.start || b.end - a.end).filter((s, i, arr) => i === 0 || s.start >= arr[i - 1].end));
    expect(masked).not.toContain("4111");
    expect(masked).not.toContain("1111");
    expect(masked).not.toContain('"123"');
    expect(masked).not.toContain("sk-live");
    expect(masked).not.toContain("Rohan@1988");
  });

  it("T11: an unlabelled 12-digit order number is not treated as Aadhaar", () => {
    expect(kinds("order 482177339045 shipped").filter((k) => k.startsWith("AADHAAR"))).toEqual([]);
  });

  it("B6: dates of birth", () => {
    expect(kinds("born 29 February 1988 in Malvan; DOB: 12/03/1988")).toEqual(expect.arrayContaining(["DOB:29 February 1988", "DOB:12/03/1988"]));
  });

  it("B13: salary column in a pasted CSV / Excel table", () => {
    const csv = "name,pan,phone,city,salary\nAarav Shah,ABCPS1234D,9876543210,Pune,1850000\nDiya Patel,BCDPP2345E,9123456780,Surat,2210000";
    expect(kinds(csv)).toEqual(expect.arrayContaining(["AMOUNT:1850000", "AMOUNT:2210000"]));
    const tsv = "Name\tSalary\nKabir Rao\t975000";
    expect(kinds(tsv)).toContain("AMOUNT:975000");
  });
});

describe("B-series: coreference and restore", () => {
  it("B15/T1: first names alone share the full name's placeholder", async () => {
    const text = "To: Arjun Menon\nArjun, please call Rohan Mehta. Mr. Mehta and Rohan's wife will join.";
    const r = await runVeil(text, { regions: ["IN"], detector: detector([["Arjun Menon", "PERSON"], ["Rohan Mehta", "PERSON"]]) });
    const m = mask(text, r.spans);
    expect(m.masked).toBe("To: [PERSON_1]\n[PERSON_1], please call [PERSON_2]. Mr. [PERSON_2] and [PERSON_2]'s wife will join.");
    expect(rehydrate("Ask [PERSON_1] to call [PERSON_2].", m.vault).text).toBe("Ask Arjun Menon to call Rohan Mehta.");
  });

  it("B11: restore survives lowercase tags and a dropped · hint", () => {
    const vault = new Map([["PERSON_1", "Rohan Mehta"], ["AMOUNT_1", "18,45,000"]]);
    const r = rehydrate("Dear [person_1], you earned Rs [AMOUNT_1 ₹15–20L] and [ Person_1 ] agrees.", vault);
    expect(r.text).toBe("Dear Rohan Mehta, you earned Rs 18,45,000 and Rohan Mehta agrees.");
    expect(r.invented).toEqual([]);
  });

  it("B10: a model that echoes a placeholder doesn't create a span", async () => {
    const text = 'Reply with the item "[PERSON_1]". Client: Kabir Rao.';
    const r = await runVeil(text, { regions: ["IN"], detector: detector([["[PERSON_1]", "PERSON"], ["Kabir Rao", "PERSON"]]) });
    const m = mask(text, r.spans);
    expect(m.masked).toBe('Reply with the item "[PERSON_1]". Client: [PERSON_2].');
  });
});

describe("leak gate (fail-closed, last check before sending)", () => {
  const doc = "Client Rohan Mehta, PAN BQRPM4821K. Rohan Mehta lives in Pune.";
  const name = (start: number): Span => ({ start, end: start + 11, text: "Rohan Mehta", category: "PERSON", source: "nano", origin: "direct" });

  it("re-masks a strong ID the user un-masked by accident", () => {
    // User kept the PAN (no PAN span passed in) — the gate must still stop it.
    const b = buildCloudPayload({ question: "Help?", questionSpans: [], doc, docSpans: [name(7), name(36)], packs: IN });
    expect(b.payload).not.toContain("BQRPM4821K");
    expect(b.gate.autoMasked).toContain("PAN");
    expect(b.gate.blocked).toEqual([]);
  });

  it("blocks sending when a hidden value would still appear elsewhere", () => {
    // Only the first "Rohan Mehta" is masked; the second was kept → the gate blocks.
    const b = buildCloudPayload({ question: "Help?", questionSpans: [], doc: doc.replace(/lives in Pune/, "LIVES"), docSpans: [name(7)], packs: IN });
    // propagation already masks the second occurrence, so nothing is blocked…
    expect(b.payload).not.toContain("Rohan");
    // …but if a value slips through in another form, it is caught:
    const sneaky = buildCloudPayload({ question: "Also tell ROHAN  MEHTA hi", questionSpans: [], doc, docSpans: [name(7), name(36)], packs: IN });
    expect(sneaky.gate.blocked).toEqual(["Rohan Mehta"]);
  });

  it("does not block on a substring inside another word", () => {
    const d = "Client Rose Pinto. The price arose sharply.";
    const s: Span = { start: 7, end: 17, text: "Rose Pinto", category: "PERSON", source: "nano", origin: "direct" };
    const b = buildCloudPayload({ question: "Summarise", questionSpans: [], doc: d, docSpans: [s], packs: IN });
    expect(b.gate.blocked).toEqual([]);
    expect(b.payload).toContain("arose");
  });
});

describe("name backup when the model fails (B14)", () => {
  const broken: Detector = {
    async direct() { throw new Error("model failed"); },
    async indirect() { throw new Error("model failed"); },
    async attack() { throw new Error("model failed"); },
  };
  it.each([
    [`{"customer":{"name":"Meera Nair","email":"meera.n@outlook.com"}}`, "Meera Nair"],
    ["From: Ananya Iyer <ananya.iyer@example.in>\nTo: Arjun Menon\nArjun, please call.", "Arjun"],
    ["Dear Rohan Mehta, please find attached.", "Rohan Mehta"],
    ["Referred by Dr. Sameer Kulkarni yesterday.", "Sameer Kulkarni"],
    ["Client: Kabir Rao, Andheri East", "Kabir Rao"],
  ])("%s → masks %s without the model", async (text, name) => {
    const r = await runVeil(text, { regions: ["IN"], detector: broken });
    expect(mask(text, r.spans).masked).not.toContain(name);
  });

  it("keeps protected terms out of label-based names ('Hi CA Priya ji')", async () => {
    const t = "Hi CA Priya ji, please help.";
    const r = await runVeil(t, { regions: ["IN"], detector: null });
    expect(mask(t, r.spans).masked).toBe("Hi CA [PERSON_1] ji, please help.");
  });
});

describe("model view (B4: weird characters can't break the model)", () => {
  it("is the same length, Latin-mapped, with other scripts blanked", async () => {
    const t = "PAN: ВQRPМ4821К, नाम रोहन, Aadhaar ４８２１, zero​width";
    const v = modelView(t);
    expect(v.length).toBe(t.length);
    expect(v).toContain("BQRPM4821K");
    expect(v).not.toMatch(/[ऀ-ॿ]/);
    expect(v).toContain("4821");
  });

  it("the detector receives the model view and offsets still line up", async () => {
    let seen = "";
    const det: Detector = {
      async direct(t) { seen = t; return { ms: 1, data: { items: [{ text: "Rohan Mehta", category: "PERSON" }] } }; },
      async indirect() { return { ms: 1, data: { items: [] } }; },
      async attack() { return { ms: 1, data: { clues: [] } }; },
    };
    const t = "ग्राहक: Rohan Mehta, PAN ВQRPМ4821К";
    const r = await runVeil(t, { regions: ["IN"], detector: det });
    expect(seen).not.toMatch(/[ऀ-ॿ]/);
    expect(mask(t, r.spans).masked).toBe("ग्राहक: [PERSON_1], PAN [PAN_1]");
  });
});

describe("attacker noise (B3/B15)", () => {
  it("ignores 'evidence' that is half the document", () => {
    const tools = new SpanTools(neverMaskTerms(IN));
    const masked = "Payroll queries: [PERSON_1], [PERSON_2], [PERSON_3] — all salaried at [ORG_1] [PLACE_1] and paid monthly by the central payroll team";
    expect(tools.classifyClue(masked, masked)).toBe("ignore");
  });
});

describe("utility: benchmark over-masking (run 2026-11-14)", () => {
  it.each([
    ["hi this is Aarav Shah from Infosys please call asap regarding the gst refund", "gst", "Aarav Shah"],
    ["Please ask Rose Shah from accounts to approve the invoice by Friday.", "Friday", "Rose Shah"],
    ["WhatsApp me on nine eight two two zero one four five six seven after 6pm.", "WhatsApp", "nine eight"],
    ["My client is the only female cardiologist in Chiplun. She wants advice on 80C and 80CCD(1B).", "80C", "Chiplun"],
  ])("%s keeps %s", async (text, keepTerm, mustGo) => {
    // A deliberately over-eager model that flags everything capitalised or listed.
    const eager: Detector = {
      async direct(t) {
        const items = ["gst", "Friday", "WhatsApp", "80C", "80CCD(1B)", "Aarav Shah", "Infosys", "Rose Shah", "Chiplun"]
          .filter((x) => t.includes(x)).map((x) => ({ text: x, category: "ORG" as Category }));
        return { ms: 1, data: { items } };
      },
      async indirect(t) {
        const items = ["advice on 80C", "only female cardiologist", "by Friday"].filter((x) => t.includes(x)).map((x) => ({ text: x, category: "QUASI" as Category }));
        return { ms: 1, data: { items } };
      },
      async attack() { return { ms: 1, data: { clues: [] } }; },
    };
    const r = await runVeil(text, { regions: ["IN"], detector: eager });
    const b = buildCloudPayload({ question: "Help.", questionSpans: [], doc: text, docSpans: r.spans, packs: r.packs });
    expect(b.payload).toContain(keepTerm);
    expect(b.payload.toLowerCase()).not.toContain(mustGo.toLowerCase());
  });
});

describe("obfuscation decoding", () => {
  it("emails written with [at] / (dot) and spelled-out phone numbers", () => {
    const t = "Reach me at rohan [at] gmail [dot] com or rohan(at)gmail(dot)com. WhatsApp: nine eight two two zero one four five six seven.";
    const k = runRules(t, IN).map((s) => s.kind);
    expect(k.filter((x) => x === "EMAIL")).toHaveLength(2);
    expect(k).toContain("PHONE");
    const { masked } = mask(t, runRules(t, IN).sort((a, b) => a.start - b.start).filter((s, i, a) => i === 0 || s.start >= a[i - 1].end));
    expect(masked).not.toMatch(/rohan|nine eight/i);
  });
});

describe("landing page game: Veil's answer key", () => {
  it("rules alone catch every secret in the Beat Veil message, and nothing else", async () => {
    const { GAME_MESSAGE, GAME_SECRETS } = await import("../site/gameMessage");
    const r = await runVeil(GAME_MESSAGE, { regions: ["IN"], detector: null });
    const masked = mask(GAME_MESSAGE, r.spans).masked;
    for (const s of GAME_SECRETS) expect(masked, s).not.toContain(s);
    expect(r.spans.length).toBe(GAME_SECRETS.length);
    expect(masked).toContain("HDFC");
    expect(masked).toContain("Friday");
  });
});

describe("robustness", () => {
  it("freeze: a failing on-device step degrades instead of hanging or crashing", async () => {
    const broken: Detector = {
      async direct() { throw new Error("On-device step timed out after 25s"); },
      async indirect() { throw new Error("boom"); },
      async attack() { throw new Error("boom"); },
    };
    const text = "My client Rohan Mehta, PAN BQRPM4821K.";
    const r = await runVeil(text, { regions: ["IN"], detector: broken });
    expect(r.stage).toBe("done");
    expect(r.degraded).toBe(true);
    expect(r.stages.some((s) => s.failed)).toBe(true);
    expect(mask(text, r.spans).masked).toContain("[PAN_1]"); // rules still protect
  });

  it("B8: flags non-Latin scripts for review", async () => {
    const r = await runVeil("ग्राहक: रोहन मेहता, पैन BQRPM4821K", { regions: ["IN"], detector: null });
    expect(r.nonLatin).toBe(true);
    expect(mask("ग्राहक: रोहन मेहता, पैन BQRPM4821K", r.spans).masked).toContain("[PAN_1]");
  });
});
