#!/usr/bin/env node
/**
 * npm-audit-phase12.mjs — Phase 12 Wave 16 (supply chain).
 *
 * Runs `npm audit --json` (full) and `npm audit --omit=dev --json`
 * (production) and classifies every vulnerability into:
 *   - severity (critical/high/moderate/low)
 *   - reachability: "runtime" (present with --omit=dev) vs "development-only"
 *   - exploitability: "exploitable" | "non-exploitable" | "externally-mitigated"
 *   - transitive vs direct
 * and writes coverage/npm-audit-phase12.json.
 *
 * No vulnerability is silently dropped; unresolved high/critical RUNTIME
 * findings remain explicitly classified. We do NOT blindly bump semver-major
 * versions (e.g. @nestjs 10 -> 12): upgrades are recorded with isSemVerMajor so
 * a human can schedule them.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKEND = resolve(__dirname, "..");
const OUT = resolve(BACKEND, "..", "coverage"); // sectors/health/coverage

// Advisories whose vulnerable code path is NOT reachable from the Health OS
// request surface even though the package is a runtime dependency.
const EXTERNALLY_MITIGATED = new Map([
  // multer DoS series: no file-upload endpoint is exposed by Health OS.
  ["GHSA-xf7r-hgr6-v32p", "no multer file-upload route exists in Health OS"],
  ["GHSA-v52c-386h-88mc", "no multer file-upload route exists in Health OS"],
  ["GHSA-5528-5vmv-3xc2", "no multer file-upload route exists in Health OS"],
  // js-yaml merge prototype pollution: swagger YAML is developer-authored, not attacker-supplied.
  ["GHSA-mh29-5h37-fv8m", "swagger YAML is developer-authored, not attacker-controlled"],
  ["GHSA-h67p-54hq-rp68", "swagger YAML is developer-authored, not attacker-controlled"],
  ["GHSA-52cp-r559-cp3m", "swagger YAML is developer-authored, not attacker-controlled"],
  // lodash _.template code injection: no attacker-controlled template input.
  ["GHSA-r5fr-rjxr-66jc", "no attacker-controlled _.template input in Health OS"],
]);

function runAudit(args) {
  let raw;
  try {
    raw = execFileSync("npm", ["audit", "--json", ...args], { cwd: BACKEND, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) {
    raw = e.stdout?.toString() ?? "{}";
  }
  return JSON.parse(raw || "{}");
}

const full = runAudit([]);
const prod = runAudit(["--omit=dev"]);
const prodPackages = new Set(Object.keys(prod.vulnerabilities ?? {}));

function classify(entries) {
  const out = [];
  for (const [pkg, info] of Object.entries(entries)) {
    const vias = Array.isArray(info.via) ? info.via : [info.via];
    const advisories = vias.filter((v) => typeof v === "object" && v && v.title);
    const reachability = prodPackages.has(pkg) ? "runtime" : "development-only";

    let exploitability = "exploitable";
    if (reachability === "development-only") {
      exploitability = "non-exploitable";
    } else {
      for (const adv of advisories) {
        const id = adv.url?.replace("https://github.com/advisories/", "");
        if (EXTERNALLY_MITIGATED.has(id)) exploitability = "externally-mitigated";
      }
    }

    out.push({
      package: pkg,
      severity: info.severity,
      direct: !!info.isDirect,
      reachability,
      exploitability,
      fixAvailable: info.fixAvailable ?? null,
      advisories: advisories.map((a) => ({
        id: a.url?.replace("https://github.com/advisories/", "") ?? null,
        title: a.title,
        severity: a.severity,
        cvss: a.cvss?.score ?? null,
      })),
    });
  }
  return out;
}

const metadata = full.metadata ?? {};
const vulns = classify(full.vulnerabilities ?? {});

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "npm-audit-phase12.json"), JSON.stringify({
  generated: new Date().toISOString(),
  schema: "npm-audit-phase12-v1",
  metadata: {
    full: metadata.vulnerabilities ?? null,
    production: prod.metadata?.vulnerabilities ?? null,
    dependencies: metadata.dependencies ?? null,
  },
  summary: {
    total: vulns.length,
    bySeverity: vulns.reduce((a, v) => { a[v.severity] = (a[v.severity] ?? 0) + 1; return a; }, {}),
    byExploitability: vulns.reduce((a, v) => { a[v.exploitability] = (a[v.exploitability] ?? 0) + 1; return a; }, {}),
    byReachability: vulns.reduce((a, v) => { a[v.reachability] = (a[v.reachability] ?? 0) + 1; return a; }, {}),
    unresolvedHighCriticalRuntime: vulns.filter((v) => v.reachability === "runtime" && ["high", "critical"].includes(v.severity) && v.exploitability === "exploitable").length,
  },
  vulnerabilities: vulns,
}, null, 2));

// eslint-disable-next-line no-console
console.log(`npm-audit-phase12: ${vulns.length} packages -> ${join(OUT, "npm-audit-phase12.json")}`);
