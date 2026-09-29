/**
 * GET  /api/v1/federation/incidents — federation-plane incidents (RLS:
 *      global rows are visible to every scoped context).
 * POST /api/v1/federation/incidents — open a DETECTED incident.
 *
 * Incidents are how the safe self-repair loop (§75) and monitoring surface
 * problems. Opening an incident NEVER authorizes, repairs, reconnects or
 * promotes anything — remediation stays a governed human decision.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { federationAuthorities, federationConnectors, federationIncidents, federationServices } from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import { INCIDENT_CATEGORIES, INCIDENT_STATUS } from "@/lib/federation";
import { newId, ID_PREFIX } from "@/lib/ids";

const OpenSchema = z.object({
  authorityCode: z.string().min(2).max(64).optional(),
  jurisdictionCode: z.string().min(2).max(8).optional(),
  serviceCode: z.string().min(2).max(128).optional(),
  connectorCode: z.string().min(2).max(64).optional(),
  category: z.enum(INCIDENT_CATEGORIES as unknown as [string, ...string[]]),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]).optional(),
  title: z.string().min(4).max(200),
  description: z.string().max(4000).optional(),
  affectedServices: z.array(z.string().min(2).max(128)).max(32).optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:audit.read",
      action: "federation.incidents.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_INCIDENT" },
    },
    async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const category = url.searchParams.get("category")?.toUpperCase() || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      if (status && !(INCIDENT_STATUS as readonly string[]).includes(status)) {
        return NextResponse.json({ error: "VALIDATION", message: "Unknown incident status filter." }, { status: 400 });
      }

      const where = and(
        ...(status ? [eq(federationIncidents.status, status)] : []),
        ...(category ? [eq(federationIncidents.category, category)] : []),
      );
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationIncidents.id,
            tenantId: federationIncidents.tenantId,
            authorityCode: federationAuthorities.code,
            category: federationIncidents.category,
            severity: federationIncidents.severity,
            title: federationIncidents.title,
            status: federationIncidents.status,
            detectedAt: federationIncidents.detectedAt,
            closedAt: federationIncidents.closedAt,
          })
          .from(federationIncidents)
          .leftJoin(federationAuthorities, eq(federationIncidents.authorityId, federationAuthorities.id))
          .where(where)
          .orderBy(desc(federationIncidents.detectedAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationIncidents)
          .where(where)
          .limit(1),
      ]);
      return NextResponse.json({
        total: Number(countRows[0]?.n ?? 0),
        limit,
        offset,
        incidents: rows,
        note: "Opening an incident authorizes nothing; remediation is a governed human decision.",
      });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:manage",
      action: "federation.incidents.open",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_INCIDENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, OpenSchema);

      const jurisdiction = (body.jurisdictionCode ?? "TZ").toUpperCase();
      let authorityId: string | null = null;
      if (body.authorityCode) {
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
        authorityId = auth[0].id;
      }

      let serviceId: string | null = null;
      if (body.serviceCode) {
        if (!authorityId) return apiError("VALIDATION", "serviceCode requires authorityCode.", 400, ctx.traceId);
        const svc = await db
          .select({ id: federationServices.id })
          .from(federationServices)
          .where(and(eq(federationServices.authorityId, authorityId), eq(federationServices.code, body.serviceCode.toUpperCase())))
          .limit(1);
        if (svc.length === 0) return apiError("NOT_FOUND", `Service ${body.serviceCode} is not registered for that authority.`, 400, ctx.traceId);
        serviceId = svc[0].id;
      }

      let connectorId: string | null = null;
      if (body.connectorCode) {
        const con = await db
          .select({ id: federationConnectors.id })
          .from(federationConnectors)
          .where(eq(federationConnectors.code, body.connectorCode.toUpperCase()))
          .limit(1);
        if (con.length === 0) return apiError("NOT_FOUND", `Connector ${body.connectorCode} is not registered.`, 400, ctx.traceId);
        connectorId = con[0].id;
      }

      const id = newId(ID_PREFIX.fedIncident);
      await db.insert(federationIncidents).values({
        id,
        tenantId: ctx.principal.tenantId,
        authorityId,
        serviceId,
        connectorId,
        category: body.category,
        severity: body.severity ?? "MEDIUM",
        title: body.title,
        description: body.description ?? null,
        status: "DETECTED",
        affectedServices: body.affectedServices ?? [],
        notes: body.notes ?? null,
      });
      return NextResponse.json({ id, status: "DETECTED" }, { status: 201 });
    },
  );
}
