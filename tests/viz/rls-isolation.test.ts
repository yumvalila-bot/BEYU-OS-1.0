/**
 * Visualization RLS — adversarial database-layer isolation (real PostgreSQL,
 * RUNTIME role: NOSUPERUSER NOBYPASSRLS).
 *
 * The viz tables are the FINAL boundary: even a compromised application layer
 * cannot read another tenant's scenes/twins/exports, cannot insert outside the
 * active tenant scope, and cannot disable RLS. Policies mirror 0031/0034/
 * 0035/0043/0061 (beyu_tenant_ids()).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  tenants,
  vizAssets,
  vizDigitalTwins,
  vizDimensionExtensions,
  vizDevices,
  vizExports,
  vizInteractions,
  vizRenderProfiles,
  vizScenes,
} from "@/db/schema";
import { UJENZI_OS_TENANT_CODE } from "@/lib/constants";
import { newId, ID_PREFIX, fixedId } from "@/lib/ids";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZRLS${Date.now()}`;
const VIZ_TABLES = [
  "viz_dimension_extensions",
  "viz_scenes",
  "viz_digital_twins",
  "viz_exports",
  // Holograph shared-capability tables (migration 0067).
  "viz_assets",
  "viz_devices",
  "viz_render_profiles",
  "viz_interactions",
];

let runtime: Client | null = null;
let ujenziTenantId = "";
let rootTenantId = "";
let ujenziUserId = "";
let sceneA = "";
let sceneB = "";

// Holograph (0067) adversarial fixtures — one row per new table in the root
// tenant, plus one asset in the UJENZI tenant.
let holoAssetRoot = "";
let holoAssetUjenzi = "";
let holoDeviceRoot = "";
let holoProfileRoot = "";
let holoInteractionRoot = "";

async function setTenantScope(client: Client, tenantIds: string[]): Promise<void> {
  await client.query("SELECT set_config('beyu.global_scope', 'off', false)");
  await client.query("SELECT set_config('beyu.current_tenant_ids', $1, false)", [tenantIds.join(",")]);
}

beforeAll(async () => {
  if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw new Error("Actual runtime DSN required");
  runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL });
  await runtime.connect();
  const role = await runtime.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
  expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });

  const ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
  const ceo = await seededPrincipal("ceo@beyu.os");
  ujenziTenantId = ujenziOps.tenantId;
  rootTenantId = ceo.tenantId;
  ujenziUserId = ujenziOps.userId;
  expect(ujenziTenantId).not.toBe(rootTenantId);
  const [ujenziTenant] = await db.select({ code: tenants.code }).from(tenants).where(eq(tenants.id, ujenziTenantId));
  expect(ujenziTenant.code).toBe(UJENZI_OS_TENANT_CODE);

  // Two scenes in two tenants, inserted through the privileged test role
  // (the application path); the runtime role below may never see both.
  sceneA = newId(ID_PREFIX.vizScene);
  sceneB = newId(ID_PREFIX.vizScene);
  await db.insert(vizScenes).values({ id: sceneA, tenantId: ujenziTenantId, name: `${RUN} A`, sector: "UJENZI", dimensions: ["1D"], layers: [], config: {}, status: "ACTIVE", classification: "INTERNAL", createdByUserId: ujenziUserId });
  await db.insert(vizScenes).values({ id: sceneB, tenantId: rootTenantId, name: `${RUN} B`, sector: "BEYU", dimensions: ["1D"], layers: [], config: {}, status: "ACTIVE", classification: "INTERNAL", createdByUserId: ujenziUserId });
});

afterAll(async () => {
  if (runtime) await runtime.end();
  await db.delete(vizScenes).where(and(like(vizScenes.name, `${RUN}%`)));
});

describe("RLS posture (migration 0062 verification, re-proven at runtime)", () => {
  it("every viz table has ENABLE + FORCE row level security", async () => {
    const result = await runtime!.query(
      `SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = ANY($1)`,
      [VIZ_TABLES],
    );
    expect(result.rows).toHaveLength(VIZ_TABLES.length);
    for (const row of result.rows) {
      expect(row.relrowsecurity, `${row.relname} rls`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} force rls`).toBe(true);
    }
  });

  it("every viz table carries a beyu_tenant_ids() isolation policy", async () => {
    const result = await runtime!.query(
      `SELECT tablename, qual FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1)`,
      [VIZ_TABLES],
    );
    const byTable = new Map(result.rows.map((r) => [r.tablename, r.qual as string]));
    for (const table of VIZ_TABLES) {
      expect(byTable.get(table), `${table} policy`).toMatch(/beyu_tenant_ids\(\)/);
    }
  });
});

describe("tenant isolation through the runtime role", () => {
  it("the UJENZI scope sees only the UJENZI scene", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    const rows = await runtime!.query("SELECT id, name FROM viz_scenes WHERE name LIKE $1", [`${RUN}%`]);
    expect(rows.rows.map((r) => r.id)).toEqual([sceneA]);
  });

  it("the root scope sees only the root scene", async () => {
    await setTenantScope(runtime!, [rootTenantId]);
    const rows = await runtime!.query("SELECT id, name FROM viz_scenes WHERE name LIKE $1", [`${RUN}%`]);
    expect(rows.rows.map((r) => r.id)).toEqual([sceneB]);
  });

  it("an empty scope sees nothing at all", async () => {
    await setTenantScope(runtime!, []);
    const rows = await runtime!.query("SELECT id FROM viz_scenes WHERE name LIKE $1", [`${RUN}%`]);
    expect(rows.rows).toEqual([]);
  });

  it("cross-tenant INSERT is refused by WITH CHECK (42501)", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    await expect(
      runtime!.query(
        `INSERT INTO viz_scenes (id, tenant_id, name, sector, dimensions, layers, config, status, classification, created_by_user_id)
         VALUES ($1, $2, $3, 'UJENZI', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 'ACTIVE', 'INTERNAL', $4)`,
        [newId(ID_PREFIX.vizScene), rootTenantId, `${RUN} smuggled`, ujenziUserId],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("direct UPDATE/DELETE of another tenant's row affects nothing", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    const update = await runtime!.query("UPDATE viz_scenes SET name = $1 WHERE id = $2", [`${RUN} hijacked`, sceneB]);
    expect(update.rowCount).toBe(0);
    const del = await runtime!.query("DELETE FROM viz_scenes WHERE id = $1", [sceneB]);
    expect(del.rowCount).toBe(0);
    // The root scene is untouched.
    const [row] = await db.select({ name: vizScenes.name }).from(vizScenes).where(eq(vizScenes.id, sceneB));
    expect(row.name).toBe(`${RUN} B`);
  });

  it("twins, extensions and exports enforce the same boundary", async () => {
    const twinId = newId(ID_PREFIX.vizTwin);
    const extensionId = newId(ID_PREFIX.vizDimension);
    await db.insert(vizDigitalTwins).values({ id: twinId, tenantId: rootTenantId, twinKey: `BEYU:TEST:${RUN}`, sector: "BEYU", subjectType: "TEST", subjectId: RUN, name: `${RUN} twin`, status: "REGISTERED", classification: "INTERNAL", createdByUserId: ujenziUserId });
    await db.insert(vizDimensionExtensions).values({ id: extensionId, tenantId: rootTenantId, code: "9D_RLS_TEST", name: `${RUN} ext`, description: `${RUN} rls probe extension`, capabilities: [], dataRequirements: [], renderingRequirements: [], requiredPermissions: [], sectorApplicability: "*", lifecycleState: "PLANNED", provenance: { registeredBy: ujenziUserId, rationale: RUN, registeredAt: new Date().toISOString() }, classification: "INTERNAL", createdByUserId: ujenziUserId });

    await setTenantScope(runtime!, [ujenziTenantId]);
    expect((await runtime!.query("SELECT id FROM viz_digital_twins WHERE id = $1", [twinId])).rows).toEqual([]);
    expect((await runtime!.query("SELECT id FROM viz_dimension_extensions WHERE code = '9D_RLS_TEST'")).rows).toEqual([]);

    await setTenantScope(runtime!, [rootTenantId]);
    expect((await runtime!.query("SELECT id FROM viz_digital_twins WHERE id = $1", [twinId])).rows.map((r) => r.id)).toEqual([twinId]);

    await db.delete(vizDigitalTwins).where(eq(vizDigitalTwins.id, twinId));
    await db.delete(vizDimensionExtensions).where(eq(vizDimensionExtensions.id, extensionId));
  });
});

describe("the CHECK floor holds at the database layer", () => {
  it("a canonical dimension code cannot be persisted as an extension", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    await expect(
      runtime!.query(
        `INSERT INTO viz_dimension_extensions (id, tenant_id, code, name, description, provenance, classification, created_by_user_id)
         VALUES ($1, $2, '3D', 'shadow', 'attempt to shadow a canonical dimension', '{}'::jsonb, 'INTERNAL', $3)`,
        [newId(ID_PREFIX.vizDimension), ujenziTenantId, ujenziUserId],
      ),
    ).rejects.toMatchObject({ code: "23514" }); // check_violation
  });

  it("an unknown sector cannot be persisted on a scene", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    await expect(
      runtime!.query(
        `INSERT INTO viz_scenes (id, tenant_id, name, sector, dimensions, layers, config, status, classification, created_by_user_id)
         VALUES ($1, $2, $3, 'BIM_OS', '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, 'ACTIVE', 'INTERNAL', $4)`,
        [newId(ID_PREFIX.vizScene), ujenziTenantId, `${RUN} bim`, ujenziUserId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("an export must reference a scene or a twin", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    await expect(
      runtime!.query(
        `INSERT INTO viz_exports (id, tenant_id, format, content_hash, byte_size, sector, classification, requested_by_user_id)
         VALUES ($1, $2, 'JSON', 'deadbeef', 8, 'UJENZI', 'INTERNAL', $3)`,
        [newId(ID_PREFIX.vizExport), ujenziTenantId, ujenziUserId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("fixedId keeps deterministic ids out of the picture (ids are unguessable)", () => {
    expect(fixedId(ID_PREFIX.vizScene, "probe")).toMatch(/^VZS/);
    expect(newId(ID_PREFIX.vizScene)).toMatch(/^VZS/);
  });
});

describe("Holograph tables (migration 0067) — adversarial isolation through the runtime role", () => {
  beforeAll(async () => {
    holoAssetRoot = newId(ID_PREFIX.vizAsset);
    holoAssetUjenzi = newId(ID_PREFIX.vizAsset);
    holoDeviceRoot = newId(ID_PREFIX.vizDevice);
    holoProfileRoot = newId(ID_PREFIX.vizRenderProfile);
    holoInteractionRoot = newId(ID_PREFIX.vizInteraction);

    const nowIso = new Date().toISOString();
    await db.insert(vizAssets).values([
      { id: holoAssetRoot, tenantId: rootTenantId, name: `${RUN} asset root`, assetType: "BUILDING", sourceSystem: "TEST", sourceObjectId: `${RUN}-root`, integrityHash: "e".repeat(64), storageRef: "local://test", provenance: { registeredBy: ujenziUserId, rationale: RUN, importedAt: nowIso }, createdByUserId: ujenziUserId },
      { id: holoAssetUjenzi, tenantId: ujenziTenantId, name: `${RUN} asset ujenzi`, assetType: "FARM", sourceSystem: "TEST", sourceObjectId: `${RUN}-ujenzi`, integrityHash: "f".repeat(64), storageRef: "local://test", provenance: { registeredBy: ujenziUserId, rationale: RUN, importedAt: nowIso }, createdByUserId: ujenziUserId },
    ]);
    await db.insert(vizDevices).values({ id: holoDeviceRoot, tenantId: rootTenantId, name: `${RUN} device root`, deviceClass: "WEB", renderingBackend: "SVG_2D", provenance: { registeredBy: ujenziUserId, rationale: RUN, registeredAt: new Date().toISOString() }, createdByUserId: ujenziUserId });
    await db.insert(vizRenderProfiles).values({ id: holoProfileRoot, tenantId: rootTenantId, name: `${RUN} profile root`, renderer: "SVG_2D", createdByUserId: ujenziUserId });
    await db.insert(vizInteractions).values({ id: holoInteractionRoot, tenantId: rootTenantId, sector: "BEYU", interactionType: "SELECT_OBJECT", outcome: "ALLOWED", requestedByUserId: ujenziUserId });
  });

  afterAll(async () => {
    await db.delete(vizInteractions).where(like(vizInteractions.id, `${RUN}%`));
    await db.delete(vizRenderProfiles).where(like(vizRenderProfiles.id, `${RUN}%`));
    await db.delete(vizDevices).where(like(vizDevices.id, `${RUN}%`));
    await db.delete(vizAssets).where(like(vizAssets.id, `${RUN}%`));
  });

  it("the UJENZI scope sees its own asset and NONE of the root rows on any new table", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    expect((await runtime!.query("SELECT id FROM viz_assets WHERE id IN ($1,$2)", [holoAssetRoot, holoAssetUjenzi])).rows.map((r) => r.id)).toEqual([holoAssetUjenzi]);
    expect((await runtime!.query("SELECT id FROM viz_devices WHERE id = $1", [holoDeviceRoot])).rows).toEqual([]);
    expect((await runtime!.query("SELECT id FROM viz_render_profiles WHERE id = $1", [holoProfileRoot])).rows).toEqual([]);
    expect((await runtime!.query("SELECT id FROM viz_interactions WHERE id = $1", [holoInteractionRoot])).rows).toEqual([]);
  });

  it("the root scope sees the root rows and NOT the UJENZI asset", async () => {
    await setTenantScope(runtime!, [rootTenantId]);
    expect((await runtime!.query("SELECT id FROM viz_assets WHERE id IN ($1,$2)", [holoAssetRoot, holoAssetUjenzi])).rows.map((r) => r.id)).toEqual([holoAssetRoot]);
    expect((await runtime!.query("SELECT id FROM viz_devices WHERE id = $1", [holoDeviceRoot])).rows.map((r) => r.id)).toEqual([holoDeviceRoot]);
    expect((await runtime!.query("SELECT id FROM viz_render_profiles WHERE id = $1", [holoProfileRoot])).rows.map((r) => r.id)).toEqual([holoProfileRoot]);
    expect((await runtime!.query("SELECT id FROM viz_interactions WHERE id = $1", [holoInteractionRoot])).rows.map((r) => r.id)).toEqual([holoInteractionRoot]);
  });

  it("an empty scope sees nothing on the new tables", async () => {
    await setTenantScope(runtime!, []);
    for (const table of ["viz_assets", "viz_devices", "viz_render_profiles", "viz_interactions"]) {
      expect((await runtime!.query(`SELECT id FROM ${table} WHERE id LIKE $1`, [`${RUN}%`])).rows).toEqual([]);
    }
  });

  it("cross-tenant INSERT is refused by WITH CHECK (42501) on every new table", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    const crossTenantInserts: Array<[string, string[]]> = [
      [`INSERT INTO viz_assets (id, tenant_id, name, asset_type, source_system, source_object_id, integrity_hash, storage_ref, provenance, created_by_user_id)
        VALUES ($1, $2, '${RUN} smuggled asset', 'GLTF', 'TEST', '${RUN}-smuggled', 'a' || repeat('a', 63), 'local://x', '{}'::jsonb, $3)`, [newId(ID_PREFIX.vizAsset), rootTenantId, ujenziUserId]],
      [`INSERT INTO viz_devices (id, tenant_id, name, device_class, rendering_backend, provenance, created_by_user_id)
        VALUES ($1, $2, '${RUN} smuggled device', 'WEB', 'SVG_2D', '{}'::jsonb, $3)`, [newId(ID_PREFIX.vizDevice), rootTenantId, ujenziUserId]],
      [`INSERT INTO viz_render_profiles (id, tenant_id, name, renderer, created_by_user_id)
        VALUES ($1, $2, '${RUN} smuggled profile', 'SVG_2D', $3)`, [newId(ID_PREFIX.vizRenderProfile), rootTenantId, ujenziUserId]],
      [`INSERT INTO viz_interactions (id, tenant_id, sector, interaction_type, outcome, requested_by_user_id)
        VALUES ($1, $2, 'BEYU', 'SELECT_OBJECT', 'ALLOWED', $3)`, [newId(ID_PREFIX.vizInteraction), rootTenantId, ujenziUserId]],
    ];
    for (const [insertSql, params] of crossTenantInserts) {
      await expect(runtime!.query(insertSql, params)).rejects.toMatchObject({ code: "42501" });
    }
  });

  it("direct UPDATE/DELETE of root rows under the UJENZI scope affects nothing", async () => {
    await setTenantScope(runtime!, [ujenziTenantId]);
    expect((await runtime!.query("UPDATE viz_assets SET name = $1 WHERE id = $2", [`${RUN} hijacked`, holoAssetRoot])).rowCount).toBe(0);
    expect((await runtime!.query("DELETE FROM viz_devices WHERE id = $1", [holoDeviceRoot])).rowCount).toBe(0);
    expect((await runtime!.query("UPDATE viz_interactions SET outcome = 'DENIED' WHERE id = $1", [holoInteractionRoot])).rowCount).toBe(0);
    const [asset] = await db.select({ name: vizAssets.name, integrityHash: vizAssets.integrityHash }).from(vizAssets).where(eq(vizAssets.id, holoAssetRoot));
    expect(asset.name).toBe(`${RUN} asset root`);
    const [interaction] = await db.select({ outcome: vizInteractions.outcome }).from(vizInteractions).where(eq(vizInteractions.id, holoInteractionRoot));
    expect(interaction.outcome).toBe("ALLOWED");
  });

  it("the runtime role cannot disable RLS on the new tables", async () => {
    await expect(runtime!.query("ALTER TABLE viz_assets DISABLE ROW LEVEL SECURITY")).rejects.toMatchObject({ code: "42501" });
    await expect(runtime!.query("ALTER TABLE viz_interactions NO FORCE ROW LEVEL SECURITY")).rejects.toMatchObject({ code: "42501" });
  });
});
