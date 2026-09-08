/**
 * BEYU Foundation OS — Projects under programs.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createProject, listProjects } from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(300),
  programId: z.string().min(1),
  foundationId: z.string().min(1),
  objectives: z.string().max(4000).optional(),
  geography: z.string().max(500).optional(),
  budget: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().length(3).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:program.read",
      action: "foundation.program.projects",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_PROJECT" },
    },
    async (ctx) => {
      const programId = new URL(request.url).searchParams.get("programId") ?? undefined;
      const rows = await listProjects(ctx.principal, programId);
      return NextResponse.json({ projects: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:program.manage",
      action: "foundation.program.createProject",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_PROJECT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createProject(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
