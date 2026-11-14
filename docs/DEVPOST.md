# Devpost submission text (copy into the form)

## Tagline
The cloud gets the thinking. Never your secrets. — on-device Gemini Nano hides personal data before cloud AI sees it, then puts it back on your screen.

## Inspiration
Professionals who hold other people's secrets — chartered accountants, lawyers, HR teams, clinicians — paste them
into cloud AI every day. Cloud models reason better; on-device models are private. Hybrid inference finally lets an
app use each for what it is good at, with one SDK.

## What it does
**Veil** sits between you and cloud AI:
1. **On your device**, rule packs (India, EU, UK, US) and **Gemini Nano** find names, IDs, amounts and the quiet
   giveaways regex can't — like "the only female cardiologist in Ratnagiri".
2. A second on-device pass, **Guess Who**, plays attacker and tries to work out who the text is about; whatever
   evidence it cites gets masked too.
3. Values become meaningful placeholders — `[PAN_1]`, `[AMOUNT_1 · ₹15–20L]` — so the cloud can still reason about
   tax slabs and deadlines. A fail-closed leak gate re-checks the exact payload.
4. **Cloud Gemini** answers using tags only; Veil restores the real values **on your device** and issues a privacy
   receipt with a SHA-256 of exactly what was sent.

It ships as **Veil Studio** (web app), a **Chrome extension** that protects pastes into ChatGPT, Gemini and Claude
and restores answers on screen, an interactive landing page with a playable "Beat Veil" game, and an on-device
benchmark page.

## How we built it — Firebase AI Logic
- `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE })` with JSON-schema `responseConstraint` for three
  on-device tasks (names/places, indirect clues, attacker). Sensitive work is deliberately **never** allowed to fall
  back to the cloud.
- `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD })` for reasoning over masked text.
- `response.inferenceSource` surfaced per stage, so users see what ran where.
- In the extension, Nano runs in an offscreen document through the same Firebase AI Logic code.
- **App Check** (reCAPTCHA Enterprise), **Auth** (Google), **Firestore** (receipt history — security rules only
  accept counts and a 64-hex hash), **Remote Config** (cloud model, timeouts, never-mask terms), **Hosting**.
- React 19 + Vite + Tailwind 4 + Motion; engine in TypeScript; 82 Vitest + 21 Playwright tests.

## Value proposition
Use the best cloud AI on client data **without the client data leaving your device** — and prove it with a receipt.
Specific first audience: Indian chartered accountants ahead of the DPDP Act's 2027 obligations; the same engine
covers GDPR (EU), UK GDPR and US identifiers.

## Challenges
- Small on-device models over-mask and paraphrase. We added a merge layer (rules win, protected terms like
  `Form 26AS` / `AY 2026-27` are never masked, fuzzy re-location of paraphrased spans) and measured utility, not just recall.
- The attacker's self-reported scores were meaningless, so risk is computed from **verified** evidence instead.
- Streaming chat UIs split `[PERSON_1]` across elements; the extension restores per block without touching the DOM structure.

## Accomplishments
- **98.5% recall, 110/113 leak-free documents** on a 113-case adversarial benchmark (rules alone: 69.7%).
- Works offline for everything on-device; verified in DevTools that the cloud payload contains zero personal values.
- Grounded in research: PAPILLON, Hide and Seek, adversarial anonymisation (ICLR 2025), Mind the Gap.

## What's next
Android with Gemini Nano via ML Kit + Firebase AI Logic, more region packs via Remote Config, and team policies.

## Built with
firebase-ai-logic, gemini-nano, gemini, firebase-app-check, firebase-auth, cloud-firestore, firebase-remote-config,
firebase-hosting, chrome-extension, react, vite, typescript, tailwindcss, motion, playwright, vitest, fast-check
