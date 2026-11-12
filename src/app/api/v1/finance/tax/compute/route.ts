import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { jurisdictions, legalEntities, taxReturnDrafts } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { evaluatePolicy } from "@/lib/policy";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { computeTanzaniaTax, prepareTaxFilingPack } from "@/lib/finance/tanzania-tax-computation-engine";

export const dynamic = "force-dynamic";

const base = {
  legalEntityId: z.string().min(3).max(128),
  jurisdictionCode: z.literal("TZ_MAINLAND"),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
};

const ComputeSchema = z.discriminatedUnion("taxType", [
  z.object({ ...base, taxType: z.literal("PAYE"), monthlyTaxablePayTzs: z.number().int().nonnegative().safe(), employeeStatus: z.enum(["RESIDENT_PRIMARY", "RESIDENT_SECONDARY", "NON_RESIDENT", "NON_FULL_TIME_DIRECTOR"]).optional() }),
  z.object({ ...base, taxType: z.literal("CORPORATE_INCOME_TAX"), taxableIncomeTzs: z.number().int().nonnegative().safe(), specialRegimeClaimed: z.boolean().optional() }),
  z.object({ ...base, taxType: z.literal("PERSONAL_INCOME_TAX"), annualTaxableIncomeTzs: z.number().int().nonnegative().safe(), nonResident: z.boolean().optional() }),
  z.object({ ...base, taxType: z.literal("PRESUMPTIVE_INCOME_TAX"), annualTurnoverTzs: z.number().int().nonnegative().safe(), records: z.enum(["COMPLETE", "INCOMPLETE"]), newBusinessReliefApproved: z.boolean().optional() }),
  z.object({ ...base, taxType: z.literal("VAT"), taxableSuppliesTzs: z.number().int().nonnegative().safe(), inputVatCreditTzs: z.number().int().nonnegative().safe().optional() }),
  z.object({ ...base, taxType: z.literal("VAT_WITHHOLDING"), taxableValueTzs: z.number().int().nonnegative().safe(), supplyType: z.enum(["GOODS", "SERVICES", "MIXED"]) }),
  z.object({ ...base, taxType: z.literal("WITHHOLDING_TAX"), grossPaymentTzs: z.number().int().nonnegative().safe(), category: z.enum(["DIVIDEND_LISTED", "DIVIDEND_OTHER", "INTEREST", "ROYALTY", "OTHER_INVESTMENT_RETURN", "COMMERCIAL_RENT", "MINING_TECHNICAL_SERVICE", "NON_RESIDENT_TRANSPORT", "NON_RESIDENT_INSURANCE", "GAMING_ADVERTISING_COMMISSION", "SALT_PURCHASE", "MOTOR_VEHICLE_HIRE", "FOREST_PRODUCE", "NATURAL_RESOURCE_PAYMENT", "SERVICE_FEE", "NON_FULL_TIME_DIRECTOR_FEE", "MOBILE_MONEY_AGENT_COMMISSION", "GOVERNMENT_GOODS_SUPPLY", "AIRCRAFT_PAYMENT", "CARBON_CREDIT", "PRECIOUS_METALS"]), payeeResidency: z.enum(["RESIDENT", "NON_RESIDENT"]), treatyReliefClaimed: z.boolean().optional() }),
  z.object({ ...base, taxType: z.literal("CUSTOMS_PROCESSING_FEE"), cargoType: z.enum(["DRY_NON_PETROLEUM", "WET_PETROLEUM"]), importOrigin: z.enum(["NON_EAC", "EAC_NON_ORIGINATING", "EAC_ORIGINATING"]), fobValueTzs: z.number().int().nonnegative().safe().optional(), vesselCount: z.number().int().positive().safe().optional(), exemptionClaimed: z.boolean().optional() }),
]);

/**
 * POST /api/v1/finance/tax/compute
 * Calculates a source-cited provisional estimate and creates a filing pack.
 * It does not submit to TRA, create a tax liability posting, or mark a return filed.
 */
