/**
 * Holograph × Family Office spatial view — governed projection, not a system
 * (real PostgreSQL).
 *
 * Proves:
 *   • the view is GATED: it requires BOTH the Holograph surface
 *     (viz:scene.read) AND the organization read boundary
 *     (organization:entity.read) — a deep link to the view is re-authorized;
 *   • CLASSIFICATION CARRIES: entities above the principal's clearance ceiling
 *     are filtered in SQL and never appear;
 *   • TENANT ISOLATION: a fully-permissioned principal in another tenant sees
 *     none of this tenant's entities;
 *   • FACET DEGRADATION: ownership edges require organization:ownership.read,
 *     trust-instrument summaries require family:member.read; unavailable
 *     facets degrade to count-free reasons — never to a wider dataset;
 *   • the view is a READ PROJECTION: it stores nothing of its own (nothing to
 *     clean up) and its authority note says visibility is not a grant.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, ownershipRecords, trustInstruments } from "@/db/schema";
import { familyOfficeStructureView, type FamilyOfficeView } from "@/lib/viz/family-office-view";
import { VizDomainError } from "@/lib/viz/service";
import { type Principal } from "@/lib/authz";
import { seededPrincipal } from "../noelia/db-fixtures";

const RUN = `VZFO${Date.now()}`;
const DATE = "2026-01-01";

let admin: Awaited<ReturnType<typeof seededPrincipal>>;
let ceo: Awaited<ReturnType<typeof seededPrincipal>>;
let ujenziOps: Awaited<ReturnType<typeof seededPrincipal>>;
let trustEntityId = "";
let holdingId = "";
let countryHoldingId = "";
let opHighlyRestrictedId = "";

function makePrincipal(
  base: Awaited<ReturnType<typeof seededPrincipal>>,
  overrides: Partial<Omit<Principal, "permissions">> & { permissions?: readonly string[] },
): Principal {
  return { ...base, ...overrides, permissions: new Set(overrides.permissions ?? []) } as Principal;
}

async function seedEntity(partial: {
  id: string;
  code: string;
  entityType: string;
  classification: string;
}): Promise<void> {
  await db.insert(legalEntities).values({
    id: partial.id,
    tenantId: admin.tenantId,
    code: partial.code,
    legalName: `${partial.code} legal name`,
    entityType: partial.entityType as never,
    countryCode: "KE",
    status: "ACTIVE",
    classification: partial.classification as never,
    effectiveFrom: DATE,
  });
}

async function viewFor(p: Principal): Promise<FamilyOfficeView> {
  return familyOfficeStructureView(p);
}

beforeAll(async () => {
  admin = await seededPrincipal("admin@beyu.os"); // PLATFORM_ADMIN / RESTRICTED
  ceo = await seededPrincipal("ceo@beyu.os"); // GROUP_CEO / HIGHLY_RESTRICTED
  ujenziOps = await seededPrincipal("ujenzi.ops@beyu.os"); // other tenant

  trustEntityId = `${RUN}-TRUST`;
  holdingId = `${RUN}-HOLD`;
  countryHoldingId = `${RUN}-COUNTRY`;
  opHighlyRestrictedId = `${RUN}-OP-HR`;

  await seedEntity({ id: trustEntityId, code: `${RUN}-TRUST`, entityType: "TRUST", classification: "RESTRICTED" });
  await seedEntity({ id: holdingId, code: `${RUN}-HOLD`, entityType: "HOLDING", classification: "INTERNAL" });
  await seedEntity({ id: countryHoldingId, code: `${RUN}-COUNTRY`, entityType: "COUNTRY_HOLDING", classification: "RESTRICTED" });
  await seedEntity({ id: opHighlyRestrictedId, code: `${RUN}-OP-HR`, entityType: "OPERATING_COMPANY", classification: "HIGHLY_RESTRICTED" });

  await db.insert(ownershipRecords).values([
    { id: `${RUN}-OWN1`, tenantId: admin.tenantId, ownerEntityId: trustEntityId, ownedEntityId: holdingId, ownershipType: "DIRECT", economicPct: "100", votingPct: "100", effectiveFrom: DATE, provenance: "TEST", recordedBy: admin.userId },
    { id: `${RUN}-OWN2`, tenantId: admin.tenantId, ownerEntityId: holdingId, ownedEntityId: countryHoldingId, ownershipType: "DIRECT", economicPct: "100", votingPct: "100", effectiveFrom: DATE, provenance: "TEST", recordedBy: admin.userId },
    { id: `${RUN}-OWN3`, tenantId: admin.tenantId, ownerEntityId: countryHoldingId, ownedEntityId: opHighlyRestrictedId, ownershipType: "DIRECT", economicPct: "100", votingPct: "100", effectiveFrom: DATE, provenance: "TEST", recordedBy: admin.userId },
  ]);

  await db.insert(trustInstruments).values({
    id: `${RUN}-INSTR`,
    tenantId: admin.tenantId,
    trustEntityId,
    instrumentName: `${RUN} Deed of Trust`,
    instrumentType: "DEED",
    version: 1,
    jurisdictionCode: "KE",
    documentRef: "DOC-TEST-FO",
    status: "EXECUTED",
    legalReviewStatus: "APPROVED",
    recordedBy: admin.userId,
    classification: "HIGHLY_RESTRICTED",
  });
});

afterAll(async () => {
  await db.delete(trustInstruments).where(like(trustInstruments.id, `${RUN}%`));
  await db.delete(ownershipRecords).where(like(ownershipRecords.id, `${RUN}%`));
  await db.delete(legalEntities).where(like(legalEntities.id, `${RUN}%`));
});

describe("Family Office spatial view — gates", () => {
  it("DENIES (SCOPE) a principal with no Holograph surface permission", async () => {
    const bare = makePrincipal(ceo, { permissions: [] });
    await expect(viewFor(bare)).rejects.toThrow(VizDomainError);
  });

  it("DENIES (SCOPE) a principal with ONLY the Holograph surface permission — the organization boundary is a separate, conjunctive gate", async () => {
    const surfaceOnly = makePrincipal(ceo, { permissions: ["viz:scene.read"] });
    await expect(viewFor(surfaceOnly)).rejects.toThrow(/organization:entity.read/i);
  });

  it("DENIES (SCOPE) a principal with ONLY the organization boundary — both gates must hold together", async () => {
    const orgOnly = makePrincipal(ceo, { permissions: ["organization:entity.read"] });
    await expect(viewFor(orgOnly)).rejects.toThrow(/viz:scene.read/i);
  });
});

describe("Family Office spatial view — classification carries", () => {
  it("a RESTRICTED-cleared principal sees INTERNAL + RESTRICTED entities but NOT HIGHLY_RESTRICTED ones (filtered in SQL)", async () => {
    const view = await viewFor(admin);
    const codes = view.nodes.map((n) => n.code);
    expect(codes).toContain(`${RUN}-TRUST`);
    expect(codes).toContain(`${RUN}-HOLD`);
    expect(codes).not.toContain(`${RUN}-OP-HR`);
  });

  it("a HIGHLY_RESTRICTED-cleared principal also sees the HIGHLY_RESTRICTED entity", async () => {
    const view = await viewFor(ceo);
    expect(view.nodes.map((n) => n.code)).toContain(`${RUN}-OP-HR`);
  });

  it("trust instruments (HIGHLY_RESTRICTED) are invisible to a RESTRICTED-cleared principal even when the facet grant exists", async () => {
    const instrumentsCleared = makePrincipal(admin, {
      permissions: ["viz:scene.read", "organization:entity.read", "organization:ownership.read", "family:member.read"],
    });
    const view = await viewFor(instrumentsCleared);
    // admin's ceiling is RESTRICTED; the instrument is HIGHLY_RESTRICTED → filtered in SQL.
    expect(view.instruments).toEqual([]);
  });
});

describe("Family Office spatial view — tenant isolation", () => {
  it("a fully-permissioned, HIGHLY_RESTRICTED principal in ANOTHER tenant sees none of this tenant's entities", async () => {
    const other = makePrincipal(ujenziOps, {
      tenantId: ujenziOps.tenantId,
      roles: ["SECTOR_OPERATOR"],
      permissions: ["viz:scene.read", "organization:entity.read", "organization:ownership.read", "family:member.read"],
      clearance: "HIGHLY_RESTRICTED",
    });
    const view = await viewFor(other);
    const codes = view.nodes.map((n) => n.code);
    expect(codes).not.toContain(`${RUN}-TRUST`);
    expect(codes).not.toContain(`${RUN}-HOLD`);
    expect(codes).not.toContain(`${RUN}-OP-HR`);
    expect(view.edges).toEqual([]);
    // No trust entity is visible in its scope → count-free reason, not a leak.
    expect(view.instrumentsAvailable).toBe(false);
    expect(view.instrumentsUnavailableReason).toMatch(/trust entity/i);
  });
});

describe("Family Office spatial view — facet degradation (never to a wider dataset)", () => {
  it("ownership edges are absent (count-free) for a principal without organization:ownership.read — no count is leaked", async () => {
    const view = await viewFor(admin); // PLATFORM_ADMIN lacks organization:ownership.read
    expect(view.edges).toEqual([]);
    // Degradation is count-free: the summary reports the facet as unavailable
    // (-1) rather than stating how many edges exist.
    expect(view.summary.ownershipEdges).toBe(-1);
  });

  it("ownership edges ARE present for a principal holding the boundary, and only between visible endpoints", async () => {
    const view = await viewFor(ceo);
    const ids = new Set(view.nodes.map((n) => n.id));
    const edges = view.edges.filter((e) => e.id.startsWith(RUN));
    expect(edges.length).toBe(3);
    for (const e of edges) {
      expect(ids.has(e.ownedEntityId)).toBe(true);
      expect(ids.has(e.ownerEntityId)).toBe(true);
      expect(["DIRECT", "INDIRECT", "BENEFICIAL", "CONTROL_ONLY"]).toContain(e.ownershipType);
    }
  });

  it("trust instrument summaries require family:member.read; without it the facet is UNAVAILABLE with a reason, not an empty wider dataset", async () => {
    const view = await viewFor(admin); // no family:member.read
    expect(view.instruments).toBeNull();
    expect(view.instrumentsAvailable).toBe(false);
    expect(view.instrumentsUnavailableReason).toMatch(/family:member.read/i);
  });

  it("trust instrument summaries appear for a principal holding family:member.read at sufficient clearance", async () => {
    const view = await viewFor(ceo);
    expect(view.instrumentsAvailable).toBe(true);
    const deed = view.instruments?.find((i) => i.id === `${RUN}-INSTR`);
    expect(deed?.instrumentName).toBe(`${RUN} Deed of Trust`);
    expect(deed?.classification).toBe("HIGHLY_RESTRICTED");
  });
});

describe("Family Office spatial view — authority semantics", () => {
  it("the view is a read projection: the response carries the explicit non-grant authority note", async () => {
    const view = await viewFor(ceo);
    expect(view.authorityNote).toMatch(/no ownership/i);
    expect(view.authorityNote).toMatch(/visibility/i);
  });
});
