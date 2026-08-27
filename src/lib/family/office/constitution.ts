/**
 * BEYU OS — Family Office: constitution engineering.
 *
 * The constitutional FRAMEWORK composing the existing Phase 1–2
 * constitution engine (constitution.ts: provisions, amendments, supremacy)
 * with the new policy/ratification machinery:
 *
 *   - Constitution / Version / Article / Clause / PolicyRule structures;
 *   - AmendmentProposal → AmendmentReview (supremacy via the existing
 *     checkSupremacy) → AmendmentApproval (a ratified ratification record)
 *     → AmendmentEffectivity (only when the ratification's effective period
 *     has begun);
 *   - Supersession through the version chain.
 *
 * CRITICAL invariants (enforced + tested):
 *   - a draft/proposed constitution is NEVER effective merely because it
 *     exists — effectivity requires the ratified ratification record AND
 *     its effective date;
 *   - a proposal NEVER automatically creates authority;
 *   - Noelia/HIVE can NEVER ratify or amend constitutional instruments
 *     (the ratification record requires a human decision maker).
 */

import { familyError } from "../phase3/errors";
import { AMENDMENT_STAGES, type AmendmentStage, type ConstitutionDomain } from "../model";
import type { FamilyRatificationRecord, RatificationRegistry } from "./ratification";
import { activeRatification } from "./ratification";
import { isIsoDate } from "./types";

export function isAmendmentStage(value: string): value is AmendmentStage {
  return (AMENDMENT_STAGES as readonly string[]).includes(value);
}

export const CONSTITUTION_VERSION_STATUSES = ["DRAFT", "PROPOSED", "RATIFIED", "ACTIVE", "SUPERSEDED", "REVOKED"] as const;
export type ConstitutionVersionStatus = (typeof CONSTITUTION_VERSION_STATUSES)[number];

export interface FamilyConstitution {
  /** Canonical document reference (KDD-5: document-first — text lives in documents). */
  constitutionRef: string;
  documentRef: string;
  documentChecksum: string;
  version: number;
  status: ConstitutionVersionStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  supersededByRef: string | null;
  /** The ratification that made this version effective (null until ratified). */
  ratificationDecisionId: string | null;
  scopeTenantId: string;
  jurisdictionRef: string | null;
}

export function assertFamilyConstitution(c: FamilyConstitution): void {
  if (c.status === "ACTIVE") {
    if (!isIsoDate(c.effectiveFrom)) throw familyError("AUTHORITY_UNPROVEN", "An ACTIVE constitution version requires an effective date.", []);
    if (c.ratificationDecisionId === null) {
      throw familyError("AUTHORITY_UNPROVEN", "An ACTIVE constitution version requires its ratification reference. Existence is not effect.", []);
    }
  }
  if (c.status === "SUPERSEDED" && c.supersededByRef === null) {
    throw familyError("SUPERIOR_INSTRUMENT_CONFLICT", "A superseded constitution version must name its successor.", []);
  }
}

export interface ConstitutionArticle {
  articleRef: string;
  constitutionRef: string;
  articleNumber: number;
  title: string;
  clauseRefs: readonly string[];
}

export interface ConstitutionClause {
  clauseRef: string;
  articleRef: string;
  body: string;
  version: number;
  status: ConstitutionVersionStatus;
  domain: ConstitutionDomain;
}

/**
 * A constitutional rule expressed as a reference to a policy key. The
 * rule's VALUE is the policy engine's resolution of that key at the given
 * time — ratified, or POLICY_DECISION_REQUIRED. The constitution never
 * carries hard-coded rule values.
 */
export interface ConstitutionPolicyRule {
  ruleRef: string;
  clauseRef: string;
  policyKey: string;
}

export interface AmendmentProposal {
  proposalRef: string;
  constitutionRef: string;
  clauseRefs: readonly string[];
  proposedBy: string;
  stage: AmendmentStage;
  createdAt: string;
  /**
   * Effectivity flag. ALWAYS false at proposal time; becomes true only via
   * `assessAmendmentEffectivity` when the full ratification chain exists.
   * No path in this layer sets it by existence, by AI, or by default.
   */
  effective: boolean;
}

