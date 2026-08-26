/**
 * Phase 3A architecture invariant tests (T-07/T-08 schema+boundary lints,
 * T-14 fail-closed regression, determinism regression of Phase 1–2 engines).
 *
 * These tests read the REAL repository modules and lock the ratified
 * boundaries (FIR-017/018/019) and structural invariants (I-08, I-10, I-14)
 * in place. If any of these start failing, the architecture has drifted —
 * STOP and review; do not weaken the test.
 * Pure; no database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { beneficiaries, familyMembers, familyVaultItems } from "@/db/schema/people";
import { HIGH_RISK_PERMISSIONS, PERMISSIONS } from "@/lib/constants";
import { ALIGNMENT_ENGINE_VERSION, NOELIA_MAY, NOELIA_MAY_NOT, assertWithinNoeliaBoundary } from "@/lib/family/alignment";
import { FAMILY_CONSTITUTION_ENGINE_VERSION, checkSupremacy, type ConstitutionProvision } from "@/lib/family/constitution";
import { FAMILY_CAPITAL_ENGINE_VERSION, assessCapitalPool, type FamilyCapitalPool } from "@/lib/family/capital";
import { FAMILY_LOAN_ENGINE_VERSION, assertLoanWriteIsHuman } from "@/lib/family/loan";
import { ELIGIBILITY_ENGINE_VERSION, evaluateEligibility, type EligibilityInput } from "@/lib/family/eligibility";
import { INSTITUTION_ENGINE_VERSION, assertGovernanceWriteIsHuman } from "@/lib/family/institution";
import { LINEAGE_ENGINE_VERSION, assertLineageWriteIsHuman, buildDescentGraph, type DescentNode } from "@/lib/family/lineage";
import {
  DECISION_GATE_VERSION,
  evaluateDecisionGate,
  type DecisionRequest,
} from "@/lib/family/decision-gate";
import {
  FAMILY_ACTOR_TYPES,
  PARTICIPATION_AXES,
  SUPERIOR_INSTRUMENTS,
  TRUSTEE_RESERVED_MATTERS,
  FamilyInstitutionError,
  assertHumanAuthority,
} from "@/lib/family/model";
import { POLICY_DECISION_VERSION, STANDING_POLICY_DECISIONS, resolvePolicyDecision } from "@/lib/family/policy-decisions";
import { FINANCIAL_STATE_FORBIDDEN_KEYS } from "@/lib/family/phase3/contracts";

/* ---------------- FIR-018: no shadow financial truth (schema lint) ---------------- */

describe("Finance OS boundary (FIR-018) — schema lint", () => {
  const tables = { familyMembers, beneficiaries, familyVaultItems };
  it.each(Object.entries(tables))("table %s carries no financial-state field", (_name, table) => {
    const keys = Object.keys(table);
    expect(keys.length).toBeGreaterThan(0);
    const forbidden = keys.filter((k) =>
      FINANCIAL_STATE_FORBIDDEN_KEYS.some((f) => f.toLowerCase() === k.toLowerCase()),
    );
    expect(forbidden).toEqual([]);
  });

  it("beneficiaries stores a reported percentage with provenance, not a posting", () => {
    const keys = Object.keys(beneficiaries);
    expect(keys).toContain("entitlementPct");
    expect(keys).toContain("verifiedBy");
    expect(keys).toContain("approvedByResolutionId");
  });
});

/* ---------------- FIR-019: canonical ownership (permission inventory) ---------------- */

describe("canonical ownership (FIR-019) — family permission inventory", () => {
  const familyCodes = Object.keys(PERMISSIONS).filter((k) => k.startsWith("family:"));
  it("is exactly the five existing permissions (no additions, no wildcards)", () => {
    expect([...familyCodes].sort()).toEqual([
      "family:beneficiary.manage",
      "family:beneficiary.read",
      "family:member.manage",
      "family:member.read",
      "family:vault.read",
    ]);
  });

  it("no family permission code implies legal, financial, or AI authority", () => {
    const forbiddenTokens = ["trustee", "constitution", "post", "disburse", "ledger", "amend", "appoint", "remove", "finance"];
    for (const code of familyCodes) {
      for (const token of forbiddenTokens) {
        expect(code.toLowerCase()).not.toContain(token);
      }
    }
  });

  it("beneficiary management remains HIGH_RISK (canonical state)", () => {
    expect(HIGH_RISK_PERMISSIONS).toContain("family:beneficiary.manage");
  });
});

