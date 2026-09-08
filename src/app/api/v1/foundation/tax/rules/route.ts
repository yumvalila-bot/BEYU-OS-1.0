/**
 * BEYU Foundation OS — versioned jurisdiction tax rules.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listTaxRules, publishTaxRule } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  countryCode: z.string().length(2),
  jurisdictionId: z.string().min(1).optional(),
  authority: z.string().min(1).max(300),
  source: z.string().min(1).max(500),
  ruleVersion: z.string().max(40).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  applicability: z.string().min(1).max(4000),
  ruleBody: z.record(z.string(), z.unknown()).optional(),
  verificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:tax.read",
      action: "foundation.tax.rules",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_TAX_RULE" },
    },
    async (ctx) => {
      const rows = await listTaxRules(ctx.principal);
      return NextResponse.json({ rules: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:tax.assess",
      action: "foundation.tax.publishRule",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_TAX_RULE" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await publishTaxRule(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
