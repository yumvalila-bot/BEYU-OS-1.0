/**
 * BEYU OS — P3 Build Identity Capture (canonical)
 *
 * Captures non-secret build/deploy context at build time so both build and CI
 * can verify it, and PVG can prove "the runtime is running what we tested".
 *
 * Reads:
 * - git SHA from working tree or VERCEL_GIT_COMMIT_SHA / GITHUB_SHA
 * - buildId from VERCEL_BUILD_ID or .next/BUILD_ID or generated
 * - deploymentId from VERCEL_DEPLOYMENT_ID or generated
 * - environment from BEYU_ENV / VERCEL_ENV / NODE_ENV
 * - repository from GITHUB_REPOSITORY / VERCEL_GIT_REPO_SLUG
 * - migration fingerprint from env or computed
 *
 * Writes:
 * - .next/RELEASE_IDENTITY.json (consumed by runtime)
 * - src/lib/release/generated-identity.json (fallback for tests and local dev, gitignored? committed as placeholder)
 *
 * Never exposes secrets, tokens, credentials, private keys, database URLs.
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function getEnv(name) {
  const v = process.env[name];
  return v && v.trim() !== "" ? v.trim() : null;
}

function getGitSha() {
  // Prefer env
  const envSha = getEnv("VERCEL_GIT_COMMIT_SHA") || getEnv("GITHUB_SHA") || getEnv("GIT_COMMIT_SHA") || getEnv("BEYU_GIT_SHA");
  if (envSha) return envSha.slice(0, 40);

  // Try git command
  try {
    const sha = execSync("git rev-parse HEAD", { encoding: "utf8", cwd: ROOT }).trim();
    if (sha) return sha;
  } catch {
    // ignore
  }

  return `local-dev-${createHash("sha256").update(ROOT).digest("hex").slice(0, 12)}`;
}

function getBuildId() {
  const envBuild = getEnv("VERCEL_BUILD_ID") || getEnv("BUILD_ID") || getEnv("BEYU_BUILD_ID");
  if (envBuild) return envBuild;

  // Try .next/BUILD_ID
  try {
    const p = join(ROOT, ".next", "BUILD_ID");
    if (existsSync(p)) {
      const id = readFileSync(p, "utf8").trim();
      if (id) return id;
    }
  } catch {
    // ignore
  }

  return `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDeploymentId(buildId) {
  const envDep = getEnv("VERCEL_DEPLOYMENT_ID") || getEnv("DEPLOYMENT_ID") || getEnv("BEYU_DEPLOYMENT_ID");
  if (envDep) return envDep;
  return `deploy-${buildId.slice(0, 12)}-${Date.now()}`;
}

function getEnvironment() {
  const env = getEnv("BEYU_ENV") || getEnv("VERCEL_ENV") || getEnv("NODE_ENV") || "local";
  const lower = env.toLowerCase();
  if (lower === "development") return "local";
  return lower;
}

function getRepository() {
  return getEnv("VERCEL_GIT_REPO_SLUG") || getEnv("GITHUB_REPOSITORY") || getEnv("BEYU_REPOSITORY") || "yumvalila-bot/BEYU-OS-1.0";
}

function getReleaseTimestamp() {
  const envTs = getEnv("BEYU_RELEASE_TIMESTAMP") || getEnv("VERCEL_GIT_COMMIT_DATE") || getEnv("BUILD_TIMESTAMP");
  if (envTs) {
    try {
      const d = new Date(envTs);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch {
      // fallthrough
    }
  }
  return new Date().toISOString();
}

function generateReleaseId(gitSha, buildId, timestamp) {
  const hash = createHash("sha256").update(`${gitSha}:${buildId}:${timestamp}`).digest("hex").slice(0, 12);
  return `REL_${gitSha.slice(0, 8)}_${hash}`;
}

function main() {
  const gitSha = getGitSha();
  const buildId = getBuildId();
  const deploymentId = getDeploymentId(buildId);
  const environment = getEnvironment();
  const repository = getRepository();
  const releaseTimestamp = getReleaseTimestamp();
  const releaseId = generateReleaseId(gitSha, buildId, releaseTimestamp);

  const identity = {
    releaseId,
    gitSha,
    repository,
    buildId,
    deploymentId,
    environment,
    applicationVersion: "BEYU-OS/1.0.0",
    runtimeVersion: "BEYU-OS/1.0.0",
    schemaVersion: getEnv("BEYU_SCHEMA_FINGERPRINT") || null,
    migrationFingerprint: getEnv("BEYU_MIGRATION_FINGERPRINT") || null,
    latestMigration: getEnv("BEYU_LATEST_MIGRATION") || "0047_release_approvals",
    releaseTimestamp,
  };

  // Validate no secrets
  const forbiddenKeys = ["DATABASE_URL", "SECRET", "PASSWORD", "TOKEN", "PRIVATE"];
  for (const [k, v] of Object.entries(identity)) {
    if (v && typeof v === "string") {
      const upperK = k.toUpperCase();
      if (forbiddenKeys.some((fk) => upperK.includes(fk))) {
        console.error(`Refusing to write secret-like key ${k}`);
        process.exit(1);
      }
      if (/postgres(ql)?:\/\/[^:]+:[^@]+@/i.test(v)) {
        console.error(`Refusing to write secret-like value for ${k}`);
        process.exit(1);
      }
    }
  }

  // Write .next/RELEASE_IDENTITY.json
  const nextDir = join(ROOT, ".next");
  if (!existsSync(nextDir)) mkdirSync(nextDir, { recursive: true });
  const nextPath = join(nextDir, "RELEASE_IDENTITY.json");
  writeFileSync(nextPath, JSON.stringify(identity, null, 2), "utf8");
  console.log(`Wrote ${nextPath}`);

  // Write src/lib/release/generated-identity.json (fallback)
  const releaseDir = join(ROOT, "src", "lib", "release");
  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
  const genPath = join(releaseDir, "generated-identity.json");
  writeFileSync(genPath, JSON.stringify(identity, null, 2), "utf8");
  console.log(`Wrote ${genPath}`);

  // Note: public/release-identity.json is intentionally NOT written as static asset
  // because runtime identity must be dynamic (server-derived) via /api/health/identity.
  // Static file would rot and violate "Do not trust user-provided release string".
  // The .next/RELEASE_IDENTITY.json and generated-identity.json are build-time artifacts
  // consumed by server code at runtime, not served statically.

  console.log("Build identity capture complete (non-secret tuple)");
}

main();
