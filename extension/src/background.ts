// Service worker: routes detection requests from content scripts to the offscreen document, where
// Gemini Nano runs through Firebase AI Logic (ONLY_ON_DEVICE). Keeps only COUNTS in storage, never values.
import type { DetectRequest, StatsAdd, StatusRequest, ToOffscreen } from "./messages";

let creating: Promise<void> | null = null;

async function ensureOffscreen() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Run Gemini Nano on-device (Firebase AI Logic) to find personal data before it is pasted into an AI chat.",
    }).finally(() => { creating = null; });
  }
  await creating;
}

chrome.runtime.onMessage.addListener((msg: DetectRequest | StatusRequest | StatsAdd | ToOffscreen, _sender, sendResponse) => {
  if ((msg as ToOffscreen).target === "offscreen") return false; // meant for the offscreen page, not us

  if ((msg as DetectRequest).veil === "detect" || (msg as StatusRequest).veil === "status") {
    (async () => {
      try {
        await ensureOffscreen();
        const res = await chrome.runtime.sendMessage({ target: "offscreen", payload: msg as DetectRequest | StatusRequest } satisfies ToOffscreen);
        sendResponse(res);
      } catch (e) {
        sendResponse({ ok: false, error: String((e as Error)?.message ?? e) });
      }
    })();
    return true; // async response
  }

  if ((msg as StatsAdd).veil === "stats") {
    const m = msg as StatsAdd;
    chrome.storage.local.get({ protectedTotal: 0, sites: {} }).then((raw) => {
      const s = raw as { protectedTotal: number; sites: Record<string, number> };
      s.sites[m.site] = (s.sites[m.site] ?? 0) + m.protected;
      chrome.storage.local.set({ protectedTotal: s.protectedTotal + m.protected, sites: s.sites });
    });
  }
  return false;
});
