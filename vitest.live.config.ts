import { defineConfig, mergeConfig } from "vitest/config";
import base from "./vitest.config";

/**
 * OPT-IN live test configuration.
 *
 * The default runner (vitest.config.ts) collects only files named with the
 * standard test suffix under tests/. Suites that talk to a REAL runtime (the
 * operator's Ollama, a real cloud endpoint) must not be collected by it: a
 * skipped test is still a skipped test in CI, and this repository's CI gate
 * deliberately refuses a run with more than 15 skipped tests ("Assert no test
 * suite was silently skipped for want of a server"). Keeping live suites out of
 * the default include keeps the default count honest — every skip in it belongs
 * to a pre-existing, server-gated suite — and live checks are then run
 * deliberately, by file. The live suffix is ".live.ts":
 *
 *   npx vitest run --config vitest.live.config.ts tests/noelia/ollama-live-smoke.live.ts
 *
 * A live suite still refuses to do anything unless its own opt-in environment
 * variable is set (for the Ollama smoke test: NOELIA_OLLAMA_LIVE_TEST=1), so an
 * accidental invocation cannot contact a runtime or spend anything.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      include: ["tests/**/*.live.ts"],
    },
  }),
);
