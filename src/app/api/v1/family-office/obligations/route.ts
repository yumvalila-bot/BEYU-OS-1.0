import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { FAMILY_OFFICE_ERROR_STATUS, FamilyOfficeCapitalError, createObligation, listObligations } from "@/lib/family-office-capital-service";
import { todayIso } from "../_common";

export const dynamic = "force-dynamic";

const PartySchema = z
  .object({
    ref: z.string().trim().min(1).max(200),
    name: z.string().trim().min(1).max(200),
    partyType: z.enum(["FAMILY_GROUP", "FAMILY_MEMBER", "GROUP_ENTITY", "EXTERNAL_LENDER", "EXTERNAL_BORROWER", "GOVERNMENT", "OTHER"]),
    countryCode: z.string().trim().regex(/^[A-Z]{2}$/),
    legalEntityRef: z.string().trim().max(200).nullish(),
  })
  .strict();

const CreateObligationSchema = z
  .object({
    kind: z.enum(["INTERCOMPANY_LOAN", "SHAREHOLDER_LOAN", "MORTGAGE", "PROJECT_DEBT", "VENDOR_FINANCING", "RECEIVABLE", "PAYABLE", "LEASE", "GUARANTEE", "BOND", "CAPITAL_COMMITMENT"]),
    direction: z.enum(["FAMILY_IS_LENDER", "FAMILY_IS_BORROWER", "FAMILY_IS_GUARANTOR", "FAMILY_IS_BENEFICIARY"]),
    borrower: PartySchema,
    lender: PartySchema,
    ownerRef: z.string().trim().max(200).nullish(),
    terms: z
      .object({
        currency: z.string().trim().regex(/^[A-Z]{3}$/),
        principalMinor: z.number().int().nonnegative(),
        outstandingMinor: z.number().int().nonnegative(),
        annualRateBps: z.number().int().nonnegative(),
        rateType: z.enum(["FIXED", "FLOATING", "STEPPED", "ZERO", "IN_KIND"]),
        floatingReference: z.string().trim().max(100).nullish(),
        floatingSpreadBps: z.number().int().nullish(),
        maturityDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
        paymentFrequency: z.enum(["MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "AT_MATURITY"]),
        amortisation: z.enum(["AMORTISING", "BULLET", "INTEREST_ONLY"]),
      })
      .strict(),
    security: z
      .object({
        collateralDescription: z.string().trim().max(2000).nullish(),
        collateralRef: z.string().trim().max(200).nullish(),
        guaranteeDescription: z.string().trim().max(2000).nullish(),
        guarantorRef: z.string().trim().max(200).nullish(),
        guaranteeDirection: z.enum(["RECEIVED", "GIVEN", "NONE"]),
      })
      .strict(),
    governance: z
      .object({
        agreementDocumentRef: z.string().trim().max(200).nullish(),
        approvalRef: z.string().trim().max(200).nullish(),
        authorisedBy: z.string().trim().max(200).nullish(),
        legalReviewRef: z.string().trim().max(200).nullish(),
        jurisdictionRef: z.string().trim().max(200).nullish(),
      })
      .strict(),
    status: z.enum(["DRAFT", "PROPOSED", "UNDER_REVIEW", "APPROVED", "DOCUMENTED", "ACTIVE", "RESTRUCTURED", "IN_DEFAULT", "SETTLED", "WRITTEN_OFF", "TERMINATED"]),
    financeRecordRef: z.string().trim().max(200).nullish(),
  })
  .strict();

/**
 * GET /api/v1/family-office/obligations
 *
 * The obligation register — the answer to "WHO OWES WHOM?" (§8). Totals are per
 * currency; no cross-currency total is produced because no FX rate has been
 * ratified.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:obligation.read", action: "family.obligation.read", rateLimit: { limit: 100, windowMs: 60_000 }, audit: { objectType: "FAMILY_OBLIGATION" } },
    async (ctx) => {
      const asOf = new URL(request.url).searchParams.get("asOf") ?? todayIso();
      return apiOk(await listObligations(ctx.principal, asOf), ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/family-office/obligations
 *
 * Records an obligation. Both sides of the relationship must be named, and an
 * obligation in a live status must carry an authorising reference — the engine
 * refuses the write otherwise, so an unauthorised live obligation cannot be
 * stored and discovered later.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    { permission: "familyoffice:obligation.manage", action: "family.obligation.create", rateLimit: { limit: 30, windowMs: 60_000 }, audit: { objectType: "FAMILY_OBLIGATION" }, databaseContext: "handler" },
    async (ctx) => {
      const body = CreateObligationSchema.parse(await ctx.request.json().catch(() => ({})));
      try {
        return await withIdempotency(ctx, "family.obligation.create", body, async () => {
          const result = await createObligation(
            { tenantId: ctx.principal.tenantId, userId: ctx.principal.userId, traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
            {
              ...body,
              /** `.nullish()` yields `undefined`; the service contract is `string | null`. */
              borrower: { ...body.borrower, legalEntityRef: body.borrower.legalEntityRef ?? null },
              lender: { ...body.lender, legalEntityRef: body.lender.legalEntityRef ?? null },
              ownerRef: body.ownerRef ?? null,
              financeRecordRef: body.financeRecordRef ?? null,
              terms: {
                ...body.terms,
                floatingReference: body.terms.floatingReference ?? null,
                floatingSpreadBps: body.terms.floatingSpreadBps ?? null,
                maturityDate: body.terms.maturityDate ?? null,
              },
              security: {
                collateralDescription: body.security.collateralDescription ?? null,
                collateralRef: body.security.collateralRef ?? null,
                guaranteeDescription: body.security.guaranteeDescription ?? null,
                guarantorRef: body.security.guarantorRef ?? null,
                guaranteeDirection: body.security.guaranteeDirection,
              },
              governance: {
                agreementDocumentRef: body.governance.agreementDocumentRef ?? null,
                approvalRef: body.governance.approvalRef ?? null,
                authorisedBy: body.governance.authorisedBy ?? null,
                legalReviewRef: body.governance.legalReviewRef ?? null,
                jurisdictionRef: body.governance.jurisdictionRef ?? null,
              },
            },
          );
          return { status: 201, body: result };
        });
      } catch (err) {
        if (err instanceof FamilyOfficeCapitalError) {
          return apiError(err.code, err.message, FAMILY_OFFICE_ERROR_STATUS[err.code], ctx.traceId, { findings: err.findings });
        }
        throw err;
      }
    },
  );
}
