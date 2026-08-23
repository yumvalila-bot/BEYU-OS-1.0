/**
 * Phase 7E — Compliance & Obligation Intelligence.
 *
 * The failure this suite exists to prevent is a compliance module that manufactures assurance.
 * Four assertions matter above all others:
 *
 *   1. An obligation with no assessment is NEVER counted as compliant.
 *   2. Missing evidence is NEVER compliance, and a linked document is NEVER satisfaction.
 *   3. A future obligation is NEVER overdue; expired evidence is NEVER current.
 *   4. Tenant/entity attribution divergence is SURFACED, never silently repaired.
 *
 * Positive controls run against the real seeded register (8 obligations, 8 assessments, 5 controls,
 * 5 documents, 6 risks) and assert on specific known values, so an empty result can never pass as
 * success. Where a state cannot occur in seeded data (evidence beyond MISSING, since every seeded
 * assessment has a null evidence link), engine-level fixtures are used and are labelled SYNTHETIC.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { ROLES } from "@/lib/constants";
import type { Principal } from "@/lib/authz";
import type { SpecialistContext } from "@/lib/specialist/platform";
import {
  COMPLIANCE_VERSION,
  complianceDashboard,
  controlCoverage,
  entityComplianceProfile,
  evidenceCompleteness,
  exceptionDetection,
  jurisdictionExposure,
  obligationRisk,
  obligationStatus,
  overdueObligations,
  upcomingDeadlines,
  type AssessmentRecord,
  type ControlRecord,
  type DocumentRecord,
  type ObligationRecord,
  type RiskRecord,
} from "@/lib/specialist/compliance/engines";
import {
  assessComplianceRisk,
  assessCompliance,
  assessControlCoverage,
  assessEvidence,
  detectExceptions,
  monitorDeadlines,
  profileExposure,
  readObligations,
} from "@/lib/specialist/compliance/service";

const RUN = `CP${Date.now()}`;
let n = 0;
const trace = () => `${RUN}-${String(++n).padStart(3, "0")}`;

/** Resolved from data, never assumed — the seeded obligations live under one specific tenant. */
let tenantId = "";
let obligationEntityId = "";
let foreignTenantId = "";
let foreignEntityId = "";
/** An entity that is genuinely owned by the obligations' tenant (attribution-consistent). */
let ownedEntityId = "";
let ownedEntityObligationCount = 0;

/**
 * Suite-level fingerprint of every register this module reads, captured BEFORE any operation runs
 * and re-checked after the last test.
 *
 * Why this exists: fault injection FI-8 (an unauthorized UPDATE inside the service) initially went
 * undetected. A per-test snapshot is taken after earlier tests have already invoked the service,
 * so the corruption was already baked into the "before" value. Only a fingerprint captured before
 * the very first service call can prove the module wrote nothing.
 */
const REGISTER_FINGERPRINT_SQL = sql`
  select 'obligation' as kind, id, code, status::text as a, coalesce(next_due_at::text,'') as b,
         coalesce(legal_entity_id,'') as c, tenant_id as d
    from compliance_obligations
  union all
  select 'assessment', id, obligation_id, state::text, coalesce(evidence_document_id,''),
         human_confirmed::text, coalesce(findings,'')
    from compliance_assessments
  union all
  select 'control', id, code, effectiveness, coalesce(last_tested_at::text,''),
         coalesce(risk_id,''), tenant_id
    from controls
  union all
  select 'document', id, file_name, authority_status::text, coalesce(effective_date::text,''),
         '', tenant_id
    from documents
  union all
  select 'risk', id, code, status, residual_likelihood::text, residual_impact::text, tenant_id
    from risks
  order by 1, 2
`;
let registerFingerprintBefore = "";

async function rowsOf<T>(q: Parameters<typeof db.execute>[0]): Promise<T[]> {
  const r = (await db.execute(q)) as unknown as { rows?: T[] };
  return r.rows ?? (r as unknown as T[]);
}
async function count(q: Parameters<typeof db.execute>[0]): Promise<number> {
  return Number((await rowsOf<{ n: number }>(q))[0].n);
}

function principal(overrides: Partial<Principal> = {}): Principal {
  const roles = overrides.roles ?? ["CHIEF_RISK_COMPLIANCE"];
  const permissions = new Set<never>();
  for (const role of roles) {
    const def = (ROLES as Record<string, { permissions?: readonly string[] }>)[role];
    for (const p of def?.permissions ?? []) permissions.add(p as never);
  }
  return {
    userId: "USR_COMPLIANCE_TEST",
    partyId: "p",
    email: "compliance@example.test",
    displayName: "Compliance Test",
    tenantId,
    tenantCode: "BEYU",
    tenantType: "ENTERPRISE",
    roles,
    permissions,
    clearance: "RESTRICTED",
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "s",
    riskScore: 0,
    emergencyPermissions: [],
    ...overrides,
  } as unknown as Principal;
}

function ctx(overrides: Partial<SpecialistContext> = {}): SpecialistContext {
  return { principal: principal(), tenantId, legalEntityId: null, traceId: trace(), ...overrides };
}

// --- SYNTHETIC engine fixtures. Clearly not production reality; used only where the seeded
// --- register cannot express a state (e.g. every seeded assessment has null evidence).
const obl = (over: Partial<ObligationRecord> = {}): ObligationRecord => ({
  id: "OBL_SYN",
  tenantId: "TEN_SYN",
  code: "SYN-001",
  framework: "SYNTHETIC_FRAMEWORK",
  reference: "SYN ref",
  title: "Synthetic obligation",
  obligationType: "FILING",
  jurisdictionCode: "TZ",
  legalEntityId: "LEN_SYN",
  sectorCode: null,
  frequency: "ANNUAL",
  nextDueAt: "2026-06-30",
  ownerRole: "CHIEF_RISK_COMPLIANCE",
  controlIds: [],
  status: "ACTIVE",
  ...over,
});

const asm = (over: Partial<AssessmentRecord> = {}): AssessmentRecord => ({
  id: "ASM_SYN",
  tenantId: "TEN_SYN",
  obligationId: "OBL_SYN",
  period: "2025-Q4",
  state: "COMPLIANT",
  evidenceDocumentId: null,
  remediationDueAt: null,
  humanConfirmed: true,
  assessedAt: "2026-01-15T00:00:00.000Z",
  ...over,
});

const doc = (over: Partial<DocumentRecord> = {}): DocumentRecord => ({
  id: "DOC_SYN",
  tenantId: "TEN_SYN",
  effectiveDate: "2025-01-01",
  authorityStatus: "AUTHORITATIVE",
  jurisdictionCode: "TZ",
  ...over,
});