/* ---------------- FIR-017: Noelia/HIVE boundary (locked coverage) ---------------- */

describe("Noelia/HIVE boundary (FIR-017) — locked prohibition coverage", () => {
  const requiredProhibitions = [
    "amend the Family Constitution",
    "alter Trust instruments",
    "appoint or remove Trustees",
    "determine beneficiaries",
    "override Trustees",
    "override the Family Council",
    "override legal authority",
    "approve material capital",
    "disburse material capital",
    "bypass RBAC",
    "bypass ABAC",
    "bypass audit",
    "create legal authority",
    "invent policy",
  ];
  it.each(requiredProhibitions)("NOELIA_MAY_NOT covers: %s", (prohibition) => {
    expect(NOELIA_MAY_NOT).toContain(prohibition);
  });

  it("NOELIA_MAY stays advisory-only (no authority verbs)", () => {
    expect(NOELIA_MAY.length).toBeGreaterThanOrEqual(8);
    for (const may of NOELIA_MAY) {
      expect(may).not.toMatch(/approve|amend|appoint|remove|disburse|post/i);
    }
  });

  it("assertWithinNoeliaBoundary refuses authority operations", () => {
    expect(() => assertWithinNoeliaBoundary("amend the Family Constitution")).toThrow();
    expect(() => assertWithinNoeliaBoundary("analyse")).not.toThrow();
  });

  it("every engine keeps its human-write assertion (AI refuses)", () => {
    expect(() => assertHumanAuthority("AI", "GATE")).toThrow(FamilyInstitutionError);
    expect(() => assertLineageWriteIsHuman("AI", "verify")).toThrow(FamilyInstitutionError);
    expect(() => assertGovernanceWriteIsHuman("AI", "appoint")).toThrow(FamilyInstitutionError);
    expect(() => assertLoanWriteIsHuman("AI", "approve")).toThrow(FamilyInstitutionError);
  });
});

/* ---------------- I-08 / I-10: engine vocabulary intact ---------------- */

describe("structural vocabulary (I-08, I-10)", () => {
  it("supremacy ladder is the nine-rank order", () => {
    expect(SUPERIOR_INSTRUMENTS).toHaveLength(9);
    expect(SUPERIOR_INSTRUMENTS[0]).toBe("APPLICABLE_LAW");
    expect(SUPERIOR_INSTRUMENTS[8]).toBe("LETTER_OF_WISHES");
  });

  it("participation axes are the six independent axes", () => {
    expect([...PARTICIPATION_AXES].sort()).toEqual(
      ["ATTENDANCE", "BENEFICIARY", "CONSULTATION", "GOVERNANCE_RIGHT", "OWNERSHIP", "VOTING"],
    );
  });

  it("trustee-reserved matters include beneficiary determination and trustee changes", () => {
    expect(TRUSTEE_RESERVED_MATTERS).toHaveLength(8);
    for (const matter of ["BENEFICIARY_DETERMINATION", "TRUSTEE_APPOINTMENT", "TRUSTEE_REMOVAL", "TRUST_DISTRIBUTION"]) {
      expect(TRUSTEE_RESERVED_MATTERS).toContain(matter);
    }
  });

  it("actor types are exactly HUMAN | SERVICE | AI", () => {
    expect([...FAMILY_ACTOR_TYPES].sort()).toEqual(["AI", "HUMAN", "SERVICE"]);
  });

  it("all Phase 1-2 engines are version-pinned at 1.0.0 (I-15)", () => {
    for (const version of [
      FAMILY_CONSTITUTION_ENGINE_VERSION,
      FAMILY_CAPITAL_ENGINE_VERSION,
      FAMILY_LOAN_ENGINE_VERSION,
      ELIGIBILITY_ENGINE_VERSION,
      INSTITUTION_ENGINE_VERSION,
      LINEAGE_ENGINE_VERSION,
      DECISION_GATE_VERSION,
      ALIGNMENT_ENGINE_VERSION,
      POLICY_DECISION_VERSION,
    ]) {
      expect(version.endsWith("1.0.0")).toBe(true);
    }
  });
});

