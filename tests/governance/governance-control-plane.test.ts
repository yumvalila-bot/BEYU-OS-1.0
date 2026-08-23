/**
 * PHASE 8 — Governance control plane: reserved matters, delegation, exceptions, escalation.
 *
 * Each module here closes a gap where governance could be bypassed without anything failing:
 *
 *   RESERVED MATTERS  14 ratified matters were stored as JSON that nothing resolved. A capital
 *                     allocation of 5,000,000 could be labelled CAPITAL instead of
 *                     RESERVED_MATTER and sail past the only existing check.
 *   DELEGATION        the table existed and was empty, with no engine — so nobody could prove a
 *                     delegation exceeding the issuer's authority would be refused.
 *   EXCEPTIONS        no framework at all, so any real deviation had to be handled by editing the
 *                     policy, destroying the record that it ever said otherwise.
 *   ESCALATION        blocked operations had no deterministic state.
 *
 * NON-VACUITY. Real-substrate assertions use exact counts (6 bodies, 14 matters, 12 articles,
 * 0 delegations). Where no ratified authority exists, positive controls use clearly-labelled
 * SYNTHETIC fixtures that are never persisted.
 */
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  MATTER_TRIGGER,
  RESERVED_MATTER_VERSION,
  checkBodyCompetence,
  mattersTriggeredBy,
  parseMatter,
  requiresReservedMatterTreatment,
  reservedMatterRegistry,
} from "@/lib/governance/reserved-matters";
import {
  DELEGATION_VERSION,
  MAX_DELEGATION_DEPTH,
  NON_DELEGABLE_SCOPES,
  checkDelegable,
  checkDelegationBounds,
  determineEscalation,
  evaluateDelegationRecord,
  resolveDelegation,
  validateProposedDelegation,
} from "@/lib/governance/delegation";
import {
  EXCEPTION_VERSION,
  MAX_EMERGENCY_DAYS,
  applyException,
  assertPolicyUnmodified,
  detectEmergencyAbuse,
  evaluateException,
  lapsedExceptions,
  type GovernanceException,
} from "@/lib/governance/exceptions";
import {
  GOVERNANCE_LAYERS,
  assessLayer,
  governanceMatrix,
  governanceSummary,
} from "@/lib/governance/maturity";

const ASOF = "2026-02-15";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

let boardId = "";
let icId = "";
let taxId = "";
async function bodyIds() {
  if (!boardId) {
    const rows = await rowsOf<{ id: string; code: string }>(
      sql`select id, code from governance_bodies`,
    );
    boardId = rows.find((r) => r.code === "GROUP_BOARD")!.id;
    icId = rows.find((r) => r.code === "INVESTMENT_COMMITTEE")!.id;
    taxId = rows.find((r) => r.code === "TAX_GOVERNANCE_COMMITTEE")!.id;
  }
}

/** SYNTHETIC exception fixture. Never persisted. */
const synthEx = (over: Partial<GovernanceException> = {}): GovernanceException => ({
  exceptionId: "SYNTHETIC-EX-001",
  kind: "TEMPORARY_EXCEPTION",
  policyId: "POL-1",
  policyVersion: "1.0",
  ownerUserId: "USR_SYNTH",
  approvedByResolutionId: "SYNTHETIC-RES-1",
  approvedByBody: "GROUP_BOARD",
  rationale: "A clearly-labelled synthetic rationale for testing the exception framework.",
  evidenceReference: "SYNTH-EVIDENCE-1",
  tenantId: null,
  legalEntityId: null,
  effectiveFrom: "2026-01-01",
  effectiveTo: "2026-06-30",
  revokedAt: null,
  traceId: "TRACE-EX-0001",
  ...over,
});

