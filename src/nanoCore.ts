// On-device (Gemini Nano) and in-cloud (Gemini) calls — all through Firebase AI Logic hybrid inference.
// Shared by the web app (src/nano.ts) and the Chrome extension (extension/src/offscreen.ts).
import { getGenerativeModel, InferenceMode, type AI, type GenerativeModel, type LanguageModelMessage } from "firebase/ai";
import type { Category, Detector } from "./engine";

declare const LanguageModel: any; // Chrome Prompt API global, used only for the availability check

// ---------- Prompts ----------
// Latency note: the SDK opens a fresh session per request, so every token of system prompt and
// example is re-processed each call, and Nano's output speed dominates. Keep prompts short and
// outputs compact (arrays of strings, no repeated keys).

// IDs, numbers, emails and amounts are already caught by the rule packs in ~2 ms, so the model
// only looks for what regex cannot: names and places.
const DIRECT_SYSTEM = `List names of people, names of companies/employers/banks, and places (towns, cities,
neighbourhoods, buildings, street addresses) in the text. Skip ID numbers, phone numbers, emails and money.
Copy each item exactly as written.`;

const INDIRECT_SYSTEM = `Find phrases that could identify a person without naming them, and sensitive facts.
clues: unique descriptions ("the only ..."), small places, landmarks, media mentions, relatives, family events.
sensitive: health, mental health, disability, religion, caste, sexuality, divorce, pregnancy.
Copy exact phrases from the text; for unique descriptions include the whole phrase ("the only X in Y").
Skip names and numbers.`;

const INDIRECT_EXAMPLE_IN = `He runs the only Parsi bakery in Udaipur, behind the clock tower. He was on NDTV after his triplets cleared UPSC. He has diabetes and separated from his wife.`;
const INDIRECT_EXAMPLE_OUT = JSON.stringify({
  clues: ["the only Parsi bakery", "Udaipur", "behind the clock tower", "on NDTV", "his triplets cleared UPSC"],
  sensitive: ["diabetes", "separated from his wife"],
});

// Attribute-inference attacker, after Staab et al. (ICLR 2024 / ICLR 2025): instead of "find clues",
// the attacker tries to INFER facts about the person and must cite the exact evidence phrase.
// Evidence phrases are what Veil masks next; the guesses make the risk understandable to the user.
const ATTACK_SYSTEM = `You are a privacy attacker. Placeholders like [PERSON_1] are hidden and useless to you.
From the remaining text, infer up to 4 facts about the person: where they live, age, job or workplace,
family situation, health, income, or a unique description that singles them out.
For each: attribute, your guess, and the exact evidence phrase copied from the text (not a placeholder).
Only include facts the text really supports. Return an empty list if you cannot infer anything specific.`;

const CLOUD_SYSTEM = `You are a helpful expert assistant for accountants, lawyers and HR professionals.
The user's text contains placeholders like [PERSON_1], [PAN_1], [IBAN_1] or [AMOUNT_2 · ₹15–20L] that stand
for real values hidden for privacy. The label says what kind of value it is; an amount may carry a rough
size band after "·" — use it for thresholds and tax slabs, never as an exact number.
Keep every placeholder EXACTLY as written in your answer (same label and number; the "· band" part may be
dropped). Never guess, compute or invent hidden values.
Text OUTSIDE square brackets is real and visible: copy it as-is (years, section numbers, form names, etc.).
Never put visible text into brackets and never create placeholders that are not in the user's text.`;

// ---------- Schemas (compact: arrays of strings) ----------
const strings = (max: number) => ({ type: "array", items: { type: "string" }, maxItems: max });

const DIRECT_SCHEMA = {
  type: "object",
  properties: { people: strings(25), orgs: strings(10), places: strings(10) },
  required: ["people", "orgs", "places"],
};

const INDIRECT_SCHEMA = {
  type: "object",
  properties: { clues: strings(8), sensitive: strings(6) },
  required: ["clues", "sensitive"],
};

const ATTACK_SCHEMA = {
  type: "object",
  properties: {
    inferences: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          attribute: { type: "string", enum: ["location", "age", "occupation", "workplace", "family", "health", "income", "unique"] },
          guess: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["attribute", "guess", "evidence"],
      },
    },
  },
  required: ["inferences"],
};

// ---------- Models ----------
const LANG = { expectedInputs: [{ type: "text" as const, languages: ["en"] }], expectedOutputs: [{ type: "text" as const, languages: ["en"] }] };
const msg = (role: "system" | "user" | "assistant", value: string): LanguageModelMessage => ({ role, content: [{ type: "text", value }] });

/** A task that must never leave the device: ONLY_ON_DEVICE throws instead of falling back to the cloud. */
function deviceTask(ai: AI, initialPrompts: LanguageModelMessage[], schema: object): GenerativeModel {
  return getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: {
      createOptions: { ...LANG, initialPrompts },
      promptOptions: { responseConstraint: schema },
    },
  });
}

let directModel: GenerativeModel, indirectModel: GenerativeModel, attackModel: GenerativeModel, cloudModel: GenerativeModel;

