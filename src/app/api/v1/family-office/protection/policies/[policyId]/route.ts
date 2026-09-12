import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { getPolicyDetail, updatePolicy } from "@/lib/family-office-protection-service";
import { protectionError } from "../../_common";
import { todayIso } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * PATCH payload: the governed patch set. `status` and `governanceStage` are
 * NOT patchable — lifecycles move through their own endpoints, where the
 * transition is validated and evidenced (no silent state edits).
 */
const PatchPolicySchema = z
  .object({
    policyNumber: z.string().trim().min(1).max(100).optional(),
    insurerRef: z.string().trim().min(1).max(200).optional(),
    brokerRef: z.string().trim().max(200).nullable().optional(),
    ownerRef: z.string().trim().min(1).max(200).nullable().optional(),
    ownerKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "TRUST", "OTHER"]).nullable().optional(),
    insuredRef: z.string().trim().min(1).max(200).nullable().optional(),
    insuredKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "TRUST", "OTHER"]).nullable().optional(),
    premiumPayerRef: z.string().trim().min(1).max(200).nullable().optional(),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/).nullable().optional(),
    legalEntityId: z.string().trim().min(1).max(100).nullable().optional(),
    coverageAmountMinor: z.number().int().nonnegative().optional(),
    deathBenefitMinor: z.number().int().nonnegative().optional(),
    cashValueMinor: z.number().int().nonnegative().nullable().optional(),
    surrenderValueMinor: z.number().int().nonnegative().nullable().optional(),
    premiumAmountMinor: z.number().int().nonnegative().optional(),
    premiumFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "SINGLE"]).optional(),
    nextPremiumDueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    maturityDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    reviewIntervalDays: z.number().int().min(1).max(3650).nullable().optional(),
    nextReviewDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    purpose: z.string().trim().min(1).max(2000).optional(),
    successionPlanRef: z.string().trim().max(200).nullable().optional(),
    liquidityObjectiveRef: z.string().trim().max(200).nullable().optional(),
    riskAssessmentRef: z.string().trim().max(200).nullable().optional(),
    hcmEmployeeRef: z.string().trim().max(200).nullable().optional(),
    documentRefs: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
    jurisdictionRef: z.string().trim().max(200).nullable().optional(),
    amountProvenance: z.enum(["VERIFIED", "USER_PROVIDED", "MODELLED", "ESTIMATED", "UNVERIFIED"]).optional(),
    amountSourceRef: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

const FORBIDDEN_PATCH_KEYS = ["status", "governanceStage", "tenantId", "id", "authoritativeOwner", "financeRecordRef"] as const;

/**
 * GET /api/v1/family-office/protection/policies/:policyId
 *
 * The full detail read (§25): ownership, insured, designations with allocation
 * audit, premiums with read-time OVERDUE state, assignments, loans, reviews,
 * claims, flags from the review engine, and the validation state of the record
 * itself. Cross-tenant and out-of-scope ids read as 404 — no existence oracle.
 */
export async function GET(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.policy.read",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY", objectId: policyId },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        return apiError("VALIDATION", "asOf must be an ISO calendar date.", 422, ctx.traceId);
      }
      try {
        const detail = await getPolicyDetail(ctx.principal, policyId, asOf);
        return apiOk(detail, ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

/**
 * PATCH /api/v1/family-office/protection/policies/:policyId
 *
 * Amends recorded fields; the WHOLE amended record is re-validated by the
 * engine before anything persists, so an amendment can never leave a
 * previously consistent policy in an inconsistent state.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.policy.update",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forbidden = FORBIDDEN_PATCH_KEYS.find((k) => k in raw);
      if (forbidden) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forbidden}' is not patchable; lifecycle changes move through the status/governance endpoints.`, 422, ctx.traceId);
      }
      const body = PatchPolicySchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.policy.update", { policyId, body }, async () => {
          const result = await updatePolicy(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            body as never,
          );
          return { status: 200, body: result };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

