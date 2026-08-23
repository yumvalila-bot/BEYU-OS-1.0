#!/usr/bin/env node
/**
 * Full verification gate runner — rate-limit safe.
 *
 * POLICY-INDEPENDENT test infrastructure. This script encodes NO accounting
 * judgement, touches no financial data and grants no authority. It only
 * sequences the checks that already exist.
 *
 * Why this exists
 * ---------------
 * `guarded()` applies a per-principal, per-capability rate limit
 * (`src/lib/api.ts`). The HTTP suites authenticate as a small number of seeded
 * identities, so running a suite repeatedly inside one window makes later runs
 * fail with HTTP 429 — an artefact of the limiter, NOT a regression.
 *
 * Running the gate by hand has twice produced spurious failures for exactly
 * this reason. This runner inserts a cooldown between HTTP-bearing suite runs
 * so a clean tree verifies deterministically.
 *
 * It NEVER weakens the limiter. The cooldown is on the caller's side.
 *
 * Usage:
 *   node scripts/verify.mjs            # full gate
 *   node scripts/verify.mjs --quick    # skip the second suite run
 */

import { spawn } from "node:child_process";

const COOLDOWN_MS = 65_000; // limiter window is 60s; 65s clears it with margin.
const quick = process.argv.includes("--quick");

/** Run a command, streaming output, resolving with its exit code. */
function run(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: "inherit", shell: false });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function cooldown(reason) {
  const seconds = Math.round(COOLDOWN_MS / 1000);
  console.log(`\n⏳ Rate-limit cooldown ${seconds}s (${reason}).`);
  console.log("   The limiter is deliberately NOT weakened; the caller waits instead.\n");
  await sleep(COOLDOWN_MS);
}

const steps = [
  { name: "typecheck", cmd: "npx", args: ["tsc", "--noEmit"], http: false },
  { name: "lint", cmd: "npm", args: ["run", "lint"], http: false },
  { name: "build", cmd: "npm", args: ["run", "build"], http: false },
  { name: "migrate (fingerprint)", cmd: "npm", args: ["run", "migrate"], http: false },
  { name: "full suite", cmd: "npx", args: ["vitest", "run"], http: true },
  ...(quick ? [] : [{ name: "full suite (determinism re-run)", cmd: "npx", args: ["vitest", "run"], http: true }]),
  { name: "finance regression", cmd: "npx", args: ["vitest", "run", "tests/finance/"], http: true },
];

const results = [];
let previousWasHttp = false;

for (const step of steps) {
  if (step.http && previousWasHttp) {
    await cooldown(`previous step "${results.at(-1).name}" consumed rate-limit budget`);
  }
  console.log(`\n━━━ ${step.name} ━━━`);
  const code = await run(step.cmd, step.args);
  results.push({ name: step.name, code });
  previousWasHttp = step.http;
  if (code !== 0) {
    console.error(`\n✗ FAILED: ${step.name} (exit ${code})`);
    if (step.http) {
      console.error("  If failures are HTTP 429, this is rate limiting, not a defect.");
      console.error("  Re-run after a cooldown before reporting a regression.");
    }
    break;
  }
}

console.log("\n━━━ SUMMARY ━━━");
for (const r of results) console.log(`  ${r.code === 0 ? "PASS" : "FAIL"}  ${r.name}`);

const failed = results.filter((r) => r.code !== 0).length;
console.log(failed === 0 ? "\n✓ All verification steps passed." : `\n✗ ${failed} step(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
