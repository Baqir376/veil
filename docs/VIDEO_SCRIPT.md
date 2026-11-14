# Demo video — 2:50 script and shot list

Record in desktop Chrome with Gemini Nano available (1080p, browser zoom 110%, dark OS theme off).
Tools: OBS or Windows Game Bar (Win+Alt+R). Keep the voice calm and specific. Captions in English.

| Time | Shot | Voice-over |
|---|---|---|
| 0:00–0:12 | Landing hero, mouse moving over the spatial stack | "Every day, accountants, lawyers and HR teams paste their clients' secrets into cloud AI. This is Veil." |
| 0:12–0:25 | Scroll to **Beat Veil**, drag the highlighter over the email, press *Let Veil try* → 7/7 | "Can you find every secret in this message? Veil does it on your device, in milliseconds." |
| 0:25–0:40 | Privacy Lens: move the cursor across the email | "Inside the lens is exactly what the cloud receives. Everything else never leaves your device." |
| 0:40–1:10 | **Studio**: pick the tax notice → stage bar shows *on-device* stages; open *Vault* and flip a tile | "Rules catch every ID instantly. Then Gemini Nano — running on this laptop through Firebase AI Logic — finds names and indirect clues. A second on-device pass plays attacker and tries to guess who this is. Anything it can infer gets masked." |
| 1:10–1:35 | Type a question containing the client's name → *Ask with Veil* → answer appears, values decrypt in; toggle *Exactly what the cloud saw* | "Cloud Gemini does the hard reasoning — on tags only. Even the name I typed in the question was masked. The real values come back on my screen." |
| 1:35–1:50 | DevTools → Network → the generateContent request payload | "Here's the actual request. No name, no PAN, no amount — only tags." |
| 1:50–2:05 | DevTools → Network → Offline; run a new document; stages still complete | "Offline? Detection keeps working. Only the cloud step waits." |
| 2:05–2:35 | **Extension** on ChatGPT: paste → Veil card → *Paste protected* → answer → real values highlighted; hover badge → *Show tags* | "And it works where you already use AI. Veil intercepts the paste before ChatGPT sees it, and shows the real values back — only on your screen." |
| 2:35–2:50 | Proof bento (98.5%, 110/113) → privacy receipt | "98.5% of private items never reached the cloud across 113 adversarial documents. Veil: the cloud gets the thinking — never your secrets." |

**Checklist before recording:** model warm (open Studio once), clear old receipts, close unrelated tabs, notifications off,
extension reloaded, ChatGPT in a fresh chat. Upload to YouTube as *Public* (or Unlisted only if Devpost allows — the rules say publicly visible).
