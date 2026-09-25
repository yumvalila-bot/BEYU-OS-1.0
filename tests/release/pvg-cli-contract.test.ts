/**
 * BEYU OS — PVG CLI adapter contract regression suite (DB-free, network-free).
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Two adapter defects reached production and made the Production Verification
 * Gate fail for EVERY release (`PVG: release_identity |
 * database_migration_state | database_release_compatibility` on 5/5 pushes):
 *
 *   PVG-1 — IDENTITY NESTING. `scripts/release/pvg-cli.ts` read the identity
 *           tuple from the RESPONSE ROOT (`body.gitSha`, …). The canonical
 *           producer `src/app/api/health/identity/route.ts` returns the tuple
 *           NESTED under `identity` (`{ ok, system, identity, at }`, the shape
 *           of `RuntimeIdentityResponse`). Every field therefore resolved to
 *           `"UNKNOWN"`, the convergence loop burned its whole 12-minute window
 *           and `release_identity` failed decisively.
 *
 *   PVG-2 — FINGERPRINT QUANTITY. The workflow routed the PHYSICAL-SCHEMA md5
 *           (`scripts/db-release.ts` → `fingerprint`) into the MIGRATION-ledger
 *           expectation. A schema md5 can never equal a ledger sha256, so both
 *           `database_migration_state` and `database_release_compatibility`
 *           failed deterministically.
 *
 * The pre-existing suite could not catch either: `tests/release/pvg.test.ts`
 * injects an already-built context straight into `runPvg()`, and
 * `tests/architecture/p4-release-control.test.ts` asserts source text without
 * ever executing the adapter. This suite drives the REAL adapter path instead:
 *
 *   HTTP identity envelope → extractRuntimeIdentity → buildReleaseIdentity
 *     → buildPvgContext → runPvg
 *
 * The adapter's decision logic lives in `src/lib/release/pvg-cli-contract.ts`
 * so it is reachable from a test without probing production or writing the
 * release ledger.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runPvg, isPvgPass } from "@/lib/release/pvg";
import { migrationFingerprintFromChecksums } from "@/lib/release/migration-fingerprint";
import {
  EXPECTED_MIGRATION_FINGERPRINT_FLAG,
  EXPECTED_SCHEMA_FINGERPRINT_FLAG,
  LEGACY_AMBIGUOUS_FINGERPRINT_FLAG,
  buildPvgContext,
  buildReleaseIdentity,
  deriveExpectedReleaseIdentity,
  extractRuntimeIdentity,
  fingerprintMatches,
  releaseIdentityMatches,
  resolveFingerprintExpectations,
  runningGitShaLabel,
  runningGitShaMatches,
  runtimeIdentityOk,
} from "@/lib/release/pvg-cli-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — shaped exactly like the canonical producer
// (src/app/api/health/identity/route.ts → RuntimeIdentityResponse)
// ─────────────────────────────────────────────────────────────────────────────

const RELEASED_SHA = "0e9754dfb3445ca190a420efe9f54cab12800c95";
const RUNNING_SHA_OTHER = "aaaaaaaabbbbccccddddeeeeffff000011112222";
const ENVIRONMENT = "production";
const LATEST_MIGRATION = "0090_pvg_contract_repair";
const MIGRATION_COUNT = 90;

/** Canonical LEDGER sha256 — computed by the canonical implementation. */
const LEDGER_FINGERPRINT = migrationFingerprintFromChecksums([
  "checksum-a",
  "checksum-b",
  "checksum-c",
]) as string;

/** Physical-schema md5 (public schema) — a DIFFERENT quantity, by design. */
const SCHEMA_FINGERPRINT_MD5 = "1c8f4a0d2e6b79c3f5a1d0e4b8c27f93";

/** The canonical envelope `GET /api/health/identity` serves. */
function identityEnvelope(identity: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ok: true,
    system: "BEYU-OS/1.0.0",
    identity: {
      releaseId: "REL-2026-09-25-001",
      gitSha: RELEASED_SHA,
      repository: "yumvalila-bot/BEYU-OS-1.0",
      buildId: "BUILD-001",
      deploymentId: "DEPLOY-001",
      environment: ENVIRONMENT,
      applicationVersion: "BEYU-OS/1.0.0",
      runtimeVersion: "BEYU-OS/1.0.0",
      schemaVersion: null,
      migrationFingerprint: LEDGER_FINGERPRINT,
      latestMigration: LATEST_MIGRATION,
      releaseTimestamp: "2026-09-25T07:00:00.000Z",
      ...identity,
    },
    at: "2026-09-25T07:00:01.000Z",
  };
}

