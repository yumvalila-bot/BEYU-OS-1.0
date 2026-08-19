import { sql } from "drizzle-orm";
import { db } from "@/db";
import { SYSTEM_VERSION } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness probe.
 * Deliberately unauthenticated and information-free: it never exposes
 * schema, versions of dependencies, credentials or internal topology.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      system: SYSTEM_VERSION,
      checks: { database: "UP" },
      latencyMs: Date.now() - startedAt,
    });
  } catch {
    return Response.json(
      { ok: false, system: SYSTEM_VERSION, checks: { database: "DOWN" } },
      { status: 503 },
    );
  }
}
