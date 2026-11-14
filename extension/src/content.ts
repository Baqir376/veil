// Veil inside ChatGPT, Gemini and Claude.
//  1. Intercepts paste into the chat box BEFORE the site sees it, and shows what Veil found.
//  2. Rules run instantly here; Gemini Nano (on-device, via Firebase AI Logic in the offscreen page) adds
//     names and indirect clues a moment later.
//  3. "Paste protected" inserts tags; the site's AI only ever sees tags.
//  4. When the AI answers with [PERSON_1], Veil swaps the real value back in — on this screen only.
// The vault lives in this tab's memory only. Nothing private is stored or sent anywhere.
import { runVeil, packsFor, type RegionId, type Span } from "../../src/engine";
import { SessionVault } from "./session";
import type { DetectResponse, StatusResponse } from "./messages";

const SITE = location.hostname.includes("gemini") ? "Gemini" : location.hostname.includes("claude") ? "Claude" : "ChatGPT";
const vault = new SessionVault();
let region: RegionId = "IN";
let showReal = true;
let nano: StatusResponse | null = null;
chrome.storage?.sync.get({ region: "IN" }).then((s) => { region = (s as { region: RegionId }).region; }).catch(() => {});
chrome.storage?.onChanged.addListener((c) => { if (c.region) region = c.region.newValue as RegionId; });

// ───────────────────────── UI shell (shadow DOM, Redacted theme) ─────────────────────────
const host = document.createElement("div");
host.id = "veil-host";
host.style.cssText = "all: initial; position: fixed; inset: 0; pointer-events: none; z-index: 2147483646;";
const root = host.attachShadow({ mode: "open" });
root.innerHTML = `<style>
  :host { all: initial; }
  * { box-sizing: border-box; font-family: ui-sans-serif, -apple-system, "Segoe UI", Inter, sans-serif; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; }
  .card { position: fixed; pointer-events: auto; width: 560px; max-width: calc(100vw - 24px); color: #16150f;
    background: linear-gradient(180deg, rgb(255 253 248 / .97), rgb(250 245 235 / .95)); border: 1.5px solid #16150f; border-radius: 18px;
    box-shadow: 6px 6px 0 #ffc21a, 0 30px 70px -20px rgb(0 0 0 / .45); padding: 16px 16px 14px; backdrop-filter: blur(16px);
    animation: pop .35s cubic-bezier(.16,1,.3,1) both; }
  @keyframes pop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
  .head { display: flex; align-items: center; gap: 10px; }
  .logo { width: 26px; height: 26px; border-radius: 8px; background: #16150f; display: grid; place-items: center; flex: none; }
  .title { font-size: 15px; font-weight: 650; line-height: 1.3; }
  .title b { background: linear-gradient(transparent 55%, #ffc21a 55%); padding: 0 2px; }
  .status { margin: 8px 0 10px; display: flex; flex-wrap: wrap; gap: 6px; font-size: 11.5px; }
  .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px; border: 1px solid rgb(22 21 15 / .15); background: #fff; color: #3b3932; }
  .pill i { width: 7px; height: 7px; border-radius: 50%; background: #0f7b5f; }
  .pill.busy i { background: #ffc21a; animation: pulse 1s infinite; } .pill.off i { background: #8b867a; }
  @keyframes pulse { 50% { opacity: .3; } }
  .preview { max-height: 190px; overflow: auto; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; line-height: 1.75; color: #16150f;
    background: rgb(255 255 255 / .75); border-radius: 12px; padding: 10px 12px; box-shadow: inset 0 0 0 1px rgb(22 21 15 / .08); }
  .chip { display: inline-block; background: #2a44e8; color: #fff; border-radius: 3px; padding: 0 5px; font-size: 11.5px; line-height: 1.6; white-space: nowrap; }
  .chip em { font-style: normal; opacity: .75; }
  .row { display: flex; gap: 8px; margin-top: 12px; align-items: center; flex-wrap: wrap; }
  button { cursor: pointer; font-size: 13px; border-radius: 11px; padding: 8px 14px; border: 1.5px solid #16150f; background: #fff; color: #16150f; transition: transform .12s, background .2s; }
  button:hover { background: #ffc21a; }
  button.primary { background: #16150f; color: #fffdf8; box-shadow: 3px 3px 0 #ffc21a; font-weight: 650; }
  button.primary:hover { transform: translate(-1px,-1px); background: #16150f; }
  .hint { margin-left: auto; font-size: 11px; color: #625e55; }
  .badge { position: fixed; right: 18px; bottom: 18px; pointer-events: auto; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 8px;
    border-radius: 999px; background: rgb(255 253 248 / .92); border: 1.5px solid #16150f; box-shadow: 3px 3px 0 #ffc21a, 0 12px 30px -12px rgb(0 0 0 / .4);
    font-size: 12.5px; color: #16150f; backdrop-filter: blur(12px); transition: all .3s cubic-bezier(.16,1,.3,1); }
  .badge .count { font-weight: 650; } .badge .more { display: none; gap: 6px; }
  .badge:hover .more { display: flex; }
  .badge button { padding: 5px 10px; font-size: 12px; border-radius: 999px; }
  .toast { position: fixed; right: 18px; bottom: 70px; pointer-events: none; background: #16150f; color: #fffdf8; border-radius: 12px; padding: 8px 12px;
    font-size: 12.5px; animation: pop .3s both; }
</style>
<div id="layer"></div>`;
const layer = root.getElementById("layer")!;
const LOGO = `<span class="logo"><svg width="18" height="18" viewBox="0 0 64 64" fill="none"><path d="M10 22c7 0 12 5 22 5s15-5 22-5" stroke="#f4efe6" stroke-width="7" stroke-linecap="round"/><path d="M10 40c7 0 12 5 22 5s15-5 22-5" stroke="#ffc21a" stroke-width="7" stroke-linecap="round"/></svg></span>`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const chips = (masked: string) => esc(masked).replace(/\[([A-Z][A-Z0-9_]*?)_(\d+)((?: · [^\]]*)?)\]/g,
  (_m, l: string, n: string, h: string) => `<span class="chip">${l.replace(/_/g, " ").toLowerCase()} ${n}${h ? `<em>${h}</em>` : ""}</span>`);