// =============================================================================
// RESERVED MATTERS
// =============================================================================
describe("reserved matter parsing", () => {
  it("parses the real threshold matters from the ratified strings", () => {
    expect(parseMatter("CAPITAL>1M")).toMatchObject({
      trigger: "CAPITAL_ALLOCATION", threshold: 1_000_000, parseable: true,
    });
    expect(parseMatter("CAPITAL>250K")).toMatchObject({
      trigger: "CAPITAL_ALLOCATION", threshold: 250_000, parseable: true,
    });
  });

  it("parses every categorical matter actually in the database", async () => {
    const registry = await reservedMatterRegistry();
    const all = registry.flatMap((b) => b.matters);
    expect(all.length).toBe(14);
    expect(all.every((m) => m.parseable)).toBe(true);
  });

  it("an unreadable matter engages EVERYTHING rather than being ignored", () => {
    const p = parseMatter("SOMETHING_NOBODY_PARSED");
    expect(p.parseable).toBe(false);
    const { triggered } = mattersTriggeredBy({
      reservedMatters: ["SOMETHING_NOBODY_PARSED"], trigger: "CAPITAL_ALLOCATION", amount: 1,
    });
    expect(triggered.length).toBe(1);
  });

  it("a threshold matter engages at and above the threshold", () => {
    const at = mattersTriggeredBy({ reservedMatters: ["CAPITAL>1M"], trigger: "CAPITAL_ALLOCATION", amount: 1_000_000 });
    const above = mattersTriggeredBy({ reservedMatters: ["CAPITAL>1M"], trigger: "CAPITAL_ALLOCATION", amount: 5_000_000 });
    const below = mattersTriggeredBy({ reservedMatters: ["CAPITAL>1M"], trigger: "CAPITAL_ALLOCATION", amount: 999_999 });
    expect(at.triggered.length).toBe(1);
    expect(above.triggered.length).toBe(1);
    expect(below.triggered.length).toBe(0);
  });

  it("omitting the amount does NOT escape a monetary reservation", () => {
    const r = mattersTriggeredBy({ reservedMatters: ["CAPITAL>1M"], trigger: "CAPITAL_ALLOCATION", amount: null });
    expect(r.triggered.length).toBe(1);
  });

  it("a different trigger does not engage a capital matter", () => {
    expect(mattersTriggeredBy({
      reservedMatters: ["CAPITAL>1M"], trigger: "SUCCESSION", amount: 5_000_000,
    }).triggered.length).toBe(0);
  });
});

describe("body competence and bypass detection", () => {
  it("POSITIVE CONTROL: the Board is competent for a large capital allocation", async () => {
    await bodyIds();
    const r = await checkBodyCompetence({ bodyId: boardId, trigger: "CAPITAL_ALLOCATION", amount: 5_000_000 });
    expect(r.competent).toBe(true);
    expect(r.triggeredMatters).toContain("CAPITAL>1M");
  });

  it("POSITIVE CONTROL: the IC is competent at its own lower threshold", async () => {
    await bodyIds();
    const r = await checkBodyCompetence({ bodyId: icId, trigger: "CAPITAL_ALLOCATION", amount: 300_000 });
    expect(r.competent).toBe(true);
    expect(r.triggeredMatters).toContain("CAPITAL>250K");
  });

  it("detects routing a reserved matter to a non-competent body", async () => {
    await bodyIds();
    // The Tax Committee reserves only AGGRESSIVE_TAX_POSITION — it cannot decide capital.
    const r = await checkBodyCompetence({ bodyId: taxId, trigger: "CAPITAL_ALLOCATION", amount: 5_000_000 });
    expect(r.competent).toBe(false);
    expect(r.decision).toBe("RESERVED_MATTER_BYPASS");
    expect(r.competentBodies).toContain("GROUP_BOARD");
  });

  it("an operation no body reserves is NOT_RESERVED, not a bypass", async () => {
    await bodyIds();
    const r = await checkBodyCompetence({ bodyId: taxId, trigger: "CAPITAL_ALLOCATION", amount: 100 });
    expect(r.decision).toBe("NOT_RESERVED");
  });

  it("a nonexistent body is refused, not assumed competent", async () => {
    const r = await checkBodyCompetence({ bodyId: "BODY_NOPE", trigger: "SUCCESSION" });
    expect(r.competent).toBe(false);
    expect(r.decision).toBe("BODY_NOT_FOUND");
  });

  it("THE CENTRAL BYPASS: a reserved matter cannot be relabelled as ordinary business", async () => {
    const r = await requiresReservedMatterTreatment({
      trigger: "CAPITAL_ALLOCATION", amount: 5_000_000, declaredCategory: "CAPITAL",
    });
    expect(r.required).toBe(true);
    expect(r.correctlyCategorised).toBe(false);
    expect(r.decision).toBe("MISCATEGORISED_RESERVED_MATTER");
  });

  it("POSITIVE CONTROL: correctly categorised passes", async () => {
    const r = await requiresReservedMatterTreatment({
      trigger: "CAPITAL_ALLOCATION", amount: 5_000_000, declaredCategory: "RESERVED_MATTER",
    });
    expect(r.decision).toBe("PERMITTED");
    expect(r.competentBodies).toContain("GROUP_BOARD");
  });

  it("every trigger is decided explicitly", async () => {
    for (const t of MATTER_TRIGGER) {
      const r = await requiresReservedMatterTreatment({ trigger: t, declaredCategory: "OTHER" });
      expect(["PERMITTED", "MISCATEGORISED_RESERVED_MATTER", "NOT_RESERVED"]).toContain(r.decision);
    }
  });

  it("the real registry holds 6 bodies and 14 matters", async () => {
    const r = await reservedMatterRegistry();
    expect(r.length).toBe(6);
    expect(r.flatMap((b) => b.matters).length).toBe(14);
  });
});

