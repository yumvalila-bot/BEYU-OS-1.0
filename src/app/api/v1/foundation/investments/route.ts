/**
 * BEYU Foundation OS — Investment policies + proposals.
 * Approval is a separate human-governed action (see [id]/approve).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import {
  createInvestmentPolicy,
  listInvestmentPolicies,
  listInvestments,
  proposeInvestment,
} from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const PolicySchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  assetAllocation: z.record(z.string(), z.unknown()).optional(),
  liquidityRequirement: z.string().max(2000).optional(),
  riskAppetite: z.string().max(2000).optional(),
  concentrationLimits: z.string().max(2000).optional(),
  prohibitedInstruments: z.string().max(2000).optional(),
  approvalRef: z.string().max(200).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const ProposeSchema = z.object({
  code: z.string().min(1).max(60),
  instrument: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  policyId: z.string().min(1).optional(),
  fundId: z.string().min(1).optional(),
  counterparty: z.string().max(300).optional(),
  principalAmount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  expectedReturnPct: z.string().regex(/^\d+(\.\d{1,4})?$/).optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:investment.read",
      action: "foundation.investment.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_INVESTMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      if (url.searchParams.get("policies") === "1") {
        return NextResponse.json({ policies: await listInvestmentPolicies(ctx.principal) });
      }
      const rows = await listInvestments(ctx.principal);
      return NextResponse.json({ investments: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:investment.manage",
      action: "foundation.investment.propose",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_INVESTMENT" },
    },
    async (ctx) => {
      try {
        const body = ProposeSchema.parse(await request.json());
        const result = await proposeInvestment(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PUT(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:investment.manage",
      action: "foundation.investment.createPolicy",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_INVESTMENT_POLICY" },
    },
    async (ctx) => {
      try {
        const body = PolicySchema.parse(await request.json());
        const result = await createInvestmentPolicy(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