function mount() { if (!host.isConnected) document.documentElement.appendChild(host); }

function toast(text: string) {
  mount();
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = text;
  root.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

// ───────────────────────── Badge ─────────────────────────
const badge = document.createElement("div");
badge.className = "badge";
function renderBadge() {
  const dot = nano?.availability === "available" ? "#0f7b5f" : "#8b867a";
  badge.innerHTML = `${LOGO}<span><span class="count">${vault.size}</span> value${vault.size === 1 ? "" : "s"} protected
    <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot};margin-left:4px" title="Gemini Nano: ${nano?.availability ?? "checking"}"></span></span>
    <span class="more"><button data-a="check">Check my message</button><button data-a="toggle">${showReal ? "Show tags" : "Show real values"}</button></span>`;
}
badge.addEventListener("click", (e) => {
  const a = (e.target as HTMLElement).closest("button")?.dataset.a;
  if (a === "check") checkComposer();
  if (a === "toggle") { showReal = !showReal; showReal ? scheduleScan() : unrestoreAll(); renderBadge(); }
});
mount();
layer.appendChild(badge);
renderBadge();
chrome.runtime.sendMessage({ veil: "status" }).then((s: StatusResponse) => { nano = s; renderBadge(); }).catch(() => {});

// ───────────────────────── Composer helpers ─────────────────────────
type Editable = HTMLTextAreaElement | HTMLInputElement | HTMLElement;
const isField = (el: Element | null): el is HTMLTextAreaElement | HTMLInputElement => !!el && (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && (el as HTMLInputElement).type === "text"));
function editableFrom(t: EventTarget | null): Editable | null {
  const el = t instanceof Element ? t : null;
  if (!el) return null;
  if (isField(el)) return el;
  return el.closest<HTMLElement>('[contenteditable="true"], [contenteditable=""]');
}
function findComposer(): Editable | null {
  const active = editableFrom(document.activeElement);
  if (active) return active;
  return document.querySelector<HTMLElement>('#prompt-textarea, div.ProseMirror[contenteditable="true"], rich-textarea [contenteditable="true"], [contenteditable="true"][role="textbox"], textarea');
}
let savedRange: Range | null = null;
let savedField: { start: number; end: number } | null = null;
function saveSelection(target: Editable) {
  if (isField(target)) savedField = { start: target.selectionStart ?? target.value.length, end: target.selectionEnd ?? target.value.length };
  else { const s = getSelection(); savedRange = s && s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }
}

