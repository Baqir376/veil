// Build the Chrome extension into extension/dist (load it with chrome://extensions → Load unpacked).
//   node scripts/build-extension.mjs [--studio=https://veil-hybrid.web.app/app/]
// Reads the Firebase web config from .env.local (public identifiers, not secrets).
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from "node:fs";

const env = Object.fromEntries(
  (existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "").split(/\r?\n/)
    .filter((l) => /^VITE_FIREBASE_\w+=/.test(l)).map((l) => { const [k, ...v] = l.split("="); return [k, v.join("=").trim()]; }),
);
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN, projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
};
if (!firebaseConfig.apiKey) console.warn("⚠ No Firebase config found in .env.local — the detector will run rules only.");
const studio = process.argv.find((a) => a.startsWith("--studio="))?.split("=")[1] ?? "http://localhost:5173/app/";

// --test: also run the content script on the local mock chat page used by the Playwright tests.
const testBuild = process.argv.includes("--test");
const out = testBuild ? "extension/dist-test" : "extension/dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const common = {
  bundle: true, minify: true, sourcemap: false, target: "chrome138", platform: "browser", legalComments: "none",
  define: { __FIREBASE_CONFIG__: JSON.stringify(firebaseConfig), __STUDIO_URL__: JSON.stringify(studio) },
};
await build({ ...common, entryPoints: ["extension/src/content.ts"], outfile: `${out}/content.js`, format: "iife" });
await build({ ...common, entryPoints: ["extension/src/background.ts"], outfile: `${out}/background.js`, format: "esm" });
await build({ ...common, entryPoints: ["extension/src/offscreen.ts"], outfile: `${out}/offscreen.js`, format: "esm" });
await build({ ...common, entryPoints: ["extension/src/popup.ts"], outfile: `${out}/popup.js`, format: "esm" });
for (const f of ["popup.html", "offscreen.html"]) cpSync(`extension/${f}`, `${out}/${f}`);
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
if (testBuild) manifest.content_scripts[0].matches.push("http://localhost:5173/ext-test.html");
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 2));
cpSync("extension/icons", `${out}/icons`, { recursive: true });
console.log(`✓ Extension built → ${out}  (Studio link: ${studio})`);
