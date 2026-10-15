/**
 * BEYU-SCG mechanical checks — CLI runner for CI and `npm run verify`.
 *
 * Exit codes:
 *   0  all checks passed (advisory findings are reported but do not fail)
 *   1  at least one BLOCKING finding
 *
 * WHAT A PASS MEANS, AND WHAT IT DOES NOT. A pass means the inventory parses,
 * its ids and source paths resolve, the TypeScript register and the JSON
 * inventory agree, no key material is present, no document declares a completion
 * label, no automation is marked authorized and A7 declares no execution. It
 * does NOT mean anything is approved, compliant, secure, enforceable or
 * deployed — and no automation is authorized by a passing check.
 */
import { runScgChecks } from "../src/lib/smart-contracts/checks";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const PACK_DIR = "docs/governance/smart-contracts";

const packFiles = readdirSync(join(root, PACK_DIR))
  .filter((f) => f.endsWith(".md"))
  .map((f) => `${PACK_DIR}/${f}`)
  .sort();

const results = runScgChecks(root, packFiles);

let blocking = 0;
let advisory = 0;
for (const result of results) {
  blocking += result.blocking;
  advisory += result.advisory;
  const mark = result.blocking === 0 ? "PASS" : "FAIL";
  console.log(`${mark}  ${result.check}  (blocking ${result.blocking}, advisory ${result.advisory})`);
  for (const finding of result.findings) {
    console.log(`   [${finding.severity}] ${finding.code} — ${finding.subject}: ${finding.detail}`);
  }
}

console.log("");
console.log(`BEYU-SCG mechanical checks: ${results.length} checks, ${blocking} blocking, ${advisory} advisory.`);
if (blocking > 0) {
  console.error("BLOCKING findings present. These are governance guards, not style rules: fix the artefact, never the check.");
  process.exit(1);
}
console.log("No blocking findings. This is a consistency result about artefacts — not an approval, not a certification, and not an authorization.");
