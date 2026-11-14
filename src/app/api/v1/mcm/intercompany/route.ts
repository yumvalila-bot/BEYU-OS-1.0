import { apiOk, guarded, parseBody } from "@/lib/api";
import { authorizeIntercompanySide, raiseIntercompanyTransaction, reconcileIntercompanyPeriod } from "@/lib/mcm/services";
import {
  intercompanyAuthorizeSchema,
  intercompanyRaiseSchema,
  intercompanyReconcileSchema,
  mcmRefusal,
} from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/intercompany — raise an intercompany transaction.
 *
 * NOTHING IS POSTED. The row is a governed record awaiting BOTH sides'
 * authorisation; Finance OS remains the ledger authority and no journal is
 * written here or anywhere downstream of this route.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:intercompany.manage",
      action: "mcm.intercompany.raise",
      rateLimit: { limit: 60, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "INTERCOMPANY_TRANSACTION" },
    },
    async (ctx) => {
      const body = await parseBody(request, intercompanyRaiseSchema);
      try {
        return apiOk(await raiseIntercompanyTransaction(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PATCH /api/v1/mcm/intercompany?id=… — authorise ONE side.
 *
 * The authority is checked against that side's legal entity specifically, and the
 * database refuses the same principal authorising both sides, so four-eyes holds
 * even if this route were wrong.
 */
export async function PATCH(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:intercompany.authorize",
      action: "mcm.intercompany.authorize",
      rateLimit: { limit: 60, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "INTERCOMPANY_TRANSACTION" },
    },
    async (ctx) => {
      const body = await parseBody(request, intercompanyAuthorizeSchema);
      const id = new URL(request.url).searchParams.get("id");
      try {
        if (!id) {
          const { McmError } = await import("@/lib/mcm/model");
          throw new McmError("QUERY_PARAMETER_REQUIRED", 'The query parameter "id" is required.', 422);
        }
        return apiOk(
          await authorizeIntercompanySide(ctx.principal, { transactionId: id, ...body }, ctx.traceId),
          ctx.traceId,
        );
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PUT /api/v1/mcm/intercompany — reconcile a period's intercompany pairs.
 *
 * Differences are RECORDED, never zeroed, and no elimination is booked: the
 * elimination belongs to a consolidation run with its own review.
 */
export async function PUT(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:intercompany.reconcile",
      action: "mcm.intercompany.reconcile",
      rateLimit: { limit: 6, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "INTERCOMPANY_RECONCILIATION_RUN" },
    },
    async (ctx) => {
      const body = await parseBody(request, intercompanyReconcileSchema);
      try {
        return apiOk(await reconcileIntercompanyPeriod(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
