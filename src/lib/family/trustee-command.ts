/**
 * BEYU OS — TRUSTEE COMMAND (pure model).
 *
 * ============================ WHAT THIS IS ==================================
 *
 * The constitutional authority surface of the BEYU Family Trust, expressed as
 * ONE advisory roll-up over registers that already exist. It is the governed
 * successor to the "Trustee Command" dashboard that shipped inside the Health
 * OS sector SPA (`sectors/health/src/views/Governance.tsx`), which presented
 * hard-coded trustees, resolutions and matters to any viewer who selected the
 * trustee demo role. That dashboard was demonstration data; this module is the
 * real thing, and it is deliberately shaped by four rules.
 *
 * ============================ FOUR RULES ====================================
 *
 * 1. IT DECIDES NOTHING. This is a READ-ONLY composition. There is no function
 *    here that records a decision, approves a resolution, appoints a trustee,
 *    moves money or writes a row. Every consequential act remains in the
 *    governed engine that owns it: `trust-governance-service.ts` for trust
 *    decisions and distribution decision records, the governance engine for
 *    resolutions, `entity_appointments` for trustee identity, and Finance OS
 *    (`CAP_POSTING`) for money — which is LOCKED.
 *
 * 2. IT INVENTS NO STATE. Every value is derived from a row the caller supplies.
 *    Where a matter has no governed record type at all (there is no trustee
 *    "investment" decision in the trust schema), the matter reports
 *    `NOT_INSTRUMENTED` rather than a fabricated status. Where a trust has no
 *    distributions, the surface says so instead of showing a demo figure.
 *
 * 3. IT GRANTS NO AUTHORITY. Being a trustee is a fact about an appointment in
 *    the canonical registry, NOT a permission. `grantsAuthority` and
 *    `executesNothing` are structural constants of the return type; the caller
 *    still resolves authorization through `can()` / `requireAccess()` and RLS
 *    before it may render a single row. The page and the API both re-run the
 *    same `familyoffice:trust.read` capability, and an entity-scoped grant is
 *    refused rather than widened (the canonical `guarded()` scope rule).
 *
 * 4. LEGAL SUPREMACY IS STRUCTURAL. Provisions remain INERT without a ratified
 *    legal-effect reference, enforceability is never assumed, and an AI actor
 *    can never reach APPROVE — `LAST_AI_PERMITTED_STEP` is CHECK_RISK. The
 *    surface states these rails instead of implying that software has settled
 *    a legal question.
 *
 * Nothing here is "demonstration mode". There is no mode flag, because there is
 * no second data path: the only switch that changes what this surface shows is
 * what the authenticated principal is actually allowed to read.
 */

import {
  DECISION_GATE_STEPS,
  LAST_AI_PERMITTED_STEP,
  SUPERIOR_INSTRUMENTS,
  TRUSTEE_RESERVED_MATTERS,
  type SuperiorInstrument,
  type TrusteeReservedMatter,
} from "./model";

export const TRUSTEE_COMMAND_VERSION = "trustee-command-1.0.0";

/**
 * The advisory boundary, returned in every payload so a consumer cannot read
 * the model without also receiving what it is not.
 */
export const TRUSTEE_COMMAND_BOUNDARY =
  "ADVISORY READ-ONLY SURFACE. Trustee Command composes existing registers for review; it decides nothing, approves nothing, executes nothing and grants no authority. Trustee status is an appointment in entity_appointments, never a permission. Financial posting remains CAP_POSTING-gated and LOCKED.";

/* ------------------------------------------------------------------ */
/* Reserved matters — the honest review map                            */
/* ------------------------------------------------------------------ */

/**
 * Which persisted trustee-decision type would evidence an act for each matter.
 *
 * `TRUST_DISTRIBUTION` is evidenced by DISTRIBUTION_APPROVAL decisions and the
 * distribution decision records themselves. Four matters have NO governed
 * record type in the trust schema today — TRUST_AMENDMENT (instruments are
 * versioned, but no amendment-approval decision exists), TRUST_INVESTMENT,
 * BENEFICIARY_DETERMINATION and TRUST_PROTECTOR_EXERCISE. They are mapped to an
 * empty list on purpose: the surface then reports NOT_INSTRUMENTED, which is
 * true, instead of borrowing an unrelated decision type and implying evidence
 * that does not exist.
 */
