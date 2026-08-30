import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Sector OSs are self-contained packages with their own lint configs
    // (e.g. sectors/health uses ESLint 8 — see
    // docs/architecture/HEALTH_SECTOR_INTEGRATION_DESIGN.md).
    "sectors/**",
  ]),
]);
