/**
 * GET  /api/v1/federation/consents — tenant-scoped consent records (RLS).
 * POST /api/v1/federation/consents — record a consent REQUEST.
 *
 * Fail-closed: a consent is always created in REQUESTED. The state machine
 * (canMoveConsent) and human action move it to GRANTED/DENIED — the API can
 * never mint a GRANTED consent, and the subject must be a canonical BEYU
 * party (GlobalUserID carrier), never an external identifier.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { federationConsents, federationAuthorities, federationServices, legalEntities, parties } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { CONSENT_STATUS } from "@/lib/federation";
import { newId, ID_PREFIX } from "@/lib/ids";
import { tenantScopeIds } from "@/lib/tenant-scope";

const CreateConsentSchema = z.object({
  legalEntityId: z.string().min(1).optional(),
  authorityCode: z.string().min(2).max(64).optional(),
  jurisdictionCode: z.string().min(2).max(8).optional(),
  serviceCode: z.string().min(2).max(128).optional(),
  subjectPartyId: z.string().min(1),
  purpose: z.string().min(4).max(500),
  method: z.string().min(2).max(64).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.consents.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_CONSENT" },
    },
    async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const purpose = url.searchParams.get("purpose") || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      if (status && !(CONSENT_STATUS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "VALIDATION", message: "Unknown consent status filter." }, { status: 400 });
      }

      const where = and(
        ...(status ? [eq(federationConsents.status, status)] : []),
        ...(purpose ? [eq(federationConsents.purpose, purpose)] : []),
      );
      const [rows, countRows] = await Promise.all([
        db
          .select()
          .from(federationConsents)
          .where(where)
          .orderBy(desc(federationConsents.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationConsents)
          .where(where)
          .limit(1),
      ]);
      return NextResponse.json({ total: Number(countRows[0]?.n ?? 0), limit, offset, consents: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:manage",
      action: "federation.consents.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_CONSENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateConsentSchema);

      // The legal entity (when given) must exist and be inside the
      // principal's tenant scope — never a client-asserted cross-tenant link.
      if (body.legalEntityId) {
        const scope = await tenantScopeIds(ctx.principal);
        const entity = await db
          .select({ tenantId: legalEntities.tenantId })
          .from(legalEntities)
          .where(eq(legalEntities.id, body.legalEntityId))
          .limit(1);
        if (entity.length === 0 || !scope.includes(entity[0].tenantId)) {
          return apiError("FORBIDDEN", "legalEntityId is not within the principal's tenant scope.", 403, ctx.traceId);
        }
      }

      // The consent subject must be a canonical BEYU party — never an
      // external identifier (NIN, TIN, …). Fail closed when it is not found.
      const party = await db
        .select({ id: parties.id })
        .from(parties)
        .where(eq(parties.id, body.subjectPartyId))
        .limit(1);
      if (party.length === 0) {
        return apiError(
          "INVALID_SUBJECT",
          "Consent subject must be a canonical BEYU party (GlobalUserID carrier). External identifiers are never accepted as consent subjects.",
          400,
          ctx.traceId,
        );
      }

      let authorityId: string | null = null;
      if (body.authorityCode) {
        const auth = await db
          .select({ id: federationAuthorities.id })
          .from(federationAuthorities)
          .where(
            and(
              eq(federationAuthorities.jurisdictionCode, (body.jurisdictionCode ?? "TZ").toUpperCase()),
              eq(federationAuthorities.code, body.authorityCode.toUpperCase()),
            ),
          )
          .limit(1);
        if (auth.length === 0) {
          return apiError("NOT_FOUND", `Authority ${body.authorityCode} is not registered.`, 400, ctx.traceId);
        }
        authorityId = auth[0].id;
      }

      let serviceId: string | null = null;
      if (body.serviceCode) {
        if (!authorityId) {
          return apiError("VALIDATION", "serviceCode requires authorityCode.", 400, ctx.traceId);
        }
        const svc = await db
          .select({ id: federationServices.id })
          .from(federationServices)
          .where(and(eq(federationServices.authorityId, authorityId), eq(federationServices.code, body.serviceCode.toUpperCase())))
          .limit(1);
        if (svc.length === 0) {
          return apiError("NOT_FOUND", `Service ${body.serviceCode} is not registered for that authority.`, 400, ctx.traceId);
        }
        serviceId = svc[0].id;
      }

      const id = newId(ID_PREFIX.fedConsent);
      await db
        .insert(federationConsents)
        .values({
          id,
          tenantId: ctx.principal.tenantId,
          legalEntityId: body.legalEntityId ?? (ctx.principal.entityScope[0] ?? null),
          authorityId,
          serviceId,
          subjectPartyId: body.subjectPartyId,
          purpose: body.purpose,
          jurisdictionCode: body.jurisdictionCode?.toUpperCase() ?? null,
          method: body.method ?? null,
          status: "REQUESTED",
          notes: body.notes ?? null,
        });
      return NextResponse.json({ id, status: "REQUESTED" }, { status: 201 });
    },
  );
}
