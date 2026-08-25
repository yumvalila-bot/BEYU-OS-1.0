/**
 * BEYU OS — FAMILY LINE / FAMILY TREE REGISTRY ENGINE (pure, deterministic).
 *
 * ONE canonical answer to: "is this person in the family line, at what
 * generation, on which branch, by what evidence, and are they a DIRECT
 * DESCENDANT?"
 *
 * It is built on the EXISTING registry — `people.family_members` (family_line,
 * branch, generation, parent_member_id, relationship_to_parent, direct_descendant,
 * verification_status). This module adds the ENGINE over that registry; it does
 * not replace it and it holds no records of its own.
 *
 * ========================= A NOTE ON THE WORD "LINEAGE" =======================
 *
 * This module is deliberately named around DESCENT, not lineage.
 * `src/lib/finance/lineage.ts` already owns "lineage" in BEYU OS, and it means
 * something entirely different there: the provenance of a financial figure —
 * where a number came from and what is the weakest link in its derivation. That
 * is locked by `tests/architecture/invariants.test.ts` (INVARIANT 5–7: ONE event,
 * lineage and workflow primitive), which asserts a single `buildLineage` export
 * across `src/lib`.
 *
 * Two different concepts sharing one export-name prefix is how a guard like that
 * gets weakened to accommodate the second one. The guard was right and it stayed
 * as written: genealogical descent is `buildDescentGraph`, financial provenance
 * remains `buildLineage`. If you are looking for the provenance of a number, you
 * want the Finance OS module, not this one.
 *
 * ============================ FIVE INVARIANTS =============================
 *
 * 1. DESCENT IS NEVER INFERRED. A name, an address, a shared surname or a
 *    document title produces nothing. Only a recorded parent link of a descent
 *    relationship, with verification, produces descent.
 * 2. MARRIAGE NEVER CREATES DESCENT. SPOUSE_OF_MEMBER, FORMER_SPOUSE_OF_MEMBER
 *    and OTHER_AFFINAL are affinity. They can never yield DIRECT_DESCENDANT, and
 *    a spouse can never inherit a direct descendant's family-line rights merely
 *    because of marriage.
 * 3. ADOPTION IS NOT ASSUMED EITHER WAY. An ADOPTED_CHILD is not automatically a
 *    direct descendant and not automatically excluded. The governing framework
 *    and applicable law decide. Where that is not on record the engine returns
 *    ADOPTION_UNCONFIRMED plus a policy decision requirement — it does not pick
 *    a side.
 * 4. A BROKEN CHAIN IS INDETERMINATE, NEVER DESCENT. An unknown parent, a cycle
 *    or an unverified link downgrades the determination; it never upgrades it.
 * 5. THE ENGINE GRANTS NOTHING. Its output is a family-policy determination
 *    about lineage. Ownership, shares, beneficiary status and trust benefit all
 *    remain with their own legal authorities.
 */
import {
  absentFields,
  assertIsoDate,
  DESCENT_RELATIONSHIPS,
  FamilyInstitutionError,
  isAffinalRelationship,
  isPresent,
  type DescendantStatus,
  type LineageEvidenceType,
  type LineageRelationship,
  type LineageVerificationState,
  type PolicyDecisionRequirement,
} from "./model";

export const LINEAGE_ENGINE_VERSION = "family-lineage-1.0.0";

/** Maximum chain depth the registry will walk before declaring a defect. */
export const MAX_GENERATION_DEPTH = 25;

export type DescentNode = {
  memberId: string;
  /** The family line this member belongs to (registry: `family_members.family_line`). */
  familyLine: string;
  /**
   * Parent link. For affinity relationships (spouse, former spouse, other
   * affinal) this MUST be null: they attach to the family through
   * `linkedToMemberId`, not through descent.
   */
  parentMemberId: string | null;
  relationshipToParent: LineageRelationship;
  /** The member they married into the family as, when affinity applies. */
  linkedToMemberId?: string | null;
  verificationStatus: LineageVerificationState;
  deceased?: boolean;
};

