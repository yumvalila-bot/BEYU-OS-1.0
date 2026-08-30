import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
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
