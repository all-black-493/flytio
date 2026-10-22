import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

/** Kept in step with tsconfig.json's paths - wrangler reads those directly. */
export default defineConfig({
  resolve: {
    alias: {
      "@domain": src("domain"),
      "@application": src("application"),
      "@infrastructure": src("infrastructure"),
      "@interfaces": src("interfaces"),
      "@config": src("config"),
    },
  },
});
