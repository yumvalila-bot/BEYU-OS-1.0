/**
 * BEYU OS — HOLOGRAPH SPATIAL ASSET REGISTRY (shared capability, migration 0067).
 *
 * A governed registry of the spatial assets Holograph can present: GLTF/GLB,
 * IFC/BIM, CAD-derived, 3D medical, geographic/spatial, infrastructure,
 * building, equipment, farm, vehicle, organizational and financial
 * visualization objects.
 *
 * INvariants
 * ──────────
 *   • METADATA ONLY. The registry stores provenance, source, version,
 *     integrity hash, classification, ownership and tenant/entity scope. It
 *     NEVER stores binary geometry and never becomes a document store:
 *     content is referenced (storageRef) and governed knowledge stays in the
 *     canonical Documents/Knowledge registry (references only, §25).
 *   • HONESTY. `formatSupport` is enforced against VIZ_ASSET_FORMAT_SUPPORT —
 *     a caller can never record that a parser exists which the repository does
 *     not contain. Binary formats are registry-only (NOT_IMPLEMENTED parsing);
 *     only registry-projection types (ORGANIZATION / FINANCE_OBJECT /
 *     FOUNDATION_OBJECT) may carry IMPLEMENTED, because those are rendered
 *     live from canonical registries.
 *   • DEEP LINKS RE-AUTHORIZE. An asset id is a reference, never a grant:
 *     getAsset re-checks tenant, entity, classification and permission on
 *     every access (same rule as scenes/twins).
 *   • Every mutation runs through withAuditTransaction (domain row + audit +
 *     enterprise event atomically — the EXISTING chain).
 *   • NO journal, treasury, posting or sector-data mutation exists here.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import { reauthorizeDeepLink } from "./authorization";
import { VizDomainError } from "./errors";
import { vizEventInput } from "./events";
import {
  VIZ_ASSET_FORMAT_SUPPORT,
  VIZ_ASSET_STATUS,
  VIZ_ASSET_TYPES,
} from "@/db/schema/visualization";
import type { VizActor } from "./service";

export type VizAssetRecord = {
  id: string;
  tenantId: string;
  legalEntityId: string | null;
  name: string;
  assetType: string;
  formatSupport: "IMPLEMENTED" | "NOT_IMPLEMENTED";
  sourceSystem: string;
  sourceObjectId: string;
  version: number;
  integrityHash: string;
  storageRef: string;
  provenance: { registeredBy: string; rationale: string; importedAt: string; sourceVersion?: string };
  classification: Classification;
  status: "REGISTERED" | "ARCHIVED";
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

const SHA256_HEX = /^[a-f0-9]{64}$/;

function assetRowToRecord(row: typeof s.vizAssets.$inferSelect): VizAssetRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    name: row.name,
    assetType: row.assetType,
    formatSupport: row.formatSupport as VizAssetRecord["formatSupport"],
    sourceSystem: row.sourceSystem,
    sourceObjectId: row.sourceObjectId,
    version: row.version,
    integrityHash: row.integrityHash,
    storageRef: row.storageRef,
    provenance: row.provenance as VizAssetRecord["provenance"],
    classification: row.classification,
    status: row.status as VizAssetRecord["status"],
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** List spatial assets visible to the principal (tenant-scoped in SQL + RLS,
 * classification-filtered in-process as defence in depth). */
export async function listAssets(
  principal: Principal,
  opts: { assetType?: string; status?: "REGISTERED" | "ARCHIVED"; limit?: number } = {},
): Promise<VizAssetRecord[]> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [
    eq(s.vizAssets.tenantId, principal.tenantId),
    inArray(s.vizAssets.classification, allowed as Classification[]),
  ];
  if (opts.assetType) conditions.push(eq(s.vizAssets.assetType, opts.assetType));
  if (opts.status) conditions.push(eq(s.vizAssets.status, opts.status));
  const rows = await db
    .select()
    .from(s.vizAssets)
    .where(and(...conditions))
    .orderBy(desc(s.vizAssets.updatedAt))
    .limit(Math.min(opts.limit ?? 100, 200));
  return rows.map(assetRowToRecord);
}

/** Deep-link load + re-authorization. Cross-tenant/uncleared ids resolve to
 * null (NOT_FOUND, never a forbidden-existence leak). */
export async function getAsset(principal: Principal, assetId: string): Promise<VizAssetRecord | null> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const [row] = await db
    .select()
    .from(s.vizAssets)
    .where(
      and(
        eq(s.vizAssets.id, assetId),
        eq(s.vizAssets.tenantId, principal.tenantId),
        inArray(s.vizAssets.classification, allowed as Classification[]),
      ),
    )
    .limit(1);
  if (!row) return null;
  const record = assetRowToRecord(row);
  const decision = await reauthorizeDeepLink(
    principal,
    {
      tenantId: record.tenantId,
      classification: record.classification,
      legalEntityId: record.legalEntityId,
    },
    "viz:asset.read",
  );
  if (!decision.allowed) {
    if (decision.notFound) return null;
    throw new VizDomainError("SCOPE", decision.reason);
  }
  return record;
}

