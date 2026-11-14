/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// Three pages:
//   /          → marketing site (src/site)
//   /app/      → Veil Studio, where the model runs (src/app)
//   /spike.html → benchmark & debug page
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
        spike: resolve(import.meta.dirname, "spike.html"),
      },
    },
  },
  // Unit, integration, property-based and security tests run in Vitest; browser tests live in e2e/ (Playwright).
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts", "extension/src/**/*.test.ts"] },
});