const ctl = (over: Partial<ControlRecord> = {}): ControlRecord => ({
  id: "CTL_SYN",
  tenantId: "TEN_SYN",
  code: "CTL-SYN-001",
  frameworks: ["SYNTHETIC_FRAMEWORK"],
  riskId: null,
  lastTestedAt: "2025-10-01",
  effectiveness: "EFFECTIVE",
  ...over,
});

const rsk = (over: Partial<RiskRecord> = {}): RiskRecord => ({
  id: "RSK_SYN",
  tenantId: "TEN_SYN",
  code: "SYN-R1",
  category: "REGULATORY",
  legalEntityId: null,
  residualLikelihood: 3,
  residualImpact: 4,
  appetiteThreshold: 9,
  status: "MONITORED",
  escalated: false,
  nextReviewAt: "2026-12-31",
  ...over,
});

const ASOF = "2026-02-15";

beforeAll(async () => {
  // FIRST statement in the suite: captured before any service call can have mutated anything.
  registerFingerprintBefore = JSON.stringify(await rowsOf(REGISTER_FINGERPRINT_SQL));
  expect(registerFingerprintBefore.length).toBeGreaterThan(100);

  const [o] = await rowsOf<{ tenant_id: string; legal_entity_id: string }>(
    sql`select tenant_id, legal_entity_id from compliance_obligations order by code limit 1`,
  );
  tenantId = o.tenant_id;
  obligationEntityId = o.legal_entity_id;

  const [f] = await rowsOf<{ id: string; tenant_id: string }>(
    sql`select id, tenant_id from legal_entities where tenant_id <> ${tenantId} order by id limit 1`,
  );
  foreignEntityId = f.id;
  foreignTenantId = f.tenant_id;

  // Must satisfy BOTH conditions or the positive control is vacuous: the entity has to be
  // genuinely owned by this tenant AND actually carry obligations. Picking merely the first
  // owned entity yields LEN_BEYU_FAMILY_TRUST, which has none, and an empty result would then
  // masquerade as a passing entity-scope test.
  const [owned] = await rowsOf<{ id: string; n: number }>(
    sql`select e.id, count(o.id)::int as n
        from legal_entities e
        join compliance_obligations o
          on o.legal_entity_id = e.id and o.tenant_id = ${tenantId}
        where e.tenant_id = ${tenantId}
        group by e.id
        order by n desc, e.id
        limit 1`,
  );
  ownedEntityId = owned.id;
  expect(Number(owned.n)).toBeGreaterThan(0);
  ownedEntityObligationCount = Number(owned.n);

  // §16: prove the fixtures are non-vacuous BEFORE any positive control relies on them.
  expect(await count(sql`select count(*)::int as n from compliance_obligations where tenant_id = ${tenantId}`)).toBe(8);
  expect(await count(sql`select count(*)::int as n from compliance_assessments where tenant_id = ${tenantId}`)).toBe(8);
  expect(await count(sql`select count(*)::int as n from risks where tenant_id = ${tenantId}`)).toBe(6);
  expect(await count(sql`select count(*)::int as n from controls where tenant_id = ${tenantId}`)).toBe(5);
  expect(foreignTenantId).not.toBe(tenantId);
});

// ===========================================================================
// A. SILENCE IS NEVER COMPLIANCE
// ===========================================================================

