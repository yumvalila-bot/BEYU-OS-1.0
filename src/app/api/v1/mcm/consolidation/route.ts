import { apiOk, guarded, parseBody } from "@/lib/api";
import { consolidationOverview, intercompanyOverview, visibleEntities } from "@/lib/mcm/read-services";
import { prepareConsolidationRun, reviewConsolidationRun } from "@/lib/mcm/consolidation";
import { mcmRefusal, prepareConsolidationSchema, reviewConsolidationSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/mcm/consolidation — consolidation runs and the intercompany
 * position, both status-only.
 *
 * A consolidation run is a governed computation with a preparer and an
 * independent reviewer; the database refuses a run whose reviewer equals its
 * preparer. MCM never auto-posts an elimination into Finance OS.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:consolidation.read",
      action: "mcm.consolidation.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
      classification: "RESTRICTED",
    },
    async (ctx) => {
      const entities = await visibleEntities(ctx.principal);
      const [consolidation, intercompany] = await Promise.all([
        consolidationOverview(ctx.principal),
        intercompanyOverview(ctx.principal, entities),
      ]);
      return apiOk({ consolidation, intercompany }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/mcm/consolidation — prepare a consolidation run.
 *
 * The run collects each consolidated member's trial balance from Finance OS,
 * translates it through the governed FX rail, and PROPOSES eliminations. It writes
 * nothing to the ledger, marks no adjustment `applied`, and records in the run
 * itself every member it had to exclude and why. Reading the trial balances needs
 * `finance:ledger.read` as well as this route's permission — `mcm:consolidation.prepare`
 * is not a way to see journals — and a caller without it gets a run of stated
 * exclusions rather than the ledger. A run whose figures are all
 * present is `CONSOLIDATED`; one with gaps is `PENDING`, and `outstanding` names
 * each gap — the state never claims more than the data supports.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:consolidation.prepare",
      action: "mcm.consolidation.prepare",
      rateLimit: { limit: 6, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "CONSOLIDATION_RUN" },
    },
    async (ctx) => {
      const body = await parseBody(request, prepareConsolidationSchema);
      try {
        return apiOk(await prepareConsolidationRun(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PATCH /api/v1/mcm/consolidation — review a prepared run.
 *
 * Four-eyes: the preparer is refused in the service and by a database CHECK, and a
 * decision requires a note. `REVIEWED` means a named human stands behind the run as
 * presented — including its declared gaps. It does not post anything, and it does
 * not make an unapproved adjustment applied.
 */
export async function PATCH(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:consolidation.review",
      action: "mcm.consolidation.review",
      rateLimit: { limit: 30, windowMs: 60_000 },
      classification: "RESTRICTED",
      audit: { objectType: "CONSOLIDATION_RUN" },
    },
    async (ctx) => {
      const body = await parseBody(request, reviewConsolidationSchema);
      try {
        return apiOk(await reviewConsolidationRun(ctx.principal, body, ctx.traceId), ctx.traceId);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
