/**
 * BEYU Foundation OS — Organization Structure Designer.
 *
 * GET  /api/v1/foundation/structures — list proposals
 * POST /api/v1/foundation/structures — author a CURRENT/PROPOSED proposal
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createStructureProposal, listStructureProposals } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const GraphSchema = z.object({
  nodes: z.array(
    z.object({
      id: z.string().min(1),
      kind: z.string().min(1),
      label: z.string().min(1),
      jurisdiction: z.string().min(1),
      attributes: z.record(z.string(), z.string()).optional(),
    }),
  ),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      to: z.string().min(1),
      relation: z.string().min(1),
      detail: z.string().optional(),
    }),
  ),
});

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  kind: z.enum(["CURRENT", "PROPOSED"]).optional(),
  foundationId: z.string().min(1).optional(),
  graph: GraphSchema,
  rationale: z.string().max(4000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:structure.read",
      action: "foundation.structure.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "STRUCTURE_PROPOSAL" },
    },
    async (ctx) => {
      const rows = await listStructureProposals(ctx.principal);
      return NextResponse.json({ proposals: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:structure.manage",
      action: "foundation.structure.propose",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "STRUCTURE_PROPOSAL" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createStructureProposal(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
