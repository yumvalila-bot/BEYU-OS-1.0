/**
 * BEYU OS — P4 PVG API (canonical)
 *
 * POST /api/v1/system/release/pvg
 *
 * Runs the Production Verification Gate against LIVE state and returns
 * structured evidence. P3 validated the PVG logic in DB-free mode; P4 probes
 * reality (database, migration ledger, schema fingerprint, security
 * invariants, event chain) and PERSISTS every run to `pvg_runs` — a PVG claim
 * that leaves no evidence row is not a governed verification.
 *
 * Guarded: platform:config.manage (promotion verification is control-plane
 * authority). PVG fails closed: "health returned 200" alone is NOT sufficient,
 * and a probe that cannot run is a failure, not a pass.
 */

import { z } from "zod";
import { apiOk, apiError, guarded } from "@/lib/api";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { runPvg } from "@/lib/release/pvg";
import { recordAudit } from "@/lib/audit";
import { probeLiveMigrationState, probeLiveSecurityState, probeLiveEventState } from "@/lib/release/live-pvg";
import { recordPvgRun } from "@/lib/release/store";

export const dynamic = "force-dynamic";

const PvgRequestSchema = z.object({
  expectedReleaseId: z.string().optional(),
  expectedGitSha: z.string().optional(),
  expectedMigrationFingerprint: z.string().optional(),
  expectedSchemaFingerprint: z.string().optional(),
  environment: z.string().optional(),
  correlationId: z.string().optional(),
});

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:config.manage",
      action: "system.release.pvg.run",
      audit: { objectType: "RELEASE" },
    },
    async (ctx) => {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        body = {};
      }

      const parsed = PvgRequestSchema.safeParse(body);
      if (!parsed.success) {
        return apiError("VALIDATION_FAILED", "Invalid PVG request", 422, ctx.traceId, parsed.error.issues);
      }

      const identity = getCurrentReleaseIdentity();
      const environment = parsed.data.environment ?? identity.environment;

      // ── Live probes (P4). No hard-coded PASS. ─────────────────────────────
      const [dbState, security, events] = await Promise.all([
        probeLiveMigrationState(),
        probeLiveSecurityState(),
        probeLiveEventState(),
      ]);

      const expectedFingerprint = parsed.data.expectedMigrationFingerprint ?? null;
      const pvgResult = await runPvg({
        releaseIdentity: identity,
        expectedReleaseIdentity: {
          releaseId: parsed.data.expectedReleaseId,
          gitSha: parsed.data.expectedGitSha,
        },
        expectedMigrationFingerprint: expectedFingerprint,
        expectedSchemaFingerprint: parsed.data.expectedSchemaFingerprint,
        environment,
        correlationId: parsed.data.correlationId ?? ctx.traceId,
        traceId: ctx.traceId,
        dbConnected: dbState.connected,
        migrationCount: dbState.migrationCount,
        latestMigration: dbState.latestMigration,
        migrationFingerprint: dbState.migrationFingerprint,
        migrationFingerprintMatches: expectedFingerprint
          ? dbState.migrationFingerprint !== null && dbState.migrationFingerprint === expectedFingerprint
          : null,
        schemaFingerprint: dbState.schemaFingerprint,
        schemaMatches: parsed.data.expectedSchemaFingerprint
          ? dbState.schemaFingerprint === parsed.data.expectedSchemaFingerprint
          : null,
        runtimeHealth: dbState.connected,
        authzChecks: {
          rbac: security.rbac,
          abac: security.abac,
          rls: security.rls,
          capPostingLocked: security.capPostingLocked,
          noeliaBoundary: security.noeliaBoundary,
        },
        eventOutboxHealthy: events.outboxHealthy,
        eventChainIntact: events.chainIntact,
        criticalReadiness: dbState.connected,
      });

      // ── Persist the run (append-only evidence; idempotent on run id) ──────
      const runId = await recordPvgRun(pvgResult, {
        correlationId: parsed.data.correlationId ?? ctx.traceId,
        traceId: ctx.traceId,
        actorId: ctx.principal.userId,
      });

      // Audit PVG run (reuses existing audit_log — no competing trail)
      await recordAudit({
        tenantId: null,
        actorUserId: ctx.principal.userId,
        action: pvgResult.status === "PASS" ? "RELEASE_PVG_PASSED" : "RELEASE_PVG_FAILED",
        objectType: "RELEASE",
        objectId: identity.releaseId,
        outcome: pvgResult.status === "PASS" ? "SUCCESS" : "FAILURE",
        reason: pvgResult.status === "PASS" ? "PVG passed" : pvgResult.blockingFailures.join("; "),
        newValue: {
          runId,
          releaseId: pvgResult.releaseId,
          status: pvgResult.status,
          blockingFailures: pvgResult.blockingFailures,
          checks: pvgResult.checks.map((c) => ({ check: c.check, passed: c.passed, blocking: c.blocking })),
          correlationId: pvgResult.correlationId,
          traceId: pvgResult.traceId,
        },
        traceId: ctx.traceId,
      });

      if (pvgResult.status === "FAIL") {
        return apiOk(
          {
            status: "FAIL",
            runId,
            releaseId: pvgResult.releaseId,
            blockingFailures: pvgResult.blockingFailures,
            failureReason: pvgResult.checks
              .filter((c) => !c.passed && c.blocking)
              .map((c) => `${c.check}: ${c.failureReason}`)
              .join("; "),
            pvgResult,
          },
          ctx.traceId,
          200,
        );
      }

      return apiOk({ status: "PASS", runId, pvgResult }, ctx.traceId);
    },
  );
}
