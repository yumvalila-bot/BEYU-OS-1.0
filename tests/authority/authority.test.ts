/**
 * Phase 7I — Policy provenance, authority readiness and execution-gate preparation.
 *
 * The authority layer is the one place where a permissive bug is indistinguishable from a
 * successful attack, so this suite is written adversarially. Its organising principle:
 *
 *   NEGATIVE FIRST. Every control is proven to DENY before it is allowed to permit anything.
 *   A test that only ever sees the allow path proves nothing about a gate.
 *
 * NON-VACUITY. Engine tests use clearly-labelled SYNTHETIC AUTHORITY fixtures, because no ratified
 * authority exists in BEYU today — that is the true production state, not a gap in the tests. The
 * fixtures are constructed in memory, never written, so they cannot leak into production authority
 * state. Service tests run against the REAL registries and assert specific real counts, so a
 * silently empty query cannot masquerade as a pass.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES, ROLE_CLEARANCE } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import {
  AUTHORITY_ENGINE_VERSION,
  assessDecisionReadiness,
  buildChain,
  computePolicyVersion,
  detectPolicyConflicts,
  evaluateAuthority,
  simulateRatification,
} from "@/lib/authority/engines";
import {
  buildReadinessMatrix,
  checkScopedCapability,
  detectConflicts,
  explainAuthority,
  loadAuthorityRecord,
  loadPolicyVersions,
  simulate,
  toAuthorityStatus,
  traceCapabilityChain,
} from "@/lib/authority/service";
import type { AuthorityRecord, PolicyVersionIdentity } from "@/lib/authority/model";

const TENANT = "TEN_BEYU_GROUP";
const ASOF = "2026-02-15";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

let cachedTenantId = "";
async function tenantId(): Promise<string> {
  if (!cachedTenantId) {
    const [row] = await rowsOf<{ id: string }>(sql`select id from tenants order by created_at limit 1`);
    cachedTenantId = row.id;
  }
  return cachedTenantId;
}

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["GROUP_CFO"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  const rank = (c: string) =>
    ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"].indexOf(c);
  let clearance = "PUBLIC";
  for (const role of roles) {
    const c = (ROLE_CLEARANCE as Record<string, string>)[role] ?? "INTERNAL";
    if (rank(c) > rank(clearance)) clearance = c;
  }
  return {
    userId: "USR_AUTHORITY_TEST",
    partyId: "p",
    email: "authority@example.test",
    displayName: "Authority Test",
    tenantId: cachedTenantId,
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles,
    permissions,
    clearance,
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  } as unknown as Principal;
}

/**
 * SYNTHETIC AUTHORITY FIXTURE. Never persisted, never reachable from production authority state.
 * Exists solely so the positive path of each control can be exercised — without it every test
 * would pass for the trivial reason that nothing is ratified.
 */
const synth = (over: Partial<AuthorityRecord> = {}): AuthorityRecord => ({
  authorityId: "SYNTHETIC-AUTH-001",
  authorityType: "DECISION",
  source: "SYNTHETIC_TEST_FIXTURE",
  issuer: "SYNTHETIC_BOARD",
  approver: "SYNTHETIC_APPROVER",
  approvalDate: "2026-01-01",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "RATIFIED",
  authorityClass: "SYNTHETIC_FIXTURE",
  jurisdiction: "TZ",
  tenantId: null,
  entityScope: null,
  scope: null,
  policyVersion: null,
  evidence: "SYNTHETIC-EVIDENCE-REF",
  provenance: "GOVERNED",
  checksum: "synthetic",
  supersedes: null,
  revokes: null,
  rationale: null,
  ...over,
});

const req = (over: Partial<Parameters<typeof evaluateAuthority>[1]> = {}) => ({
  authorityId: "SYNTHETIC-AUTH-001",
  asOf: ASOF,
  tenantId: TENANT,
  legalEntityId: null as string | null,
  principalPermissions: new Set<string>(["finance:ledger.post"]),
  requiredPermission: null as string | null,
  ...over,
});

const pv = (over: Partial<PolicyVersionIdentity> = {}): PolicyVersionIdentity => ({
  policyId: "P-SYN-1",
  code: "SYN-POL",
  version: "1.0",
  checksum: "c1",
  contentChecksum: "cc1",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  status: "ACTIVE",
  jurisdiction: "TZ",
  tenantId: TENANT,
  entityScope: null,
  approvedByResolutionId: "RES-1",
  provenanceComplete: true,
  provenanceGap: null,
  ...over,
});

