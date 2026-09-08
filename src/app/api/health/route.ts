import { SYSTEM_VERSION } from "@/lib/constants";
import { buildDatabaseHealthLogEvent, probeDatabaseHealth } from "@/lib/db-health";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe.
 *
 * Success body is byte-stable (`checks.database: "UP"`) — CI, the governed
 * database-release `runtime-verify` gate, and the E2E harness all match on it.
 *
 * Failure body adds ONLY a sanitized `reason` classification token (fixed
 * vocabulary in `@/lib/db-health`). It never carries the raw exception,
 * driver message, SQLSTATE detail, hostname, username, password, DSN, or
 * stack trace. A structured diagnostic event with the same fixed field set
 * is logged for the platform log drain (Vercel Runtime Logs); the driver
 * message is never logged because it routinely embeds connection detail.
 */
export async function GET() {
  const traceId = newId(ID_PREFIX.event);
  const startedAt = Date.now();
  const result = await probeDatabaseHealth();
  if (result.ok) {
    return Response.json({
      ok: true,
      system: SYSTEM_VERSION,
      checks: { database: "UP" },
      latencyMs: Date.now() - startedAt,
    });
  }
  console.error(
    JSON.stringify(
      buildDatabaseHealthLogEvent({
        traceId,
        environment: process.env.BEYU_ENV ?? process.env.NODE_ENV ?? "unknown",
        classification: result.classification,
        code: result.code,
        elapsedMs: result.elapsedMs,
      }),
    ),
  );
  return Response.json(
    { ok: false, system: SYSTEM_VERSION, checks: { database: "DOWN" }, reason: result.classification },
    { status: 503 },
  );
}