export async function POST(request: Request) {
  return guarded(request, {
    permission: "finance:tax.assess",
    action: "finance.tax.compute",
    rateLimit: { limit: 30, windowMs: 60_000 },
    audit: { objectType: "TAX_CALCULATION" },
  }, async (ctx) => {
    const body = await parseBody(ctx.request, ComputeSchema);
    const scope = await tenantScopeIds(ctx.principal);
    const [entity] = await db.select().from(legalEntities).where(and(
      eq(legalEntities.id, body.legalEntityId),
      inArray(legalEntities.tenantId, scope),
      inArray(legalEntities.classification, classificationsAtOrBelow(ctx.principal.clearance)),
    )).limit(1);
    if (!entity || entity.countryCode !== "TZ" || !entity.jurisdictionId ||
      (ctx.principal.entityScope.length > 0 && !ctx.principal.entityScope.includes(entity.id))) {
      return apiError("NOT_FOUND", "Tanzania Mainland legal entity not found in your authorized scope.", 404, ctx.traceId);
    }
    const [jurisdiction] = await db.select().from(jurisdictions).where(eq(jurisdictions.id, entity.jurisdictionId)).limit(1);
    if (!jurisdiction || !["TZ_MAINLAND", "TZ-MAINLAND", "TANZANIA_MAINLAND"].includes(jurisdiction.code)) {
      return apiError("JURISDICTION_MISMATCH", "The selected entity is not explicitly assigned to the Tanzania Mainland jurisdiction.", 422, ctx.traceId);
    }
    const amount = "monthlyTaxablePayTzs" in body ? body.monthlyTaxablePayTzs
      : "taxableIncomeTzs" in body ? body.taxableIncomeTzs
      : "annualTaxableIncomeTzs" in body ? body.annualTaxableIncomeTzs
      : "annualTurnoverTzs" in body ? body.annualTurnoverTzs
      : "taxableSuppliesTzs" in body ? body.taxableSuppliesTzs
      : "grossPaymentTzs" in body ? body.grossPaymentTzs
      : "fobValueTzs" in body ? (body.fobValueTzs ?? 0)
      : (body.vesselCount ?? 0) * 20_000_000;
    const policy = await evaluatePolicy({
      action: "finance:tax.assess",
      tenantId: entity.tenantId,
      jurisdictionCode: jurisdiction.code,
      roles: ctx.principal.roles,
      amount,
    });
    if (policy.effect === "DENY") return apiError("POLICY_DENIED", policy.denials.map((d) => d.message).join(" "), 403, ctx.traceId);

    try {
      const calculation = body.taxType === "CUSTOMS_PROCESSING_FEE"
        ? computeTanzaniaTax({ ...body, originEvidenceVerified: false })
        : computeTanzaniaTax(body);
      const tin = entity.taxIdentifier ?? "";
      const filingPack = /^\d{9}$/.test(tin) ? prepareTaxFilingPack({
        taxpayer: { legalEntityId: entity.id, legalName: entity.legalName, tin },
        periodStart: body.periodStart,
        periodEnd: body.periodEnd,
        calculation,
      }) : null;
      let draftId: string | null = null;
      if (filingPack) {
        draftId = randomUUID();
        await db.insert(taxReturnDrafts).values({
          id: draftId,
          tenantId: entity.tenantId,
          legalEntityId: entity.id,
          taxType: calculation.taxType,
          jurisdictionCode: "TZ_MAINLAND",
          periodStart: body.periodStart,
          periodEnd: body.periodEnd,
          dueDate: filingPack.dueDate,
          amountPayable: String(calculation.taxAmountTzs),
          currency: "TZS",
          calculationVersion: calculation.formulaVersion,
          calculationPayload: calculation,
          filingPack,
          status: "DRAFT",
          classification: "CONFIDENTIAL",
          idempotencyKey: randomUUID(),
          createdBy: ctx.principal.userId,
        });
      }
      return apiOk({
        entity: { id: entity.id, code: entity.code, legalName: entity.legalName, jurisdiction: jurisdiction.code },
        calculation,
        filingPack,
        draftId,
        filingReadiness: filingPack ? "DRAFT_PACK_PREPARED" : "TIN_REQUIRED_TO_PREPARE_DRAFT_PACK",
        governance: {
          specialistReviewRequired: true,
          canSubmit: false,
          canPost: false,
          reason: "The calculation is a provisional estimate pending original-source checksum verification, statutory crosswalk and specialist approval. TRA submission remains a separate human-authorized action.",
        },
      }, ctx.traceId);
    } catch (error) {
      return apiError("TAX_CALCULATION_REJECTED", error instanceof Error ? error.message : "Tax calculation rejected.", 422, ctx.traceId);
    }
  });
}