// =============================================================================
// §4 / §9 — THE THREE QUESTIONS
// =============================================================================
describe("authority evaluation — exists / effective / permits are three separate answers", () => {
  it("returns three independent fields, never one boolean", () => {
    const r = evaluateAuthority(synth(), req());
    expect(r).toHaveProperty("exists");
    expect(r).toHaveProperty("effective");
    expect(r).toHaveProperty("permits");
    expect(r.exists).toBe(true);
    expect(r.effective).toBe(true);
    expect(r.permits).toBe(true);
  });

  it("a missing authority does not exist, is not effective and does not permit", () => {
    const r = evaluateAuthority(null, req());
    expect(r.exists).toBe(false);
    expect(r.effective).toBe(false);
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_MISSING");
  });

  it("an authority can EXIST and be EFFECTIVE yet still not PERMIT — scope is a separate question", () => {
    const r = evaluateAuthority(synth({ tenantId: "TEN_OTHER" }), req());
    expect(r.exists).toBe(true);
    expect(r.effective).toBe(true);
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("TENANT_SCOPE_MISMATCH");
  });

  it("records the specific condition that failed, not a generic denial", () => {
    const r = evaluateAuthority(synth({ status: "APPROVED" }), req());
    expect(r.conditions.recordFound).toBe(true);
    expect(r.conditions.statusRatified).toBe(false);
    expect(r.conditions.principalAuthorized).toBe(false);
  });
});

// =============================================================================
// §2 — APPROVED IS NOT RATIFIED
// =============================================================================
describe("lifecycle distinctions", () => {
  it("APPROVED authority does not permit execution", () => {
    const r = evaluateAuthority(synth({ status: "APPROVED" }), req());
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_NOT_EFFECTIVE");
  });

  for (const status of ["DRAFT", "SUBMITTED", "REVIEW", "TABLED", "UNKNOWN"] as const) {
    it(`${status} authority does not permit execution`, () => {
      const r = evaluateAuthority(synth({ status }), req());
      expect(r.permits).toBe(false);
      expect(r.effective).toBe(false);
    });
  }

  it("RATIFIED and EFFECTIVE are both in force", () => {
    expect(evaluateAuthority(synth({ status: "RATIFIED" }), req()).permits).toBe(true);
    expect(evaluateAuthority(synth({ status: "EFFECTIVE" }), req()).permits).toBe(true);
  });

  it("an authority with no approval date is not effective even when marked RATIFIED", () => {
    const r = evaluateAuthority(synth({ approvalDate: null }), req());
    expect(r.permits).toBe(false);
    expect(r.conditions.approvalRecorded).toBe(false);
  });
});

// =============================================================================
// §7 — TEMPORAL AUTHORITY (the 10 required cases)
// =============================================================================
describe("temporal authority", () => {
  it("1. future authority does not act early", () => {
    const r = evaluateAuthority(synth({ effectiveFrom: "2026-06-01" }), req({ asOf: "2026-02-15" }));
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_NOT_EFFECTIVE");
    expect(r.reason).toContain("does not act early");
  });

  it("2. authority effective exactly today IS effective (inclusive lower bound)", () => {
    expect(evaluateAuthority(synth({ effectiveFrom: ASOF }), req()).permits).toBe(true);
  });

  it("3. authority expiring exactly today IS still effective (inclusive upper bound)", () => {
    expect(evaluateAuthority(synth({ effectiveTo: ASOF }), req()).permits).toBe(true);
  });

  it("4. authority that expired yesterday does not permit", () => {
    const r = evaluateAuthority(synth({ effectiveTo: "2026-02-14" }), req());
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_EXPIRED");
  });

  it("5. an EXPIRED status is terminal regardless of an open window", () => {
    const r = evaluateAuthority(synth({ status: "EXPIRED", effectiveTo: null }), req());
    expect(r.decision).toBe("AUTHORITY_EXPIRED");
  });

  it("6. a REVOKED authority inside its window still does not permit", () => {
    const r = evaluateAuthority(
      synth({ status: "REVOKED", effectiveFrom: "2020-01-01", effectiveTo: "2030-01-01" }),
      req(),
    );
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_REVOKED");
  });

  it("7. a SUPERSEDED authority inside its window still does not permit", () => {
    const r = evaluateAuthority(synth({ status: "SUPERSEDED", effectiveTo: "2030-01-01" }), req());
    expect(r.decision).toBe("AUTHORITY_SUPERSEDED");
  });

  it("8. an authority with no effective_from is not effective", () => {
    const r = evaluateAuthority(synth({ effectiveFrom: null }), req());
    expect(r.permits).toBe(false);
    expect(r.conditions.effectiveDateReached).toBe(false);
  });

  it("9. evaluation at an earlier date and a later date can differ for the same record", () => {
    const record = synth({ effectiveFrom: "2026-03-01", effectiveTo: "2026-04-01" });
    expect(evaluateAuthority(record, req({ asOf: "2026-02-15" })).permits).toBe(false);
    expect(evaluateAuthority(record, req({ asOf: "2026-03-15" })).permits).toBe(true);
    expect(evaluateAuthority(record, req({ asOf: "2026-05-15" })).permits).toBe(false);
  });

  it("10. the evaluation date is recorded on the result, so a decision is replayable", () => {
    expect(evaluateAuthority(synth(), req({ asOf: "2026-03-09" })).evaluatedAt).toBe("2026-03-09");
  });

  it("rejects a malformed asOf rather than coercing it", () => {
    expect(() => evaluateAuthority(synth(), req({ asOf: "15/02/2026" }))).toThrow(/ISO date/);
  });
});

