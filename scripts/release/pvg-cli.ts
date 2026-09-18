/**
 * BEYU OS — P4 Production PVG CLI (canonical, CI-side)
 *
 * Runs the Production Verification Gate against the LIVE production
 * environment from the governed release pipeline:
 *
 *   1. Runtime identity  — GET {production-url}/api/health/identity must return
 *      the allowlisted identity tuple, and its gitSha must match the commit the
 *      pipeline is releasing (expected git sha).
 *   2. Runtime health    — GET /api/health must report database UP;
 *      GET /api/health/live must be alive.
 *   3. Database truth    — beyu_migrations ledger (count/latest/checksum
 *      fingerprint) and the information_schema fingerprint, probed live with
 *      the pipeline's admin authority (the same authority scripts/db-release.ts
 *      uses; read-only here).
 *   4. Security invariants — CAP_POSTING still LOCKED, RLS enforced in the
 *      schema, no AI principal holding control-plane grants, event chain head
 *      intact.
 *   5. Compatibility     — expected (scratch-built) fingerprint/latest/count
 *      must equal the live database state, else blocking FAIL.
 *
 * With --persist, the pipeline ALSO records the release governance ledger rows
 * (release record, DEPLOYED transition, PVG run, PVG_VERIFIED on pass) using
 * deterministic ids so pipeline retries are idempotent.
 *
 * FAIL-CLOSED: exit 0 only on PVG PASS. Exit 1 on any FAIL (with sanitized CI
 * annotation). Exit 2 when the environment/database is unreachable. A PVG FAIL
 * BLOCKS PROMOTION — the state machine refuses DEPLOYED → PROMOTED without
 * PVG_VERIFIED, so a red pipeline can never promote.
 *
 * This job proves VERIFIED — it does NOT promote. Traffic shifting and
 * promotion remain governed, human-boundaried actions (P3 adapter boundary).
 */

import "dotenv/config";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runPvg } from "../../src/lib/release/pvg";
import {
  probeLiveMigrationState,
  probeLiveSecurityState,
  probeLiveEventState,
} from "../../src/lib/release/live-pvg";import type { ReleaseIdentity, ReleaseTransition } from "../../src/lib/release/types";
import { isValidTransition } from "../../src/lib/release/state-machine";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { sanitizeError } from "../lib/sanitize-error";
import { annotateGateFailures } from "../lib/ci-annotation";

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

const productionUrl = argValue("--production-url") ?? process.env.BEYU_PRODUCTION_URL ?? "https://beyu-os-1-0.vercel.app";
const environment = argValue("--environment") ?? "production";
const expectedGitSha = argValue("--expected-git-sha") ?? process.env.GITHUB_SHA ?? null;
const expectedFingerprint = argValue("--expected-fingerprint") ?? null;
const expectedLatest = argValue("--expected-latest") ?? null;
const expectedCount = argValue("--expected-count") ? Number(argValue("--expected-count")) : null;
const persist = hasFlag("--persist");
const runUrl = process.env.RUN_WORKFLOW_URL ?? null;
const runId = process.env.RUN_ID ?? "local";

// The pipeline's admin authority. The application pool reads DATABASE_URL at
// first query; pointing it at the admin DSN is the SAME authority the deploy
// job already holds — used here for read-only probes plus the governed
// --persist ledger writes. It is never printed and never leaves this process.
const adminDsn = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
if (adminDsn) {
  process.env.DATABASE_URL = adminDsn;
}

interface ProbeResult {
  ok: boolean;
  status: number | null;
  body: unknown;
  error?: string;
}

async function probeJson(url: string, timeoutMs = 15000): Promise<ProbeResult> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: null, body: null, error: e instanceof Error ? e.message : "fetch failed" };
  }
}

