/**
 * BEYU Foundation OS — Conflict-of-interest declarations.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { declareConflict, listConflicts } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const CreateSchema = z.object({
  foundationId: z.string().min(1),
  partyId: z.string().min(1),
  interestType: z.enum(["FINANCIAL", "FAMILY", "FIDUCIARY", "OTHER"]),
  description: z.string().min(1).max(4000),
  relatedEntity: z.string().max(300).optional(),
  relatedGrantId: z.string().min(1).optional(),
  relatedProcurementId: z.string().min(1).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  mitigation: z.string().max(4000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:governance.read",
      action: "foundation.governance.conflicts",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_CONFLICT" },
    },
    async (ctx) => {
      const foundationId = new URL(request.url).searchParams.get("foundationId") ?? undefined;
      const rows = await listConflicts(ctx.principal, foundationId);
      return NextResponse.json({ conflicts: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:governance.manage",
      action: "foundation.governance.declareConflict",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_CONFLICT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await declareConflict(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
