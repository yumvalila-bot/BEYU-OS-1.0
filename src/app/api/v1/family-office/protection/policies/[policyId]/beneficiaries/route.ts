import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listDesignations, recordDesignation } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * INSURANCE beneficiary designations (§6) — NOT the trust beneficiary
 * register. Nothing on this route reads or converts `people.beneficiaries`;
 * the two registers may name the same person and hold different legal
 * relationships. `beneficiary.manage` is HIGH_RISK: an authorized human with
 * MFA step-up records designations; Noelia has no tool path to this route (§27).
 */
const CreateDesignationSchema = z
  .object({
    beneficiaryRef: z.string().trim().min(1).max(200),
    beneficiaryKind: z.enum(["FAMILY_MEMBER", "LEGAL_ENTITY", "TRUST", "CHARITABLE", "OTHER"]),
    designationType: z.enum(["PRIMARY", "CONTINGENT"]),
    entitlementBasis: z.enum(["PERCENTAGE", "FIXED_AMOUNT", "RESIDUARY"]),
    /** Millionths of a percent: 12.5% = 12_500_000. Exact integer percentages only. */
    pctMillionths: z.number().int().min(1).max(100_000_000).nullish(),
    fixedAmountMinor: z.number().int().positive().nullish(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).nullish(),
    effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
    status: z.enum(["PROPOSED", "ACTIVE"]),
    relationshipBasis: z.string().trim().min(1).max(2000),
    notes: z.string().trim().max(2000).nullish(),
    documentRef: z.string().trim().max(200).nullish(),
    supersedesDesignationId: z.string().trim().max(100).nullish(),
    authorityRef: z.string().trim().max(200).nullish(),
  })
  .strict();

const SERVER_CONTROLLED = ["tenantId", "id", "policyId", "recordedBy", "reviewStatus"] as const;

export async function GET(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.designation.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_BENEFICIARY", objectId: policyId },
    },
    async (ctx) => {
      try {
        return apiOk(await listDesignations(ctx.principal, policyId), ctx.traceId);
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
      permission: "familyoffice:beneficiary.manage",
      action: "family.protection.designation.record",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_BENEFICIARY", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const forged = SERVER_CONTROLLED.find((f) => f in raw);
      if (forged) {
        return apiError("SERVER_CONTROLLED_FIELD", `'${forged}' is server-derived and cannot be supplied by the client.`, 422, ctx.traceId);
      }
      const body = CreateDesignationSchema.parse(raw);
      try {
        return await withIdempotency(ctx, "family.protection.designation.record", { policyId, body }, async () => {
          const result = await recordDesignation(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            {
              beneficiaryRef: body.beneficiaryRef,
              beneficiaryKind: body.beneficiaryKind,
              designationType: body.designationType,
              entitlementBasis: body.entitlementBasis,
              pctMillionths: body.pctMillionths ?? null,
              fixedAmountMinor: body.fixedAmountMinor ?? null,
              currency: body.currency ?? null,
              effectiveDate: body.effectiveDate,
              endDate: body.endDate ?? null,
              status: body.status,
              relationshipBasis: body.relationshipBasis,
              notes: body.notes ?? null,
              documentRef: body.documentRef ?? null,
              supersedesDesignationId: body.supersedesDesignationId ?? null,
              authorityRef: body.authorityRef ?? null,
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
