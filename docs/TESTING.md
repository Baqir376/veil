# Testing

Veil handles other people's secrets, so it is tested at every level — and the most important checks look at
the **exact bytes that would leave the device**, not at intermediate state.

| Kind of testing | What it proves | Tool | Where |
|---|---|---|---|
| **Unit** | Rule packs, validators (Luhn, Verhoeff), placeholders, amount bands, restore | Vitest | `src/engine/engine.test.ts` |
| **Integration** | The full pipeline with a scripted stand-in for Gemini Nano: gates, chunking, failures, coreference | Vitest | `src/engine/pipeline.test.ts` |
| **Regression** | Every bug found in manual adversarial rounds (T-, B-series) stays fixed | Vitest | `src/engine/brutal.test.ts` |
| **Property-based / fuzzing** | For 300 random documents per property: no ID ever reaches the payload; masking is perfectly reversible; merged spans are always well-formed and never touch protected text | fast-check | `src/engine/property.test.ts` |
| **Security** | No `.env`/keys/service accounts tracked; debug App Check flag not shipped; XSS input rendered inert | Vitest, Playwright | `tests/security.test.ts`, `e2e/studio.spec.ts` |
| **End-to-end** | Real browser: sample → review → ask → restore. The cloud request is intercepted and its **body is asserted to contain no private value**; the leak gate, keep/mask toggling and offline behaviour are exercised | Playwright | `e2e/studio.spec.ts`, `e2e/site.spec.ts` |
| **Accessibility** | WCAG 2.1 A/AA with no serious or critical violations on the site and Studio | axe-core | `e2e/site.spec.ts` |
| **Responsive** | No horizontal scrolling at phone width (Pixel 7) | Playwright | `e2e/site.spec.ts` (`@responsive`) |
| **Visual regression** | Studio start screen and proof section match their approved screenshots | Playwright | `e2e/site.spec.ts` |
| **Benchmark (accuracy)** | 113 adversarial documents, 12 categories; recall and utility on the exact payload | Vitest + browser | `src/bench/`, [`BENCHMARK.md`](BENCHMARK.md) |

## Run

```bash
npm test            # unit, integration, regression, property-based, security, rules-only benchmark
npm run test:e2e    # Playwright: E2E, accessibility, responsive, visual (starts the dev server)
npm run test:all    # both
```

The Playwright browser has no Gemini Nano, so Studio runs in **safe mode** there. That is deliberate: it
covers the fallback path every judge without Nano will hit. The on-device path is covered by the browser
benchmark (`/spike.html` → *Run research benchmark*) in Chrome with Gemini Nano.

## Results (2026-11-14)

- Vitest: **77/77** passing (incl. 1,600 generated property cases).
- Playwright: **16/16** passing (desktop + mobile), axe: **0 serious/critical** violations.
- Accessibility fixes made because of these tests: tertiary text, ochre and tomato darkened to ≥ 4.5:1
  contrast on paper; links in running text underlined.
