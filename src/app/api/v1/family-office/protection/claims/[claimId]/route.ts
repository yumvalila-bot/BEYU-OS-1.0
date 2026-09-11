import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listClaimEvents, listClaims, transitionClaim } from "@/lib/family-office-protection-service";
import { protectionError } from "../../_common";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/family-office/protection/claims/:claimId — the lifecycle
 * machine (§16) with its monotonic proceeds state (§13). Every step the
 * outside world decides (insurer approval/denial, receipt of proceeds) must
 * cite evidence; the engine refuses the step otherwise. GET returns the
 * claim's append-only event log.
 */
const TransitionSchema = z
  .object({
    to: z.enum([
      "DOCUMENTATION_PENDING",
      "UNDER_REVIEW",
      "SUBMITTED",
      "INSURER_REVIEW",
      "APPROVED",
      "DENIED",
      "DISPUTED",
      "PROCEEDS_PENDING",
      "PROCEEDS_RECEIVED",
      "ALLOCATED",
      "CLOSED",
    ]),
    proceedsTo: z.enum(["EXPECTED", "CLAIMED", "APPROVED", "RECEIVED", "ALLOCATED"]).nullish(),
    evidenceRef: z.string().trim().min(1).max(200).nullish(),
    approvedAmountMinor: z.number().int().nonnegative().nullish(),
    receivedAmountMinor: z.number().int().nonnegative().nullish(),
    receivedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    allocationRef: z.string().trim().max(200).nullish(),
    note: z.string().trim().max(2000).nullish(),
    eventKind: z.enum(["DOCUMENT_REQUESTED", "DOCUMENT_SUPPLIED", "SUBMITTED", "INSURER_DECISION", "DISPUTE_RAISED", "PROCEEDS_NOTED", "ALLOCATED", "NOTE", "CLOSED"]),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:claim.read",
      action: "family.protection.claim.events.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_CLAIM", objectId: claimId },
    },
    async (ctx) => {
      try {
        const [events, all] = await Promise.all([listClaimEvents(ctx.principal, claimId), listClaims(ctx.principal)]);
        const claim = all.claims.find((c) => c.id === claimId) ?? null;
        return apiOk({ claim, ...events }, ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:claim.manage",
      action: "family.protection.claim.transition",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_CLAIM", objectId: claimId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = await ctx.request.json().catch(() => ({}));
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        return apiError("VALIDATION", "Expected a JSON object body.", 422, ctx.traceId);
      }
      const body = TransitionSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.claim.transition", { claimId, body }, async () => {
          const result = await transitionClaim(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            claimId,
            {
              to: body.to,
              proceedsTo: (body.proceedsTo ?? null) as never,
              evidenceRef: body.evidenceRef ?? null,
              approvedAmountMinor: body.approvedAmountMinor ?? null,
              receivedAmountMinor: body.receivedAmountMinor ?? null,
              receivedDate: body.receivedDate ?? null,
              allocationRef: body.allocationRef ?? null,
              note: body.note ?? null,
              eventKind: body.eventKind,
            },
          );
          return { status: 200, body: result };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
