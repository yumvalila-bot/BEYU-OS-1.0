/**
 * BEYU OS — VISUALIZATION SERVICE (shared capability).
 *
 * The governed service seam between the API/UI and the universal dimensional
 * model: dimension-extension registration, scene configuration lifecycle,
 * digital-twin registration + LIVE projection, governed manifest building and
 * the audited export path.
 *
 * INVARIANTS
 * ──────────
 *   • Every write runs through withAuditTransaction: domain row + audit +
 *     enterprise event commit atomically (the EXISTING audit/event chain —
 *     no second ledger).
 *   • Every read is tenant-scoped in SQL AND bounded by PostgreSQL RLS inside
 *     the request's tenant database context; classification filtering is
 *     applied again in-process (defence in depth).
 *   • Deep links re-authorize: a stored scene/twin id is a REFERENCE. The
 *     manifest/twin is rebuilt LIVE through the sector adapter, which
 *     re-checks the sector's own boundary on every request.
 *   • Sector data is never copied into viz tables: scenes store configuration,
 *     twins store identity bindings, exports store hashes — never sector rows.
 *   • CAP_POSTING stays LOCKED: no code path here imports or reaches the
 *     Finance posting engine, the waterfall engine or any journal writer.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction, type EventInput } from "@/lib/audit";
import { classificationsAtOrBelow, type Classification, type PermissionCode } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import {
  CANONICAL_DIMENSIONS,
  resolveDimensionRegistry,
  normalizeCombination,
  validateDimensionExtension,
  type DimensionExtensionRecord,
  type DimensionRegistry,
  type VizSectorCode,
  VIZ_SECTOR_CODES,
} from "./dimensions";
import { buildSceneManifest, type SceneLayer, type SceneManifest } from "./scene-model";
import { authorizeVisualization, authorizeExport, assertSectorAccess, reauthorizeDeepLink } from "./authorization";
import { getAdapter } from "./adapters";
import type { AdapterDataset } from "./adapters/types";
import { buildExportArtifact, EXPORT_FORMATS, type ExportArtifact, type ExportFormat } from "./exports";
import { vizEventInput } from "./events";
import { buildProvenance, observed, unavailable } from "./provenance";
import { projectLifecycle } from "./engines/lifecycle";
import { riskPosture } from "./engines/risk";
import { facetsPresent, twinAccessibleText, twinKey as makeTwinKey, type DigitalTwin, type TwinMeasurement, type TwinRegistration, type TwinStateValue } from "./digital-twin";
import { VizDomainError } from "./errors";

export { VizDomainError } from "./errors";

export type VizActor = {
  tenantId: string;
  userId: string;
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function auditBase(
  actor: VizActor,
  action: string,
  objectType: string,
  objectId: string,
  authority: PermissionCode,
  newValue: Record<string, unknown>,
) {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN" as const,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS" as const,
    authority,
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

/* ────────────────────────── dimension registry ────────────────────────── */

function toExtensionRecord(row: typeof s.vizDimensionExtensions.$inferSelect): DimensionExtensionRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    description: row.description,
    capabilities: (row.capabilities as string[]) ?? [],
    dataRequirements: (row.dataRequirements as string[]) ?? [],
    renderingRequirements: (row.renderingRequirements as string[]) ?? [],
    requiredPermissions: (row.requiredPermissions as PermissionCode[]) ?? [],
    sectorApplicability: (row.sectorApplicability as DimensionExtensionRecord["sectorApplicability"]) ?? "*",
    lifecycleState: row.lifecycleState as DimensionExtensionRecord["lifecycleState"],
    provenance: row.provenance as DimensionExtensionRecord["provenance"],
    classification: row.classification,
  };
}

/** Resolved registry for a principal: canonical 1D–8D + XD, plus the tenant's
 * governed extensions (RLS-scoped read; classification-filtered). */
export async function registryFor(principal: Principal): Promise<DimensionRegistry> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const rows = await db
    .select()
    .from(s.vizDimensionExtensions)
    .where(and(eq(s.vizDimensionExtensions.tenantId, principal.tenantId), inArray(s.vizDimensionExtensions.classification, allowed as Classification[])))
    .orderBy(s.vizDimensionExtensions.code);
  return resolveDimensionRegistry(rows.map(toExtensionRecord));
}

export type RegisterDimensionExtensionInput = {
  code: string;
  name: string;
  description: string;
  capabilities?: string[];
  dataRequirements?: string[];
  renderingRequirements?: string[];
  requiredPermissions?: PermissionCode[];
  sectorApplicability?: VizSectorCode[] | "*";
  lifecycleState?: DimensionExtensionRecord["lifecycleState"];
  rationale: string;
  classification?: Classification;
};

/** Governed 9D+ extension registration (viz:dimension.manage, HIGH-RISK).
 * The extension mechanism means adding a dimension NEVER redesigns the
 * database — it is one governed, audited row. */