// =============================================================================
// DELEGATION
// =============================================================================
describe("delegation cannot exceed issuer authority", () => {
  it("refuses a delegation larger than the issuer's own limit", () => {
    const r = checkDelegationBounds({ issuerLimit: "100000", requestedLimit: "500000" });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("EXCEEDS_ISSUER_AUTHORITY");
    expect(r.reason).toContain("may delegate authority they do not hold");
  });

  it("POSITIVE CONTROL: a delegation within the issuer's limit is permitted", () => {
    expect(checkDelegationBounds({ issuerLimit: "100000", requestedLimit: "50000" }).permitted).toBe(true);
  });

  it("an equal limit is permitted", () => {
    expect(checkDelegationBounds({ issuerLimit: "100000", requestedLimit: "100000" }).permitted).toBe(true);
  });

  it("an UNBOUNDED delegation from a bounded issuer is refused", () => {
    const r = checkDelegationBounds({ issuerLimit: "100000", requestedLimit: null });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("EXCEEDS_ISSUER_AUTHORITY");
  });

  it("an issuer with no recorded limit cannot delegate — absence is not unlimited", () => {
    const r = checkDelegationBounds({ issuerLimit: null, requestedLimit: "1" });
    expect(r.permitted).toBe(false);
    expect(r.decision).toBe("NO_ISSUER_LIMIT");
  });
});

describe("non-delegable powers", () => {
  it("refuses every non-delegable scope", () => {
    for (const s of NON_DELEGABLE_SCOPES) {
      expect(checkDelegable(s).delegable).toBe(false);
    }
  });

  it("refuses a scope that merely contains a non-delegable power", () => {
    expect(checkDelegable("APPROVE_RESERVED_MATTER_CAPITAL").delegable).toBe(false);
  });

  it("POSITIVE CONTROL: an ordinary operational scope is delegable", () => {
    expect(checkDelegable("APPROVE_INVOICE").delegable).toBe(true);
  });

  it("delegation of authority-delegation itself is refused", () => {
    expect(checkDelegable("AUTHORITY_DELEGATION").delegable).toBe(false);
  });
});

