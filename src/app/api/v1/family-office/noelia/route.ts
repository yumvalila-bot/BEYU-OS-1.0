import { z } from "zod";
import { apiError, apiOk, guarded } from "@/lib/api";
import {
  listInvestments,
  listObligations,
  readCashFlow,
  listCommitteeDecisions,
} from "@/lib/family-office-capital-service";
import { protectionSummary } from "@/lib/family-office-protection-service";
import { can } from "@/lib/authz";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * The read surface Noelia works against (§26).
 *
 * This is NOT a second Noelia. It is a data endpoint in the family-office
 * namespace that Noelia's existing tools call, so every answer Noelia gives about
 * family capital comes from the same scoped, audited read path a human uses —
 * through the same tenant RLS, the same `guarded()` authorization and the same
 * audit append. Noelia's own permission set, answer tagging and identity are
 * registered in `src/lib/noelia/` and are unchanged here.
 *
 * What Noelia can and cannot do is enforced by RBAC, not by this route: the
 * caller's principal decides. A Noelia-backed principal holds
 * `family:*.read` and `familyoffice:scenario.simulate` and nothing that approves,
 * transfers, executes or posts (§26, §27).
 */
const QuestionSchema = z
  .object({
    topic: z.enum(["CAPITAL", "DEBT", "LIQUIDITY", "CASH_FLOW", "COMMITTEE", "PROTECTION"]),
    asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
  })
  .strict();

/**
 * POST /api/v1/family-office/noelia
 *
 * POST because the topic is a request body, not a query string — the payload is
 * what gets audited, and an audit record of "Noelia read the dashboard" is worth
 * nothing without saying which question was asked.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:capital.read",
      action: "family.noelia.context",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_NOELIA_CONTEXT" },
    },
    async (ctx) => {
      const body = QuestionSchema.parse(await ctx.request.json().catch(() => ({})));
      const asOf = body.asOf ?? todayIso();

      /**
       * PROTECTION is topic-gated: the endpoint's baseline permission is
       * `familyoffice:capital.read`, and capital visibility does NOT imply
       * insurance visibility. The check is a real `can()`, not a URL rule
       * (§15: routes never constitute authorization).
       */
      if (body.topic === "PROTECTION") {
        const decision = can(ctx.principal, "familyoffice:protection.read");
        if (!decision.allowed) return apiError("FORBIDDEN", decision.reason, 403, ctx.traceId);
      }

      const scope = await tenantScopeIds(ctx.principal);
      const payload = await (async () => {
        switch (body.topic) {
          /**
           * Capital and liquidity come from STORED snapshots, not from a
           * computation. The computed balance sheet (§15) and liquidity projection
           * (§19) need caller-supplied Finance OS inputs, and Noelia has no
           * authority to invent them — inventing the denominator and then
           * summarising the ratio is exactly the failure mode this endpoint exists
           * to avoid.
           */
          case "CAPITAL": {
            const snapshots = await db.select().from(s.familyBalanceSheetSnapshots).where(inArray(s.familyBalanceSheetSnapshots.tenantId, scope));
            return { snapshots, total: snapshots.length, basis: "OBSERVED" as const };
          }
          case "DEBT":
            return listObligations(ctx.principal, asOf);
          case "LIQUIDITY": {
            const snapshots = await db.select().from(s.familyLiquiditySnapshots).where(inArray(s.familyLiquiditySnapshots.tenantId, scope));
            return { snapshots, total: snapshots.length, basis: "OBSERVED" as const };
          }
          case "CASH_FLOW":
            return readCashFlow(ctx.principal, asOf);
          case "COMMITTEE":
            return listCommitteeDecisions(ctx.principal);
          case "PROTECTION":
            return protectionSummary(ctx.principal, asOf);
        }
      })();

      const investments = await listInvestments(ctx.principal, asOf);

      return apiOk(
        {
          topic: body.topic,
          asOf,
          data: payload,
          investmentCount: investments.total,
          /**
           * Everything Noelia is about to say is derived from the block above and
           * nothing else. These labels are the epistemic ceiling: Noelia may
           * CALCULATE, SUMMARIZE, SIMULATE and RECOMMEND over this data, and may
           * never APPROVE, TRANSFER, EXECUTE, CHANGE OWNERSHIP, BYPASS a
           * governance step or CAP_POSTING.
           */
          epistemicCeiling: ["FACT", "CALCULATION", "ASSUMPTION", "INFERENCE", "SCENARIO", "RECOMMENDATION", "UNCERTAINTY"],
          prohibitedActions: [
            "APPROVE",
            "TRANSFER",
            "EXECUTE",
            "CHANGE_OWNERSHIP",
            "BYPASS_GOVERNANCE",
            "CAP_POSTING",
            "AUDIT_WRITE",
            // Protection & insurance (§27): Noelia reads, summarizes and flags.
            // Every consequential act on an insurance record belongs to an
            // authorized human on a governed route, and no tool path exists.
            "BIND_COVERAGE",
            "CANCEL_COVERAGE",
            "CHANGE_INSURANCE_BENEFICIARY",
            "APPROVE_CLAIM",
            "UNDERWRITE",
          ],
          authoritativeAccountingOwner: "FINANCE_OS",
          /**
           * An answer of "AI said so" is never a sufficient rationale for a capital
           * decision (§42). The evidence a committee must cite is the record
           * reference, not the model that summarised it.
           */
          decisionRationaleNotice:
            "This context is analytical input. A capital decision requires a recorded committee resolution citing document evidence; an AI summary is not that evidence.",
        },
        ctx.traceId,
      );
    },
  );
}
