import { z } from "zod";
import { apiOk, guarded } from "@/lib/api";
import { readLiquidity } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

const FlowSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    direction: z.enum(["INFLOW", "OUTFLOW"]),
    amountMinor: z.number().int().nonnegative(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    description: z.string().trim().max(500),
    certainty: z.enum(["CONTRACTUAL", "EXPECTED", "ESTIMATED"]),
  })
  .strict();

const RungSchema = z
  .object({
    band: z.enum(["GREEN", "YELLOW", "ORANGE", "RED", "BLACK"]),
    threshold: z
      .object({
        code: z.string().trim().min(1).max(50),
        value: z.number().int(),
        unit: z.enum(["BPS", "MINOR_UNITS", "COUNT"]),
        /** MAX = ceiling, breached at or above. MIN = floor, breached at or below. */
        direction: z.enum(["MAX", "MIN"]),
        /** Required: a threshold nobody can point to a ratified source for is not a threshold. */
        sourceReference: z.string().trim().min(1).max(200),
        effectiveFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
        effectiveTo: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      })
      .strict(),
  })
  .strict();

const ComputeSchema = z
  .object({
    asOf: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    liquidMinor: z.number().int().nonnegative(),
    nearLiquidMinor: z.number().int().nonnegative(),
    illiquidMinor: z.number().int().nonnegative(),
    flows: z.array(FlowSchema).default([]),
    /**
     * Optional. Every rung's threshold needs a `sourceReference` and an
     * `effectiveFrom`; the engine refuses a rung without provenance, because a
     * hard-coded "RED at 80% coverage" would be an unratified risk appetite
     * presented as a fact.
     */
    coverageLadder: z
      .object({
        measureCode: z.string().trim().min(1).max(100),
        rungs: z.array(RungSchema).min(1),
        healthyBand: z.enum(["GREEN", "YELLOW", "ORANGE", "RED", "BLACK"]),
      })
      .strict()
      .nullish(),
  })
  .strict();

/**
 * POST /api/v1/family-office/liquidity
 *
 * The liquidity engine (§19): the 30/90/180/365-day ladder plus alerts.
 *
 * POST because the caller supplies the resource balances and expected flows.
 * Every alert is `advisoryOnly: true` — an alert reports a projection, it never
 * freezes, transfers or approves anything (§19).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:liquidity.read", action: "family.liquidity.compute", rateLimit: { limit: 40, windowMs: 60_000 }, audit: { objectType: "FAMILY_LIQUIDITY" } },
    async (ctx) => {
      const body = ComputeSchema.parse(await ctx.request.json().catch(() => ({})));
      const result = await readLiquidity(ctx.principal, {
        asOf: body.asOf ?? todayIso(),
        currency: body.currency,
        liquidMinor: body.liquidMinor,
        nearLiquidMinor: body.nearLiquidMinor,
        illiquidMinor: body.illiquidMinor,
        flows: body.flows,
        coverageLadder: body.coverageLadder
          ? {
              measureCode: body.coverageLadder.measureCode,
              rungs: body.coverageLadder.rungs.map((r) => ({
                band: r.band,
                threshold: { ...r.threshold, effectiveTo: r.threshold.effectiveTo ?? null },
              })),
              healthyBand: body.coverageLadder.healthyBand,
            }
          : null,
      });
      return apiOk(
        {
          ...result,
          /** A projection is a projection. No horizon here is a commitment. */
          basis: "SCENARIO",
          outcomeGuaranteed: false,
          advisoryOnly: true,
        },
        ctx.traceId,
      );
    },
  );
}
