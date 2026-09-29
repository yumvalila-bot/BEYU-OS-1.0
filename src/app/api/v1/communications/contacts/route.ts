/**
 * GET /api/v1/communications/contacts — list/search contacts (360°)
 * POST /api/v1/communications/contacts — create contact with verified methods
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { createContact, searchContacts } from "@/lib/communications/contact-service";
import { db } from "@/db";
import { communicationContacts } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CreateContactSchema = z.object({
  displayName: z.string().min(1).max(200),
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  organizationName: z.string().max(200).optional(),
  globalUserId: z.string().max(60).optional().nullable(),
  legalEntityId: z.string().max(60).optional().nullable(),
  countryCode: z.string().length(2).optional().nullable(),
  primaryPhone: z.string().max(30).optional().nullable(),
  primaryEmail: z.string().email().max(200).optional().nullable(),
  preferredChannel: z.enum(["WHATSAPP", "SMS", "EMAIL", "IN_APP", "INTERNAL"]).optional().nullable(),
  preferredLanguage: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  relationshipType: z.string().max(50).optional(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  methods: z
    .array(
      z.object({
        type: z.enum(["PHONE", "WHATSAPP", "EMAIL", "IN_APP", "INTERNAL"]),
        value: z.string().min(1).max(200),
        label: z.string().max(50).optional(),
        isPrimary: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:contact.read",
      action: "communications.contacts.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const q = searchParams.get("q");
      const limit = Math.min(Number(searchParams.get("limit") ?? 20), 100);

      if (q) {
        const results = await searchContacts(ctx.principal.tenantId, q, limit);
        return apiOk({ contacts: results, total: results.length, query: q }, ctx.traceId);
      }

      const rows = await db
        .select()
        .from(communicationContacts)
        .where(eq(communicationContacts.tenantId, ctx.principal.tenantId))
        .orderBy(desc(communicationContacts.updatedAt))
        .limit(limit);

      return apiOk({ contacts: rows, total: rows.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:contact.manage",
      action: "communications.contacts.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_CONTACT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.contacts.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateContactSchema);

        const result = await createContact({
          tenantId: ctx.principal.tenantId,
          displayName: body.displayName,
          firstName: body.firstName,
          lastName: body.lastName,
          organizationName: body.organizationName,
          globalUserId: body.globalUserId,
          legalEntityId: body.legalEntityId,
          countryCode: body.countryCode,
          primaryPhone: body.primaryPhone,
          primaryEmail: body.primaryEmail,
          preferredChannel: body.preferredChannel,
          preferredLanguage: body.preferredLanguage,
          timezone: body.timezone,
          relationshipType: body.relationshipType,
          classification: body.classification,
          createdBy: ctx.principal.userId,
          methods: body.methods as never,
        });

        return {
          status: 201,
          body: {
            contact: result.contact,
            methods: result.methods,
          },
        };
      });
    },
  );
}