export async function registerDimensionExtension(input: RegisterDimensionExtensionInput, actor: VizActor) {
  const validation = validateDimensionExtension({
    code: input.code,
    name: input.name,
    description: input.description,
    lifecycleState: input.lifecycleState ?? "PLANNED",
    requiredPermissions: input.requiredPermissions,
  });
  if (!validation.ok) throw new VizDomainError("INVALID_STATE", validation.reason);
  if (!input.rationale.trim()) throw new VizDomainError("INVALID_STATE", "A governed dimension extension requires a rationale (provenance).");

  const id = newId(ID_PREFIX.vizDimension);
  const classification = input.classification ?? "INTERNAL";

  return withAuditTransaction(
    async (tx) => {
      const [existing] = await tx
        .select({ id: s.vizDimensionExtensions.id })
        .from(s.vizDimensionExtensions)
        .where(and(eq(s.vizDimensionExtensions.tenantId, actor.tenantId), eq(s.vizDimensionExtensions.code, validation.code)))
        .limit(1);
      if (existing) throw new VizDomainError("CONFLICT", `Dimension extension '${validation.code}' is already registered in this tenant.`);
      const row = {
        id,
        tenantId: actor.tenantId,
        code: validation.code,
        name: input.name.trim(),
        description: input.description.trim(),
        capabilities: input.capabilities ?? [],
        dataRequirements: input.dataRequirements ?? [],
        renderingRequirements: input.renderingRequirements ?? [],
        requiredPermissions: input.requiredPermissions ?? [],
        sectorApplicability: input.sectorApplicability ?? "*",
        lifecycleState: input.lifecycleState ?? "PLANNED",
        provenance: { registeredBy: actor.userId, rationale: input.rationale.trim(), registeredAt: new Date().toISOString() },
        classification,
        createdByUserId: actor.userId,
      };
      await tx.insert(s.vizDimensionExtensions).values(row);
      return row;
    },
    (row) => auditBase(actor, "VIZ_DIMENSION_REGISTERED", "VIZ_DIMENSION_EXTENSION", row.id, "viz:dimension.manage", { code: row.code, name: row.name, lifecycleState: row.lifecycleState }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_DIMENSION_REGISTERED",
        operation: "REGISTER_DIMENSION_EXTENSION",
        tenantId: actor.tenantId,
        subjectType: "VIZ_DIMENSION_EXTENSION",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { code: row.code, lifecycleState: row.lifecycleState },
        traceId: actor.traceId,
      }),
  );
}

/* ────────────────────────────── scenes ────────────────────────────── */

export type CreateSceneInput = {
  name: string;
  sector: VizSectorCode;
  subjectType?: string | null;
  subjectId?: string | null;
  dimensions: string[];
  layers?: SceneLayer[];
  config?: Record<string, unknown>;
  legalEntityId?: string | null;
  classification?: Classification;
};

function sceneRowToConfig(row: typeof s.vizScenes.$inferSelect) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    name: row.name,
    sector: row.sector as VizSectorCode,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    dimensions: (row.dimensions as string[]) ?? [],
    layers: (row.layers as SceneLayer[]) ?? [],
    config: (row.config as Record<string, unknown>) ?? {},
    status: row.status as "ACTIVE" | "ARCHIVED",
    classification: row.classification,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listScenes(principal: Principal, opts: { sector?: VizSectorCode; status?: "ACTIVE" | "ARCHIVED" } = {}) {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [eq(s.vizScenes.tenantId, principal.tenantId), inArray(s.vizScenes.classification, allowed as Classification[])];
  if (opts.sector) conditions.push(eq(s.vizScenes.sector, opts.sector));
  conditions.push(eq(s.vizScenes.status, opts.status ?? "ACTIVE"));
  const rows = await db.select().from(s.vizScenes).where(and(...conditions)).orderBy(desc(s.vizScenes.updatedAt)).limit(100);
  return rows.map(sceneRowToConfig);
}

/** Create a scene configuration. Validates the dimension combination against
 * the RESOLVED registry (canonical + this tenant's governed extensions) —
 * unknown dimensions are rejected, never assumed. */
