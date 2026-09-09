import { z } from "zod";
import { apiOk, guarded } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";
import { db } from "@/db";
import * as s from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { inArray } from "drizzle-orm";
import { withAuditTransaction } from "@/lib/audit";
import { projectCapital } from "@/lib/family/office/capital-wealth";
import { minorToNumeric } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

/**
 * The capital simulator (§28).
 *
 * Every input is an ASSUMPTION supplied by the caller; the engine supplies no
 * default return, fee, tax or inflation rate, because a hard-coded one would be
 * an unratified investment policy presented as a fact. The result is labelled
 * SCENARIO, carries its assumptions on its face, and `outcomeGuaranteed` is
 * structurally `false` — a projection that claims certainty is a defect.
 */
const SimulateSchema = z
  .object({
    startingCapitalMinor: z.number().int().nonnegative(),
    monthlyContributionMinor: z.number().int().nonnegative(),
    annualReturnBps: z.number().int().min(0).max(5000),
    annualFeeBps: z.number().int().min(0).max(1000),
    annualTaxBps: z.number().int().min(0).max(3000),
    annualInflationBps: z.number().int().min(0).max(3000),
    years: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
    annualWithdrawalMinor: z.number().int().nonnegative().optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    /** Persist the scenario so it can be reproduced and audited. Defaults to true. */
    persist: z.boolean().optional(),
  })
  .strict();

/**
 * POST /api/v1/family-office/scenarios
 *
 * Runs a capital projection and, by default, persists the model and its results
 * so the projection can be reproduced later. Persisting is what makes "we
 * modelled this" auditable rather than anecdotal.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:scenario.simulate", action: "family.scenario.simulate", rateLimit: { limit: 40, windowMs: 60_000 }, audit: { objectType: "FAMILY_SCENARIO" } },
    async (ctx) => {
      const body = SimulateSchema.parse(await ctx.request.json().catch(() => ({})));
      const projection = projectCapital({
        startingCapitalMinor: body.startingCapitalMinor,
        monthlyContributionMinor: body.monthlyContributionMinor,
        annualReturnBps: body.annualReturnBps,
        annualFeeBps: body.annualFeeBps,
        annualTaxBps: body.annualTaxBps,
        annualInflationBps: body.annualInflationBps,
        years: body.years,
        annualWithdrawalMinor: body.annualWithdrawalMinor ?? 0,
      });

      const scope = await tenantScopeIds(ctx.principal);
      const existing = await db.select().from(s.familyScenarioModels).where(inArray(s.familyScenarioModels.tenantId, scope));

      let persisted: { modelId: string; resultIds: string[] } | null = null;
      if (body.persist !== false) {
        const modelId = newId(ID_PREFIX.foScenarioModel);
        const resultIds: string[] = [];
        await withAuditTransaction(
          async () => {
            await db.insert(s.familyScenarioModels).values({
              id: modelId,
              tenantId: ctx.principal.tenantId,
              name: `Capital simulation — ${body.years} years`,
              scenarioType: "CAPITAL_SIMULATION",
              inputs: { ...body },
              assumptions: projection.assumptions,
              basis: "SCENARIO",
              outcomeGuaranteed: false,
              createdBy: ctx.principal.userId,
              asOf: todayIso(),
              classification: "RESTRICTED",
            });
            for (const year of projection.schedule) {
              const resultId = newId(ID_PREFIX.foScenarioResult);
              resultIds.push(resultId);
              await db.insert(s.familyScenarioResults).values({
                id: resultId,
                tenantId: ctx.principal.tenantId,
                scenarioModelId: modelId,
                caseLabel: `Year ${year.year}`,
                axis: "TIME",
                shockBps: null,
                outputs: {
                  year: year.year,
                  nominal: minorToNumeric(year.nominalMinor),
                  real: minorToNumeric(year.realMinor),
                  contributions: minorToNumeric(year.contributionsMinor),
                  withdrawals: minorToNumeric(year.withdrawalsMinor),
                  growth: minorToNumeric(year.growthMinor),
                  currency: body.currency,
                },
                basis: "SCENARIO",
              });
            }
            return { modelId };
          },
          (r) => ({
            tenantId: ctx.principal.tenantId,
            actorUserId: ctx.principal.userId,
            actorType: "HUMAN" as const,
            action: "family.scenario.simulate",
            objectType: "FAMILY_SCENARIO_MODEL",
            objectId: r.modelId,
            outcome: "SUCCESS" as const,
            authority: "familyoffice:scenario.simulate",
            newValue: { scenarioType: "CAPITAL_SIMULATION", years: body.years, currency: body.currency },
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
            traceId: ctx.traceId,
          }),
        );
        persisted = { modelId, resultIds };
      }

      return apiOk(
        {
          projection: {
            ...projection,
            schedule: projection.schedule.map((y) => ({ ...y, nominal: minorToNumeric(y.nominalMinor), real: minorToNumeric(y.realMinor) })),
            terminalNominal: minorToNumeric(projection.terminalNominalMinor),
            terminalReal: minorToNumeric(projection.terminalRealMinor),
            currency: body.currency,
          },
          persisted,
          existingScenarioCount: existing.length,
          disclaimer: "This is a projection, not a forecast and never a guarantee. Every input is an assumption supplied by the caller.",
        },
        ctx.traceId,
      );
    },
  );
}
