// Render the Veil logo (public/veil.svg) to the PNG sizes Chrome extensions need.
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const svg = readFileSync("public/veil.svg", "utf8");
mkdirSync("extension/icons", { recursive: true });
const browser = await chromium.launch();
for (const size of [16, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `extension/icons/${size}.png`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await page.close();
}
await browser.close();
console.log("✓ icons");
