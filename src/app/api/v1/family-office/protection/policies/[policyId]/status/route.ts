import { z } from "zod";
import { apiOk, guarded, withIdempotency } from "@/lib/api";
import { transitionPolicyStatus } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/family-office/protection/policies/:policyId/status
 *
 * Records a contract-status transition the INSURER's record supports, with
 * evidence where the lifecycle demands it (reinstatement of a lapsed policy
 * cites the insurer; nothing re-activates coverage by assertion). The engine
 * refuses every transition it cannot legally derive — this module never
 * modifies a policy on its own (§14).
 */
const TransitionSchema = z
  .object({
    to: z.enum(["PENDING_UNDERWRITING", "IN_FORCE", "LAPSED", "SURRENDERED", "MATURED", "TERMINATED"]),
    evidenceRef: z.string().trim().min(1).max(200).nullish(),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.policy.status",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_POLICY", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = TransitionSchema.parse(await ctx.request.json().catch(() => ({})));
      try {
        return await withIdempotency(ctx, "family.protection.policy.status", { policyId, body }, async () => {
          const result = await transitionPolicyStatus(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            body.to,
            { evidenceRef: body.evidenceRef ?? null, reason: body.reason },
          );
          return { status: 200, body: result };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
