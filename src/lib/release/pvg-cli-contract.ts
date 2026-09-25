/**
 * BEYU OS — PVG CLI adapter contract (pure, testable, DB-free, network-free).
 *
 * WHY THIS MODULE EXISTS
 * ──────────────────────
 * `scripts/release/pvg-cli.ts` executes `main()` on import (it probes
 * production and can write the release ledger), so the production PVG contract
 * could not be exercised by a test: the existing suites inject an already-built
 * context straight into `runPvg()`, which is exactly why two adapter defects
 * reached production unnoticed (PVG-1 identity nesting, PVG-2 fingerprint
 * routing).
 *
 * The adapter's decision logic therefore lives here as pure functions, and the
 * CLI is a thin shell around them. Tests drive the REAL adapter path:
 *
 *   HTTP identity envelope → extractRuntimeIdentity → buildReleaseIdentity
 *      → buildPvgContext → runPvg
 *
 * CONTRACT RULES ENFORCED HERE (each has a regression test)
 * ────────────────────────────────────────────────────────
 *  1. The runtime identity tuple is consumed from the canonical NESTED envelope
 *     `{ ok, system, identity: {...}, at }` — the shape
 *     `src/app/api/health/identity/route.ts` returns and the shape the canonical
 *     `RuntimeIdentityResponse` type describes. A flat/naked body is NOT
 *     accepted as a substitute: permissive parsing would silently accept an
 *     endpoint contract change and let the gate pass on the wrong fields.
 *  2. RELEASE IDENTITY and the two fingerprints stay SEPARATE quantities:
 *     schema fingerprint (physical schema md5) and migration fingerprint
 *     (ledger sha256) are never compared with each other.
 *  3. The ambiguous legacy `--expected-fingerprint` flag is REFUSED. Before this
 *     repair the pipeline passed the schema md5 through it into the migration
 *     expectation, which made `database_migration_state` and
 *     `database_release_compatibility` fail deterministically. Failing loudly on
 *     the ambiguous flag stops that regression class at the source, and never
 *     silently drops a check.
 */

import type { PvgCheckContext } from "./pvg";
import type { ReleaseIdentity } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Runtime identity envelope
// ─────────────────────────────────────────────────────────────────────────────

/** Canonical envelope key that carries the running-artifact identity tuple. */
export const RUNTIME_IDENTITY_KEY = "identity";

/** Ambiguous historical flag — refused, never silently reinterpreted. */
export const LEGACY_AMBIGUOUS_FINGERPRINT_FLAG = "--expected-fingerprint";

export const EXPECTED_MIGRATION_FINGERPRINT_FLAG = "--expected-migration-fingerprint";
export const EXPECTED_SCHEMA_FINGERPRINT_FLAG = "--expected-schema-fingerprint";

export type RuntimeIdentityFields = Record<string, unknown>;

/**
 * Extract the canonical identity tuple from the production identity response.
 *
 * STRICT: returns `{}` unless the body carries an object under `identity`. The
 * caller then treats the identity as unavailable and the gate fails closed,
 * which is the truthful outcome when production does not serve the canonical
 * contract.
 */
export function extractRuntimeIdentity(body: unknown): RuntimeIdentityFields {
  if (body === null || typeof body !== "object") return {};
  const envelope = body as Record<string, unknown>;
  const identity = envelope[RUNTIME_IDENTITY_KEY];
  if (identity === null || typeof identity !== "object" || Array.isArray(identity)) {
    return {};
  }
  return identity as RuntimeIdentityFields;
}

/** A usable identity requires a 2xx response and both mandatory string fields. */
export function runtimeIdentityOk(
  respondedOk: boolean,
  identity: RuntimeIdentityFields,
): boolean {
  return (
    respondedOk &&
    typeof identity.releaseId === "string" &&
    typeof identity.gitSha === "string"
  );
}

/**
 * Convergence predicate: does the running artifact's gitSha match the commit
 * this pipeline is releasing? Accepts full or short (>=8 char) equivalence,
 * exactly as the pre-repair implementation did.
 */
export function runningGitShaMatches(
  actualGitSha: unknown,
  expectedGitSha: string | null,
): boolean {
  if (typeof actualGitSha !== "string" || !expectedGitSha) return false;
  return (
    actualGitSha === expectedGitSha ||
    actualGitSha.startsWith(expectedGitSha.slice(0, 8)) ||
    expectedGitSha.startsWith(actualGitSha.slice(0, 8))
  );
}

