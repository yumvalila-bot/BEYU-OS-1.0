/**
 * BEYU Foundation OS — Safeguarding (highly restricted).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import {
  getSafeguardingCase,
  listSafeguardingCases,
  reportSafeguardingCase,
  transitionSafeguardingCase,
} from "@/lib/foundation/service-operations";
import { SAFEGUARDING_STATUSES, type SafeguardingStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const ReportSchema = z.object({
  code: z.string().min(1).max(60),
  foundationId: z.string().min(1),
  caseType: z.enum(["SAFEGUARDING", "CHILD_PROTECTION", "ABUSE", "EXPLOITATION", "HARASSMENT", "WHISTLEBLOWING"]),
  summary: z.string().min(1).max(4000),
  reporterRef: z.string().max(200).optional(),
});

const TransitionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(SAFEGUARDING_STATUSES as unknown as [string, ...string[]]),
  investigatorRole: z.string().max(120).optional(),
  correctiveAction: z.string().max(4000).optional(),
  approvalRef: z.string().min(1).max(200).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:safeguarding.read",
      action: "foundation.safeguarding.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "SAFEGUARDING_CASE" },
    },
    async (ctx) => {
      const id = new URL(request.url).searchParams.get("id");
      try {
        if (id) return NextResponse.json({ case: await getSafeguardingCase(ctx.principal, id) });
        return NextResponse.json({ cases: await listSafeguardingCases(ctx.principal) });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:safeguarding.manage",
      action: "foundation.safeguarding.report",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "SAFEGUARDING_CASE" },
    },
    async (ctx) => {
      try {
        const body = ReportSchema.parse(await request.json());
        const result = await reportSafeguardingCase(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:safeguarding.manage",
      action: "foundation.safeguarding.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "SAFEGUARDING_CASE" },
    },
    async (ctx) => {
      try {
        const body = TransitionSchema.parse(await request.json());
        const row = await transitionSafeguardingCase(foundationServiceContext(ctx), body.id, body.status as SafeguardingStatus, body);
        return NextResponse.json({ case: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
