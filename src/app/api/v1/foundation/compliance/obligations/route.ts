/**
 * BEYU Foundation OS — compliance obligation registry.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createObligation, listObligations } from "@/lib/foundation/compliance";
import type { DeadlineRule } from "@/lib/foundation/deadlines";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const DeadlineRuleSchema = z.object({
  basis: z.enum(["CALENDAR_DAYS", "BUSINESS_DAYS", "MONTHS", "YEARS", "FISCAL_YEAR_END", "FIXED_DATE"]),
  offset: z.number().int().nonnegative().optional(),
  fixedMonthDay: z.string().regex(/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/).optional(),
  timezone: z.string().max(60).optional(),
});

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  foundationId: z.string().min(1),
  requirement: z.string().min(1).max(2000),
  authority: z.string().min(1).max(300),
  regulator: z.string().max(300).optional(),
  jurisdictionId: z.string().min(1).optional(),
  legalEntityId: z.string().min(1).optional(),
  canonicalObligationId: z.string().min(1).optional(),
  trigger: z.enum([
    "REGISTRATION",
    "FISCAL_YEAR",
    "TRANSACTION",
    "GRANT",
    "MEETING",
    "PERIOD",
    "ANNIVERSARY",
    "STATUTORY",
    "NOTICE",
    "RULE_CHANGE",
  ]),
  frequency: z.string().max(40).optional(),
  deadlineRule: DeadlineRuleSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ownerRole: z.string().min(1).max(120),
  approverRole: z.string().max(120).optional(),
  evidenceRequired: z.boolean().optional(),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  source: z.string().max(500).optional(),
  verificationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  nextReviewAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.read",
      action: "foundation.compliance.obligations",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_OBLIGATION" },
    },
    async (ctx) => {
      const foundationId = new URL(request.url).searchParams.get("foundationId") ?? undefined;
      const rows = await listObligations(ctx.principal, foundationId);
      return NextResponse.json({ obligations: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.createObligation",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_OBLIGATION" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createObligation(foundationServiceContext(ctx), {
          ...body,
          deadlineRule: body.deadlineRule as DeadlineRule,
        });
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