describe("proposed delegation validation", () => {
  const base = {
    fromUserId: "U1", toUserId: "U2", fromTenantId: "TEN_A", toTenantId: "TEN_A",
    scope: "APPROVE_INVOICE", issuerLimit: "100000", requestedLimit: "50000",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31",
  };

  it("POSITIVE CONTROL: a well-formed delegation is valid", () => {
    expect(validateProposedDelegation(base).permitted).toBe(true);
  });

  it("refuses self-delegation", () => {
    const r = validateProposedDelegation({ ...base, toUserId: "U1" });
    expect(r.decision).toBe("SELF_DELEGATION");
  });

  it("refuses cross-tenant delegation", () => {
    expect(validateProposedDelegation({ ...base, toTenantId: "TEN_B" }).decision).toBe("CROSS_TENANT");
  });

  it("refuses an over-broad delegation", () => {
    expect(validateProposedDelegation({ ...base, requestedLimit: "999999" }).decision)
      .toBe("EXCEEDS_ISSUER_AUTHORITY");
  });

  it("refuses delegation of a non-delegable power", () => {
    expect(validateProposedDelegation({ ...base, scope: "SUCCESSION" }).decision).toBe("NON_DELEGABLE");
  });

  it("refuses a chain deeper than the limit", () => {
    const r = validateProposedDelegation({ ...base, existingChainDepth: MAX_DELEGATION_DEPTH });
    expect(r.decision).toBe("CHAIN_TOO_DEEP");
  });

  it("refuses an inverted date window", () => {
    expect(validateProposedDelegation({ ...base, effectiveTo: "2025-01-01" }).decision).toBe("EXPIRED");
  });
});

describe("existing delegation evaluation", () => {
  const rec = (over: Record<string, unknown> = {}) => ({
    id: "DEL-1", fromUserId: "U1", toUserId: "U2", tenantId: "TEN_A",
    scope: "APPROVE_INVOICE", monetaryLimit: "50000",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", revokedAt: null, ...over,
  });

  it("POSITIVE CONTROL: an active in-scope delegation is valid", () => {
    const r = evaluateDelegationRecord(rec(), { asOf: ASOF, tenantId: "TEN_A", amount: 10_000 });
    expect(r.valid).toBe(true);
  });

  it("a REVOKED delegation inside its window still cannot act", () => {
    const r = evaluateDelegationRecord(rec({ revokedAt: "2026-02-01" }), { asOf: ASOF, tenantId: "TEN_A" });
    expect(r.valid).toBe(false);
    expect(r.decision).toBe("REVOKED");
  });

  it("an expired delegation cannot act", () => {
    const r = evaluateDelegationRecord(rec({ effectiveTo: "2026-01-31" }), { asOf: ASOF, tenantId: "TEN_A" });
    expect(r.decision).toBe("EXPIRED");
  });

  it("a future delegation does not act early", () => {
    const r = evaluateDelegationRecord(rec({ effectiveFrom: "2026-06-01" }), { asOf: ASOF, tenantId: "TEN_A" });
    expect(r.decision).toBe("NOT_YET_EFFECTIVE");
  });

  it("a delegation from another tenant does not apply", () => {
    expect(evaluateDelegationRecord(rec(), { asOf: ASOF, tenantId: "TEN_B" }).decision).toBe("CROSS_TENANT");
  });

  it("an amount above the delegated limit is refused", () => {
    const r = evaluateDelegationRecord(rec(), { asOf: ASOF, tenantId: "TEN_A", amount: 60_000 });
    expect(r.decision).toBe("SCOPE_EXCEEDED");
  });

  it("an unlimited delegation cannot cover a stated amount", () => {
    const r = evaluateDelegationRecord(rec({ monetaryLimit: null }), { asOf: ASOF, tenantId: "TEN_A", amount: 1 });
    expect(r.decision).toBe("SCOPE_EXCEEDED");
  });

  it("a missing delegation is NOT_FOUND, never a pass", () => {
    expect(evaluateDelegationRecord(null, { asOf: ASOF, tenantId: "TEN_A" }).valid).toBe(false);
  });

  it("the real delegations table is empty, so nobody holds delegated authority", async () => {
    expect(await count(sql`select count(*)::int as n from delegations`)).toBe(0);
    const r = await resolveDelegation({ toUserId: "USR_ANY", tenantId: "TEN_BEYU_GROUP", asOf: ASOF });
    expect(r.valid).toBe(false);
    expect(r.decision).toBe("NOT_FOUND");
  });
});

