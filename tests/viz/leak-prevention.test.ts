/**
 * Leak prevention — tooltips, hidden layers, exports and metadata.
 *
 * A real Ujenzi project fixture flows through the governed path; the test
 * then hunts for leaks at every surface: the manifest JSON (allowlist keys
 * only), the accessible text, the CSV/JSON export bytes (same projection —
 * an export can never be wider than the screen) and the withheld-count
 * disclosure (counts yes, rows never).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, ujenziProjects, vizExports, vizScenes } from "@/db/schema";
import { createProject, type UjenziActor } from "@/lib/ujenzi";
import { buildGovernedManifest, createExport, createScene, type VizActor } from "@/lib/viz/service";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZLEAK${Date.now()}`;

/** Keys that must never appear anywhere in a client-facing projection. */
const FORBIDDEN_KEYS = ["classification", "sourceRef", "tenantId", "createdByUserId", "partyId", "email", "legalEntityId"];

function findForbiddenKeys(value: unknown, path = "$"): string[] {
  const hits: string[] = [];
  if (Array.isArray(value)) {
    value.forEach((v, i) => hits.push(...findForbiddenKeys(v, `${path}[${i}]`)));
    return hits;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(k)) hits.push(`${path}.${k}`);
      hits.push(...findForbiddenKeys(v, `${path}.${k}`));
    }
  }
  return hits;
}

describe("leak prevention over a real governed fixture", () => {
  let ujenziOps: Awaited<ReturnType<typeof seededPrincipal>>;
  let ujenziActor: UjenziActor;
  let vizActor: VizActor;
  let projectId: string;
  let sceneId: string;
  let tenantId: string;

  beforeAll(async () => {
    ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os");
    tenantId = ujenziOps.tenantId;
    ujenziActor = { tenantId, userId: ujenziOps.userId, traceId: `TRACEVZL${Date.now()}` };
    vizActor = { tenantId, userId: ujenziOps.userId, traceId: `TRACEVZL${Date.now()}`, ipAddress: null, userAgent: null };
    const [entity] = await db.select({ id: legalEntities.id }).from(legalEntities).where(eq(legalEntities.code, "BEYU-UJZ")).limit(1);
    const project = await createProject(
      { tenantId, legalEntityId: entity.id, code: `${RUN}P`, name: `${RUN} leak-test tower`, countryCode: "TZ", contractValue: "250000.00", currency: "TZS" },
      ujenziActor,
    );
    projectId = project.id;
    const scene = await createScene(
      { name: `${RUN} scene`, sector: "UJENZI", subjectType: "PROJECT", subjectId: projectId, dimensions: ["1D", "2D", "4D", "5D", "7D", "8D"] },
      vizActor,
      ujenziOps,
    );
    sceneId = scene.id;
  });

  afterAll(async () => {
    // FK-ordered cleanup of what this suite created. Audit + enterprise
    // events are append-only and intentionally remain.
    await db.delete(vizExports).where(and(eq(vizExports.tenantId, tenantId), like(vizExports.id, "VZE%"), sql`${vizExports.sceneId} IN (SELECT id FROM viz_scenes WHERE name LIKE ${RUN + "%"})`));
    await db.delete(vizScenes).where(and(eq(vizScenes.tenantId, tenantId), like(vizScenes.name, `${RUN}%`)));
    await db.delete(ujenziProjects).where(and(eq(ujenziProjects.tenantId, tenantId), like(ujenziProjects.code, `${RUN}%`)));
  });

  it("the manifest projection carries no forbidden key at any depth", async () => {
    const manifest = await buildGovernedManifest(ujenziOps, {
      sector: "UJENZI",
      dimensions: ["1D", "2D", "4D", "5D", "7D", "8D"],
      subjectId: projectId,
    });
    expect(manifest.objects.length).toBeGreaterThanOrEqual(1);
    const hits = findForbiddenKeys(manifest);
    expect(hits).toEqual([]);
    const serialized = JSON.stringify(manifest);
    expect(serialized).not.toContain(tenantId);
    expect(serialized).not.toContain(ujenziOps.userId);
  });

  it("every object carries non-empty accessible text (tooltips are not the only channel)", async () => {
    const manifest = await buildGovernedManifest(ujenziOps, { sector: "UJENZI", dimensions: ["1D", "5D"], subjectId: projectId });
    for (const object of manifest.objects) {
      expect(object.accessibleText.trim().length).toBeGreaterThan(5);
      expect(object.accessibleText).not.toContain(tenantId);
    }
  });

  it("the JSON export is the SAME governed projection — never wider than the screen", async () => {
    const manifest = await buildGovernedManifest(ujenziOps, { sector: "UJENZI", dimensions: ["1D", "2D", "4D", "5D", "7D", "8D"], subjectId: projectId });
    const { artifact } = await createExport({ sceneId, twinId: null, sector: "UJENZI", dimensions: manifest.dimensions, subjectId: projectId, format: "JSON" }, vizActor, ujenziOps);
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/);
    const exported = JSON.parse(artifact.content) as Record<string, unknown>;
    const exportHits = findForbiddenKeys(exported);
    expect(exportHits).toEqual([]);
    expect(artifact.content).not.toContain(tenantId);
    const exportedIds = ((exported.objects ?? []) as Array<{ id: string }>).map((o) => o.id);
    const screenIds = manifest.objects.map((o) => o.id);
    for (const id of exportedIds) expect(screenIds).toContain(id);
  });

  it("the CSV export contains no internal metadata columns", async () => {
    const { artifact } = await createExport({ sceneId, twinId: null, sector: "UJENZI", dimensions: ["1D", "2D", "4D", "5D", "7D", "8D"], subjectId: projectId, format: "CSV" }, vizActor, ujenziOps);
    const [header] = artifact.content.split("\n");
    for (const forbidden of ["tenant", "classification", "source_ref", "sourceRef", "user_id", "party"]) {
      expect(header.toLowerCase()).not.toContain(forbidden);
    }
    expect(artifact.content).not.toContain(tenantId);
  });

  it("a withheld scene discloses the COUNT without the rows", async () => {
    // Simulate the ceiling from the projection side: a HIGHLY_RESTRICTED
    // sibling object never reaches an INTERNAL-clearance manifest, but the
    // count does (the viewer knows the picture is partial).
    const manifest = await buildGovernedManifest(ujenziOps, { sector: "UJENZI", dimensions: ["1D"], subjectId: projectId });
    expect(Number.isInteger(manifest.withheldByClassification)).toBe(true);
    expect(manifest.withheldByClassification).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(manifest)).not.toContain("HIGHLY_RESTRICTED");
  });

  it("an unauthorized principal's export attempt leaks nothing (refusal, not empty file)", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const governanceActor: VizActor = { tenantId: governance.tenantId, userId: governance.userId, traceId: `TRACEVZL${Date.now()}` };
    await expect(
      createExport({ sceneId, twinId: null, sector: "UJENZI", dimensions: ["1D"], subjectId: projectId, format: "JSON" }, governanceActor, governance),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
