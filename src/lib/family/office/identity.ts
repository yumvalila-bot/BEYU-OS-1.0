/**
 * BEYU OS — Family Office: family identity engineering.
 *
 * The identity RAILS: reference structures tying family members to the
 * canonical identity primitives (parties/users/tenants/legal entities/
 * jurisdictions) plus the genealogical context structures.
 *
 * What this layer does NOT do (policy):
 *   - no membership criteria — membership is a canonical record reference,
 *     not something this layer confers or filters;
 *   - no beneficiary status — genealogical relationship ≠ entitlement
 *     (a relationship record cannot confer, and does not carry, any
 *     entitlement);
 *   - no legal relationship inference — a FamilyRelationship carries a
 *     legalEffectReference that is null until a ratified rule says
 *     otherwise; structure is not effect.
 */

import { familyError } from "../phase3/errors";
import { LINEAGE_RELATIONSHIPS, type LineageRelationship, type ParticipationGrant } from "../model";
import type { FamilyEvidenceRef } from "../phase3/contracts";
import { assertScopeShape, type OfficeScope } from "./types";

export function isLineageRelationship(value: string): value is LineageRelationship {
  return (LINEAGE_RELATIONSHIPS as readonly string[]).includes(value);
}

/**
 * A family member record is a REFERENCE bundle over canonical records.
 * It creates no membership: who may be a family member is a ratified
 * policy (FIR-001/002/003) — this structure merely names the references.
 */
export interface FamilyMember {
  memberRef: string;
  /** Canonical global user identity (users/particles). */
  globalUserId: string;
  /** Canonical party reference. */
  partyRef: string;
  /** Legal attribution (core.legal_entities) — attribution, not ownership. */
  legalEntityRef: string | null;
  scope: OfficeScope;
  /** Canonical country code (identity boundary, unchanged). */
  countryCode: string;
  /** Participation axes grant — a reference to a ratified grant, not a rule. */
  participation: ParticipationGrant | null;
}

export function assertFamilyMember(m: FamilyMember): void {
  if (typeof m.memberRef !== "string" || m.memberRef.trim() === "") throw familyError("AUTHORITY_UNPROVEN", "FamilyMember.memberRef is required.", []);
  if (typeof m.globalUserId !== "string" || m.globalUserId.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "FamilyMember.globalUserId is required — identity is canonical, never local.", []);
  }
  if (typeof m.partyRef !== "string" || m.partyRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "FamilyMember.partyRef is required (canonical parties).", []);
  }
  assertScopeShape(m.scope, "FamilyMember");
  if (typeof m.countryCode !== "string" || m.countryCode.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "FamilyMember.countryCode is required (explicit country boundary).", []);
  }
}

/** Pure reference to canonical identity — no attributes, no effects. */
export interface FamilyIdentityReference {
  globalUserId: string;
  partyRef: string;
  tenantId: string;
}

/**
 * A genealogical relationship EDGE. `relationshipType` reuses the canonical
 * lineage vocabulary (model.ts). `legalEffectReference` is null until a
 * ratified rule determines any legal effect — the edge is a fact of
 * descent/affinity, never a source of rights.
 */
export interface FamilyRelationship {
  relationshipRef: string;
  fromMemberRef: string;
  toMemberRef: string;
  relationshipType: LineageRelationship;
  /** Evidence (canonical document + checksum) — KDD-3. */
  evidenceRef: FamilyEvidenceRef | null;
  /** Reference to the ratified rule determining legal effect (null = none determined). */
  legalEffectReference: string | null;
  tenantId: string;
}

export function assertFamilyRelationship(r: FamilyRelationship): void {
  if (!isLineageRelationship(r.relationshipType)) {
    throw familyError("LINEAGE_GRAPH_INVALID", `Unknown relationship type "${r.relationshipType}". The canonical lineage vocabulary is closed.`, []);
  }
  if (r.fromMemberRef === r.toMemberRef) {
    throw familyError("LINEAGE_GRAPH_INVALID", "A relationship edge cannot connect a member to itself.", []);
  }
  if (typeof r.legalEffectReference !== "string" && r.legalEffectReference !== null) {
    throw familyError("AUTHORITY_UNPROVEN", "legalEffectReference must be a reference or null (no effect is assumed).", []);
  }
}

/** A household is a reference grouping only — no household rules live here. */
export interface FamilyHousehold {
  householdRef: string;
  memberRefs: readonly string[];
  scope: OfficeScope;
}

/** A branch of the family tree — reference structure over members. */
export interface FamilyBranch {
  branchRef: string;
  rootMemberRef: string | null;
  memberRefs: readonly string[];
  tenantId: string;
}

/**
 * A generation is a structural ordinal context (intergenerational planning).
 * The ordinal is bookkeeping; it confers nothing.
 */
export interface FamilyGeneration {
  generationRef: string;
  ordinal: number;
  memberRefs: readonly string[];
  tenantId: string;
}

/** Lineage context: a checksummed descent-graph snapshot (lineage engine). */
export interface FamilyLineage {
  lineageRef: string;
  /** Checksum of the assessed descent graph (lineage.ts output). */
  descentGraphChecksum: string;
  engineVersion: string;
  memberRefs: readonly string[];
  tenantId: string;
}

/**
 * Participation in the institution: who participates, on which axes, under
 * which scope. Axes reuse the canonical participation vocabulary; a null
 * grant means "no ratified grant recorded" — not "default participation".
 */
export interface FamilyInstitutionParticipant {
  participantRef: string;
  memberRef: string;
  participationAxes: ParticipationGrant | null;
  scope: OfficeScope;
  /** Reference to the ratified grant/mandate (null = none recorded). */
  grantReference: string | null;
}