describe("compliance engines — absence is never compliance", () => {
  it("reports state null / DATA_NOT_AVAILABLE when no assessment exists", () => {
    const s = obligationStatus(obl(), [], [], { asOf: ASOF });
    expect(s.state).toBeNull();
    expect(s.stateBasis).toBe("DATA_NOT_AVAILABLE");
    expect(s.findings.map((f) => f.code)).toContain("NO_ASSESSMENT");
    expect(s.explanation.join(" ")).toMatch(/not the same as compliant/i);
  });

  it("never invents a compliance state: it copies the governed one verbatim", () => {
    for (const state of ["COMPLIANT", "NON_COMPLIANT", "PARTIALLY_COMPLIANT", "NOT_ASSESSED", "REQUIRES_HUMAN_REVIEW"]) {
      const s = obligationStatus(obl(), [asm({ state })], [], { asOf: ASOF });
      expect(s.state).toBe(state);
      expect(s.stateBasis).toBe("OBSERVED");
    }
  });

  it("counts unassessed obligations separately from every compliance state", () => {
    const d = complianceDashboard(
      [
        obligationStatus(obl({ id: "A", code: "A" }), [], [], { asOf: ASOF }),
        obligationStatus(obl({ id: "B", code: "B" }), [asm({ obligationId: "B" })], [], { asOf: ASOF }),
      ],
      { asOf: ASOF, tenantId: "T", legalEntityId: null, dueWithinDays: 30 },
    );
    expect(d.unassessedCount).toBe(1);
    expect(d.stateCounts.COMPLIANT).toBe(1);
    expect(Object.values(d.stateCounts).reduce((a, b) => a + b, 0)).toBe(1);
    expect(d.explanation.join(" ")).toMatch(/never counted as compliant/i);
  });

  it("an empty dashboard is DATA_NOT_AVAILABLE, not a clean record", () => {
    const d = complianceDashboard([], { asOf: ASOF, tenantId: "T", legalEntityId: null, dueWithinDays: 30 });
    expect(d.basis).toBe("DATA_NOT_AVAILABLE");
    expect(d.explanation.join(" ")).toMatch(/not a clean compliance record/i);
  });

  it("evidence completeness over an empty scope is null, not 0%", () => {
    const e = evidenceCompleteness([]);
    expect(e.verifiedPercent).toBeNull();
    expect(e.basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("control coverage with no linked controls is DATA_NOT_AVAILABLE, not 0%", () => {
    const c = controlCoverage({ id: "O1", type: "OBLIGATION", controlIds: [] }, [], { asOf: ASOF });
    expect(c.coverageBasis).toBe("DATA_NOT_AVAILABLE");
    expect(c.explanation.join(" ")).toMatch(/absence of information/i);
  });
});

// ===========================================================================
// B. EVIDENCE IS A DIFFERENT QUESTION FROM COMPLIANCE
// ===========================================================================

describe("compliance engines — evidence is distinct from obligation truth", () => {
  it("MISSING when the governed state implies evidence but none is linked", () => {
    const s = obligationStatus(obl(), [asm({ state: "COMPLIANT", evidenceDocumentId: null })], [], { asOf: ASOF });
    expect(s.evidence.state).toBe("MISSING");
    // The obligation is still COMPLIANT per the register: evidence did not overwrite it.
    expect(s.state).toBe("COMPLIANT");
    expect(s.evidence.reason).toMatch(/not evidence of breach, nor of compliance/i);
  });

  it("PRESENT but NOT verified when a document exists without human confirmation", () => {
    const s = obligationStatus(
      obl(),
      [asm({ evidenceDocumentId: "DOC_SYN", humanConfirmed: false })],
      [doc()],
      { asOf: ASOF },
    );
    expect(s.evidence.state).toBe("PRESENT");
    expect(s.evidence.reason).toMatch(/does not by itself satisfy the obligation/i);
  });

  it("VERIFIED only when the document is effective AND a human confirmed", () => {
    const s = obligationStatus(
      obl(),
      [asm({ evidenceDocumentId: "DOC_SYN", humanConfirmed: true })],
      [doc()],
      { asOf: ASOF },
    );
    expect(s.evidence.state).toBe("VERIFIED");
  });

  it("EXPIRED for withdrawn authority statuses", () => {
    for (const status of ["EXPIRED", "SUPERSEDED", "REJECTED"]) {
      const s = obligationStatus(
        obl(),
        [asm({ evidenceDocumentId: "DOC_SYN" })],
        [doc({ authorityStatus: status })],
        { asOf: ASOF },
      );
      expect(s.evidence.state).toBe("EXPIRED");
    }
  });

  it("UNDER_REVIEW documents are not accepted as evidence", () => {
    const s = obligationStatus(
      obl(),
      [asm({ evidenceDocumentId: "DOC_SYN" })],
      [doc({ authorityStatus: "UNDER_REVIEW" })],
      { asOf: ASOF },
    );
    expect(s.evidence.state).toBe("UNDER_REVIEW");
    expect(s.evidence.reason).toMatch(/not been accepted as authoritative/i);
  });

  it("a dangling evidence link is MISSING plus an orphan finding, never PRESENT", () => {
    const s = obligationStatus(obl(), [asm({ evidenceDocumentId: "DOC_GHOST" })], [], { asOf: ASOF });
    expect(s.evidence.state).toBe("MISSING");
    expect(s.findings.map((f) => f.code)).toContain("ORPHANED_EVIDENCE_REFERENCE");
  });

  it("UNKNOWN when there is no assessment at all — no expectation has been set", () => {
    const s = obligationStatus(obl(), [], [], { asOf: ASOF });
    expect(s.evidence.state).toBe("UNKNOWN");
    expect(s.evidence.basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("evidence state never alters the recorded compliance state", () => {
    const withEvidence = obligationStatus(obl(), [asm({ state: "NON_COMPLIANT", evidenceDocumentId: "DOC_SYN", humanConfirmed: true })], [doc()], { asOf: ASOF });
    expect(withEvidence.evidence.state).toBe("VERIFIED");
    // Verified evidence does NOT flip a NON_COMPLIANT determination.
    expect(withEvidence.state).toBe("NON_COMPLIANT");
  });
});

// ===========================================================================
// C. TEMPORAL SECURITY
// ===========================================================================

describe("compliance engines — temporal boundaries", () => {
  it("a future obligation is FUTURE, never overdue", () => {
    const s = obligationStatus(obl({ nextDueAt: "2026-12-31" }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("FUTURE");
    expect(s.deadline.daysRemaining).toBeGreaterThan(0);
    expect(s.deadline.reason).toMatch(/not overdue/i);
  });

  it("the due date itself is DUE_TODAY, not overdue", () => {
    const s = obligationStatus(obl({ nextDueAt: ASOF }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("DUE_TODAY");
    expect(s.deadline.daysRemaining).toBe(0);
  });

  it("one day past due is OVERDUE", () => {
    const s = obligationStatus(obl({ nextDueAt: "2026-02-14" }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("OVERDUE");
    expect(s.deadline.daysRemaining).toBe(-1);
  });

  it("one day before due is still FUTURE", () => {
    const s = obligationStatus(obl({ nextDueAt: "2026-02-16" }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("FUTURE");
    expect(s.deadline.daysRemaining).toBe(1);
  });

  it("no due date is NO_DUE_DATE and is never treated as on time", () => {
    const s = obligationStatus(obl({ nextDueAt: null }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("NO_DUE_DATE");
    expect(s.deadline.basis).toBe("DATA_NOT_AVAILABLE");
    expect(s.deadline.reason).toMatch(/not 'on time'/i);
    expect(overdueObligations([s], { asOf: ASOF }).items).toHaveLength(0);
    expect(upcomingDeadlines([s], { asOf: ASOF, withinDays: 3650 }).items).toHaveLength(0);
  });

  it("a malformed due date does not become a deadline conclusion", () => {
    const s = obligationStatus(obl({ nextDueAt: "31/12/2026" }), [], [], { asOf: ASOF });
    expect(s.deadline.state).toBe("NO_DUE_DATE");
    expect(s.deadline.basis).toBe("DATA_NOT_AVAILABLE");
  });

  it("a document not yet effective is not current evidence", () => {
    const s = obligationStatus(
      obl(),
      [asm({ evidenceDocumentId: "DOC_SYN", humanConfirmed: true })],
      [doc({ effectiveDate: "2026-12-01" })],
      { asOf: ASOF },
    );
    expect(s.evidence.state).toBe("EXPIRED");
    expect(s.evidence.reason).toMatch(/not effective until/i);
  });

  it("a document effective exactly on the asOf date IS current", () => {
    const s = obligationStatus(
      obl(),
      [asm({ evidenceDocumentId: "DOC_SYN", humanConfirmed: true })],
      [doc({ effectiveDate: ASOF })],
      { asOf: ASOF },
    );
    expect(s.evidence.state).toBe("VERIFIED");
  });

  it("upcoming deadlines respect the window boundary inclusively", () => {
    const inside = obligationStatus(obl({ id: "A", code: "A", nextDueAt: "2026-02-25" }), [], [], { asOf: ASOF });
    const outside = obligationStatus(obl({ id: "B", code: "B", nextDueAt: "2026-02-26" }), [], [], { asOf: ASOF });
    const r = upcomingDeadlines([inside, outside], { asOf: ASOF, withinDays: 10 });
    expect(r.items.map((i) => i.code)).toEqual(["A"]);
  });

  it("flags a stale assessment only when the caller sets a window", () => {
    const stale = obligationStatus(obl(), [asm({ assessedAt: "2024-01-01T00:00:00.000Z" })], [], { asOf: ASOF, staleAssessmentDays: 90 });
    expect(stale.findings.map((f) => f.code)).toContain("STALE_ASSESSMENT");
    const unflagged = obligationStatus(obl(), [asm({ assessedAt: "2024-01-01T00:00:00.000Z" })], [], { asOf: ASOF });
    expect(unflagged.findings.map((f) => f.code)).not.toContain("STALE_ASSESSMENT");
  });

  it("flags a future-dated assessment", () => {
    const s = obligationStatus(obl(), [asm({ assessedAt: "2027-01-01T00:00:00.000Z" })], [], { asOf: ASOF, staleAssessmentDays: 90 });
    expect(s.findings.map((f) => f.code)).toContain("FUTURE_DATED_RECORD");
  });

  it("rejects a malformed asOf rather than defaulting", () => {
    expect(() => obligationStatus(obl(), [], [], { asOf: "15/02/2026" })).toThrow(/ISO date/i);
    expect(() => upcomingDeadlines([], { asOf: "nope", withinDays: 30 })).toThrow(/ISO date/i);
    expect(() => overdueObligations([], { asOf: "nope" })).toThrow(/ISO date/i);
  });

  it("rejects a negative or non-integer deadline window", () => {
    const s = obligationStatus(obl(), [], [], { asOf: ASOF });
    expect(() => upcomingDeadlines([s], { asOf: ASOF, withinDays: -1 })).toThrow(/non-negative integer/i);
    expect(() => upcomingDeadlines([s], { asOf: ASOF, withinDays: 1.5 })).toThrow(/non-negative integer/i);
  });
});

// ===========================================================================
// D. ATTRIBUTION — surfaced, never repaired
// ===========================================================================

describe("compliance engines — tenant/entity attribution", () => {
  it("flags an obligation whose entity belongs to another tenant", () => {
    const s = obligationStatus(obl({ tenantId: "TEN_A", legalEntityId: "LEN_B" }), [], [], {
      asOf: ASOF,
      entityOwners: { LEN_B: "TEN_B" },
    });
    const f = s.findings.find((x) => x.code === "TENANT_ENTITY_ATTRIBUTION_MISMATCH");
    expect(f).toBeDefined();
    expect(f!.severity).toBe("GOVERNANCE");
    expect(f!.advisoryOnly).toBe(true);
    expect(f!.detail).toMatch(/not resolved here/i);
  });

  it("flags an orphaned entity reference rather than inferring ownership", () => {
    const s = obligationStatus(obl({ tenantId: "TEN_A", legalEntityId: "LEN_GHOST" }), [], [], {
      asOf: ASOF,
      entityOwners: {},
    });
    expect(s.findings.map((f) => f.code)).toContain("ORPHANED_ENTITY_REFERENCE");
  });

  it("does not assert attribution at all when no ownership map is supplied", () => {
    const s = obligationStatus(obl({ tenantId: "TEN_A", legalEntityId: "LEN_B" }), [], [], { asOf: ASOF });
    expect(s.findings.map((f) => f.code)).not.toContain("TENANT_ENTITY_ATTRIBUTION_MISMATCH");
  });

  it("reports no finding when ownership agrees", () => {
    const s = obligationStatus(obl({ tenantId: "TEN_A", legalEntityId: "LEN_A" }), [], [], {
      asOf: ASOF,
      entityOwners: { LEN_A: "TEN_A" },
    });
    expect(s.findings.map((f) => f.code)).not.toContain("TENANT_ENTITY_ATTRIBUTION_MISMATCH");
  });

  it("entity profiles mark divergence without merging the groups", () => {
    const statuses = [
      obligationStatus(obl({ id: "A", code: "A", tenantId: "TEN_A", legalEntityId: "LEN_X" }), [], [], { asOf: ASOF }),
      obligationStatus(obl({ id: "B", code: "B", tenantId: "TEN_A", legalEntityId: "LEN_Y" }), [], [], { asOf: ASOF }),
    ];
    const r = entityComplianceProfile(statuses, {
      claimedTenantId: "TEN_A",
      entityOwners: { LEN_X: "TEN_A", LEN_Y: "TEN_OTHER" },
    });
    expect(r.items).toHaveLength(2);
    expect(r.items.find((i) => i.legalEntityId === "LEN_X")!.attributionConsistent).toBe(true);
    const bad = r.items.find((i) => i.legalEntityId === "LEN_Y")!;
    expect(bad.attributionConsistent).toBe(false);
    expect(bad.owningTenantId).toBe("TEN_OTHER");
    expect(bad.claimedTenantId).toBe("TEN_A");
    expect(r.explanation.join(" ")).toMatch(/never inferred or corrected/i);
  });
});

// ===========================================================================
// E. DATA QUALITY (§13)
// ===========================================================================

describe("compliance engines — data quality findings", () => {
  it("detects a missing owner", () => {
    expect(obligationStatus(obl({ ownerRole: "" }), [], [], { asOf: ASOF }).findings.map((f) => f.code))
      .toContain("MISSING_OWNER");
  });

  it("detects a missing due date and a missing jurisdiction", () => {
    const s = obligationStatus(obl({ nextDueAt: null, jurisdictionCode: "" }), [], [], { asOf: ASOF });
    expect(s.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["MISSING_DUE_DATE", "MISSING_JURISDICTION"]));
  });

  it("detects duplicate assessment periods", () => {
    const s = obligationStatus(
      obl(),
      [asm({ id: "A1", period: "2025-Q4" }), asm({ id: "A2", period: "2025-Q4" })],
      [],
      { asOf: ASOF },
    );
    expect(s.findings.map((f) => f.code)).toContain("DUPLICATE_ASSESSMENT");
  });

  it("detects remediation whose due date has already passed", () => {
    const s = obligationStatus(obl(), [asm({ state: "NON_COMPLIANT", remediationDueAt: "2026-01-01" })], [], { asOf: ASOF });
    expect(s.findings.map((f) => f.code)).toContain("INCONSISTENT_STATUS");
  });

  it("detects an obligation with no linked controls", () => {
    expect(obligationStatus(obl({ controlIds: [] }), [], [], { asOf: ASOF }).findings.map((f) => f.code))
      .toContain("NO_CONTROL_COVERAGE");
  });

  it("detects an untested and a future-tested control", () => {
    const never = controlCoverage({ id: "O", type: "OBLIGATION", controlIds: ["CTL_SYN"] }, [ctl({ lastTestedAt: null })], { asOf: ASOF });
    expect(never.untestedControlIds).toContain("CTL_SYN");
    const future = controlCoverage({ id: "O", type: "OBLIGATION", controlIds: ["CTL_SYN"] }, [ctl({ lastTestedAt: "2027-01-01" })], { asOf: ASOF, staleTestDays: 365 });
    expect(future.findings.map((f) => f.code)).toContain("FUTURE_DATED_RECORD");
  });

  it("detects a stale control test against the caller's window", () => {
    const c = controlCoverage({ id: "O", type: "OBLIGATION", controlIds: ["CTL_SYN"] }, [ctl({ lastTestedAt: "2024-01-01" })], { asOf: ASOF, staleTestDays: 90 });
    expect(c.untestedControlIds).toContain("CTL_SYN");
  });

  it("every finding is advisory-only", () => {
    const s = obligationStatus(obl({ ownerRole: "", nextDueAt: null, jurisdictionCode: "" }), [], [], { asOf: ASOF });
    expect(s.findings.length).toBeGreaterThan(0);
    expect(s.findings.every((f) => f.advisoryOnly === true)).toBe(true);
  });
});

// ===========================================================================
// F. RISK — consumes the existing register only
// ===========================================================================

describe("compliance engines — risk integration", () => {
  it("uses the register's own residual scores and appetite threshold", () => {
    const r = obligationRisk([rsk({ residualLikelihood: 3, residualImpact: 5, appetiteThreshold: 12 })], [], { asOf: ASOF });
    const item = r.items[0];
    expect(item.residualScore).toBe(15);
    expect(item.appetiteThreshold).toBe(12);
    expect(item.aboveAppetite).toBe(true);
    expect(item.explanation.join(" ")).toMatch(/read from the existing risk register/i);
  });

  it("does not flag a risk within its own appetite", () => {
    expect(obligationRisk([rsk({ residualLikelihood: 2, residualImpact: 4, appetiteThreshold: 9 })], [], { asOf: ASOF }).items[0].aboveAppetite).toBe(false);
  });

  it("returns DATA_NOT_AVAILABLE with no risks, and says it creates no second register", () => {
    const r = obligationRisk([], [], { asOf: ASOF });
    expect(r.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.explanation.join(" ")).toMatch(/creates no second register/i);
  });

  it("flags a risk whose review date has passed and one with no controls", () => {
    const r = obligationRisk([rsk({ nextReviewAt: "2026-01-01" })], [], { asOf: ASOF });
    const codes = r.items[0].findings.map((f) => f.code);
    expect(codes).toEqual(expect.arrayContaining(["STALE_ASSESSMENT", "NO_CONTROL_COVERAGE"]));
  });

  it("links controls to risks without copying them", () => {
    const r = obligationRisk([rsk({ id: "RSK_1" })], [ctl({ id: "CTL_1", riskId: "RSK_1" })], { asOf: ASOF });
    expect(r.items[0].linkedControlIds).toEqual(["CTL_1"]);
  });
});

// ===========================================================================
// G. EXCEPTIONS — advisory only
// ===========================================================================

describe("compliance engines — exception detection", () => {
  it("raises exceptions for overdue, non-compliant, unassessed and missing evidence", () => {
    const statuses = [
      obligationStatus(obl({ id: "A", code: "A", nextDueAt: "2026-01-01" }), [], [], { asOf: ASOF }),
      obligationStatus(obl({ id: "B", code: "B" }), [asm({ obligationId: "B", state: "NON_COMPLIANT" })], [], { asOf: ASOF }),
    ];
    const r = exceptionDetection(statuses, [], { asOf: ASOF });
    const codes = r.items.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining([
      "OVERDUE_OBLIGATION", "UNASSESSED_OBLIGATION", "NON_COMPLIANT_ASSESSMENT", "EVIDENCE_MISSING",
    ]));
    expect(r.items.every((i) => i.advisoryOnly === true)).toBe(true);
    expect(r.explanation.join(" ")).toMatch(/authorises enforcement/i);
  });

  it("raises AWAITING_HUMAN_REVIEW when confirmation is absent", () => {
    const s = obligationStatus(obl(), [asm({ state: "REQUIRES_HUMAN_REVIEW", humanConfirmed: false })], [], { asOf: ASOF });
    expect(exceptionDetection([s], [], { asOf: ASOF }).items.map((i) => i.code)).toContain("AWAITING_HUMAN_REVIEW");
  });

  it("raises REMEDIATION_OVERDUE from the assessment record", () => {
    const a = asm({ id: "A9", state: "NON_COMPLIANT", remediationDueAt: "2026-01-01" });
    const s = obligationStatus(obl(), [a], [], { asOf: ASOF });
    expect(exceptionDetection([s], [a], { asOf: ASOF }).items.map((i) => i.code)).toContain("REMEDIATION_OVERDUE");
  });

  it("every exception carries real source references", () => {
    const s = obligationStatus(obl(), [asm({ id: "A1" })], [], { asOf: ASOF });
    const r = exceptionDetection([s], [], { asOf: ASOF });
    for (const item of r.items) {
      expect(item.sources.length).toBeGreaterThan(0);
      expect(item.sources.some((x) => x.type === "COMPLIANCE_OBLIGATION")).toBe(true);
    }
  });

  it("returns DATA_NOT_AVAILABLE rather than 'no exceptions' for an empty scope", () => {
    expect(exceptionDetection([], [], { asOf: ASOF }).basis).toBe("DATA_NOT_AVAILABLE");
  });
});

// ===========================================================================
// H. NO FABRICATED LAW (§6)
// ===========================================================================

describe("compliance engines — no legal or tax fabrication", () => {
  it("does not infer a due date, rate or requirement from a framework name", () => {
    for (const framework of ["TRA", "GDPR", "IFRS", "NHIF", "AML_KYC"]) {
      const s = obligationStatus(obl({ framework, nextDueAt: null }), [], [], { asOf: ASOF });
      expect(s.deadline.dueDate).toBeNull();
      expect(s.deadline.state).toBe("NO_DUE_DATE");
      const text = JSON.stringify(s);
      expect(text).not.toMatch(/\b(rate|penalty|exemption|deduction)\s*[:=]\s*\d/i);
    }
  });

  it("states explicitly that no legal interpretation is offered", () => {
    expect(obligationStatus(obl(), [], [], { asOf: ASOF }).explanation.join(" "))
      .toMatch(/No legal interpretation/i);
  });

  it("reports being past a due date as a register fact, not a breach", () => {
    const s = obligationStatus(obl({ nextDueAt: "2026-01-01" }), [], [], { asOf: ASOF });
    expect(overdueObligations([s], { asOf: ASOF }).explanation.join(" "))
      .toMatch(/whether it constitutes a breach is a legal question this module does not answer/i);
  });

  it("does not claim absence of a jurisdiction means no obligations exist there", () => {
    const s = obligationStatus(obl(), [], [], { asOf: ASOF });
    expect(jurisdictionExposure([s]).explanation.join(" ")).toMatch(/does not mean no obligations exist/i);
  });
});

// ===========================================================================
// I. POSITIVE CONTROLS ON REAL SEEDED DATA (§16)
// ===========================================================================

describe("compliance service — positive controls on real data", () => {
  it("produces a dashboard from the 8 real seeded obligations", async () => {
    const r = await assessCompliance(ctx(), { asOf: ASOF });
    expect(r.specialist).toBe("COMPLIANCE");
    expect(r.version).toBe(COMPLIANCE_VERSION);
    expect(r.data.obligationCount).toBe(8);
    expect(r.provenance.sources.length).toBeGreaterThanOrEqual(16);

    // Real seeded states: 3 COMPLIANT, 2 PARTIALLY_COMPLIANT, 1 NON_COMPLIANT,
    // 1 NOT_ASSESSED, 1 REQUIRES_HUMAN_REVIEW.
    expect(r.data.stateCounts.COMPLIANT).toBe(3);
    expect(r.data.stateCounts.PARTIALLY_COMPLIANT).toBe(2);
    expect(r.data.stateCounts.NON_COMPLIANT).toBe(1);
    expect(r.data.stateCounts.REQUIRES_HUMAN_REVIEW).toBe(1);
  });

  it("reads all 8 obligations with their real frameworks and jurisdictions", async () => {
    const r = await readObligations(ctx(), { asOf: ASOF });
    expect(r.data.items).toHaveLength(8);
    const codes = r.data.items.map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(["OBL-TZ-VAT", "OBL-TZ-PAYE", "OBL-GDPR-XFER", "OBL-ISO-27001"]));
    expect(r.data.items.every((i) => i.stateBasis === "OBSERVED")).toBe(true);
    // Every seeded assessment has null evidence, so every one must be MISSING or REQUIRED —
    // never PRESENT, and certainly never VERIFIED.
    expect(r.data.items.every((i) => i.evidence.state === "MISSING" || i.evidence.state === "REQUIRED")).toBe(true);
  });

  it("monitors real deadlines: PAYE and NHIF are past due at 2026-02-15, others are not", async () => {
    const r = await monitorDeadlines(ctx(), { asOf: ASOF, withinDays: 60 });
    const overdue = r.data.overdue.map((o) => o.code).sort();
    // OBL-TZ-PAYE due 2026-01-07, OBL-TZ-VAT due 2026-01-20, OBL-NHIF-CLAIM due 2026-01-31.
    expect(overdue).toEqual(["OBL-NHIF-CLAIM", "OBL-TZ-PAYE", "OBL-TZ-VAT"]);
    // OBL-AML-KYC due 2026-03-31 is within 60 days; nothing overdue appears in upcoming.
    expect(r.data.upcoming.map((o) => o.code)).toContain("OBL-AML-KYC");
    expect(r.data.upcoming.some((o) => overdue.includes(o.code))).toBe(false);
  });

  it("reports real evidence completeness as 0 verified out of 8, with a stated denominator", async () => {
    const r = await assessEvidence(ctx(), { asOf: ASOF });
    expect(r.data.total).toBe(8);
    expect(r.data.counts.VERIFIED).toBe(0);
    expect(r.data.counts.PRESENT).toBe(0);
    expect(r.data.verifiedPercent).toBe("0.00");
    // 0.00% here is a MEASURED result over 8 records, not an absence of data.
    expect(r.data.counts.MISSING + r.data.counts.REQUIRED).toBe(8);
  });

  it("assesses control coverage over 5 real controls", async () => {
    const r = await assessControlCoverage(ctx(), { asOf: ASOF });
    expect(r.data.items).toHaveLength(8);
    // OBL-ISO-27001 has framework ISO27001, which CTL-SEC-001 declares.
    const iso = r.data.items.find((i) => i.controlCodes.includes("CTL-SEC-001"));
    expect(iso).toBeDefined();
    expect(iso!.coverageBasis).toBe("DERIVED");
    expect(iso!.effectiveCount).toBeGreaterThan(0);
  });

  it("reads the 6 real risks and finds ERM-003 escalated", async () => {
    const r = await assessComplianceRisk(ctx(), { asOf: ASOF });
    expect(r.data.items).toHaveLength(6);
    const erm3 = r.data.items.find((i) => i.code === "ERM-003")!;
    expect(erm3.escalated).toBe(true);
    expect(erm3.residualScore).toBe(12);
    expect(erm3.appetiteThreshold).toBe(9);
    expect(erm3.aboveAppetite).toBe(true);
    // ERM-002: 2 x 5 = 10 against threshold 12 — within appetite.
    expect(r.data.items.find((i) => i.code === "ERM-002")!.aboveAppetite).toBe(false);
  });

  it("detects real exceptions including the seeded NON_COMPLIANT NHIF obligation", async () => {
    const r = await detectExceptions(ctx(), { asOf: ASOF });
    expect(r.data.items.length).toBeGreaterThan(0);
    const nonCompliant = r.data.items.filter((i) => i.code === "NON_COMPLIANT_ASSESSMENT");
    expect(nonCompliant.map((i) => i.obligationCode)).toEqual(["OBL-NHIF-CLAIM"]);
    // OBL-IFRS-CONSOL is NOT_ASSESSED, which is a state, not an absent assessment.
    expect(r.data.items.every((i) => i.advisoryOnly === true)).toBe(true);
  });

  it("surfaces the REAL attribution defect: 5 of 8 obligations point at other tenants' entities", async () => {
    const r = await profileExposure(ctx(), { asOf: ASOF });
    const inconsistent = r.data.entities.filter((e) => !e.attributionConsistent);
    // LEN_BEYU_FINTECH_LTD, LEN_BEYU_HEALTH_LTD, LEN_BEYU_TZ_HOLDING are foreign-owned.
    expect(inconsistent.map((e) => e.legalEntityId).sort()).toEqual([
      "LEN_BEYU_FINTECH_LTD", "LEN_BEYU_HEALTH_LTD", "LEN_BEYU_TZ_HOLDING",
    ]);
    expect(inconsistent.reduce((a, e) => a + e.obligationCount, 0)).toBe(5);
    expect(r.explanation.join(" ")).toMatch(/deliberately NOT corrected/i);
    // LEN_BEYU_HOLDINGS is genuinely owned by the group tenant.
    expect(r.data.entities.find((e) => e.legalEntityId === "LEN_BEYU_HOLDINGS")!.attributionConsistent).toBe(true);
  });

  it("reports real jurisdiction exposure across TZ and GB", async () => {
    const r = await profileExposure(ctx(), { asOf: ASOF });
    const codes = r.data.jurisdictions.map((j) => j.jurisdictionCode).sort();
    expect(codes).toEqual(["GB", "TZ"]);
    expect(r.data.jurisdictions.find((j) => j.jurisdictionCode === "TZ")!.obligationCount).toBe(7);
  });

  it("emits exactly one audit row and one event per ANALYSIS run", async () => {
    const t = trace();
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(0);
    await assessCompliance(ctx({ traceId: t }), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(1);
    expect(await count(sql`select count(*)::int as n from enterprise_events where subject_id = ${t}`)).toBe(1);
  });

  it("does NOT audit a pure READ operation", async () => {
    const t = trace();
    await readObligations(ctx({ traceId: t }), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from audit_log where object_id = ${t}`)).toBe(0);
  });

  it("is deterministic across repeated runs", async () => {
    const a = await assessCompliance(ctx(), { asOf: ASOF });
    const b = await assessCompliance(ctx(), { asOf: ASOF });
    expect(JSON.stringify(a.data)).toBe(JSON.stringify(b.data));
  });
});

// ===========================================================================
// J. TENANT ISOLATION (entity deliberately null, so nothing masks it)
// ===========================================================================

describe("compliance service — tenant isolation", () => {
  it("refuses a tenant the principal does not belong to", async () => {
    await expect(
      assessCompliance({ principal: principal(), tenantId: foreignTenantId, legalEntityId: null, traceId: trace() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses a forged tenant id", async () => {
    await expect(
      assessCompliance({ principal: principal(), tenantId: "TEN_FORGED", legalEntityId: null, traceId: trace() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns no obligations for a legitimate but different tenant", async () => {
    const r = await assessCompliance({
      principal: principal({ tenantId: foreignTenantId }),
      tenantId: foreignTenantId,
      legalEntityId: null,
      traceId: trace(),
    });
    expect(r.data.obligationCount).toBe(0);
    expect(r.data.basis).toBe("DATA_NOT_AVAILABLE");
    expect(r.provenance.sources).toHaveLength(0);
  });

  it("CRITICAL: does not follow entity ownership across the tenant boundary", async () => {
    // 5 seeded obligations point at entities owned by OTHER tenants. Those obligations must
    // still be scoped to the tenant that CLAIMS them, and must NOT appear for the owning tenant.
    const owningTenant = (
      await rowsOf<{ tenant_id: string }>(sql`select tenant_id from legal_entities where id = 'LEN_BEYU_HEALTH_LTD'`)
    )[0].tenant_id;
    expect(owningTenant).not.toBe(tenantId);

    const r = await assessCompliance({
      principal: principal({ tenantId: owningTenant }),
      tenantId: owningTenant,
      legalEntityId: null,
      traceId: trace(),
    });
    // The health entity's obligations are claimed by the group tenant, so the owning tenant sees
    // nothing. Aggregating them here would be a silent ownership correction.
    expect(r.data.obligationCount).toBe(0);
  });
});

// ===========================================================================
// K. ENTITY ISOLATION (tenant deliberately valid)
// ===========================================================================

describe("compliance service — entity isolation", () => {
  it("refuses an entity owned by another tenant", async () => {
    await expect(
      assessCompliance({ principal: principal(), tenantId, legalEntityId: foreignEntityId, traceId: trace() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("refuses an entity outside the principal's entity scope", async () => {
    await expect(
      assessCompliance({
        principal: principal({ entityScope: ["LEN_SOMETHING_ELSE"] }),
        tenantId,
        legalEntityId: ownedEntityId,
        traceId: trace(),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("POSITIVE: an in-scope owned entity narrows the result to its own obligations", async () => {
    const r = await assessCompliance({
      principal: principal({ entityScope: [ownedEntityId] }),
      tenantId,
      legalEntityId: ownedEntityId,
      traceId: trace(),
    }, { asOf: ASOF });
    expect(r.legalEntityId).toBe(ownedEntityId);
    // Resolved from data: this entity genuinely carries obligations (asserted in beforeAll),
    // so a zero result cannot pass this test.
    expect(ownedEntityObligationCount).toBeGreaterThan(0);
    expect(r.data.obligationCount).toBe(ownedEntityObligationCount);
    expect(r.data.obligationCount).toBeLessThan(8);
  });
});

// ===========================================================================
// L. ATTACK MATRIX (§14)
// ===========================================================================

describe("compliance service — hostile inputs", () => {
  it("denies a principal without compliance permission", async () => {
    await expect(assessCompliance(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("denies a principal with no roles", async () => {
    await expect(assessCompliance(ctx({ principal: principal({ roles: [] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  /**
   * REGRESSION — leak found by hostile audit (§21).
   *
   * assessEvidence returns obligation identifiers, codes and evidence posture. It was originally
   * gated on `documents:registry.read`, which let HCM_DIRECTOR — a role deliberately granted
   * document access but NO compliance access — enumerate the entire obligation register. The gate
   * must match the most sensitive data returned, not the table it is joined from.
   */
  it("does not let a document-only role enumerate obligations via evidence analysis", async () => {
    const hcm = principal({ roles: ["HCM_DIRECTOR"] });
    // Precondition: this role genuinely has document access and genuinely lacks compliance access,
    // otherwise the test proves nothing.
    expect(hcm.permissions.has("documents:registry.read" as never)).toBe(true);
    expect(hcm.permissions.has("compliance:obligation.read" as never)).toBe(false);

    await expect(assessEvidence(ctx({ principal: hcm }), { asOf: ASOF }))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("requires BOTH compliance and document permissions for evidence analysis", async () => {
    // Second layer: a principal holding obligation access but not document access is refused by
    // the in-operation check, independently of the platform RBAC gate.
    const partial = principal({ roles: ["CHIEF_RISK_COMPLIANCE"] });
    (partial.permissions as Set<string>).delete("documents:registry.read");
    expect(partial.permissions.has("compliance:obligation.read" as never)).toBe(true);

    await expect(assessEvidence(ctx({ principal: partial }), { asOf: ASOF }))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("POSITIVE: a role holding both permissions gets real evidence analysis", async () => {
    // SECTOR_OPERATOR holds compliance:obligation.read AND documents:registry.read.
    const ok = await assessEvidence(ctx({ principal: principal({ roles: ["SECTOR_OPERATOR"] }) }), { asOf: ASOF });
    expect(ok.data.total).toBe(8);
    await expect(assessEvidence(ctx({ principal: principal({ roles: [] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
  });

  it("gates risk analysis on risk:register.read", async () => {
    await expect(assessComplianceRisk(ctx({ principal: principal({ roles: ["HCM_DIRECTOR"] }) })))
      .rejects.toMatchObject({ code: "DENIED" });
    const ok = await assessComplianceRisk(ctx({ principal: principal({ roles: ["AUDITOR"] }) }), { asOf: ASOF });
    expect(ok.data.items).toHaveLength(6);
  });

  it("a forged permission set cannot cross the tenant boundary", async () => {
    const forged = principal({ roles: [] });
    (forged.permissions as Set<string>).add("compliance:obligation.read");
    await expect(
      assessCompliance({ principal: forged, tenantId: foreignTenantId, legalEntityId: null, traceId: trace() }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects malformed trace ids", async () => {
    for (const traceId of ["", "short", "has space", "x".repeat(65)]) {
      await expect(assessCompliance(ctx({ traceId }))).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    }
  });

  it("rejects a malformed asOf instead of defaulting to today", async () => {
    await expect(assessCompliance(ctx(), { asOf: "15/02/2026" })).rejects.toThrow(/ISO date/i);
    await expect(monitorDeadlines(ctx(), { asOf: "nope" })).rejects.toThrow(/ISO date/i);
  });

  /**
   * Detected by fault injection FI-8: an unauthorized, idempotent UPDATE inside the service went
   * undetected because every in-test snapshot was taken after earlier tests had already invoked
   * the service. This assertion is anchored to the suite-level fingerprint instead.
   */
  it("has not written to any register since the suite began", async () => {
    const now = JSON.stringify(await rowsOf(REGISTER_FINGERPRINT_SQL));
    expect(now).toBe(registerFingerprintBefore);
  });

  it("the register fingerprint is capable of detecting a change", async () => {
    // Proves the assertion above is not vacuous: a deliberate write MUST break it, and is undone.
    const [target] = await rowsOf<{ id: string }>(
      sql`select id from compliance_assessments order by id limit 1`,
    );
    try {
      await db.execute(sql`update compliance_assessments set findings = 'FI-8 probe' where id = ${target.id}`);
      expect(JSON.stringify(await rowsOf(REGISTER_FINGERPRINT_SQL))).not.toBe(registerFingerprintBefore);
    } finally {
      await db.execute(sql`update compliance_assessments set findings = null where id = ${target.id}`);
    }
    expect(JSON.stringify(await rowsOf(REGISTER_FINGERPRINT_SQL))).toBe(registerFingerprintBefore);
  });

  it("writes nothing to any compliance, risk, control or document register", async () => {
    const before = {
      o: await count(sql`select count(*)::int as n from compliance_obligations`),
      a: await count(sql`select count(*)::int as n from compliance_assessments`),
      c: await count(sql`select count(*)::int as n from controls`),
      d: await count(sql`select count(*)::int as n from documents`),
      r: await count(sql`select count(*)::int as n from risks`),
      states: JSON.stringify(await rowsOf(sql`select id, state, evidence_document_id, human_confirmed from compliance_assessments order by id`)),
    };

    await assessCompliance(ctx(), { asOf: ASOF });
    await monitorDeadlines(ctx(), { asOf: ASOF });
    await assessEvidence(ctx(), { asOf: ASOF });
    await assessControlCoverage(ctx(), { asOf: ASOF });
    await assessComplianceRisk(ctx(), { asOf: ASOF });
    await detectExceptions(ctx(), { asOf: ASOF });
    await profileExposure(ctx(), { asOf: ASOF });

    expect(await count(sql`select count(*)::int as n from compliance_obligations`)).toBe(before.o);
    expect(await count(sql`select count(*)::int as n from compliance_assessments`)).toBe(before.a);
    expect(await count(sql`select count(*)::int as n from controls`)).toBe(before.c);
    expect(await count(sql`select count(*)::int as n from documents`)).toBe(before.d);
    expect(await count(sql`select count(*)::int as n from risks`)).toBe(before.r);
    expect(JSON.stringify(await rowsOf(sql`select id, state, evidence_document_id, human_confirmed from compliance_assessments order by id`))).toBe(before.states);
  });

  it("creates no accounting entries and moves no money", async () => {
    await assessCompliance(ctx(), { asOf: ASOF });
    expect(await count(sql`select count(*)::int as n from journal_entries`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from journal_lines`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from capital_requests where status = 'FUNDED'`)).toBe(0);
  });

  it("does not activate or alter any capability", async () => {
    const before = await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`);
    await assessCompliance(ctx(), { asOf: ASOF });
    await detectExceptions(ctx(), { asOf: ASOF });
    const after = await rowsOf(sql`select capability_code, activation_status from governance_capability_registry order by capability_code`);
    expect(after).toEqual(before);
  });

  it("registers compliance capabilities with enforcement LOCKED behind decisions", async () => {
    const rows = await rowsOf<{ capability_code: string; activation_status: string; required_decisions: string[] }>(
      sql`select capability_code, activation_status, required_decisions from governance_capability_registry
          where capability_code like 'CAP_SPEC_COMPLIANCE%' order by capability_code`,
    );
    expect(rows.map((r) => r.capability_code)).toEqual([
      "CAP_SPEC_COMPLIANCE_ACCEPT_EVIDENCE",
      "CAP_SPEC_COMPLIANCE_ASSERT_STATE",
      "CAP_SPEC_COMPLIANCE_ASSESS",
      "CAP_SPEC_COMPLIANCE_ENFORCE",
      "CAP_SPEC_COMPLIANCE_MONITOR",
      "CAP_SPEC_COMPLIANCE_REPORT",
    ]);
    expect(rows.every((r) => r.activation_status === "LOCKED")).toBe(true);
    expect(rows.find((r) => r.capability_code === "CAP_SPEC_COMPLIANCE_ENFORCE")!.required_decisions).toContain("P1");
    expect(rows.find((r) => r.capability_code === "CAP_SPEC_COMPLIANCE_ASSERT_STATE")!.required_decisions.length).toBeGreaterThan(0);
  });

  it("creates no execution permission", async () => {
    const n = await count(sql`
      select count(*)::int as n from role_permissions
      where permission_code in ('finance:ledger.approve','capital:execute','treasury:settle','compliance:enforce')
    `);
    expect(n).toBe(0);
  });
});

// ===========================================================================
// M. NO SECOND TRUTH (§17)
// ===========================================================================

describe("compliance module — creates no second truth", () => {
  it("defines no tables of its own", async () => {
    const names = (
      await rowsOf<{ table_name: string }>(sql`
        select table_name from information_schema.tables
        where table_schema = 'public'
          and (table_name like '%compliance%' or table_name like '%obligation%' or table_name like '%evidence%')
        order by table_name
      `)
    ).map((r) => r.table_name);
    // Exactly the two pre-existing registers from the 0000 baseline. Nothing added.
    expect(names).toEqual(["compliance_assessments", "compliance_obligations"]);
  });

  it("adds no migration", async () => {
    expect(await count(sql`select count(*)::int as n from public.beyu_migrations`)).toBe(15);
  });

  it("leaves all triggers enabled", async () => {
    expect(await count(sql`select count(*)::int as n from pg_trigger where tgenabled = 'D' and not tgisinternal`)).toBe(0);
  });

  it("leaves the decision registry entirely PENDING", async () => {
    expect(await count(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`)).toBe(0);
  });
});

afterAll(async () => {
  // Final guarantee: nothing this suite ran altered any governed register.
  const now = JSON.stringify(await rowsOf(REGISTER_FINGERPRINT_SQL));
  expect(now).toBe(registerFingerprintBefore);
});
