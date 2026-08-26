/**
 * BEYU OS — Family Office: capital engineering.
 *
 * The capital RAILS: capital references (pointing at the FINANCE OS — the
 * sole financial truth), allocation references, liquidity, cash flow, and
 * funding REFERENCE records, plus the deterministic mechanics of
 * allocation and liquidity evaluation.
 *
 * HARD BOUNDARY (FIR-018, the strongest one in the program):
 *   - the Family Office NEVER stores balances, holdings, valuations,
 *     income, tax, or positions;
 *   - it creates typed REFERENCES to the Finance OS and validates handoffs;
 *   - any attempt to persist a financial state field is refused
 *     (`FINANCE_BOUNDARY_VIOLATION`) — this is machine-enforced, not a
 *     convention;
 *   - capital allocation = a REFERENCE to a Finance allocation + the
 *     approved decision, never a computed allocation;
 *   - liquidity = a REFERENCE to a Finance liquidity assessment + its
 *     validity period, never a number the office keeps.
 *
 * The allocation mechanic here only checks that a proposed allocation
 * references an existing Finance allocation reference and an approved
 * authority — it performs no financial arithmetic and makes no financial
 * determination.
 */

import { familyError } from "../phase3/errors";
import { validateCapitalInstruction, type FamilyCapitalInstruction } from "../phase3/contracts";
import { isIsoDate } from "./types";
import type { OfficeOutcome } from "./types";
import type { PolicyRegistry } from "./policy";
import { resolvePolicy } from "./policy";

/**
 * A capital reference. `financeReference` points at the Finance OS
 * (allocation/instruction/asset reference). The office keeps NO value.
 */
export interface CapitalReference {
  capitalRef: string;
  /** The Finance OS reference this capital record points to (the truth). */
  financeReference: string;
  tenantId: string;
  legalEntityId: string | null;
  purpose: string;
}

export function assertCapitalReference(c: CapitalReference): void {
  if (typeof c.financeReference !== "string" || c.financeReference.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A capital reference must point at the Finance OS reference. The office never stores capital state.", []);
  }
}

export interface CapitalAllocation {
  allocationRef: string;
  capitalRef: string;
  /** The Finance OS allocation this record references (the truth). */
  financeAllocationRef: string;
  /** The approval decision that authorized the allocation (human, governed). */
  approvedBy: string;
  authorityRef: string;
  effectiveFrom: string;
  tenantId: string;
}

export function assertCapitalAllocation(a: CapitalAllocation): void {
  if (typeof a.financeAllocationRef !== "string" || a.financeAllocationRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "An allocation references the Finance OS allocation; it never stores an allocation amount.", []);
  }
  if (typeof a.authorityRef !== "string" || a.authorityRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "An allocation requires the authority reference under which it was approved.", []);
  }
  if (!isIsoDate(a.effectiveFrom)) throw familyError("EVIDENCE_INSUFFICIENT", "Allocation effectiveFrom must be an ISO date.", []);
}

export interface LiquidityReference {
  liquidityRef: string;
  /** The Finance OS liquidity assessment this record references (the truth). */
  financeLiquidityRef: string;
  /** The assessment's validity window (from Finance). */
  validFrom: string;
  validTo: string;
  tenantId: string;
}

export function assertLiquidityReference(l: LiquidityReference): void {
  if (typeof l.financeLiquidityRef !== "string" || l.financeLiquidityRef.trim() === "") {
    throw familyError("FINANCE_BOUNDARY_VIOLATION", "A liquidity reference points at the Finance OS assessment. The office never stores liquidity.", []);
  }
  if (!isIsoDate(l.validFrom) || !isIsoDate(l.validTo)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Liquidity validity window must be ISO dates (from Finance).", []);
  }
}

export interface CashFlowReference {
  cashFlowRef: string;
  financeCashFlowRef: string;
  periodFrom: string;
  periodTo: string;
  tenantId: string;
}

export interface FundingReference {
  fundingRef: string;
  financeFundingRef: string;
  /** The approval that authorized the funding (human, governed). */
  approvedBy: string;
  authorityRef: string;
  effectiveFrom: string;
  tenantId: string;
}

/**
 * Validate a capital instruction against the canonical Phase 3A contract
 * (which already refuses financial state, AI actors, missing authority
 * references) AND against the policy registry: every policy the
 * instruction cites must be RESOLVED (ratified) at `asOf`. This is the
 * composition point — the contract enforces the FIR-018 boundary, the
 * registry enforces "no unratified policy becomes executable behavior".
 */
export function validateCapitalInstructionHandoff(
  registry: PolicyRegistry,
  instruction: FamilyCapitalInstruction,
  asOf: string,
): OfficeOutcome<{ ok: true; instructionId: string; financeRequestId: string | null }> {
  const contractCheck = validateCapitalInstruction(instruction);
  if (!contractCheck.ok) {
    const violations = contractCheck.violations;
    return {
      state: "DENIED",
      code: violations[0].code,
      reason: violations.map((v) => `${v.field}: ${v.reason}`).join(" | "),
    };
  }
  const value = contractCheck.value;
  for (const p of value.policyRefs) {
    const resolved = resolvePolicy<Record<string, unknown>>(registry, p.policyId, asOf);
    if (resolved.state !== "RESOLVED") {
      return {
        state: "POLICY_DECISION_REQUIRED",
        policyKey: p.policyId,
        reason: `Capital instruction ${value.id} cites policy ${p.policyId}@${p.policyVersion}, which is not resolved at ${asOf}: ${resolved.reason}. An instruction citing unratified policy is not executable.`,
      };
    }
  }
  return { state: "RESOLVED", value: { ok: true, instructionId: value.id, financeRequestId: value.financeRequestId } };
}

/**
 * Allocation validation MECHANIC: checks that a proposed allocation
 * (a) references an existing Finance allocation, (b) cites a resolved,
 * ratified allocation policy, and (c) carries human authority. Performs
 * NO financial arithmetic, computes NO allocation, makes NO financial
 * determination.
 */
export function validateCapitalAllocation(
  registry: PolicyRegistry,
  policyKey: string,
  proposed: CapitalAllocation,
  asOf: string,
): OfficeOutcome<{ ok: true; allocationRef: string; financeReference: string }> {
  assertCapitalReference({ capitalRef: proposed.allocationRef, financeReference: proposed.financeAllocationRef, tenantId: proposed.tenantId, legalEntityId: null, purpose: "allocation" });
  assertCapitalAllocation(proposed);
  const policyOutcome = resolvePolicy<Record<string, unknown>>(registry, policyKey, asOf);
  if (policyOutcome.state !== "RESOLVED") {
    return policyOutcome.state === "ARCHITECTURE_DECISION_REQUIRED"
      ? { state: "ARCHITECTURE_DECISION_REQUIRED", policyKey, reason: policyOutcome.reason }
      : { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `Capital allocation policy ${policyKey} is not resolved: ${policyOutcome.reason}` };
  }
  return { state: "RESOLVED", value: { ok: true, allocationRef: proposed.allocationRef, financeReference: proposed.financeAllocationRef } };
}
