/**
 * POST /api/v1/internal/events/status
 *
 * Reconciliation lookup for cross-OS event delivery (service-to-service).
 *
 * A sector OS's reconciliation service asks: "was idempotency key K
 * accepted by the enterprise event ledger, and which canonical event did
 * it become?" This powers the Phase 8 reconciliation contract:
 *
 *   outbox DELIVERED + receipt exists      → consistent
 *   outbox DELIVERED + receipt missing     → delivery-without-acceptance
 *                                            (escalate: audit both sides)
 *   outbox PENDING/RETRYING + receipt      → accepted-but-not-recorded
 *                                            (reconciliation repairs state)
 *   outbox DEAD_LETTER + receipt           → delivered-before-death; replay
 *                                            must remain idempotent
 *
 * Fail-closed: the tenant must exist; the receipt is read inside the
 * tenant's RLS context. Unknown key → 404 RECEIPT_NOT_FOUND (not an error:
 * the event was never accepted).
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { apiError, apiOk, guardedInternal } from "@/lib/internal/api";

export const dynamic = "force-dynamic";

const StatusSchema = z
  .object({
    idempotencyKey: z.string().min(8).max(200),
    tenantCode: z.string().min(2).max(50),
  })
  .strict();

export async function POST(request: Request) {
  return guardedInternal(
    request,
    {
      action: "events.status",
      schema: StatusSchema,
      rateLimit: { limit: 600, windowMs: 60_000 },
    },
    async ({ body, traceId }) => {
      const tenant = await db
        .select({ id: tenants.id, status: tenants.status })
        .from(tenants)
        .where(eq(tenants.code, body.tenantCode))
        .limit(1);
      if (tenant.length === 0) {
        return apiError("TENANT_NOT_FOUND", `Tenant ${body.tenantCode} does not exist.`, 404, traceId);
      }
      const tenantId = tenant[0].id;

      return withDatabaseRlsContext([tenantId], false, async () => {
        const rows = await db.execute(
          sql`select "event_id", "event_type", "source", "duplicate_count", "first_seen_at"
                from "internal_event_receipts"
               where "idempotency_key" = ${body.idempotencyKey}`,
        );
        if (rows.rows.length === 0) {
          return apiError(
            "RECEIPT_NOT_FOUND",
            "No event was accepted for this idempotency key.",
            404,
            traceId,
          );
        }
        const r = rows.rows[0] as {
          event_id: string | null;
          event_type: string;
          source: string;
          duplicate_count: number;
          first_seen_at: string;
        };
        return apiOk(
          {
            accepted: r.event_id !== null,
            eventId: r.event_id,
            eventType: r.event_type,
            source: r.source,
            duplicateCount: r.duplicate_count,
            firstSeenAt: r.first_seen_at,
          },
          traceId,
        );
      });
    },
  );
}