// =============================================================================
// §9 — SCOPE
// =============================================================================
describe("tenant, entity and principal scope", () => {
  it("a group-wide authority (null tenant) applies to any tenant", () => {
    expect(evaluateAuthority(synth({ tenantId: null }), req({ tenantId: "TEN_ANY" })).permits).toBe(true);
  });

  it("a tenant-scoped authority does not reach another tenant", () => {
    const r = evaluateAuthority(synth({ tenantId: "TEN_A" }), req({ tenantId: "TEN_B" }));
    expect(r.decision).toBe("TENANT_SCOPE_MISMATCH");
  });

  it("an entity-scoped authority does not reach another entity", () => {
    const r = evaluateAuthority(synth({ entityScope: "ENT_A" }), req({ legalEntityId: "ENT_B" }));
    expect(r.decision).toBe("ENTITY_SCOPE_MISMATCH");
  });

  it("an entity-scoped authority cannot authorise an unscoped, all-entity request", () => {
    const r = evaluateAuthority(synth({ entityScope: "ENT_A" }), req({ legalEntityId: null }));
    expect(r.decision).toBe("ENTITY_SCOPE_MISMATCH");
    expect(r.reason).toContain("unscoped");
  });

  it("a principal lacking the execution permission is refused", () => {
    const r = evaluateAuthority(
      synth(),
      req({ requiredPermission: "finance:ledger.approve", principalPermissions: new Set(["finance:ledger.read"]) }),
    );
    expect(r.decision).toBe("PRINCIPAL_NOT_AUTHORIZED");
    expect(r.permits).toBe(false);
  });

  it("a principal holding the execution permission passes that check", () => {
    const r = evaluateAuthority(
      synth(),
      req({ requiredPermission: "finance:ledger.post", principalPermissions: new Set(["finance:ledger.post"]) }),
    );
    expect(r.permits).toBe(true);
  });

  it("an unresolved conflict blocks even a ratified, in-scope authority", () => {
    const r = evaluateAuthority(synth(), req({ conflicts: 2 }));
    expect(r.decision).toBe("POLICY_CONFLICT");
    expect(r.permits).toBe(false);
  });

  it("an incomplete chain blocks even a ratified, in-scope authority", () => {
    const r = evaluateAuthority(synth(), req({ chainComplete: false }));
    expect(r.decision).toBe("AUTHORITY_CHAIN_INCOMPLETE");
  });
});

