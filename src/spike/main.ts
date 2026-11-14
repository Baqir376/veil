// Veil benchmark / debug page (/spike.html). Uses the same pipeline as the product.
import "./style.css";
import { SAMPLES } from "../samples";
import { runVeil, riskOf, mask, rehydrate, recall, maskOptionsFor, buildCloudPayload, type VeilResult, type RegionId } from "../engine";
import { availability, warmUp, detectDirect, askCloud, hasPromptApi, nanoDetector } from "../nano";
import { appCheckEnabled } from "../firebase";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

$("#app").innerHTML = `
  <header>
    <h1>Veil · benchmark & debug</h1>
    <p class="sub">Same pipeline as the app: rules → Nano names/places → Nano clues → "Guess Who" attacker.</p>
  </header>
  <section class="card" id="status-card">
    <div><strong>On-device model:</strong> <span id="status">checking…</span></div>
    <button id="download" hidden>Download / prepare Gemini Nano</button>
    <progress id="progress" max="100" value="0" hidden></progress>
  </section>
  <section class="card">
    <div class="row">
      <div style="flex:3"><label for="sample">Synthetic test document</label>
        <select id="sample">${SAMPLES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></div>
      <div style="flex:1"><label for="region">Region pack</label>
        <select id="region"><option>IN</option><option>EU</option><option>UK</option><option>US</option></select></div>
    </div>
    <textarea id="input" rows="12" spellcheck="false"></textarea>
    <div class="row">
      <button id="run-rules">Rules only (safe mode)</button>
      <button id="run-full" class="primary">Full Veil pipeline</button>
      <button id="run-all">Run all samples (benchmark)</button>
    </div>
  </section>
  <section class="grid">
    <div class="card"><h2>Detected <span class="legend"><mark class="rule">rule</mark> <mark class="nano">Nano</mark> <mark class="attacker">attacker loop</mark></span></h2><div id="highlight" class="doc"></div><div id="metrics"></div></div>
    <div class="card"><h2>What the cloud would see</h2><pre id="masked" class="doc"></pre><div id="attack"></div></div>
  </section>
  <section class="card">
    <h2>Ask the cloud (Gemini, ONLY_IN_CLOUD) — it only ever receives the masked text</h2>
    <input id="question" value="Explain this notice in simple terms and draft a short, polite reply." />
    <div class="row"><button id="run-cloud" class="primary">Mask on-device → ask cloud → restore on-device</button></div>
    <div class="grid">
      <div><h2>Cloud answer (as received)</h2><pre id="cloud-raw" class="doc"></pre></div>
      <div><h2>Answer with real values restored locally</h2><pre id="cloud-final" class="doc"></pre></div>
    </div>
    <div id="cloud-meta" class="muted"></div>
  </section>
  <section class="card" id="bench-card" hidden><h2>Benchmark</h2><div id="bench"></div></section>
`;

const sampleSel = $<HTMLSelectElement>("#sample");
const regionSel = $<HTMLSelectElement>("#region");
const input = $<HTMLTextAreaElement>("#input");

function loadSample() {
  const s = SAMPLES.find((x) => x.id === sampleSel.value)!;
  input.value = s.text;
  regionSel.value = s.region;
}
sampleSel.onchange = loadSample;
loadSample();

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const region = () => regionSel.value as RegionId;
const run = (text: string, r: RegionId, full: boolean, onUpdate?: (x: VeilResult) => void) =>
  runVeil(text, { regions: [r], detector: full ? nanoDetector : null, onUpdate });

function render(text: string, res: VeilResult) {
  let html = "";
  let cur = 0;
  for (const s of res.spans) {
    const cls = s.origin === "attacker" ? "attacker" : s.source;
    html += esc(text.slice(cur, s.start));
    html += `<mark class="${cls}" title="${s.kind ?? s.category} · ${s.origin ?? s.source}">${esc(text.slice(s.start, s.end))}</mark>`;
    cur = s.end;
  }
  $("#highlight").innerHTML = html + esc(text.slice(cur));
  $("#masked").textContent = mask(text, res.spans, maskOptionsFor(res.packs)).masked;

  const exp = SAMPLES.find((x) => x.text === text)?.expected;
  const r = exp ? recall(text, res.spans, exp) : null;
  $("#metrics").innerHTML = (r ? `
    <p class="metric"><strong>Recall:</strong> ${r.caught}/${r.total} full · ${r.partial.length} partial · ${r.missed.length} missed</p>
    ${r.partial.length ? `<p class="warn">Partial: ${r.partial.map(esc).join(" · ")}</p>` : ""}
    ${r.missed.length ? `<p class="missed">Missed: ${r.missed.map(esc).join(" · ")}</p>` : `<p class="ok">Nothing fully missed ✅</p>`}` : "")
    + `<p class="muted">${res.stages.map((s) => esc(`${s.stage}${s.source ? ` [${s.source}]` : ""}: ${s.note} (${s.ms} ms)`)).join("<br>")}<br>`
    + `${res.stage === "done" ? "Total" : "Running… " + res.stage} ${res.ms} ms · mode: ${res.mode}</p>`;

  $("#attack").innerHTML = res.rounds.map((rd, i) => `
    <p class="risk risk-${riskOf(rd.visible)}">Round ${i + 1} re-identification risk: <strong>${riskOf(rd.visible).toUpperCase()}</strong> · ${rd.visible} specific clue(s) still visible</p>
    ${rd.clues.length ? `<ul>${rd.clues.map((c) => `<li><q>${esc(c.quote)}</q> — <span class="muted">${esc(c.why)}</span></li>`).join("")}</ul>` : ""}`).join("")
    + (res.suggestions.length ? `<h2>Suggestions — not masked, you decide</h2><ul>${res.suggestions.map((c) =>
      `<li><q>${esc(c.quote)}</q> — <span class="muted">${esc(c.why)}</span></li>`).join("")}</ul>` : "");
}

