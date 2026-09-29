/**
 * Invoice Communication — integrates with existing Finance/Commerce.
 *
 * Do NOT create a second accounting system.
 * Support: Invoice Created → Notification → Reminder → Due Date → Overdue Notice → Receipt → Statement
 *
 * Communications may distribute financial documents.
 * Communications MUST NOT: post journals, modify ledger balances, move funds,
 * approve payments, bypass Finance authorization. CAP_POSTING MUST REMAIN LOCKED.
 */

import { newId, ID_PREFIX } from "@/lib/ids";
import { orchestrateCommunication, orchestrateMultiChannel } from "./orchestrator";
import type { CommunicationIntent } from "./types";
import { recordAudit } from "@/lib/audit";

export type InvoiceEvent = {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string;
  contactId: string;
  recipient: string;
  amount: number;
  currency: string;
  dueDate: string;
  invoiceLink?: string;
  organizationName: string;
  eventType: "INVOICE_CREATED" | "INVOICE_REMINDER" | "INVOICE_DUE" | "INVOICE_OVERDUE" | "RECEIPT" | "STATEMENT";
  correlationId: string;
  causationId?: string | null;
  countryCode?: string | null;
  legalEntityId?: string | null;
};

export async function handleInvoiceEvent(
  event: InvoiceEvent,
  principal: { userId: string; tenantId: string; clearance: string },
): Promise<{ success: boolean; reason?: string; results?: unknown[] }> {
  // Financial safety: communications cannot post journals, move funds, etc.
  // This is distribution only — Finance OS remains sole journal writer
  // CAP_POSTING remains LOCKED — enforced by not importing finance posting here

  const templateMap: Record<InvoiceEvent["eventType"], string> = {
    INVOICE_CREATED: "INVOICE_NOTIFICATION",
    INVOICE_REMINDER: "INVOICE_REMINDER",
    INVOICE_DUE: "INVOICE_DUE",
    INVOICE_OVERDUE: "INVOICE_OVERDUE",
    RECEIPT: "RECEIPT",
    STATEMENT: "STATEMENT",
  };

  const templateCode = templateMap[event.eventType] ?? "INVOICE_NOTIFICATION";

  const baseIntent: CommunicationIntent = {
    tenantId: event.tenantId,
    legalEntityId: event.legalEntityId,
    countryCode: event.countryCode,
    contactId: event.contactId,
    recipient: event.recipient,
    messageType: event.eventType === "RECEIPT" ? "RECEIPT" : event.eventType === "STATEMENT" ? "STATEMENT" : "INVOICE",
    priority: event.eventType === "INVOICE_OVERDUE" ? "HIGH" : "NORMAL",
    classification: "CONFIDENTIAL", // Financial documents are at least CONFIDENTIAL
    purpose: "TRANSACTIONAL",
    templateCode,
    templateVariables: {
      contact_name: "{{contact_name}}", // resolved by template service from contact
      invoice_number: event.invoiceNumber,
      invoice_id: event.invoiceId,
      amount: event.amount,
      currency: event.currency,
      due_date: event.dueDate,
      invoice_link: event.invoiceLink ?? "",
      organization_name: event.organizationName,
    },
    correlationId: event.correlationId,
    causationId: event.causationId,
    idempotencyKey: `${event.invoiceId}:${event.eventType}`,
    traceId: event.correlationId,
    metadata: {
      invoice_id: event.invoiceId,
      invoice_number: event.invoiceNumber,
      event_type: event.eventType,
      finance_boundary: "DISTRIBUTION_ONLY",
      cap_posting: "LOCKED",
    },
  };

  // Invoice: Email PDF + WhatsApp notification + In-app copy (per routing rules)
  const channels = ["EMAIL", "WHATSAPP", "IN_APP"];

  const results = await orchestrateMultiChannel(baseIntent, channels, principal);

  await recordAudit({
    tenantId: event.tenantId,
    actorUserId: principal.userId,
    action: `communications.invoice.${event.eventType.toLowerCase()}`,
    objectType: "INVOICE_COMMUNICATION",
    objectId: event.invoiceId,
    outcome: "SUCCESS",
    newValue: {
      invoiceId: event.invoiceId,
      invoiceNumber: event.invoiceNumber,
      eventType: event.eventType,
      channels,
      results: results.map((r) => ({ success: r.success, channel: r.channel, messageId: r.messageId })),
    },
  });

  return { success: results.every((r) => r.success), results };
}
