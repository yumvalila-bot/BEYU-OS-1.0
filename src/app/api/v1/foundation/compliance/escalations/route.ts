/**
 * BEYU Foundation OS — escalation queue.
 *
 * GET   /api/v1/foundation/compliance/escalations
 * PATCH /api/v1/foundation/compliance/escalations { id } — acknowledge
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { acknowledgeEscalation, listEscalations } from "@/lib/foundation/compliance";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const AckSchema = z.object({ id: z.string().min(1) });

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.read",
      action: "foundation.compliance.escalations",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_ESCALATION" },
    },
    async (ctx) => {
      const rows = await listEscalations(ctx.principal);
      return NextResponse.json({ escalations: rows });
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.acknowledgeEscalation",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_ESCALATION" },
    },
    async (ctx) => {
      try {
        const body = AckSchema.parse(await request.json());
        const row = await acknowledgeEscalation(foundationServiceContext(ctx), body.id);
        return NextResponse.json({ escalation: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