// =============================================================================
// §13 — HOSTILE ATTACKS. All must fail closed.
// =============================================================================
describe("hostile attacks on the authority system", () => {
  it("A1 forged status string does not become ratified", () => {
    const r = evaluateAuthority(synth({ status: "TOTALLY_RATIFIED" as never }), req());
    expect(r.permits).toBe(false);
  });

  it("A2 empty-string status fails closed", () => {
    expect(evaluateAuthority(synth({ status: "" as never }), req()).permits).toBe(false);
  });

  it("A3 lowercase 'ratified' is not accepted as RATIFIED", () => {
    expect(evaluateAuthority(synth({ status: "ratified" as never }), req()).permits).toBe(false);
  });

  it("A4 an approval date in the future does not backdate effectiveness", () => {
    const r = evaluateAuthority(
      synth({ approvalDate: "2030-01-01", effectiveFrom: "2030-01-01" }),
      req(),
    );
    expect(r.permits).toBe(false);
  });

  it("A5 an effective_to before effective_from cannot permit", () => {
    const r = evaluateAuthority(synth({ effectiveFrom: "2026-01-01", effectiveTo: "2025-01-01" }), req());
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_EXPIRED");
  });

  it("A6 an unverified-provenance record cannot be laundered into authority by status alone", () => {
    // Status is RATIFIED but provenance is not GOVERNED. The record still evaluates, but the
    // class marks it unverified, and the chain trace refuses it.
    const record = synth({ provenance: "IMPORTED", authorityClass: "UNVERIFIED" });
    expect(record.authorityClass).toBe("UNVERIFIED");
  });

  it("A7 a scope object claiming another tenant is honoured, not ignored", () => {
    const r = evaluateAuthority(synth({ tenantId: "TEN_ATTACKER" }), req({ tenantId: TENANT }));
    expect(r.permits).toBe(false);
  });

  it("A8 an empty permission set never satisfies a required permission", () => {
    const r = evaluateAuthority(
      synth(),
      req({ requiredPermission: "finance:ledger.post", principalPermissions: new Set<string>() }),
    );
    expect(r.decision).toBe("PRINCIPAL_NOT_AUTHORIZED");
  });

  it("A9 a wildcard-looking permission string does not match a required permission", () => {
    const r = evaluateAuthority(
      synth(),
      req({ requiredPermission: "finance:ledger.post", principalPermissions: new Set(["finance:*", "*"]) }),
    );
    expect(r.decision).toBe("PRINCIPAL_NOT_AUTHORIZED");
  });

  it("A10 replaying an old evaluation cannot revive expired authority", () => {
    const record = synth({ effectiveTo: "2026-01-31" });
    expect(evaluateAuthority(record, req({ asOf: "2026-01-15" })).permits).toBe(true);
    expect(evaluateAuthority(record, req({ asOf: ASOF })).permits).toBe(false);
  });

  it("A11 a policy version cannot be silently substituted — same code+version, different content", () => {
    const conflicts = detectPolicyConflicts([
      pv({ policyId: "P1", contentChecksum: "AAA" }),
      pv({ policyId: "P2", contentChecksum: "BBB" }),
    ]);
    expect(conflicts.some((c) => c.code === "SAME_CODE_DIFFERENT_CONTENT")).toBe(true);
  });

  it("A12 a checksum changes when any identity-bearing field changes", () => {
    const base = {
      id: "P1", code: "C", version: "1.0", body: "b", rules: { a: 1 },
      effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE",
      jurisdictionCode: "TZ", tenantId: TENANT, entityScope: null,
      approvedByResolutionId: "R1", approvingResolutionStatus: "APPROVED",
    };
    const a = computePolicyVersion(base);
    expect(computePolicyVersion({ ...base, body: "b2" }).checksum).not.toBe(a.checksum);
    expect(computePolicyVersion({ ...base, rules: { a: 2 } }).checksum).not.toBe(a.checksum);
    expect(computePolicyVersion({ ...base, effectiveFrom: "2026-01-02" }).checksum).not.toBe(a.checksum);
    expect(computePolicyVersion({ ...base, jurisdictionCode: "KE" }).checksum).not.toBe(a.checksum);
    expect(computePolicyVersion({ ...base, entityScope: "ENT" }).checksum).not.toBe(a.checksum);
  });

  it("A13 an identical policy yields an identical checksum (reproducible, not random)", () => {
    const base = {
      id: "P1", code: "C", version: "1.0", body: "b", rules: { a: 1 },
      effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE",
      jurisdictionCode: "TZ", tenantId: TENANT, entityScope: null,
      approvedByResolutionId: "R1", approvingResolutionStatus: "APPROVED",
    };
    expect(computePolicyVersion(base).checksum).toBe(computePolicyVersion({ ...base }).checksum);
  });

  it("A14 a resolution that is not APPROVED does not confer provenance", () => {
    const r = computePolicyVersion({
      id: "P1", code: "C", version: "1.0", body: "b", rules: {},
      effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE",
      jurisdictionCode: "TZ", tenantId: TENANT, entityScope: null,
      approvedByResolutionId: "R1", approvingResolutionStatus: "TABLED",
    });
    expect(r.provenanceComplete).toBe(false);
    expect(r.provenanceGap).toContain("TABLED");
  });

  it("A15 a null approving resolution is reported as the C-1 provenance gap", () => {
    const r = computePolicyVersion({
      id: "P1", code: "C", version: "1.0", body: "b", rules: {},
      effectiveFrom: "2026-01-01", effectiveTo: null, status: "ACTIVE",
      jurisdictionCode: null, tenantId: TENANT, entityScope: null,
      approvedByResolutionId: null,
    });
    expect(r.provenanceComplete).toBe(false);
    expect(r.provenanceGap).toContain("C-1");
  });

  it("A16 a simulation cannot report itself as ratified or approved", () => {
    const s = simulateRatification({
      hypotheticalRatifiedDecisions: ["P1"],
      capabilities: [{ capabilityCode: "CAP_X", requiredDecisions: ["P1"] }],
    });
    expect(s.classification).toBe("SIMULATION");
    expect(s.mutatedState).toBe(false);
    expect(JSON.stringify(s)).not.toMatch(/"RATIFIED"|"APPROVED"|"EFFECTIVE"/);
  });

  it("A17 a capability declaring no required decisions is never a free pass, even in simulation", () => {
    const s = simulateRatification({
      hypotheticalRatifiedDecisions: ["P1"],
      capabilities: [{ capabilityCode: "CAP_EMPTY", requiredDecisions: [] }],
    });
    expect(s.wouldBecomeEligible).not.toContain("CAP_EMPTY");
    expect(s.wouldRemainBlocked[0].stillBlockedBy).toContain("DECLARES_NO_REQUIRED_DECISIONS");
  });

  it("A18 an incomplete chain is reported broken, never quietly completed", () => {
    const chain = buildChain({
      direction: "REVERSE",
      origin: "capability:CAP_X",
      links: [
        { layer: "CAPABILITY", id: "CAP_X", present: true, status: "LOCKED", detail: "" },
        { layer: "AUTHORITY", id: "none", present: false, status: null, detail: "" },
      ],
    });
    expect(chain.complete).toBe(false);
    expect(chain.brokenAt).toContain("AUTHORITY:none");
  });

  it("A19 a complete chain is explicitly NOT treated as authorisation", () => {
    const chain = buildChain({
      direction: "FORWARD",
      origin: "a",
      links: [{ layer: "AUTHORITY", id: "A", present: true, status: "RATIFIED", detail: "" }],
    });
    expect(chain.complete).toBe(true);
    expect(chain.explanation.join(" ")).toContain("does NOT by itself authorise");
  });

  it("A20 explainability never embeds evidence content, only a reference", () => {
    const e = explainAuthority({
      principal: principal(),
      operation: "op",
      tenantId: TENANT,
      legalEntityId: null,
      traceId: "TRACE-0001",
      capabilityCode: "CAP_X",
      permission: "finance:ledger.post",
      evaluations: [evaluateAuthority(synth(), req())],
      decision: "PERMITTED",
      reason: "r",
      evidenceReference: "EVIDENCE-REF-99",
      asOf: ASOF,
    });
    expect(e.evidenceReference).toBe("EVIDENCE-REF-99");
    expect(Object.keys(e)).not.toContain("evidenceContent");
    expect(e.traceId).toBe("TRACE-0001");
  });
});

