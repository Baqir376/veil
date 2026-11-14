// The Chrome extension, loaded into a real Chromium, on a mock chat page that behaves like ChatGPT's box.
// Playwright's Chromium has no Gemini Nano, so this covers the rules path + the full paste/restore UX.
import { test as base, expect, chromium, type BrowserContext } from "@playwright/test";
import { execSync } from "node:child_process";
import { resolve } from "node:path";

const test = base.extend<{ ctx: BrowserContext }>({
  ctx: async ({}, use) => {
    const ext = resolve("extension/dist-test");
    const ctx = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
    });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://localhost:5173" });
    await use(ctx);
    await ctx.close();
  },
});

test.beforeAll(() => { execSync("node scripts/build-extension.mjs --test", { stdio: "ignore" }); });

const SECRET = "Client: Rohan Mehta, PAN BQRPM4821K, call 9822014567 about the 143(1)(a) notice.";

test.describe("Veil Chrome extension", () => {
  test("intercepts a paste, shows what it caught, pastes only tags, restores the answer on screen", async ({ ctx }) => {
    const page = await ctx.newPage();
    await page.goto("http://localhost:5173/ext-test.html");
    await expect(page.locator("#veil-host .badge")).toBeVisible();

    await page.evaluate((t) => navigator.clipboard.writeText(t), SECRET);
    await page.locator("#prompt-textarea").click();
    await page.keyboard.press("Control+V");

    const card = page.locator("#veil-host .card");
    await expect(card).toContainText("Veil caught");
    await expect(card.locator(".chip").first()).toBeVisible();
    // The site's own paste handler has NOT seen the original text.
    expect(await page.evaluate(() => (window as any).__pasted ?? [])).toEqual([]);

    await card.getByRole("button", { name: "Paste protected" }).click();
    const box = page.locator("#prompt-textarea");
    await expect(box).toContainText("[PAN_1]");
    for (const v of ["Rohan Mehta", "BQRPM4821K", "9822014567"]) await expect(box).not.toContainText(v);
    await expect(box).toContainText("143(1)(a)"); // context kept

    // The AI answers with tags → Veil shows real values, on this screen only.
    await page.evaluate(() => (window as any).addAssistant("Dear [PERSON_1], your PAN [PAN_1] is linked; we will call [PHONE_1]."));
    await expect(page.locator("#messages")).toContainText("Dear Rohan Mehta, your PAN BQRPM4821K is linked");
    await expect(page.locator("#veil-host .badge .count")).toHaveText("3");
  });

  test("Esc cancels; 'Paste original' passes the text through untouched", async ({ ctx }) => {
    const page = await ctx.newPage();
    await page.goto("http://localhost:5173/ext-test.html");
    await page.evaluate((t) => navigator.clipboard.writeText(t), SECRET);
    await page.locator("#prompt-textarea").click();
    await page.keyboard.press("Control+V");
    await expect(page.locator("#veil-host .card")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#veil-host .card")).toHaveCount(0);
    await expect(page.locator("#prompt-textarea")).toHaveText("");

    await page.keyboard.press("Control+V");
    await page.locator("#veil-host .card").getByRole("button", { name: "Paste original" }).click();
    await expect(page.locator("#prompt-textarea")).toContainText("BQRPM4821K");
  });

  test("text with nothing private is pasted straight through", async ({ ctx }) => {
    const page = await ctx.newPage();
    await page.goto("http://localhost:5173/ext-test.html");
    await page.evaluate(() => navigator.clipboard.writeText("What is the 80C limit for AY 2026-27?"));
    await page.locator("#prompt-textarea").click();
    await page.keyboard.press("Control+V");
    await expect(page.locator("#prompt-textarea")).toContainText("What is the 80C limit");
    await expect(page.locator("#veil-host .card")).toHaveCount(0);
  });
});
