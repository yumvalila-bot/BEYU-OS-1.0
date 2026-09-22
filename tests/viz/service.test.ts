/**
 * Visualization service — governed lifecycle certification (real PostgreSQL).
 *
 * Scenes, twins, dimension extensions and exports run through the EXISTING
 * audit/event chain (withAuditTransaction): every act produces a domain row +
 * an audit-ledger row + an enterprise event atomically. Deep links resolve
 * NOT_FOUND across tenants. Extensions can never shadow canonical dimensions.
 * Exporting without viz:export is refused AFTER the scene resolves — viewing
 * is not exporting.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents, legalEntities, ujenziProjects, vizDigitalTwins, vizDimensionExtensions, vizExports, vizScenes } from "@/db/schema";
import { createProject, type UjenziActor } from "@/lib/ujenzi";
import { can } from "@/lib/authz";
import {
  archiveScene,
  buildGovernedManifest,
  createExport,
  createScene,
  getScene,
  listExports,
  listScenes,
  listTwins,
  projectTwin,
  registerDimensionExtension,
  registerTwin,
  registryFor,
  sceneManifest,
  VizDomainError,
  type VizActor,
} from "@/lib/viz/service";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZSVC${Date.now()}`;
const EXT_CODE = "9D_SVC_PROBE";

function vizActorFor(principal: { tenantId: string; userId: string }): VizActor {
  return { tenantId: principal.tenantId, userId: principal.userId, traceId: `TRACEVZS${Date.now()}`, ipAddress: null, userAgent: null };
}

async function eventCount(type: string, subjectId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enterpriseEvents)
    .where(and(eq(enterpriseEvents.type, type), eq(enterpriseEvents.subjectId, subjectId)));
  return Number(row?.n ?? 0);
}

async function auditCount(objectId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(eq(auditLog.objectId, objectId));
  return Number(row?.n ?? 0);
}

describe("visualization service — governed lifecycle", () => {
  let ujenziOps: Awaited<ReturnType<typeof seededPrincipal>>;
  let ceo: Awaited<ReturnType<typeof seededPrincipal>>;
  let governance: Awaited<ReturnType<typeof seededPrincipal>>;
  let admin: Awaited<ReturnType<typeof seededPrincipal>>;
  let ujenziActor: UjenziActor;
  let projectId = "";
  let sceneId = "";
  let twinId = "";
  let ceoSceneId = "";
  let extensionId = "";

  beforeAll(async () => {
    ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    ceo = await seededPrincipal("ceo@beyu.os");
    governance = await seededPrincipal("governance@beyu.os");
    admin = await seededPrincipal("admin@beyu.os");
    ujenziActor = { tenantId: ujenziOps.tenantId, userId: ujenziOps.userId, traceId: `TRACEVZS${Date.now()}` };
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const project = await createProject(
      { tenantId: ujenziOps.tenantId, legalEntityId: entity.id, code: `${RUN}P`, name: `${RUN} service tower`, countryCode: "TZ" },
      ujenziActor,
    );
    projectId = project.id;
  });

  afterAll(async () => {
    await db.delete(vizExports).where(and(like(vizExports.id, "VZE%"), sql`${vizExports.tenantId} IN (${ujenziOps.tenantId}, ${ceo.tenantId})`, sql`(${vizExports.sceneId} IN (SELECT id FROM viz_scenes WHERE name LIKE ${RUN + "%"}) OR ${vizExports.twinId} IN (SELECT id FROM viz_digital_twins WHERE name LIKE ${RUN + "%"}))`));
    await db.delete(vizDigitalTwins).where(and(like(vizDigitalTwins.name, `${RUN}%`)));
    await db.delete(vizScenes).where(and(like(vizScenes.name, `${RUN}%`)));
    await db.delete(vizDimensionExtensions).where(eq(vizDimensionExtensions.code, EXT_CODE));
    await db.delete(ujenziProjects).where(and(eq(ujenziProjects.tenantId, ujenziOps.tenantId), like(ujenziProjects.code, `${RUN}%`)));
  });

  it("createScene writes scene + audit + VIZ_SCENE_CREATED atomically", async () => {
    const scene = await createScene(
      { name: `${RUN} lifecycle`, sector: "UJENZI", subjectType: "PROJECT", subjectId: projectId, dimensions: ["1D", "2D", "4D"] },
      vizActorFor(ujenziOps),
      ujenziOps,
    );
    sceneId = scene.id;
    expect(scene.dimensions).toEqual(["1D", "2D", "4D"]);
    expect(scene.layers.length).toBeGreaterThanOrEqual(3); // default layer set per dimension
    expect(await eventCount("VIZ_SCENE_CREATED", sceneId)).toBe(1);
    expect(await auditCount(sceneId)).toBeGreaterThanOrEqual(1);
    const scenes = await listScenes(ujenziOps);
    expect(scenes.map((s) => s.id)).toContain(sceneId);
  });

  it("createScene rejects unknown dimensions and unauthorized sectors", async () => {
    await expect(
      createScene({ name: `${RUN} bad dims`, sector: "UJENZI", dimensions: ["1D", "77X"] }, vizActorFor(ujenziOps), ujenziOps),
    ).rejects.toMatchObject({ code: "DIMENSION_UNKNOWN" });
    await expect(
      createScene({ name: `${RUN} wrong sector`, sector: "AGRICULTURE", dimensions: ["1D"] }, vizActorFor(ujenziOps), ujenziOps),
    ).rejects.toBeInstanceOf(VizDomainError);
  });

  it("sceneManifest rebuilds LIVE data through the adapter (deep link re-authorizes)", async () => {
    const manifest = await sceneManifest(ujenziOps, sceneId);
    expect(manifest.sceneId).toBe(sceneId);
    expect(manifest.sector).toBe("UJENZI");
    expect(manifest.objects.length).toBeGreaterThanOrEqual(1);
    const direct = await getScene(ujenziOps, sceneId);
    expect(direct?.id).toBe(sceneId);
  });

  it("a cross-tenant deep link resolves NOT_FOUND — existence is protected", async () => {
    expect(await getScene(ceo, sceneId)).toBeNull();
    await expect(sceneManifest(ceo, sceneId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("archiveScene transitions once, emits VIZ_SCENE_ARCHIVED, and refuses repeats", async () => {
    const scene = await createScene({ name: `${RUN} archive-me`, sector: "UJENZI", dimensions: ["1D"] }, vizActorFor(ujenziOps), ujenziOps);
    await archiveScene(scene.id, vizActorFor(ujenziOps), ujenziOps);
    expect(await eventCount("VIZ_SCENE_ARCHIVED", scene.id)).toBe(1);
    await expect(archiveScene(scene.id, vizActorFor(ujenziOps), ujenziOps)).rejects.toMatchObject({ code: "INVALID_STATE" }); // already archived — honest refusal, not a second transition
  });

  it("registerTwin binds identity only; projectTwin projects LIVE facets", async () => {
    const twin = await registerTwin(
      { sector: "UJENZI", subjectType: "PROJECT", subjectId: projectId, name: `${RUN} tower twin` },
      vizActorFor(ujenziOps),
      ujenziOps,
    );
    twinId = twin.id;
    expect(twin.twinKey).toBe(`UJENZI:PROJECT:${projectId}`);
    expect(await eventCount("VIZ_TWIN_REGISTERED", twinId)).toBe(1);
    await expect(
      registerTwin({ sector: "UJENZI", subjectType: "PROJECT", subjectId: projectId, name: `${RUN} duplicate` }, vizActorFor(ujenziOps), ujenziOps),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const projection = await projectTwin(ujenziOps, twinId);
    expect(projection.identity.twinKey).toBe(twin.twinKey);
    expect(projection.provenance.systemOfRecord).toMatch(/ujenzi_/);
    expect(projection.facets.length).toBeGreaterThan(0);
    const twins = await listTwins(ujenziOps);
    expect(twins.map((t) => t.id)).toContain(twinId);
  });

  it("registerTwin refuses sectors the principal cannot read", async () => {
    await expect(
      registerTwin({ sector: "FOUNDATION", subjectType: "FOUNDATION", subjectId: "FND_X", name: `${RUN} sneaky` }, vizActorFor(ujenziOps), ujenziOps),
    ).rejects.toMatchObject({ code: "SCOPE" });
  });

  it("registerDimensionExtension: governed 9D+, canonical shadowing refused, posting authority refused", async () => {
    expect(can(admin, "viz:dimension.manage").allowed).toBe(true);
    const extension = await registerDimensionExtension(
      { code: EXT_CODE, name: `${RUN} probe`, description: `${RUN} service-level probe extension`, lifecycleState: "EXPERIMENTAL", rationale: `${RUN} proving the 9D+ extension mechanism end to end` },
      vizActorFor(admin),
    );
    extensionId = extension.id;
    expect(await eventCount("VIZ_DIMENSION_REGISTERED", extensionId)).toBe(1);
    const registry = await registryFor(admin);
    expect(registry.dimensions.map((d) => d.id)).toContain(EXT_CODE);
    expect(registry.extensionCount).toBeGreaterThanOrEqual(1);

    await expect(
      registerDimensionExtension({ code: "3D", name: "shadow", description: "attempt to shadow a canonical dimension", rationale: "should be refused before persistence" }, vizActorFor(admin)),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      registerDimensionExtension(
        { code: "9D_POSTING", name: "money", description: "attempt to attach posting authority to a dimension", requiredPermissions: ["finance:ledger.post"], rationale: "should be refused — CAP_POSTING is locked" },
        vizActorFor(admin),
      ),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      registerDimensionExtension({ code: EXT_CODE, name: "dup", description: "duplicate code in the same tenant", rationale: "should conflict" }, vizActorFor(admin)),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("createExport: ledgered hash for the exporter; EXPORT_FORBIDDEN for a viewer without viz:export", async () => {
    const ceoScene = await createScene({ name: `${RUN} ceo control-plane`, sector: "BEYU", dimensions: ["1D"] }, vizActorFor(ceo), ceo);
    ceoSceneId = ceoScene.id;
    const { exportId, artifact } = await createExport(
      { sceneId: ceoSceneId, twinId: null, sector: "BEYU", dimensions: ["1D"], format: "JSON" },
      vizActorFor(ceo),
      ceo,
    );
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact.byteSize).toBeGreaterThan(0);
    expect(await eventCount("VIZ_EXPORT_CREATED", exportId)).toBe(1);
    const ledger = await listExports(ceo);
    expect(ledger.map((e) => e.id)).toContain(exportId);
    expect(ledger.find((e) => e.id === exportId)?.contentHash).toBe(artifact.contentHash);

    // governance@beyu.os holds viz:scene.read but NOT viz:export.
    expect(can(governance, "viz:scene.read").allowed).toBe(true);
    expect(can(governance, "viz:export").allowed).toBe(false);
    await expect(
      createExport({ sceneId: ceoSceneId, twinId: null, sector: "BEYU", dimensions: ["1D"], format: "JSON" }, vizActorFor(governance), governance),
    ).rejects.toMatchObject({ code: "EXPORT_FORBIDDEN" });

    // Server-side formats are JSON/CSV only — SVG is honestly refused.
    await expect(
      createExport({ sceneId: ceoSceneId, twinId: null, sector: "BEYU", dimensions: ["1D"], format: "SVG" as never }, vizActorFor(ceo), ceo),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("buildGovernedManifest for the BEYU control plane is honest (empty today, declared so)", async () => {
    const manifest = await buildGovernedManifest(ceo, { sector: "BEYU", dimensions: ["1D"] });
    expect(manifest.sector).toBe("BEYU");
    expect(manifest.accessibleTable.columns.length).toBeGreaterThan(0);
    expect(Array.isArray(manifest.objects)).toBe(true);
  });
});
