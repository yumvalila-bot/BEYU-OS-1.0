/**
 * POST /api/v1/communications/noelia/draft — AI-assisted drafting via Noelia/HIVE
 * Canonical identity NOELIA_AI, never NOELIA_WHATSAPP etc.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody } from "@/lib/api";
import { draftWithNoelia, recommendChannelWithNoelia } from "@/lib/communications/noelia-service";

export const dynamic = "force-dynamic";

const DraftSchema = z.object({
  contactId: z.string().max(60).optional(),
  channel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]),
  messageType: z.string().min(2).max(50),
  purpose: z.string().min(2).max(30).default("TRANSACTIONAL"),
  context: z.record(z.string(), z.unknown()).default({}),
  originalMessage: z.string().max(10000).optional(),
  language: z.string().max(10).optional(),
});

const RecommendSchema = z.object({
  contactId: z.string().min(1).max(60),
  messageType: z.string().min(2).max(50),
  priority: z.string().min(2).max(20).default("NORMAL"),
  purpose: z.string().min(2).max(30).default("TRANSACTIONAL"),
  context: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "draft";

  if (action === "recommend") {
    return guarded(
      request,
      {
        permission: "communications:read",
        action: "communications.noelia.recommend",
        rateLimit: { limit: 30, windowMs: 60_000 },
      },
      async (ctx) => {
        const body = await parseBody(request, RecommendSchema);
        const recommendation = await recommendChannelWithNoelia({
          tenantId: ctx.principal.tenantId,
          contactId: body.contactId,
          messageType: body.messageType,
          priority: body.priority,
          purpose: body.purpose,
          context: body.context,
        });
        return apiOk({ recommendation, note: "Noelia RECOMMENDS, governance DECIDES — advisory only" }, ctx.traceId);
      },
    );
  }

  return guarded(
    request,
    {
      permission: "communications:message.send",
      action: "communications.noelia.draft",
      rateLimit: { limit: 30, windowMs: 60_000 },
    },
    async (ctx) => {
      const body = await parseBody(request, DraftSchema);
      const result = await draftWithNoelia(
        {
          tenantId: ctx.principal.tenantId,
          contactId: body.contactId,
          channel: body.channel as never,
          messageType: body.messageType,
          purpose: body.purpose,
          context: body.context,
          originalMessage: body.originalMessage,
          language: body.language,
        },
        { userId: ctx.principal.userId, tenantId: ctx.principal.tenantId },
      );
      return apiOk(
        {
          draft: result,
          governance: {
            identity: "NOELIA_AI",
            runtime: "HIVE",
            cannot: [
              "grant permissions",
              "change roles",
              "bypass RLS/RBAC/ABAC",
              "override consent",
              "approve financial transactions",
              "post journals",
              "move money",
              "disable audit",
              "impersonate human",
            ],
            flow: result.requiresHumanApproval ? "AI_DRAFT → POLICY_CHECK → HUMAN_REVIEW → APPROVAL → SEND → AUDIT" : "AI_DRAFT → POLICY_CHECK → SEND → AUDIT",
          },
        },
        ctx.traceId,
      );
    },
  );
}