// =============================================================================
// EXCEPTIONS
// =============================================================================
describe("policy-immutability invariant, tested directly", () => {
  // Added after FI-17 disabled the guard inside applyException() with no test failing. Nothing in
  // that function mutates the policy, so the tripwire can never fire there — it is vacuous in
  // place and must be asserted on its own terms.
  it("FI-17: differing checksums MUST throw", () => {
    expect(() => assertPolicyUnmodified("aaaa1111", "bbbb2222", "POL-1")).toThrow(/must never happen/);
  });

  it("FI-17: the error names the policy and both checksums", () => {
    expect(() => assertPolicyUnmodified("aaaa1111", "bbbb2222", "POL-XYZ")).toThrow(/POL-XYZ/);
    expect(() => assertPolicyUnmodified("aaaa1111", "bbbb2222", "POL-XYZ")).toThrow(/aaaa1111/);
  });

  it("FI-17: identical checksums do not throw", () => {
    expect(() => assertPolicyUnmodified("same", "same", "POL-1")).not.toThrow();
  });
});

describe("exceptions never modify the policy", () => {
  const policy = { id: "POL-1", body: "Original policy text that must never change." };

  it("POSITIVE CONTROL: a valid exception applies and leaves the policy byte-identical", () => {
    const r = applyException(policy, synthEx(), { asOf: ASOF, tenantId: null, legalEntityId: null });
    expect(r.exception.applies).toBe(true);
    expect(r.policy.body).toBe("Original policy text that must never change.");
    expect(r.effectiveRule).toBe("POLICY_WITH_EXCEPTION");
    expect(r.exception.policyModified).toBe(false);
  });

  it("the policy checksum is unchanged whether or not an exception applies", () => {
    const withEx = applyException(policy, synthEx(), { asOf: ASOF, tenantId: null, legalEntityId: null });
    const without = applyException(policy, null, { asOf: ASOF, tenantId: null, legalEntityId: null });
    expect(withEx.policyChecksum).toBe(without.policyChecksum);
  });

  it("no exception means the policy applies as written", () => {
    const r = applyException(policy, null, { asOf: ASOF, tenantId: null, legalEntityId: null });
    expect(r.effectiveRule).toBe("POLICY_AS_WRITTEN");
  });
});

