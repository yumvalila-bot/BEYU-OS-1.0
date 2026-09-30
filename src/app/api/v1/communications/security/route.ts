/**
 * GET /api/v1/communications/security — list security events
 */

import { NextRequest } from "next/server";
import { guarded, apiOk } from "@/lib/api";
import { listSecurityEvents } from "@/lib/communications/security-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:security.read",
      action: "communications.security.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const eventType = searchParams.get("eventType") ?? undefined;
      const severity = searchParams.get("severity") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

      const events = await listSecurityEvents(ctx.principal.tenantId, { eventType, severity, limit });

      return apiOk({ events, total: events.length }, ctx.traceId);
    },
  );
}
