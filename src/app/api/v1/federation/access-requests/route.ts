/**
 * GET  /api/v1/federation/access-requests — tenant-scoped access requests.
 * POST /api/v1/federation/access-requests — open a DRAFT/SUBMITTED request.
 *
 * A request only becomes APPROVED through the governed decision endpoint
 * (federation:approve, human, MFA step-up) which records a distinct
 * approval row — the 0071 CHECK constraint makes an APPROVED row without
 * its approval row impossible at the database layer.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  federationAccessRequests,
  federationAuthorities,
  federationLegalBases,
  federationServices,
  legalEntities,
} from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { newId, ID_PREFIX } from "@/lib/ids";

const CreateRequestSchema = z.object({
  legalEntityId: z.string().min(1),
  authorityCode: z.string().min(2).max(64),
  jurisdictionCode: z.string().min(2).max(8).optional(),
  serviceCode: z.string().min(2).max(128).optional(),
  legalBasisCode: z.string().min(2).max(128).optional(),
  purpose: z.string().min(4).max(500),
  classification: z.string().max(32).optional(),
  credentialClass: z.enum(["SANDBOX", "PRODUCTION", "MOCK"]).optional(),
  justification: z.string().max(2000).optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.accessRequests.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_ACCESS_REQUEST" },
    },
    async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const authorityCode = url.searchParams.get("authorityCode")?.toUpperCase() || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const where = and(
        ...(status ? [eq(federationAccessRequests.status, status)] : []),
        ...(authorityCode ? [eq(federationAuthorities.code, authorityCode)] : []),
      );
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationAccessRequests.id,
            tenantId: federationAccessRequests.tenantId,
            authorityCode: federationAuthorities.code,
            serviceCode: federationServices.code,
            purpose: federationAccessRequests.purpose,
            status: federationAccessRequests.status,
            requestedBy: federationAccessRequests.requestedBy,
            approvalId: federationAccessRequests.approvalId,
            createdAt: federationAccessRequests.createdAt,
            updatedAt: federationAccessRequests.updatedAt,
          })
          .from(federationAccessRequests)
          .innerJoin(federationAuthorities, eq(federationAccessRequests.authorityId, federationAuthorities.id))
          .leftJoin(federationServices, eq(federationAccessRequests.serviceId, federationServices.id))
          .where(where)
          .orderBy(desc(federationAccessRequests.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationAccessRequests)
          .innerJoin(federationAuthorities, eq(federationAccessRequests.authorityId, federationAuthorities.id))
          .where(where)
          .limit(1),
      ]);
      return NextResponse.json({ total: Number(countRows[0]?.n ?? 0), limit, offset, accessRequests: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:manage",
      action: "federation.accessRequests.create",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_ACCESS_REQUEST" },
    },
    async (ctx) => {
      const body = await parseBody(request, CreateRequestSchema);

      const scope = await tenantScopeIds(ctx.principal);
      const entity = await db
        .select({ tenantId: legalEntities.tenantId })
        .from(legalEntities)
        .where(eq(legalEntities.id, body.legalEntityId))
        .limit(1);
      if (entity.length === 0 || !scope.includes(entity[0].tenantId)) {
        return apiError("FORBIDDEN", "legalEntityId is not within the principal's tenant scope.", 403, ctx.traceId);
      }

      const jurisdiction = (body.jurisdictionCode ?? "TZ").toUpperCase();
      const auth = await db
        .select({ id: federationAuthorities.id })
        .from(federationAuthorities)
        .where(
          and(
            eq(federationAuthorities.jurisdictionCode, jurisdiction),
            eq(federationAuthorities.code, body.authorityCode.toUpperCase()),
          ),
        )
        .limit(1);
      if (auth.length === 0) {
        return apiError("NOT_FOUND", `Authority ${body.authorityCode} is not registered in ${jurisdiction}.`, 400, ctx.traceId);
      }

      let serviceId: string | null = null;
      if (body.serviceCode) {
        const svc = await db
          .select({ id: federationServices.id })
          .from(federationServices)
          .where(and(eq(federationServices.authorityId, auth[0].id), eq(federationServices.code, body.serviceCode.toUpperCase())))
          .limit(1);
        if (svc.length === 0) {
          return apiError("NOT_FOUND", `Service ${body.serviceCode} is not registered for that authority.`, 400, ctx.traceId);
        }
        serviceId = svc[0].id;
      }

      let legalBasisId: string | null = null;
      if (body.legalBasisCode) {
        const lb = await db
          .select({ id: federationLegalBases.id })
          .from(federationLegalBases)
          .where(
            and(
              eq(federationLegalBases.jurisdictionCode, jurisdiction),
              eq(federationLegalBases.code, body.legalBasisCode.toUpperCase()),
            ),
          )
          .limit(1);
        if (lb.length === 0) {
          return apiError("NOT_FOUND", `Legal basis ${body.legalBasisCode} is not registered in ${jurisdiction}.`, 400, ctx.traceId);
        }
        legalBasisId = lb[0].id;
      }

      const id = newId(ID_PREFIX.fedAccessRequest);
      await db
        .insert(federationAccessRequests)
        .values({
          id,
          tenantId: ctx.principal.tenantId,
          legalEntityId: body.legalEntityId,
          authorityId: auth[0].id,
          serviceId,
          purpose: body.purpose,
          classification: body.classification ?? "UNVERIFIED",
          legalBasisId,
          credentialClass: body.credentialClass ?? "SANDBOX",
          justification: body.justification ?? null,
          requestedBy: ctx.principal.userId,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
          status: "SUBMITTED",
          notes: body.notes ?? null,
        });
      return NextResponse.json({ id, status: "SUBMITTED" }, { status: 201 });
    },
  );
}
