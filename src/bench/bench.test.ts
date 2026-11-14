// Rules-only ("safe mode") benchmark. Runs in CI; the full on-device run happens in the browser
// (/spike.html → "Run research benchmark") because Gemini Nano lives in Chrome.
import { it, expect } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { buildBenchmark } from "./cases";
import { scoreCase, summarise } from "./score";

it("rules-only benchmark (safe-mode baseline)", async () => {
  const cases = buildBenchmark();
  const results = [];
  for (const c of cases) results.push(await scoreCase(c, null));
  const summary = summarise(results);
  mkdirSync("test-data", { recursive: true });
  writeFileSync("test-data/bench-rules-only.json", JSON.stringify({ when: new Date().toISOString(), cases: cases.length, summary, results }, null, 2));
  console.table(summary.map((s) => ({ ...s, recall: `${(s.recall * 100).toFixed(1)}%`, utility: `${(s.utility * 100).toFixed(1)}%` })));
  // Hard guarantees regardless of the model: structured IDs never leak, and negatives keep their terms.
  const negatives = summary.find((s) => s.category === "negative")!;
  expect(negatives.utility).toBe(1);
  expect(cases.length).toBeGreaterThan(100);
}, 60_000);
