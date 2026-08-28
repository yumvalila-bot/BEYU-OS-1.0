import { SYSTEM_VERSION } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Process liveness probe.
 *
 * WHY THIS IS SEPARATE FROM /api/health
 *   `/api/health` is a READINESS probe: it returns 503 when the database cannot
 *   be reached, so an orchestrator stops routing traffic to an instance that
 *   cannot serve requests. That is correct for readiness and wrong for liveness.
 *
 *   If an orchestrator uses a readiness probe as a liveness probe, a database
 *   outage makes every healthy application instance report "dead", and the
 *   orchestrator restarts them all — turning a database incident into a
 *   cascading restart loop that also destroys the warm connection pool exactly
 *   when the database recovers. BEYU OS must fail CLOSED and QUIET during a
 *   database outage, not thrash.
 *
 *   This endpoint therefore answers one question only — "is this process able to
 *   handle requests?" — and deliberately performs no I/O, no database query and
 *   no dependency check. It is information-free for the same reason as
 *   `/api/health`: no schema, no dependency versions, no credentials, no
 *   internal topology.
 *
 *   Probe contract:
 *     GET /api/health/live -> 200  process is alive (always, while serving)
 *     GET /api/health      -> 200 ready / 503 not ready (database down)
 */
export async function GET() {
  return Response.json({ ok: true, system: SYSTEM_VERSION, checks: { process: "ALIVE" } });
}
