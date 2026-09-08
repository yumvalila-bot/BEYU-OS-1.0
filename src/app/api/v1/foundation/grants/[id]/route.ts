/**
 * BEYU Foundation OS — Grant detail + lifecycle transitions.
 *
 * Transitions to APPROVAL additionally require foundation:grant.approve
 * (HIGH_RISK, MFA step-up enforced by can()).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, guarded } from "@/lib/api";
import { can } from "@/lib/authz";
import { getGrant, setGrantConflictCheck, transitionGrant } from "@/lib/foundation/service";
import { GRANT_STATUSES, type GrantStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const TransitionSchema = z.object({
  status: z.enum(GRANT_STATUSES as unknown as [string, ...string[]]),
  approvalRef: z.string().min(1).max(200).optional(),
  conflictCheckStatus: z.enum(["PENDING", "CLEARED", "FLAGGED"]).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:grant.read",
      action: "foundation.grant.get",
      rateLimit: { limit: 180, windowMs: 60_000 },
      audit: { objectType: "GRANT" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const row = await getGrant(ctx.principal, id);
        return NextResponse.json({ grant: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return guarded(
    request,
    {
      permission: "foundation:grant.manage",
      action: "foundation.grant.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GRANT" },
    },
    async (ctx) => {
      try {
        const { id } = await params;
        const body = TransitionSchema.parse(await request.json());
        if (body.conflictCheckStatus) {
          await setGrantConflictCheck(foundationServiceContext(ctx), id, body.conflictCheckStatus);
        }
        if (body.status === "APPROVAL") {
          const approval = can(ctx.principal, "foundation:grant.approve");
          if (!approval.allowed) {
            return apiError("FORBIDDEN", approval.reason, approval.requiresMfa ? 403 : 403, ctx.traceId);
          }
        }
        const row = await transitionGrant(
          foundationServiceContext(ctx),
          id,
          body.status as GrantStatus,
          body.approvalRef,
        );
        return NextResponse.json({ grant: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
