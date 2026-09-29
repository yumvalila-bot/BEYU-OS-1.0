/**
 * POST /api/v1/communications/reports — report distribution
 * Integrates with Reports/Documents, authorization + classification enforced
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, parseBody, withIdempotency } from "@/lib/api";
import { distributeReport } from "@/lib/communications/report-service";

export const dynamic = "force-dynamic";

const ReportSchema = z.object({
  reportId: z.string().min(1).max(60),
  reportType: z.string().min(1).max(100),
  contactId: z.string().min(1).max(60),
  recipient: z.string().min(1).max(200),
  documentId: z.string().max(60).optional().nullable(),
  subject: z.string().min(1).max(300),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("CONFIDENTIAL"),
  countryCode: z.string().length(2).optional(),
  legalEntityId: z.string().max(60).optional().nullable(),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional().nullable(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.reports.distribute",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "REPORT_DISTRIBUTION" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.reports.distribute", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, ReportSchema);
        const { newId, ID_PREFIX } = await import("@/lib/ids");
        const correlationId = body.correlationId ?? newId(ID_PREFIX.correlationId);

        const result = await distributeReport(
          {
            reportId: body.reportId,
            reportType: body.reportType,
            tenantId: ctx.principal.tenantId,
            contactId: body.contactId,
            recipient: body.recipient,
            documentId: body.documentId,
            subject: body.subject,
            classification: body.classification ?? "CONFIDENTIAL",
            countryCode: body.countryCode,
            legalEntityId: body.legalEntityId,
            correlationId,
            causationId: body.causationId,
            channel: body.channel,
            metadata: body.metadata,
          },
          { userId: ctx.principal.userId, tenantId: ctx.principal.tenantId, clearance: ctx.principal.clearance },
        );

        if (!result.success) {
          return { status: 422, body: { error: { code: "DISTRIBUTION_FAILED", message: result.reason } } };
        }

        return { status: 201, body: { ...result, correlationId } };
      });
    },
  );
}
