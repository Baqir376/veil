import { test as base, expect, type Page } from "@playwright/test";

/** Skip the once-per-session intro, and collect console errors for assertions. */
export const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    await page.addInitScript(() => { try { sessionStorage.setItem("veil-intro", "1"); } catch { /* ignore */ } });
    await use(errors);
  },
});
export { expect };

/** Errors that come from the environment, not from our code (no GPU in CI, App Check in tests, fonts offline). */
export const ignorable = (e: string) =>
  /WebGL|GPU|THREE\.|appCheck|app-check|AppCheck|recaptcha|fonts\.g|ERR_INTERNET_DISCONNECTED|Failed to load resource|favicon/i.test(e);

/**
 * Intercept the cloud model. Records every request body, and answers by echoing the placeholders it
 * received — like a well-behaved model would — so restoring can be checked end to end.
 */
export async function mockCloud(page: Page) {
  const bodies: string[] = [];
  await page.route("**/*exchange*Token*", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ token: "e2e-appcheck", ttl: "3600s" }) }));
  await page.route("**/*:generateContent*", async (route) => {
    const body = route.request().postData() ?? "";
    bodies.push(body);
    const tags = [...new Set(body.match(/\[[A-Z][A-Z0-9_]*_\d+(?: · [^\]]*)?\]/g) ?? [])].slice(0, 6);
    const text = `Here is your reply. It concerns ${tags.join(", ")}. Please file a revised return.`;
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP", index: 0 }] }),
    });
  });
  return bodies;
}
