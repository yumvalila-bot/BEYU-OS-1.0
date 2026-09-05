import { z } from "zod";
import { apiError, apiOk, guarded } from "@/lib/api";
import { statement, trialBalance, type ReportKind } from "@/lib/finance/reporting";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const ReportKindEnum = z.enum([
  "TRIAL_BALANCE",
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CASH_FLOW",
  "CHANGES_IN_EQUITY",
]);

/**
 * GET /api/v1/finance/reports
 * Governed financial report generation.
 * Reports derive from authoritative general ledger records with full epistemic
 * classifications. Projections and derived figures are never presented as POSTED truth.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:ledger.read",
      action: "finance.reports.generate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FINANCIAL_REPORT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const rawKind = url.searchParams.get("kind") ?? "TRIAL_BALANCE";
      const legalEntityId = url.searchParams.get("legalEntityId");
      const asOf = url.searchParams.get("asOf") ?? new Date().toISOString().slice(0, 10);
      const currency = url.searchParams.get("currency") ?? undefined;

      const parsedKind = ReportKindEnum.safeParse(rawKind);
      if (!parsedKind.success) {
        return apiError(
          "INVALID_REPORT_KIND",
          `Invalid report kind '${rawKind}'. Allowed kinds: TRIAL_BALANCE, BALANCE_SHEET, INCOME_STATEMENT, CASH_FLOW, CHANGES_IN_EQUITY.`,
          400,
          ctx.traceId,
        );
      }

      const scope = await tenantScopeIds(ctx.principal);
      if (!scope.includes(ctx.principal.tenantId)) {
        return apiError("FORBIDDEN", "Tenant scope violation.", 403, ctx.traceId);
      }

      if (legalEntityId && ctx.principal.entityScope.length > 0 && !ctx.principal.entityScope.includes(legalEntityId)) {
        return apiError("NOT_FOUND", "Legal entity not found in your scope.", 404, ctx.traceId);
      }

      const kind = parsedKind.data;
      let report;

      if (kind === "TRIAL_BALANCE") {
        report = await trialBalance({
          tenantId: ctx.principal.tenantId,
          legalEntityId: legalEntityId ?? undefined,
          asOf,
          reportingCurrency: currency,
        });
      } else {
        report = await statement({
          kind,
          tenantId: ctx.principal.tenantId,
          legalEntityId: legalEntityId ?? undefined,
          asOf,
          reportingCurrency: currency,
        });
      }

      return apiOk({ report }, ctx.traceId);
    },
  );
}
