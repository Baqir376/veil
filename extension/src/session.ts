// Per-tab vault for the extension. Lives only in the content script's memory (gone when the tab closes).
// Keeps placeholders stable across several pastes in the same chat, so "[PERSON_1]" always means the
// same person and the AI's answers can be restored correctly.
import { mask, PLACEHOLDER_RE, LOOSE_PLACEHOLDER_RE, maskOptionsFor, SpanTools, neverMaskTerms, protectedRanges, type Span, type Pack } from "../../src/engine";

export class SessionVault {
  private valueToId = new Map<string, string>();
  readonly idToValue = new Map<string, string>();
  private counters: Record<string, number> = {};

  get size() { return this.idToValue.size; }

  /** Spans for every value this chat has already hidden, wherever it reappears (whole words only). */
  knownSpans(text: string): Span[] {
    const out: Span[] = [];
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [value, id] of this.valueToId) {
      if (value.length < 3) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(value)}(?![\\p{L}\\p{N}])`, "gu");
      for (const m of text.matchAll(re)) {
        out.push({ start: m.index!, end: m.index! + value.length, text: value, category: id.startsWith("PERSON") ? "PERSON" : "OTHER", source: "rule", origin: "session" });
      }
    }
    return out;
  }

  /** Mask `text`, reusing this chat's existing placeholders for values seen before. */
  protect(text: string, spans: Span[], packs: Pack[]): { masked: string; added: number } {
    const tools = new SpanTools(neverMaskTerms(packs));
    const all = tools.merge(text, [...spans, ...this.knownSpans(text)], protectedRanges(text, packs));
    const m = mask(text, all, maskOptionsFor(packs));
    const remap = new Map<string, string>();
    let added = 0;
    for (const [id, value] of m.vault) {
      let target = this.valueToId.get(value);
      if (!target) {
        const label = id.replace(/_\d+$/, "");
        do { this.counters[label] = (this.counters[label] ?? 0) + 1; target = `${label}_${this.counters[label]}`; }
        while (this.idToValue.has(target) || m.reserved.has(target));
        this.valueToId.set(value, target);
        this.idToValue.set(target, value);
        added++;
      }
      remap.set(id, target);
    }
    const masked = m.masked.replace(new RegExp(PLACEHOLDER_RE.source, "g"), (whole, id: string) => {
      const t = remap.get(id);
      return t ? whole.replace(id, t) : whole; // user's own template tokens stay untouched
    });
    return { masked, added };
  }

  /** A throwaway copy, for previews that must not change the real vault until the user confirms. */
  clone(): SessionVault {
    const c = new SessionVault();
    for (const [k, v] of this.valueToId) c.valueToId.set(k, v);
    for (const [k, v] of this.idToValue) c.idToValue.set(k, v);
    c.counters = { ...this.counters };
    return c;
  }

  /** Like restore(), but also reports where each restored value sits (for on-page highlighting). */
  restoreWithPositions(text: string): { out: string; hits: { start: number; end: number }[] } | null {
    const re = new RegExp(LOOSE_PLACEHOLDER_RE.source, "g");
    let out = "", cur = 0;
    const hits: { start: number; end: number }[] = [];
    for (const m of text.matchAll(re)) {
      const v = this.idToValue.get(m[1].toUpperCase());
      if (v === undefined) continue;
      out += text.slice(cur, m.index!);
      hits.push({ start: out.length, end: out.length + v.length });
      out += v;
      cur = m.index! + m[0].length;
    }
    if (!hits.length) return null;
    return { out: out + text.slice(cur), hits };
  }

  /** Replace this chat's placeholders in `text` with the real values. Returns null if nothing changed. */
  restore(text: string): string | null {
    let changed = false;
    const out = text.replace(new RegExp(LOOSE_PLACEHOLDER_RE.source, "g"), (whole, raw: string) => {
      const v = this.idToValue.get(raw.toUpperCase());
      if (v === undefined) return whole;
      changed = true;
      return v;
    });
    return changed ? out : null;
  }
}