async function main(): Promise<number> {
  console.log(`PVG target: ${environment} @ ${productionUrl}`);
  console.log(`Expected git sha: ${expectedGitSha ?? "(none provided)"}`);
  console.log(`Expected migration fingerprint: ${expectedFingerprint ?? "(none provided)"}`);

  // ── 1/2. Runtime endpoints ────────────────────────────────────────────────
  // A `main` push starts this pipeline while the platform is still deploying
  // the new build. The gate gives the deployment a bounded convergence window
  // (12 min, mirroring runtime-verify) to serve the released commit's
  // identity; if it never converges, PVG FAILS — truthfully: the running
  // artifact is not the released artifact.
  const identityDeadline = Date.now() + 12 * 60 * 1000;
  let identityRes = await probeJson(`${productionUrl}/api/health/identity`);
  const shaMatches = (b: Record<string, unknown>): boolean =>
    typeof b.gitSha === "string" &&
    !!expectedGitSha &&
    (b.gitSha === expectedGitSha ||
      b.gitSha.startsWith(expectedGitSha.slice(0, 8)) ||
      expectedGitSha.startsWith(b.gitSha.slice(0, 8)));
  const runningShaLabel = (): string => {
    const b = (identityRes.body ?? {}) as Record<string, unknown>;
    return typeof b.gitSha === "string" ? b.gitSha.slice(0, 8) : "unavailable";
  };
  while (
    Date.now() < identityDeadline &&
    !(identityRes.ok && shaMatches((identityRes.body ?? {}) as Record<string, unknown>))
  ) {
    console.log(
      `Waiting for production to serve the released identity (running: ${runningShaLabel()}; expected: ${expectedGitSha?.slice(0, 8) ?? "?"})…`,
    );
    await new Promise((r) => setTimeout(r, 30_000));
    identityRes = await probeJson(`${productionUrl}/api/health/identity`);
  }
  const healthRes = await probeJson(`${productionUrl}/api/health`);
  const liveRes = await probeJson(`${productionUrl}/api/health/live`);
  const identityBody = (identityRes.body ?? {}) as Record<string, unknown>;
  const identityOk = identityRes.ok && typeof identityBody.releaseId === "string" && typeof identityBody.gitSha === "string";
  const healthBody = (healthRes.body ?? {}) as { checks?: { database?: string } };
  const runtimeHealth = healthRes.ok && healthBody.checks?.database === "UP";
  const livenessOk = liveRes.ok;

  // ── 3/4. Live database + security + event probes (canonical modules) ─────
  let dbState = { connected: false, migrationCount: null as number | null, latestMigration: null as string | null, migrationFingerprint: null as string | null, schemaFingerprint: null as string | null };
  let security = { rbac: true, abac: true, rls: false, capPostingLocked: false, noeliaBoundary: false };
  let events = { outboxHealthy: null as boolean | null, chainIntact: null as boolean | null };

  if (adminDsn) {
    try {
      // The pipeline connects with the admin role; role-escalation assertions
      // (BYPASSRLS/SUPERUSER of the CURRENT connection) are meaningless here and
      // are verified against the runtime role by db-release verify instead.
      const sec = await probeLiveSecurityState({ assertRuntimeRole: false });
      [dbState, events] = await Promise.all([probeLiveMigrationState(), probeLiveEventState()]);
      security = {
        rbac: sec.rbac,
        abac: sec.abac,
        rls: sec.rls,
        capPostingLocked: sec.capPostingLocked,
        noeliaBoundary: sec.noeliaBoundary,
      };
    } catch (e) {
      console.error(`Live probe failure: ${sanitizeError(e)}`);
    }
  } else {
    console.error("No database DSN available — database probes cannot run (fail-closed).");
  }

  // ── Assemble identity ─────────────────────────────────────────────────────
  const releaseIdentity: ReleaseIdentity = {
    releaseId: typeof identityBody.releaseId === "string" ? identityBody.releaseId : "UNKNOWN",
    gitSha: typeof identityBody.gitSha === "string" ? identityBody.gitSha : "UNKNOWN",
    repository: typeof identityBody.repository === "string" ? identityBody.repository : "unknown",
    buildId: typeof identityBody.buildId === "string" ? identityBody.buildId : "UNKNOWN",
    deploymentId: typeof identityBody.deploymentId === "string" ? identityBody.deploymentId : "UNKNOWN",
    environment: typeof identityBody.environment === "string" ? identityBody.environment : environment,
    applicationVersion: typeof identityBody.applicationVersion === "string" ? identityBody.applicationVersion : "BEYU-OS/1.0.0",
    runtimeVersion: typeof identityBody.runtimeVersion === "string" ? identityBody.runtimeVersion : "BEYU-OS/1.0.0",
    migrationFingerprint: dbState.migrationFingerprint,
    latestMigration: dbState.latestMigration,
    migrationCount: dbState.migrationCount,
    schemaFingerprint: dbState.schemaFingerprint,
    releaseTimestamp: typeof identityBody.releaseTimestamp === "string" ? identityBody.releaseTimestamp : new Date().toISOString(),
  };

  const expectedReleaseIdentity = expectedGitSha
    ? { gitSha: expectedGitSha, environment }
    : { environment };

  // Release-identity mismatch is decisive: if the endpoint did not answer or
  // the running build is not the released commit, the gate FAILS here.
  const identityMatches = identityOk && expectedGitSha
    ? releaseIdentity.gitSha.startsWith(expectedGitSha.slice(0, 8)) || expectedGitSha.startsWith(releaseIdentity.gitSha.slice(0, 8))
    : identityOk;

  const pvgResult = await runPvg({
    releaseIdentity,
    expectedReleaseIdentity: identityMatches ? expectedReleaseIdentity : { ...expectedReleaseIdentity, gitSha: "MISMATCH" },
    expectedMigrationFingerprint: expectedFingerprint,
    expectedSchemaFingerprint: null,
    expectedMigrationCount: expectedCount,
    expectedLatestMigration: expectedLatest,
    environment,
    correlationId: `pvg-${runId}`,
    traceId: `pvg-${runId}`,
    dbConnected: dbState.connected,
    migrationCount: dbState.migrationCount,
    latestMigration: dbState.latestMigration,
    migrationFingerprint: dbState.migrationFingerprint,
    migrationFingerprintMatches:
      expectedFingerprint !== null
        ? dbState.migrationFingerprint !== null && dbState.migrationFingerprint === expectedFingerprint
        : null,
    schemaFingerprint: dbState.schemaFingerprint,
    schemaMatches: null,
    runtimeHealth: runtimeHealth && livenessOk,
    authzChecks: {
      rbac: security.rbac,
      abac: security.abac,
      rls: security.rls,
      capPostingLocked: security.capPostingLocked,
      noeliaBoundary: security.noeliaBoundary,
    },
    eventOutboxHealthy: events.outboxHealthy,
    eventChainIntact: events.chainIntact,
    criticalReadiness: runtimeHealth,
  });

  const evidence = {
    ...pvgResult,
    pipeline: { runId, runUrl, productionUrl, environment },
  };

  console.log("\n=== PVG RESULT ===");
  console.log(JSON.stringify(evidence, null, 2));

  // Persist BEFORE exiting non-zero, so a FAIL leaves evidence too.
  if (persist && adminDsn && dbState.connected) {
    try {
      const { upsertReleaseRecord, recordPvgRun, appendTransitionRecord } = await import("../../src/lib/release/store");
      await upsertReleaseRecord(releaseIdentity);
      await recordPvgRun(evidence, {
        // Deterministic per release+attempt-shape: pipeline retries overwrite nothing.
        resultId: fixedId(ID_PREFIX.event, `pvg:${releaseIdentity.releaseId}:${runId}`),
        correlationId: `pvg-${runId}`,
        traceId: `pvg-${runId}`,
        actorId: runUrl ?? `pipeline:db-release:${runId}`,
      });
      const now = new Date().toISOString();
      const base = {
        releaseId: releaseIdentity.releaseId,
        sourceCommit: expectedGitSha ?? releaseIdentity.gitSha,
        artifactBuildId: releaseIdentity.buildId,
        environment,
        timestamp: now,
        actorId: runUrl ?? `pipeline:db-release:${runId}`,
        actorType: "SYSTEM" as const,
        correlationId: `pvg-${runId}`,
        traceId: `pvg-${runId}`,
      };
      // DESIGNED → BUILT → DEPLOYED (ledger of pipeline reality; idempotent ids)
      for (const [i, state] of ["DESIGNED", "BUILT", "DEPLOYED"].entries()) {
        const previous = i === 0 ? null : (["DESIGNED", "BUILT"][i - 1] as ReleaseTransition["nextState"]);
        const transition: ReleaseTransition = {
          id: fixedId(ID_PREFIX.event, `rel:${releaseIdentity.releaseId}:${state}`),
          ...base,
          previousState: previous,
          nextState: state as ReleaseTransition["nextState"],
          reason: `Governed release pipeline (${state})`,
          verificationEvidence: state === "DEPLOYED" ? { pipeline: evidence.pipeline, database: evidence.database } : null,
        };
        if (isValidTransition(transition.previousState, transition.nextState, { history: [] }).allowed) {
          await appendTransitionRecord(transition);
        }
      }
      if (pvgResult.status === "PASS") {
        const verified: ReleaseTransition = {
          id: fixedId(ID_PREFIX.event, `rel:${releaseIdentity.releaseId}:PVG_VERIFIED`),
          ...base,
          previousState: "DEPLOYED",
          nextState: "PVG_VERIFIED",
          reason: "PVG PASS — production verification gate satisfied",
          verificationEvidence: { runId, checks: evidence.checks.length, blockingFailures: [] },
        };
        await appendTransitionRecord(verified);
      }
      console.log("Release governance ledger persisted (idempotent).");
    } catch (e) {
      console.error(`Ledger persistence failed: ${sanitizeError(e)}`);
      // Persistence failure must not silently produce an untracked PASS.
      if (pvgResult.status === "PASS") {
      annotateGateFailures("PVG_LEDGER_PERSISTENCE", ["PVG passed but governance ledger could not be persisted"]);
        return 1;
      }
    }
  } else if (persist && !adminDsn) {
    console.error("--persist requested but no DSN configured; ledger not written (fail-closed).");
  }

  // Evidence artifact for the workflow upload.
  try {
    mkdirSync(join(process.cwd(), ".next"), { recursive: true });
    writeFileSync(join(process.cwd(), ".next", "pvg-evidence.json"), JSON.stringify(evidence, null, 2));
  } catch {
    // artifact write is best-effort; the verdict above is authoritative
  }

  if (pvgResult.status === "FAIL") {
    annotateGateFailures("PVG", evidence.blockingFailures as string[]);
    return 1;
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(`PVG CLI fatal: ${sanitizeError(e)}`);
    process.exit(2);
  });