export interface AmendmentReview {
  reviewRef: string;
  proposalRef: string;
  reviewerRef: string;
  /** Supremacy result from the existing engine (checkSupremacy). */
  supremacyPermitted: boolean;
  supremacyReason: string;
  reviewedAt: string;
}

export interface AmendmentApproval {
  approvalRef: string;
  proposalRef: string;
  /** The ratified ratification record that approved the amendment. */
  ratificationDecisionId: string;
  approvedAt: string;
}

export interface AmendmentEffectivity {
  proposalRef: string;
  effectiveFrom: string;
  /** The ACTIVE constitution version this amendment produced. */
  resultingVersion: number;
}

/**
 * Effectivity assessment. An amendment is effective at `asOf` IFF:
 *   1. its approval cites a ratification record;
 *   2. that ratification is ACTIVE at `asOf` (who/authority/instrument/
 *      evidence all validated at registration);
 *   3. `asOf` is within the ratification's effective period;
 *   4. the approving decision maker was a human (validated at
 *      registration — AI ratification is refused there).
 * Otherwise: INERT, with the exact gap named. This is the mechanism by
 * which "a proposal does not automatically create authority".
 */
export function assessAmendmentEffectivity(
  registry: RatificationRegistry,
  proposal: AmendmentProposal,
  approval: AmendmentApproval,
  asOf: string,
): { effective: boolean; reason: string; resultingVersion: number | null } {
  if (!isIsoDate(asOf)) return { effective: false, reason: "asOf must be an ISO date.", resultingVersion: null };
  const record: FamilyRatificationRecord | null = registry.records.get(approval.ratificationDecisionId) ?? null;
  if (record === null) {
    return { effective: false, reason: `The approval cites ratification ${approval.ratificationDecisionId}, which is not in the registry. A proposal with no registered ratification is inert.`, resultingVersion: null };
  }
  if (record.status === "REVOKED") {
    return { effective: false, reason: `Ratification ${record.decisionId} was revoked. The amendment is inert.`, resultingVersion: null };
  }
  const active = activeRatification(registry, record.policyKey, asOf);
  if (active === null || active.decisionId !== record.decisionId) {
    return { effective: false, reason: `Ratification ${record.decisionId} is not the active ratification for ${record.policyKey} at ${asOf}.`, resultingVersion: null };
  }
  if (asOf < record.period.effectiveFrom) {
    return { effective: false, reason: `Ratification ${record.decisionId} becomes effective ${record.period.effectiveFrom}; the amendment is not yet in force.`, resultingVersion: null };
  }
  if (record.period.effectiveTo !== null && asOf > record.period.effectiveTo) {
    return { effective: false, reason: `Ratification ${record.decisionId} expired ${record.period.effectiveTo}. The amendment is no longer in force.`, resultingVersion: null };
  }
  return { effective: true, reason: "Fully ratified chain: ratification record validated, active, and within its effective period.", resultingVersion: record.policyVersion };
}

/**
 * Draft-existence test: a constitution version that merely EXISTS (DRAFT /
 * PROPOSED) is never effective, regardless of how complete it is.
 */
export function draftIsNeverEffective(version: FamilyConstitution): { effective: boolean; reason: string } {
  if (version.status === "DRAFT" || version.status === "PROPOSED") {
    return { effective: false, reason: `${version.status} version ${version.version}: existence is not effect. Effectivity requires a ratified ratification record and its effective date.` };
  }
  if (version.status === "ACTIVE" && version.ratificationDecisionId !== null) {
    return { effective: true, reason: `ACTIVE version ${version.version} under ratification ${version.ratificationDecisionId}.` };
  }
  return { effective: false, reason: `Version ${version.version} is ${version.status}.` };
}