/** The FLAT body the pre-repair adapter assumed (never served by production). */
function flatIdentityBody(): Record<string, unknown> {
  return {
    releaseId: "REL-2026-09-25-001",
    gitSha: RELEASED_SHA,
    buildId: "BUILD-001",
    deploymentId: "DEPLOY-001",
    environment: ENVIRONMENT,
  };
}

/** The live ledger/schema state the production probes return on a good day. */
const GOOD_DB_STATE = {
  connected: true,
  migrationCount: MIGRATION_COUNT,
  latestMigration: LATEST_MIGRATION,
  migrationFingerprint: LEDGER_FINGERPRINT,
  schemaFingerprint: SCHEMA_FINGERPRINT_MD5,
};

const GOOD_SECURITY = {
  rbac: true,
  abac: true,
  rls: true,
  capPostingLocked: true,
  noeliaBoundary: true,
};

const GOOD_EVENTS = { outboxHealthy: true, chainIntact: true };

/** Assemble the exact `runPvg` context the CLI builds, from an HTTP body. */
function contextFromBody(
  body: unknown,
  expectations: { migrationFingerprint: string | null; schemaFingerprint: string | null },
) {
  const identity = extractRuntimeIdentity(body);
  const identityOk = runtimeIdentityOk(true, identity);
  const releaseIdentity = buildReleaseIdentity({
    identity,
    db: GOOD_DB_STATE,
    environment: ENVIRONMENT,
  });
  return buildPvgContext({
    releaseIdentity,
    expectedReleaseIdentity: deriveExpectedReleaseIdentity({
      expectedGitSha: RELEASED_SHA,
      environment: ENVIRONMENT,
      identityMatches: releaseIdentityMatches({
        identityOk,
        actualGitSha: identity.gitSha,
        expectedGitSha: RELEASED_SHA,
      }),
    }),
    environment: ENVIRONMENT,
    correlationId: "pvg-test",
    traceId: "pvg-test",
    db: GOOD_DB_STATE,
    security: GOOD_SECURITY,
    events: GOOD_EVENTS,
    runtimeHealthy: true,
    criticalReadiness: true,
    expectations,
    expectedMigrationCount: MIGRATION_COUNT,
    expectedLatestMigration: LATEST_MIGRATION,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A. Identity envelope extraction — PVG-1 (strict nesting)
// ─────────────────────────────────────────────────────────────────────────────

describe("A. identity envelope (PVG-1, strict nesting)", () => {
  it("reads the canonical NESTED envelope", () => {
    const identity = extractRuntimeIdentity(identityEnvelope());
    expect(identity.gitSha).toBe(RELEASED_SHA);
    expect(identity.releaseId).toBe("REL-2026-09-25-001");
    expect(identity.environment).toBe(ENVIRONMENT);
  });

  it("REFUSES a flat/naked body — no permissive root fallback", () => {
    // This is the exact pre-repair assumption. Accepting it as a substitute for
    // the canonical envelope would let an endpoint contract change pass the gate
    // on the wrong fields, so it must resolve to "no identity".
    expect(extractRuntimeIdentity(flatIdentityBody())).toEqual({});
  });

  it("rejects non-object, array and null-nested shapes", () => {
    expect(extractRuntimeIdentity(null)).toEqual({});
    expect(extractRuntimeIdentity("body")).toEqual({});
    expect(extractRuntimeIdentity(42)).toEqual({});
    expect(extractRuntimeIdentity({ ok: true, identity: null })).toEqual({});
    expect(extractRuntimeIdentity({ ok: true, identity: ["x"] })).toEqual({});
    expect(extractRuntimeIdentity({ ok: true, identity: "x" })).toEqual({});
  });

  it("requires a 2xx response AND both mandatory string fields", () => {
    const good = extractRuntimeIdentity(identityEnvelope());
    expect(runtimeIdentityOk(true, good)).toBe(true);
    expect(runtimeIdentityOk(false, good)).toBe(false);
    expect(runtimeIdentityOk(true, extractRuntimeIdentity({ ok: true, identity: { releaseId: "R" } }))).toBe(false);
    expect(runtimeIdentityOk(true, extractRuntimeIdentity({ ok: true, identity: { gitSha: RELEASED_SHA } }))).toBe(false);
  });

  it("REGRESSION PVG-1: a flat read degrades identity to UNKNOWN", () => {
    const flat = buildReleaseIdentity({
      identity: extractRuntimeIdentity(flatIdentityBody()),
      db: GOOD_DB_STATE,
      environment: ENVIRONMENT,
    });
    // Documented failure mode: the sentinel then forces the decisive mismatch.
    expect(flat.gitSha).toBe("UNKNOWN");
    expect(flat.releaseId).toBe("UNKNOWN");
    expect(flat.deploymentId).toBe("UNKNOWN");

    const nested = buildReleaseIdentity({
      identity: extractRuntimeIdentity(identityEnvelope()),
      db: GOOD_DB_STATE,
      environment: ENVIRONMENT,
    });
    expect(nested.gitSha).toBe(RELEASED_SHA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B. Convergence predicate
// ─────────────────────────────────────────────────────────────────────────────

describe("B. running-git-sha convergence predicate", () => {
  it("matches identical and short/full prefix forms (both directions)", () => {
    expect(runningGitShaMatches(RELEASED_SHA, RELEASED_SHA)).toBe(true);
    expect(runningGitShaMatches(RELEASED_SHA.slice(0, 8), RELEASED_SHA)).toBe(true);
    expect(runningGitShaMatches(RELEASED_SHA, RELEASED_SHA.slice(0, 8))).toBe(true);
  });

  it("does not match a different commit, a missing expectation or a non-string", () => {
    expect(runningGitShaMatches(RUNNING_SHA_OTHER, RELEASED_SHA)).toBe(false);
    expect(runningGitShaMatches(RELEASED_SHA, null)).toBe(false);
    expect(runningGitShaMatches(undefined, RELEASED_SHA)).toBe(false);
  });

  it("labels the running sha for convergence logging", () => {
    expect(runningGitShaLabel(extractRuntimeIdentity(identityEnvelope()))).toBe(RELEASED_SHA.slice(0, 8));
    expect(runningGitShaLabel({})).toBe("unavailable");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C. Release-identity verdict and the MISMATCH sentinel
// ─────────────────────────────────────────────────────────────────────────────

describe("C. release identity verdict", () => {
  it("is decisive: an unusable identity always fails", () => {
    expect(
      releaseIdentityMatches({ identityOk: false, actualGitSha: RELEASED_SHA, expectedGitSha: RELEASED_SHA }),
    ).toBe(false);
  });

  it("asserts only that production served an identity when no sha is expected", () => {
    expect(releaseIdentityMatches({ identityOk: true, actualGitSha: RELEASED_SHA, expectedGitSha: null })).toBe(true);
    expect(releaseIdentityMatches({ identityOk: false, actualGitSha: null, expectedGitSha: null })).toBe(false);
  });

  it("encodes a decisive mismatch as the MISMATCH sentinel", () => {
    const failed = deriveExpectedReleaseIdentity({
      expectedGitSha: RELEASED_SHA,
      environment: ENVIRONMENT,
      identityMatches: false,
    });
    expect(failed.gitSha).toBe("MISMATCH");

    const passed = deriveExpectedReleaseIdentity({
      expectedGitSha: RELEASED_SHA,
      environment: ENVIRONMENT,
      identityMatches: true,
    });
    expect(passed.gitSha).toBe(RELEASED_SHA);
    expect(passed.environment).toBe(ENVIRONMENT);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D. Release-identity assembly — the two DB quantities land in their own slots
// ─────────────────────────────────────────────────────────────────────────────

describe("D. release identity assembly", () => {
  it("carries the ledger sha256 and the schema md5 in SEPARATE slots", () => {
    const identity = buildReleaseIdentity({
      identity: extractRuntimeIdentity(identityEnvelope()),
      db: GOOD_DB_STATE,
      environment: ENVIRONMENT,
    });
    expect(identity.migrationFingerprint).toBe(LEDGER_FINGERPRINT);
    expect(identity.schemaFingerprint).toBe(SCHEMA_FINGERPRINT_MD5);
    expect(identity.migrationFingerprint).not.toBe(identity.schemaFingerprint);
    expect(identity.migrationCount).toBe(MIGRATION_COUNT);
    expect(identity.latestMigration).toBe(LATEST_MIGRATION);
  });

  it("degrades missing fields to explicit placeholders, never plausible values", () => {
    const identity = buildReleaseIdentity({
      identity: {},
      db: { ...GOOD_DB_STATE, migrationCount: null, latestMigration: null, migrationFingerprint: null, schemaFingerprint: null },
      environment: ENVIRONMENT,
      now: "2026-09-25T00:00:00.000Z",
    });
    expect(identity.releaseId).toBe("UNKNOWN");
    expect(identity.gitSha).toBe("UNKNOWN");
    expect(identity.repository).toBe("unknown");
    expect(identity.buildId).toBe("UNKNOWN");
    expect(identity.deploymentId).toBe("UNKNOWN");
    expect(identity.environment).toBe(ENVIRONMENT);
    expect(identity.applicationVersion).toBe("BEYU-OS/1.0.0");
    expect(identity.runtimeVersion).toBe("BEYU-OS/1.0.0");
    expect(identity.releaseTimestamp).toBe("2026-09-25T00:00:00.000Z");
    expect(identity.migrationFingerprint).toBeNull();
    expect(identity.schemaFingerprint).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// E. Fingerprint expectations — PVG-2 (refuse the ambiguous flag)
// ─────────────────────────────────────────────────────────────────────────────

describe("E. fingerprint expectations (PVG-2)", () => {
  it("REFUSES the legacy ambiguous flag instead of reinterpreting it", () => {
    const resolved = resolveFingerprintExpectations({
      legacyAmbiguousFingerprint: SCHEMA_FINGERPRINT_MD5,
      expectedMigrationFingerprint: null,
      expectedSchemaFingerprint: null,
    });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) throw new Error("unreachable");
    // The refusal must name the flag and both replacements: a dropped check is
    // never an acceptable outcome, and neither is a silent reinterpretation.
    expect(resolved.error).toContain(LEGACY_AMBIGUOUS_FINGERPRINT_FLAG);
    expect(resolved.error).toContain(EXPECTED_MIGRATION_FINGERPRINT_FLAG);
    expect(resolved.error).toContain(EXPECTED_SCHEMA_FINGERPRINT_FLAG);
    expect(resolved.error).toContain("ambiguous");
  });

  it("treats an empty-string legacy value as supplied (never as 'absent')", () => {
    const resolved = resolveFingerprintExpectations({
      legacyAmbiguousFingerprint: "",
      expectedMigrationFingerprint: null,
      expectedSchemaFingerprint: null,
    });
    // `flagValueRequired` turns an empty value into a config error BEFORE this
    // point; the contract itself must still refuse rather than accept "".
    expect(resolved.ok).toBe(false);
  });

  it("resolves the two flags into two distinct quantities", () => {
    const resolved = resolveFingerprintExpectations({
      legacyAmbiguousFingerprint: null,
      expectedMigrationFingerprint: LEDGER_FINGERPRINT,
      expectedSchemaFingerprint: SCHEMA_FINGERPRINT_MD5,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.migrationFingerprint).toBe(LEDGER_FINGERPRINT);
    expect(resolved.schemaFingerprint).toBe(SCHEMA_FINGERPRINT_MD5);
  });

  it("leaves both expectations null when no flag is supplied", () => {
    const resolved = resolveFingerprintExpectations({
      legacyAmbiguousFingerprint: null,
      expectedMigrationFingerprint: null,
      expectedSchemaFingerprint: null,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) throw new Error("unreachable");
    expect(resolved.migrationFingerprint).toBeNull();
    expect(resolved.schemaFingerprint).toBeNull();
  });

  it("fingerprintMatches: null means 'not evaluated', never an accidental pass", () => {
    expect(fingerprintMatches(LEDGER_FINGERPRINT, null)).toBeNull();
    expect(fingerprintMatches(null, null)).toBeNull();
    // An expectation with no live value is a FAILURE, not an informational pass.
    expect(fingerprintMatches(null, LEDGER_FINGERPRINT)).toBe(false);
    expect(fingerprintMatches(LEDGER_FINGERPRINT, LEDGER_FINGERPRINT)).toBe(true);
    expect(fingerprintMatches(SCHEMA_FINGERPRINT_MD5, LEDGER_FINGERPRINT)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// F. Context assembly — the adapter's real output
// ─────────────────────────────────────────────────────────────────────────────

describe("F. PVG context assembly", () => {
  it("never cross-compares the migration ledger with the schema md5", () => {
    const ctx = contextFromBody(identityEnvelope(), {
      migrationFingerprint: LEDGER_FINGERPRINT,
      schemaFingerprint: SCHEMA_FINGERPRINT_MD5,
    });
    expect(ctx.expectedMigrationFingerprint).toBe(LEDGER_FINGERPRINT);
    expect(ctx.expectedSchemaFingerprint).toBe(SCHEMA_FINGERPRINT_MD5);
    // ledger vs ledger, md5 vs md5
    expect(ctx.migrationFingerprintMatches).toBe(true);
    expect(ctx.schemaMatches).toBe(true);
  });

  it("FAILS the migration expectation when a schema md5 is routed into it", () => {
    // Reproduces PVG-2 in isolation: the md5 is supplied as the migration
    // expectation, exactly as the pre-repair workflow did.
    const ctx = contextFromBody(identityEnvelope(), {
      migrationFingerprint: SCHEMA_FINGERPRINT_MD5,
      schemaFingerprint: null,
    });
    expect(ctx.migrationFingerprintMatches).toBe(false);
    expect(ctx.migrationFingerprint).toBe(LEDGER_FINGERPRINT);
  });

  it("keeps runtimeHealth and criticalReadiness as separate inputs", () => {
    const base = {
      releaseIdentity: buildReleaseIdentity({
        identity: extractRuntimeIdentity(identityEnvelope()),
        db: GOOD_DB_STATE,
        environment: ENVIRONMENT,
      }),
      expectedReleaseIdentity: { gitSha: RELEASED_SHA, environment: ENVIRONMENT },
      environment: ENVIRONMENT,
      correlationId: "c",
      traceId: "t",
      db: GOOD_DB_STATE,
      security: GOOD_SECURITY,
      events: GOOD_EVENTS,
      expectations: { migrationFingerprint: LEDGER_FINGERPRINT, schemaFingerprint: SCHEMA_FINGERPRINT_MD5 },
      expectedMigrationCount: MIGRATION_COUNT,
      expectedLatestMigration: LATEST_MIGRATION,
    };
    // Pre-repair wiring preserved exactly: liveness feeds runtime_health only,
    // while critical readiness is fed by the database-health probe alone.
    const ctx = buildPvgContext({ ...base, runtimeHealthy: true, criticalReadiness: false });
    expect(ctx.runtimeHealth).toBe(true);
    expect(ctx.criticalReadiness).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G. End-to-end through the REAL gate — the regression that was missing
// ─────────────────────────────────────────────────────────────────────────────

describe("G. end-to-end through runPvg (real adapter path)", () => {
  it("PASSES with the canonical nested envelope and two correctly-routed fingerprints", async () => {
    const result = await runPvg(
      contextFromBody(identityEnvelope(), {
        migrationFingerprint: LEDGER_FINGERPRINT,
        schemaFingerprint: SCHEMA_FINGERPRINT_MD5,
      }),
    );
    expect(result.blockingFailures).toEqual([]);
    expect(isPvgPass(result)).toBe(true);
    expect(result.status).toBe("PASS");
    expect(result.commitSha).toBe(RELEASED_SHA);
  });

  it("REGRESSION: the pre-repair wiring reproduces the exact live production annotation", async () => {
    // Pre-repair behaviour = flat identity read + the schema md5 in the
    // migration slot + no schema expectation. This is what ran in production.
    const identity = extractRuntimeIdentity(flatIdentityBody());
    const releaseIdentity = buildReleaseIdentity({ identity, db: GOOD_DB_STATE, environment: ENVIRONMENT });
    const ctx = buildPvgContext({
      releaseIdentity,
      expectedReleaseIdentity: deriveExpectedReleaseIdentity({
        expectedGitSha: RELEASED_SHA,
        environment: ENVIRONMENT,
        identityMatches: releaseIdentityMatches({
          identityOk: runtimeIdentityOk(true, identity),
          actualGitSha: identity.gitSha,
          expectedGitSha: RELEASED_SHA,
        }),
      }),
      environment: ENVIRONMENT,
      correlationId: "pvg-test",
      traceId: "pvg-test",
      db: GOOD_DB_STATE,
      security: GOOD_SECURITY,
      events: GOOD_EVENTS,
      runtimeHealthy: true,
      criticalReadiness: true,
      expectations: { migrationFingerprint: SCHEMA_FINGERPRINT_MD5, schemaFingerprint: null },
      expectedMigrationCount: MIGRATION_COUNT,
      expectedLatestMigration: LATEST_MIGRATION,
    });

    const result = await runPvg(ctx);
    // Exactly the three gates the production check-run annotation reported.
    expect(result.blockingFailures).toEqual([
      "release_identity",
      "database_migration_state",
      "database_release_compatibility",
    ]);
    expect(result.status).toBe("FAIL");
  });

  it("still fails when the running commit is not the released commit", async () => {
    const result = await runPvg(
      contextFromBody(identityEnvelope({ gitSha: RUNNING_SHA_OTHER }), {
        migrationFingerprint: LEDGER_FINGERPRINT,
        schemaFingerprint: SCHEMA_FINGERPRINT_MD5,
      }),
    );
    expect(result.blockingFailures).toContain("release_identity");
    expect(result.status).toBe("FAIL");
  });

  it("still fails when the live ledger does not match the released ledger", async () => {
    const otherLedger = migrationFingerprintFromChecksums(["checksum-a", "checksum-b"]) as string;
    const result = await runPvg(
      contextFromBody(identityEnvelope(), {
        migrationFingerprint: otherLedger,
        schemaFingerprint: SCHEMA_FINGERPRINT_MD5,
      }),
    );
    expect(result.blockingFailures).toContain("database_migration_state");
    expect(result.blockingFailures).toContain("database_release_compatibility");
    expect(result.status).toBe("FAIL");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// H. Canonical fingerprint implementation and pipeline plumbing
// ─────────────────────────────────────────────────────────────────────────────

describe("H. canonical migration-ledger fingerprint", () => {
  it("is null for an absent or empty ledger — 'no ledger' is never a hash", () => {
    expect(migrationFingerprintFromChecksums(null)).toBeNull();
    expect(migrationFingerprintFromChecksums(undefined)).toBeNull();
    expect(migrationFingerprintFromChecksums([])).toBeNull();
  });

  it("hashes the ordered checksums joined by a newline (independent check)", () => {
    const expected = createHash("sha256").update("a\nb\nc").digest("hex");
    expect(migrationFingerprintFromChecksums(["a", "b", "c"])).toBe(expected);
  });

  it("is order-sensitive and deterministic", () => {
    const abc = migrationFingerprintFromChecksums(["a", "b", "c"]);
    const cba = migrationFingerprintFromChecksums(["c", "b", "a"]);
    expect(abc).not.toBe(cba);
    expect(migrationFingerprintFromChecksums(["a", "b", "c"])).toBe(abc);
    expect(migrationFingerprintFromChecksums(["only-one"])).toBe(
      createHash("sha256").update("only-one").digest("hex"),
    );
  });
});

describe("H2. pipeline plumbing (workflow + adapter source)", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/db-release.yml", import.meta.url), "utf8");
  const cli = readFileSync(new URL("../../scripts/release/pvg-cli.ts", import.meta.url), "utf8");
  const dbRelease = readFileSync(new URL("../../scripts/db-release.ts", import.meta.url), "utf8");
  const livePvg = readFileSync(new URL("../../src/lib/release/live-pvg.ts", import.meta.url), "utf8");
  const migrate = readFileSync(new URL("../../scripts/migrate.ts", import.meta.url), "utf8");

  /** Extract one workflow block, from `startMarker` up to `endMarker`. */
  const block = (source: string, startMarker: string, endMarker: string): string => {
    const start = source.indexOf(startMarker);
    expect(start).toBeGreaterThan(-1);
    const tail = source.slice(start);
    const end = tail.indexOf(endMarker);
    expect(end).toBeGreaterThan(-1);
    return tail.slice(0, end);
  };

  /** The PVG invocation block only — other jobs legitimately use the md5 flag. */
  const pvgStep = block(workflow, "Run PVG against production", "Upload PVG evidence");

  it("routes each fingerprint to its own flag (never the reverse)", () => {
    expect(pvgStep).toContain(`${EXPECTED_MIGRATION_FINGERPRINT_FLAG} "$EXPECTED_MIGRATION_FINGERPRINT"`);
    expect(pvgStep).toContain(`${EXPECTED_SCHEMA_FINGERPRINT_FLAG} "$EXPECTED_SCHEMA_FINGERPRINT"`);
    expect(pvgStep).toContain("EXPECTED_MIGRATION_FINGERPRINT: ${{ needs.preflight-repo.outputs.ledger-fingerprint }}");
    expect(pvgStep).toContain("EXPECTED_SCHEMA_FINGERPRINT: ${{ needs.preflight-repo.outputs.expected-fingerprint }}");
  });

  it("never passes the legacy ambiguous flag to the PVG CLI", () => {
    expect(pvgStep).not.toContain(LEGACY_AMBIGUOUS_FINGERPRINT_FLAG);
    expect(cli).not.toContain(`"${LEGACY_AMBIGUOUS_FINGERPRINT_FLAG}"`);
  });

  it("captures the ledger fingerprint from the canonical db-release output", () => {
    expect(workflow).toContain(`ledger-fingerprint=$(jq -r '.ledgerFingerprint' preflight-state.json)`);
    expect(workflow).toContain("ledger-fingerprint: ${{ steps.capture.outputs.ledger-fingerprint }}");
  });

  it("keeps the schema md5 flowing to db-release verify/drift (unchanged consumers)", () => {
    // The schema md5 must keep feeding the consumers that ARE schema-shaped.
    const schemaExpectation = '--expected-fingerprint "${{ needs.preflight-repo.outputs.expected-fingerprint }}"';
    const verifyStep = block(workflow, "Verify schema fingerprint", "Upload deployment verification evidence");
    expect(verifyStep).toContain("scripts/db-release.ts verify");
    expect(verifyStep).toContain(schemaExpectation);

    const driftStep = block(workflow, "Report drift (repository vs production)", "Upload drift report");
    expect(driftStep).toContain("scripts/db-release.ts drift");
    expect(driftStep).toContain(schemaExpectation);
  });

  it("emits ledgerFingerprint from the ONE canonical implementation", () => {
    expect(dbRelease).toContain('from "../src/lib/release/migration-fingerprint"');
    expect(dbRelease).toContain("ledgerFingerprint: migrationFingerprintFromChecksums(applied.map((a) => a.checksum))");
    // `applied` must be ordered by version — the canonical order the live probe uses.
    expect(dbRelease).toContain("from beyu_migrations order by version");
  });

  it("keeps the CLI reading the NESTED envelope and building the context via the contract", () => {
    expect(cli).toContain("extractRuntimeIdentity(identityRes.body)");
    expect(cli).toContain("buildPvgContext({");
    expect(cli).toContain("resolveFingerprintExpectations({");
    // The pre-repair flat reads must not come back.
    expect(cli).not.toMatch(/\bidentityBody\b/);
  });

  it("computes the ledger fingerprint from the ordered array (same order as db-release)", () => {
    expect(livePvg).toContain("array_agg(checksum order by version)");
    expect(livePvg).toContain("migrationFingerprintFromChecksums(row.checksums)");
    // The pre-repair probe expression must not come back. (The module header
    // mentions it in prose, so assert the exact SQL phrase, not the bare name.)
    expect(livePvg).not.toContain("string_agg(checksum, '\\n' order by version) as checksums");
  });

  it("keeps the three physical-schema md5 aggregates byte-equivalent", () => {
    // The schema expectation is only safe because `db-release drift` (the
    // producer of --expected-schema-fingerprint) and the live PVG probe compute
    // the SAME aggregate. Whitespace differences are irrelevant to SQL; string
    // differences are not.
    const normalize = (source: string): string => {
      const start = source.indexOf("md5(string_agg(item");
      expect(start).toBeGreaterThan(-1);
      const end = source.indexOf(") s", start);
      expect(end).toBeGreaterThan(-1);
      return source.slice(start - "select ".length, end + ") s".length).replace(/\s+/g, "");
    };
    const [live, release, migration] = [normalize(livePvg), normalize(dbRelease), normalize(migrate)];
    expect(release).toBe(live);
    expect(migration).toBe(live);
  });
});
