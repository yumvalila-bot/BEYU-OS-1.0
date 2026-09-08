/**
 * BEYU Foundation OS — compliance tasks.
 *
 * GET   /api/v1/foundation/compliance/tasks[?deadlineId=]
 * PATCH /api/v1/foundation/compliance/tasks { id, to, notes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { advanceComplianceTask, listComplianceTasks, refreshTaskBlockStates } from "@/lib/foundation/compliance";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const AdvanceSchema = z.object({
  id: z.string().min(1),
  to: z.enum(["OPEN", "IN_PROGRESS", "BLOCKED", "SUBMITTED", "VERIFIED", "COMPLETED", "OVERDUE"]),
  notes: z.string().max(4000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.read",
      action: "foundation.compliance.tasks",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_COMPLIANCE_TASK" },
    },
    async (ctx) => {
      const deadlineId = new URL(request.url).searchParams.get("deadlineId") ?? undefined;
      const rows = await listComplianceTasks(ctx.principal, deadlineId);
      return NextResponse.json({ tasks: rows });
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.advanceTask",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_COMPLIANCE_TASK" },
    },
    async (ctx) => {
      try {
        const body = AdvanceSchema.parse(await request.json());
        const row = await advanceComplianceTask(foundationServiceContext(ctx), body.id, body.to, body.notes);
        const refreshed = await refreshTaskBlockStates(ctx.principal);
        return NextResponse.json({ task: row, dependenciesRefreshed: refreshed });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
