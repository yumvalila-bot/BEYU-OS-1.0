import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    // Mirror vite.config.ts: shared root components (e.g. src/components/
    // beyu-os-logo.tsx) must resolve React from this package, exactly as the
    // production build does. Without this, resolution depends on whether the
    // repository root happens to have node_modules installed.
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Frontend tests live under src/ only. Backend specs use @nestjs and are run
    // by the backend's jest harness, so they must not be collected here.
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
