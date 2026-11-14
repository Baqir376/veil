import AxeBuilder from "@axe-core/playwright";
import { test, expect, ignorable } from "./fixtures";

test.describe("Landing page", () => {
  test("loads with its key sections, and every CTA leads to Studio", async ({ page, errors }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Veil/);
    await expect(page.locator("h1")).toContainText("The cloud gets the thinking");
    for (const id of ["lens", "how", "proof", "research", "who"]) await expect(page.locator(`#${id}`)).toHaveCount(1);
    const ctas = page.getByRole("link", { name: /Open (Veil )?Studio/ });
    expect(await ctas.count()).toBeGreaterThanOrEqual(2);
    for (const href of await ctas.evaluateAll((els) => els.map((e) => e.getAttribute("href")))) expect(href).toBe("/app/");
    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
  });

  test("the privacy lens shows tags only inside the lens", async ({ page }) => {
    await page.goto("/#lens");
    const lens = page.locator("#lens [data-cursor='hover']").first();
    await lens.scrollIntoViewIfNeeded();
    const box = (await lens.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4);
    await expect(lens.locator(".vchip.cloud").first()).toBeAttached();
    await expect(lens).toContainText("Rohan Mehta"); // the real text layer is the document itself
  });

  test("benchmark numbers on the page match docs/BENCHMARK.md", async ({ page }) => {
    await page.goto("/#proof");
    await page.locator("#proof").scrollIntoViewIfNeeded();
    await expect(page.locator("#proof")).toContainText("98.5%", { timeout: 15_000 });
    await expect(page.locator("#proof")).toContainText("/113");
  });
});

test.describe("Accessibility (axe-core, WCAG 2.1 A/AA)", () => {
  for (const [name, path] of [["landing", "/"], ["studio", "/app/"]] as const) {
    test(`${name}: no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(800);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).exclude("canvas").analyze();
      const bad = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      const report = bad.map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} node(s): ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(report, report.join("\n")).toEqual([]);
    });
  }
});

test.describe("Responsive @responsive", () => {
  for (const path of ["/", "/app/"]) {
    test(`${path} has no horizontal scrolling`, async ({ page }) => {
      await page.goto(path);
      await page.waitForTimeout(500);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("Visual regression", () => {
  test("studio start screen", async ({ page }) => {
    await page.goto("/app/");
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot("studio-start.png", { fullPage: true, mask: [page.locator(".pill")] });
  });
  test("landing proof section", async ({ page }) => {
    await page.goto("/#proof");
    await page.locator("#proof").scrollIntoViewIfNeeded();
    await page.waitForTimeout(2500);
    await expect(page.locator("#proof")).toHaveScreenshot("landing-proof.png");
  });
});
