/**
 * POST /api/v1/communications/messages — send via orchestrator
 * GET /api/v1/communications/messages — list messages
 *
 * Orchestrator: BEYU EVENT → INTENT → POLICY → AUTHZ → CONSENT → RECIPIENT →
 * ROUTING → TEMPLATE → PROVIDER → DELIVERY → AUDIT
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency, apiError } from "@/lib/api";
import { orchestrateCommunication, orchestrateMultiChannel } from "@/lib/communications/orchestrator";
import { listMessages } from "@/lib/communications/message-service";
import { newId, ID_PREFIX } from "@/lib/ids";
import type { CommunicationIntent } from "@/lib/communications/types";

export const dynamic = "force-dynamic";

const SendMessageSchema = z.object({
  recipient: z.string().min(1).max(200),
  contactId: z.string().max(60).optional(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL", "PUSH", "VOICE"]).optional(),
  channels: z.array(z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"])).optional(), // multi-channel
  messageType: z.enum([
    "TEXT",
    "TEMPLATE",
    "MEDIA",
    "DOCUMENT",
    "INVOICE",
    "RECEIPT",
    "REPORT",
    "STATEMENT",
    "ALERT",
    "REMINDER",
    "FEEDBACK_REQUEST",
    "SURVEY",
    "NOTIFICATION",
    "SECURITY",
    "APPROVAL",
    "CASE",
    "JOURNEY",
    "BROADCAST",
  ]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("INTERNAL"),
  purpose: z.enum(["TRANSACTIONAL", "OPERATIONAL", "SECURITY", "MARKETING", "RESEARCH", "FEEDBACK"]).default("TRANSACTIONAL"),
  templateCode: z.string().max(60).optional(),
  templateVariables: z.record(z.string(), z.unknown()).optional(),
  subject: z.string().max(300).optional(),
  body: z.string().max(10000).optional(),
  htmlBody: z.string().max(50000).optional(),
  structuredPayload: z.record(z.string(), z.unknown()).optional(),
  correlationId: z.string().max(120).optional(),
  causationId: z.string().max(120).optional().nullable(),
  idempotencyKey: z.string().max(200).optional(),
  scheduledFor: z.string().datetime().optional().nullable(),
  requiresHumanApproval: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  countryCode: z.string().length(2).optional(),
  legalEntityId: z.string().max(60).optional().nullable(),
  globalUserId: z.string().max(60).optional().nullable(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.read",
      action: "communications.messages.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const conversationId = searchParams.get("conversationId") ?? undefined;
      const contactId = searchParams.get("contactId") ?? undefined;
      const channel = searchParams.get("channel") ?? undefined;
      const status = searchParams.get("status") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const messages = await listMessages(ctx.principal.tenantId, {
        conversationId,
        contactId,
        channel,
        status,
        limit,
      });

      return apiOk({ messages, total: messages.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.messages.send",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "MESSAGE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.messages.send", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, SendMessageSchema);

        if (!body.body && !body.templateCode) {
          return { status: 422, body: { error: { code: "BODY_REQUIRED", message: "Either body or templateCode is required" } } };
        }

        const correlationId = body.correlationId ?? newId("CORR" as keyof typeof ID_PREFIX);
        const idempotencyKey = body.idempotencyKey ?? newId("IDEM" as keyof typeof ID_PREFIX);
        const traceId = ctx.traceId;

        const baseIntent: CommunicationIntent = {
          tenantId: ctx.principal.tenantId,
          legalEntityId: body.legalEntityId,
          countryCode: body.countryCode,
          contactId: body.contactId,
          globalUserId: body.globalUserId,
          recipient: body.recipient,
          channel: body.channel as never,
          messageType: body.messageType as never,
          priority: body.priority as never,
          classification: body.classification,
          purpose: body.purpose as never,
          templateCode: body.templateCode,
          templateVariables: body.templateVariables,
          subject: body.subject,
          body: body.body,
          htmlBody: body.htmlBody,
          structuredPayload: body.structuredPayload,
          correlationId,
          causationId: body.causationId,
          idempotencyKey,
          traceId,
          scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
          requiresHumanApproval: body.requiresHumanApproval,
          metadata: body.metadata,
        };

        // Multi-channel delivery (e.g., invoice: Email + WhatsApp + In-App)
        if (body.channels && body.channels.length > 1) {
          const results = await orchestrateMultiChannel(baseIntent, body.channels, {
            userId: ctx.principal.userId,
            tenantId: ctx.principal.tenantId,
            clearance: ctx.principal.clearance,
          });

          const allSuccess = results.every((r) => r.success);
          return {
            status: allSuccess ? 201 : 207,
            body: {
              results,
              correlationId,
              total: results.length,
              successCount: results.filter((r) => r.success).length,
            },
          };
        }

        const result = await orchestrateCommunication(baseIntent, {
          userId: ctx.principal.userId,
          tenantId: ctx.principal.tenantId,
          clearance: ctx.principal.clearance,
        });

        if (!result.success) {
          return {
            status: 422,
            body: {
              error: {
                code: "ORCHESTRATION_FAILED",
                message: result.reason ?? "Communication orchestration failed",
                traceId,
                correlationId,
              },
            },
          };
        }

        return {
          status: result.isDuplicate ? 200 : 201,
          body: {
            messageId: result.messageId,
            conversationId: result.conversationId,
            channel: result.channel,
            providerId: result.providerId,
            status: result.status,
            isDuplicate: result.isDuplicate,
            routingDecision: result.routingDecision,
            correlationId,
            traceId,
          },
        };
      });
    },
  );
}