export const RESERVED_MATTER_DECISION_TYPES: Readonly<
  Record<TrusteeReservedMatter, readonly TrusteeDecisionType[]>
> = {
  TRUST_DISTRIBUTION: ["DISTRIBUTION_APPROVAL"],
  TRUST_AMENDMENT: [],
  TRUSTEE_APPOINTMENT: ["TRUSTEE_APPOINTMENT"],
  TRUSTEE_REMOVAL: ["TRUSTEE_REMOVAL"],
  TRUSTEE_REPLACEMENT: ["TRUSTEE_REPLACEMENT", "TRUSTEE_SUCCESSION"],
  TRUST_INVESTMENT: [],
  BENEFICIARY_DETERMINATION: [],
  TRUST_PROTECTOR_EXERCISE: [],
};

export const TRUSTEE_DECISION_TYPES = [
  "TRUSTEE_APPOINTMENT",
  "TRUSTEE_REMOVAL",
  "TRUSTEE_REPLACEMENT",
  "TRUSTEE_SUCCESSION",
  "CONFLICT_DECLARED",
  "RECUSAL",
  "DISTRIBUTION_APPROVAL",
  "OTHER",
] as const;
export type TrusteeDecisionType = (typeof TRUSTEE_DECISION_TYPES)[number];

export const RESERVED_MATTER_LABEL: Readonly<Record<TrusteeReservedMatter, string>> = {
  TRUST_DISTRIBUTION: "Trust distributions",
  TRUST_AMENDMENT: "Trust amendment",
  TRUSTEE_APPOINTMENT: "Trustee appointment",
  TRUSTEE_REMOVAL: "Trustee removal",
  TRUSTEE_REPLACEMENT: "Trustee replacement & succession",
  TRUST_INVESTMENT: "Trust investment",
  BENEFICIARY_DETERMINATION: "Beneficiary determination",
  TRUST_PROTECTOR_EXERCISE: "Trust protector power",
};

/**
 * How far a reserved matter has legitimately got, on the evidence supplied.
 *
 * RECORDED          — at least one decision is APPROVED or EXECUTED.
 * IN_REVIEW         — decisions exist, none final (PROPOSED / LEGAL_REVIEW).
 * DISPUTED          — a decision or its evidence is disputed; a human matter.
 * NOT_RECORDED      — the governed record type exists, no row has been made.
 * NOT_INSTRUMENTED  — the trust schema has no governed record type for it.
 */
export type ReservedMatterReviewState =
  | "RECORDED"
  | "IN_REVIEW"
  | "DISPUTED"
  | "NOT_RECORDED"
  | "NOT_INSTRUMENTED";

export type ReservedMatterReview = {
  matter: TrusteeReservedMatter;
  label: string;
  /** Declared in the governance body's own reserved-matters charter. */
  reservedByBody: boolean;
  state: ReservedMatterReviewState;
  /** Decisions APPROVED or EXECUTED. */
  recordedActs: number;
  /** Decisions PROPOSED or in LEGAL_REVIEW. */
  pendingActs: number;
  /** Decisions REJECTED, WITHDRAWN or DISPUTED. */
  closedActs: number;
  /** Decision types that would evidence this matter (empty ⇒ not instrumented). */
  evidenceTypes: readonly TrusteeDecisionType[];
  /** What a NAMED HUMAN must still bring. Never performed by this surface. */
  requires: readonly string[];
};

export type TrusteeDecisionEvidence = {
  decisionType: string;
  status: string;
};

const FINAL_DECISION_STATES = new Set(["APPROVED", "EXECUTED"]);
const PENDING_DECISION_STATES = new Set(["PROPOSED", "LEGAL_REVIEW"]);
const DISPUTED_DECISION_STATES = new Set(["DISPUTED"]);