export type RegisterAssetInput = {
  name: string;
  assetType: string;
  sourceSystem: string;
  sourceObjectId: string;
  integrityHash: string;
  storageRef: string;
  rationale: string;
  sourceVersion?: string | null;
  legalEntityId?: string | null;
  classification?: Classification;
  version?: number;
};

/**
 * Register a spatial asset (viz:asset.manage). The format-support claim is
 * validated against the honest support matrix — the service is the single
 * place where "what can this repository actually present" is enforced, so a
 * registry row can never claim a parser that does not exist.
 */
export async function registerAsset(input: RegisterAssetInput, actor: VizActor, principal: Principal) {
  if (!input.name.trim()) throw new VizDomainError("INVALID_STATE", "An asset requires a name.");
  if (!(VIZ_ASSET_TYPES as readonly string[]).includes(input.assetType)) {
    throw new VizDomainError("INVALID_STATE", `Unknown asset type '${String(input.assetType)}'. Canonical types: ${VIZ_ASSET_TYPES.join(", ")}.`);
  }
  const honestSupport = VIZ_ASSET_FORMAT_SUPPORT[input.assetType];
  if (!honestSupport) throw new VizDomainError("INVALID_STATE", `No format-support declaration exists for asset type '${String(input.assetType)}'.`);
  if (!SHA256_HEX.test(input.integrityHash)) {
    throw new VizDomainError("INVALID_STATE", "integrityHash must be the sha256 hex digest of the referenced content.");
  }
  if (!input.sourceSystem.trim() || !input.sourceObjectId.trim()) {
    throw new VizDomainError("INVALID_STATE", "An asset requires a source system and source object id (provenance).");
  }
  if (!input.storageRef.trim()) {
    throw new VizDomainError("INVALID_STATE", "An asset requires a storage reference (the registry itself never stores binary geometry).");
  }
  if (!input.rationale.trim()) throw new VizDomainError("INVALID_STATE", "Asset registration requires a rationale (provenance).");

  const id = newId(ID_PREFIX.vizAsset);
  const classification = input.classification ?? "INTERNAL";

  return withAuditTransaction(
    async (tx) => {
      const [existing] = await tx
        .select({ id: s.vizAssets.id })
        .from(s.vizAssets)
        .where(
          and(
            eq(s.vizAssets.tenantId, actor.tenantId),
            eq(s.vizAssets.sourceSystem, input.sourceSystem.trim()),
            eq(s.vizAssets.sourceObjectId, input.sourceObjectId.trim()),
          ),
        )
        .limit(1);
      if (existing) {
        throw new VizDomainError("CONFLICT", "An asset with this source system + source object is already registered in this tenant. Use a version update instead.");
      }
      const row = {
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId ?? null,
        name: input.name.trim(),
        assetType: input.assetType,
        formatSupport: honestSupport,
        sourceSystem: input.sourceSystem.trim(),
        sourceObjectId: input.sourceObjectId.trim(),
        version: input.version ?? 1,
        integrityHash: input.integrityHash,
        storageRef: input.storageRef.trim(),
        provenance: {
          registeredBy: actor.userId,
          rationale: input.rationale.trim(),
          importedAt: new Date().toISOString(),
          ...(input.sourceVersion?.trim() ? { sourceVersion: input.sourceVersion.trim() } : {}),
        },
        classification,
        status: "REGISTERED" as const,
        createdByUserId: actor.userId,
      };
      const [created] = await tx.insert(s.vizAssets).values(row).returning();
      return assetRowToRecord(created);
    },
    (row) => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_ASSET_REGISTERED",
      objectType: "VIZ_ASSET",
      objectId: row.id,
      outcome: "SUCCESS" as const,
      authority: "viz:asset.manage" as PermissionCode,
      newValue: {
        name: row.name,
        assetType: row.assetType,
        formatSupport: row.formatSupport,
        sourceSystem: row.sourceSystem,
        sourceObjectId: row.sourceObjectId,
        version: row.version,
        integrityHash: row.integrityHash,
      },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_ASSET_REGISTERED",
        operation: "REGISTER_ASSET",
        tenantId: actor.tenantId,
        legalEntityId: row.legalEntityId,
        subjectType: "VIZ_ASSET",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { assetType: row.assetType, formatSupport: row.formatSupport, version: row.version },
        traceId: actor.traceId,
      }),
  );
}

export type UpdateAssetInput = {
  integrityHash: string;
  rationale: string;
  sourceVersion?: string | null;
};