export type DescentGraphIssue = {
  memberId: string;
  issue:
    | "UNKNOWN_PARENT"
    | "PARENT_CYCLE"
    | "SELF_PARENT"
    | "AFFINAL_WITH_PARENT_LINK"
    | "DESCENT_WITHOUT_PARENT_LINK"
    | "BROKEN_LINK_TO_FOUNDER"
    | "DEPTH_EXCEEDED"
    | "DUPLICATE_MEMBER"
    | "LINE_MISMATCH";
  detail: string;
};

export type LineagePosition = {
  memberId: string;
  /** Founder generation is 1. */
  generation: number;
  branch: string;
  /** Member ids from the founder down to this member, inclusive. */
  chain: string[];
  /** True when every link from this member to a founder is a verified descent link. */
  unbrokenDescentToFounder: boolean;
  /** Relationships on the chain, from this member upward, excluding the founder. */
  descentRelationships: LineageRelationship[];
};

export type DescentGraph = {
  engineVersion: string;
  positions: Record<string, LineagePosition>;
  founders: string[];
  issues: DescentGraphIssue[];
  maxGeneration: number;
  branches: string[];
};

/* ------------------------------------------------------------------ */
/* Graph construction                                                  */
/* ------------------------------------------------------------------ */

function branchKeyForFounder(familyLine: string, memberId: string): string {
  return `${familyLine}::${memberId}`;
}

/**
 * Build the lineage graph from a flat set of registry rows.
 *
 * Structural defects are REPORTED, never silently repaired: a cycle is listed as
 * an issue and every member inside or below it is left without a position, so a
 * corrupt registry cannot manufacture a generation number.
 */
