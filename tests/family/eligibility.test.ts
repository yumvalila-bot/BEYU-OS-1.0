import { describe, expect, it } from "vitest";
import {
  evaluateEligibility,
  evaluateAllDomains,
  assertNoAutomaticConferment,
  assertNoSpousalInheritanceOfFamilyLineRights,
  assertEligibilityWriteIsHuman,
  summariseDeterminations,
  type EligibilityInput,
} from "../../src/lib/family/eligibility";
import { FamilyInstitutionError } from "../../src/lib/family/model";

/**
 * Direct Descendant Principle and the Spouse Rule — pure engine, no database.
 */

const descendantInput = (over: Partial<EligibilityInput> = {}): EligibilityInput => ({
  memberId: "FAM_G3A",
  relationshipToParent: "BIRTH_DESCENDANT",
  descendantStatus: "DIRECT_DESCENDANT",
  descendantDetermination: null,
  lineageVerified: true,
  instrumentProvisions: [],
  throughDescendantAuthorisations: [],
  asOf: "2026-01-01",
  ...over,
});

const spouseInput = (over: Partial<EligibilityInput> = {}): EligibilityInput =>
  descendantInput({
    memberId: "FAM_SPOUSE",
    relationshipToParent: "SPOUSE_OF_MEMBER",
    descendantStatus: "NON_DESCENDANT",
    ...over,
  });

describe("the direct descendant principle", () => {
  it("finds a verified direct descendant eligible under family policy", () => {
    const d = evaluateEligibility("FAMILY_OWNERSHIP", descendantInput());
    expect(d.result).toBe("ELIGIBLE");
    expect(d.basis.join(" ")).toMatch(/verified direct descendant/);
  });

  it("marks Trust and share domains advisory — the Family Office cannot confer them", () => {
    const trust = evaluateEligibility("DIRECT_TRUST_BENEFIT", descendantInput());
    expect(trust.result).toBe("ELIGIBLE");
    expect(trust.advisoryOnly).toBe(true);
    expect(trust.requiredAuthority).toMatch(/Trustees/);

    const shares = evaluateEligibility("SHARES", descendantInput());
    expect(shares.advisoryOnly).toBe(true);
  });

  it("is INDETERMINATE, never eligible, when lineage is unverified", () => {
    const d = evaluateEligibility("FAMILY_OWNERSHIP", descendantInput({ lineageVerified: false }));
    expect(d.result).toBe("INDETERMINATE");
    expect(d.blockers).toContain("LINEAGE_NOT_VERIFIED");
  });

  it("is INDETERMINATE with a policy decision when the descendant status is unresolved", () => {
    const d = evaluateEligibility(
      "DIRECT_CAPITAL_PARTICIPATION",
      descendantInput({
        descendantStatus: "ADOPTION_UNCONFIRMED",
        descendantDetermination: {
          engineVersion: "family-lineage-1.0.0",
          memberId: "FAM_ADOPTED",
          status: "ADOPTION_UNCONFIRMED",
          generation: 2,
          branch: "BEYU::FAM_ADOPTED",
          chain: ["FAM_FOUNDER", "FAM_ADOPTED"],
          basis: [],
          blockers: ["ADOPTION_TREATMENT_NOT_RATIFIED"],
          policyDecisionRequired: {
            code: "FAM-PD-002",
            issue: "Adoption treatment",
            domain: "FAMILY_OWNERSHIP",
            options: ["a", "b"],
            assumptions: [],
            legalImplications: "x",
            taxImplications: "x",
            financialImplications: "x",
            risk: "x",
            decisionAuthority: "Family Council",
            status: "OPEN",
            decision: null,
            decisionReference: null,
            effectiveDate: null,
          },
          directDescendant: false,
        },
      }),
    );

    expect(d.result).toBe("INDETERMINATE");
    expect(d.blockers).toContain("ADOPTION_TREATMENT_NOT_RATIFIED");
    expect(d.policyDecisionRequired?.code).toBe("FAM-PD-002");
  });

  it("excludes a non-descendant absent an express instrument provision", () => {
    const d = evaluateEligibility(
      "FAMILY_OWNERSHIP",
      descendantInput({ relationshipToParent: "STEPCHILD", descendantStatus: "NON_DESCENDANT" }),
    );
    expect(d.result).toBe("NOT_ELIGIBLE");
    expect(d.blockers).toContain("NOT_A_DIRECT_DESCENDANT");
  });

  it("permits a non-descendant expressly named by an instrument", () => {
    const d = evaluateEligibility(
      "FAMILY_OWNERSHIP",
      descendantInput({
        relationshipToParent: "STEPCHILD",
        descendantStatus: "NON_DESCENDANT",
        instrumentProvisions: [
          {
            instrumentReference: "TRUST-2024 cl.9",
            domain: "FAMILY_OWNERSHIP",
            wording: "including the children of the Settlor's spouse",
          },
        ],
      }),
    );
    expect(d.result).toBe("ELIGIBLE");
    expect(d.basis.join(" ")).toMatch(/express instrument provision/);
  });
});

