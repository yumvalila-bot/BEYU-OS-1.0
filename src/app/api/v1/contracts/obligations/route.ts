import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { createObligation, readObligations, transitionObligation } from "@/lib/contracts/service";
import {
  ISO_DATE,
  OBLIGATION_KINDS,
  OBLIGATION_RESPONSIBLE_PARTY_ROLES,
  OBLIGATION_RISK_SEVERITIES,
  OBLIGATION_STATES,
  SEVERITIES,
  contractApiError,
  todayIso,
} from "../_common";

export const dynamic = "force-dynamic";

const CreateSchema = z.object({
  contractId: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(40),
  kind: z.enum(OBLIGATION_KINDS),
  responsiblePartyRole: z.enum(OBLIGATION_RESPONSIBLE_PARTY_ROLES),
  ownerRole: z.string().trim().min(1).max(60),
  deliverable: z.string().trim().min(1).max(2000),
  severity: z.enum(OBLIGATION_RISK_SEVERITIES),
  triggerDate: z.string().trim().regex(ISO_DATE).nullish(),
  deadlineOffsetDays: z.number().int().min(-36_600).max(36_600).nullish(),
  explicitDueDate: z.string().trim().regex(ISO_DATE).nullish(),
  amountMajor: z.number().int().nonnegative().nullish(),
  currencyCode: z.string().trim().length(3).toUpperCase().nullish(),
  financeRecordRef: z.string().trim().max(200).nullish(),
  dependencyObligationId: z.string().trim().max(100).nullish(),
  verificationRequired: z.boolean().optional(),
  evidenceRequired: z.boolean().optional(),
  note: z.string().trim().max(2000).nullish(),
});

const TransitionSchema = z.object({
  obligationId: z.string().trim().min(1).max(100),
  to: z.enum(OBLIGATION_STATES),
  actionCode: z.string().trim().max(40).optional(),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(50).optional(),
  waiverApprovalRef: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * GET /api/v1/contracts/obligations?contractId=…&asOf=…
 *
 * The obligation register for one contract with the engine's overdue and
 * escalation flags computed at `asOf` (never from wall-clock time in the
 * response, so a dashboard and its audit agree). Amounts are references: the
 * authoritative owner of any money is FINANCE_OS.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:read",
      action: "contracts.obligations.read",
      audit: { objectType: "CONTRACT_OBLIGATION" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const contractId = q.get("contractId");
      if (!contractId) return apiError("VALIDATION_FAILED", "contractId is required.", 422, ctx.traceId);
      const asOf = q.get("asOf") ?? todayIso();
      if (!ISO_DATE.test(asOf)) return apiError("VALIDATION_FAILED", "asOf must be YYYY-MM-DD.", 422, ctx.traceId);
      try {
        const items = await readObligations(ctx.principal, contractId, asOf);
        return apiOk({ contractId, asOf, items }, ctx.traceId);
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}

/**
 * POST /api/v1/contracts/obligations
 *
 *   CREATE     — record an obligation; due date, lead time, escalation date and
 *                verification deadline are COMPUTED by the timing engine from the
 *                trigger/offset (a client-supplied deadline is refused unless it
 *                is the explicit-due-date basis), and an amount-carrying row is
 *                pinned to Finance OS as authoritative owner.
 *   TRANSITION — PENDING → IN_PROGRESS → DELIVERED → VERIFIED (or WAIVED/DISPUTED/CLOSED
 *                per the state machine). Verification without evidence is refused;
 *                a waiver without a governed approval reference is refused; an
 *                unsatisfied upstream dependency blocks downstream advancement.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:manage",
      action: "contracts.obligations.mutate",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "CONTRACT_OBLIGATION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "CREATE": {
            const body = CreateSchema.parse(raw);
            return await withIdempotency(ctx, "contracts.obligations.create", body, async () => ({
              status: 201,
              body: await createObligation(ctx.principal, body, mutationContext),
            }));
          }
          case "TRANSITION": {
            const body = TransitionSchema.parse(raw);
            return await withIdempotency(ctx, "contracts.obligations.transition", body, async () => ({
              status: 200,
              body: await transitionObligation(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError("VALIDATION_FAILED", "operation must be CREATE or TRANSITION.", 422, ctx.traceId);
        }
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}