export function buildDescentGraph(nodes: readonly DescentNode[]): DescentGraph {
  const byId = new Map<string, DescentNode>();
  const issues: DescentGraphIssue[] = [];

  for (const node of nodes) {
    if (byId.has(node.memberId)) {
      issues.push({
        memberId: node.memberId,
        issue: "DUPLICATE_MEMBER",
        detail: "The same member id appears twice in the registry extract.",
      });
      continue;
    }
    byId.set(node.memberId, node);
  }

  // --- structural checks -------------------------------------------------
  for (const node of byId.values()) {
    if (node.parentMemberId === node.memberId) {
      issues.push({
        memberId: node.memberId,
        issue: "SELF_PARENT",
        detail: "A member cannot be their own parent.",
      });
    }
    if (isAffinalRelationship(node.relationshipToParent) && isPresent(node.parentMemberId)) {
      issues.push({
        memberId: node.memberId,
        issue: "AFFINAL_WITH_PARENT_LINK",
        detail: `${node.relationshipToParent} is an affinity relationship and must not carry a parent link.`,
      });
    }
    if (
      DESCENT_RELATIONSHIPS.includes(node.relationshipToParent) &&
      !isAffinalRelationship(node.relationshipToParent) &&
      !isPresent(node.parentMemberId) &&
      node.relationshipToParent !== "NON_FAMILY"
    ) {
      // A root of the line legitimately has no parent; that is a FOUNDER, and is
      // only a defect when the relationship claims descent from someone.
      issues.push({
        memberId: node.memberId,
        issue: "DESCENT_WITHOUT_PARENT_LINK",
        detail: `${node.relationshipToParent} implies a parent but no parent_member_id is recorded.`,
      });
    }
    if (isPresent(node.parentMemberId) && !byId.has(node.parentMemberId as string)) {
      issues.push({
        memberId: node.memberId,
        issue: "UNKNOWN_PARENT",
        detail: `parent_member_id ${String(node.parentMemberId)} is not in the registry extract.`,
      });
    }
  }

  // --- generation / branch resolution ------------------------------------
  const positions: Record<string, LineagePosition> = {};
  const founders: string[] = [];

  const chainOf = (memberId: string): string[] | null => {
    const seen: string[] = [];
    let cursor: string | null = memberId;
    while (cursor !== null) {
      if (seen.includes(cursor)) return null; // cycle
      seen.unshift(cursor);
      const node = byId.get(cursor);
      if (!node) return null;
      cursor = node.parentMemberId ?? null;
      if (cursor !== null && !byId.has(cursor)) return null;
    }
    return seen;
  };

  for (const node of byId.values()) {
    const isFounder = !isPresent(node.parentMemberId) && node.relationshipToParent !== "NON_FAMILY";
    if (isFounder) founders.push(node.memberId);

    const chain = chainOf(node.memberId);
    if (chain === null) {
      issues.push({
        memberId: node.memberId,
        issue: "PARENT_CYCLE",
        detail: "The parent chain does not terminate; no generation can be computed.",
      });
      continue;
    }
    if (chain.length > MAX_GENERATION_DEPTH) {
      issues.push({
        memberId: node.memberId,
        issue: "DEPTH_EXCEEDED",
        detail: `Chain length ${chain.length} exceeds the registry maximum of ${MAX_GENERATION_DEPTH}.`,
      });
      continue;
    }

    const rootId = chain[0];
    const root = byId.get(rootId);
    if (!root) continue;

    // Branch: the founder's own branch for a founder, otherwise the second
    // element of the chain (the founder's child) identifies the branch.
    const branchAnchor = chain.length >= 2 ? chain[1] : chain[0];
    const descentRelationships = chain
      .slice(1)
      .map((id) => byId.get(id)?.relationshipToParent)
      .filter((r): r is LineageRelationship => Boolean(r));

    const unbrokenDescentToFounder =
      isAffinalRelationship(node.relationshipToParent) === false &&
      descentRelationships.every((r) => r === "BIRTH_DESCENDANT" || r === "ADOPTED_CHILD") &&
      chain.every((id) => {
        const n = byId.get(id);
        return Boolean(n) && (n as DescentNode).verificationStatus === "VERIFIED";
      });

    positions[node.memberId] = {
      memberId: node.memberId,
      generation: chain.length,
      branch: branchKeyForFounder(root.familyLine, branchAnchor),
      chain,
      unbrokenDescentToFounder,
      descentRelationships,
    };

    if (root && node.familyLine !== root.familyLine) {
      issues.push({
        memberId: node.memberId,
        issue: "LINE_MISMATCH",
        detail: `Member is recorded on line ${node.familyLine} but descends from ${root.familyLine}.`,
      });
    }
    if (!isPresent(node.parentMemberId) && !isFounder) {
      issues.push({
        memberId: node.memberId,
        issue: "BROKEN_LINK_TO_FOUNDER",
        detail: "No founder could be reached for this member.",
      });
    }
  }

  const maxGeneration = Object.values(positions).reduce(
    (m, p) => (p.generation > m ? p.generation : m),
    0,
  );
  const branches = [...new Set(Object.values(positions).map((p) => p.branch))].sort();

  return {
    engineVersion: LINEAGE_ENGINE_VERSION,
    positions,
    founders: founders.sort(),
    issues,
    maxGeneration,
    branches,
  };
}

/* ------------------------------------------------------------------ */
/* Direct descendant determination                                     */
/* ------------------------------------------------------------------ */

export type DescendantDetermination = {
  engineVersion: string;
  memberId: string;
  status: DescendantStatus;
  /** The generation the registry places this member in, when computable. */
  generation: number | null;
  branch: string | null;
  /** Member ids from the founder down to this member. */
  chain: string[];
  /** Specific, ordered reasons the determination is what it is. */
  basis: string[];
  /** Structural or evidential blockers. Non-empty whenever status is not DIRECT_DESCENDANT. */
  blockers: string[];
  /** Raised only when the answer genuinely depends on unratised policy. */
  policyDecisionRequired: PolicyDecisionRequirement | null;
  /** True only for a positive determination on an unbroken, verified chain. */
  directDescendant: boolean;
};