/** Short label for convergence logging. */
export function runningGitShaLabel(identity: RuntimeIdentityFields): string {
  return typeof identity.gitSha === "string"
    ? identity.gitSha.slice(0, 8)
    : "unavailable";
}

/**
 * Decisive identity verdict. With no expected gitSha the pipeline can only
 * assert that production served a usable identity; with an expectation the
 * running commit must match.
 */
export function releaseIdentityMatches(args: {
  identityOk: boolean;
  actualGitSha: unknown;
  expectedGitSha: string | null;
}): boolean {
  if (!args.identityOk) return false;
  if (!args.expectedGitSha) return true;
  return runningGitShaMatches(args.actualGitSha, args.expectedGitSha);
}

// ─────────────────────────────────────────────────────────────────────────────
// Release identity assembly
// ─────────────────────────────────────────────────────────────────────────────

/** The live database probe results PVG consumes (see ./live-pvg). */
export type DbProbeState = {
  connected: boolean;
  migrationCount: number | null;
  latestMigration: string | null;
  /** Ledger sha256 — NEVER a schema md5. */
  migrationFingerprint: string | null;
  /** Physical `public` schema md5 — NEVER a ledger sha256. */
  schemaFingerprint: string | null;
};

/** Expected release identity handed to `checkReleaseIdentity`. */
export type ExpectedReleaseIdentity = {
  gitSha?: string;
  environment: string;
};

/**
 * Build the running `ReleaseIdentity` from the canonical identity tuple plus the
 * live DB probe state. Missing fields degrade to explicit placeholders — never
 * to a plausible-looking value that could pass a comparison.
 */
export function buildReleaseIdentity(args: {
  identity: RuntimeIdentityFields;
  db: DbProbeState;
  environment: string;
  now?: string;
}): ReleaseIdentity {
  const { identity, db, environment } = args;
  const str = (value: unknown, fallback: string): string =>
    typeof value === "string" ? value : fallback;
  return {
    releaseId: str(identity.releaseId, "UNKNOWN"),
    gitSha: str(identity.gitSha, "UNKNOWN"),
    repository: str(identity.repository, "unknown"),
    buildId: str(identity.buildId, "UNKNOWN"),
    deploymentId: str(identity.deploymentId, "UNKNOWN"),
    environment: str(identity.environment, environment),
    applicationVersion: str(identity.applicationVersion, "BEYU-OS/1.0.0"),
    runtimeVersion: str(identity.runtimeVersion, "BEYU-OS/1.0.0"),
    migrationFingerprint: db.migrationFingerprint,
    latestMigration: db.latestMigration,
    migrationCount: db.migrationCount,
    schemaFingerprint: db.schemaFingerprint,
    releaseTimestamp: str(identity.releaseTimestamp, args.now ?? new Date().toISOString()),
  };
}

/**
 * Derive the expectation compared against the running identity. A decisive
 * mismatch is encoded as the sentinel `"MISMATCH"` (unchanged from the
 * pre-repair behaviour) so the blocking `release_identity` check fails.
 */
