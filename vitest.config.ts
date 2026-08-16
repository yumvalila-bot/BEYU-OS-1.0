import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/** Unit/contract test runner for BEYU OS pure engines (no DB required). */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
