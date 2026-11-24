import "dotenv/config";
import { defineConfig } from "@playwright/test";

const canonicalDomain = process.env.BEYU_TEST_CANONICAL_DOMAIN;
const base = new URL(process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100");
// Browser acceptance maps canonical names only to the explicitly configured
// loopback test server. Never let the test accidentally visit real domains.
const local = ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname);
const canonicalArgs = canonicalDomain && local ? [
  "--no-proxy-server",
  `--host-resolver-rules=MAP ${canonicalDomain} 127.0.0.1, MAP *.${canonicalDomain} 127.0.0.1, MAP *.${canonicalDomain}.attacker.example 127.0.0.1`,
] : [];

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  outputDir: "tmp/browser-results",
  reporter: "list",
  use: {
    baseURL: process.env.BEYU_TEST_BASE_URL ?? "http://127.0.0.1:3100",
    browserName: "chromium",
    headless: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        args: ["--no-sandbox", "--disable-dev-shm-usage", "--use-gl=angle", "--use-angle=swiftshader", "--disable-gpu-sandbox", ...canonicalArgs],
      } : { args: canonicalArgs }),
    },
  },
});
