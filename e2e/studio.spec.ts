import { test, expect, mockCloud, ignorable } from "./fixtures";

const PRIVATE = ["Rohan Mehta", "BQRPM4821K", "4821 7733 9045", "9822014567", "rohan.mehta88@gmail.com", "50100234567812", "rohanm@okhdfcbank", "18,45,000"];

test.describe("Veil Studio (safe mode: no on-device model in the test browser)", () => {
  test("happy path: sample → review → ask → only tags leave, real values come back", async ({ page, errors }) => {
    const bodies = await mockCloud(page);
    await page.goto("/app/");
    await expect(page.getByText(/safe mode/i).first()).toBeVisible();

    // Step 1: pick the tax-notice sample card.
    await page.getByRole("button", { name: /Income-tax notice/ }).click();
    await expect(page.locator(".pane.cloud .chip").first()).toBeVisible();
    // Stepper moved to "Review".
    await expect(page.locator(".steps-guide .s.on")).toContainText(/Review|checking/);

    // What the cloud will see contains no private value.
    const cloudPane = await page.locator(".pane.cloud .doc").innerText();
    for (const v of PRIVATE) expect(cloudPane).not.toContain(v);

    // Step 3: ask, including a private value typed into the question itself.
    await page.getByPlaceholder(/Ask the cloud/).fill("Draft a reply for Rohan Mehta, PAN BQRPM4821K");
    const ask = page.getByRole("button", { name: "Ask with Veil" });
    await expect(ask).toBeDisabled(); // safe mode requires review first
    await page.getByLabel(/I reviewed what the cloud will see/).check();
    await ask.click();

    await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
    // The network request body: the strongest privacy check there is.
    expect(bodies.length).toBe(1);
    for (const v of PRIVATE) expect(bodies[0], `"${v}" must not be sent`).not.toContain(v);
    expect(bodies[0]).toMatch(/\[PAN_1\]/);

    // Real values restored locally; "exactly what the cloud saw" shows tags only.
    const answer = page.locator(".answer");
    await expect(answer).toContainText("BQRPM4821K");
    await page.getByRole("button", { name: "Exactly what the cloud saw" }).click();
    await expect(answer.locator(".doc")).not.toContainText("BQRPM4821K");

    // Receipt printed, with a hash and no raw values.
    const receipt = page.locator(".receipt");
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText(/Payload SHA-256/);
    for (const v of PRIVATE) await expect(receipt).not.toContainText(v);

    expect(errors.filter((e) => !ignorable(e))).toEqual([]);
  });

  test("vault tab: one flip tile per held-back value; the back shows the real value", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /Income-tax notice/ }).click();
    await expect(page.locator(".pane.cloud .chip").first()).toBeVisible();
    await expect(page.locator(".stages .done").first()).toBeVisible();
    const tab = page.getByRole("tab", { name: /Vault/ });
    const count = Number((await tab.innerText()).match(/\d+/)![0]);
    await tab.click();
    await expect(page.locator(".vtile")).toHaveCount(count);
    await expect(page.locator(".vtile .back").filter({ hasText: "BQRPM4821K" })).toHaveCount(1);
    await expect(page.locator(".bento .big-number")).toContainText(String(count));
  });

  test("clicking a highlight keeps that value visible, clicking again masks it", async ({ page }) => {
    await page.goto("/app/");
    await page.getByRole("button", { name: /Income-tax notice/ }).click();
    const pan = page.locator(".pane.device .hl", { hasText: "BQRPM4821K" });
    await pan.click();
    await expect(pan).toHaveClass(/kept/);
    await expect(page.locator(".pane.cloud .doc")).toContainText("BQRPM4821K");
    await pan.click();
    await expect(page.locator(".pane.cloud .doc")).not.toContainText("BQRPM4821K");
  });

  test("the leak gate still masks a strong ID the user un-masked by accident", async ({ page }) => {
    const bodies = await mockCloud(page);
    await page.goto("/app/");
    await page.getByRole("button", { name: /Income-tax notice/ }).click();
    await page.locator(".pane.device .hl", { hasText: "BQRPM4821K" }).click(); // keep the PAN visible
    await page.getByPlaceholder(/Ask the cloud/).fill("Explain this notice");
    await page.getByLabel(/I reviewed/).check();
    await page.getByRole("button", { name: "Ask with Veil" }).click();
    await expect(page.getByRole("heading", { name: "Answer" })).toBeVisible();
    expect(bodies[0]).not.toContain("BQRPM4821K");
  });

  test("offline: on-device protection keeps working, the cloud call fails with a clear message", async ({ page, context }) => {
    await mockCloud(page);
    await page.goto("/app/");
    await page.getByRole("button", { name: /Income-tax notice/ }).click();
    await expect(page.locator(".pane.cloud .chip").first()).toBeVisible();
    await context.setOffline(true);
    await page.unroute("**/*:generateContent*");
    await expect(page.locator(".channel")).toContainText(/offline/);
    await page.getByPlaceholder(/Ask the cloud/).fill("Explain this notice");
    await page.getByLabel(/I reviewed/).check();
    await page.getByRole("button", { name: "Ask with Veil" }).click();
    await expect(page.locator(".error")).toContainText(/offline|nothing was sent/i);
    await expect(page.locator(".receipt")).toHaveCount(0);
    await context.setOffline(false);
  });

  test("hostile input is rendered as text, never executed", async ({ page }) => {
    let dialog = false;
    page.on("dialog", (d) => { dialog = true; d.dismiss(); });
    await page.goto("/app/");
    const box = page.locator("textarea.input");
    await box.fill(`<img src=x onerror="alert('xss')"> Client <b>Rohan Mehta</b> <script>alert(1)</script>`);
    await box.blur();
    await page.getByRole("button", { name: "Done" }).click().catch(() => {});
    await page.waitForTimeout(1200);
    expect(dialog).toBe(false);
    await expect(page.locator("img[src='x']")).toHaveCount(0);
  });
});
