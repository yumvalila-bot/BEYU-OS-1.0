/**
 * BEYU Foundation OS — workforce assignments (contextual; HCM owns the worker).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createWorkforceAssignment, listWorkforceAssignments } from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  employeeId: z.string().min(1),
  foundationId: z.string().min(1),
  programId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
  assignmentType: z.enum(["FOUNDATION", "PROGRAM", "PROJECT", "GRANT", "COMPLIANCE", "SAFEGUARDING", "BOARD", "FIELD"]),
  roleTitle: z.string().min(1).max(200),
  responsibilityScope: z.string().max(2000).optional(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:assignment.read",
      action: "foundation.assignment.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_WORKFORCE_ASSIGNMENT" },
    },
    async (ctx) => {
      const rows = await listWorkforceAssignments(ctx.principal);
      return NextResponse.json({ assignments: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:assignment.manage",
      action: "foundation.assignment.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_WORKFORCE_ASSIGNMENT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createWorkforceAssignment(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
