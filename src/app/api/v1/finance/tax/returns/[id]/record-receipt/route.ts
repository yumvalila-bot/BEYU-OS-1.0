import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { documents, taxReturnDrafts } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";

export const dynamic = "force-dynamic";

const ReceiptSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED"]),
  receiptReference: z.string().trim().min(6).max(128),
  receiptDocumentId: z.string().min(3).max(128),
  receivedAt: z.string().datetime(),
  notes: z.string().trim().min(10).max(3000),
});

/** Records a specialist-verified TRA acknowledgement; it does not contact TRA. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return guarded(request, {
    permission: "finance:tax.receipt",
    action: "finance.tax.return.record_receipt",
    rateLimit: { limit: 10, windowMs: 60_000 },
    audit: { objectType: "TAX_RETURN_DRAFT" },
  }, async (ctx) => {
    const { id } = await context.params;
    const body = await parseBody(ctx.request, ReceiptSchema);
    if (!ctx.principal.roles.some((role) => ["TAX_SPECIALIST", "TAX_MANAGER", "TAX_FILING_OFFICER"].includes(role))) {
      return apiError("TAX_RECEIPT_REVIEWER_REQUIRED", "An appointed Tax Specialist, Tax Manager or Tax Filing Officer must record TRA acknowledgement.", 403, ctx.traceId);
    }
    const tenantIds = await tenantScopeIds(ctx.principal);
    const [draft] = await db.select().from(taxReturnDrafts).where(and(
      eq(taxReturnDrafts.id, id),
      inArray(taxReturnDrafts.tenantId, tenantIds),
      inArray(taxReturnDrafts.classification, classificationsAtOrBelow(ctx.principal.clearance)),
      ...(ctx.principal.entityScope.length > 0 ? [inArray(taxReturnDrafts.legalEntityId, ctx.principal.entityScope)] : []),
    )).limit(1);
    if (!draft) return apiError("NOT_FOUND", "Tax return draft not found.", 404, ctx.traceId);
    if (draft.status !== "SUBMITTED") return apiError("INVALID_STATE", "Only a manually submitted return may receive a TRA acknowledgement.", 409, ctx.traceId);
    if ([draft.createdBy, draft.specialistReviewerId, draft.approvedBy, draft.submittedBy].includes(ctx.principal.userId)) {
      return apiError("SEPARATION_OF_DUTIES", "The preparer, reviewer, approver or submitter cannot verify the same return receipt.", 403, ctx.traceId);
    }
    const [receipt] = await db.select().from(documents).where(and(
      eq(documents.id, body.receiptDocumentId),
      eq(documents.tenantId, draft.tenantId),
      eq(documents.entityScope, draft.legalEntityId),
      eq(documents.jurisdictionCode, draft.jurisdictionCode),
      eq(documents.category, "TAX_FILING_RECEIPT"),
      eq(documents.authorityStatus, "AUTHORITATIVE"),
      inArray(documents.classification, classificationsAtOrBelow(ctx.principal.clearance)),
    )).limit(1);
    if (!receipt || !receipt.storageUri || !/^(sha256:)?[a-f0-9]{64}$/i.test(receipt.checksum)) {
      return apiError("RECEIPT_EVIDENCE_INVALID", "A same-tenant, same-entity, same-jurisdiction TAX_FILING_RECEIPT document must be stored, checksum-backed and specialist-verified before recording acceptance/rejection.", 422, ctx.traceId);
    }
    const receivedAt = new Date(body.receivedAt);
    if (Number.isNaN(receivedAt.getTime()) || receivedAt.getTime() > Date.now() + 5 * 60_000) {
      return apiError("INVALID_RECEIPT_TIME", "Receipt timestamp must be valid and cannot be materially in the future.", 422, ctx.traceId);
    }
    const filingPack = {
      ...(draft.filingPack as Record<string, unknown>),
      traReceipt: {
        decision: body.decision,
        receiptReference: body.receiptReference,
        receiptDocumentId: receipt.id,
        receiptChecksum: receipt.checksum,
        receivedAt: receivedAt.toISOString(),
        verifiedBy: ctx.principal.userId,
        notes: body.notes,
      },
    };
    const [updated] = await db.update(taxReturnDrafts).set({
      status: body.decision,
      receiptDocumentId: receipt.id,
      acceptedAt: body.decision === "ACCEPTED" ? receivedAt : null,
      filingPack,
      updatedAt: new Date(),
    }).where(and(
      eq(taxReturnDrafts.id, draft.id),
      eq(taxReturnDrafts.status, "SUBMITTED"),
      inArray(taxReturnDrafts.tenantId, tenantIds),
    )).returning({
      id: taxReturnDrafts.id,
      status: taxReturnDrafts.status,
      externalReference: taxReturnDrafts.externalReference,
      receiptDocumentId: taxReturnDrafts.receiptDocumentId,
      acceptedAt: taxReturnDrafts.acceptedAt,
    });
    if (!updated) return apiError("CONCURRENT_MODIFICATION", "The draft changed while recording the TRA acknowledgement.", 409, ctx.traceId);
    return apiOk({ receipt: updated, note: "TRA acknowledgement recorded from the verified document; BEYU did not contact TRA." }, ctx.traceId);
  });
}
