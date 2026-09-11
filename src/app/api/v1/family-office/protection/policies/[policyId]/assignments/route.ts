import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { listAssignmentsAndLoans, recordAssignment, recordPolicyLoan } from "@/lib/family-office-protection-service";
import { protectionError } from "../../../_common";

export const dynamic = "force-dynamic";

/**
 * Assignments and policy loans share one read (GET) because the policy detail
 * surface presents them as one "encumbrances" section. POST records an
 * assignment; the body discriminator `kind: "LOAN"` records a policy loan on
 * the same governed path instead of cloning a near-identical route file for a
 * 6-field ledger row.
 */
const CreateAssignmentSchema = z
  .object({
    assignmentType: z.enum(["COLLATERAL", "ABSOLUTE"]),
    assigneeRef: z.string().trim().min(1).max(200),
    assigneeName: z.string().trim().min(1).max(200),
    securedAmountMinor: z.number().int().nonnegative().nullish(),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).nullish(),
    effectiveDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    instrumentDocumentRef: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();

const CreateLoanSchema = z
  .object({
    advancedDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    principalMinor: z.number().int().positive(),
    interestRateBps: z.number().int().min(0).max(10000).nullish(),
    outstandingBalanceMinor: z.number().int().nonnegative().nullish(),
    authorizationRef: z.string().trim().max(200).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .strict();

export async function GET(request: Request, { params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  return guarded(
    request,
    {
      permission: "familyoffice:protection.read",
      action: "family.protection.assignment.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_ASSIGNMENT", objectId: policyId },
    },
    async (ctx) => {
      try {
        return apiOk(await listAssignmentsAndLoans(ctx.principal, policyId), ctx.traceId);
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
      action: "family.protection.assignment.record",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FAMILY_INSURANCE_ASSIGNMENT", objectId: policyId },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      if ("tenantId" in raw || "id" in raw || "policyId" in raw || "status" in raw) {
        return apiError("SERVER_CONTROLLED_FIELD", "tenantId, id, policyId and status are server-derived.", 422, ctx.traceId);
      }
      // `kind` is a discriminator, not a record field: strip it before the
      // strict schemas see the payload.
      const { kind, ...rest } = raw;
      if (kind === "LOAN") {
        const body = CreateLoanSchema.parse(rest);
        try {
          return await withIdempotency(ctx, "family.protection.loan.record", { policyId, body }, async () => {
            const result = await recordPolicyLoan(
              { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
              ctx.principal,
              policyId,
              {
                advancedDate: body.advancedDate,
                principalMinor: body.principalMinor,
                interestRateBps: body.interestRateBps ?? null,
                outstandingBalanceMinor: body.outstandingBalanceMinor ?? null,
                authorizationRef: body.authorizationRef ?? null,
                notes: body.notes ?? null,
              },
            );
            return { status: 201, body: result };
          });
        } catch (err) {
          return protectionError(err, ctx.traceId);
        }
      }
      const body = CreateAssignmentSchema.parse(rest);
      try {
        return await withIdempotency(ctx, "family.protection.assignment.record", { policyId, body }, async () => {
          const result = await recordAssignment(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            ctx.principal,
            policyId,
            {
              assignmentType: body.assignmentType,
              assigneeRef: body.assigneeRef,
              assigneeName: body.assigneeName,
              securedAmountMinor: body.securedAmountMinor ?? null,
              currency: body.currency ?? null,
              effectiveDate: body.effectiveDate,
              instrumentDocumentRef: body.instrumentDocumentRef,
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
