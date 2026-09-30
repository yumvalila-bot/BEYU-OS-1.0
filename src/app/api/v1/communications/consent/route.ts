/**
 * GET /api/v1/communications/consent — list consent for contact
 * POST /api/v1/communications/consent — record consent
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { getAllConsents, recordConsent, checkConsentAllowed } from "@/lib/communications/consent-service";

export const dynamic = "force-dynamic";

const RecordConsentSchema = z.object({
  contactId: z.string().min(1).max(60),
  purpose: z.enum(["TRANSACTIONAL", "OPERATIONAL", "SECURITY", "MARKETING", "RESEARCH", "FEEDBACK"]),
  channel: z.string().min(1).max(20),
  status: z.enum(["OPT_IN", "OPT_OUT", "REVOKED"]),
  source: z.string().min(1).max(50),
  evidenceRef: z.string().max(500).optional(),
  evidenceDocumentId: z.string().max(60).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:consent.read",
      action: "communications.consent.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const contactId = searchParams.get("contactId");
      if (!contactId) {
        return apiOk({ error: "contactId required" }, ctx.traceId, 422);
      }

      const consents = await getAllConsents(contactId, ctx.principal.tenantId);
      return apiOk({ consents, total: consents.length, contactId }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:consent.manage",
      action: "communications.consent.record",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_CONSENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.consent.record", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, RecordConsentSchema);

        const consent = await recordConsent({
          contactId: body.contactId,
          tenantId: ctx.principal.tenantId,
          purpose: body.purpose as never,
          channel: body.channel,
          status: body.status as never,
          source: body.source,
          evidenceRef: body.evidenceRef,
          evidenceDocumentId: body.evidenceDocumentId,
          createdBy: ctx.principal.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });

        return {
          status: 201,
          body: { consent },
        };
      });
    },
  );
}
