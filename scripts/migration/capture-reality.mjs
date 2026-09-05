#!/usr/bin/env node
/**
 * BEYU OS 2.0 — Reality snapshot capture (Phase 0 reproducibility helper).
 *
 * Captures the immutable facts used by docs/migration/*.md so the evidence
 * can be regenerated on any checkout without re-running the whole suite.
 *
 * This script is READ-ONLY. It never mutates source code, the database or
 * git history. It records:
 *   - git SHA / branch / remote / working-tree state
 *   - runtime and package-manager versions
 *   - repostiory shape: TS files, TS LOC, test files, migration files
 *   - key framework versions from package manifests
 *
 * Usage:
 *   node scripts/migration/capture-reality.mjs [--json]
 *
 * Example (JSON, machine readable):
 *   node scripts/migration/capture-reality.mjs --json > reality.json
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const json = process.argv.includes("--json");

function sh(args, cwd = root) {
  try {
    return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/** Recursively skip build/install output directories. */
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "coverage",
  ".turbo",
  "build",
  "out",
]);

function walk(dir, predicate) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(entry)) continue;
        stack.push(full);
      } else if (predicate(full, st)) {
        out.push(full);
      }
    }
  }
  return out;
}

function countFiles(rootDir, predicate) {
  return walk(rootDir, predicate).length;
}

function countLoc(rootDir, predicate) {
  let total = 0;
  for (const file of walk(rootDir, predicate)) {
    try {
      total += readFileSync(file, "utf8").split("\n").length;
    } catch {
      // ignore unreadable file
    }
  }
  return total;
}

const isTs = (f) => f.endsWith(".ts") || f.endsWith(".tsx");
const isTest = (f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts") || f.endsWith(".test.tsx");
const isMigrationUp = (f) => /migrations?/.test(f) && f.endsWith(".sql");

const rootPkg = readJson(join(root, "package.json")) ?? {};

const snapshot = {
  capturedAt: new Date().toISOString(),
  root,
  git: {
    head: sh(["git", "rev-parse", "HEAD"]),
    shortHead: sh(["git", "rev-parse", "--short", "HEAD"]),
    branch: sh(["git", "branch", "--show-current"]),
    remote: sh(["git", "remote", "-v"]),
    status: sh(["git", "status", "--porcelain"]),
    workingTreeClean: (sh(["git", "status", "--porcelain"]) ?? "").length === 0,
  },
  runtime: {
    node: sh(["node", "--version"]),
    npm: sh(["npm", "--version"]),
    pnpm: sh(["pnpm", "--version"]),
  },
  package: {
    name: rootPkg.name,
    version: rootPkg.version,
    packageManager: rootPkg.packageManager ?? "npm (no explicit packageManager field)",
    scripts: rootPkg.scripts ?? {},
    dependencies: rootPkg.dependencies ?? {},
    devDependencies: rootPkg.devDependencies ?? {},
  },
  repositoryShape: {
    tsFiles: countFiles(root, isTs),
    tsLoc: countLoc(root, isTs),
    testFiles: countFiles(root, isTest),
    migrationFiles: countFiles(root, isMigrationUp),
  },
};

if (json) {
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
} else {
  const g = snapshot.git;
  const s = snapshot.repositoryShape;
  console.log(`capturedAt       : ${snapshot.capturedAt}`);
  console.log(`root             : ${root}`);
  console.log(`git HEAD         : ${g.head}`);
  console.log(`git branch       : ${g.branch}`);
  console.log(`git remote       : ${g.remote}`);
  console.log(`working tree     : ${g.workingTreeClean ? "CLEAN" : "DIRTY"}`);
  console.log(`node/npm/pnpm    : ${snapshot.runtime.node} / ${snapshot.runtime.npm} / ${snapshot.runtime.pnpm}`);
  console.log(`package name     : ${snapshot.package.name}@${snapshot.package.version}`);
  console.log(`package manager  : ${snapshot.package.packageManager}`);
  console.log(`repo ts files    : ${s.tsFiles}`);
  console.log(`repo ts loc      : ${s.tsLoc}`);
  console.log(`repo test files  : ${s.testFiles}`);
  console.log(`repo migrations  : ${s.migrationFiles}`);
  const rel = relative(root, root);
  console.log(`repo relative    : ${rel || "."}`);
}
