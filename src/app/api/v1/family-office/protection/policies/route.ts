import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import {
  FAMILY_OFFICE_PROTECTION_ERROR_STATUS,
  FamilyOfficeProtectionError,
  createPolicy,
  listPolicies,
  type CreatePolicyInput,
} from "@/lib/family-office-protection-service";
import { todayIso } from "../../_common";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/family-office/protection/policies
 *
 * Records a life-insurance policy the family governs. Recording is NOT
 * buying: nothing here contacts an insurer, binds coverage or moves money.
 * Money arrives as INTEGER MINOR UNITS (§33), amounts carry provenance (§11),
 * and the death benefit is recorded as contingent protection — it enters no
 * wealth total anywhere in this API (§4).
 */
const CreatePolicySchema = z
  .object({
    policyNumber: z.string().trim().min(1).max(100),
    policyType: z.enum([
      "PERSONAL_LIFE",
      "FAMILY_PROTECTION",
      "KEY_PERSON",
      "SHAREHOLDER_BUY_SELL",
      "SUCCESSION_LIQUIDITY",
      "DEBT_PROTECTION",
      "EXECUTIVE_CONTINUITY",
      "GROUP_LIFE",
      "OTHER",
    ]),
    ownerRef: z.string().trim().min(1).max(200).nullish(),
    ownerKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "TRUST", "OTHER"]).nullish(),
    insuredRef: z.string().trim().min(1).max(200).nullish(),
    insuredKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "TRUST", "OTHER"]).nullish(),
    premiumPayerRef: z.string().trim().min(1).max(200).nullish(),
    insurerRef: z.string().trim().min(1).max(200),
    brokerRef: z.string().trim().max(200).nullish(),
    legalEntityId: z.string().trim().min(1).max(100).nullish(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/).nullish(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    coverageAmountMinor: z.number().int().nonnegative(),
    deathBenefitMinor: z.number().int().nonnegative(),
    cashValueMinor: z.number().int().nonnegative().nullish(),
    surrenderValueMinor: z.number().int().nonnegative().nullish(),
    premiumAmountMinor: z.number().int().nonnegative(),
    premiumFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "SINGLE"]),
    nextPremiumDueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    maturityDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    reviewIntervalDays: z.number().int().min(1).max(3650).nullish(),
    nextReviewDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    purpose: z.string().trim().min(1).max(2000),
    successionPlanId: z.string().trim().min(1).max(100).nullish(),
    successionPlanRef: z.string().trim().max(200).nullish(),
    liquidityObjectiveRef: z.string().trim().max(200).nullish(),
    riskAssessmentRef: z.string().trim().max(200).nullish(),
    hcmEmployeeRef: z.string().trim().max(200).nullish(),
    documentRefs: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    jurisdictionRef: z.string().trim().max(200).nullish(),
    amountProvenance: z.enum(["VERIFIED", "USER_PROVIDED", "MODELLED", "ESTIMATED", "UNVERIFIED"]),
    amountSourceRef: z.string().trim().max(200).nullish(),
  })
  .strict();

/** Server-derived or boundary-fixed: a client that sends any of these is refused. */
const SERVER_CONTROLLED = [
  "tenantId",
  "id",
  "status",
  "governanceStage",
  "assignmentStatus",
  "collateralBeneficiaryRef",
  "legalReviewStatus",
  "taxReviewStatus",
  "authoritativeOwner",
  "financeRecordRef",
  "epistemicClass",
  "recordedBy",
  "lastReviewDate",
  "policyLoanOutstanding",
] as const;

/**
 * GET /api/v1/family-office/protection/policies
 *
 * Policies inside the caller's scope, each with its recorded coverage,
 * premium obligation, beneficiary allocation audit and current review flags.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.policies.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        return apiError("VALIDATION", "asOf must be an ISO calendar date.", 422, ctx.traceId);
      }
      const result = await listPolicies(ctx.principal, asOf);
      return apiOk(result, ctx.traceId);
    },
  );
}

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.policy.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is server-derived and cannot be supplied by the client.`, 422, ctx.traceId);
      }
      const body = CreatePolicySchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.policy.create", body, async () => {
          const input: CreatePolicyInput = {
            policyNumber: body.policyNumber,
            policyType: body.policyType,
            ownerRef: body.ownerRef ?? null,
            ownerKind: (body.ownerKind ?? null) as CreatePolicyInput["ownerKind"],
            insuredRef: body.insuredRef ?? null,
            insuredKind: (body.insuredKind ?? null) as CreatePolicyInput["insuredKind"],
            premiumPayerRef: body.premiumPayerRef ?? null,
            insurerRef: body.insurerRef,
            brokerRef: body.brokerRef ?? null,
            legalEntityId: body.legalEntityId ?? null,
            countryCode: body.countryCode ?? null,
            currency: body.currency,
            coverageAmountMinor: body.coverageAmountMinor,
            deathBenefitMinor: body.deathBenefitMinor,
            cashValueMinor: body.cashValueMinor ?? null,
            surrenderValueMinor: body.surrenderValueMinor ?? null,
            premiumAmountMinor: body.premiumAmountMinor,
            premiumFrequency: body.premiumFrequency,
            nextPremiumDueDate: body.nextPremiumDueDate ?? null,
            effectiveDate: body.effectiveDate ?? null,
            maturityDate: body.maturityDate ?? null,
            reviewIntervalDays: body.reviewIntervalDays ?? null,
            nextReviewDate: body.nextReviewDate ?? null,
            purpose: body.purpose,
            successionPlanId: body.successionPlanId ?? null,
            successionPlanRef: body.successionPlanRef ?? null,
            liquidityObjectiveRef: body.liquidityObjectiveRef ?? null,
            riskAssessmentRef: body.riskAssessmentRef ?? null,
            hcmEmployeeRef: body.hcmEmployeeRef ?? null,
            documentRefs: body.documentRefs,
            jurisdictionRef: body.jurisdictionRef ?? null,
            amountProvenance: body.amountProvenance,
            amountSourceRef: body.amountSourceRef ?? null,
          };
          const result = await createPolicy(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            input,
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        if (err instanceof FamilyOfficeProtectionError) {
          return apiError(err.code, err.message, FAMILY_OFFICE_PROTECTION_ERROR_STATUS[err.code], ctx.traceId, { findings: err.findings });
        }
        throw err;
      }
    },
  );
}
