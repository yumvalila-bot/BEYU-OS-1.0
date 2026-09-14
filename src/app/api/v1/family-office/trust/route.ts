import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import {
  FAMILY_TRUST_ERROR_STATUS,
  FamilyTrustError,
  createTrustInstrument,
  createTrustProvision,
  proposeTrustDistribution,
  readTrustGovernance,
  recordTrustDecision,
  transitionTrustDecision,
  transitionTrustDistribution,
  transitionTrustInstrument,
  transitionTrustProvision,
} from "@/lib/family/office/trust-governance-service";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CreateInstrumentSchema = z.object({
  trustEntityId: z.string().trim().min(1).max(100),
  instrumentName: z.string().trim().min(1).max(200),
  instrumentType: z.enum(["DEED", "AMENDMENT", "RESTATEMENT", "SUPPLEMENTAL", "TRUSTEE_APPOINTMENT", "OTHER"]).optional(),
  jurisdictionCode: z.string().trim().min(2).max(20),
  settlorPartyId: z.string().trim().max(100).nullish(),
  documentRef: z.string().trim().min(1).max(200),
  supersedesInstrumentId: z.string().trim().max(100).nullish(),
  effectiveDate: z.string().trim().regex(ISO_DATE).nullish(),
});

const TransitionInstrumentSchema = z.object({
  instrumentId: z.string().trim().min(1).max(100),
  to: z.enum(["LEGAL_REVIEW", "APPROVED", "EXECUTED", "EXPIRED", "DISPUTED"]),
  legalReviewStatus: z.string().trim().max(60).optional(),
  approvedByResolutionId: z.string().trim().max(100).optional(),
});

const CreateProvisionSchema = z.object({
  instrumentId: z.string().trim().min(1).max(100),
  provisionType: z.enum([
    "SPENDTHRIFT",
    "NO_CONTEST",
    "DISCRETIONARY_DISTRIBUTION",
    "TRUSTEE_REMOVAL",
    "TRUSTEE_REPLACEMENT",
    "TRUSTEE_SUCCESSION",
    "BENEFICIARY_ELIGIBILITY",
    "DISTRIBUTION_STANDARD",
    "OTHER",
  ]),
  jurisdictionCode: z.string().trim().min(2).max(20),
  summary: z.string().trim().min(1).max(4000),
  clauseDocumentRef: z.string().trim().max(200).nullish(),
});

const TransitionProvisionSchema = z.object({
  provisionId: z.string().trim().min(1).max(100),
  toLegalEffectStatus: z.enum([
    "INERT",
    "UNDER_LEGAL_REVIEW",
    "LEGAL_REVIEWED",
    "APPROVED",
    "EXECUTED",
    "DISPUTED",
    "UNENFORCEABLE_IN_JURISDICTION",
  ]),
  legalEffectReference: z.string().trim().max(200).nullish(),
  approvedByResolutionId: z.string().trim().max(100).optional(),
});

const RecordDecisionSchema = z.object({
  instrumentId: z.string().trim().min(1).max(100),
  decisionType: z.enum([
    "TRUSTEE_APPOINTMENT",
    "TRUSTEE_REMOVAL",
    "TRUSTEE_REPLACEMENT",
    "TRUSTEE_SUCCESSION",
    "CONFLICT_DECLARED",
    "RECUSAL",
    "DISTRIBUTION_APPROVAL",
    "OTHER",
  ]),
  subjectPartyId: z.string().trim().max(100).nullish(),
  rationale: z.string().trim().min(1).max(4000),
  dataBasis: z.string().trim().max(4000).nullish(),
  consequences: z.string().trim().max(4000).nullish(),
  authorityKind: z.enum(["RESOLUTION", "DELEGATION"]).optional(),
  authorityRef: z.string().trim().max(100).nullish(),
  effectiveDate: z.string().trim().regex(ISO_DATE).nullish(),
  evidenceDocumentRefs: z.array(z.string().trim().max(200)).max(20).optional(),
  conflictOfInterest: z.boolean().optional(),
});

const TransitionDecisionSchema = z.object({
  decisionId: z.string().trim().min(1).max(100),
  to: z.enum(["APPROVED", "EXECUTED", "REJECTED", "DISPUTED", "WITHDRAWN"]),
  authorityRef: z.string().trim().max(100).optional(),
});

const ProposeDistributionSchema = z.object({
  instrumentId: z.string().trim().min(1).max(100),
  beneficiaryId: z.string().trim().min(1).max(100),
  distributionType: z.enum(["DISCRETIONARY", "MANDATORY", "HARDSHIP", "EDUCATION", "MEDICAL", "OTHER"]),
  amount: z.string().trim().regex(/^\d+(\.\d{1,2})?$/).nullish(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).nullish(),
  assetDescription: z.string().trim().max(2000).nullish(),
  discretionBasis: z.string().trim().max(4000).nullish(),
  conditionsMet: z.record(z.unknown()).optional(),
  effectiveDate: z.string().trim().regex(ISO_DATE).nullish(),
});

