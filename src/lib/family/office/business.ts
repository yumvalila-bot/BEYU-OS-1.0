/**
 * BEYU OS — Family Office: business development engineering.
 *
 * The business RAILS: references to family business legal entities,
 * ownership REFERENCES (attribution — never percentages, never values),
 * business engagements, and non-financial business instructions.
 *
 * HARD BOUNDARIES:
 *   - ownership is referenced against CANONICAL LEGAL ENTITIES only;
 *     the office never stores ownership percentages or valuation —
 *     attribution lives with the legal entity record;
 *   - a business instruction is NON-FINANCIAL: it carries references
 *     (policy, resolution, evidence, actor) and a purpose statement;
 *     any financial state field in it is a FINANCE_BOUNDARY_VIOLATION;
 *   - business actions that create financial state go to the Finance OS
 *     via the canonical handoff (see capital.ts).
 */

import { familyError } from "../phase3/errors";
import { assertNoFinancialState, type HumanActorRef } from "../phase3/contracts";
import { isIsoDate, type EffectivePeriod } from "./types";

export const BUSINESS_TYPES = ["FAMILY_OPERATING_BUSINESS", "INVESTMENT_HOLDER", "PROPERTY_ENTITY", "VEHICLE", "OTHER"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

export interface BusinessReference {
  businessRef: string;
  /** The canonical legal entity this business is attributed to. */
  legalEntityRef: string;
  businessType: BusinessType;
  tenantId: string;
}

export function assertBusinessReference(b: BusinessReference): void {
  if (typeof b.legalEntityRef !== "string" || b.legalEntityRef.trim() === "") {
    throw familyError("EVIDENCE_INSUFFICIENT", "A business reference attributes to a canonical legal entity reference.", []);
  }
  if (!(BUSINESS_TYPES as readonly string[]).includes(b.businessType)) {
    throw familyError("EVIDENCE_INSUFFICIENT", `Unknown business type "${b.businessType}".`, []);
  }
}

/**
 * An ownership reference: "party X has an ownership interest in legal
 * entity Y, per these evidence documents." No percentage, no class, no
 * value — those are the legal entity's own attribution (Finance/legal
 * territory). Inferring ownership from family relationship is refused.
 */
export interface OwnershipReference {
  ownershipRef: string;
  partyRef: string;
  legalEntityRef: string;
  /** Evidence documents (checksum-bound) establishing this attribution. */
  evidenceRefs: readonly string[];
  /**
   * Provenance guard: if this reference is based on genealogical
   * relationship only, it is INVALID — ownership is never inferred from
   * family relationship. This field exists to let the validator reject
   * exactly that case.
   */
  derivedFrom: "LEGAL_DOCUMENT" | "GOVERNANCE_RECORD" | "FAMILY_RELATIONSHIP";
  tenantId: string;
}

export function assertOwnershipReference(o: OwnershipReference): void {
  if (o.derivedFrom === "FAMILY_RELATIONSHIP") {
    throw familyError("POLICY_INVENTION_REFUSED", "Ownership is never inferred from family relationship. Genealogy is not attribution.", []);
  }
  if (o.evidenceRefs.length === 0) {
    throw familyError("EVIDENCE_INSUFFICIENT", "An ownership reference requires at least one evidence document.", []);
  }
  assertNoFinancialState(o, "OwnershipReference");
}

export interface BusinessEngagement {
  engagementRef: string;
  businessRef: string;
  purpose: string;
  status: "PROPOSED" | "ACTIVE" | "COMPLETED" | "TERMINATED";
  period: EffectivePeriod | null;
  authorityRef: string | null;
  tenantId: string;
}

export function assertBusinessEngagement(e: BusinessEngagement): void {
  if (e.status === "ACTIVE" && (e.authorityRef === null || e.authorityRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An ACTIVE business engagement requires its authority reference.", []);
  }
  if (e.period !== null && !isIsoDate(e.period.effectiveFrom)) {
    throw familyError("EVIDENCE_INSUFFICIENT", "Engagement period must start at an ISO date.", []);
  }
}

export const BUSINESS_INSTRUCTION_STATUSES = ["DRAFT", "SUBMITTED", "REJECTED", "WITHDRAWN", "CLOSED_BY_REFERENCE"] as const;
export type BusinessInstructionStatus = (typeof BUSINESS_INSTRUCTION_STATUSES)[number];

/**
 * A NON-FINANCIAL business instruction: the reference + approval +
 * evidence for a business act. It never carries amounts or financial
 * state (FIR-018) — if the act has a financial aspect, the instruction
 * references the Finance OS instruction (financeInstructionRef) instead.
 */
export interface BusinessInstruction {
  instructionRef: string;
  businessRef: string;
  purpose: string;
  action: string;
  policyRefs: readonly string[];
  resolutionRefs: readonly string[];
  evidenceRefs: readonly string[];
  actor: HumanActorRef;
  jurisdictionRef: string | null;
  /** Present when the act has a financial aspect (the Finance instruction is the truth). */
  financeInstructionRef: string | null;
  familyStatus: BusinessInstructionStatus;
  createdAt: string;
  tenantId: string;
}

export function assertBusinessInstruction(i: BusinessInstruction): void {
  if (!isIsoDate(i.createdAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Business instruction createdAt must be an ISO date.", []);
  if (!(BUSINESS_INSTRUCTION_STATUSES as readonly string[]).includes(i.familyStatus)) {
    throw familyError("AUTHORITY_UNPROVEN", `Unknown instruction status "${i.familyStatus}".`, []);
  }
  if (i.actor.actorType !== "HUMAN") {
    throw familyError("HUMAN_ACTOR_REQUIRED", "A business instruction is a human act (FIR-017).", []);
  }
  if (i.policyRefs.length === 0) {
    throw familyError("AUTHORITY_UNPROVEN", "A business instruction cites at least one ratified policy reference.", []);
  }
  if (i.resolutionRefs.length === 0) {
    throw familyError("AUTHORITY_UNPROVEN", "A business instruction cites at least one resolution/authority reference.", []);
  }
  // FIR-018: no financial state anywhere in the instruction.
  assertNoFinancialState(i, "BusinessInstruction");
}

export interface BusinessDevelopmentProposal {
  proposalRef: string;
  businessRef: string;
  description: string;
  policyRefs: readonly string[];
  authorityRef: string | null;
  status: "DRAFT" | "PROPOSED" | "APPROVED" | "REJECTED" | "WITHDRAWN";
  tenantId: string;
}

export function assertBusinessDevelopmentProposal(p: BusinessDevelopmentProposal): void {
  if (p.status === "APPROVED" && (p.authorityRef === null || p.authorityRef.trim() === "")) {
    throw familyError("AUTHORITY_UNPROVEN", "An APPROVED business development proposal requires its authority reference.", []);
  }
  assertNoFinancialState(p, "BusinessDevelopmentProposal");
}