async function guard(btn: HTMLButtonElement, fn: () => Promise<void>) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Running…";
  try { await fn(); }
  catch (e: any) { $("#metrics").innerHTML = `<p class="missed">Error: ${esc(String(e?.message ?? e))}</p>`; console.error(e); }
  finally { btn.disabled = false; btn.textContent = label; }
}

$<HTMLButtonElement>("#run-rules").onclick = (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
  render(input.value, await run(input.value, region(), false));
});

$<HTMLButtonElement>("#run-full").onclick = (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
  const text = input.value;
  render(text, await run(text, region(), true, (r) => render(text, r)));
});

$<HTMLButtonElement>("#run-cloud").onclick = (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
  const text = input.value;
  const res = await run(text, region(), true, (r) => render(text, r));
  render(text, res);
  const question = $<HTMLInputElement>("#question").value;
  const q = await runVeil(question, { regions: [region()], detector: nanoDetector, maxRounds: 0 });
  const { payload, vault, reserved } = buildCloudPayload({ question, questionSpans: q.spans, doc: text, docSpans: res.spans, packs: res.packs });
  $("#cloud-meta").textContent = "Asking the cloud with masked text…";
  const cloud = await askCloud(payload);
  const restored = rehydrate(cloud.text, vault, reserved);
  $("#cloud-raw").textContent = cloud.text;
  $("#cloud-final").textContent = restored.text;
  $("#cloud-meta").innerHTML = `Cloud call [${cloud.source}] ${cloud.ms} ms · ${vault.size} values stayed on this device` +
    (restored.invented.length ? ` · <span class="missed">cloud invented (left unrestored): ${restored.invented.map(esc).join(", ")}</span>` : " · no invented placeholders ✅") +
    (restored.unused.length ? ` · ${restored.unused.length} placeholders not used in answer` : "");
});

$<HTMLButtonElement>("#run-all").onclick = (e) => guard(e.currentTarget as HTMLButtonElement, async () => {
  $("#bench-card").hidden = false;
  const rows: string[] = [];
  const head = `<tr><th>Document</th><th>Rules</th><th>Veil (full / partial)</th><th>Risk by round</th><th>Suggestions</th><th>Time</th><th>Still missed</th></tr>`;
  for (const s of SAMPLES) {
    const rulesOnly = recall(s.text, (await run(s.text, s.region, false)).spans, s.expected);
    const res = await run(s.text, s.region, true);
    const r = recall(s.text, res.spans, s.expected);
    const risks = res.rounds.map((rd) => `<span class="risk-${riskOf(rd.visible)}">${riskOf(rd.visible)} (${rd.visible})</span>`).join(" → ");
    rows.push(`<tr><td>${s.label}</td><td>${rulesOnly.caught}/${rulesOnly.total}</td>
      <td>${r.caught}/${r.total} · +${r.partial.length} partial</td><td>${risks}</td><td>${res.suggestions.length}</td><td>${res.ms} ms</td>
      <td class="missed">${r.missed.map(esc).join(" · ")}</td></tr>`);
    $("#bench").innerHTML = `<table><thead>${head}</thead><tbody>${rows.join("")}</tbody></table>`;
  }
});

async function refreshStatus() {
  const st = await availability().catch((e) => `error: ${e?.message ?? e}`);
  const label: Record<string, string> = {
    "no-api": "❌ Prompt API not found — enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input and restart Chrome",
    available: "✅ available",
    downloadable: "⬇️ downloadable — click the button to download",
    downloading: "⏳ downloading…",
    unavailable: "❌ unavailable on this device",
  };
  if (!warmed) $("#status").textContent = label[st] ?? st;
  $("#download").hidden = !(st === "downloadable" || st === "downloading");
  for (const id of ["#run-full", "#run-all", "#run-cloud"]) $<HTMLButtonElement>(id).disabled = st !== "available";
}

$<HTMLButtonElement>("#download").onclick = async () => {
  const p = $<HTMLProgressElement>("#progress");
  p.hidden = false;
  try { await warmUp((pct) => (p.value = pct)); } catch (e) { console.error(e); }
  p.hidden = true;
  refreshStatus();
};

let warmed = false;
async function warm() {
  if (warmed || (await availability()) !== "available") return;
  warmed = true;
  const t0 = performance.now();
  $("#status").textContent = "✅ available · warming up…";
  try {
    await detectDirect("Warm-up.");
    $("#status").textContent = `✅ available · warm (${Math.round(performance.now() - t0)} ms)`;
  } catch (e) {
    console.warn("[Veil] warm-up deferred until first interaction", e);
    warmed = false;
    $("#status").textContent = "✅ available · click anywhere to warm up";
    window.addEventListener("pointerdown", warm, { once: true });
    window.addEventListener("keydown", warm, { once: true });
  }
}

if (!hasPromptApi()) console.warn("LanguageModel is undefined in this browser.");
if (!appCheckEnabled) $("#status-card").insertAdjacentHTML("beforeend", `<p class="warn">App Check not configured (VITE_RECAPTCHA_SITE_KEY empty).</p>`);
refreshStatus().then(warm);
