/**
 * BEYU OS — Family Office protection: insurance beneficiary designations.
 *
 * THE DISTINCTION THIS MODULE EXISTS TO ENFORCE (§6):
 *
 *   Family beneficiary (people.beneficiaries)      — trust entitlement under a
 *       ratified family policy; governed by the trust instrument.
 *   Insurance beneficiary designation (this file)  — a designation under an
 *       insurer's contract, revocable by the POLICY OWNER per that contract.
 *   Trust beneficiary, corporate shareholder, legal owner of the policy — each
 *       again distinct.
 *
 * The same underlying party may appear in more than one register. That is a
 * coincidence of identity, not a shared entitlement: nothing here reads the
 * trust register, nothing in the trust register reaches here, and no record in
 * either is ever converted into the other by the system. A conversion, if the
 * family ever chooses one, is a legal act outside this engine.
 *
 * Allocation arithmetic (§7/§31): percentages are stored in parts-per-million
 * integers (100% = 100_000_000 on a 1e6 scale; the engine's canonical unit is
 * `pctMillionths`, so 12.5% = 12_500_000) and are summed exactly — never with
 * floats. A set of active PRIMARY designations must sum to exactly one hundred
 * millionths unless a single RESIDUARY designation is present to absorb the
 * remainder. Two residuary designations is contradictory, so it is refused.
 */

import {
  DESIGNATION_STATUSES,
  DESIGNATION_TYPES,
  ENTITLEMENT_BASES,
  isIsoDate,
  type DesignationStatus,
  type DesignationType,
  type EntitlementBasis,
  type ReviewFinding,
  type ReviewFindingSeverity,
} from "./types";

/** One percent, in exact integer millionths of a percent. */
export const PCT_UNIT = 1_000_000;
/** One hundred percent: the whole of the benefit. */
export const PCT_SCALE = 100 * PCT_UNIT;

export type BeneficiaryDesignation = {
  id: string;
  policyId: string;
  beneficiaryRef: string;
  /** What kind of party the designation runs to — recorded, never inferred. */
  beneficiaryKind: "FAMILY_MEMBER" | "LEGAL_ENTITY" | "TRUST" | "CHARITABLE" | "OTHER";
  designationType: DesignationType;
  entitlementBasis: EntitlementBasis;
  /** Set only for PERCENTAGE / RESIDUARY bases; integer millionths of a percent. */
  pctMillionths: number | null;
  /** Set only for FIXED_AMOUNT bases; integer minor units. */
  fixedAmountMinor: number | null;
  currency: string | null;
  effectiveDate: string;
  endDate: string | null;
  status: DesignationStatus;
  relationshipBasis: string;
  notes: string | null;
};

export function validateDesignation(d: BeneficiaryDesignation): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const add = (code: ReviewFinding["code"], severity: ReviewFindingSeverity, detail: string) =>
    findings.push({ code, severity, detail });

  if (!d.beneficiaryRef?.trim()) add("MISSING_BENEFICIARY", "ESCALATE", "A designation without a named beneficiary is a placeholder, and a placeholder on a live contract is the exact failure this register exists to catch.");
  if (!DESIGNATION_TYPES.includes(d.designationType)) add("MISSING_BENEFICIARY", "WARNING", `designationType must be ${DESIGNATION_TYPES.join(" | ")}.`);
  if (!ENTITLEMENT_BASES.includes(d.entitlementBasis)) add("BENEFICIARY_ALLOCATION_MISMATCH", "WARNING", `entitlementBasis must be ${ENTITLEMENT_BASES.join(" | ")}.`);
  if (!DESIGNATION_STATUSES.includes(d.status)) add("OUTDATED_BENEFICIARY", "WARNING", "status is outside the controlled designation lifecycle.");
  if (!isIsoDate(d.effectiveDate)) add("OUTDATED_BENEFICIARY", "WARNING", "effectiveDate must be an ISO calendar date.");
  if (d.endDate !== null && (!isIsoDate(d.endDate) || d.endDate <= d.effectiveDate)) add("OUTDATED_BENEFICIARY", "WARNING", "endDate must be an ISO calendar date after effectiveDate.");

  if (d.entitlementBasis === "PERCENTAGE") {
    if (d.pctMillionths === null || !Number.isSafeInteger(d.pctMillionths) || d.pctMillionths <= 0 || d.pctMillionths > PCT_SCALE) {
      add("BENEFICIARY_ALLOCATION_MISMATCH", "WARNING", "A PERCENTAGE designation carries an integer pctMillionths in (0, 100000000].");
    }
    if (d.fixedAmountMinor !== null) add("BENEFICIARY_ALLOCATION_MISMATCH", "NOTICE", "PERCENTAGE designations carry no fixed amount; choose one basis.");
  }
  if (d.entitlementBasis === "FIXED_AMOUNT") {
    if (d.fixedAmountMinor === null || !Number.isSafeInteger(d.fixedAmountMinor) || d.fixedAmountMinor <= 0) {
      add("BENEFICIARY_ALLOCATION_MISMATCH", "WARNING", "A FIXED_AMOUNT designation carries a positive integer minor-unit amount.");
    }
    if (!d.currency || !/^[A-Z]{3}$/.test(d.currency)) add("BENEFICIARY_ALLOCATION_MISMATCH", "WARNING", "A FIXED_AMOUNT designation must carry the currency its amount is denominated in.");
    if (d.pctMillionths !== null) add("BENEFICIARY_ALLOCATION_MISMATCH", "NOTICE", "FIXED_AMOUNT designations carry no percentage; choose one basis.");
  }
  if (d.entitlementBasis === "RESIDUARY") {
    if (d.pctMillionths !== null || d.fixedAmountMinor !== null) add("BENEFICIARY_ALLOCATION_MISMATCH", "NOTICE", "A RESIDUARY designation takes what remains and carries no explicit share.");
  }
  if (!d.relationshipBasis?.trim()) add("MISSING_BENEFICIARY", "NOTICE", "relationshipBasis states WHY the designation exists (e.g. contract clause, court order, owner instruction); it is recorded so reviews can check it against a changed family situation.");
  return findings;
}

