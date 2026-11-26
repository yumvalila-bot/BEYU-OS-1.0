import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, ne } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { legalEntities, tenants } from "../../src/db/schema";
import { buildWorldModel } from "../../src/lib/noelia/cognitive/world-model";
import {
  neighbourhood,
  recordedEntityGraph,
  validateEdgeProposal,
} from "../../src/lib/noelia/cognitive/knowledge-graph";
import {
  decisionLineage,
  decisionMemorySummary,
  prepareDecisionRecord,
  queryDecisionMemory,
} from "../../src/lib/noelia/cognitive/decision-memory";
import { resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { seededPrincipal } from "./db-fixtures";

/**
 * Database-backed acceptance tests for the NOELIA cognitive core.
 *
 * These exercise the REAL schema and the REAL authorization scope resolution —
 * not mocks. They are the evidence for:
 *   TEST 04 institutional memory · TEST 05 knowledge graph · TEST 06 world model
 *   TEST 07 permission-aware retrieval · TEST 08 cross-entity isolation
 */

let enterpriseTenantId = "";
let healthTenantId = "";

beforeAll(async () => {
  const all = await db.select().from(tenants);
  const enterprise = all.find((t) => t.type === "ENTERPRISE");
  const health = all.find((t) => t.code === "BEYU-HEALTH");
  if (!enterprise || !health) throw new Error("Seed tenant topology is incomplete.");
  enterpriseTenantId = enterprise.id;
  healthTenantId = health.id;
});

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe("world model (TEST 06)", () => {
  it("distinguishes recorded, derived and simulated state and never invents values", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const model = await buildWorldModel({ principal, scope, traceId: "WM_TEST_1" });

      expect(model.nodes.length).toBeGreaterThan(0);
      // Recorded nodes exist and are labelled.
      expect(model.counts.recorded).toBeGreaterThan(0);
      for (const node of model.nodes) {
        expect(["RECORDED", "DERIVED", "ESTIMATED", "SIMULATED", "PREDICTED", "UNAVAILABLE"]).toContain(node.state);
        // Every node declares where it came from.
        expect(node.provenance.length).toBeGreaterThan(0);
      }
      // Structural admissions are explicit, never approximated.
      expect(model.unavailable.map((u) => u.subject)).toContain("FINANCIAL_VALUES");
      // No node asserts a financial magnitude.
      for (const node of model.nodes) {
        expect(Object.keys(node.attributes)).not.toContain("revenue");
        expect(Object.keys(node.attributes)).not.toContain("valuation");
      }
    });
  });

  it("labels simulation provenance as SIMULATED, never RECORDED", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const model = await buildWorldModel({
        principal,
        scope,
        traceId: "WM_TEST_2",
        includeSimulations: true,
      });
      for (const node of model.nodes) {
        if (node.provenance === "noelia_simulations") {
          expect(node.state).toBe("SIMULATED");
          expect(node.label).toMatch(/^SIMULATION · /);
        }
      }
    });
  });

  it("returns an explicit empty model, not a fabricated one, for a caller with no tenant scope", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const model = await buildWorldModel({
        principal,
        traceId: "WM_TEST_3",
        scope: {
          tenantIds: [],
          legalEntityIds: [],
          countryCodes: [],
          entities: [],
          tenantCountries: [],
          enterprise: false,
        },
      });
      expect(model.nodes).toHaveLength(0);
      expect(model.claims).toHaveLength(0);
      expect(model.unavailable[0].subject).toBe("INSTITUTIONAL_STRUCTURE");
    });
  });
});

describe("permission-aware retrieval and isolation (TEST 07, TEST 08)", () => {
  it("never returns an entity the caller cannot see (classification ceiling pushed into SQL)", async () => {
    const healthOps = await seededPrincipal("health.ops@beyu.os");
    await withTenantDatabaseContext(healthOps, async () => {
      const scope = await resolveNoeliaAuthorizedScope(healthOps);
      const model = await buildWorldModel({ principal: healthOps, scope, traceId: "WM_ISO_1" });
      // A Health-sector principal must not see another tenant's entities.
      for (const node of model.nodes.filter((n) => n.type === "ENTITY")) {
        const [entity] = await db
          .select({ tenantId: legalEntities.tenantId })
          .from(legalEntities)
          .where(eq(legalEntities.id, node.id))
          .limit(1);
        if (entity) expect(scope.tenantIds).toContain(entity.tenantId);
      }
    });
  });

  it("denies the world model to a principal with no matching authority grant", async () => {
    // Authorization is resolved from ACTIVE authority grants, not from the
    // Permission set. A principal with zero grants must be denied before any
    // institutional row is read.
    const healthOps = await seededPrincipal("health.ops@beyu.os");
    const ungranted = {
      ...healthOps,
      authorityGrants: [],
      delegatedPermissions: [],
      emergencyPermissions: [],
    };
    await expect(
      withTenantDatabaseContext(healthOps, async () => {
        const scope = await resolveNoeliaAuthorizedScope(healthOps);
        return buildWorldModel({
          principal: ungranted as typeof healthOps,
          scope,
          traceId: "WM_DENY_1",
        });
      }),
    ).rejects.toThrow(/denied/);
  });
});

