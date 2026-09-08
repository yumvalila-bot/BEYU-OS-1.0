/**
 * BEYU Foundation OS — tax assessments (tax information, never advice).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listTaxAssessments, recordTaxAssessment } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  foundationId: z.string().min(1),
  taxRuleId: z.string().min(1).optional(),
  activity: z.string().min(1).max(2000),
  transactionRef: z.string().max(200).optional(),
  evidenceRefs: z.array(z.string()).optional(),
  disqualifiers: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  potentialBenefit: z.string().max(2000).optional(),
  potentialLiability: z.string().max(2000).optional(),
  risks: z.string().max(4000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:tax.read",
      action: "foundation.tax.assessments",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_TAX_ASSESSMENT" },
    },
    async (ctx) => {
      const rows = await listTaxAssessments(ctx.principal);
      return NextResponse.json({ assessments: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:tax.assess",
      action: "foundation.tax.assess",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_TAX_ASSESSMENT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await recordTaxAssessment(foundationServiceContext(ctx), {
          ...body,
          todayIso: new Date().toISOString().slice(0, 10),
        });
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
