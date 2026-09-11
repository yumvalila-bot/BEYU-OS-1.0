import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listPremiumRows, recordPremium } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";
import { todayIso } from "../../../../_common";

export const dynamic = "force-dynamic";

/**
 * Premium obligations (§10): the schedule the family owes and the evidence a
 * payment was recorded against. NOT a ledger: a PAID row is a recorded claim
 * with evidence — the outflow itself is Finance OS truth. No route here posts
 * anything; CAP_POSTING is not reachable from this module (§22).
 */
const CreatePremiumSchema = z
  .object({
    dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    amountMinor: z.number().int().positive(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
    frequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "SINGLE"]),
    status: z.enum(["SCHEDULED", "PAID", "WAIVED", "VOID"]),
    payerRef: z.string().trim().max(200).nullish(),
    paidDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    paymentEvidenceDocumentRef: z.string().trim().max(200).nullish(),
    financeRecordRef: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();

const SERVER_CONTROLLED = ["tenantId", "id", "policyId", "recordedBy", "authoritativeOwner"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.premium.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_PREMIUM", objectId: policyId },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const asOf = url.searchParams.get("asOf") ?? todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
        return apiError("VALIDATION", "asOf must be an ISO calendar date.", 422, ctx.traceId);
      }
      try {
        return apiOk(await listPremiumRows(ctx.principal, policyId, asOf), ctx.traceId);
      } catch (err) {
        return protectionError(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.manage",
      action: "family.protection.premium.record",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_PREMIUM", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is server-derived and cannot be supplied by the client.`, 422, ctx.traceId);
      }
      const body = CreatePremiumSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.premium.record", { policyId, body }, async () => {
          const result = await recordPremium(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            {
              dueDate: body.dueDate,
              amountMinor: body.amountMinor,
              currency: body.currency,
              frequency: body.frequency,
              status: body.status,
              payerRef: body.payerRef ?? null,
              paidDate: body.paidDate ?? null,
              paymentEvidenceDocumentRef: body.paymentEvidenceDocumentRef ?? null,
              financeRecordRef: body.financeRecordRef ?? null,
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