/** Insert text into the chat box the way the site expects (a paste it can handle), bypassing Veil. */
function insert(target: Editable, text: string, replaceAll: boolean) {
  target.focus();
  if (isField(target)) {
    const start = replaceAll ? 0 : savedField?.start ?? target.value.length;
    const end = replaceAll ? target.value.length : savedField?.end ?? target.value.length;
    target.setRangeText(text, start, end, "end");
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste", data: text }));
    return;
  }
  const sel = getSelection();
  if (replaceAll) { const r = document.createRange(); r.selectNodeContents(target); sel?.removeAllRanges(); sel?.addRange(r); }
  else if (savedRange) { sel?.removeAllRanges(); sel?.addRange(savedRange); }
  const dt = new DataTransfer();
  dt.setData("text/plain", text);
  const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
  Object.defineProperty(ev, "__veil", { value: true });
  const handled = !target.dispatchEvent(ev); // the editor called preventDefault → it inserted the text itself
  if (!handled) document.execCommand("insertText", false, text);
}

// ───────────────────────── The paste flow ─────────────────────────
let open: { close: () => void } | null = null;

window.addEventListener("paste", (e) => {
  if ((e as unknown as { __veil?: boolean }).__veil) return; // our own re-insert
  const target = editableFrom(e.target);
  if (!target || target.closest("#veil-host")) return;
  const text = e.clipboardData?.getData("text/plain") ?? "";
  if (text.trim().length < 2) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  saveSelection(target);
  flow(text, target, false);
}, true);

function checkComposer() {
  const target = findComposer();
  if (!target) return toast("Click into the chat box first.");
  const text = isField(target) ? target.value : target.innerText;
  if (!text.trim()) return toast("Nothing typed yet.");
  flow(text, target, true);
}