const TransitionDistributionSchema = z.object({
  distributionId: z.string().trim().min(1).max(100),
  to: z.enum(["APPROVED", "EXECUTED", "REJECTED", "REVERSED", "DISPUTED"]),
  resolutionRef: z.string().trim().max(100).optional(),
  approvalRef: z.string().trim().max(200).nullish(),
});

/**
 * GET /api/v1/family-office/trust?trustEntityId=…
 *
 * The governed trust view: instruments, provisions (with legal-effect state),
 * trustee decisions, distributions and the CURRENT trustees read from the
 * canonical `entity_appointments` registry. Visibility only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:trust.read",
      action: "family.trust.read",
      audit: { objectType: "TRUST_INSTRUMENT" },
    },
    async (ctx) => {
      const trustEntityId = new URL(request.url).searchParams.get("trustEntityId");
      if (!trustEntityId) {
        return apiError("VALIDATION_FAILED", "trustEntityId query parameter is required.", 422, ctx.traceId);
      }
      try {
        const view = await readTrustGovernance(ctx.principal, { trustEntityId });
        return apiOk(view, ctx.traceId);
      } catch (err) {
        if (err instanceof FamilyTrustError) {
          return apiError(err.code, err.message, FAMILY_TRUST_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err;
      }
    },
  );
}

/**
 * POST /api/v1/family-office/trust
 *
 * Family Trust governance mutations (§8/§11/§48):
 *   CREATE_INSTRUMENT / TRANSITION_INSTRUMENT — versioned instruments with the
 *     lifecycle DRAFT → LEGAL_REVIEW → APPROVED → EXECUTED → SUPERSEDED |
 *     EXPIRED | DISPUTED (approval/execution require an APPROVED resolution and
 *     a recorded human legal-review closure);
 *   CREATE_PROVISION / TRANSITION_PROVISION — jurisdiction-aware provisions
 *     (spendthrift, no-contest, discretionary distribution, trustee removal…)
 *     that stay INERT without a ratified legal-effect reference;
 *   RECORD_DECISION / TRANSITION_DECISION — trustee decisions; executing an
 *     appointment/removal writes the canonical entity_appointments registry and
 *     emits TRUSTEE_CHANGED;
 *   PROPOSE_DISTRIBUTION / TRANSITION_DISTRIBUTION — distribution decision
 *     records; execution moves payment_status to PENDING and Finance OS remains
 *     the money authority (never a posting).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:trust.manage",
      action: "family.trust.manage",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "TRUST_INSTRUMENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const context = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "CREATE_INSTRUMENT": {
            const body = CreateInstrumentSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.create-instrument", body, async () => ({
              status: 201,
              body: await createTrustInstrument(ctx.principal, body, context),
            }));
          }
          case "TRANSITION_INSTRUMENT": {
            const body = TransitionInstrumentSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.transition-instrument", body, async () => ({
              status: 200,
              body: await transitionTrustInstrument(ctx.principal, body, context),
            }));
          }
          case "CREATE_PROVISION": {
            const body = CreateProvisionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.create-provision", body, async () => ({
              status: 201,
              body: await createTrustProvision(ctx.principal, body, context),
            }));
          }
          case "TRANSITION_PROVISION": {
            const body = TransitionProvisionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.transition-provision", body, async () => ({
              status: 200,
              body: await transitionTrustProvision(ctx.principal, body, context),
            }));
          }
          case "RECORD_DECISION": {
            const body = RecordDecisionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.record-decision", body, async () => ({
              status: 201,
              body: await recordTrustDecision(ctx.principal, body, context),
            }));
          }
          case "TRANSITION_DECISION": {
            const body = TransitionDecisionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.transition-decision", body, async () => ({
              status: 200,
              body: await transitionTrustDecision(ctx.principal, body, context),
            }));
          }
          case "PROPOSE_DISTRIBUTION": {
            const body = ProposeDistributionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.propose-distribution", body, async () => ({
              status: 201,
              body: await proposeTrustDistribution(ctx.principal, body, context),
            }));
          }
          case "TRANSITION_DISTRIBUTION": {
            const body = TransitionDistributionSchema.parse(raw);
            return await withIdempotency(ctx, "family.trust.transition-distribution", body, async () => ({
              status: 200,
              body: await transitionTrustDistribution(ctx.principal, body, context),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of CREATE_INSTRUMENT, TRANSITION_INSTRUMENT, CREATE_PROVISION, TRANSITION_PROVISION, RECORD_DECISION, TRANSITION_DECISION, PROPOSE_DISTRIBUTION, TRANSITION_DISTRIBUTION.",
              422,
              ctx.traceId,
            );
        }
      } catch (err) {
        if (err instanceof FamilyTrustError) {
          return apiError(err.code, err.message, FAMILY_TRUST_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err;
      }
    },
  );
}
