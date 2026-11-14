import { defineConfig, devices } from "@playwright/test";

// End-to-end, accessibility, responsive and visual tests in a real browser.
// Playwright's Chromium has no Gemini Nano, so Studio runs in SAFE MODE here — which is exactly the
// fallback path we want covered. The cloud call is intercepted (no network, no quota), so the tests can
// inspect the exact request body and prove no personal value leaves the page.
export default defineConfig({
  testDir: "e2e",
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:5173",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] }, grep: /@responsive/ },
  ],
  webServer: {
    command: "npm run dev -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