describe("knowledge graph (TEST 05)", () => {
  it("projects the recorded corporate structure from legal_entities", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const graph = await recordedEntityGraph({ principal, scope });
      expect(graph.nodes.length).toBeGreaterThan(0);
      // Parent/child edges only reference nodes present in the authorized set.
      const ids = new Set(graph.nodes.map((n) => n.id));
      for (const edge of graph.edges) {
        expect(ids.has(edge.fromId)).toBe(true);
        expect(ids.has(edge.toId)).toBe(true);
        expect(edge.relation).toBe("PARENT_OF");
      }
    });
  });

  it("returns a bounded neighbourhood with an explicit empty result for an unknown subject", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await neighbourhood({
        principal,
        scope,
        subjectType: "ENTITY",
        subjectRef: "LEN_DOES_NOT_EXIST",
        depth: 2,
      });
      expect(result.edges).toHaveLength(0);
      expect(result.depth).toBe(2);
      expect(result.nodes).toHaveLength(1); // the root subject only
    });
  });

  it("validates edge proposals and rejects self-edges and unknown relations", () => {
    const base = {
      tenantId: enterpriseTenantId,
      classification: "INTERNAL" as const,
      fromType: "ENTITY",
      fromRef: "LEN_A",
      relation: "PARENT_OF" as const,
      toType: "ENTITY",
      toRef: "LEN_B",
      provenance: "legal_entities.parent_entity_id",
      origin: "OBSERVED" as const,
    };
    expect(validateEdgeProposal(base).ok).toBe(true);
    expect(validateEdgeProposal({ ...base, toType: "ENTITY", toRef: "LEN_A" }).ok).toBe(false);
    expect(
      validateEdgeProposal({ ...base, relation: "HAS_VIBES" as never }).ok,
    ).toBe(false);
    expect(validateEdgeProposal({ ...base, provenance: "" }).ok).toBe(false);
  });
});