/**
 * Determine direct-descendant status for one member.
 *
 * `adoptionTreatment` carries the governing framework's treatment of adopted
 * children. It is supplied by the caller from ratified policy — this engine does
 * not know it, will not guess it, and raises POLICY DECISION REQUIRED when it is
 * missing and an adoption is in the chain.
 */
export function determineDescendantStatus(
  graph: DescentGraph,
  memberId: string,
  nodesById: ReadonlyMap<string, DescentNode>,
  adoptionTreatment?: { treatedAsDirectDescendant: boolean; instrumentReference: string } | null,
): DescendantDetermination {
  const node = nodesById.get(memberId);
  const position = graph.positions[memberId];
  const basis: string[] = [];
  const blockers: string[] = [];
  let policyDecisionRequired: PolicyDecisionRequirement | null = null;

  if (!node) {
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "INDETERMINATE",
      generation: null,
      branch: null,
      chain: [],
      basis: ["The member is not present in the supplied registry extract."],
      blockers: ["MEMBER_NOT_IN_REGISTRY"],
      policyDecisionRequired: null,
      directDescendant: false,
    };
  }

  // --- 1. Affinity is never descent. -------------------------------------
  if (isAffinalRelationship(node.relationshipToParent)) {
    basis.push(
      `${node.relationshipToParent} is an affinity relationship created by marriage or partnership.`,
      "Marriage does not create direct-descendant status, ownership, shares, beneficiary status, family-line rights or succession rights.",
    );
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "NON_DESCENDANT",
      generation: position?.generation ?? null,
      branch: position?.branch ?? null,
      chain: position?.chain ?? [],
      basis,
      blockers: ["AFFINAL_RELATIONSHIP"],
      policyDecisionRequired: null,
      directDescendant: false,
    };
  }

  if (node.relationshipToParent === "NON_FAMILY") {
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "NON_DESCENDANT",
      generation: position?.generation ?? null,
      branch: position?.branch ?? null,
      chain: position?.chain ?? [],
      basis: ["The member is recorded as NON_FAMILY and is outside the family line."],
      blockers: ["NON_FAMILY"],
      policyDecisionRequired: null,
      directDescendant: false,
    };
  }

  // --- 2. A stepchild is not a descendant absent an explicit provision. ---
  if (node.relationshipToParent === "STEPCHILD") {
      policyDecisionRequired = {
        code: `FAM-PD-STEPCHILD-${memberId}`,
        issue: `Whether a stepchild (${memberId}) is treated as a direct descendant of the BEYU family line.`,
        domain: "FAMILY_OWNERSHIP",
        options: [
          "Treat stepchildren as direct descendants for all family-line purposes.",
          "Treat stepchildren as direct descendants only where the relevant Trust instrument names them.",
          "Do not treat stepchildren as direct descendants; provide for them only through express instruments.",
          "Decide case by case by Family Council resolution with legal review.",
        ],
        assumptions: ["No governing instrument provision was supplied to this engine."],
        legalImplications:
          "Forced-heirship, intestacy and Trust-class definitions differ by jurisdiction; the treatment must be confirmed per jurisdiction.",
        taxImplications:
          "Beneficiary class affects transfer-tax and income-tax treatment of distributions in most jurisdictions.",
        financialImplications:
          "Determines whether the person may participate in family capital and family-line ownership.",
        risk: "Reputational and family-conflict risk in both directions; a wrong default is difficult to reverse.",
        decisionAuthority: "Family Council on legal advice, and the Trustees for any Trust consequence.",
        status: "OPEN",
        decision: null,
        decisionReference: null,
        effectiveDate: null,
      };
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "INDETERMINATE",
      generation: position?.generation ?? null,
      branch: position?.branch ?? null,
      chain: position?.chain ?? [],
      basis: [
        "A stepchild's family-line status is not automatic in either direction.",
        "The governing framework must define it explicitly.",
      ],
      blockers: ["STEPCHILD_STATUS_NOT_DEFINED_BY_GOVERNING_FRAMEWORK"],
      policyDecisionRequired,
      directDescendant: false,
    };
  }

  // --- 3. Structural integrity of the chain. ------------------------------
  if (!position) {
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "INDETERMINATE",
      generation: null,
      branch: null,
      chain: [],
      basis: ["No generation position could be computed for this member."],
      blockers: graph.issues
        .filter((i) => i.memberId === memberId)
        .map((i) => `${i.issue}: ${i.detail}`),
      policyDecisionRequired: null,
      directDescendant: false,
    };
  }

  basis.push(
    `Generation ${position.generation} on branch ${position.branch}, chain ${position.chain.join(" → ")}.`,
  );

  const adoptionInChain = position.descentRelationships.includes("ADOPTED_CHILD");
  if (adoptionInChain) {
    if (!adoptionTreatment) {
      policyDecisionRequired = {
        code: `FAM-PD-ADOPTION-${memberId}`,
        issue: `Whether an adopted child in the descent chain of ${memberId} is treated as a direct descendant.`,
        domain: "FAMILY_OWNERSHIP",
        options: [
          "Treat legally adopted children identically to birth descendants.",
          "Treat legally adopted children as direct descendants only where the relevant instrument names them.",
          "Do not treat adopted children as direct descendants; provide only through express instruments.",
        ],
        assumptions: ["An ADOPTED_CHILD link exists in the chain.", "No instrument provision was supplied."],
        legalImplications:
          "Adoption law and the definition of 'issue'/'descendants' in each Trust instrument control; the Family Constitution cannot override either.",
        taxImplications: "Beneficiary class and generation-skipping treatment depend on the answer.",
        financialImplications: "Determines eligibility for family-line ownership and capital participation.",
        risk: "High: an incorrect default is very difficult to reverse once capital has moved.",
        decisionAuthority: "Family Council on legal advice; Trustees for Trust consequences.",
        status: "OPEN",
        decision: null,
        decisionReference: null,
        effectiveDate: null,
      };
      return {
        engineVersion: LINEAGE_ENGINE_VERSION,
        memberId,
        status: "ADOPTION_UNCONFIRMED",
        generation: position.generation,
        branch: position.branch,
        chain: position.chain,
        basis: [
          ...basis,
          "The descent chain contains an ADOPTED_CHILD link.",
          "No ratified treatment of adopted children was supplied, so the engine does not decide.",
        ],
        blockers: ["ADOPTION_TREATMENT_NOT_RATIFIED"],
        policyDecisionRequired,
        directDescendant: false,
      };
    }
    if (!adoptionTreatment.treatedAsDirectDescendant) {
      return {
        engineVersion: LINEAGE_ENGINE_VERSION,
        memberId,
        status: "NON_DESCENDANT",
        generation: position.generation,
        branch: position.branch,
        chain: position.chain,
        basis: [
          ...basis,
          `The governing framework (${adoptionTreatment.instrumentReference}) does not treat adopted children as direct descendants.`,
        ],
        blockers: ["ADOPTION_EXCLUDED_BY_INSTRUMENT"],
        policyDecisionRequired: null,
        directDescendant: false,
      };
    }
    basis.push(
      `The governing framework (${adoptionTreatment.instrumentReference}) treats adopted children as direct descendants.`,
    );
  }

  // --- 4. Verification. ----------------------------------------------------
  const unverified = position.chain.filter(
    (id) => nodesById.get(id)?.verificationStatus !== "VERIFIED",
  );
  if (unverified.length > 0) {
    blockers.push(`LINEAGE_NOT_VERIFIED: ${unverified.join(", ")}`);
  }

  const graphIssues = graph.issues.filter((i) => i.memberId === memberId);
  for (const issue of graphIssues) blockers.push(`${issue.issue}: ${issue.detail}`);

  if (!position.unbrokenDescentToFounder) {
    blockers.push("DESCENT_CHAIN_NOT_UNBROKEN");
  }

  if (blockers.length > 0) {
    return {
      engineVersion: LINEAGE_ENGINE_VERSION,
      memberId,
      status: "INDETERMINATE",
      generation: position.generation,
      branch: position.branch,
      chain: position.chain,
      basis: [...basis, "A positive determination requires an unbroken, verified descent chain."],
      blockers,
      policyDecisionRequired,
      directDescendant: false,
    };
  }

  basis.push("Every link from this member to a founder is a verified descent link.");
  return {
    engineVersion: LINEAGE_ENGINE_VERSION,
    memberId,
    status: "DIRECT_DESCENDANT",
    generation: position.generation,
    branch: position.branch,
    chain: position.chain,
    basis,
    blockers: [],
    policyDecisionRequired: null,
    directDescendant: true,
  };
}