describe("exceptions expire automatically", () => {
  it("an expired exception ceases to apply with no revocation step", () => {
    const r = evaluateException(synthEx({ effectiveTo: "2026-01-31" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    });
    expect(r.applies).toBe(false);
    expect(r.decision).toBe("EXPIRED");
    expect(r.reason).toContain("no revocation was required");
  });

  it("a future exception does not apply early", () => {
    expect(evaluateException(synthEx({ effectiveFrom: "2026-06-01" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    }).decision).toBe("NOT_YET_EFFECTIVE");
  });

  it("a revoked exception inside its window does not apply", () => {
    expect(evaluateException(synthEx({ revokedAt: "2026-02-01" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    }).decision).toBe("REVOKED");
  });

  it("reports lapsed exceptions", () => {
    const l = lapsedExceptions([synthEx({ effectiveTo: "2026-01-01" })], ASOF);
    expect(l.length).toBe(1);
    expect(l[0].daysLapsed).toBe(45);
  });
});

describe("exceptions require authority and rationale", () => {
  it("an unapproved exception is refused", () => {
    const r = evaluateException(synthEx({ approvedByResolutionId: null, approvedByBody: null }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    });
    expect(r.decision).toBe("REQUIRES_AUTHORITY");
    expect(r.reason).toContain("policy breach with better paperwork");
  });

  it("an exception with no substantive rationale is refused", () => {
    expect(evaluateException(synthEx({ rationale: "n/a" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    }).decision).toBe("MISSING_RATIONALE");
  });

  it("an exception for a different policy does not apply", () => {
    expect(evaluateException(synthEx(), {
      asOf: ASOF, policyId: "POL-OTHER", tenantId: null, legalEntityId: null,
    }).decision).toBe("NOT_APPLICABLE");
  });

  it("a tenant-scoped exception does not cross tenants", () => {
    expect(evaluateException(synthEx({ tenantId: "TEN_A" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: "TEN_B", legalEntityId: null,
    }).decision).toBe("SCOPE_MISMATCH");
  });
});

describe("emergency override cannot become a backdoor", () => {
  it("an open-ended emergency is refused", () => {
    const r = evaluateException(synthEx({ kind: "EMERGENCY_OVERRIDE", effectiveTo: null }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    });
    expect(r.decision).toBe("EMERGENCY_REQUIRES_EXPIRY");
    expect(r.reason).toContain("permanent backdoor");
  });

  it("an emergency longer than the cap is refused", () => {
    const r = evaluateException(
      synthEx({ kind: "EMERGENCY_OVERRIDE", effectiveFrom: "2026-02-01", effectiveTo: "2026-12-31" }),
      { asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null },
    );
    expect(r.decision).toBe("EMERGENCY_LIMIT_EXCEEDED");
  });

  it("POSITIVE CONTROL: a short, first-time emergency applies", () => {
    const r = evaluateException(
      synthEx({ kind: "EMERGENCY_OVERRIDE", effectiveFrom: "2026-02-10", effectiveTo: "2026-02-20" }),
      { asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null, priorEmergenciesForPolicy: 0 },
    );
    expect(r.applies).toBe(true);
    expect(r.daysRemaining).toBe(5);
  });

  it("a REPEATED emergency for the same policy is refused", () => {
    const r = evaluateException(
      synthEx({ kind: "EMERGENCY_OVERRIDE", effectiveFrom: "2026-02-10", effectiveTo: "2026-02-20" }),
      { asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null, priorEmergenciesForPolicy: 1 },
    );
    expect(r.decision).toBe("EMERGENCY_LIMIT_EXCEEDED");
    expect(r.reason).toContain("not an emergency");
  });

  it("MAX_EMERGENCY_DAYS is a real cap", () => {
    expect(MAX_EMERGENCY_DAYS).toBe(30);
  });

  it("detects emergency overrides used as routine policy", () => {
    const abuse = detectEmergencyAbuse([
      synthEx({ kind: "EMERGENCY_OVERRIDE" }),
      synthEx({ exceptionId: "EX2", kind: "EMERGENCY_OVERRIDE" }),
    ]);
    expect(abuse.length).toBe(1);
    expect(abuse[0].count).toBe(2);
  });
});

describe("exception kinds are not interchangeable", () => {
  it("a PERMANENT_POLICY_CHANGE is not an exception", () => {
    const r = evaluateException(synthEx({ kind: "PERMANENT_POLICY_CHANGE" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    });
    expect(r.decision).toBe("NOT_AN_EXCEPTION");
  });

  it("a BREACH permits nothing", () => {
    expect(evaluateException(synthEx({ kind: "BREACH" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    }).applies).toBe(false);
  });

  it("a WAIVER forgives the past but permits no future deviation", () => {
    expect(evaluateException(synthEx({ kind: "WAIVER" }), {
      asOf: ASOF, policyId: "POL-1", tenantId: null, legalEntityId: null,
    }).applies).toBe(false);
  });
});

// =============================================================================
// ESCALATION
// =============================================================================
describe("escalation is deterministic and never approves", () => {
  it("no blockers means no escalation", () => {
    const r = determineEscalation({ authorityPresent: true });
    expect(r.state).toBe("NO_ESCALATION");
    expect(r.autoApproved).toBe(false);
  });

  it("a reserved-matter bypass outranks everything", () => {
    const r = determineEscalation({
      authorityPresent: false, reservedMatterBypass: true, sodConflict: true,
    });
    expect(r.state).toBe("RESERVED_MATTER_BYPASS");
  });

  it("missing authority outranks an SoD conflict", () => {
    expect(determineEscalation({ authorityPresent: false, sodConflict: true }).state)
      .toBe("MISSING_AUTHORITY");
  });

  it("each blocker yields its own deterministic state", () => {
    expect(determineEscalation({ authorityPresent: true, authorityExpired: true }).state).toBe("EXPIRED_AUTHORITY");
    expect(determineEscalation({ authorityPresent: true, delegationValid: false }).state).toBe("DELEGATION_INVALID");
    expect(determineEscalation({ authorityPresent: true, policyConflicts: 2 }).state).toBe("POLICY_CONFLICT");
    expect(determineEscalation({ authorityPresent: true, sodConflict: true }).state).toBe("SOD_CONFLICT");
    expect(determineEscalation({ authorityPresent: true, scopeValid: false }).state).toBe("SCOPE_CONFLICT");
    expect(determineEscalation({ authorityPresent: true, evidencePresent: false }).state).toBe("EVIDENCE_INSUFFICIENT");
    expect(determineEscalation({ authorityPresent: true, unresolvedExceptions: 1 }).state).toBe("UNRESOLVED_EXCEPTION");
    expect(determineEscalation({ authorityPresent: true, complianceConflict: true }).state).toBe("COMPLIANCE_CONFLICT");
  });

  it("NEVER auto-approves, whatever the combination", () => {
    for (const input of [
      { authorityPresent: true }, { authorityPresent: false },
      { authorityPresent: true, policyConflicts: 5, sodConflict: true },
    ]) {
      expect(determineEscalation(input).autoApproved).toBe(false);
    }
  });

  it("names the competent body to escalate to when known", () => {
    const r = determineEscalation({ authorityPresent: false, competentBody: "GROUP_BOARD" });
    expect(r.escalateTo).toBe("GROUP_BOARD");
  });
});

// =============================================================================
// MATURITY REGISTRY — tested for its own honesty
// =============================================================================
describe("governance maturity cannot inflate itself", () => {
  it("a layer with a false criterion cannot be COMPLETE", () => {
    const l = GOVERNANCE_LAYERS.find((x) => x.layer === "Audit")!;
    expect(assessLayer({ ...l, evidence: { ...l.evidence, faultInjection: false } }).status).toBe("PARTIAL");
  });

  it("a layer with an AUTHORITY blocker cannot be COMPLETE", () => {
    const l = GOVERNANCE_LAYERS.find((x) => x.layer === "Authority")!;
    expect(assessLayer(l).status).toBe("REQUIRES_AUTHORITY");
  });

  it("a layer with no module is NOT_AVAILABLE", () => {
    const l = GOVERNANCE_LAYERS[0];
    expect(assessLayer({ ...l, module: null }).status).toBe("NOT_AVAILABLE");
  });

  it("the Constitution layer is COMPLETE on structural evidence — prose is not compiled", () => {
    const c = governanceMatrix().find((x) => x.layer === "Constitution")!;
    expect(c.status).toBe("COMPLETE");
    expect(c.missing).toEqual([]);
  });

  it("every layer records evidence and a reason", () => {
    for (const x of governanceMatrix()) expect(x.evidenceSummary.length).toBeGreaterThan(20);
  });

  it("the summary accounts for every layer", () => {
    const s = governanceSummary();
    const sum = Object.values(s.byStatus).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
    expect(s.total).toBe(GOVERNANCE_LAYERS.length);
  });

  it("newly built layers report COMPLETE on evidence", () => {
    const s = governanceSummary();
    for (const l of ["Reserved matters", "Exceptions", "Escalation", "Segregation of duties"]) {
      expect(s.complete).toContain(l);
    }
  });

  it("no layer claims COMPLETE while blocked", () => {
    for (const x of governanceMatrix()) {
      if (x.status === "COMPLETE") expect(x.blocker).toBeNull();
    }
  });
});

// =============================================================================
// NO MUTATION
// =============================================================================
describe("no governance or financial mutation", () => {
  it("versions are pinned", () => {
    expect(RESERVED_MATTER_VERSION).toBe("reserved-matters-1.0.0");
    expect(DELEGATION_VERSION).toBe("delegation-1.0.0");
    expect(EXCEPTION_VERSION).toBe("exceptions-1.0.0");
  });

  it("governance substrate is unchanged after every operation above", async () => {
    expect(await count(sql`select count(*)::int as n from governance_bodies`)).toBe(6);
    expect(await count(sql`select count(*)::int as n from constitution_articles`)).toBe(12);
    expect(await count(sql`select count(*)::int as n from delegations`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from approvals`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from resolutions`)).toBe(4);
  });

  it("no decision ratified, no capability activated, no trigger disabled", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from pg_trigger where not tgisinternal and tgenabled = 'D'`)).toBe(0);
  });

  it("financial state is untouched", async () => {
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    const [t] = await rowsOf<{ n: string }>(
      sql`select coalesce(sum(base_currency_balance),0)::text as n from treasury_positions`,
    );
    expect(t.n).toBe("11783000.00");
  });
});
