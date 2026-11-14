// Benchmark helpers (ground-truth recall). Not used by the product at runtime.
import type { Span } from "./types";

/**
 * full    = every character of the expected phrase is masked
 * partial = at least 40% masked (e.g. "Chiplun" inside "ayurvedic pharmacy in Chiplun")
 * missed  = less than that
 */
export function recall(text: string, spans: Span[], expected: string[]) {
  const missed: string[] = [];
  const partial: string[] = [];
  for (const exp of expected) {
    const idx = text.indexOf(exp);
    if (idx < 0) continue;
    const end = idx + exp.length;
    let covered = 0;
    for (const s of spans) covered += Math.max(0, Math.min(s.end, end) - Math.max(s.start, idx));
    const ratio = covered / exp.length;
    if (ratio >= 0.95) continue;
    if (ratio >= 0.4) partial.push(exp); else missed.push(exp);
  }
  return { caught: expected.length - missed.length - partial.length, partial, missed, total: expected.length };
}
