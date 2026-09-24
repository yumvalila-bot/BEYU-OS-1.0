/**
 * BEYU OS — HOLOGRAPH RENDER PROFILES (shared capability, migration 0067).
 *
 * Named render profiles bind a canonical renderer kind to a device class, a
 * quality tier and a server-side object ceiling.
 *
 * INvariants
 * ──────────
 *   • PRESENTATION ONLY. A profile can only REDUCE fidelity (quality tier,
 *     object ceiling) — it never widens data access. The governed manifest is
 *     the single source of truth for what a principal may see; the profile
 *     decides only HOW much of that already-authorized manifest is drawn.
 *   • HONESTY. `rendererAvailability` on every read reports the canonical
 *     renderer's real status (IMPLEMENTED / PLANNED / NOT_IMPLEMENTED) from
 *     the renderer capability matrix. A profile that points at a PLANNED or
 *     NOT_IMPLEMENTED renderer is a DECLARATION — the resolution path
 *     (resolveRenderer) already fails closed along the fallback chain to
 *     HTML_TABLE, and this service reports that truth instead of hiding it.
 *   • Every mutation runs through withAuditTransaction (the EXISTING chain).
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { reauthorizeDeepLink } from "./authorization";
import { VizDomainError } from "./errors";
import { vizEventInput } from "./events";
import { RENDERER_KINDS, rendererCapabilityMatrix, type RendererKind } from "./renderers";
import type { VizActor } from "./service";

const VIZ_DEVICE_CLASSES = ["WEB", "DESKTOP", "MOBILE", "AR", "VR", "SPATIAL_DISPLAY", "VOLUMETRIC_DISPLAY", "FUTURE_HOLOGRAPHIC_DEVICE"] as const;
const QUALITY_TIERS = ["LOW", "MEDIUM", "HIGH", "ULTRA"] as const;

export type VizRenderProfileRecord = {
  id: string;
  tenantId: string;
  name: string;
  deviceClass: string | null;
  renderer: string;
  /** Canonical renderer status, resolved live (honesty). */
  rendererAvailability: string;
  qualityTier: string;
  formats: string[];
  maxObjects: number;
  status: "ACTIVE" | "ARCHIVED";
  classification: Classification;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

function profileRowToRecord(row: typeof s.vizRenderProfiles.$inferSelect): VizRenderProfileRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    deviceClass: row.deviceClass,
    renderer: row.renderer,
    rendererAvailability: rendererCapabilityMatrix().find((r) => r.kind === row.renderer)?.status ?? "NOT_IMPLEMENTED",
    qualityTier: row.qualityTier,
    formats: (row.formats as string[]) ?? [],
    maxObjects: row.maxObjects,
    status: row.status as VizRenderProfileRecord["status"],
    classification: row.classification,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRenderProfiles(
  principal: Principal,
  opts: { status?: "ACTIVE" | "ARCHIVED"; limit?: number } = {},
): Promise<VizRenderProfileRecord[]> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [
    eq(s.vizRenderProfiles.tenantId, principal.tenantId),
    inArray(s.vizRenderProfiles.classification, allowed as Classification[]),
  ];
  if (opts.status) conditions.push(eq(s.vizRenderProfiles.status, opts.status));
  const rows = await db
    .select()
    .from(s.vizRenderProfiles)
    .where(and(...conditions))
    .orderBy(desc(s.vizRenderProfiles.updatedAt))
    .limit(Math.min(opts.limit ?? 100, 200));
  return rows.map(profileRowToRecord);
}

export async function getRenderProfile(principal: Principal, profileId: string): Promise<VizRenderProfileRecord | null> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const [row] = await db
    .select()
    .from(s.vizRenderProfiles)
    .where(
      and(
        eq(s.vizRenderProfiles.id, profileId),
        eq(s.vizRenderProfiles.tenantId, principal.tenantId),
        inArray(s.vizRenderProfiles.classification, allowed as Classification[]),
      ),
    )
    .limit(1);
  if (!row) return null;
  const record = profileRowToRecord(row);
  const decision = await reauthorizeDeepLink(
    principal,
    { tenantId: record.tenantId, classification: record.classification },
    "viz:asset.read",
  );
  if (!decision.allowed) {
    if (decision.notFound) return null;
    throw new VizDomainError("SCOPE", decision.reason);
  }
  return record;
}

export type CreateRenderProfileInput = {
  name: string;
  deviceClass?: string | null;
  renderer: string;
  qualityTier?: string;
  formats?: string[];
  maxObjects?: number;
  rationale: string;
  classification?: Classification;
};

/** Create a render profile (viz:asset.manage — the registry-management
 * permission for the capability's presentation registries). */
