// Design review helper (not a test): screenshots of the landing page at several scroll positions and Studio.
// Run: npx tsx? — no: `node --experimental-strip-types e2e/shots.ts` while the dev server is running.
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { try { sessionStorage.setItem("veil-intro", "1"); } catch { /* */ } });
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(4500);
const h = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < h; y += 900) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(1600);
  await page.screenshot({ timeout: 90000, path: `${out}/landing-${String(i++).padStart(2, "0")}.png` });
}
await page.goto("http://localhost:5173/app/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/studio-0.png` });
await page.getByRole("button", { name: /Income-tax notice/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/studio-1.png`, fullPage: true });
await browser.close();
console.log("pages:", i);
