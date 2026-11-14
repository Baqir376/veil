# Veil benchmark

**What we measure.** Whether private data reaches the cloud, and whether the cloud still gets the words it
needs. Every case is scored on the **exact payload Veil would send** (after the final leak gate), not on
intermediate detections.

- **Recall** — share of private items (names, IDs, clues…) that never appear in the payload.
- **Utility** — share of domain terms (`Form 26AS`, `AY 2026-27`, `GDPR Article 17`…) still visible.
- **Leak-free documents** — documents where *nothing* private reached the cloud.

## Dataset

113 synthetic, seeded, reproducible cases (`src/bench/cases.ts`) across 12 categories. The design follows the
category × template × instance method and shift taxonomy of *Mind the Gap: Robustness Risks in PII
Detection Systems* (arXiv [2609.03464](https://arxiv.org/abs/2609.03464)), extended with obfuscation,
structured data, quasi-identifiers and **negative** cases (nothing to mask) to measure over-masking.
All names and identifiers are generated (Aadhaar numbers pass Verhoeff, cards pass Luhn).
We wrote our own cases because popular public PII corpora restrict redistribution.

| Category | What it stresses |
|---|---|
| clean | well-formed notices, letters |
| run-on | no punctuation, lowercase |
| conversational | informal chat, emoji |
| abbreviations | `nm:`, `ph:`, `a/c no`, `Cust` |
| typos | misspelled names and words |
| code-switched | Hinglish |
| ambiguous-names | names that are also words (Rose, Sunny, Grace…) |
| obfuscated | `[at]`/`[dot]` emails, spelled-out phone numbers, zero-width characters, full-width digits |
| structured | CSV, JSON, email headers/signatures |
| quasi | indirect identifiers ("the only female cardiologist in Chiplun") |
| eu-uk | IBAN, NI numbers, EU names and companies |
| negative | no personal data at all |

## Results — run of 2026-11-14

Chrome 157, Windows, Gemini Nano via Firebase AI Logic (`ONLY_ON_DEVICE`), device performance class "Medium".

| Category | Cases | Recall · rules only (safe mode) | Recall · **Veil** | Utility · Veil | Leak-free · Veil |
|---|---:|---:|---:|---:|---:|
| clean | 16 | 81.8% | **100%** | 100% | 16/16 |
| run-on | 8 | 66.7% | **100%** | 0%* | 8/8 |
| conversational | 8 | 50.0% | **100%** | 100% | 8/8 |
| abbreviations | 8 | 100% | **100%** | 100% | 8/8 |
| typos | 8 | 50.0% | **100%** | 100% | 8/8 |
| code-switched | 8 | 40.0% | **90.0%** | 100% | 7/8 |
| ambiguous-names | 8 | 0% | **100%** | 91.7%* | 8/8 |
| obfuscated | 16 | 80.0% | **100%** | 66.7%* | 16/16 |
| structured | 12 | 100% | **100%** | 100% | 12/12 |
| quasi | 8 | 0% | **100%** | 0%* | 8/8 |
| eu-uk | 8 | 60.0% | **90.0%** | 100% | 6/8 |
| negative | 5 | — | — | 100% | 5/5 |
| **All** | **113** | **69.7%** | **98.5%** | **89.0%** | **110/113** |

**Where the 3 leaks came from.** All three (`code-switched-1-4`, `eu-uk-2-3`, `eu-uk-2-4`) occurred when the
on-device model **timed out** (`degraded: true`). In that state Veil shows a warning, keeps all rule-based
masking, and **requires the user to review before anything is sent**. In the 107 documents where the
on-device model completed, **zero private items reached the cloud**.

**Safe mode (no on-device model).** Rules alone protected every structured identifier in the set — PAN,
Aadhaar, GSTIN, IFSC, bank accounts, UPI, cards, CVV, API keys, IBAN, NI numbers, phones, emails — with
100% utility. What rules can't find are unlabelled names and indirect clues; that is the on-device model's job.

\* **Utility fixes after this run.** Every utility miss was an over-masked common word: lowercase `gst`,
`Friday`, `WhatsApp` and `80C`. Fixed in the engine (case-insensitive never-mask terms, weekdays/months and
common app names treated as generic, deduction sections like 80C/80D/80CCD(1B) protected) and locked in by
regression tests (`src/engine/brutal.test.ts`). The next on-device run will report the new numbers.

**Speed.** Median ~5 s per document on-device (warm model). The average (11.9 s) is inflated by the timeout
cases; the on-device timeout was lowered from 25 s to 20 s after this run.

## Reproduce

- Rules only: `npm test` (writes `test-data/bench-rules-only.json`).
- Full on-device: run `npm run dev`, open `/spike.html` in Chrome with Gemini Nano available, click
  **Run research benchmark**, then **Download results JSON**.

## Limits (honest)

- Synthetic data. Real documents are messier; the benchmark measures robustness to known shifts, not every case.
- On-device detection is English/Latin-script; other scripts trigger a review warning (IDs are still caught).
- No detector is perfect. Research on far larger models reports the same: frontier LLMs top out around 0.64 on
  the multilingual REDACT benchmark (arXiv [2606.19881](https://arxiv.org/abs/2606.19881)), and standard
  anonymisers fail against LLM attribute inference (Staab et al., ICLR 2024, arXiv
  [2310.07298](https://arxiv.org/abs/2310.07298)). That is why Veil layers rules, an on-device model, an
  attribute-inference attacker, user review and a deterministic leak gate.
