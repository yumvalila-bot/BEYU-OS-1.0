import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dilutionScenarios } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { EQUITY_ERROR_STATUS, EquityError } from "@/lib/equity/errors";
import { EquityModelError } from "@/lib/equity/model";
import { createDilutionScenario } from "@/lib/equity/service";

export const dynamic = "force-dynamic";

const SCENARIO_TYPES = [
  "NEW_FINANCING",
  "ESOP_EXPANSION",
  "FOUNDER_ISSUANCE",
  "INVESTOR_ISSUANCE",
  "CONVERSION",
  "OPTION_EXERCISE",
  "ACQUISITION",
  "SECONDARY_TRANSFER",
  "RECAPITALIZATION",
] as const;

const TransactionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("NEW_ISSUANCE"), toHolder: z.string().trim().min(1).max(100), toGroup: z.string().trim().min(1).max(40), shares: z.number().int().positive() }),
  z.object({ type: z.literal("ESOP_POOL_EXPANSION"), shares: z.number().int().positive() }),
  z.object({ type: z.literal("OPTION_EXERCISE"), holder: z.string().trim().min(1).max(100), group: z.string().trim().min(1).max(40), shares: z.number().int().positive() }),
  z.object({ type: z.literal("CONVERSION"), toHolder: z.string().trim().min(1).max(100), toGroup: z.string().trim().min(1).max(40), shares: z.number().int().positive() }),
  z.object({ type: z.literal("SECONDARY_TRANSFER"), fromHolder: z.string().trim().min(1).max(100), toHolder: z.string().trim().min(1).max(100), group: z.string().trim().min(1).max(40), shares: z.number().int().positive() }),
]);

const CreateScenarioSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  scenarioType: z.enum(SCENARIO_TYPES),
  assumptions: z.record(z.unknown()).optional(),
  transactions: z.array(TransactionSchema).min(1).max(50),
  decisionOwnerUserId: z.string().trim().max(100).nullish(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
});

/**
 * POST /api/v1/equity/dilution
 *
 * Create a dilution scenario (§14): pre → transaction → post computed by the
 * deterministic engine against the CURRENT canonical cap table and stored as
 * ANALYSIS with `execution_prohibited = true`. A scenario never alters
 * historical actuals and never executes; turning one into reality is a separate
 * governed mutation with its own authority.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:dilution.simulate",
      action: "equity.dilution.simulate",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "DILUTION_SCENARIO" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      try {
        const body = CreateScenarioSchema.parse(raw);
        return await withIdempotency(ctx, "equity.dilution.create-scenario", body, async () => ({
          status: 201,
          body: await createDilutionScenario(ctx.principal, body, {
            traceId: ctx.traceId,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
          }),
        }));
      } catch (err) {
        if (err instanceof EquityError) {
          return apiError(err.code, err.message, EQUITY_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        if (err instanceof EquityModelError) {
          return apiError("MODEL_ERROR", err.message, 422, ctx.traceId, { code: err.code });
        }
        throw err;
      }
    },
  );
}

/** GET /api/v1/equity/dilution?legalEntityId=… — scenarios for an entity (visibility only). */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "equity:dilution.read", action: "equity.dilution.read", audit: { objectType: "DILUTION_SCENARIO" } },
    async (ctx) => {
      const legalEntityId = new URL(request.url).searchParams.get("legalEntityId");
      if (!legalEntityId) {
        return apiError("VALIDATION_FAILED", "legalEntityId query parameter is required.", 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const rows = await db
        .select()
        .from(dilutionScenarios)
        .where(and(eq(dilutionScenarios.legalEntityId, legalEntityId), inArray(dilutionScenarios.tenantId, scope)));
      return apiOk({ scenarios: rows }, ctx.traceId);
    },
  );
}
