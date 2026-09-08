/**
 * BEYU Foundation OS — Formation Engine ("Start a Foundation").
 *
 * GET  /api/v1/foundation/formation — list cases in scope
 * POST /api/v1/foundation/formation — open a case (runs the assessment engine)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listFormationCases, openFormationCase } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const IntakeSchema = z.object({
  mission: z.string().max(4000).default(""),
  activities: z.array(z.string()).default([]),
  beneficiaryScope: z.string().max(1000).default(""),
  geographicScope: z.string().max(1000).default(""),
  fundingModel: z.string().max(2000).default(""),
  initialCapitalMinor: z.number().int().nonnegative().optional(),
  endowmentTargetMinor: z.number().int().nonnegative().optional(),
  governanceModel: z.string().max(2000).default(""),
  jurisdictionCode: z.string().max(20).default(""),
  proposedVehicle: z.string().max(120).default(""),
  taxObjectives: z.array(z.string()).default([]),
  donorModel: z.string().max(2000).default(""),
  grantmakingModel: z.string().max(2000).default(""),
  internationalActivities: z.boolean().default(false),
  expectedWorkforce: z.number().int().min(0).default(0),
  relatedEntities: z.array(z.string()).default([]),
});

const OpenSchema = z.object({
  code: z.string().min(1).max(60),
  proposedName: z.string().min(1).max(300),
  mission: z.string().max(4000).optional(),
  jurisdictionId: z.string().min(1).optional(),
  proposedVehicle: z.string().max(120).optional(),
  fundingModel: z.string().max(2000).optional(),
  intake: IntakeSchema,
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:formation.read",
      action: "foundation.formation.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FORMATION_CASE" },
    },
    async (ctx) => {
      const rows = await listFormationCases(ctx.principal);
      return NextResponse.json({ cases: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:formation.manage",
      action: "foundation.formation.open",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FORMATION_CASE" },
    },
    async (ctx) => {
      try {
        const body = OpenSchema.parse(await request.json());
        const result = await openFormationCase(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
