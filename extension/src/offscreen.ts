// Offscreen document: an invisible extension page — the place Chrome exposes the Prompt API to.
// Detection runs here through Firebase AI Logic in ONLY_ON_DEVICE mode, so nothing leaves the device.
import { initializeApp } from "firebase/app";
import { getAI, GoogleAIBackend } from "firebase/ai";
import { bindAI, nanoDetector, availability, hasPromptApi } from "../../src/nanoCore";
import { runVeil } from "../../src/engine";
import type { DetectResponse, StatusResponse, ToOffscreen } from "./messages";

declare const __FIREBASE_CONFIG__: Record<string, string>;

let firebaseOk = false;
try {
  const app = initializeApp(__FIREBASE_CONFIG__, "veil-extension");
  bindAI(getAI(app, { backend: new GoogleAIBackend() }));
  firebaseOk = true;
} catch (e) {
  console.warn("[Veil] Firebase AI Logic init failed — rules only", e);
}

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (msg?.target !== "offscreen") return false;
  const p = msg.payload;
  (async () => {
    if (p.veil === "status") {
      const a = await availability().catch(() => "error");
      sendResponse({ hasLanguageModel: hasPromptApi(), availability: a, firebase: firebaseOk } satisfies StatusResponse);
      return;
    }
    const t0 = performance.now();
    try {
      const canRun = firebaseOk && hasPromptApi() && (await availability()) === "available";
      const r = await runVeil(p.text, { regions: [p.region], detector: canRun ? nanoDetector : null });
      sendResponse({ ok: true, spans: r.spans, mode: r.mode, degraded: r.degraded, ms: Math.round(performance.now() - t0), stages: r.stages } satisfies DetectResponse);
    } catch (e) {
      sendResponse({ ok: false, spans: [], mode: "rules-only", degraded: true, ms: 0, stages: [], error: String((e as Error)?.message ?? e) } satisfies DetectResponse);
    }
  })();
  return true;
});