export async function createScene(input: CreateSceneInput, actor: VizActor, principal: Principal) {
  if (!input.name.trim()) throw new VizDomainError("INVALID_STATE", "A scene requires a name.");
  if (!(VIZ_SECTOR_CODES as readonly string[]).includes(input.sector)) {
    throw new VizDomainError("SECTOR_UNSUPPORTED", `Unknown sector '${String(input.sector)}'. The canonical consumers are BEYU, HEALTH, FINANCE, AGRICULTURE, UJENZI and FOUNDATION.`);
  }
  // A scene over sector data requires the sector's own boundary AT CREATION
  // too — a principal cannot pre-configure a scene into data they cannot read.
  const sectorAccess = await assertSectorAccess(principal, input.sector);
  if (!sectorAccess.allowed) throw new VizDomainError("SCOPE", sectorAccess.reason);

  const registry = await registryFor(principal);
  const combination = normalizeCombination(input.dimensions, registry);
  if (!combination.ok) throw new VizDomainError("DIMENSION_UNKNOWN", combination.reason);

  const id = newId(ID_PREFIX.vizScene);
  const classification = input.classification ?? "INTERNAL";
  const layers = input.layers ?? defaultLayersFor(combination.dimensions.map((d) => d.id), input.sector);

  return withAuditTransaction(
    async (tx) => {
      const row = {
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId ?? null,
        name: input.name.trim(),
        sector: input.sector,
        subjectType: input.subjectType ?? null,
        subjectId: input.subjectId ?? null,
        dimensions: combination.dimensions.map((d) => d.id),
        layers,
        config: input.config ?? {},
        status: "ACTIVE" as const,
        classification,
        createdByUserId: actor.userId,
      };
      await tx.insert(s.vizScenes).values(row);
      return row;
    },
    (row) => auditBase(actor, "VIZ_SCENE_CREATED", "VIZ_SCENE", row.id, "viz:scene.manage", { name: row.name, sector: row.sector, dimensions: row.dimensions }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_SCENE_CREATED",
        operation: "CREATE_SCENE",
        tenantId: actor.tenantId,
        legalEntityId: row.legalEntityId,
        subjectType: "VIZ_SCENE",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { sector: row.sector, dimensions: row.dimensions },
        traceId: actor.traceId,
      }),
  );
}

/** Deterministic default layer set for a dimension combination. */
export function defaultLayersFor(dimensions: string[], sector: VizSectorCode): SceneLayer[] {
  const layers: SceneLayer[] = [];
  const p = sector.toLowerCase();
  if (dimensions.includes("1D")) layers.push({ id: `${p}-information`, dimensionId: "1D", kind: "TABLE", label: "Information (1D)", visible: true });
  if (dimensions.includes("2D")) layers.push({ id: `${p}-graphics`, dimensionId: "2D", kind: "MAP", label: "Flat graphics (2D)", visible: true });
  if (dimensions.includes("3D")) layers.push({ id: `${p}-spatial`, dimensionId: "3D", kind: "SPATIAL", label: "Spatial (3D foundation)", visible: true });
  if (dimensions.includes("4D")) layers.push({ id: `${p}-time`, dimensionId: "4D", kind: "TIMELINE", label: "Time (4D)", visible: true });
  if (dimensions.includes("5D")) layers.push({ id: `${p}-quantity`, dimensionId: "5D", kind: "CHART", label: "Quantity / cost (5D, read-governed)", visible: true });
  if (dimensions.includes("6D")) layers.push({ id: `${p}-performance`, dimensionId: "6D", kind: "METRIC_RAIL", label: "Environment / performance (6D)", visible: true });
  if (dimensions.includes("7D")) layers.push({ id: `${p}-lifecycle`, dimensionId: "7D", kind: "TIMELINE", label: "Lifecycle / operations (7D)", visible: true });
  if (dimensions.includes("8D")) layers.push({ id: `${p}-risk`, dimensionId: "8D", kind: "RISK_OVERLAY", label: "Safety / risk / compliance (8D)", visible: true });
  for (const d of dimensions) {
    const parsed = Number(d.slice(0, d.indexOf("D")));
    if (Number.isFinite(parsed) && parsed >= 9) layers.push({ id: `${p}-${d.toLowerCase()}`, dimensionId: d, kind: "TABLE", label: `Extension ${d}`, visible: true });
  }
  if (layers.length === 0) layers.push({ id: `${p}-information`, dimensionId: "1D", kind: "TABLE", label: "Information (1D)", visible: true });
  return layers;
}

/** Deep-link load: a stored scene by id, re-authorized (§21). Returns null
 * when the id does not resolve inside the principal's scope — NOT_FOUND,
 * never a forbidden-existence leak. */
export async function getScene(principal: Principal, sceneId: string) {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const [row] = await db
    .select()
    .from(s.vizScenes)
    .where(and(eq(s.vizScenes.id, sceneId), eq(s.vizScenes.tenantId, principal.tenantId), inArray(s.vizScenes.classification, allowed as Classification[])))
    .limit(1);
  if (!row) return null;
  const scene = sceneRowToConfig(row);
  const decision = await reauthorizeDeepLink(principal, { tenantId: scene.tenantId, classification: scene.classification, sector: scene.sector, legalEntityId: scene.legalEntityId }, "viz:scene.read");
  if (!decision.allowed) {
    if (decision.notFound) return null;
    throw new VizDomainError("SCOPE", decision.reason);
  }
  return scene;
}

