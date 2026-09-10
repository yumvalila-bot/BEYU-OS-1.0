import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { listAllocations } from "@/lib/family-office-capital-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/family-office/capital-requests
 *
 * The capital-request pipeline (§10): the canonical Finance OS `capitalRequests`
 * record plus the Family Office allocation stages wrapped around it.
 *
 * The request record itself is not duplicated here. `finance.capitalRequests`
 * stays the request ledger; the Family Office stores the allocation *process*
 * around it and links back by `capitalRequestRef`. Two request ledgers would be
 * two answers to "did this get approved?".
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:capitalrequest.read", action: "family.capitalRequest.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_ALLOCATION" } },
    async (ctx) => {
      const { allocations, total } = await listAllocations(ctx.principal);
      const requestIds = allocations.map((a) => a.capitalRequestRef).filter((id): id is string => Boolean(id));
      const requests = requestIds.length
        ? await db.select().from(s.capitalRequests).where(inArray(s.capitalRequests.id, requestIds))
        : [];
      const requestById = new Map(requests.map((r) => [r.id, r]));

      return apiOk(
        {
          allocations,
          total,
          /** The Finance OS request record, joined by reference. `status` here is Finance OS's own. */
          requests: requests.map((r) => ({
            id: r.id,
            code: r.code,
            title: r.title,
            requestType: r.requestType,
            sectorCode: r.sectorCode,
            amount: r.amount,
            currency: r.currency,
            status: r.status,
            resolutionId: r.resolutionId,
          })),
          /**
           * An allocation whose request carries a resolution but whose allocation
           * is not marked complete. That gap means capital was authorised without
           * the allocation trail finishing — exactly what the §10 workflow exists
           * to prevent.
           */
          resolvedButIncomplete: allocations
            .filter((a) => requestById.get(a.capitalRequestRef)?.resolutionId && a.status !== "COMPLETE")
            .map((a) => ({ id: a.id, capitalRequestRef: a.capitalRequestRef, status: a.status, currentStepIndex: a.currentStepIndex })),
          /**
           * Segregation-of-duties check the data itself can answer: an allocation
           * where the same reference appears as requester, executor and reconciler.
           * §39 requires four distinct parties.
           */
          segregationOverlaps: allocations
            .filter((a) => a.requesterRef && a.requesterRef === a.executorRef)
            .map((a) => ({ id: a.id, requesterRef: a.requesterRef, executorRef: a.executorRef, reconcilerRef: a.reconcilerRef, waivedByPolicy: a.segregationWaivedByPolicy })),
        },
        ctx.traceId,
      );
    },
  );
}
