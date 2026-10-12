/**
 * GET /api/health/schema — live schema-compatibility diagnostic (read-only).
 *
 * WHY THIS ENDPOINT EXISTS
 *   On 2026-10-12 the repository's audit established a production failure state
 *   that no existing probe could see: the deployed artifact required a database
 *   migration that had not been applied (the production database-release gate
 *   had been failing since 2026-10-10, and production migrations are now
 *   explicit-only by design — PR #104 / D-6). In that state:
 *
 *     GET /api/health          → 200 { "database": "UP" }   (readiness is a
 *                                                            table-less select 1)
 *     GET /  (no session)       → 200                        (the sign-in page
 *                                                            never queries the
 *                                                            database without a
 *                                                            session cookie)
 *     POST /api/v1/auth/login  → 200 + session cookie        (sign-in SUCCEEDS)
 *     every view AFTER sign-in → 500 → the route error boundary
 *                                 ("BEYU OS could not load this view")
 *
 *   The operator was therefore told the system was healthy while every
 *   authenticated user was locked out of every view, and the user-facing screen
 *   attributed it to permissions. This probe answers the one question that
 *   distinguishes those states — "does this database have the schema the
 *   running code expects?" — using the canonical migration ledger and the
 *   build-time release identity. It adds no registry, no policy and no gate.
 *
 * CONTRACT
 *   • Unauthenticated and information-free, exactly like /api/health and
 *     /api/health/identity: no session, no tenant, no principal, no tenant data
 *     is read or required. The reply carries only the migration state, two
 *     public migration tags from the repository's own ledger, a row count and a
 *     latency. No credential, DSN, hostname, username or driver message is ever
 *     emitted — the probe discards its errors.
 *   • The response status is ALWAYS 200 when the probe itself answered, and the
 *     state is carried in the body. It is deliberately NOT a readiness signal:
 *     /api/health/live documents why a readiness probe used as a liveness probe
 *     turns a database incident into a restart loop, and wiring a new probe into
 *     an orchestrator is a human decision about this deployment, not something
 *     this route may assume.
 *   • `state: "BEHIND"` means the database is missing at least one migration the
 *     running artifact expects. The remediation is to apply the canonical
 *     migrations through the governed database-release path — never to widen a
 *     grant, disable RLS or bypass a gate. This endpoint grants nothing and is
 *     never an authorization input: `can()`, `evaluatePolicy()`, RLS and every
 *     destination guard are unchanged by it.
 *   • `state: "UNKNOWN"` is the honest answer when the ledger cannot be read or
 *     the artifact does not know which migration it expects. It is never
 *     reported as CURRENT.
 */
import { SYSTEM_VERSION } from "@/lib/constants";
import { newId, ID_PREFIX } from "@/lib/ids";
import { probeSchemaState } from "@/lib/health/schema-state";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  const assessment = await probeSchemaState();
  const body = {
    ok: true,
    system: SYSTEM_VERSION,
    checks: {
      /** The state of the DATABASE's schema relative to the RUNNING artifact. */
      schema: assessment.state,
    },
    schema: {
      // Closed vocabulary (SCHEMA_STATES); asserted by the regression suite.
      state: assessment.state,
      appliedMigration: assessment.appliedMigration,
      appliedCount: assessment.appliedCount,
      expectedMigration: assessment.expectedMigration,
    },
    latencyMs: Date.now() - startedAt,
  };

  /**
   * ONE structured line when — and only when — the running code and the
   * database disagree. A healthy deployment stays silent; a behind (or ahead)
   * schema is written to the platform log drain with the trace id, so the
   * condition is visible without a human having to poll the endpoint. The
   * payload is the same non-secret fact set the response carries.
   */
  if (assessment.state !== "CURRENT") {
    console.error(
      JSON.stringify({
        event: "schema_state_probe",
        timestamp: new Date().toISOString(),
        traceId: newId(ID_PREFIX.event),
        environment: process.env.BEYU_ENV ?? process.env.NODE_ENV ?? "unknown",
        state: assessment.state,
        appliedMigration: assessment.appliedMigration,
        expectedMigration: assessment.expectedMigration,
      }),
    );
  }

  return Response.json(body);
}
