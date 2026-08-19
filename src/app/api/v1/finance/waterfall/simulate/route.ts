import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { waterfallConfigs, waterfallTiers } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody, readIdempotent, writeIdempotent } from "@/lib/api";
import { runWaterfall, type TierType } from "@/lib/waterfall";
import { evaluatePolicy } from "@/lib/policy";
import { recordAudit, publishEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const SimulateSchema = z.object({
  configId: z.string().min(3),
  grossAmount: z.number().nonnegative().max(1_000_000_000_000),
  scenario: z.enum(["BASE", "UPSIDE", "DOWNSIDE", "STRESS"]).default("BASE"),
  overrides: z.record(z.string(), z.number()).optional(),
});

/**
 * POST /api/v1/finance/waterfall/simulate
 * Deterministic, explainable simulation. Simulation never commits cash;
 * committing a distribution requires an approved board resolution (policy ENT-FIN-003).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:waterfall.simulate",
      action: "finance.waterfall.simulate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "WATERFALL_RUN" },
    },
    async (ctx) => {
      const idempotencyKey = ctx.request.headers.get("idempotency-key");
      const cached = readIdempotent(idempotencyKey);
      if (cached) return apiOk(cached, ctx.traceId);

      const body = await parseBody(ctx.request, SimulateSchema);

      const [config] = await db
        .select()
        .from(waterfallConfigs)
        .where(eq(waterfallConfigs.id, body.configId))
        .limit(1);
      if (!config) return apiError("NOT_FOUND", "Waterfall configuration not found.", 404, ctx.traceId);
      if (config.tenantId !== ctx.principal.tenantId) {
        return apiError("FORBIDDEN", "Tenant isolation: configuration belongs to another tenant.", 403, ctx.traceId);
      }

      const policy = await evaluatePolicy({
        action: "finance:waterfall.simulate",
        tenantId: ctx.principal.tenantId,
        jurisdictionCode: config.jurisdictionCode,
        roles: ctx.principal.roles,
        amount: body.grossAmount,
      });
      if (policy.effect === "DENY") {
        return apiError("POLICY_DENIED", policy.denials.map((d) => d.message).join(" "), 403, ctx.traceId);
      }

      const tiers = await db
        .select()
        .from(waterfallTiers)
        .where(eq(waterfallTiers.configId, config.id))
        .orderBy(waterfallTiers.sequence);

      const result = runWaterfall({
        grossAmount: body.grossAmount,
        currency: config.currency,
        scenario: body.scenario,
        tiers: tiers.map((t) => ({
          sequence: t.sequence,
          code: t.code,
          name: t.name,
          tierType: t.tierType as TierType,
          rate: body.overrides?.[t.code] ?? (t.rate ? Number(t.rate) : null),
          fixedAmount: t.fixedAmount ? Number(t.fixedAmount) : null,
          minAmount: t.minAmount ? Number(t.minAmount) : null,
          maxAmount: t.maxAmount ? Number(t.maxAmount) : null,
          beneficiaryType: t.beneficiaryType,
          legalBasis: t.legalBasis,
          mandatory: t.mandatory,
        })),
      });

      const payload = {
        ...result,
        config: { id: config.id, code: config.code, version: config.version, status: config.status },
        governance: {
          simulationOnly: true,
          commitRequires: policy.obligations
            .filter((o) => o.type === "APPROVAL")
            .map((o) => o.approverRole ?? "GOVERNANCE_BODY"),
          approvedByResolutionId: config.approvedByResolutionId,
        },
      };

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "finance.waterfall.simulate",
        objectType: "WATERFALL_CONFIG",
        objectId: config.id,
        newValue: { grossAmount: body.grossAmount, scenario: body.scenario, checksum: result.checksum },
        authority: "finance:waterfall.simulate",
        policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(","),
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });
      await publishEvent({
        type: "WATERFALL_SIMULATED",
        source: "beyu-os/finance",
        tenantId: ctx.principal.tenantId,
        subjectType: "WATERFALL_CONFIG",
        subjectId: config.id,
        actorUserId: ctx.principal.userId,
        classification: "RESTRICTED",
        payload: { scenario: body.scenario, gross: body.grossAmount, checksum: result.checksum },
        traceId: ctx.traceId,
      });

      writeIdempotent(idempotencyKey, payload);
      return apiOk(payload, ctx.traceId);
    },
  );
}
