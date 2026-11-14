// Messages between the content script, the service worker and the offscreen document.
// Private values never travel through chrome.storage — only through in-memory messages on this device.
import type { RegionId, Span } from "../../src/engine";

export type DetectRequest = { veil: "detect"; text: string; region: RegionId };
export type DetectResponse = {
  ok: boolean;
  spans: Span[];
  mode: "full" | "rules-only";
  degraded: boolean;
  ms: number;
  stages: { stage: string; ms: number; source?: string; note: string; failed?: boolean }[];
  error?: string;
};
export type StatusRequest = { veil: "status" };
export type StatusResponse = { hasLanguageModel: boolean; availability: string; firebase: boolean };
export type StatsAdd = { veil: "stats"; protected: number; site: string };

/** Envelope the service worker uses to address the offscreen document specifically. */
export type ToOffscreen = { target: "offscreen"; payload: DetectRequest | StatusRequest };