export async function createRenderProfile(input: CreateRenderProfileInput, actor: VizActor, principal: Principal) {
  if (!input.name.trim()) throw new VizDomainError("INVALID_STATE", "A render profile requires a name.");
  if (!(RENDERER_KINDS as readonly string[]).includes(input.renderer)) {
    throw new VizDomainError("INVALID_STATE", `Unknown renderer '${String(input.renderer)}'. Canonical renderer kinds: ${RENDERER_KINDS.join(", ")}.`);
  }
  if (input.deviceClass && !(VIZ_DEVICE_CLASSES as readonly string[]).includes(input.deviceClass)) {
    throw new VizDomainError("INVALID_STATE", `Unknown device class '${String(input.deviceClass)}'.`);
  }
  const qualityTier = input.qualityTier ?? "MEDIUM";
  if (!(QUALITY_TIERS as readonly string[]).includes(qualityTier)) {
    throw new VizDomainError("INVALID_STATE", `Unknown quality tier '${String(qualityTier)}'. Canonical tiers: ${QUALITY_TIERS.join(", ")}.`);
  }
  const maxObjects = input.maxObjects ?? 300;
  if (!Number.isInteger(maxObjects) || maxObjects < 1 || maxObjects > 100000) {
    throw new VizDomainError("INVALID_STATE", "maxObjects must be an integer between 1 and 100000.");
  }
  if (!input.rationale.trim()) throw new VizDomainError("INVALID_STATE", "Render profile creation requires a rationale (provenance).");

  const id = newId(ID_PREFIX.vizRenderProfile);
  const classification = input.classification ?? "INTERNAL";

  return withAuditTransaction(
    async (tx) => {
      const [existing] = await tx
        .select({ id: s.vizRenderProfiles.id })
        .from(s.vizRenderProfiles)
        .where(and(eq(s.vizRenderProfiles.tenantId, actor.tenantId), eq(s.vizRenderProfiles.name, input.name.trim())))
        .limit(1);
      if (existing) throw new VizDomainError("CONFLICT", `A render profile named '${input.name.trim()}' already exists in this tenant.`);
      const row = {
        id,
        tenantId: actor.tenantId,
        name: input.name.trim(),
        deviceClass: input.deviceClass ?? null,
        renderer: input.renderer as RendererKind,
        qualityTier,
        formats: input.formats ?? [],
        maxObjects,
        status: "ACTIVE" as const,
        classification,
        createdByUserId: actor.userId,
      };
      const [created] = await tx.insert(s.vizRenderProfiles).values(row).returning();
      return profileRowToRecord(created);
    },
    (row) => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_RENDER_PROFILE_REGISTERED",
      objectType: "VIZ_RENDER_PROFILE",
      objectId: row.id,
      outcome: "SUCCESS" as const,
      authority: "viz:asset.manage" as PermissionCode,
      newValue: {
        name: row.name,
        deviceClass: row.deviceClass,
        renderer: row.renderer,
        rendererAvailability: row.rendererAvailability,
        qualityTier: row.qualityTier,
        maxObjects: row.maxObjects,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_RENDER_PROFILE_REGISTERED",
        operation: "CREATE_RENDER_PROFILE",
        tenantId: actor.tenantId,
        subjectType: "VIZ_RENDER_PROFILE",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { renderer: row.renderer, rendererAvailability: row.rendererAvailability, qualityTier: row.qualityTier },
        traceId: actor.traceId,
      }),
  );
}

/** Archive a render profile (viz:asset.manage). */
export async function archiveRenderProfile(profileId: string, actor: VizActor, principal: Principal) {
  const profile = await getRenderProfile(principal, profileId);
  if (!profile) throw new VizDomainError("NOT_FOUND", "Render profile not found within your authorized scope");
  if (profile.status === "ARCHIVED") throw new VizDomainError("INVALID_STATE", "Render profile is already archived");
  return withAuditTransaction(
    async (tx) => {
      await tx
        .update(s.vizRenderProfiles)
        .set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(and(eq(s.vizRenderProfiles.id, profileId), eq(s.vizRenderProfiles.tenantId, actor.tenantId)));
      return { id: profileId, status: "ARCHIVED" as const };
    },
    () => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_RENDER_PROFILE_ARCHIVED",
      objectType: "VIZ_RENDER_PROFILE",
      objectId: profileId,
      outcome: "SUCCESS" as const,
      authority: "viz:asset.manage" as PermissionCode,
      newValue: { status: "ARCHIVED" },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_RENDER_PROFILE_REGISTERED",
        operation: "ARCHIVE_RENDER_PROFILE",
        tenantId: actor.tenantId,
        subjectType: "VIZ_RENDER_PROFILE",
        subjectId: profileId,
        actorUserId: actor.userId,
        classification: profile.classification,
        payload: { status: "ARCHIVED" },
        traceId: actor.traceId,
      }),
  );
}
