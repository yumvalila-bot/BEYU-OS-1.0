/**
 * BEYU OS — P4 Production PVG CLI (canonical, CI-side)
 *
 * Runs the Production Verification Gate against the LIVE production
 * environment from the governed release pipeline:
 *
 *   1. Runtime identity  — GET {production-url}/api/health/identity must return
 *      the allowlisted identity tuple, and its gitSha must match the commit the
 *      pipeline is releasing (expected git sha).
 *
 *      The tuple is consumed from the CANONICAL NESTED ENVELOPE the endpoint
 *      serves — `{ ok, system, identity: { … }, at }` — via
 *      `extractRuntimeIdentity()` in `src/lib/release/pvg-cli-contract.ts`.
 *      Reading it from the response ROOT (the pre-repair behaviour) silently
 *      resolved every field to `UNKNOWN`, made the convergence loop burn its
 *      full 12-minute window and forced the decisive `release_identity` MISMATCH
 *      — the gate could never pass for any deployment. The API response is the
 *      canonical contract and is unchanged; the ADAPTER was wrong.
 *
 *   2. Runtime health    — GET /api/health must report database UP;
 *      GET /api/health/live must be alive.
 *
 *   3. Database truth    — beyu_migrations ledger (count/latest/checksum
 *      fingerprint) and the information_schema fingerprint, probed live with
 *      the pipeline's admin authority (the same authority scripts/db-release.ts
 *      uses; read-only here).
 *
 *      TWO non-interchangeable fingerprints, TWO separate flags — never
 *      compared with each other:
 *        • --expected-migration-fingerprint  LEDGER sha256 over the ordered
 *          `beyu_migrations.checksum` values (canonical implementation:
 *          `src/lib/release/migration-fingerprint.ts`; same quantity
 *          `scripts/db-release.ts` now emits as `ledgerFingerprint`).
 *        • --expected-schema-fingerprint     PHYSICAL-SCHEMA md5 of `public`
 *          (the value `scripts/db-release.ts` reports as `fingerprint`).
 *      The legacy ambiguous `--expected-fingerprint` is REFUSED: it previously
 *      carried the schema md5 into the migration expectation, which made
 *      `database_migration_state` and `database_release_compatibility` fail
 *      deterministically for every release.
 *
 *   4. Security invariants — CAP_POSTING still LOCKED, RLS enforced in the
 *      schema, no AI principal holding control-plane grants, event chain head
 *      intact.
 *
 *   5. Compatibility     — expected (scratch-built) fingerprint/latest/count
 *      must equal the live database state, else blocking FAIL.
 *
 * With --persist, the pipeline ALSO records the release governance ledger rows
 * (release record, DEPLOYED transition, PVG run, PVG_VERIFIED on pass) using
 * deterministic ids so pipeline retries are idempotent.
 *
 * FAIL-CLOSED: exit 0 only on PVG PASS. Exit 1 on any FAIL (with sanitized CI
 * annotation). Exit 2 when the environment/database is unreachable or the CLI is
 * misconfigured (e.g. the ambiguous legacy fingerprint flag). A PVG FAIL
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
} from "../../src/lib/release/live-pvg";
import type { ReleaseIdentity, ReleaseTransition } from "../../src/lib/release/types";
import { isValidTransition } from "../../src/lib/release/state-machine";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import { sanitizeError } from "../lib/sanitize-error";
import { annotateGateFailures } from "../lib/ci-annotation";
import {
  EXPECTED_MIGRATION_FINGERPRINT_FLAG,
  EXPECTED_SCHEMA_FINGERPRINT_FLAG,
  LEGACY_AMBIGUOUS_FINGERPRINT_FLAG,
  buildPvgContext,
  buildReleaseIdentity,
  deriveExpectedReleaseIdentity,
  extractRuntimeIdentity,
  releaseIdentityMatches,
  resolveFingerprintExpectations,
  runningGitShaLabel,
  runningGitShaMatches,
  runtimeIdentityOk,
  type FingerprintExpectations,
  type RuntimeIdentityFields,
} from "../../src/lib/release/pvg-cli-contract";

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
const expectedLatest = argValue("--expected-latest") ?? null;
const expectedCount = argValue("--expected-count") ? Number(argValue("--expected-count")) : null;
const persist = hasFlag("--persist");
const runUrl = process.env.RUN_WORKFLOW_URL ?? null;
const runId = process.env.RUN_ID ?? "local";

/**
 * A supplied flag MUST carry a value. Silently treating `--expected-foo` with no
 * value as "no expectation" would drop a real integrity check without saying so;
 * a misconfiguration must fail loudly instead (exit 2, config error).
 */
function flagValueRequired(flag: string): string | null {
  if (!args.includes(flag)) return null;
  const value = argValue(flag);
  if (value === undefined || value.trim() === "") {
    console.error(`PVG CLI configuration error: ${flag} requires a value.`);
    annotateGateFailures("PVG", [`${flag} was supplied without a value`]);
    process.exit(2);
  }
  return value;
}