function requirementsForMatter(
  matter: TrusteeReservedMatter,
  reservedByBody: boolean,
): string[] {
  const base = reservedByBody
    ? []
    : ["Matter is not declared in the body's reserved-matters charter (governance review required)"];
  switch (matter) {
    case "TRUST_DISTRIBUTION":
      return [...base, "APPROVED trustee decision", "Discretion basis where discretionary", "Finance OS records the movement (never this surface)"];
    case "TRUST_AMENDMENT":
      return [...base, "Executed instrument version", "Legal-review closure by a human lawyer", "APPROVED resolution reference"];
    case "TRUSTEE_APPOINTMENT":
    case "TRUSTEE_REPLACEMENT":
      return [...base, "APPROVED trustee decision", "Authority reference (resolution or delegation)", "Canonical entity_appointments row on execution"];
    case "TRUSTEE_REMOVAL":
      return [...base, "APPROVED trustee decision", "Conflict declaration and recusal where applicable", "Canonical entity_appointments closure on execution"];
    case "TRUST_INVESTMENT":
    case "BENEFICIARY_DETERMINATION":
    case "TRUST_PROTECTOR_EXERCISE":
      return [...base, "A governed record type for this matter does not exist yet", "Counsel-determined process", "Ratified legal-effect reference"];
    default:
      return base;
  }
}

/**
 * Derive the reserved-matter review map.
 *
 * Pure: the caller supplies the body's declared matters and the decision rows
 * that already exist. An unknown decision type is ignored rather than guessed
 * at, and a matter that is neither declared by the body nor evidenced by a row
 * still appears — a constitutional surface must show a gap, not hide it.
 */
