// Scoring: strict and leak-oriented. An item counts as protected only if it no longer appears in what the
// cloud would receive (case-insensitive). A keep-term counts as preserved only if it is still there verbatim.
import { runVeil, buildCloudPayload, type Detector } from "../engine";
import type { BenchCase, BenchCategory } from "./cases";

export interface CaseResult {
  id: string;
  category: BenchCategory;
  leaked: string[];
  overMasked: string[];
  mustTotal: number;
  keepTotal: number;
  ms: number;
  degraded: boolean;
}

export async function scoreCase(c: BenchCase, detector: Detector | null): Promise<CaseResult> {
  const t0 = performance.now();
  const r = await runVeil(c.text, { regions: [c.region], detector, maxRounds: 1 });
  // Score the exact payload the app would send (includes the leak gate).
  const b = buildCloudPayload({ question: "Help.", questionSpans: [], doc: c.text, docSpans: r.spans, packs: r.packs });
  const sent = b.payload.toLowerCase();
  return {
    id: c.id,
    category: c.category,
    leaked: c.must.filter((m) => sent.includes(m.toLowerCase())),
    overMasked: c.keep.filter((k) => !b.payload.includes(k)),
    mustTotal: c.must.length,
    keepTotal: c.keep.length,
    ms: Math.round(performance.now() - t0),
    degraded: r.degraded,
  };
}

export interface Summary {
  category: BenchCategory | "ALL";
  cases: number;
  recall: number;      // share of must-items protected
  utility: number;     // share of keep-terms preserved
  leakFreeCases: number;
  avgMs: number;
}

export function summarise(results: CaseResult[]): Summary[] {
  const cats = [...new Set(results.map((r) => r.category))];
  const one = (cat: Summary["category"], rs: CaseResult[]): Summary => {
    const must = rs.reduce((a, r) => a + r.mustTotal, 0);
    const leaked = rs.reduce((a, r) => a + r.leaked.length, 0);
    const keep = rs.reduce((a, r) => a + r.keepTotal, 0);
    const over = rs.reduce((a, r) => a + r.overMasked.length, 0);
    return {
      category: cat, cases: rs.length,
      recall: must ? (must - leaked) / must : 1,
      utility: keep ? (keep - over) / keep : 1,
      leakFreeCases: rs.filter((r) => r.leaked.length === 0).length,
      avgMs: Math.round(rs.reduce((a, r) => a + r.ms, 0) / Math.max(1, rs.length)),
    };
  };
  return [...cats.map((c) => one(c, results.filter((r) => r.category === c))), one("ALL", results)];
}