// ── Fingerprint expectations (TWO distinct quantities, never compared) ───────
// The migration-ledger sha256 and the physical-schema md5 are resolved through
// separate flags. The legacy ambiguous `--expected-fingerprint` is refused by
// `resolveFingerprintExpectations` (see ./src/lib/release/pvg-cli-contract.ts),
// because it previously routed a schema md5 into the migration-ledger
// expectation and deterministically failed two blocking checks. Refusing it —
// rather than ignoring it — also prevents silently dropping the ledger check.
function resolveExpectationsOrExit(): FingerprintExpectations {
  const resolution = resolveFingerprintExpectations({
    legacyAmbiguousFingerprint: flagValueRequired(LEGACY_AMBIGUOUS_FINGERPRINT_FLAG),
    expectedMigrationFingerprint: flagValueRequired(EXPECTED_MIGRATION_FINGERPRINT_FLAG),
    expectedSchemaFingerprint: flagValueRequired(EXPECTED_SCHEMA_FINGERPRINT_FLAG),
  });
  if (resolution.ok) {
    // Resolved to a CONCRETE (non-union) type here: `main()` reads this value
    // across a closure boundary, where TypeScript does not carry a narrowing
    // performed at module scope.
    return {
      migrationFingerprint: resolution.migrationFingerprint,
      schemaFingerprint: resolution.schemaFingerprint,
    };
  }
  console.error(`PVG CLI configuration error: ${resolution.error}`);
  annotateGateFailures("PVG", [resolution.error]);
  process.exit(2);
}

const fingerprintExpectations: FingerprintExpectations = resolveExpectationsOrExit();

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
  console.log(`Expected migration-ledger fingerprint: ${fingerprintExpectations.migrationFingerprint ?? "(none provided)"}`);
  console.log(`Expected schema fingerprint: ${fingerprintExpectations.schemaFingerprint ?? "(none provided)"}`);

  // ── 1/2. Runtime endpoints ────────────────────────────────────────────────
  // A `main` push starts this pipeline while the platform is still deploying
  // the new build. The gate gives the deployment a bounded convergence window
  // (12 min, mirroring runtime-verify) to serve the released commit's
  // identity; if it never converges, PVG FAILS — truthfully: the running
  // artifact is not the released artifact.
  const identityDeadline = Date.now() + 12 * 60 * 1000;
  let identityRes = await probeJson(`${productionUrl}/api/health/identity`);
  // The running identity is read from the canonical NESTED envelope on EVERY
  // probe (`{ ok, system, identity: { … }, at }`) — never from the response
  // root, and never falling back to the root when the envelope is absent.
  const currentIdentity = (): RuntimeIdentityFields => extractRuntimeIdentity(identityRes.body);
  const runningShaLabel = (): string => runningGitShaLabel(currentIdentity());
  while (
    Date.now() < identityDeadline &&
    !(identityRes.ok && runningGitShaMatches(currentIdentity().gitSha, expectedGitSha))
  ) {
    console.log(
      `Waiting for production to serve the released identity (running: ${runningShaLabel()}; expected: ${expectedGitSha?.slice(0, 8) ?? "?"})…`,
    );
    await new Promise((r) => setTimeout(r, 30_000));
    identityRes = await probeJson(`${productionUrl}/api/health/identity`);
  }
  const healthRes = await probeJson(`${productionUrl}/api/health`);
  const liveRes = await probeJson(`${productionUrl}/api/health/live`);
  const identity = extractRuntimeIdentity(identityRes.body);
  const identityOk = runtimeIdentityOk(identityRes.ok, identity);
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
  // Contract logic lives in `src/lib/release/pvg-cli-contract.ts` (pure and
  // unit-tested), so the adapter defect class that reached production cannot
  // recur unnoticed.
  const releaseIdentity: ReleaseIdentity = buildReleaseIdentity({
    identity,
    db: dbState,
    environment,
  });

  // Release-identity mismatch is decisive: if the endpoint did not answer or
  // the running build is not the released commit, the gate FAILS here.
  const identityMatches = releaseIdentityMatches({
    identityOk,
    actualGitSha: identity.gitSha,
    expectedGitSha,
  });

  const expectedReleaseIdentity = deriveExpectedReleaseIdentity({
    expectedGitSha,
    environment,
    identityMatches,
  });

  const pvgResult = await runPvg(
    buildPvgContext({
      releaseIdentity,
      expectedReleaseIdentity,
      environment,
      correlationId: `pvg-${runId}`,
      traceId: `pvg-${runId}`,
      db: dbState,
      security,
      events,
      runtimeHealthy: runtimeHealth && livenessOk,
      criticalReadiness: runtimeHealth,
      expectations: fingerprintExpectations,
      expectedMigrationCount: expectedCount,
      expectedLatestMigration: expectedLatest,
    }),
  );

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