export function deriveExpectedReleaseIdentity(args: {
  expectedGitSha: string | null;
  environment: string;
  identityMatches: boolean;
}): ExpectedReleaseIdentity {
  const base: ExpectedReleaseIdentity = args.expectedGitSha
    ? { gitSha: args.expectedGitSha, environment: args.environment }
    : { environment: args.environment };
  return args.identityMatches ? base : { ...base, gitSha: "MISMATCH" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fingerprint expectations (schema md5 vs ledger sha256 — kept separate)
// ─────────────────────────────────────────────────────────────────────────────

export type FingerprintExpectations = {
  /** Expected LEDGER sha256, or null when not supplied. */
  migrationFingerprint: string | null;
  /** Expected PHYSICAL-SCHEMA md5, or null when not supplied. */
  schemaFingerprint: string | null;
};

export type FingerprintExpectationResolution =
  | ({ ok: true } & FingerprintExpectations)
  | { ok: false; error: string };

/**
 * Resolve the two fingerprint expectations from CLI arguments.
 *
 * The legacy ambiguous flag is refused outright: reinterpreting it as either
 * quantity is precisely the defect this repair removes, and ignoring it would
 * silently drop a real integrity check.
 */
export function resolveFingerprintExpectations(args: {
  legacyAmbiguousFingerprint: string | null;
  expectedMigrationFingerprint: string | null;
  expectedSchemaFingerprint: string | null;
}): FingerprintExpectationResolution {
  if (args.legacyAmbiguousFingerprint !== null) {
    return {
      ok: false,
      error:
        `${LEGACY_AMBIGUOUS_FINGERPRINT_FLAG} is ambiguous and is no longer accepted. ` +
        `It previously routed a SCHEMA md5 into the MIGRATION-ledger expectation, which made ` +
        `database_migration_state and database_release_compatibility fail deterministically. ` +
        `Pass ${EXPECTED_MIGRATION_FINGERPRINT_FLAG} (ledger sha256 over ordered ` +
        `beyu_migrations.checksum values) and/or ${EXPECTED_SCHEMA_FINGERPRINT_FLAG} ` +
        `(physical schema md5) instead.`,
    };
  }
  return {
    ok: true,
    migrationFingerprint: args.expectedMigrationFingerprint,
    schemaFingerprint: args.expectedSchemaFingerprint,
  };
}

/**
 * Comparison result for one fingerprint expectation: `null` when no expectation
 * was supplied (the gate then reports it as informational), never `true` by
 * accident.
 */
export function fingerprintMatches(
  actual: string | null,
  expected: string | null,
): boolean | null {
  return expected !== null ? actual !== null && actual === expected : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PVG context assembly (the adapter's real output)
// ─────────────────────────────────────────────────────────────────────────────

export type SecurityEvidence = {
  rbac: boolean;
  abac: boolean;
  rls: boolean;
  capPostingLocked: boolean;
  noeliaBoundary: boolean;
};

export type EventEvidence = {
  outboxHealthy: boolean | null;
  chainIntact: boolean | null;
};

/**
 * Assemble the exact `runPvg` input the CLI uses. Pure: no network, no DB, no
 * clock beyond the caller-supplied identity timestamp.
 */
export function buildPvgContext(args: {
  releaseIdentity: ReleaseIdentity;
  expectedReleaseIdentity: ExpectedReleaseIdentity;
  environment: string;
  correlationId: string;
  traceId: string;
  db: DbProbeState;
  security: SecurityEvidence;
  events: EventEvidence;
  /** `/api/health` reports database UP AND `/api/health/live` answered. */
  runtimeHealthy: boolean;
  /**
   * Critical-application readiness — kept as its own input so this refactor
   * preserves the pre-repair wiring EXACTLY (`criticalReadiness` was fed from
   * the database-health probe alone, while `runtime_health` also required
   * liveness). Both gates remain blocking.
   */
  criticalReadiness: boolean;
  expectations: FingerprintExpectations;
  expectedMigrationCount: number | null;
  expectedLatestMigration: string | null;
}): PvgCheckContext {
  return {
    releaseIdentity: args.releaseIdentity,
    expectedReleaseIdentity: args.expectedReleaseIdentity,
    // Two independent expectations — never collapsed into one "fingerprint".
    expectedMigrationFingerprint: args.expectations.migrationFingerprint,
    expectedSchemaFingerprint: args.expectations.schemaFingerprint,
    expectedMigrationCount: args.expectedMigrationCount,
    expectedLatestMigration: args.expectedLatestMigration,
    environment: args.environment,
    correlationId: args.correlationId,
    traceId: args.traceId,
    dbConnected: args.db.connected,
    migrationCount: args.db.migrationCount,
    latestMigration: args.db.latestMigration,
    migrationFingerprint: args.db.migrationFingerprint,
    migrationFingerprintMatches: fingerprintMatches(
      args.db.migrationFingerprint,
      args.expectations.migrationFingerprint,
    ),
    schemaFingerprint: args.db.schemaFingerprint,
    schemaMatches: fingerprintMatches(
      args.db.schemaFingerprint,
      args.expectations.schemaFingerprint,
    ),
    runtimeHealth: args.runtimeHealthy,
    authzChecks: {
      rbac: args.security.rbac,
      abac: args.security.abac,
      rls: args.security.rls,
      capPostingLocked: args.security.capPostingLocked,
      noeliaBoundary: args.security.noeliaBoundary,
    },
    eventOutboxHealthy: args.events.outboxHealthy,
    eventChainIntact: args.events.chainIntact,
    criticalReadiness: args.criticalReadiness,
  };
}