/**
 * Version a registered asset (viz:asset.manage): the content reference changes
 * (new integrity hash), the version increments, provenance is appended. The
 * asset id is stable across versions — scene/object identity never churns.
 */
export async function updateAssetVersion(assetId: string, input: UpdateAssetInput, actor: VizActor, principal: Principal) {
  const asset = await getAsset(principal, assetId);
  if (!asset) throw new VizDomainError("NOT_FOUND", "Asset not found within your authorized scope");
  if (asset.status === "ARCHIVED") throw new VizDomainError("INVALID_STATE", "Archived assets are immutable. Register a new asset or restore via governance.");
  if (!SHA256_HEX.test(input.integrityHash)) {
    throw new VizDomainError("INVALID_STATE", "integrityHash must be the sha256 hex digest of the referenced content.");
  }
  if (input.integrityHash === asset.integrityHash) {
    throw new VizDomainError("INVALID_STATE", "The integrity hash is unchanged; nothing to version.");
  }
  if (!input.rationale.trim()) throw new VizDomainError("INVALID_STATE", "A version update requires a rationale (provenance).");

  return withAuditTransaction(
    async (tx) => {
      const [row] = await tx
        .update(s.vizAssets)
        .set({
          integrityHash: input.integrityHash,
          version: sql`${s.vizAssets.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(s.vizAssets.id, assetId), eq(s.vizAssets.tenantId, actor.tenantId)))
        .returning();
      if (!row) throw new VizDomainError("NOT_FOUND", "Asset not found within your authorized scope");
      // Append the provenance note without dropping the registration record.
      const provenance = {
        ...(row.provenance as VizAssetRecord["provenance"]),
        lastVersionRationale: input.rationale.trim(),
        lastVersionAt: new Date().toISOString(),
        ...(input.sourceVersion?.trim() ? { sourceVersion: input.sourceVersion.trim() } : {}),
      } as VizAssetRecord["provenance"];
      const [fresh] = await tx.update(s.vizAssets).set({ provenance }).where(eq(s.vizAssets.id, assetId)).returning();
      if (!fresh) throw new VizDomainError("NOT_FOUND", "Asset not found within your authorized scope");
      return assetRowToRecord(fresh);
    },
    (row) => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_ASSET_UPDATED",
      objectType: "VIZ_ASSET",
      objectId: row.id,
      outcome: "SUCCESS" as const,
      authority: "viz:asset.manage" as PermissionCode,
      newValue: { version: row.version, integrityHash: row.integrityHash },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_ASSET_UPDATED",
        operation: "UPDATE_ASSET_VERSION",
        tenantId: actor.tenantId,
        legalEntityId: row.legalEntityId,
        subjectType: "VIZ_ASSET",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification: row.classification,
        payload: { assetType: row.assetType, version: row.version, formatSupport: row.formatSupport },
        traceId: actor.traceId,
      }),
  );
}

/** Archive an asset (viz:asset.manage). Archived assets remain auditable
 * evidence; they are excluded from default listings. */
export async function archiveAsset(assetId: string, actor: VizActor, principal: Principal) {
  const asset = await getAsset(principal, assetId);
  if (!asset) throw new VizDomainError("NOT_FOUND", "Asset not found within your authorized scope");
  if (asset.status === "ARCHIVED") throw new VizDomainError("INVALID_STATE", "Asset is already archived");
  return withAuditTransaction(
    async (tx) => {
      await tx
        .update(s.vizAssets)
        .set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(and(eq(s.vizAssets.id, assetId), eq(s.vizAssets.tenantId, actor.tenantId)));
      return { id: assetId, status: "ARCHIVED" as const };
    },
    () => ({
      tenantId: actor.tenantId,
      actorUserId: actor.userId,
      actorType: "HUMAN" as const,
      action: "VIZ_ASSET_ARCHIVED",
      objectType: "VIZ_ASSET",
      objectId: assetId,
      outcome: "SUCCESS" as const,
      authority: "viz:asset.manage" as PermissionCode,
      newValue: { status: "ARCHIVED" },
      ipAddress: actor.ipAddress ?? null,
      userAgent: actor.userAgent ?? null,
      traceId: actor.traceId,
    }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_ASSET_UPDATED",
        operation: "ARCHIVE_ASSET",
        tenantId: actor.tenantId,
        subjectType: "VIZ_ASSET",
        subjectId: assetId,
        actorUserId: actor.userId,
        classification: asset.classification,
        payload: { status: "ARCHIVED" },
        traceId: actor.traceId,
      }),
  );
}

/** The honest per-type support matrix (for UI/API/docs). */
export function assetFormatSupportMatrix(): Record<string, "IMPLEMENTED" | "NOT_IMPLEMENTED"> {
  return { ...VIZ_ASSET_FORMAT_SUPPORT };
}

export { VIZ_ASSET_STATUS };
