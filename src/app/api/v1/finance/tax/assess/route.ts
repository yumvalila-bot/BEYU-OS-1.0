import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { legalEntities, taxStrategies } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { assessTaxStrategy } from "@/lib/tax";
import { evaluatePolicy } from "@/lib/policy";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { withAuditTransaction } from "@/lib/audit";

export const dynamic = "force-dynamic";

// `.strict()`: an unknown field is a contract violation (possible forged or
// mis-directed input) and must fail loudly with 422, never be silently ignored.
const AssessSchema = z
  .object({
    strategyId: z.string().min(3),
    legalEntityId: z.string().min(3),
    baseAmount: z.number().nonnegative().max(1_000_000_000_000),
    facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])),
  })
  .strict();

/**
 * POST /api/v1/finance/tax/assess
 * Jurisdiction-gated eligibility assessment. Never recommends evasion; every
 * outcome carries legal basis, evidence, risk and the governance requirement.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:tax.assess",
      action: "finance.tax.assess",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "TAX_ASSESSMENT" },
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, AssessSchema);

      const scope = await tenantScopeIds(ctx.principal);
      const [strategy] = await db.select().from(taxStrategies).where(eq(taxStrategies.id, body.strategyId)).limit(1);
      if (!strategy) return apiError("NOT_FOUND", "Tax strategy not found.", 404, ctx.traceId);

      // The entity is client-selected input, not authority. Resolve it only inside
      // the caller's canonical tenant and legal-entity scope. Without this
      // predicate a sector principal could assess (and receive the name of) an
      // entity from another tenant whenever database RLS was not the connection
      // that served this query.
      const [entity] = await db
        .select()
        .from(legalEntities)
        .where(and(eq(legalEntities.id, body.legalEntityId), inArray(legalEntities.tenantId, scope)))
        .limit(1);
      if (!entity || (ctx.principal.entityScope.length > 0 && !ctx.principal.entityScope.includes(entity.id))) {
        return apiError("NOT_FOUND", "Legal entity not found.", 404, ctx.traceId);
      }

      const policy = await evaluatePolicy({
        action: "finance:tax.assess",
        tenantId: ctx.principal.tenantId,
        jurisdictionCode: entity.countryCode,
        roles: ctx.principal.roles,
        amount: body.baseAmount,
      });
      if (policy.effect === "DENY") {
        return apiError("POLICY_DENIED", policy.denials.map((d) => d.message).join(" "), 403, ctx.traceId);
      }

      const outcome = assessTaxStrategy({
        strategy: {
          code: strategy.code,
          title: strategy.title,
          jurisdictionCode: strategy.jurisdictionCode,
          position: strategy.position,
          authorityStatus: strategy.authorityStatus,
          effectiveFrom: strategy.effectiveFrom,
          effectiveTo: strategy.effectiveTo,
          reviewDate: strategy.reviewDate,
          benefitRate: strategy.benefitRate ? Number(strategy.benefitRate) : null,
          complianceRisk: strategy.complianceRisk,
          auditRisk: strategy.auditRisk,
          legalRisk: strategy.legalRisk,
          reputationalRisk: strategy.reputationalRisk,
          requiredApprovals: strategy.requiredApprovals,
          eligibilityCriteria: strategy.eligibilityCriteria,
          economicBenefitBasis: strategy.economicBenefitBasis,
        },
        taxpayerJurisdiction: entity.countryCode,
        facts: { jurisdiction: entity.countryCode, ...body.facts },
        baseAmount: body.baseAmount,
      });

      const payload = {
        strategy: {
          code: strategy.code,
          title: strategy.title,
          jurisdiction: strategy.jurisdictionCode,
          position: strategy.position,
          statutoryReference: strategy.statutoryReference,
          authorityStatus: strategy.authorityStatus,
          documentationRequirements: strategy.documentationRequirements,
          implementationSteps: strategy.implementationSteps,
          alternatives: strategy.alternatives,
          provenance: strategy.provenanceSource,
        },
        entity: { code: entity.code, legalName: entity.legalName, jurisdiction: entity.countryCode },
        outcome,
        policyObligations: policy.obligations,
        disclaimer:
          "Machine assessment only. It is not legal or tax advice and may not be relied upon until reviewed and approved by a qualified human through the Tax Governance workflow.",
      };

      // Tax assessment is non-authoritative analysis, but its audit and event
      // evidence must still be committed as one traceable observation.
      await withAuditTransaction(
        async () => payload,
        () => ({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "finance.tax.assess",
          objectType: "TAX_STRATEGY",
          objectId: strategy.id,
          newValue: { entity: entity.code, eligibility: outcome.eligibility, blocked: outcome.blocked },
          authority: "finance:tax.assess",
          policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(","),
          ipAddress: ctx.ip,
          traceId: ctx.traceId,
        }),
        () => ({
          type: "TAX_STRATEGY_ASSESSED",
          source: "beyu-os/finance",
          domain: "TAX",
          operation: "ASSESS_STRATEGY",
          destinationDomain: null,
          tenantId: ctx.principal.tenantId,
          legalEntityId: entity.id,
          subjectType: "TAX_STRATEGY",
          subjectId: strategy.id,
          actorUserId: ctx.principal.userId,
          classification: "RESTRICTED" as const,
          payload: { eligibility: outcome.eligibility, entity: entity.code },
          traceId: ctx.traceId,
          correlationId: ctx.traceId,
          causationId: null,
          authorityContext: {
            authorityId: null,
            decisionId: null,
            capabilityCode: null,
            permissionCode: "finance:tax.assess",
            policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null,
          },
          policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null,
        }),
      );

      return apiOk(payload, ctx.traceId);
    },
  );
}