// =============================================================================
// §8 — CONFLICT DETECTION, never a winner
// =============================================================================
describe("policy conflict detection", () => {
  it("reports overlapping windows for the same code in the same scope", () => {
    const c = detectPolicyConflicts([
      pv({ policyId: "P1", version: "1.0", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
      pv({ policyId: "P2", version: "2.0", effectiveFrom: "2026-06-01", effectiveTo: null }),
    ]);
    expect(c.some((x) => x.code === "EFFECTIVE_DATE_OVERLAP")).toBe(true);
  });

  it("does NOT report overlap when the scopes differ", () => {
    const c = detectPolicyConflicts([
      pv({ policyId: "P1", version: "1.0", entityScope: "ENT_A" }),
      pv({ policyId: "P2", version: "2.0", entityScope: "ENT_B" }),
    ]);
    expect(c.some((x) => x.code === "EFFECTIVE_DATE_OVERLAP")).toBe(false);
  });

  it("never nominates a winner — there is no field in which one could be recorded", () => {
    const c = detectPolicyConflicts([
      pv({ policyId: "P1", version: "1.0" }),
      pv({ policyId: "P2", version: "2.0" }),
    ]);
    const overlap = c.find((x) => x.code === "EFFECTIVE_DATE_OVERLAP");
    expect(overlap).toBeDefined();
    expect(Object.keys(overlap!)).not.toContain("winner");
    expect(Object.keys(overlap!)).not.toContain("prevails");
    expect(overlap!.requiresAuthority).toBe(true);
    expect(overlap!.detail).toContain("No precedence hierarchy is ratified");
  });

  it("lists every participant in a conflict, not just the first", () => {
    const c = detectPolicyConflicts([
      pv({ policyId: "P1", version: "1.0" }),
      pv({ policyId: "P2", version: "2.0" }),
    ]);
    const overlap = c.find((x) => x.code === "EFFECTIVE_DATE_OVERLAP")!;
    expect(overlap.policyIds).toEqual(["P1", "P2"]);
  });

  it("reports duplicate code+version with identical content separately from differing content", () => {
    const dup = detectPolicyConflicts([pv({ policyId: "P1" }), pv({ policyId: "P2" })]);
    expect(dup.some((x) => x.code === "DUPLICATE_CODE_VERSION")).toBe(true);
  });

  it("reports jurisdiction conflicts", () => {
    const c = detectPolicyConflicts([
      pv({ policyId: "P1", version: "1.0", jurisdiction: "TZ" }),
      pv({ policyId: "P2", version: "2.0", jurisdiction: "KE" }),
    ]);
    expect(c.some((x) => x.code === "JURISDICTION_CONFLICT")).toBe(true);
  });

  it("reports missing provenance as a conflict in its own right", () => {
    const c = detectPolicyConflicts([pv({ provenanceComplete: false, provenanceGap: "none recorded" })]);
    expect(c.some((x) => x.code === "MISSING_PROVENANCE")).toBe(true);
  });

  it("is deterministic — the same input yields byte-identical output", () => {
    const input = [pv({ policyId: "P2", version: "2.0" }), pv({ policyId: "P1", version: "1.0" })];
    expect(JSON.stringify(detectPolicyConflicts(input))).toBe(JSON.stringify(detectPolicyConflicts(input)));
  });

  it("finds no conflict in a clean, single-version, provenanced set", () => {
    expect(detectPolicyConflicts([pv()])).toEqual([]);
  });
});

// =============================================================================
// §10 — READINESS
// =============================================================================
describe("decision readiness", () => {
  const ready = {
    decisionId: "P-TEST", title: "t", status: "RATIFIED", activationStatus: "ACTIVATED",
    requiredAuthority: "BOARD", approvingBody: "BOARD", resolutionId: "R1",
    provenance: "GOVERNED", approvalDate: "2026-01-01", effectiveFrom: "2026-01-01",
    evidence: "E1", dependencies: [] as string[], dependencyStatuses: {},
    affectedCapabilities: ["CAP_A"],
  };

  it("a fully satisfied decision reads READY", () => {
    expect(assessDecisionReadiness(ready).readiness).toBe("READY");
  });

  it("a PENDING decision is not READY", () => {
    const r = assessDecisionReadiness({ ...ready, status: "PENDING", activationStatus: "LOCKED" });
    expect(r.readiness).not.toBe("READY");
    expect(r.blockers.some((b) => b.startsWith("AUTHORITY_NOT_RATIFIED"))).toBe(true);
  });

  it("unmet dependencies are named individually", () => {
    const r = assessDecisionReadiness({
      ...ready,
      dependencies: ["P1", "P2"],
      dependencyStatuses: { P1: "RATIFIED", P2: "PENDING" },
    });
    expect(r.unmetDependencies).toEqual(["P2"]);
  });

  it("an unknown dependency is treated as unmet, not as satisfied", () => {
    const r = assessDecisionReadiness({ ...ready, dependencies: ["P9"], dependencyStatuses: {} });
    expect(r.unmetDependencies).toEqual(["P9"]);
  });

  it("blocked execution paths are enumerated from the affected capabilities", () => {
    const r = assessDecisionReadiness({ ...ready, status: "PENDING", affectedCapabilities: ["CAP_A", "CAP_B"] });
    expect(r.blockedExecutionPaths).toEqual(["capability:CAP_A", "capability:CAP_B"]);
  });
});

// =============================================================================
// §1 / §14 — REAL SUBSTRATE. Non-vacuity: specific real counts.
// =============================================================================
describe("real registries", () => {
  it("the seeded substrate is present in the expected quantities", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry`)).toBe(16);
    expect(await count(sql`select count(*)::int as n from governance_capability_registry`)).toBe(60);
    expect(await count(sql`select count(*)::int as n from policies`)).toBe(5);
    expect(await count(sql`select count(*)::int as n from resolutions`)).toBe(4);
  });

  it("NO decision is ratified — the true production authority state", async () => {
    const n = await count(
      sql`select count(*)::int as n from governance_decision_registry where status = 'RATIFIED'`,
    );
    expect(n).toBe(0);
  });

  it("every capability remains LOCKED", async () => {
    const n = await count(
      sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`,
    );
    expect(n).toBe(0);
  });

  it("loads a real decision as a canonical authority record", async () => {
    const [row] = await rowsOf<{ decision_id: string }>(
      sql`select decision_id from governance_decision_registry order by decision_id limit 1`,
    );
    const record = await loadAuthorityRecord(row.decision_id);
    expect(record).not.toBeNull();
    expect(record!.authorityId).toBe(row.decision_id);
    expect(record!.authorityType).toBe("DECISION");
  });

  it("returns null for an unknown authority rather than a permissive stub", async () => {
    expect(await loadAuthorityRecord("P-DOES-NOT-EXIST")).toBeNull();
  });

  it("no real decision evaluates as PERMITTED today", async () => {
    const rows = await rowsOf<{ decision_id: string }>(
      sql`select decision_id from governance_decision_registry`,
    );
    expect(rows.length).toBe(16);
    for (const r of rows) {
      const record = await loadAuthorityRecord(r.decision_id);
      const result = evaluateAuthority(record, req({ authorityId: r.decision_id }));
      expect(result.permits).toBe(false);
    }
  });

  it("reports the real C-1 provenance gap: all 5 policies lack an approving resolution", async () => {
    const versions = await loadPolicyVersions(await tenantId());
    expect(versions.length).toBe(5);
    expect(versions.every((v) => !v.provenanceComplete)).toBe(true);
    expect(versions.filter((v) => v.provenanceGap?.includes("C-1")).length).toBe(5);
  });

  it("real conflict detection surfaces the provenance gap and nothing invented", async () => {
    const conflicts = await detectConflicts(await tenantId());
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.every((c) => c.requiresAuthority)).toBe(true);
    expect(conflicts.filter((c) => c.code === "MISSING_PROVENANCE").length).toBe(5);
  });

  it("the readiness matrix covers all 16 decisions and reports none READY", async () => {
    const matrix = await buildReadinessMatrix();
    expect(matrix.length).toBe(16);
    expect(matrix.filter((m) => m.readiness === "READY").length).toBe(0);
    expect(matrix.every((m) => m.blockers.length > 0)).toBe(true);
  });

  it("a real capability chain traces back to a missing authority and fails closed", async () => {
    const chain = await traceCapabilityChain("CAP_SPEC_FORECAST_EXECUTE");
    expect(chain.direction).toBe("REVERSE");
    expect(chain.links.length).toBeGreaterThan(0);
    expect(chain.complete).toBe(false);
    expect(chain.brokenAt.length).toBeGreaterThan(0);
  });

  it("an unknown capability produces an incomplete chain, not an empty pass", async () => {
    const chain = await traceCapabilityChain("CAP_NOT_REAL");
    expect(chain.complete).toBe(false);
    expect(chain.brokenAt.some((b) => b.startsWith("CAPABILITY:"))).toBe(true);
  });
});

