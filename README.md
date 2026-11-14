# Veil — the cloud gets the thinking, never your secrets

**Veil hides personal data on your device with Gemini Nano, lets cloud Gemini reason over placeholders, then puts the
real values back — locally.** Built for **#BuildHybridAI** with **Firebase AI Logic hybrid inference** on Web (Chrome),
as a web app *and* a Chrome extension for ChatGPT, Gemini and Claude.

**Live:** https://veil-hybrid.web.app · **Studio:** https://veil-hybrid.web.app/app/ ·
**Extension:** [download zip](https://veil-hybrid.web.app/downloads/veil-extension.zip) · **Demo video:** _(YouTube link)_

---

## The problem

People paste contracts, tax notices, HR cases and medical notes into cloud AI every day. In one 2026 survey,
79% of workers said they had entered sensitive information such as customer PII into AI tools
([Zapier](https://zapier.com/blog/sharing-with-ai/)). For an Indian chartered accountant that means a client's
PAN, Aadhaar and income leaving their laptop — and India's DPDP Rules make the substantive obligations bite from
**13 May 2027**, with penalties up to **₹250 crore**. The same is true for EU freelancers (GDPR) and UK HR teams.

Cloud models are better at the reasoning. On-device models are private. **Veil uses both, each for what it's good at.**

## How it works

```
 your text ──► [ON DEVICE] rules (2 ms) ─► Gemini Nano: names & places ─► Nano: indirect clues ─► Nano "Guess Who" attacker
                    │                                                                              │
                    └──────────── merge, cut around protected terms, meaningful placeholders ◄─────┘
                                                     │  [PERSON_1] [PAN_1] [AMOUNT_1 · ₹15–20L]
                                         fail-closed leak gate on the exact payload
                                                     │
                                       [IN CLOUD] Gemini reasons over tags only
                                                     │
                              [ON DEVICE] real values restored on your screen + privacy receipt
```

| Step | Where | Firebase AI Logic |
|---|---|---|
| ID rules (PAN, Aadhaar, GSTIN, IFSC, UPI, IBAN, VAT, NI, SSN, cards, keys…) with checksums & unicode normalisation | device | — |
| Names, organisations, places | device | `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE })` + JSON schema |
| Indirect identifiers ("the only female cardiologist in Ratnagiri") | device | `ONLY_ON_DEVICE` |
| **Guess Who**: an attribute-inference attacker tries to re-identify the person; its evidence gets masked | device | `ONLY_ON_DEVICE` |
| Reasoning over masked text | cloud | `ONLY_IN_CLOUD` (model from Remote Config) |
| Restore + receipt | device | `response.inferenceSource` shown per stage |

Sensitive work is **never** allowed to fall back to the cloud (`ONLY_ON_DEVICE`, not `PREFER_ON_DEVICE`). If the
on-device model is missing or a step fails, Veil says so, keeps rule-based masking, and requires the user to review
before anything is sent ("safe mode"). Code: [`src/nanoCore.ts`](src/nanoCore.ts), [`src/engine/`](src/engine).

## What's in the box

- **Landing site** (`/`) — an interactive explainer: live redaction, a *Privacy Lens* that shows what the cloud
  sees under your cursor, and **Beat Veil**, a game where you race Veil's real engine to redact a message.
- **Veil Studio** (`/app/`) — paste → review → ask. Highlights stage by stage, click any value to keep it, a
  vault of flip-tiles, Guess Who risk gauge, device-vs-cloud split, and a privacy receipt with a SHA-256 of the
  exact payload. Sign in with Google to keep receipt history (Firestore — counts and hashes only).
- **Chrome extension** — intercepts paste on ChatGPT, Gemini and Claude *before the site sees it*, shows what
  Veil caught, pastes only tags, and restores real values in the AI's answer **on your screen only**.
  Gemini Nano runs in an offscreen extension page through Firebase AI Logic.
- **Benchmark** (`/spike.html`) — run the 113-case research benchmark on your own device.

## Measured, not claimed

113 adversarial synthetic documents across 12 categories (run-on, typos, Hinglish, obfuscation, CSV/JSON,
quasi-identifiers, EU/UK, negatives), scored on the exact payload — details in [`docs/BENCHMARK.md`](docs/BENCHMARK.md).

| | Rules only (safe mode) | **Veil (rules + on-device Nano)** |
|---|---:|---:|
| Private items that never reached the cloud | 69.7% | **98.5%** |
| Documents with zero leaks | 45 / 113 | **110 / 113** |

All 3 remaining leaks happened during an on-device timeout, which Veil flags and requires review for.
Testing: 82 unit/integration/property/security tests and 21 Playwright E2E/accessibility/visual tests,
including tests that load the real extension — see [`docs/TESTING.md`](docs/TESTING.md).

## Built on research

- **PAPILLON** (Li et al., 2024) — a local model as a privacy proxy for a cloud LLM. [arXiv:2410.17127](https://arxiv.org/abs/2410.17127)
- **Hide and Seek** (2023) — hide locally, answer in the cloud, restore locally. [arXiv:2309.03057](https://arxiv.org/abs/2309.03057)
- **Language Models are Advanced Anonymizers** (Staab et al., ICLR 2025) — adversarial anonymisation → our Guess Who loop. [arXiv:2402.13846](https://arxiv.org/abs/2402.13846)
- **Beyond Memorization** (Staab et al., ICLR 2024) — LLMs infer personal attributes from "anonymised" text. [arXiv:2310.07298](https://arxiv.org/abs/2310.07298)
- **Mind the Gap** (2026) — robustness of PII detectors; our benchmark taxonomy. [arXiv:2609.03464](https://arxiv.org/abs/2609.03464)

## Firebase products

| Product | Use |
|---|---|
| **Firebase AI Logic** | Hybrid inference: Gemini Nano `ONLY_ON_DEVICE` for detection & attack, Gemini `ONLY_IN_CLOUD` for reasoning |
| **App Check** | reCAPTCHA Enterprise (Fraud Defense) in production; debug provider on localhost |
| **Authentication** | Google sign-in (optional) |
| **Cloud Firestore** | Receipt history — rules allow only counts, stages and a 64-hex SHA-256 ([`firestore.rules`](firestore.rules)) |
| **Remote Config** | Cloud model, on-device timeout, attacker rounds, extra never-mask terms ([template](remoteconfig.template.json)) |
| **Hosting** | `veil-hybrid.web.app` |

## Run it yourself

Requirements: Node 20+, desktop **Chrome 139+** with Gemini Nano (`chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled).
Without Nano, Veil runs in safe mode (rules only).

```bash
npm install
cp .env.example .env.local      # fill in your Firebase web config + reCAPTCHA Enterprise site key
npm run dev                     # http://localhost:5173  (Studio at /app/, benchmark at /spike.html)
```

Firebase setup: create a project, enable **AI Logic** (Gemini Developer API), register a web app, register it with
**App Check** (reCAPTCHA Enterprise) and add a debug token for localhost, enable **Google** sign-in, create
**Firestore**. Then `npx firebase-tools deploy` publishes hosting, Firestore rules and the Remote Config template.

**Extension:** `npm run build:ext` → `chrome://extensions` → *Developer mode* → *Load unpacked* → `extension/dist`.
Open ChatGPT or Gemini (reload the tab once), paste something private, and press **Paste protected**.

```bash
npm test            # unit, integration, property-based, security, rules-only benchmark
npm run test:e2e    # Playwright: E2E (incl. the extension), accessibility, responsive, visual
```

## Honest limits

- On-device detection is English / Latin script today; other scripts trigger a review warning (IDs are still caught).
- No detector is perfect — that is why Veil layers rules, an on-device model, an attacker, user review and a
  deterministic leak gate, and publishes its measured numbers.
- The extension restores values by editing text in place; a site redesign may need selector updates.

## License

[Apache-2.0](LICENSE)