/* ---------------- Phase 1-2 regression: determinism ---------------- */

const eligibilityInput: EligibilityInput = {
  memberId: "FAM_G3A",
  relationshipToParent: "BIRTH_DESCENDANT",
  descendantStatus: "DIRECT_DESCENDANT",
  descendantDetermination: null,
  lineageVerified: true,
  instrumentProvisions: [],
  throughDescendantAuthorisations: [],
  asOf: "2026-01-01",
};

const fullDefinition = {
  owner: "BEYU Holdings Ltd",
  source: "Retained earnings and founder contribution.",
  purpose: "Long-horizon capital preservation and growth.",
  permittedUse: "Equity, debt, real assets and strategic businesses.",
  restrictions: "No lifestyle use. No cross-pool movement without authority.",
  risk: "Diversified, medium risk within recorded appetite.",
  liquidity: "Minimum 24 months of obligations held liquid.",
  allocationAuthority: "Family Investment Committee recommendation, Family Council approval.",
  performance: "Measured against the benchmark in the Investment Policy Statement.",
  accountingIntegration: "Finance OS ledger; pool is a reporting dimension, not an account.",
  taxLegalClassification: "Holding-company investment capital, Tanzania.",
  audit: "Annual internal audit of pool movements.",
};

const pool: FamilyCapitalPool = {
  poolId: "FPL_PERM",
  pool: "PERMANENT_CAPITAL",
  legalEntityId: "LEN_HOLDINGS",
  jurisdictionCode: "TZ",
  currency: "TZS",
  segregationClass: "FAMILY_CAPITAL",
  definition: fullDefinition,
  observedBalanceMinor: 500_000_000_00,
  observedAsOf: "2026-01-31",
  establishedByReference: "FC-RES-002",
};

const founder: DescentNode = {
  memberId: "FAM_FOUNDER",
  familyLine: "BEYU",
  parentMemberId: null,
  relationshipToParent: "BIRTH_DESCENDANT",
  verificationStatus: "VERIFIED",
};
const gen2: DescentNode = { ...founder, memberId: "FAM_G2A" };
const gen3: DescentNode = { ...gen2, memberId: "FAM_G3A", parentMemberId: "FAM_G2A" };

const fullRequest = (over: Partial<DecisionRequest> = {}): DecisionRequest => ({
  decisionId: "FDX_1",
  matter: "Approve a TZS 250m equity participation in an industrial venture.",
  domain: "FAMILY_CAPITAL",
  requestedBy: "CIO",
  actorType: "HUMAN",
  amountMinor: 250_000_000,
  currency: "TZS",
  materialityThresholdMinor: 100_000_000,
  validation: { complete: true, missingFields: [] },
  policyReference: "FIP-2.4",
  authorityReference: "FC-3.2",
  conflictAssessment: { cleared: true, reference: "FCI_12" },
  riskAssessment: { withinAppetite: true, score: 40, reference: "RSK_88" },
  approval: { approvedBy: "FAMILY_COUNCIL", reference: "FC-RES-041" },
  executionReference: "CAP_500",
  recordReference: "GDR_2026_018",
  auditReference: "AUD_900",
  monitoringPlan: "Quarterly performance review by the Family Investment Committee.",
  ...over,
});

describe("Phase 1-2 engine determinism (regression)", () => {
  it("eligibility assessment is deterministic", () => {
    const a = evaluateEligibility("FAMILY_OWNERSHIP", eligibilityInput);
    const b = evaluateEligibility("FAMILY_OWNERSHIP", eligibilityInput);
    expect(a).toEqual(b);
  });

  it("capital pool assessment is deterministic", () => {
    expect(assessCapitalPool(pool)).toEqual(assessCapitalPool(pool));
  });

  it("descent graph construction is deterministic", () => {
    const nodes = [founder, gen2, gen3];
    expect(buildDescentGraph(nodes)).toEqual(buildDescentGraph(nodes));
  });

  it("decision gate is deterministic", () => {
    expect(evaluateDecisionGate(fullRequest())).toEqual(evaluateDecisionGate(fullRequest()));
  });
});

