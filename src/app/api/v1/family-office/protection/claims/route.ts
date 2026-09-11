import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listClaims, openClaim } from "@/lib/family-office-protection-service";
import { protectionError } from "../_common";

export const dynamic = "force-dynamic";

/**
 * The claims ledger (§16). This module RECORDS a claim the family has opened
 * with an insurer — nothing here adjudicates anything. Insurer decisions,
 * approved amounts and receipts arrive as reported facts with evidence refs;
 * the engine refuses to record a decision or amount that has no source, and
 * the proceeds machine (EXPECTED → … → ALLOCATED) can never present a
 * contingent figure as cash (§13).
 */
const OpenClaimSchema = z
  .object({
    policyId: z.string().trim().min(1).max(100),
    claimReference: z.string().trim().min(1).max(200),
    incidentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    notificationDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    documentRefs: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
    notes: z.string().trim().max(4000).nullish(),
  })
  .strict();

const SERVER_CONTROLLED = ["tenantId", "id", "status", "proceedsState", "approvedAmountMinor", "receivedAmountMinor", "insuredRef", "insurerRef", "currency", "createdBy"] as const;

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:claim.read",
      action: "family.protection.claims.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_CLAIM" },
    },
    async (ctx) => {
      try {
        return apiOk(await listClaims(ctx.principal), ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "familyoffice:claim.manage",
      action: "family.protection.claim.open",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_CLAIM" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is server-derived or lifecycle-controlled and cannot be supplied on open.`, 422, ctx.traceId);
      }
      const body = OpenClaimSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.claim.open", body, async () => {
          const result = await openClaim(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            {
              policyId: body.policyId,
              claimReference: body.claimReference,
              incidentDate: body.incidentDate,
              notificationDate: body.notificationDate ?? null,
              documentRefs: body.documentRefs,
              notes: body.notes ?? null,
            },
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}