/* ------------------------------------------------------------------ */
/* Lineage evidence                                                    */
/* ------------------------------------------------------------------ */

export type LineageEvidence = {
  evidenceId: string;
  memberId: string;
  type: LineageEvidenceType;
  /** ISO date the evidence itself records, not the date it was filed. */
  evidenceDate: string;
  issuer: string;
  /** SHA-256 of the stored document in the Family Vault. */
  checksum: string;
  /** Document id in `documents` — the Family Vault holds the index, not the secret. */
  documentId: string;
};

export type EvidenceAssessment = {
  memberId: string;
  supplied: LineageEvidenceType[];
  missing: LineageEvidenceType[];
  sufficient: boolean;
  /** Never auto-satisfied: absent a ratified standard this is false with a reason. */
  reason: string;
  policyDecisionRequired: PolicyDecisionRequirement | null;
};

/**
 * Minimum evidence per relationship, as a candidate standard.
 *
 * This table is a PROPOSAL. It is applied only when the caller passes
 * `standardRatified: true` with the reference that ratified it — because
 * "what evidence proves descent" is a legal question, and this engine has no
 * authority to answer it.
 */
export const CANDIDATE_EVIDENCE_STANDARD: Record<LineageRelationship, LineageEvidenceType[]> = {
  BIRTH_DESCENDANT: ["BIRTH_CERTIFICATE", "NATIONAL_ID"],
  ADOPTED_CHILD: ["COURT_ORDER_ADOPTION", "NATIONAL_ID"],
  STEPCHILD: ["MARRIAGE_CERTIFICATE", "BIRTH_CERTIFICATE"],
  SPOUSE_OF_MEMBER: ["MARRIAGE_CERTIFICATE", "NATIONAL_ID"],
  FORMER_SPOUSE_OF_MEMBER: ["MARRIAGE_CERTIFICATE", "DIVORCE_DECREE"],
  OTHER_AFFINAL: ["MARRIAGE_CERTIFICATE"],
  NON_FAMILY: ["NATIONAL_ID"],
};

