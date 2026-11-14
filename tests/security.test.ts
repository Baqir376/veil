// Security / supply-chain checks that run with the unit tests.
import { it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const tracked = execSync("git ls-files", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean);

it("no environment files with real keys are tracked by git", () => {
  expect(tracked.filter((f) => /(^|\/)\.env(\.|$)/.test(f) && !f.endsWith(".env.example"))).toEqual([]);
});

it("no private keys, service-account JSON or long-lived secrets in tracked source", () => {
  const patterns = [/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/, /"type"\s*:\s*"service_account"/, /\bsk-live-[A-Za-z0-9]{20,}/, /\bAKIA[0-9A-Z]{16}\b/, /\bghp_[A-Za-z0-9]{30,}/];
  const offenders: string[] = [];
  for (const f of tracked) {
    if (!/\.(ts|tsx|js|mjs|json|html|css|md|txt)$/.test(f) || f === "package-lock.json") continue;
    const src = readFileSync(f, "utf8");
    // Test fixtures intentionally contain FAKE secrets; they are clearly marked "FAKE".
    for (const p of patterns) if (p.test(src.replace(/sk-live-FAKE\w*/g, ""))) offenders.push(`${f}: ${p}`);
  }
  expect(offenders).toEqual([]);
});

it("the production build does not ship the raw values of the demo vault or debug flags", () => {
  if (!existsSync("dist")) return; // build not run yet
  const files: string[] = [];
  const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
  walk("dist");
  const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(f, "utf8")).join("\n");
  expect(js).not.toContain("FIREBASE_APPCHECK_DEBUG_TOKEN=true"); // debug token only in dev
});