/** A designation is "standing" for allocation purposes if ACTIVE and not expired at asOf. */
export function designationStands(d: BeneficiaryDesignation, asOf: string): boolean {
  if (d.status !== "ACTIVE") return false;
  if (d.effectiveDate > asOf) return false;
  if (d.endDate !== null && d.endDate <= asOf) return false;
  return true;
}

export type AllocationSummary = {
  ok: boolean;
  standingPrimaries: number;
  standingContingents: number;
  primaryPercentageSumMillionths: number | null;
  fixedAmountSumMinor: number | null;
  hasResiduary: boolean;
  findings: ReviewFinding[];
};

/**
 * Deterministic allocation audit of one policy's designations at a date.
 *
 * Percentages only mix with percentages: a policy that mixes PERCENTAGE and
 * FIXED_AMOUNT primaries has no derivable single allocation, and the engine
 * says so instead of picking a convention.
 */
export function summariseAllocations(designations: readonly BeneficiaryDesignation[], asOf: string): AllocationSummary {
  const standing = designations.filter((d) => designationStands(d, asOf));
  const primaries = standing.filter((d) => d.designationType === "PRIMARY");
  const contingents = standing.filter((d) => d.designationType === "CONTINGENT");
  const findings: ReviewFinding[] = [];

  const residuaryPrimaries = primaries.filter((d) => d.entitlementBasis === "RESIDUARY");
  const percentagePrimaries = primaries.filter((d) => d.entitlementBasis === "PERCENTAGE");
  const fixedPrimaries = primaries.filter((d) => d.entitlementBasis === "FIXED_AMOUNT");

  let primarySum: number | null = null;
  let fixedSum: number | null = null;

  if (percentagePrimaries.length > 0 && fixedPrimaries.length > 0) {
    findings.push({ code: "BENEFICIARY_ALLOCATION_MISMATCH", severity: "ESCALATE", detail: "This policy's PRIMARY designations mix PERCENTAGE and FIXED_AMOUNT bases; the contract's own allocation rules decide which governs, so the engine reports no consolidated allocation." });
  } else {
    primarySum = percentagePrimaries.length > 0 ? percentagePrimaries.reduce((acc, d) => acc + (d.pctMillionths ?? 0), 0) : null;
    fixedSum = fixedPrimaries.length > 0 ? fixedPrimaries.reduce((acc, d) => acc + (d.fixedAmountMinor ?? 0), 0) : null;
    if (primarySum !== null && primarySum > PCT_SCALE) {
      findings.push({ code: "BENEFICIARY_ALLOCATION_MISMATCH", severity: "ESCALATE", detail: `Active PRIMARY percentages sum to ${primarySum / PCT_UNIT}% — over the whole estate of the benefit.` });
    } else if (primarySum !== null && primarySum < PCT_SCALE && residuaryPrimaries.length === 0) {
      findings.push({ code: "BENEFICIARY_ALLOCATION_MISMATCH", severity: "WARNING", detail: `Active PRIMARY percentages sum to ${primarySum / PCT_UNIT}% with no RESIDUARY designation to absorb the remainder.` });
    }
  }
  if (residuaryPrimaries.length > 1) {
    findings.push({ code: "BENEFICIARY_ALLOCATION_MISMATCH", severity: "ESCALATE", detail: "More than one active RESIDUARY primary is contradictory." });
  }
  if (primaries.length === 0) {
    findings.push({ code: "MISSING_BENEFICIARY", severity: "ESCALATE", detail: "No standing PRIMARY designation at this date — a policy that pays without a beneficiary pays into an estate the family did not choose." });
  }
  const expiredButActive = designations.filter((d) => d.status === "ACTIVE" && d.endDate !== null && d.endDate <= asOf);
  if (expiredButActive.length > 0) {
    findings.push({ code: "OUTDATED_BENEFICIARY", severity: "WARNING", detail: `${expiredButActive.length} designation(s) are ACTIVE past their recorded end date; the register has not been brought forward.` });
  }
  const futureEffective = designations.filter((d) => d.status === "ACTIVE" && d.effectiveDate > asOf);
  if (futureEffective.length > 0) {
    findings.push({ code: "OUTDATED_BENEFICIARY", severity: "NOTICE", detail: `${futureEffective.length} designation(s) are marked ACTIVE before their effective date; they are excluded from the standing allocation.` });
  }

  return {
    ok: findings.every((f) => f.severity !== "ESCALATE" && f.severity !== "WARNING"),
    standingPrimaries: primaries.length,
    standingContingents: contingents.length,
    primaryPercentageSumMillionths: primarySum,
    fixedAmountSumMinor: fixedSum,
    hasResiduary: residuaryPrimaries.length > 0,
    findings,
  };
}
