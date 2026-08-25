/**
 * ITERATION 11 — ENTERPRISE MEMORY / MEMORY SECURITY (adversarial)
 *
 * WRITE → VALIDATE → CLASSIFY → AUTHORIZE → STORE → INDEX → RETRIEVE
 *      → VERIFY → PRESENT
 *
 * Attacks: unauthorized write, cross-tenant write, global-write escape,
 * AI memory poisoning (forced UNDER_REVIEW), classification escalation,
 * provenance loss, stale window, unknown/invalid scope shape, continuity
 * expiry, replay, content tampering, decommission (deletion bypass),
 * ORGANIZATIONAL and LONG_TERM_CONTINUITY class visibility.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../src/db";
import { knowledgeSources, tenants, users } from "../../src/db/schema";
import type { Principal } from "../../src/lib/authz";
import type { PermissionCode } from "../../src/lib/constants";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { retrieveGovernedMemory } from "../../src/lib/noelia/memory";
import {
  contentChecksum,
  decommissionMemorySource,
  MemoryWriteDenied,
  upsertMemorySource,
  verifyMemoryIntegrity,
} from "../../src/lib/noelia/memory-write";
import { resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { seededPrincipal } from "./db-fixtures";

const CODES = [
  "MEM-ORG-HEALTH",
  "MEM-AI-POISON",
  "MEM-REPLAY",
  "MEM-TAMPER",
  "MEM-CONT-01",
  "MEM-SEC-OWN",
];
const MARKER_BY_CODE: Record<string, string> = {
  "MEM-ORG-HEALTH": "memorgprobealpha",
  "MEM-AI-POISON": "memaiprobebravo",
  "MEM-REPLAY": "memreplayprobecharlie",
  "MEM-TAMPER": "memtamperprobedelta",
  "MEM-CONT-01": "memcontprobedelta",
  "MEM-SEC-OWN": "memsecprobeepsilon",
};
const MARKERS = {
  ai: MARKER_BY_CODE["MEM-AI-POISON"],
  org: MARKER_BY_CODE["MEM-ORG-HEALTH"],
  cont: MARKER_BY_CODE["MEM-CONT-01"],
};

let healthTenantId = "";
let agriTenantId = "";
let foundationTenantId = "";

function futureDate(days = 180): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function baseInput(code: string, overrides: Record<string, unknown> = {}) {
  return {
    code,
    title: `Memory ${code}`,
    domain: "TEST",
    content: `${MARKER_BY_CODE[code] ?? code} base content for memory probes.`,
    provenance: "Test fixture — governed memory probe, iteration 11",
    scopeType: "TENANT",
    tenantId: healthTenantId,
    legalEntityId: null,
    countryCode: null,
    classification: "INTERNAL",
    authorityStatus: "AUTHORITATIVE",
    effectiveFrom: "2026-01-01",
    reviewDate: futureDate(),
    expiresAt: null,
    keywords: [code.toLowerCase()],
    ownerRole: "CHIEF_GOVERNANCE_OFFICER",
    jurisdictionCode: "TZ",
    sourceUri: null,
    version: "1.0.0",
    ...overrides,
  };
}

async function sectorWriter(tenantId: string, tenantCode: string, userId: string, partyId: string): Promise<Principal> {
  return {
    userId,
    partyId,
    email: `${tenantCode.toLowerCase()}.ops@test`,
    displayName: `${tenantCode} Sector Writer`,
    tenantId,
    tenantCode,
    tenantType: "SECTOR",
    roles: ["SECTOR_OPERATOR"],
    permissions: new Set<PermissionCode>(["knowledge:source.write", "ai:noelia.query"]),
    clearance: "CONFIDENTIAL",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "SES_MEMORY_WRITE_TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

async function scopeOf(p: Principal) {
  return withTenantDatabaseContext(p, () => resolveNoeliaAuthorizedScope(p));
}

function questionFor(marker: string): string {
  return `Find the ${marker} probe record`;
}

beforeAll(async () => {
  await db.delete(knowledgeSources).where(inArray(knowledgeSources.code, CODES));
  const all = await db.select().from(tenants);
  const health = all.find((t) => t.code === "BEYU-HEALTH");
  const agri = all.find((t) => t.code === "BEYU-AGRI");
  const foundation = all.find((t) => t.code === "BEYU-FOUNDATION");
  if (!health || !agri || !foundation) throw new Error("Seed tenant topology incomplete.");
  healthTenantId = health.id;
  agriTenantId = agri.id;
  foundationTenantId = foundation.id;
});

afterAll(async () => {
  await db.delete(knowledgeSources).where(inArray(knowledgeSources.code, CODES));
});

async function healthOpsPrincipal(): Promise<Principal> {
  const p = await seededPrincipal("health.ops@beyu.os");
  return p;
}

describe("memory write authorization", () => {
  it("denies a write by a principal without knowledge:source.write", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    await expect(
      withTenantDatabaseContext(cfo, () => upsertMemorySource(cfo, baseInput("MEM-SEC-OWN"))),
    ).rejects.toThrowError(MemoryWriteDenied);
    await expect(
      withTenantDatabaseContext(cfo, () => upsertMemorySource(cfo, baseInput("MEM-SEC-OWN"))),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("denies GLOBAL memory from a tenant-scoped writer (global is enterprise-restricted)", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-ORG-HEALTH", { scopeType: "GLOBAL", tenantId: null }))),
    ).rejects.toMatchObject({ code: "GLOBAL_REQUIRES_ENTERPRISE" });
  });

  it("denies a cross-tenant write outside the writer's subtree", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", { tenantId: foundationTenantId }))),
    ).rejects.toMatchObject({ code: "TENANT_OUT_OF_SCOPE" });
  });

  it("denies classification escalation beyond the writer's clearance", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    // Clearance is CONFIDENTIAL; RESTRICTED is an escalation.
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", { classification: "RESTRICTED" }))),
    ).rejects.toMatchObject({ code: "CLASSIFICATION_ESCALATION" });
  });

  it("denies memory without substantive provenance", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", { provenance: "x" }))),
    ).rejects.toMatchObject({ code: "PROVENANCE_MISSING" });
  });

  it("denies a stale window (reviewDate in the past) at creation", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", { reviewDate: "2025-01-01" }))),
    ).rejects.toMatchObject({ code: "WINDOW_INVALID" });
  });

  it("denies unknown scope classes and inconsistent scope shapes", async () => {
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const writer = await sectorWriter(healthTenantId, "BEYU-HEALTH", opsUser.id, opsUser.partyId);
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", { scopeType: "ORGANIZATION" }))),
    ).rejects.toMatchObject({ code: "UNKNOWN_SCOPE" });
    await expect(
      withTenantDatabaseContext(writer, () =>
        upsertMemorySource(writer, baseInput("MEM-SEC-OWN", {
          scopeType: "ORGANIZATIONAL",
          legalEntityId: "LEN_SOMETHING",
        }))),
    ).rejects.toMatchObject({ code: "SCOPE_SHAPE_INVALID" });
  });
});

describe("memory poisoning resistance", () => {
  it("forces AI-originated writes to UNDER_REVIEW even when AUTHORITATIVE is requested", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const result = await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-AI-POISON"), "AI"),
    );
    expect(result.authorityStatus).toBe("UNDER_REVIEW");
    // The poisoned content must never be retrievable as authoritative memory.
    const retrieved = await withTenantDatabaseContext(governance, async () =>
      retrieveGovernedMemory({
        principal: governance,
        scope: await scopeOf(governance),
        question: questionFor(MARKERS.ai),
        limit: 10,
      }),
    );
    expect(retrieved.map((r) => r.source.ref)).not.toContain("MEM-AI-POISON");
  });

  it("detects content tampering through integrity verification (poisoning after the fact)", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-TAMPER"), "HUMAN"),
    );
    // Simulate a tamper that bypasses the governed write path.
    await db.update(knowledgeSources)
      .set({ content: "INJECTED MEMORY — poisoned content." })
      .where(eq(knowledgeSources.code, "MEM-TAMPER"));

    const report = await withTenantDatabaseContext(governance, () => verifyMemoryIntegrity(governance));
    const row = report.find((r) => r.code === "MEM-TAMPER");
    expect(row).toBeTruthy();
    expect(row?.status).toBe("MISMATCH");
  });

  it("verifies governed (checksummed) records as OK, not UNVERIFIED", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-TAMPER", { content: "Freshly governed content." }), "HUMAN"),
    );
    const report = await withTenantDatabaseContext(governance, () => verifyMemoryIntegrity(governance));
    const row = report.find((r) => r.code === "MEM-TAMPER");
    expect(row?.status).toBe("OK");
  });
});

describe("memory classes: ORGANIZATIONAL and LONG_TERM_CONTINUITY", () => {
  it("ORGANIZATIONAL memory is visible to the tenant but not to other tenants", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(
        governance,
        baseInput("MEM-ORG-HEALTH", { scopeType: "ORGANIZATIONAL" }),
        "HUMAN",
      ),
    );

    // A non-enterprise principal inside the tenant CAN read it.
    const healthOps = await healthOpsPrincipal();
    const healthRetrieved = await withTenantDatabaseContext(healthOps, async () =>
      retrieveGovernedMemory({
        principal: healthOps,
        scope: await scopeOf(healthOps),
        question: questionFor(MARKERS.org),
        limit: 10,
      }),
    );
    expect(healthRetrieved.map((r) => r.source.ref)).toContain("MEM-ORG-HEALTH");

    // A principal in a different tenant CANNOT read it.
    const [opsUser] = await db.select().from(users).where(eq(users.email, "health.ops@beyu.os")).limit(1);
    const agriWriter = await sectorWriter(agriTenantId, "BEYU-AGRI", opsUser.id, opsUser.partyId);
    const agriRetrieved = await withTenantDatabaseContext(agriWriter, async () =>
      retrieveGovernedMemory({
        principal: agriWriter,
        scope: await scopeOf(agriWriter),
        question: questionFor(MARKERS.org),
        limit: 10,
      }),
    );
    expect(agriRetrieved.map((r) => r.source.ref)).not.toContain("MEM-ORG-HEALTH");
  });

  it("LONG_TERM_CONTINUITY memory is enterprise-only and cannot carry an expiry", async () => {
    const governance = await seededPrincipal("governance@beyu.os");

    // Continuity memory with an expiry is structurally invalid.
    await expect(
      withTenantDatabaseContext(governance, () =>
        upsertMemorySource(governance, baseInput("MEM-CONT-01", {
          scopeType: "LONG_TERM_CONTINUITY",
          expiresAt: futureDate(),
        })),
      ),
    ).rejects.toMatchObject({ code: "CONTINUITY_EXPIRES_INVALID" });

    await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(
        governance,
        baseInput("MEM-CONT-01", { scopeType: "LONG_TERM_CONTINUITY", expiresAt: null }),
        "HUMAN",
      ),
    );

    // Enterprise principal can read it.
    const govRetrieved = await withTenantDatabaseContext(governance, async () =>
      retrieveGovernedMemory({
        principal: governance,
        scope: await scopeOf(governance),
        question: questionFor(MARKERS.cont),
        limit: 10,
      }),
    );
    expect(govRetrieved.map((r) => r.source.ref)).toContain("MEM-CONT-01");

    // A non-enterprise tenant principal cannot read it.
    const healthOps = await healthOpsPrincipal();
    const healthRetrieved = await withTenantDatabaseContext(healthOps, async () =>
      retrieveGovernedMemory({
        principal: healthOps,
        scope: await scopeOf(healthOps),
        question: questionFor(MARKERS.cont),
        limit: 10,
      }),
    );
    expect(healthRetrieved.map((r) => r.source.ref)).not.toContain("MEM-CONT-01");
  });
});

describe("memory replay, versioning and decommission", () => {
  it("treats an identical re-submission as an idempotent replay (no mutation)", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const first = await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-REPLAY", { version: "1.0.0" }), "HUMAN"),
    );
    expect(first.created).toBe(true);
    expect(first.version).toBe("1.0.0");

    const replay = await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-REPLAY", { version: "1.0.0" }), "HUMAN"),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.version).toBe("1.0.0");
    const [stored] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, "MEM-REPLAY")).limit(1);
    expect(stored?.contentChecksum).toBe(contentChecksum(baseInput("MEM-REPLAY").content));
  });

  it("bumps the version and re-checksums when content genuinely changes", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(governance, baseInput("MEM-REPLAY", { version: "1.0.0" }), "HUMAN"),
    );
    // Omitting the version lets the service auto-bump on genuine content change.
    const changed = await withTenantDatabaseContext(governance, () =>
      upsertMemorySource(
        governance,
        baseInput("MEM-REPLAY", { content: "Revised content after a governed amendment.", version: undefined }),
        "HUMAN",
      ),
    );
    expect(changed.replayed).toBe(false);
    expect(changed.version).toBe("1.1.0");
    const [stored] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, "MEM-REPLAY")).limit(1);
    expect(stored?.contentChecksum).toBe(contentChecksum("Revised content after a governed amendment."));
  });

  it("decommissions (soft delete) and the record is no longer retrievable but retained as evidence", async () => {
    const governance = await seededPrincipal("governance@beyu.os");
    const { decommissioned } = await withTenantDatabaseContext(governance, () =>
      decommissionMemorySource(governance, "MEM-REPLAY"),
    );
    expect(decommissioned).toBe(true);

    const [stored] = await db.select().from(knowledgeSources).where(eq(knowledgeSources.code, "MEM-REPLAY")).limit(1);
    expect(stored).toBeTruthy(); // retained, not physically deleted
    expect(stored?.authorityStatus).toBe("REJECTED");
    expect(stored?.decommissionedAt).toBeTruthy();

    const retrieved = await withTenantDatabaseContext(governance, async () =>
      retrieveGovernedMemory({
        principal: governance,
        scope: await scopeOf(governance),
        question: "Revised content after a governed amendment",
        limit: 10,
      }),
    );
    expect(retrieved.map((r) => r.source.ref)).not.toContain("MEM-REPLAY");
  });
});