/* ---------------- Phase 1-2 regression: fail-closed behavior ---------------- */

describe("Phase 1-2 fail-closed behavior (regression)", () => {
  it("the decision gate blocks when a governing reference is missing (fail closed)", () => {
    // A missing policy reference is a hard FAILED step: the gate names it.
    const noPolicy = evaluateDecisionGate(fullRequest({ policyReference: undefined }));
    expect(noPolicy.complete).toBe(false);
    expect(noPolicy.blockingStep).toBe("CHECK_POLICY");

    // A missing audit reference halts the gate: incomplete, and the AUDIT
    // step is NOT_REACHED (nothing past the gap is legitimately reached).
    const noAudit = evaluateDecisionGate(fullRequest({ auditReference: undefined }));
    expect(noAudit.complete).toBe(false);
    const auditStep = noAudit.steps.find((s) => s.step === "AUDIT");
    expect(auditStep?.state).toBe("NOT_REACHED");
  });

  it("a fully evidenced decision completes (baseline preserved)", () => {
    const a = evaluateDecisionGate(fullRequest());
    expect(a.complete).toBe(true);
    expect(a.stepReached).toBe("MONITOR");
    expect(a.blockingStep).toBeNull();
  });

  it("AI may not resolve a policy decision (FIR-017/I-12)", () => {
    const requirement = STANDING_POLICY_DECISIONS[0];
    expect(() =>
      resolvePolicyDecision(requirement, {
        actorType: "AI",
        decisionMaker: "NOELIA",
        decision: "Adopt option 1.",
        decisionReference: "FC-RES-099",
        effectiveDate: "2026-06-01",
      }),
    ).toThrow(/may not resolve policy decision/);
  });

  it("checkSupremacy detects a superior-instrument conflict (I-08)", () => {
    const provision: ConstitutionProvision = {
      provisionId: "FCP_T_1",
      clauseRef: "FC-9.1",
      domain: "FAMILY_CAPITAL",
      title: "Test provision",
      body: "Family members decide trust distributions.",
      version: "1.0.0",
      status: "ACTIVE",
      effectiveFrom: "2026-01-01",
      effectiveTo: null,
      ratifiedByReference: "FC-RES-T_1",
      subordinateTo: [
        "APPLICABLE_LAW",
        "COURT_ORDER",
        "TRUST_INSTRUMENT",
        "TRUSTEE_FIDUCIARY_DUTY",
        "REGULATORY_REQUIREMENT",
      ],
    };
    const conflicting = checkSupremacy(provision, {
      attemptedOverrides: ["TRUST_INSTRUMENT"],
      trusteeMattersClaimed: ["TRUST_DISTRIBUTION"],
      trusteeIndependencePreserved: false,
      legalReviewReference: "LR_T_1",
    });
    expect(conflicting.permitted).toBe(false);
    expect(conflicting.overrides).toContain("TRUST_INSTRUMENT");
    expect(conflicting.trusteeMattersClaimed).toContain("TRUST_DISTRIBUTION");
  });
});

describe("production-surface exposure (STEP 15 / no production API)", () => {
  const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

  function listSourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...listSourceFiles(p));
      else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }

  it("no production route (src/app) imports Phase 3A infrastructure", () => {
    const appDir = join(repoRoot, "src", "app");
    const routeFiles = listSourceFiles(appDir);
    expect(routeFiles.length).toBeGreaterThan(0);
    for (const file of routeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not expose Phase 3A infrastructure`).not.toMatch(/family[\\/]phase3/);
    }
  });

  it("no non-test src file imports Phase 3A infrastructure (dormant layer)", () => {
    const phase3Dir = join(repoRoot, "src", "lib", "family", "phase3");
    for (const file of listSourceFiles(join(repoRoot, "src"))) {
      if (file.startsWith(phase3Dir)) continue;
      const source = readFileSync(file, "utf8");
      expect(source, `${file} must not import Phase 3A infrastructure`).not.toMatch(/family[\\/]phase3/);
    }
  });
});
