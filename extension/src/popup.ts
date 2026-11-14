// Toolbar popup: model status (here and in the offscreen detector), one-click model download,
// region rules and counts. Only counts are ever stored — never values.
import type { StatusResponse } from "./messages";

declare const LanguageModel: any;
declare const __STUDIO_URL__: string;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OPTS = { expectedInputs: [{ type: "text", languages: ["en"] }], expectedOutputs: [{ type: "text", languages: ["en"] }] };

$<HTMLAnchorElement>("studio").href = __STUDIO_URL__;

async function refresh() {
  const here = typeof LanguageModel !== "undefined" ? await LanguageModel.availability(OPTS).catch(() => "error") : "not in this Chrome";
  $("nano").textContent = here;
  $("d1").className = `dot ${here === "available" ? "ok" : here === "downloadable" || here === "downloading" ? "warn" : ""}`;
  $("prep").hidden = !(here === "downloadable" || here === "downloading");
  $("hint").textContent = here === "available" ? "Names and indirect clues are detected on this device."
    : here === "not in this Chrome" ? "Enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, then restart Chrome. Rules still protect IDs."
    : here === "unavailable" ? "This device can't run Gemini Nano. Veil uses rules only (IDs, labelled names)." : "";
  try {
    const s: StatusResponse = await chrome.runtime.sendMessage({ veil: "status" });
    const ok = s.firebase && s.hasLanguageModel && s.availability === "available";
    $("off").textContent = ok ? "ready" : !s.firebase ? "Firebase error" : !s.hasLanguageModel ? "no Prompt API" : s.availability;
    $("d2").className = `dot ${ok ? "ok" : "warn"}`;
  } catch (e) {
    $("off").textContent = "starting…";
  }
  const st = (await chrome.storage.local.get({ protectedTotal: 0, sites: {} })) as { protectedTotal: number; sites: Record<string, number> };
  $("total").textContent = String(st.protectedTotal);
  $("sites").innerHTML = Object.entries(st.sites).map(([k, v]) => `<span class="site">${k} · ${v}</span>`).join("");
}

$("prep").addEventListener("click", async () => {
  const p = $<HTMLProgressElement>("prog");
  p.hidden = false;
  try {
    const s = await LanguageModel.create({ ...OPTS, monitor(m: any) { m.addEventListener("downloadprogress", (e: any) => { p.value = Math.round(e.loaded * 100); }); } });
    s.destroy?.();
  } catch (e) { $("hint").textContent = String((e as Error)?.message ?? e); }
  p.hidden = true;
  refresh();
});

const region = $<HTMLSelectElement>("region");
chrome.storage.sync.get({ region: "IN" }).then((s) => { region.value = (s as { region: string }).region; });
region.addEventListener("change", () => chrome.storage.sync.set({ region: region.value }));

refresh();