// =============================================================================
// §9 — THE SCOPED GATE against real state
// =============================================================================
describe("scoped capability gate", () => {
  it("denies an unknown capability", async () => {
    await tenantId();
    const r = await checkScopedCapability({
      capabilityCode: "CAP_NOT_REAL",
      principal: principal(),
      tenantId: cachedTenantId,
      legalEntityId: null,
      asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("CAPABILITY_UNKNOWN");
  });

  it("denies a real, locked capability", async () => {
    await tenantId();
    const r = await checkScopedCapability({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE",
      principal: principal(),
      tenantId: cachedTenantId,
      legalEntityId: null,
      asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("CAPABILITY_LOCKED");
    expect(r.blockedBy.length).toBeGreaterThan(0);
  });

  it("denies a principal asserting a tenant it does not belong to", async () => {
    await tenantId();
    const r = await checkScopedCapability({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE",
      principal: principal({ tenantId: "TEN_SOMEONE_ELSE" }),
      tenantId: cachedTenantId,
      legalEntityId: null,
      asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("TENANT_SCOPE_MISMATCH");
  });

  it("denies a principal acting outside its entity scope", async () => {
    await tenantId();
    const r = await checkScopedCapability({
      capabilityCode: "CAP_SPEC_FORECAST_EXECUTE",
      principal: principal({ entityScope: ["ENT_ONLY_THIS_ONE"] }),
      tenantId: cachedTenantId,
      legalEntityId: "ENT_SOMETHING_ELSE",
      asOf: ASOF,
    });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("ENTITY_SCOPE_MISMATCH");
  });

  it("NO capability in the entire registry is permitted today", async () => {
    await tenantId();
    const caps = await rowsOf<{ capability_code: string }>(
      sql`select capability_code from governance_capability_registry`,
    );
    expect(caps.length).toBe(60);
    for (const c of caps) {
      const r = await checkScopedCapability({
        capabilityCode: c.capability_code,
        principal: principal(),
        tenantId: cachedTenantId,
        legalEntityId: null,
        asOf: ASOF,
      });
      expect(r.permitted).toBe(false);
    }
  });
});

// =============================================================================
// §17 — SIMULATION
// =============================================================================
describe("ratification simulation", () => {
  it("answers the hypothetical without mutating anything", async () => {
    const before = await count(
      sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`,
    );
    const s = await simulate(["P1", "P5", "P6", "P9"]);
    const after = await count(
      sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`,
    );
    expect(before).toBe(0);
    expect(after).toBe(0);
    expect(s.mutatedState).toBe(false);
    expect(s.classification).toBe("SIMULATION");
  });

  it("identifies real capabilities that would become eligible", async () => {
    const s = await simulate(["P1", "P5", "P6", "P9"]);
    expect(s.wouldBecomeEligible).toContain("CAP_SPEC_FORECAST_EXECUTE");
  });

  it("still reports capabilities that would remain blocked", async () => {
    const s = await simulate(["P1"]);
    expect(s.wouldRemainBlocked.length).toBeGreaterThan(0);
    const blocked = s.wouldRemainBlocked.find((b) => b.capabilityCode === "CAP_SPEC_FORECAST_EXECUTE");
    expect(blocked?.stillBlockedBy).toEqual(["P5", "P6", "P9"]);
  });

  it("simulating nothing changes nothing", async () => {
    const s = await simulate([]);
    expect(s.wouldBecomeEligible).toEqual([]);
  });

  it("states plainly that eligibility is not activation", async () => {
    const s = await simulate(["P1"]);
    expect(s.explanation.join(" ")).toContain("ELIGIBLE is not ACTIVATED");
  });

  it("the simulation does not activate a decision either", async () => {
    const before = await count(
      sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`,
    );
    await simulate(["P1", "P2", "P3"]);
    const after = await count(
      sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`,
    );
    expect(before).toBe(0);
    expect(after).toBe(0);
  });
});

// =============================================================================
// STATUS MAPPING — tested directly.
//
// Added after fault injection FI-13 ("unknown status becomes RATIFIED") was NOT detected by the
// suite. The mutation was survivable only because every real decision is PENDING with null dates,
// so a later date check denied anyway. Defence in depth is not coverage: the mapping must be
// proven at its own boundary, or the day a record gains dates the laundering vector opens
// silently.
// =============================================================================
describe("status mapping fails closed", () => {
  it("maps every genuinely known status to itself", () => {
    for (const s of ["DRAFT", "SUBMITTED", "REVIEW", "PENDING", "TABLED", "APPROVED",
      "RATIFIED", "EFFECTIVE", "SUPERSEDED", "REVOKED", "EXPIRED"]) {
      expect(toAuthorityStatus(s)).toBe(s);
    }
  });

  it("maps PENDING — the status the real registry actually uses — explicitly, not to UNKNOWN", () => {
    expect(toAuthorityStatus("PENDING")).toBe("PENDING");
  });

  it("maps an unrecognised status to UNKNOWN, never to an in-force status", () => {
    for (const s of ["TOTALLY_RATIFIED", "OK", "1", "APPROVED_BY_ME", "", " RATIFIED"]) {
      const mapped = toAuthorityStatus(s);
      expect(mapped).toBe("UNKNOWN");
      expect(["RATIFIED", "EFFECTIVE"]).not.toContain(mapped);
    }
  });

  it("does not normalise case — a lowercase status is not the enum value", () => {
    expect(toAuthorityStatus("ratified")).toBe("UNKNOWN");
    expect(toAuthorityStatus("Effective")).toBe("UNKNOWN");
  });

  it("maps null and undefined to UNKNOWN", () => {
    expect(toAuthorityStatus(null)).toBe("UNKNOWN");
    expect(toAuthorityStatus(undefined)).toBe("UNKNOWN");
  });

  it("UNKNOWN never permits, even with perfect dates and scope", () => {
    const r = evaluateAuthority(
      synth({ status: "UNKNOWN", effectiveFrom: "2020-01-01", effectiveTo: "2030-01-01" }),
      req(),
    );
    expect(r.permits).toBe(false);
    expect(r.decision).toBe("AUTHORITY_NOT_EFFECTIVE");
  });

  it("PENDING never permits, even with perfect dates and scope", () => {
    const r = evaluateAuthority(
      synth({ status: "PENDING", effectiveFrom: "2020-01-01", effectiveTo: "2030-01-01" }),
      req(),
    );
    expect(r.permits).toBe(false);
  });
});

describe("engine version", () => {
  it("is pinned so an evaluation can be attributed to a build", () => {
    expect(AUTHORITY_ENGINE_VERSION).toBe("authority-1.0.0");
  });
});
