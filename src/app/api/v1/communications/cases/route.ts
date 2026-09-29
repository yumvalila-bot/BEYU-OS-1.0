/**
 * GET /api/v1/communications/cases — list cases
 * POST /api/v1/communications/cases — create case
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { db } from "@/db";
import { communicationCases } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit, publishEvent } from "@/lib/audit";

export const dynamic = "force-dynamic";

const CreateCaseSchema = z.object({
  conversationId: z.string().max(60).optional().nullable(),
  contactId: z.string().max(60).optional().nullable(),
  legalEntityId: z.string().max(60).optional().nullable(),
  type: z.string().max(50).default("SUPPORT"),
  subject: z.string().min(1).max(300),
  description: z.string().max(5000).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "CRITICAL"]).default("NORMAL"),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).default("INTERNAL"),
  assignedToUserId: z.string().max(60).optional().nullable(),
  assignedToRole: z.string().max(100).optional().nullable(),
  correlationId: z.string().max(120).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:case.read",
      action: "communications.cases.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const status = searchParams.get("status") ?? undefined;
      const contactId = searchParams.get("contactId") ?? undefined;
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      const conditions = [eq(communicationCases.tenantId, ctx.principal.tenantId)];
      if (status) conditions.push(eq(communicationCases.status, status));
      if (contactId) conditions.push(eq(communicationCases.contactId, contactId));

      const rows = await db
        .select()
        .from(communicationCases)
        .where(and(...conditions))
        .orderBy(desc(communicationCases.createdAt))
        .limit(limit);

      return apiOk({ cases: rows, total: rows.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:case.manage",
      action: "communications.cases.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_CASE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.cases.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateCaseSchema);
        const id = newId(ID_PREFIX.commCase);
        const correlationId = body.correlationId ?? newId(ID_PREFIX.correlationId);

        const [row] = await db
          .insert(communicationCases)
          .values({
            id,
            tenantId: ctx.principal.tenantId,
            conversationId: body.conversationId,
            contactId: body.contactId,
            legalEntityId: body.legalEntityId,
            type: body.type,
            subject: body.subject,
            description: body.description,
            status: "OPEN",
            priority: body.priority,
            classification: body.classification as never,
            assignedToUserId: body.assignedToUserId,
            assignedToRole: body.assignedToRole,
            correlationId,
            createdBy: ctx.principal.userId,
          })
          .returning();

        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "communications.case.created",
          objectType: "CASE",
          objectId: id,
          outcome: "SUCCESS",
          newValue: { type: body.type, subject: body.subject, correlationId },
        });

        return { status: 201, body: { case: row, correlationId } };
      });
    },
  );
}
