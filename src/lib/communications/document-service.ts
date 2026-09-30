/**
 * Document Delivery — integrates with existing Documents capability.
 *
 * Never duplicate document storage. Use existing documents table.
 * Support governed delivery of: invoices, receipts, quotations, contracts,
 * statements, reports, certificates, payslips, project documents, authorized
 * health documents, compliance documents.
 *
 * Features where supported: expiring links, access control, classification,
 * versioning, revocation, download auditing, watermarking.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { documents, communicationAttachments, communicationMessages } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit } from "@/lib/audit";

export async function validateDocumentAccess(
  documentId: string,
  tenantId: string,
  principal: { userId: string; clearance: string },
): Promise<{ allowed: boolean; reason: string; document?: typeof documents.$inferSelect }> {
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.tenantId, tenantId)))
    .limit(1);

  if (!doc) {
    return { allowed: false, reason: "Document not found in tenant scope" };
  }

  // Classification check
  const { classificationRank } = await import("@/lib/constants");
  if (classificationRank(doc.classification) > classificationRank(principal.clearance)) {
    return { allowed: false, reason: `Clearance ${principal.clearance} below document classification ${doc.classification}`, document: doc };
  }

  // Legal hold, retention, etc. — preserved from existing Documents capability
  if (doc.legalHold) {
    // Legal hold documents can still be delivered but must be audited
  }

  return { allowed: true, reason: "Access granted", document: doc };
}

export async function createDocumentDelivery(input: {
  messageId: string;
  documentId: string;
  tenantId: string;
  principal: { userId: string; clearance: string };
  expiresAt?: Date | null;
}): Promise<{ success: boolean; reason?: string; attachment?: typeof communicationAttachments.$inferSelect }> {
  const accessCheck = await validateDocumentAccess(input.documentId, input.tenantId, input.principal);
  if (!accessCheck.allowed) {
    return { success: false, reason: accessCheck.reason };
  }

  const doc = accessCheck.document!;

  const id = newId(ID_PREFIX.commAttachment);
  const [attachment] = await db
    .insert(communicationAttachments)
    .values({
      id,
      messageId: input.messageId,
      documentId: input.documentId,
      tenantId: input.tenantId,
      fileName: doc.fileName,
      fileType: doc.fileType,
      accessExpiresAt: input.expiresAt,
    })
    .returning();

  await recordAudit({
    tenantId: input.tenantId,
    actorUserId: input.principal.userId,
    action: "communications.document.attached",
    objectType: "COMMUNICATION_ATTACHMENT",
    objectId: id,
    outcome: "SUCCESS",
    newValue: {
      messageId: input.messageId,
      documentId: input.documentId,
      fileName: doc.fileName,
      classification: doc.classification,
      expiresAt: input.expiresAt?.toISOString(),
    },
  });

  return { success: true, attachment };
}

export async function recordDocumentDownload(
  attachmentId: string,
  tenantId: string,
  downloadedBy: string,
): Promise<void> {
  await db.execute(
    (await import("drizzle-orm")).sql`UPDATE communication_attachments SET download_count = download_count + 1, last_downloaded_at = now() WHERE id = ${attachmentId} AND tenant_id = ${tenantId}`,
  );

  await recordAudit({
    tenantId,
    actorUserId: downloadedBy,
    action: "communications.document.downloaded",
    objectType: "COMMUNICATION_ATTACHMENT",
    objectId: attachmentId,
    outcome: "SUCCESS",
  });
}