export function assessLineageEvidence(
  relationship: LineageRelationship,
  evidence: readonly LineageEvidence[],
  options: { standardRatified: boolean; ratifiedByReference?: string | null },
): EvidenceAssessment {
  for (const e of evidence) assertIsoDate(e.evidenceDate, `evidence ${e.evidenceId} date`);

  const supplied = [...new Set(evidence.map((e) => e.type))].sort();

  if (!options.standardRatified) {
    return {
      memberId: evidence[0]?.memberId ?? "(unspecified)",
      supplied,
      missing: [],
      sufficient: false,
      reason:
        "No ratified lineage-evidence standard was supplied. The engine will not treat a candidate standard as authoritative.",
      policyDecisionRequired: {
        code: "FAM-PD-001",
        issue: "What evidence is sufficient to verify each family-line relationship?",
        domain: "INSTITUTION",
        options: [
          "Ratify the candidate standard in CANDIDATE_EVIDENCE_STANDARD as the institutional minimum.",
          "Set a per-jurisdiction standard on legal advice.",
          "Require independent verification (registry extract or DNA) in addition to documents.",
        ],
        assumptions: [
          "A candidate standard exists in code but has not been ratified by any authority.",
        ],
        legalImplications:
          "Evidentiary sufficiency for descent, adoption and marriage is governed by each jurisdiction's law and by the Trust instruments.",
        taxImplications: "None directly; affects eligibility, which affects tax treatment of distributions.",
        financialImplications: "Weak evidence would permit ineligible participation in family capital.",
        risk: "Fraudulent lineage claims are the primary insider-abuse risk in a family institution.",
        decisionAuthority: "Family Council on legal advice, with Trustee confirmation for Trust classes.",
        status: "OPEN",
        decision: null,
        decisionReference: null,
        effectiveDate: null,
      },
    };
  }

  const required = CANDIDATE_EVIDENCE_STANDARD[relationship];
  const missing = required.filter((r) => !supplied.includes(r));
  const incomplete = evidence.filter((e) => absentFields({ checksum: e.checksum, documentId: e.documentId, issuer: e.issuer }).length > 0);

  return {
    memberId: evidence[0]?.memberId ?? "(unspecified)",
    supplied,
    missing,
    sufficient: missing.length === 0 && incomplete.length === 0,
    reason:
      missing.length > 0
        ? `Missing required evidence: ${missing.join(", ")}.`
        : incomplete.length > 0
          ? "One or more evidence records lack issuer, checksum or document reference."
          : `All ${required.length} required evidence types present under ${options.ratifiedByReference ?? "the ratified standard"}.`,
    policyDecisionRequired: null,
  };
}

