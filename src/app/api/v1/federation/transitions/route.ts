/**
 * GET  /api/v1/federation/transitions — tenant-scoped transition plans.
 * POST /api/v1/federation/transitions — PROPOSE a jurisdiction transition.
 *
 * A proposal runs deterministic capability negotiation (negotiateCapabilities)
 * against the destination jurisdiction profile and records a PROPOSED plan.
 * Nothing here authorizes, executes or connects: a PROPOSED plan becomes
 * actionable only through the governed approval path with human decision.
 */
import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  federationCapabilities,
  federationJurisdictions,
  legalEntities,
  federationTransitions,
} from "@/db/schema";
import { apiError, guarded, parseBody } from "@/lib/api";
import {
  assertTransitionShape,
  negotiateCapabilities,
  type CapabilityView,
} from "@/lib/federation";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { newId, ID_PREFIX } from "@/lib/ids";

// Narrow DB text columns into the catalogue enum unions (values are
// CHECK-constrained in 0071; the engine re-validates what it consumes).
const asProfileStatus = (s: string): "PROPOSED" | "ACTIVE" | "INACTIVE" =>
  s === "ACTIVE" || s === "INACTIVE" ? s : "PROPOSED";
const asYesNoUnknown = (s: string): "TRUE" | "FALSE" | "UNKNOWN" =>
  s === "TRUE" || s === "FALSE" ? s : "UNKNOWN";

const ProposeSchema = z.object({
  originJurisdiction: z.string().min(2).max(8),
  destinationJurisdiction: z.string().min(2).max(8),
  subjectType: z.enum(["PERSON", "ORGANIZATION", "TENANT", "ENTITY", "DATA"]),
  subjectRef: z.string().min(1).max(128),
  legalEntityId: z.string().min(1).optional(),
  capabilitiesWanted: z.array(z.string().min(2).max(64)).min(1).max(32),
  hasLocalEntityInDestination: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:read",
      action: "federation.transitions.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_TRANSITION" },
    },
    async () => {
      const url = new URL(request.url);
      const status = url.searchParams.get("status")?.toUpperCase() || null;
      const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);
      const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

      const where = and(
        ...(status ? [eq(federationTransitions.status, status)] : []),
      );
      const [rows, countRows] = await Promise.all([
        db
          .select({
            id: federationTransitions.id,
            tenantId: federationTransitions.tenantId,
            code: federationTransitions.code,
            originJurisdiction: federationTransitions.originJurisdiction,
            destinationJurisdiction: federationTransitions.destinationJurisdiction,
            subjectType: federationTransitions.subjectType,
            subjectRef: federationTransitions.subjectRef,
            consentRequired: federationTransitions.consentRequired,
            agreementRequired: federationTransitions.agreementRequired,
            status: federationTransitions.status,
            approvalReference: federationTransitions.approvalReference,
            createdAt: federationTransitions.createdAt,
            updatedAt: federationTransitions.updatedAt,
          })
          .from(federationTransitions)
          .where(where)
          .orderBy(desc(federationTransitions.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ n: sql<number>`count(*)` })
          .from(federationTransitions)
          .where(where)
          .limit(1),
      ]);
      return NextResponse.json({ total: Number(countRows[0]?.n ?? 0), limit, offset, transitions: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "federation:manage",
      action: "federation.transitions.propose",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "FEDERATION_TRANSITION" },
    },
    async (ctx) => {
      const body = await parseBody(request, ProposeSchema);
      const origin = body.originJurisdiction.toUpperCase();
      const destination = body.destinationJurisdiction.toUpperCase();
      if (origin === destination) {
        return apiError("VALIDATION", "origin and destination jurisdiction must differ.", 400, ctx.traceId);
      }

      const [originProfile, destinationProfile] = await Promise.all([
        db.select().from(federationJurisdictions).where(eq(federationJurisdictions.code, origin)).limit(1),
        db.select().from(federationJurisdictions).where(eq(federationJurisdictions.code, destination)).limit(1),
      ]);
      if (originProfile.length === 0 || destinationProfile.length === 0) {
        return apiError(
          "NOT_FOUND",
          `Both jurisdictions must be registered profiles (found origin=${originProfile.length > 0}, destination=${destinationProfile.length > 0}).`,
          400,
          ctx.traceId,
        );
      }

      const destinationCaps = await db
        .select()
        .from(federationCapabilities)
        .where(eq(federationCapabilities.jurisdictionCode, destination));
      const capabilities: Record<string, CapabilityView> = Object.fromEntries(
        destinationCaps.map((c) => [
          c.capabilityCode,
          {
            capabilityCode: c.capabilityCode,
            availability: c.availability,
            legalBasisRef: c.legalBasisRef,
            connectorRef: c.connectorRef,
            dataResidency: c.dataResidency,
            costStatus: c.costStatus,
            requiresHumanApproval: asYesNoUnknown(c.requiresHumanApproval),
          } satisfies CapabilityView,
        ]),
      );

      assertTransitionShape({ originJurisdiction: origin, destinationJurisdiction: destination, knownJurisdictions: [origin, destination] });

      let organizationId: string | null = null;
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
        organizationId = body.legalEntityId;
      }

      const plan = negotiateCapabilities({
        origin: {
          code: originProfile[0].code,
          name: originProfile[0].name,
          status: asProfileStatus(originProfile[0].status),
          dataResidency: originProfile[0].dataResidency,
          integrationRegime: originProfile[0].integrationRegime,
          crossBorderInterfaces: originProfile[0].crossBorderInterfaces,
        },
        destination: {
          code: destinationProfile[0].code,
          name: destinationProfile[0].name,
          status: asProfileStatus(destinationProfile[0].status),
          dataResidency: destinationProfile[0].dataResidency,
          integrationRegime: destinationProfile[0].integrationRegime,
          crossBorderInterfaces: destinationProfile[0].crossBorderInterfaces,
        },
        capabilities,
        subjectType: body.subjectType,
        capabilitiesWanted: body.capabilitiesWanted,
        hasLocalEntityInDestination: body.hasLocalEntityInDestination,
      });

      const id = newId(ID_PREFIX.fedTransition);
      const code = `TR-${origin}-${destination}-${id.slice(-8).toUpperCase()}`;
      await db.insert(federationTransitions).values({
        id,
        tenantId: ctx.principal.tenantId,
        code,
        originJurisdiction: origin,
        destinationJurisdiction: destination,
        subjectType: body.subjectType,
        subjectRef: body.subjectRef,
        organizationId,
        legalRequirements: plan.legalRequirements,
        dataTransferRequirements: [],
        residencyRequirements: plan.residencyRequirements,
        taxRequirements: [],
        licensingRequirements: [],
        serviceAvailability: Object.fromEntries(plan.capabilities.map((c) => [c.capabilityCode, c.availability])),
        consentRequired: plan.consentRequired ? "TRUE" : "FALSE",
        agreementRequired: plan.agreementRequired ? "TRUE" : "FALSE",
        status: plan.status,
        notes: plan.status === "BLOCKED" ? `BLOCKED BY NEGOTIATION: ${plan.summary}` : (body.notes ?? plan.summary),
      });

      return NextResponse.json(
        {
          id,
          code,
          plan,
          note: "Recorded as a PROPOSED plan. It authorizes nothing; execution requires the governed approval path with a human decision.",
        },
        { status: 201 },
      );
    },
  );
}