describe("the spouse rule", () => {
  it("refuses every domain for a spouse with no express provision and no authorisation", () => {
    const results = evaluateAllDomains(spouseInput());
    expect(results.length).toBe(6);
    for (const r of results) {
      expect(r.result).toBe("NOT_ELIGIBLE");
      expect(r.blockers).toContain("NO_EXPRESS_INSTRUMENT_PROVISION");
      expect(r.blockers).toContain("NO_THROUGH_DESCENDANT_AUTHORISATION");
    }
  });

  it("states that marriage confers nothing automatically", () => {
    const d = evaluateEligibility("SHARES", spouseInput());
    expect(d.basis.join(" ")).toMatch(/Marriage does not automatically create/);
  });

  it("permits a derivative benefit only through an eligible direct descendant, in window and in scope", () => {
    const authorisation = {
      viaDescendantMemberId: "FAM_G2A",
      authorityReference: "FC-RES-014",
      effectiveFrom: "2025-01-01",
      effectiveTo: "2027-12-31",
      scope: ["DIRECT_FAMILY_PRIVILEGES" as const],
    };

    const inScope = evaluateEligibility(
      "DIRECT_FAMILY_PRIVILEGES",
      spouseInput({ throughDescendantAuthorisations: [authorisation] }),
    );
    expect(inScope.result).toBe("ELIGIBLE");
    expect(inScope.blockers).toContain("BENEFIT_IS_DERIVATIVE_NOT_INHERENT");

    const outOfScope = evaluateEligibility(
      "FAMILY_OWNERSHIP",
      spouseInput({ throughDescendantAuthorisations: [authorisation] }),
    );
    expect(outOfScope.result).toBe("NOT_ELIGIBLE");

    const expired = evaluateEligibility(
      "DIRECT_FAMILY_PRIVILEGES",
      spouseInput({
        throughDescendantAuthorisations: [{ ...authorisation, effectiveTo: "2025-12-31" }],
        asOf: "2026-01-01",
      }),
    );
    expect(expired.result).toBe("NOT_ELIGIBLE");
  });

  it("permits expressly governed spousal participation from an instrument", () => {
    const d = evaluateEligibility(
      "DIRECT_FAMILY_PRIVILEGES",
      spouseInput({
        instrumentProvisions: [
          {
            instrumentReference: "FC-4.3",
            domain: "DIRECT_FAMILY_PRIVILEGES",
            wording: "a spouse may attend Family Assembly as a consultee",
          },
        ],
      }),
    );
    expect(d.result).toBe("ELIGIBLE");
    expect(d.basis.join(" ")).toMatch(/granted by the instrument, not by the marriage/);
  });
});

describe("forbidden conflations", () => {
  it.each([
    "MARRIAGE",
    "FAMILY_NAME",
    "EMPLOYMENT_IN_FAMILY_BUSINESS",
    "EDUCATIONAL_CERTIFICATE",
    "PROFESSIONAL_LICENSE",
    "AI_RECOMMENDATION",
  ])("refuses eligibility conferred by %s", (source) => {
    expect(() => assertNoAutomaticConferment(source, "FAMILY_OWNERSHIP")).toThrow(
      FamilyInstitutionError,
    );
  });

  it("refuses a spouse inheriting a direct descendant's family-line rights", () => {
    expect(() =>
      assertNoSpousalInheritanceOfFamilyLineRights({
        spouseMemberId: "FAM_SPOUSE",
        descendantMemberId: "FAM_G2A",
        claimedRights: ["OWNERSHIP", "SUCCESSION_RIGHT"],
      }),
    ).toThrow(/cannot inherit a direct descendant's BEYU family-line rights/);
  });

  it("permits a claim that is not a family-line right", () => {
    expect(() =>
      assertNoSpousalInheritanceOfFamilyLineRights({
        spouseMemberId: "FAM_SPOUSE",
        descendantMemberId: "FAM_G2A",
        claimedRights: ["ATTENDANCE_AT_FAMILY_EVENTS"],
      }),
    ).not.toThrow();
  });

  it("refuses an AI actor writing eligibility", () => {
    expect(() => assertEligibilityWriteIsHuman("AI", "record")).toThrow(/may not record/);
  });
});

describe("input validation and reporting", () => {
  it("rejects a malformed asOf date", () => {
    expect(() => evaluateEligibility("SHARES", descendantInput({ asOf: "2026/01/01" }))).toThrow(
      FamilyInstitutionError,
    );
  });

  it("summarises without exposing identities", () => {
    const summary = summariseDeterminations(evaluateAllDomains(spouseInput()));
    expect(summary.byDomain["FAMILY_OWNERSHIP"].notEligible).toBe(1);
    expect(summary.advisoryOnly).toBeGreaterThan(0);
    expect(JSON.stringify(summary)).not.toContain("FAM_SPOUSE");
  });
});