export async function archiveScene(sceneId: string, actor: VizActor, principal: Principal) {
  const scene = await getScene(principal, sceneId);
  if (!scene) throw new VizDomainError("NOT_FOUND", "Scene not found within your authorized scope");
  if (scene.status === "ARCHIVED") throw new VizDomainError("INVALID_STATE", "Scene is already archived");
  return withAuditTransaction(
    async (tx) => {
      await tx
        .update(s.vizScenes)
        .set({ status: "ARCHIVED", updatedAt: new Date() })
        .where(and(eq(s.vizScenes.id, sceneId), eq(s.vizScenes.tenantId, actor.tenantId)));
      return { id: sceneId, status: "ARCHIVED" as const };
    },
    () => auditBase(actor, "VIZ_SCENE_ARCHIVED", "VIZ_SCENE", sceneId, "viz:scene.manage", { status: "ARCHIVED" }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_SCENE_ARCHIVED",
        operation: "ARCHIVE_SCENE",
        tenantId: actor.tenantId,
        subjectType: "VIZ_SCENE",
        subjectId: sceneId,
        actorUserId: actor.userId,
        classification: scene.classification,
        payload: {},
        traceId: actor.traceId,
      }),
  );
}

/* ───────────────────── governed manifest building ───────────────────── */

export type ManifestRequest = {
  sector: VizSectorCode;
  dimensions: string[];
  subjectId?: string | null;
  sceneName?: string;
  presentation?: { reducedMotion?: boolean; lowBandwidth?: boolean };
};

/**
 * THE governed read path: adapter collection → manifest projection.
 * Used by the workspace UI, the scene deep-link route and the export path, so
 * all three present EXACTLY the same governed data (one projection, one
 * allowlist — no export can be wider than the screen).
 */
export async function buildGovernedManifest(principal: Principal, request: ManifestRequest): Promise<SceneManifest> {
  const registry = await registryFor(principal);
  const combination = normalizeCombination(request.dimensions, registry);
  if (!combination.ok) throw new VizDomainError("DIMENSION_UNKNOWN", combination.reason);

  const adapter = getAdapter(request.sector);
  if (!adapter) throw new VizDomainError("SECTOR_UNSUPPORTED", `No adapter is registered for sector '${String(request.sector)}'.`);

  const dataset: AdapterDataset = await adapter.collect(principal, {
    subjectId: request.subjectId ?? null,
    dimensions: combination.dimensions.map((d) => d.id),
    limit: request.presentation?.lowBandwidth ? 120 : 300,
  });
  if (dataset.status === "NOT_AVAILABLE" && dataset.objects.length === 0) {
    // Honest empty scene: the reason is surfaced to the AUTHORIZED principal
    // only (unauthorized callers never reach this point).
    return buildSceneManifest({
      sceneId: null,
      name: request.sceneName ?? `${request.sector} dimensional scene`,
      sector: request.sector,
      dimensions: combination.dimensions.map((d) => d.id),
      layers: defaultLayersFor(combination.dimensions.map((d) => d.id), request.sector),
      objects: [],
      principal,
      sourceAdapter: adapter.describe().sector,
      systemOfRecord: dataset.systemOfRecord,
      presentation: request.presentation,
    });
  }

  const layers = defaultLayersFor(combination.dimensions.map((d) => d.id), request.sector);
  return buildSceneManifest({
    sceneId: null,
    name: request.sceneName ?? `${request.sector} dimensional scene`,
    sector: request.sector,
    dimensions: combination.dimensions.map((d) => d.id),
    layers,
    objects: dataset.objects,
    principal,
    sourceAdapter: adapter.describe().sector,
    systemOfRecord: dataset.systemOfRecord,
    presentation: request.presentation,
  });
}

/** Manifest for a STORED scene (deep link): loads the config, re-authorizes,
 * then rebuilds the data LIVE through the adapter. */
export async function sceneManifest(principal: Principal, sceneId: string, presentation?: ManifestRequest["presentation"]): Promise<SceneManifest> {
  const scene = await getScene(principal, sceneId);
  if (!scene) throw new VizDomainError("NOT_FOUND", "Scene not found within your authorized scope");
  const manifest = await buildGovernedManifest(principal, {
    sector: scene.sector,
    dimensions: scene.dimensions,
    subjectId: scene.subjectId,
    sceneName: scene.name,
    presentation,
  });
  return { ...manifest, sceneId: scene.id, layers: scene.layers.length > 0 ? scene.layers : manifest.layers };
}

/* ─────────────────────────── digital twins ─────────────────────────── */

export type RegisterTwinInput = {
  sector: VizSectorCode;
  subjectType: string;
  subjectId: string;
  name: string;
  legalEntityId?: string | null;
  classification?: Classification;
};

