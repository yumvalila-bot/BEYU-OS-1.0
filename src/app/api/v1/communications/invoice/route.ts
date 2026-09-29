/**
 * POST /api/v1/communications/invoice — invoice notification distribution
 * Integrates with Finance/Commerce, never posts journals (CAP_POSTING LOCKED)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, parseBody, withIdempotency } from "@/lib/api";
import { handleInvoiceEvent } from "@/lib/communications/invoice-service";

export const dynamic = "force-dynamic";

const InvoiceSchema = z.object({
  invoiceId: z.string().min(1).max(60),
  invoiceNumber: z.string().min(1).max(60),
  contactId: z.string().min(1).max(60),
  recipient: z.string().min(1).max(200),
  amount: z.number(),
  currency: z.string().min(3).max(10),
  dueDate: z.string().min(1).max(20),
  invoiceLink: z.string().url().optional(),
  organizationName: z.string().min(1).max(200),
  eventType: z.enum(["INVOICE_CREATED", "INVOICE_REMINDER", "INVOICE_DUE", "INVOICE_OVERDUE", "RECEIPT", "STATEMENT"]).default("INVOICE_CREATED"),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional().nullable(),
  countryCode: z.string().length(2).optional(),
  legalEntityId: z.string().max(60).optional().nullable(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.invoice.send",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "INVOICE_COMMUNICATION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.invoice.send", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, InvoiceSchema);
        const { newId, ID_PREFIX } = await import("@/lib/ids");
        const correlationId = body.correlationId ?? newId("CORR" as keyof typeof ID_PREFIX);

        const result = await handleInvoiceEvent(
          {
            invoiceId: body.invoiceId,
            invoiceNumber: body.invoiceNumber,
            tenantId: ctx.principal.tenantId,
            contactId: body.contactId,
            recipient: body.recipient,
            amount: body.amount,
            currency: body.currency,
            dueDate: body.dueDate,
            invoiceLink: body.invoiceLink,
            organizationName: body.organizationName,
            eventType: body.eventType as never,
            correlationId,
            causationId: body.causationId,
            countryCode: body.countryCode,
            legalEntityId: body.legalEntityId,
          },
          { userId: ctx.principal.userId, tenantId: ctx.principal.tenantId, clearance: ctx.principal.clearance },
        );

        return {
          status: result.success ? 201 : 207,
          body: { ...result, correlationId, financeBoundary: "DISTRIBUTION_ONLY", capPosting: "LOCKED" },
        };
      });
    },
  );
}