/**
 * Bind the models to a Firebase AI Logic instance. The web app passes one with App Check; the Chrome
 * extension passes one without (it only makes ONLY_ON_DEVICE calls, which never touch the network).
 */
export function bindAI(ai: AI) {
  directModel = deviceTask(ai, [msg("system", DIRECT_SYSTEM)], DIRECT_SCHEMA);
  indirectModel = deviceTask(ai,
    [msg("system", INDIRECT_SYSTEM), msg("user", INDIRECT_EXAMPLE_IN), msg("assistant", INDIRECT_EXAMPLE_OUT)],
    INDIRECT_SCHEMA,
  );
  attackModel = deviceTask(ai, [msg("system", ATTACK_SYSTEM)], ATTACK_SCHEMA);
  /** Reasoning over already-masked text: ONLY_IN_CLOUD. */
  cloudModel = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: { model: "gemini-3.5-flash-lite", systemInstruction: CLOUD_SYSTEM },
  });
}
export function hasPromptApi(): boolean {
  return typeof LanguageModel !== "undefined";
}

export async function availability(): Promise<string> {
  if (!hasPromptApi()) return "no-api";
  return LanguageModel.availability(LANG);
}

/** Must be called from a click handler (Chrome requires user activation to download). */
export function warmUp(onProgress: (pct: number) => void) {
  return directModel.initializeDeviceModel((v) => onProgress(Math.round(v * 100)));
}

/** No on-device call may hang the app: give up after this long and let the pipeline degrade gracefully. */
// Benchmark (113 cases): normal on-device calls finish in 1–10 s; stalls are clustered and unbounded.
const DEVICE_TIMEOUT_MS = 20_000;

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out after ${ms / 1000}s`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** Parse model JSON; if it's wrapped in prose or code fences, salvage the first {...} block. */
function parseJson<T>(raw: string): T {
  try { return JSON.parse(raw) as T; } catch { /* fall through */ }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1)) as T;
  throw new Error("On-device model returned unreadable output");
}

/** One on-device call with a timeout; retried once with a fresh session if it fails. */
async function run<T>(model: GenerativeModel, prompt: string) {
  const t0 = performance.now();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await withTimeout(model.generateContent(prompt), DEVICE_TIMEOUT_MS, "On-device step");
      return {
        data: parseJson<T>(result.response.text()),
        ms: Math.round(performance.now() - t0),
        source: result.response.inferenceSource,
      };
    } catch (e) {
      lastError = e;
      console.warn(`[Veil] on-device attempt ${attempt + 1} failed`, e);
    }
  }
  throw lastError;
}

type Items = { items: { text: string; category: Category }[] };
export type Attack = { clues: { quote: string; why: string }[] };

const tag = (list: unknown, category: Category) =>
  (Array.isArray(list) ? list : []).filter((t): t is string => typeof t === "string").map((text) => ({ text, category }));

// In-memory cache: re-running the same text is instant. Never persisted.
const cache = new Map<string, Promise<any>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, fn().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key)!;
}

export const detectDirect = (text: string) => cached(`d:${text}`, async () => {
  const r = await run<{ people?: string[]; orgs?: string[]; places?: string[] }>(directModel, text);
  const data: Items = { items: [...tag(r.data.people, "PERSON"), ...tag(r.data.orgs, "ORG"), ...tag(r.data.places, "LOCATION")] };
  return { ...r, data };
});

export const detectIndirect = (text: string) => cached(`i:${text}`, async () => {
  const r = await run<{ clues?: string[]; sensitive?: string[] }>(indirectModel, text);
  const data: Items = { items: [...tag(r.data.clues, "QUASI"), ...tag(r.data.sensitive, "SENSITIVE")] };
  return { ...r, data };
});

type Inference = { attribute?: string; guess?: string; evidence?: string };

export const attack = (maskedText: string) => cached(`a:${maskedText}`, async () => {
  const r = await run<{ inferences?: Inference[] }>(attackModel, maskedText);
  const clues = (r.data.inferences ?? [])
    .filter((i) => typeof i.evidence === "string" && i.evidence.trim())
    .map((i) => ({ quote: i.evidence!.trim(), why: `${i.attribute ?? "clue"}: ${i.guess ?? "?"}` }));
  return { ...r, data: { clues } satisfies Attack };
});

/** The on-device detector used by the Veil pipeline (all calls ONLY_ON_DEVICE via Firebase AI Logic). */
export const nanoDetector: Detector = { direct: detectDirect, indirect: detectIndirect, attack };

/** Send an already-masked payload (see buildCloudPayload) to the cloud model. */
export async function askCloud(payload: string) {
  const t0 = performance.now();
  const result = await withTimeout(cloudModel.generateContent(payload), 60_000, "Cloud request");
  return { text: result.response.text(), ms: Math.round(performance.now() - t0), source: result.response.inferenceSource };
}

export function riskLabel(score: number): "low" | "medium" | "high" {
  return score >= 7 ? "high" : score >= 4 ? "medium" : "low";
}
