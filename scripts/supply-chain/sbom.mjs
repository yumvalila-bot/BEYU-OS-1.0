#!/usr/bin/env node
/**
 * BEYU OS — SOFTWARE SUPPLY CHAIN: SBOM GENERATOR (X10THINK §27).
 *
 * Produces a CycloneDX 1.5-shaped JSON SBOM deterministically from the
 * committed `package-lock.json` (the canonical dependency truth) plus git
 * provenance. No network calls, no fabricated data: every component comes from
 * the lockfile; when a field is absent it is omitted, never invented.
 *
 * TRACE: SOURCE (git commit) → lockfile → components → (CI) build → artifact.
 * The SBOM is evidence for the supply-chain register; vulnerability scanning
 * remains the CI security gates' job (audit/dependabot tooling operates on this
 * same lockfile).
 *
 * Usage:
 *   node scripts/supply-chain/sbom.mjs            # writes tmp/sbom/<name>-<version>.sbom.json
 *   node scripts/supply-chain/sbom.mjs --stdout   # prints to stdout
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const lockPath = join(root, "package-lock.json");
const pkgPath = join(root, "package.json");

if (!existsSync(lockPath)) {
  console.error("FAIL: package-lock.json not found — the lockfile is the canonical dependency truth.");
  process.exit(1);
}

const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return null; // absent provenance is omitted, never fabricated
  }
}

const commit = git(["rev-parse", "HEAD"]);
const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);

/** Stable component id from the lockfile package key. */
function bomRef(key) {
  return key === "" ? pkg.name : key.replace(/^node_modules\//, "").replace(/\//g, "-");
}

const components = [];
for (const [key, entry] of Object.entries(lock.packages ?? {})) {
  if (key === "") continue; // root project is metadata, not a component
  const name = key.replace(/^.*node_modules\//, "");
  const component = {
    type: "library",
    "bom-ref": bomRef(key),
    name,
    version: entry.version,
    scope: entry.dev ? "optional" : "required",
  };
  if (entry.license) component.licenses = [].concat(entry.license).map((l) => ({ license: { id: l } }));
  if (entry.resolved) component.externalReferences = [{ type: "distribution", url: entry.resolved }];
  if (entry.integrity) {
    component.hashes = [{ alg: entry.integrity.startsWith("sha512-") ? "SHA-512" : "SHA-256", content: entry.integrity.replace(/^[^-]+-/, "") }];
  }
  components.push(component);
}
components.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  version: 1,
  serialNumber: `urn:uuid:${createHash("sha256").update(`${pkg.name}@${pkg.version}:${commit ?? "local"}:${lock.lockfileVersion}`).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*/, "$1-$2-$3-$4-$5")}`,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: "BEYU OS", name: "sbom-generator", version: "1.0.0" }],
    component: {
      type: "application",
      "bom-ref": pkg.name,
      name: pkg.name,
      version: pkg.version,
      properties: [
        ...(commit ? [{ name: "git:commit", value: commit }] : []),
        ...(branch ? [{ name: "git:branch", value: branch }] : []),
        { name: "lockfileVersion", value: String(lock.lockfileVersion) },
      ],
    },
  },
  components,
};

const json = JSON.stringify(sbom, null, 2) + "\n";
if (process.argv.includes("--stdout")) {
  process.stdout.write(json);
} else {
  const outDir = join(root, "tmp", "sbom");
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, `${pkg.name}-${pkg.version}.sbom.json`);
  writeFileSync(outPath, json);
  const digest = createHash("sha256").update(json).digest("hex");
  console.log(`SBOM written: ${outPath}`);
  console.log(`components=${components.length} sha256=${digest}`);
}
