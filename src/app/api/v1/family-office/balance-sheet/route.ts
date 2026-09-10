import { z } from "zod";
import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import * as s from "@/db/schema";
import { inArray } from "drizzle-orm";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { readBalanceSheet } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

const LineSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    label: z.string().trim().min(1).max(200),
    side: z.enum(["ASSET", "LIABILITY"]),
    amountMinor: z.number().int(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    legalEntityId: z.string().trim().max(200).nullish(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/).nullish(),
    assetClass: z.string().trim().max(100).nullish(),
    liquidity: z.enum(["LIQUID", "NEAR_LIQUID", "ILLIQUID"]).nullish(),
    productive: z.boolean().nullish(),
    basis: z.enum(["POSTED", "OBSERVED", "DERIVED", "FORECAST", "ASSUMPTION", "SCENARIO", "REQUIRES_POLICY", "DATA_NOT_AVAILABLE", "REQUIRES_AUTHORITY"]),
    sourceRef: z.string().trim().min(1).max(200),
  })
  .strict();

const ContingentSchema = z
  .object({
    code: z.string().trim().min(1).max(50),
    label: z.string().trim().min(1).max(200),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    /** A contingent liability with no trigger cannot be monitored, so it is refused. */
    trigger: z.string().trim().min(1).max(2000),
    likelihood: z.enum(["REMOTE", "POSSIBLE", "PROBABLE"]).nullish(),
    sourceRef: z.string().trim().min(1).max(200),
  })
  .strict();

const ComputeSchema = z
  .object({
    asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    lines: z.array(LineSchema).default([]),
    contingents: z.array(ContingentSchema).default([]),
    capitalCommitments: z.array(z.object({ currency: z.string().trim().regex(/^[A-Z]{3}$/), amountMinor: z.number().int().nonnegative() }).strict()).default([]),
  })
  .strict();

/**
 * GET /api/v1/family-office/balance-sheet
 *
 * Stored balance-sheet snapshots inside the caller's tenant scope. Read-only and
 * cheap — this is the list view.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:capital.read", action: "family.balanceSheet.read", rateLimit: { limit: 60, windowMs: 60_000 }, audit: { objectType: "FAMILY_BALANCE_SHEET" } },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const snapshots = await db.select().from(s.familyBalanceSheetSnapshots).where(inArray(s.familyBalanceSheetSnapshots.tenantId, scope));
      return apiOk({ snapshots, total: snapshots.length }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/family-office/balance-sheet
 *
 * Computes the consolidated family balance sheet (§15) and productive-capital
 * metrics (§17) from supplied lines.
 *
 * POST, not GET, because the caller supplies the lines. Those figures are Finance
 * OS and sector OS balances — this domain has no authority to invent them, and a
 * balance sheet computed from invented inputs would look exactly like a real one.
 * Every total is per currency, and contingents are DISCLOSED, never netted into
 * net worth.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:capital.read", action: "family.balanceSheet.compute", rateLimit: { limit: 40, windowMs: 60_000 }, audit: { objectType: "FAMILY_BALANCE_SHEET" } },
    async (ctx) => {
      const body = ComputeSchema.parse(await ctx.request.json().catch(() => ({})));
      const result = await readBalanceSheet(ctx.principal, {
        asOf: body.asOf ?? todayIso(),
        lines: body.lines.map((l) => ({
          ...l,
          legalEntityId: l.legalEntityId ?? null,
          countryCode: l.countryCode ?? null,
          assetClass: l.assetClass ?? null,
          liquidity: l.liquidity ?? null,
          productive: l.productive ?? null,
        })),
        contingents: body.contingents.map((c) => ({ ...c, likelihood: c.likelihood ?? null })),
        capitalCommitments: body.capitalCommitments,
      });
      return apiOk(result, ctx.traceId);
    },
  );
}
