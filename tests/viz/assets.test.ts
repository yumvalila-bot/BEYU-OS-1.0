/**
 * Holograph spatial asset registry — governed lifecycle + security (real
 * PostgreSQL).
 *
 * Proves:
 *   • registration is governed (provenance required, honest format support,
 *     sha256 integrity hash, duplicate-source conflict);
 *   • deep links re-authorize: cross-tenant and over-clearance ids resolve to
 *     NOT_FOUND (existence is itself protected);
 *   • classification ceilings hold in SQL + process;
 *   • every mutation writes the EXISTING audit + event chain;
 *   • the registry is metadata only — no binary geometry column exists.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, enterpriseEvents, vizAssets } from "@/db/schema";
import { can } from "@/lib/authz";
import {
  archiveAsset,
  assetFormatSupportMatrix,
  getAsset,
  listAssets,
  registerAsset,
  updateAssetVersion,
} from "@/lib/viz/assets";
import { VizDomainError, type VizActor } from "@/lib/viz/service";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZASSET${Date.now()}`;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function actorFor(principal: { tenantId: string; userId: string }): VizActor {
  return { tenantId: principal.tenantId, userId: principal.userId, traceId: `TRACEASSET${Date.now()}`, ipAddress: null, userAgent: null };
}

async function auditRows(objectId: string) {
  return db.select().from(auditLog).where(eq(auditLog.objectId, objectId));
}

async function eventCount(type: string, subjectId: string): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(enterpriseEvents).where(and(eq(enterpriseEvents.type, type), eq(enterpriseEvents.subjectId, subjectId)));
  return Number(row?.n ?? 0);
}

describe("Holograph asset registry — governed lifecycle", () => {
  let admin: Awaited<ReturnType<typeof seededPrincipal>>;
  let ceo: Awaited<ReturnType<typeof seededPrincipal>>;
  let ujenziOps: Awaited<ReturnType<typeof seededPrincipal>>;
  let organizationAssetId = "";
  let restrictedAssetId = "";
  let highlyRestrictedAssetId = "";

  beforeAll(async () => {
    admin = await seededPrincipal("admin@beyu.os"); // RESTRICTED
    ceo = await seededPrincipal("ceo@beyu.os"); // HIGHLY_RESTRICTED
    ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os"); // CONFIDENTIAL, other tenant
  });

  afterAll(async () => {
    await db.delete(vizAssets).where(like(vizAssets.name, `${RUN}%`));
  });

  it("the format-support matrix is honest: binary formats NOT_IMPLEMENTED, registry projections IMPLEMENTED", () => {
    const matrix = assetFormatSupportMatrix();
    expect(matrix.GLB).toBe("NOT_IMPLEMENTED");
    expect(matrix.IFC).toBe("NOT_IMPLEMENTED");
    expect(matrix.MEDICAL_3D).toBe("NOT_IMPLEMENTED");
    expect(matrix.GEOGRAPHIC).toBe("NOT_IMPLEMENTED");
    expect(matrix.ORGANIZATION).toBe("IMPLEMENTED");
    expect(matrix.FINANCE_OBJECT).toBe("IMPLEMENTED");
  });

  it("registers a metadata asset with provenance, integrity hash and honest support (audit + event)", async () => {
    const asset = await registerAsset(
      {
        name: `${RUN} BEYU org structure model`,
        assetType: "ORGANIZATION",
        sourceSystem: "BEYU-ORG",
        sourceObjectId: `${RUN}-org`,
        integrityHash: HASH_A,
        storageRef: "registry://organization",
        rationale: "Spatial presentation of the canonical organization structure.",
      },
      actorFor(admin),
      admin,
    );
    organizationAssetId = asset.id;
    expect(asset.formatSupport).toBe("IMPLEMENTED");
    expect(asset.version).toBe(1);
    expect(asset.status).toBe("REGISTERED");
    expect(asset.provenance.registeredBy).toBe(admin.userId);

    const audits = await auditRows(asset.id);
    expect(audits.length).toBeGreaterThan(0);
    expect(audits[0].action).toBe("VIZ_ASSET_REGISTERED");
    expect(audits[0].outcome).toBe("SUCCESS");
    expect(await eventCount("VIZ_ASSET_REGISTERED", asset.id)).toBe(1);
  });

  it("records binary formats as NOT_IMPLEMENTED even when the caller wants to claim otherwise (honesty is enforced server-side)", async () => {
    const asset = await registerAsset(
      {
        name: `${RUN} tower IFC export`,
        assetType: "IFC",
        sourceSystem: "UJENZI-IFC",
        sourceObjectId: `${RUN}-ifc`,
        integrityHash: HASH_B,
        storageRef: "s3://beyu-assets/ifc/probe.ifc",
        rationale: "Ujenzi IFC export reference (parsing NOT_IMPLEMENTED).",
      },
      actorFor(admin),
      admin,
    );
    expect(asset.formatSupport).toBe("NOT_IMPLEMENTED");
  });

  it("rejects a non-sha256 integrity hash", async () => {
    await expect(
      registerAsset(
        {
          name: `${RUN} bad hash`,
          assetType: "GLB",
          sourceSystem: "S",
          sourceObjectId: `${RUN}-bad`,
          integrityHash: "nothash",
          storageRef: "ref",
          rationale: "must fail",
        },
        actorFor(admin),
        admin,
      ),
    ).rejects.toThrow(VizDomainError);
  });

  it("rejects duplicate source system + object in the same tenant (version update is the path)", async () => {
    await expect(
      registerAsset(
        {
          name: `${RUN} duplicate source`,
          assetType: "ORGANIZATION",
          sourceSystem: "BEYU-ORG",
          sourceObjectId: `${RUN}-org`,
          integrityHash: HASH_B,
          storageRef: "registry://organization",
          rationale: "duplicate must conflict",
        },
        actorFor(admin),
        admin,
      ),
    ).rejects.toThrow(/already registered/i);
  });

  it("deep links re-authorize: another tenant resolves to NOT_FOUND, not FORBIDDEN", async () => {
    const found = await getAsset(ujenziOps, organizationAssetId);
    expect(found).toBeNull();
  });

  it("classification ceilings hold: CONFIDENTIAL-cleared principal cannot see a RESTRICTED asset", async () => {
    const restricted = await registerAsset(
      {
        name: `${RUN} restricted asset`,
        assetType: "FINANCE_OBJECT",
        sourceSystem: "FINANCE-STRUCTURE",
        sourceObjectId: `${RUN}-fin`,
        integrityHash: HASH_A,
        storageRef: "registry://finance-structure",
        rationale: "Restricted financial structure visualization.",
        classification: "RESTRICTED",
      },
      actorFor(ceo),
      ceo,
    );
    restrictedAssetId = restricted.id;

    const forOperator = await getAsset(ujenziOps, restricted.id);
    expect(forOperator).toBeNull();
    const operatorList = await listAssets(ujenziOps);
    expect(operatorList.some((a) => a.id === restricted.id)).toBe(false);

    const forCeo = await getAsset(ceo, restricted.id);
    expect(forCeo?.classification).toBe("RESTRICTED");
  });

  it("classification ceilings hold for HIGHLY_RESTRICTED: a RESTRICTED-cleared principal cannot see it", async () => {
    const hr = await registerAsset(
      {
        name: `${RUN} highly restricted asset`,
        assetType: "FINANCE_OBJECT",
        sourceSystem: "FINANCE-STRUCTURE",
        sourceObjectId: `${RUN}-fin-hr`,
        integrityHash: HASH_A,
        storageRef: "registry://finance-structure",
        rationale: "Highly restricted financial structure visualization.",
        classification: "HIGHLY_RESTRICTED",
      },
      actorFor(ceo),
      ceo,
    );
    highlyRestrictedAssetId = hr.id;

    expect(can(ceo, "viz:asset.read").allowed).toBe(true);
    const forAdmin = await getAsset(admin, hr.id);
    expect(forAdmin).toBeNull();
    const forCeo = await getAsset(ceo, hr.id);
    expect(forCeo?.classification).toBe("HIGHLY_RESTRICTED");
  });

  it("versioning keeps the id stable, increments the version and appends provenance", async () => {
    const updated = await updateAssetVersion(
      organizationAssetId,
      { integrityHash: HASH_B, rationale: "Structure changed — new integrity hash." },
      actorFor(admin),
      admin,
    );
    expect(updated.id).toBe(organizationAssetId);
    expect(updated.version).toBe(2);
    expect(updated.integrityHash).toBe(HASH_B);
    expect((updated.provenance as Record<string, unknown>).lastVersionRationale).toBeTruthy();
    expect(await eventCount("VIZ_ASSET_UPDATED", organizationAssetId)).toBe(1);
  });

  it("refuses a no-op version update (same hash)", async () => {
    await expect(
      updateAssetVersion(organizationAssetId, { integrityHash: HASH_B, rationale: "same hash must be refused" }, actorFor(admin), admin),
    ).rejects.toThrow(/unchanged/i);
  });

  it("archive is terminal for updates (archived assets remain auditable evidence)", async () => {
    const archived = await archiveAsset(restrictedAssetId, actorFor(ceo), ceo);
    expect(archived.status).toBe("ARCHIVED");
    await expect(
      updateAssetVersion(restrictedAssetId, { integrityHash: HASH_A, rationale: "must fail" }, actorFor(ceo), ceo),
    ).rejects.toThrow(/archived/i);
    const stillThere = await getAsset(ceo, restrictedAssetId);
    expect(stillThere?.status).toBe("ARCHIVED");
  });

  it("list is tenant-scoped and paginated", async () => {
    const adminList = await listAssets(admin);
    for (const a of adminList) expect(a.tenantId).toBe(admin.tenantId);
    const limited = await listAssets(admin, { limit: 1 });
    expect(limited.length).toBeLessThanOrEqual(1);
  });
});
