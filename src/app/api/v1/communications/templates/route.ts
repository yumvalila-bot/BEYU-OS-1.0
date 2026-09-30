/**
 * GET /api/v1/communications/templates — list templates
 * POST /api/v1/communications/templates — create template
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { listTemplates, createTemplate } from "@/lib/communications/template-service";

export const dynamic = "force-dynamic";

const CreateTemplateSchema = z.object({
  code: z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/),
  version: z.string().max(20).optional(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL", "ALL"]),
  category: z.enum([
    "TRANSACTIONAL",
    "OPERATIONAL",
    "MARKETING",
    "ALERT",
    "INVOICE",
    "RECEIPT",
    "REPORT",
    "REMINDER",
    "FEEDBACK",
    "SURVEY",
    "WELCOME",
    "NOTIFICATION",
    "SECURITY",
    "APPROVAL",
    "CASE",
    "JOURNEY",
    "BROADCAST",
  ]),
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  subjectTemplate: z.string().max(500).optional(),
  bodyTemplate: z.string().min(1).max(20000),
  htmlTemplate: z.string().max(50000).optional(),
  variables: z.array(z.string()).optional(),
  requiredVariables: z.array(z.string()).optional(),
  language: z.string().max(10).optional(),
  countryCode: z.string().length(2).optional().nullable(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:template.read",
      action: "communications.templates.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const channel = searchParams.get("channel") ?? undefined;
      const category = searchParams.get("category") ?? undefined;

      const templates = await listTemplates(ctx.principal.tenantId, channel, category);

      return apiOk({ templates, total: templates.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:template.manage",
      action: "communications.templates.create",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_TEMPLATE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.templates.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateTemplateSchema);

        const template = await createTemplate({
          tenantId: ctx.principal.tenantId,
          code: body.code,
          version: body.version,
          channel: body.channel,
          category: body.category,
          name: body.name,
          description: body.description,
          subjectTemplate: body.subjectTemplate,
          bodyTemplate: body.bodyTemplate,
          htmlTemplate: body.htmlTemplate,
          variables: body.variables,
          requiredVariables: body.requiredVariables,
          language: body.language,
          countryCode: body.countryCode,
          classification: body.classification,
          createdBy: ctx.principal.userId,
        });

        return {
          status: 201,
          body: { template },
        };
      });
    },
  );
}
