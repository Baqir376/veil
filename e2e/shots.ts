// Design review helper (not a test): screenshots of the landing page and Studio, including interactions.
// Run while the dev server is up:  node e2e/shots.ts <outDir>
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "test-results/shots";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => { try { sessionStorage.setItem("veil-intro", "1"); } catch { /* */ } });

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.waitForTimeout(4200);
await page.mouse.move(1100, 420);
await page.waitForTimeout(800);
await page.screenshot({ path: `${out}/01-hero.png` });

// Beat Veil: drag the highlighter over the first line, then let Veil try.
await page.locator("#play").scrollIntoViewIfNeeded();
await page.waitForTimeout(900);
const words = page.locator("#play [data-w]");
const a = (await words.nth(14).boundingBox())!, b = (await words.nth(19).boundingBox())!;
await page.mouse.move(a.x + 4, a.y + a.height / 2);
await page.mouse.down();
await page.mouse.move(b.x + b.width - 4, b.y + b.height / 2, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/02-play-redacting.png` });
await page.getByRole("button", { name: /Let Veil try/ }).click();
await page.waitForTimeout(2600);
await page.screenshot({ path: `${out}/03-play-result.png` });

await page.goto("http://localhost:5173/app/", { waitUntil: "networkidle" });
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Income-tax notice/ }).click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/04-studio.png`, fullPage: true });
await page.getByRole("tab", { name: /Vault/ }).click();
await page.waitForTimeout(900);
const tile = page.locator(".vtile").nth(1);
await tile.hover();
await page.waitForTimeout(900);
await page.screenshot({ path: `${out}/05-studio-vault.png` });
await browser.close();
console.log("done");