async function flow(text: string, target: Editable, replaceAll: boolean) {
  open?.close();
  mount();
  const packs = packsFor([region]);
  let spans: Span[] = (await runVeil(text, { regions: [region], detector: null })).spans;
  let nanoState: "busy" | "done" | "off" = nano?.availability === "available" ? "busy" : "off";
  let nanoNote = "";

  // Nothing found by rules and no on-device model to look further: don't get in the way.
  if (!spans.length && !vault.knownSpans(text).length && nanoState === "off") {
    insert(target, text, replaceAll);
    return toast("Veil checked it — nothing private found.");
  }

  const card = document.createElement("div");
  card.className = "card";
  layer.appendChild(card);
  const place = () => {
    const r = target.getBoundingClientRect();
    const w = Math.min(560, Math.max(380, r.width));
    card.style.width = `${w}px`;
    card.style.left = `${Math.max(12, Math.min(innerWidth - w - 12, r.left))}px`;
    if (r.top > 320) { card.style.bottom = `${innerHeight - r.top + 14}px`; card.style.top = ""; }
    else { card.style.top = `${r.bottom + 14}px`; card.style.bottom = ""; }
  };
  const render = () => {
    const preview = vault.clone().protect(text, spans, packs);
    const n = new Set(spans.map((s) => s.text)).size + vault.knownSpans(text).length;
    card.innerHTML = `
      <div class="head">${LOGO}<div class="title">Veil caught <b>${n} private value${n === 1 ? "" : "s"}</b> before ${SITE} saw ${replaceAll ? "your message" : "your paste"}</div></div>
      <div class="status">
        <span class="pill"><i></i>rules · instant</span>
        <span class="pill ${nanoState === "busy" ? "busy" : nanoState === "off" ? "off" : ""}"><i></i>Gemini Nano · on device · ${nanoState === "busy" ? "checking names & clues…" : nanoState === "off" ? "not available here" : nanoNote || "done"}</span>
      </div>
      <div class="preview mono">${chips(preview.masked)}</div>
      <div class="row">
        <button class="primary" data-a="protect">${replaceAll ? "Replace with protected" : "Paste protected"}</button>
        <button data-a="original">${replaceAll ? "Keep original" : "Paste original"}</button>
        <button data-a="cancel">Cancel</button>
        <span class="hint">${SITE} will only see the blue tags · Enter / Esc</span>
      </div>`;
    place();
  };
  render();

  const finish = (a: string) => {
    if (a === "protect") {
      const p = vault.protect(text, spans, packs);
      insert(target, p.masked, replaceAll);
      chrome.runtime.sendMessage({ veil: "stats", protected: p.added, site: SITE }).catch(() => {});
      renderBadge();
    } else if (a === "original") insert(target, text, replaceAll);
    close();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); finish("protect"); }
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  };
  const onClick = (e: Event) => { const a = (e.target as HTMLElement).closest("button")?.dataset.a; if (a) finish(a); };
  const close = () => { card.remove(); window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", place); open = null; };
  card.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", place);
  open = { close };

  if (nanoState === "busy") {
    try {
      const res: DetectResponse = await chrome.runtime.sendMessage({ veil: "detect", text, region });
      if (!card.isConnected) return;
      if (res?.ok) { spans = res.spans; nanoState = res.mode === "full" && !res.degraded ? "done" : "off"; nanoNote = `done in ${(res.ms / 1000).toFixed(1)} s`; }
      else nanoState = "off";
    } catch { nanoState = "off"; }
    if (card.isConnected) render();
  }
}

// ───────────────────────── Restore the AI's answers, on this screen only ─────────────────────────
const originals = new Map<Text, string>();
const hits = new Map<Text, { start: number; end: number }[]>();
const highlight = typeof Highlight !== "undefined" ? new Highlight() : null;
if (highlight && CSS.highlights) {
  CSS.highlights.set("veil-restored", highlight);
  const st = document.createElement("style");
  st.textContent = "::highlight(veil-restored) { background-color: #ffe08a; color: inherit; text-decoration: underline 2px #0f7b5f; }";
  document.head.appendChild(st);
}

function skip(node: Node) {
  const el = node.parentElement;
  return !el || !!el.closest('[contenteditable="true"], textarea, input, script, style, #veil-host');
}
function scan() {
  if (!showReal || !vault.size) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeValue && n.nodeValue.includes("[") && !skip(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const todo: Text[] = [];
  while (walker.nextNode()) todo.push(walker.currentNode as Text);
  for (const t of todo) {
    const r = vault.restoreWithPositions(t.data);
    if (!r) continue;
    originals.set(t, t.data);
    hits.set(t, r.hits);
    t.data = r.out; // in-place text change: no DOM nodes added or removed, so the site's UI stays intact
  }
  paint();
}
function paint() {
  if (!highlight) return;
  highlight.clear();
  for (const [t, hs] of hits) {
    if (!t.isConnected) { hits.delete(t); originals.delete(t); continue; }
    for (const h of hs) {
      if (h.end > t.data.length) continue;
      const r = new Range(); r.setStart(t, h.start); r.setEnd(t, h.end); highlight.add(r);
    }
  }
}
function unrestoreAll() {
  for (const [t, orig] of originals) if (t.isConnected) t.data = orig;
  originals.clear(); hits.clear(); highlight?.clear();
}
let pending = 0;
function scheduleScan() { cancelAnimationFrame(pending); pending = requestAnimationFrame(() => setTimeout(scan, 60)); }
new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true, characterData: true });
