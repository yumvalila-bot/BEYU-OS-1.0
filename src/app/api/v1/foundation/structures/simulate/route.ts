/**
 * BEYU Foundation OS — Structure Change Simulator.
 *
 * POST /api/v1/foundation/structures/simulate — compare baseline vs candidate
 * graphs. The simulator NEVER executes changes; it records the before/after
 * diff, impacts, required approvals and implementation tasks.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listStructureScenarios, runStructureSimulation } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const SimulateSchema = z.object({
  code: z.string().min(1).max(60),
  question: z.string().min(1).max(1000),
  baselineProposalId: z.string().min(1),
  candidateProposalId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:structure.read",
      action: "foundation.structure.scenarios",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "STRUCTURE_SCENARIO" },
    },
    async (ctx) => {
      const rows = await listStructureScenarios(ctx.principal);
      return NextResponse.json({ scenarios: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:structure.simulate",
      action: "foundation.structure.simulate",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "STRUCTURE_SCENARIO" },
    },
    async (ctx) => {
      try {
        const body = SimulateSchema.parse(await request.json());
        const result = await runStructureSimulation(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