export async function listTwins(principal: Principal, opts: { sector?: VizSectorCode } = {}) {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const conditions = [eq(s.vizDigitalTwins.tenantId, principal.tenantId), inArray(s.vizDigitalTwins.classification, allowed as Classification[])];
  if (opts.sector) conditions.push(eq(s.vizDigitalTwins.sector, opts.sector));
  const rows = await db.select().from(s.vizDigitalTwins).where(and(...conditions)).orderBy(desc(s.vizDigitalTwins.createdAt)).limit(100);
  return rows.map(twinRowToRegistration);
}

function twinRowToRegistration(row: typeof s.vizDigitalTwins.$inferSelect): TwinRegistration {
  return {
    id: row.id,
    tenantId: row.tenantId,
    twinKey: row.twinKey,
    sector: row.sector as VizSectorCode,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    legalEntityId: row.legalEntityId,
    name: row.name,
    status: row.status as TwinRegistration["status"],
    classification: row.classification,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Register a twin identity binding. Requires the sector's own boundary at
 * registration time (a twin cannot be pinned into unreadable data). */
export async function registerTwin(input: RegisterTwinInput, actor: VizActor, principal: Principal) {
  if (!(VIZ_SECTOR_CODES as readonly string[]).includes(input.sector)) {
    throw new VizDomainError("SECTOR_UNSUPPORTED", `Unknown sector '${String(input.sector)}'.`);
  }
  if (!input.subjectType.trim() || !input.subjectId.trim() || !input.name.trim()) {
    throw new VizDomainError("INVALID_STATE", "A twin requires a subject type, subject id and name.");
  }
  const sectorAccess = await assertSectorAccess(principal, input.sector);
  if (!sectorAccess.allowed) throw new VizDomainError("SCOPE", sectorAccess.reason);

  const id = newId(ID_PREFIX.vizTwin);
  const key = makeTwinKey(input.sector, input.subjectType.trim(), input.subjectId.trim());
  const classification = input.classification ?? "INTERNAL";

  return withAuditTransaction(
    async (tx) => {
      const [existing] = await tx
        .select({ id: s.vizDigitalTwins.id })
        .from(s.vizDigitalTwins)
        .where(and(eq(s.vizDigitalTwins.tenantId, actor.tenantId), eq(s.vizDigitalTwins.twinKey, key)))
        .limit(1);
      if (existing) throw new VizDomainError("CONFLICT", `Twin '${key}' is already registered in this tenant.`);
      const row = {
        id,
        tenantId: actor.tenantId,
        twinKey: key,
        sector: input.sector,
        subjectType: input.subjectType.trim(),
        subjectId: input.subjectId.trim(),
        legalEntityId: input.legalEntityId ?? null,
        name: input.name.trim(),
        status: "REGISTERED" as const,
        classification,
        createdByUserId: actor.userId,
      };
      await tx.insert(s.vizDigitalTwins).values(row);
      return row;
    },
    (row) => auditBase(actor, "VIZ_TWIN_REGISTERED", "VIZ_DIGITAL_TWIN", row.id, "viz:scene.manage", { twinKey: row.twinKey, sector: row.sector }),
    (row): EventInput =>
      vizEventInput({
        type: "VIZ_TWIN_REGISTERED",
        operation: "REGISTER_TWIN",
        tenantId: actor.tenantId,
        legalEntityId: row.legalEntityId,
        subjectType: "VIZ_DIGITAL_TWIN",
        subjectId: row.id,
        actorUserId: actor.userId,
        classification,
        payload: { twinKey: row.twinKey },
        traceId: actor.traceId,
      }),
  );
}

/** Deep-link twin load + re-authorization. */
export async function getTwinRegistration(principal: Principal, twinId: string): Promise<TwinRegistration | null> {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const [row] = await db
    .select()
    .from(s.vizDigitalTwins)
    .where(and(eq(s.vizDigitalTwins.id, twinId), eq(s.vizDigitalTwins.tenantId, principal.tenantId), inArray(s.vizDigitalTwins.classification, allowed as Classification[])))
    .limit(1);
  if (!row) return null;
  const registration = twinRowToRegistration(row);
  const decision = await reauthorizeDeepLink(principal, { tenantId: registration.tenantId, classification: registration.classification, sector: registration.sector, legalEntityId: registration.legalEntityId }, "viz:scene.read");
  if (!decision.allowed) {
    if (decision.notFound) return null;
    throw new VizDomainError("SCOPE", decision.reason);
  }
  return registration;
}

/**
 * LIVE twin projection: the registration supplies identity; the adapter
 * supplies every other facet, re-authorized and re-collected per request.
 * Stored rows never serve sector truth — a twin cannot go stale into a leak.
 */
export async function projectTwin(principal: Principal, twinId: string): Promise<DigitalTwin> {
  const registration = await getTwinRegistration(principal, twinId);
  if (!registration) throw new VizDomainError("NOT_FOUND", "Digital twin not found within your authorized scope");

  const adapter = getAdapter(registration.sector);
  if (!adapter) throw new VizDomainError("SECTOR_UNSUPPORTED", `No adapter for sector '${registration.sector}'.`);

  const dataset = await adapter.collect(principal, {
    subjectId: registration.subjectId,
    dimensions: ["1D", "2D", "3D", "4D", "5D", "6D", "7D", "8D"],
    limit: 200,
  });

  const match = dataset.objects.find((o) => o.id === registration.subjectId) ?? null;
  const state: TwinStateValue[] = match
    ? Object.entries(match.dimensionValues).map(([code, v]) => ({ code: `dimension:${code}`, reading: v }))
    : [];
  if (match?.status) state.push({ code: "operationalStatus", reading: observed(match.status) });
  if (!match) state.push({ code: "sectorRecord", reading: unavailable() });

  const measurements: TwinMeasurement[] = [
    ...dataset.quantities
      .filter((q) => q.subjectKey === registration.subjectId)
      .map((q) => ({ code: `quantity:${q.kind}${q.label ? `:${q.label.slice(0, 40)}` : ""}`, reading: q.amount, at: q.at ?? null })),
    ...dataset.performance
      .filter((p) => p.subjectKey === registration.subjectId)
      .map((p) => ({ code: `performance:${p.code}`, reading: p.reading, at: p.at })),
  ];

  const lifecycle = projectLifecycle(
    registration.subjectId,
    dataset.lifecycle.filter((e) => e.subjectKey === registration.subjectId),
  );
  const posture = riskPosture(dataset.risk.filter((r) => r.subjectKey === registration.subjectId));

  const geometry = match?.geometry ?? null;
  const location = geometry && (geometry.latitude !== null || geometry.longitude !== null)
    ? { crs: geometry.crs, latitude: geometry.latitude ?? null, longitude: geometry.longitude ?? null }
    : null;

  const identity = {
    twinKey: registration.twinKey,
    sector: registration.sector,
    subjectType: registration.subjectType,
    subjectId: registration.subjectId,
    tenantId: registration.tenantId,
    legalEntityId: registration.legalEntityId,
    countryCode: null,
    name: registration.name,
  };

  const provenance = buildProvenance({
    sourceAdapter: registration.sector,
    systemOfRecord: dataset.systemOfRecord,
    statuses: [
      ...state.map((v) => v.reading.status),
      ...measurements.map((m) => m.reading.status),
      dataset.status === "PARTIAL" ? ("UNAVAILABLE" as const) : ("OBSERVED" as const),
    ],
  });

  const base = {
    identity,
    state,
    relationships: dataset.relationships,
    geometry,
    location,
    time: {
      registeredAt: registration.createdAt,
      lastObservedAt: dataset.time.filter((t) => t.ref === registration.subjectId).map((t) => t.at).sort().pop() ?? null,
      recentEventRefs: dataset.time.filter((t) => t.ref === registration.subjectId).slice(-10).map((t) => `${t.source}:${t.ref}`),
    },
    measurements,
    lifecycle: lifecycle.history.length > 0 || lifecycle.currentStage.status !== "UNAVAILABLE" ? lifecycle : null,
    risk: posture.length > 0 ? posture[0] : null,
    provenance,
    permissions: {
      classification: registration.classification,
      requiredPermissions: ["viz:scene.read", ...(dataset.sector === "UJENZI" ? ["ujenzi:data.read"] : dataset.sector === "AGRICULTURE" ? ["agriculture:data.read"] : [])],
    },
  };
  const twin: DigitalTwin = { ...base, facets: facetsPresent(base) };
  // Attach the accessible representation for clients (non-enumerated field
  // keeps the DigitalTwin shape canonical).
  (twin as DigitalTwin & { accessibleText?: string }).accessibleText = twinAccessibleText(twin);
  return twin;
}

/* ───────────────────────────── exports ───────────────────────────── */

export type CreateExportInput = {
  sceneId?: string | null;
  twinId?: string | null;
  sector: VizSectorCode;
  dimensions: string[];
  subjectId?: string | null;
  format: ExportFormat;
};

/**
 * Governed export (§31): requires viz:export (checked at the route) — viewing
 * is not exporting. The content is the SAME governed manifest the screen
 * receives; the ledger row + audit + event make every export reconstructible
 * evidence.
 */
export async function createExport(input: CreateExportInput, actor: VizActor, principal: Principal): Promise<{ exportId: string; artifact: ExportArtifact; classification: Classification }> {
  if (!input.sceneId && !input.twinId) {
    throw new VizDomainError("INVALID_STATE", "An export must reference a governed scene or digital twin.");
  }
  if (!(EXPORT_FORMATS as readonly string[]).includes(input.format)) {
    // Honest refusal: server-side export artifacts exist for JSON/CSV only.
    // SVG/PNG can be saved client-side from the SAME governed manifest in the
    // workspace; PDF and IFC are NOT_IMPLEMENTED (declared, not hidden).
    throw new VizDomainError("INVALID_STATE", `Server-side export format '${String(input.format)}' is NOT_IMPLEMENTED. Governed server exports are ${EXPORT_FORMATS.join(" / ")}; SVG/PNG are available client-side from the same governed manifest.`);
  }
  let manifest: SceneManifest;
  let classification: Classification = "INTERNAL";
  if (input.sceneId) {
    const scene = await getScene(principal, input.sceneId);
    if (!scene) throw new VizDomainError("NOT_FOUND", "Scene not found within your authorized scope");
    classification = scene.classification;
    manifest = await sceneManifest(principal, scene.id);
  } else {
    const twin = await getTwinRegistration(principal, input.twinId!);
    if (!twin) throw new VizDomainError("NOT_FOUND", "Digital twin not found within your authorized scope");
    classification = twin.classification;
    const projection = await projectTwin(principal, twin.id);
    manifest = twinToManifest(projection, twin, principal);
  }

  // §31: viewing is not exporting. Re-check the export grant + sector
  // conjunction against the RESOLVED classification of the target (a scene
  // stored above the principal's ceiling is refused here, not leaked).
  const exportDecision = await authorizeExport(principal, input.sector, classification);
  if (!exportDecision.allowed) {
    throw new VizDomainError("EXPORT_FORBIDDEN", exportDecision.reason);
  }

  const exportId = newId(ID_PREFIX.vizExport);
  const artifact = buildExportArtifact(manifest, input.format, exportId);

  await withAuditTransaction(
    async (tx) => {
      await tx.insert(s.vizExports).values({
        id: exportId,
        tenantId: actor.tenantId,
        sceneId: input.sceneId ?? null,
        twinId: input.twinId ?? null,
        format: input.format,
        contentHash: artifact.contentHash,
        byteSize: artifact.byteSize,
        rowCount: artifact.rowCount,
        dimensions: manifest.dimensions,
        sector: input.sector,
        classification,
        requestedByUserId: actor.userId,
      });
      return { exportId };
    },
    () => auditBase(actor, "VIZ_EXPORT_CREATED", "VIZ_EXPORT", exportId, "viz:export", { format: input.format, contentHash: artifact.contentHash, byteSize: artifact.byteSize, rowCount: artifact.rowCount, sector: input.sector }),
    (): EventInput =>
      vizEventInput({
        type: "VIZ_EXPORT_CREATED",
        operation: "CREATE_EXPORT",
        tenantId: actor.tenantId,
        subjectType: "VIZ_EXPORT",
        subjectId: exportId,
        actorUserId: actor.userId,
        classification,
        payload: { format: input.format, contentHash: artifact.contentHash, sector: input.sector },
        traceId: actor.traceId,
      }),
  );

  return { exportId, artifact, classification };
}

/** Deterministic single-twin manifest for twin exports. The principal was
 * already re-authorized by projectTwin; the manifest ceiling equals the
 * registration's classification so the export allowlist can never exceed the
 * stored twin's governed class. */
function twinToManifest(twin: DigitalTwin, registration: TwinRegistration, principal: Principal): SceneManifest {
  const accessibleText = twinAccessibleText(twin);
  return buildSceneManifest({
    sceneId: null,
    name: `Digital twin ${registration.name}`,
    sector: registration.sector,
    dimensions: ["1D", ...(twin.geometry ? ["3D"] : []), ...(twin.lifecycle ? ["7D"] : []), ...(twin.risk ? ["8D"] : [])],
    layers: [{ id: "twin", dimensionId: "1D", kind: "TABLE", label: "Twin facets", visible: true }],
    objects: [
      {
        id: registration.id,
        label: registration.name,
        layerId: "twin",
        classification: registration.classification,
        geometry: twin.geometry,
        dimensionValues: Object.fromEntries(twin.state.map((v) => [v.code, v.reading])),
        accessibleText,
        timeAnchor: twin.time.lastObservedAt,
        status: String(twin.state.find((v) => v.code === "operationalStatus")?.reading.value ?? "UNKNOWN"),
      },
    ],
    principal,
    sourceAdapter: registration.sector,
    systemOfRecord: twin.provenance.systemOfRecord,
  });
}

export async function listExports(principal: Principal) {
  const allowed = classificationsAtOrBelow(principal.clearance);
  const rows = await db
    .select()
    .from(s.vizExports)
    .where(and(eq(s.vizExports.tenantId, principal.tenantId), inArray(s.vizExports.classification, allowed as Classification[])))
    .orderBy(desc(s.vizExports.createdAt))
    .limit(100);
  return rows.map((r) => ({
    id: r.id,
    sceneId: r.sceneId,
    twinId: r.twinId,
    format: r.format,
    contentHash: r.contentHash,
    byteSize: r.byteSize,
    rowCount: r.rowCount,
    dimensions: r.dimensions as string[],
    sector: r.sector,
    classification: r.classification,
    requestedByUserId: r.requestedByUserId,
    createdAt: r.createdAt.toISOString(),
  }));
}

/* ─────────────────────── capability status summary ─────────────────────── */

/** The honest subsystem status matrix (§6 A–S) for docs/API/UI. */
export const VIZ_SUBSYSTEM_STATUS: Array<{ subsystem: string; status: string; where: string }> = [
  { subsystem: "A. Graphics Core", status: "IMPLEMENTED", where: "src/lib/viz (scene model + workspace)" },
  { subsystem: "B. Dimension Registry", status: "IMPLEMENTED", where: "src/lib/viz/dimensions.ts + viz_dimension_extensions" },
  { subsystem: "C. Visualization Registry", status: "IMPLEMENTED", where: "src/lib/viz/adapters (descriptor matrix) + viz_scenes" },
  { subsystem: "D. Scene Model", status: "IMPLEMENTED", where: "src/lib/viz/scene-model.ts" },
  { subsystem: "E. Data Adapter Layer", status: "IMPLEMENTED", where: "src/lib/viz/adapters/*" },
  { subsystem: "F. Renderer Abstraction", status: "IMPLEMENTED", where: "src/lib/viz/renderers.ts (SVG/table/projection; WebGL PLANNED)" },
  { subsystem: "G. Interaction Layer", status: "IMPLEMENTED", where: "src/app/os/viz/workspace.tsx (keyboard contract, inspection)" },
  { subsystem: "H. Time Engine (4D)", status: "IMPLEMENTED", where: "src/lib/viz/engines/time.ts" },
  { subsystem: "I. Quantity/Cost/Resource Engine (5D)", status: "IMPLEMENTED", where: "src/lib/viz/engines/quantity.ts (READ-ONLY; CAP_POSTING LOCKED)" },
  { subsystem: "J. Performance/Environment Engine (6D)", status: "IMPLEMENTED", where: "src/lib/viz/engines/performance.ts" },
  { subsystem: "K. Lifecycle Engine (7D)", status: "IMPLEMENTED", where: "src/lib/viz/engines/lifecycle.ts" },
  { subsystem: "L. Safety/Risk/Compliance Engine (8D)", status: "IMPLEMENTED", where: "src/lib/viz/engines/risk.ts" },
  { subsystem: "M. Digital Twin Layer", status: "IMPLEMENTED", where: "src/lib/viz/digital-twin.ts + viz_digital_twins (live projection)" },
  { subsystem: "N. Provenance Layer", status: "IMPLEMENTED", where: "src/lib/viz/provenance.ts (canonical Noelia epistemics)" },
  { subsystem: "O. Accessibility Layer", status: "IMPLEMENTED", where: "src/lib/viz/accessibility.ts + accessible table in every manifest" },
  { subsystem: "P. Export Layer", status: "PARTIALLY_IMPLEMENTED", where: "src/lib/viz/exports.ts (JSON/CSV server-side; SVG/PNG client-side; PDF/IFC NOT_IMPLEMENTED)" },
  { subsystem: "Q. XR Adapter Foundation", status: "PARTIALLY_IMPLEMENTED", where: "src/lib/viz/xr.ts (contract + fail-closed null adapter; XR runtime NOT_IMPLEMENTED)" },
  { subsystem: "R. Permission/Policy Enforcement", status: "IMPLEMENTED", where: "src/lib/viz/authorization.ts over the canonical can()/guarded()/RLS kernel" },
  { subsystem: "S. Audit/Event Integration", status: "IMPLEMENTED", where: "withAuditTransaction + enterprise_events (VIZ_* acts) — the existing chains" },
  { subsystem: "BIM/IFC geometry parsing", status: "NOT_IMPLEMENTED", where: "declared in the Ujenzi adapter descriptor; no parser exists" },
  { subsystem: "3D WebGL rendering", status: "PLANNED", where: "renderer abstraction declares WEBGL_3D; no dependency bundled" },
  { subsystem: "Health clinical/facility datasets", status: "PLANNED", where: "requires a governed non-PHI Health federation data contract" },
];

/** Convenience: canonical registry without tenant extensions (pure). */
export function canonicalRegistry(): DimensionRegistry {
  return resolveDimensionRegistry([]);
}

export { CANONICAL_DIMENSIONS };

/** Route-level authorization helper reused by every /api/v1/viz route so the
 * viz permission + entity-scope rule can never be forgotten per endpoint. */
export function vizRouteAuthorization(principal: Principal, permission: PermissionCode, classification?: Classification) {
  return authorizeVisualization(principal, { permission, classification });
}