export function summariseReservedMatters(input: {
  declaredByBody: readonly string[];
  decisions: readonly TrusteeDecisionEvidence[];
}): ReservedMatterReview[] {
  const declared = new Set(input.declaredByBody);

  return TRUSTEE_RESERVED_MATTERS.map((matter) => {
    const evidenceTypes = RESERVED_MATTER_DECISION_TYPES[matter];
    const reservedByBody = declared.has(matter);
    const rows = evidenceTypes.length
      ? input.decisions.filter((decision) =>
          evidenceTypes.includes(decision.decisionType as TrusteeDecisionType),
        )
      : [];

    const recordedActs = rows.filter((r) => FINAL_DECISION_STATES.has(r.status)).length;
    const pendingActs = rows.filter((r) => PENDING_DECISION_STATES.has(r.status)).length;
    const closedActs = rows.filter(
      (r) => DISPUTED_DECISION_STATES.has(r.status) || r.status === "REJECTED" || r.status === "WITHDRAWN",
    ).length;

    let state: ReservedMatterReviewState;
    if (evidenceTypes.length === 0) state = "NOT_INSTRUMENTED";
    else if (recordedActs > 0) state = "RECORDED";
    else if (rows.some((r) => DISPUTED_DECISION_STATES.has(r.status))) state = "DISPUTED";
    else if (pendingActs > 0) state = "IN_REVIEW";
    else state = "NOT_RECORDED";

    return {
      matter,
      label: RESERVED_MATTER_LABEL[matter],
      reservedByBody,
      state,
      recordedActs,
      pendingActs,
      closedActs,
      evidenceTypes,
      requires: requirementsForMatter(matter, reservedByBody),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Trustee bindings — identity comes from the canonical registry        */
/* ------------------------------------------------------------------ */

export type TrusteeAppointmentRow = {
  partyId: string;
  displayName: string;
  role: string;
  appointedOn: string;
  resignedOn: string | null;
  authorityLimit: string | null;
  resolutionRef: string | null;
};

export type TrusteeBinding = {
  partyId: string;
  displayName: string;
  appointedOn: string;
  authorityLimit: string | null;
  resolutionRef: string | null;
  /** Canonical role recorded in entity_appointments (TRUSTEE / PROTECTOR / …). */
  registryRole: string;
  /**
   * Always true. Stated explicitly so no consumer mistakes an appointment for a
   * capability: trustee status is a fiduciary office, not a permission grant.
   */
  appointmentIsNotPermission: true;
};

export function trusteeBindings(
  appointments: readonly TrusteeAppointmentRow[],
): TrusteeBinding[] {
  return appointments
    .filter((row) => row.resignedOn === null && row.role === "TRUSTEE")
    .map((row) => ({
      partyId: row.partyId,
      displayName: row.displayName,
      appointedOn: row.appointedOn,
      authorityLimit: row.authorityLimit,
      resolutionRef: row.resolutionRef,
      registryRole: row.role,
      appointmentIsNotPermission: true as const,
    }))
    .sort((a, b) => a.appointedOn.localeCompare(b.appointedOn) || a.displayName.localeCompare(b.displayName));
}

/**
 * Quorum is computed against the CURRENT canonical appointments. It is a fact
 * about the body, never a licence to act: a quorate body that has not voted has
 * decided nothing.
 */
export type QuorumAssessment = {
  bodyCode: string;
  quorumMinimum: number;
  majorityRule: string;
  activeTrustees: number;
  quorumMet: boolean;
  /** Stated for the reader: quorum is availability to decide, not a decision. */
  note: string;
};

export function assessQuorum(input: {
  body: { code: string; quorumMinimum: number; majorityRule: string } | null;
  activeTrustees: number;
}): QuorumAssessment | null {
  if (!input.body) return null;
  return {
    bodyCode: input.body.code,
    quorumMinimum: input.body.quorumMinimum,
    majorityRule: input.body.majorityRule,
    activeTrustees: input.activeTrustees,
    quorumMet: input.activeTrustees >= input.body.quorumMinimum,
    note: "Quorum is availability to decide, not a decision. Nothing is resolved until a governed resolution records it.",
  };
}

/* ------------------------------------------------------------------ */
/* Instruments, provisions and distributions                           */
/* ------------------------------------------------------------------ */

export type InstrumentPosture = {
  total: number;
  byStatus: Record<string, number>;
  /** Executed versions that have not been superseded. */
  effectiveCount: number;
  legalReviewPending: number;
  latest: { id: string; instrumentName: string; instrumentType: string; version: number; status: string; effectiveDate: string | null } | null;
};

export function summariseInstruments(
  instruments: readonly {
    id: string;
    instrumentName: string;
    instrumentType: string;
    version: number;
    status: string;
    legalReviewStatus: string;
    effectiveDate: string | null;
  }[],
): InstrumentPosture {
  const byStatus: Record<string, number> = {};
  for (const instrument of instruments) {
    byStatus[instrument.status] = (byStatus[instrument.status] ?? 0) + 1;
  }
  const sorted = [...instruments].sort((a, b) => b.version - a.version);
  const latest = sorted[0];
  return {
    total: instruments.length,
    byStatus,
    effectiveCount: instruments.filter((i) => i.status === "EXECUTED").length,
    legalReviewPending: instruments.filter((i) => i.legalReviewStatus === "REQUIRES_LEGAL_REVIEW").length,
    latest: latest
      ? {
          id: latest.id,
          instrumentName: latest.instrumentName,
          instrumentType: latest.instrumentType,
          version: latest.version,
          status: latest.status,
          effectiveDate: latest.effectiveDate,
        }
      : null,
  };
}

export type ProvisionPosture = {
  total: number;
  /** Structurally INERT: no ratified legal-effect reference. */
  inert: number;
  legallyEffective: number;
  underReview: number;
  disputed: number;
  /** Provisions whose enforceability the SOFTWARE assumed (must always be 0). */
  enforceabilityAssumed: number;
  byType: Record<string, number>;
};

const EFFECTIVE_LEGAL_STATES = new Set(["APPROVED", "EXECUTED", "LEGAL_REVIEWED"]);

export function summariseProvisions(
  provisions: readonly {
    provisionType: string;
    legalEffectStatus: string;
    legalEffectReference: string | null;
    enforceabilityAssumed: boolean;
  }[],
): ProvisionPosture {
  const byType: Record<string, number> = {};
  for (const provision of provisions) {
    byType[provision.provisionType] = (byType[provision.provisionType] ?? 0) + 1;
  }
  const inert = provisions.filter(
    (p) => p.legalEffectReference === null || p.legalEffectStatus === "INERT",
  ).length;
  return {
    total: provisions.length,
    inert,
    legallyEffective: provisions.filter(
      (p) => p.legalEffectReference !== null && EFFECTIVE_LEGAL_STATES.has(p.legalEffectStatus),
    ).length,
    underReview: provisions.filter((p) => p.legalEffectStatus === "UNDER_LEGAL_REVIEW").length,
    disputed: provisions.filter((p) => p.legalEffectStatus === "DISPUTED").length,
    // Never assume enforceability: this counts rows that broke the rule.
    enforceabilityAssumed: provisions.filter((p) => p.enforceabilityAssumed).length,
    byType,
  };
}

export type DistributionPosture = {
  total: number;
  proposed: number;
  approved: number;
  executed: number;
  rejected: number;
  disputed: number;
  /** Decision records with no Finance record yet — money truth stays in Finance OS. */
  awaitingFinance: number;
  byCurrency: Record<string, string>;
};

export function summariseDistributions(
  distributions: readonly {
    distributionType: string;
    status: string;
    amount: string | null;
    currency: string | null;
    financeRecordRef: string | null;
  }[],
): DistributionPosture {
  const byCurrency: Record<string, number> = {};
  for (const distribution of distributions) {
    const currency = distribution.currency ?? "UNSPECIFIED";
    byCurrency[currency] =
      (byCurrency[currency] ?? 0) + Number(distribution.amount ?? 0);
  }
  return {
    total: distributions.length,
    proposed: distributions.filter((d) => d.status === "PROPOSED").length,
    approved: distributions.filter((d) => d.status === "APPROVED").length,
    executed: distributions.filter((d) => d.status === "EXECUTED").length,
    rejected: distributions.filter((d) => d.status === "REJECTED").length,
    disputed: distributions.filter((d) => d.status === "DISPUTED").length,
    awaitingFinance: distributions.filter(
      (d) => d.status === "EXECUTED" && d.financeRecordRef === null,
    ).length,
    byCurrency: Object.fromEntries(
      Object.entries(byCurrency)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, total]) => [currency, total.toFixed(2)]),
    ),
  };
}

/* ------------------------------------------------------------------ */
/* Authority rails — stated, not implied                               */
/* ------------------------------------------------------------------ */

export type PostingLock = {
  capabilityCode: string;
  /** True only when the activation gate says the capability may execute. */
  executable: boolean;
  activationStatus: string | null;
  reason: string;
  blockedBy: readonly string[];
};

export type AuthorityRails = {
  /** Instruments that outrank the family's policy framework, descending. */
  superiorInstruments: readonly SuperiorInstrument[];
  decisionGateSteps: readonly string[];
  /** The last step an AI actor may reach. APPROVE and beyond are human-only. */
  lastAiPermittedStep: string;
  aiMayApprove: false;
  financialPosting: PostingLock;
  note: string;
};

export function authorityRails(posting: PostingLock): AuthorityRails {
  return {
    superiorInstruments: SUPERIOR_INSTRUMENTS,
    decisionGateSteps: DECISION_GATE_STEPS,
    lastAiPermittedStep: LAST_AI_PERMITTED_STEP,
    aiMayApprove: false,
    financialPosting: posting,
    note: "Authority is not inherited by convenience. A trustee's office is recorded in the canonical appointment registry; a workspace or role switch selects an existing grant and never adds permissions, widens tenant scope or reaches another organisation's data.",
  };
}

/* ------------------------------------------------------------------ */
/* The composed model                                                  */
/* ------------------------------------------------------------------ */

export type EnterpriseEntityRow = {
  id: string;
  code: string;
  legalName: string;
  entityType: string;
  parentEntityId: string | null;
  countryCode: string;
  status: string;
};

export type EnterpriseNode = {
  id: string;
  code: string;
  legalName: string;
  entityType: string;
  countryCode: string;
  status: string;
  depth: number;
  children: EnterpriseNode[];
};

/**
 * Build the ownership tree beneath the trust from the canonical legal-entity
 * hierarchy. Only entities the caller actually loaded are rendered; an orphan
 * (parent outside the visible set) is attached at the root so nothing silently
 * disappears. Cycles are broken defensively — a corrupt parent pointer must not
 * hang a governance surface.
 */
export function enterpriseTree(
  entities: readonly EnterpriseEntityRow[],
  rootId: string,
): EnterpriseNode[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const childrenOf = new Map<string, EnterpriseEntityRow[]>();
  for (const entity of entities) {
    if (entity.id === rootId) continue;
    const parent = entity.parentEntityId && byId.has(entity.parentEntityId) ? entity.parentEntityId : rootId;
    if (parent === entity.id) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(entity);
    childrenOf.set(parent, list);
  }

  const seen = new Set<string>();
  const build = (id: string, depth: number): EnterpriseNode[] => {
    if (seen.has(id)) return [];
    seen.add(id);
    const children = (childrenOf.get(id) ?? [])
      .slice()
      .sort((a, b) => a.legalName.localeCompare(b.legalName))
      .flatMap((child) => build(child.id, depth + 1));
    const entity = byId.get(id);
    return entity
      ? [
          {
            id: entity.id,
            code: entity.code,
            legalName: entity.legalName,
            entityType: entity.entityType,
            countryCode: entity.countryCode,
            status: entity.status,
            depth,
            children,
          },
        ]
      : children;
  };

  return build(rootId, 0);
}

export type TrusteeCommandModel = {
  version: string;
  generatedAt: string;
  trust: {
    id: string;
    code: string;
    legalName: string;
    entityType: string;
    countryCode: string;
    status: string;
    functionalCurrency: string;
    jurisdictions: string[];
  };
  trusteeBindings: TrusteeBinding[];
  quorum: QuorumAssessment | null;
  reservedMatters: ReservedMatterReview[];
  instruments: InstrumentPosture;
  provisions: ProvisionPosture;
  distributions: DistributionPosture;
  enterprise: EnterpriseNode[];
  rails: AuthorityRails;
  counts: {
    trustees: number;
    instruments: number;
    provisions: number;
    decisions: number;
    distributions: number;
    enterpriseEntities: number;
    reservedMattersDeclared: number;
  };
  /** Structural guarantees — constant, never computed from preferences. */
  advisoryOnly: true;
  executesNothing: true;
  grantsAuthority: false;
  boundary: string;
};

export function buildTrusteeCommandModel(input: {
  now: Date;
  trust: TrusteeCommandModel["trust"];
  appointments: readonly TrusteeAppointmentRow[];
  body: { code: string; quorumMinimum: number; majorityRule: string } | null;
  /** Reserved matters declared in the body's own charter (`governance_bodies.reserved_matters`). */
  declaredReservedMatters: readonly string[];
  decisions: readonly TrusteeDecisionEvidence[];
  instruments: readonly {
    id: string;
    instrumentName: string;
    instrumentType: string;
    version: number;
    status: string;
    legalReviewStatus: string;
    effectiveDate: string | null;
  }[];
  provisions: readonly {
    provisionType: string;
    legalEffectStatus: string;
    legalEffectReference: string | null;
    enforceabilityAssumed: boolean;
  }[];
  distributions: readonly {
    distributionType: string;
    status: string;
    amount: string | null;
    currency: string | null;
    financeRecordRef: string | null;
  }[];
  entities: readonly EnterpriseEntityRow[];
  posting: PostingLock;
}): TrusteeCommandModel {
  const trusteeBindingsResult = trusteeBindings(input.appointments);
  const reservedMatters = summariseReservedMatters({
    declaredByBody: declaredMattersForBody(input.declaredReservedMatters),
    decisions: input.decisions,
  });

  return {
    version: TRUSTEE_COMMAND_VERSION,
    generatedAt: input.now.toISOString(),
    trust: input.trust,
    trusteeBindings: trusteeBindingsResult,
    quorum: assessQuorum({ body: input.body, activeTrustees: trusteeBindingsResult.length }),
    reservedMatters,
    instruments: summariseInstruments(input.instruments),
    provisions: summariseProvisions(input.provisions),
    distributions: summariseDistributions(input.distributions),
    enterprise: enterpriseTree(input.entities, input.trust.id),
    rails: authorityRails(input.posting),
    counts: {
      trustees: trusteeBindingsResult.length,
      instruments: input.instruments.length,
      provisions: input.provisions.length,
      decisions: input.decisions.length,
      distributions: input.distributions.length,
      enterpriseEntities: input.entities.length,
      reservedMattersDeclared: declaredMattersForBody(input.declaredReservedMatters).length,
    },
    advisoryOnly: true,
    executesNothing: true,
    grantsAuthority: false,
    boundary: TRUSTEE_COMMAND_BOUNDARY,
  };
}

/** Rows declared in the governance body's `reserved_matters` column. */
function declaredMattersForBody(declared: readonly string[]): string[] {
  return declared.filter((matter) =>
    (TRUSTEE_RESERVED_MATTERS as readonly string[]).includes(matter),
  );
}