describe("institutional decision memory (TEST 04)", () => {
  it("records a decision with rationale, authority and provenance, then reads it back", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const decidedOn = "2026-03-01";
    // A UNIQUE keyword per run. Every row in this test shares decidedOn
    // 2026-03-01, so an accumulating table would otherwise push the fresh row
    // outside the readback window — a test-data artefact, not a product defect,
    // but one that makes the assertion silently depend on how many times the
    // suite has run before.
    const marker = `retrieval baseline ${Date.now()}`;
    const prepared = prepareDecisionRecord({
      tenantId: enterpriseTenantId,
      classification: "INTERNAL",
      decisionCode: `TEST-DEC-${Date.now()}`,
      title: `Approve institutional knowledge register baseline (${marker})`,
      question: "Should the group adopt the knowledge register as the retrieval baseline?",
      decision: "Adopt the governed knowledge register as the retrieval baseline for NOELIA.",
      rationale: "The register is the only provenance-bearing source with immutable digests.",
      alternativesConsidered: ["Continue with ad-hoc document retrieval"],
      evidenceRefs: ["knowledge_sources"],
      assumptions: ["The register remains under governance review before publication"],
      decidedOn,
      decidedBy: principal.userId,
      decidedByRole: "CHIEF_GOVERNANCE_OFFICER",
      approvingBody: "GROUP_GOVERNANCE_COUNCIL",
      approvalReference: "RES-2026-014",
      provenance: "Governance council minute RES-2026-014",
      createdBy: principal.userId,
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await withTenantDatabaseContext(principal, async () => {
      // The INSERT must happen INSIDE the canonical transaction-scoped tenant
      // context. `noelia_decision_records` is protected by FORCED row-level
      // security, so a write from an unscoped connection is rejected — which is
      // the isolation working, not a test inconvenience. Writing outside this
      // block was the original form of this test and it only passed while the
      // table's RLS policy was missing (the 0084 defect).
      await db.insert((await import("../../src/db/schema")).noeliaDecisionRecords).values(prepared.row);

      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await queryDecisionMemory({
        principal,
        scope,
        keyword: marker,
        limit: 10,
      });
      expect(result.records.length).toBeGreaterThan(0);
      const record = result.records.find((r) => r.code === prepared.row.decisionCode)!;
      expect(record).toBeDefined();
      expect(record.rationale).toContain("provenance-bearing");
      expect(record.decidedByRole).toBe("CHIEF_GOVERNANCE_OFFICER");
      expect(record.provenance).toContain("RES-2026-014");
      expect(record.alternatives).toContain("Continue with ad-hoc document retrieval");
      // Claims derived from the record are FACTs with evidence.
      expect(result.claims.some((c) => c.kind === "FACT" && c.evidence.length > 0)).toBe(true);
    });
  });

  it("rejects a decision with no rationale, future date, or no accountable role", () => {
    const base = {
      tenantId: enterpriseTenantId,
      classification: "INTERNAL" as const,
      decisionCode: "TEST-DEC-BAD",
      title: "Bad",
      question: "Q",
      decision: "D",
      rationale: "short",
      alternativesConsidered: [],
      evidenceRefs: [],
      assumptions: [],
      decidedOn: "2026-01-01",
      decidedBy: "user",
      decidedByRole: "CHIEF_GOVERNANCE_OFFICER",
      provenance: "minute",
    };
    expect(prepareDecisionRecord(base).ok).toBe(false);
    expect(
      prepareDecisionRecord({ ...base, rationale: "A sufficiently long rationale text." }).ok,
    ).toBe(true);
    expect(
      prepareDecisionRecord({
        ...base,
        rationale: "A sufficiently long rationale text.",
        decidedOn: "2099-01-01",
      }).ok,
    ).toBe(false);
    expect(
      prepareDecisionRecord({
        ...base,
        rationale: "A sufficiently long rationale text.",
        decidedByRole: "",
      }).ok,
    ).toBe(false);
  });

  it("does not leak decisions across tenants", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const other = await seededPrincipal("health.ops@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const summary = await decisionMemorySummary({ principal, scope });
      expect(summary.effective).toBeGreaterThanOrEqual(0);
    });
    await withTenantDatabaseContext(other, async () => {
      const scope = await resolveNoeliaAuthorizedScope(other);
      // A health-sector principal's scope cannot include the enterprise tenant's
      // decision records unless the resolved scope actually grants it.
      const result = await queryDecisionMemory({ principal: other, scope, limit: 50 });
      for (const record of result.records) {
        const [row] = await db
          .select({ tenantId: (await import("../../src/db/schema")).noeliaDecisionRecords.tenantId })
          .from((await import("../../src/db/schema")).noeliaDecisionRecords)
          .where(eq((await import("../../src/db/schema")).noeliaDecisionRecords.id, record.id))
          .limit(1);
        expect(scope.tenantIds).toContain(row.tenantId);
      }
    });
  });

  it("returns an explicit UNKNOWN claim rather than an empty success", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const result = await queryDecisionMemory({
        principal,
        scope,
        keyword: "zzz-no-such-decision-subject-zzz",
        limit: 5,
      });
      expect(result.records).toHaveLength(0);
      expect(result.claims).toHaveLength(1);
      expect(result.claims[0].kind).toBe("UNKNOWN");
      expect(result.claims[0].confidence).toBeNull();
    });
  });

  it("follows a supersession chain without overwriting history", async () => {
    const principal = await seededPrincipal("governance@beyu.os");
    const { noeliaDecisionRecords } = await import("../../src/db/schema");
    const stamp = Date.now();
    const original = prepareDecisionRecord({
      tenantId: enterpriseTenantId,
      classification: "INTERNAL",
      decisionCode: `TEST-DEC-ORIG-${stamp}`,
      title: "Original decision",
      question: "Q",
      decision: "Proceed",
      rationale: "The initial rationale is recorded here in full.",
      alternativesConsidered: [],
      evidenceRefs: [],
      assumptions: [],
      decidedOn: "2026-01-10",
      decidedBy: principal.userId,
      decidedByRole: "CHIEF_GOVERNANCE_OFFICER",
      provenance: "minute A",
    });
    const replacement = prepareDecisionRecord({
      tenantId: enterpriseTenantId,
      classification: "INTERNAL",
      decisionCode: `TEST-DEC-NEW-${stamp}`,
      title: "Replacement decision",
      question: "Q",
      decision: "Defer",
      rationale: "New evidence required deferral of the original decision.",
      alternativesConsidered: [],
      evidenceRefs: [],
      assumptions: [],
      decidedOn: "2026-02-10",
      decidedBy: principal.userId,
      decidedByRole: "CHIEF_GOVERNANCE_OFFICER",
      provenance: "minute B",
      supersedesId: original.ok ? original.id : null,
    });
    expect(original.ok && replacement.ok).toBe(true);
    if (!original.ok || !replacement.ok) return;

    await db.insert(noeliaDecisionRecords).values(original.row);
    await db.insert(noeliaDecisionRecords).values(replacement.row);
    await db
      .update(noeliaDecisionRecords)
      .set({ status: "SUPERSEDED" })
      .where(eq(noeliaDecisionRecords.id, original.id));

    await withTenantDatabaseContext(principal, async () => {
      const scope = await resolveNoeliaAuthorizedScope(principal);
      const lineage = await decisionLineage({
        principal,
        scope,
        decisionCode: replacement.row.decisionCode,
      });
      expect(lineage).toHaveLength(2);
      expect(lineage[0].code).toBe(replacement.row.decisionCode);
      expect(lineage[1].code).toBe(original.row.decisionCode);
      // History is preserved, not erased.
      expect(lineage[1].rationale).toContain("initial rationale");
    });
  });
});