/* ------------------------------------------------------------------ */
/* Descendants of a member                                             */
/* ------------------------------------------------------------------ */

/**
 * Every verified direct descendant below `rootId`, ordered by generation then id.
 *
 * Affinity is excluded by construction: a spouse attached to a descendant is not
 * a descendant of that descendant.
 */
export function verifiedDescendantsOf(
  graph: DescentGraph,
  rootId: string,
  nodesById: ReadonlyMap<string, DescentNode>,
  adoptionTreatment?: { treatedAsDirectDescendant: boolean; instrumentReference: string } | null,
): DescendantDetermination[] {
  const descendants = Object.values(graph.positions)
    .filter((p) => p.chain.includes(rootId) && p.memberId !== rootId)
    .map((p) => determineDescendantStatus(graph, p.memberId, nodesById, adoptionTreatment))
    .filter((d) => d.directDescendant);

  return descendants.sort(
    (a, b) => (a.generation ?? 0) - (b.generation ?? 0) || a.memberId.localeCompare(b.memberId),
  );
}

/**
 * Guard against the failure mode this layer exists to prevent: a caller asserting
 * direct-descendant status without the registry supporting it.
 *
 * The registry's stored `direct_descendant` flag is reconciled against the engine
 * here; a stored `true` that the engine cannot substantiate is reported, not
 * honoured.
 */
export function reconcileStoredDescendantFlags(
  graph: DescentGraph,
  stored: ReadonlyArray<{ memberId: string; directDescendant: boolean }>,
  nodesById: ReadonlyMap<string, DescentNode>,
  adoptionTreatment?: { treatedAsDirectDescendant: boolean; instrumentReference: string } | null,
): Array<{
  memberId: string;
  stored: boolean;
  engine: boolean;
  status: DescendantStatus;
  discrepancy: boolean;
}> {
  return stored.map((s) => {
    const d = determineDescendantStatus(graph, s.memberId, nodesById, adoptionTreatment);
    return {
      memberId: s.memberId,
      stored: s.directDescendant,
      engine: d.directDescendant,
      status: d.status,
      discrepancy: s.directDescendant !== d.directDescendant,
    };
  });
}

/** Refuse a lineage mutation requested by an AI actor. */
export function assertLineageWriteIsHuman(actorType: "HUMAN" | "SERVICE" | "AI", operation: string): void {
  if (actorType === "AI") {
    throw new FamilyInstitutionError(
      "AI_AUTHORITY_REFUSED",
      `Noelia may not ${operation} a family-line record. Lineage is verified by accountable humans.`,
      { operation },
    );
  }
}
