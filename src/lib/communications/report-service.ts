/**
 * Report Distribution — integrates with existing Reports/Documents.
 *
 * Support: scheduled reports, on-demand reports, management, operational,
 * project, sector, compliance, family-office reports.
 *
 * Distribution: Email, WhatsApp, SMS notification, In-App, Internal
 * Apply authorization and classification before delivery.
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import { orchestrateCommunication } from "./orchestrator";
import type { CommunicationIntent } from "./types";
import { recordAudit } from "@/lib/audit";
import { validateDocumentAccess } from "./document-service";

export type ReportDistributionRequest = {
  reportId: string;
  reportType: string;
  tenantId: string;
  contactId: string;
  recipient: string;
  documentId?: string | null; // canonical document reference
  subject: string;
  classification: string;
  countryCode?: string | null;
  legalEntityId?: string | null;
  correlationId: string;
  causationId?: string | null;
  channel?: string;
  metadata?: Record<string, unknown>;
};

export async function distributeReport(
  request: ReportDistributionRequest,
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<{ success: boolean; reason?: string; messageId?: string }> {
  // Authorization & classification before delivery
  if (request.documentId) {
    const accessCheck = await validateDocumentAccess(request.documentId, request.tenantId, principal);
    if (!accessCheck.allowed) {
      return { success: false, reason: accessCheck.reason };
    }
  }

  const intent: CommunicationIntent = {
    tenantId: request.tenantId,
    legalEntityId: request.legalEntityId,
    countryCode: request.countryCode,
    contactId: request.contactId,
    recipient: request.recipient,
    channel: (request.channel as never) ?? "EMAIL",
    messageType: "REPORT",
    priority: "NORMAL",
    classification: request.classification,
    purpose: "OPERATIONAL",
    subject: request.subject,
    body: `Report ${request.reportType} (${request.reportId}) is ready.\n\n${request.documentId ? `Document: ${request.documentId}` : ""}\n\nThis report is classified ${request.classification} and is only visible to authorized principals.`,
    correlationId: request.correlationId,
    causationId: request.causationId,
    idempotencyKey: `${request.reportId}:${request.recipient}:${request.channel ?? "EMAIL"}`,
    traceId: request.correlationId,
    metadata: {
      report_id: request.reportId,
      report_type: request.reportType,
      document_id: request.documentId,
      ...request.metadata,
    },
  };

  const result = await orchestrateCommunication(intent, principal);

  if (result.success && request.documentId && result.messageId) {
    const { createDocumentDelivery } = await import("./document-service");
    await createDocumentDelivery({
      messageId: result.messageId,
      documentId: request.documentId,
      tenantId: request.tenantId,
      principal,
    });
  }

  await recordAudit({
    tenantId: request.tenantId,
    actorUserId: principal.userId,
    action: "communications.report.distributed",
    objectType: "REPORT_DISTRIBUTION",
    objectId: request.reportId,
    outcome: result.success ? "SUCCESS" : "FAILURE",
    reason: result.reason,
    newValue: {
      reportId: request.reportId,
      reportType: request.reportType,
      channel: intent.channel,
      recipient: request.recipient,
      messageId: result.messageId,
      classification: request.classification,
    },
  });

  return { success: result.success, reason: result.reason, messageId: result.messageId };
}
