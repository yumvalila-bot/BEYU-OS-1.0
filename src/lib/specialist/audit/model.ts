/**
 * BEYU OS — Audit Intelligence domain model (Phase 7G).
 *
 * Types only. No anomaly thresholds, no risk scores, no baselines, no retention policy.
 *
 * WHAT THE SUBSTRATE ACTUALLY CONTAINS (verified column by column against the live schema):
 *
 *   audit_log(id, sequence, tenant_id, actor_user_id, actor_type, action, object_type, object_id,
 *             outcome, reason, authority, approval_ref, policy_version, system_version,
 *             ai_version, old_value, new_value, ip_address, user_agent, trace_id, occurred_at,
 *             prev_hash, hash)
 *   enterprise_events(id, sequence, type, spec_version, schema_version, source, tenant_id,
 *             subject_type, subject_id, actor_user_id, actor_type, classification, payload,
 *             trace_id, occurred_at, prev_hash, hash)
 *
 * Both are append-only, hash-chained and TRUNCATE-guarded by migration 0008.
 *
 * THE CENTRAL DISCIPLINE. An audit module is where fabricated certainty is most dangerous: a
 * confident "no anomalies detected" reads as assurance, and a confident "ANOMALY" reads as an
 * accusation against a named person. This model therefore forbids both.
 *
 *   1. NOTHING IS AN "ANOMALY". The strongest verdict available is POTENTIAL_ANOMALY, always
 *      paired with REQUIRES_HUMAN_REVIEW. Unusual is not wrong, and this module cannot know intent.
 *   2. NO BASELINE IS INVENTED. With no ratified normal-activity baseline, statistical outlier
 *      detection would be inventing policy. Only structural, self-evident observations are made
 *      (a failure is a failure; a broken hash link is broken).
 *   3. ABSENCE IS NOT EVIDENCE OF ABSENCE. An empty result window is DATA_NOT_AVAILABLE or an
 *      explicitly empty OBSERVED window — never "nothing happened, therefore all is well".
 *
 * WHAT IS DELIBERATELY NOT BUILT, because the substrate cannot support it honestly:
 *   AUTHENTICATION ANALYSIS — there is no auth_events table. `sessions` holds current session
 *      state, not a login-attempt history, so failed-login analysis is DATA_NOT_AVAILABLE.
 *   RETENTION ANALYSIS — no retention policy or expiry column exists on either ledger.
 *   USER BEHAVIOUR BASELINES — no historical baseline exists to compare against.
 */

/** Epistemic status of every audit finding. */
export const AUDIT_BASIS = [
  "OBSERVED",
  "DERIVED",
  "POTENTIAL_ANOMALY",
  "REQUIRES_HUMAN_REVIEW",
  "DATA_NOT_AVAILABLE",
  "REQUIRES_AUTHORITY",
] as const;
export type AuditBasis = (typeof AUDIT_BASIS)[number];

/** A single audit-log record as exposed by this module. */
export type AuditRecordView = {
  id: string;
  sequence: string;
  tenantId: string | null;
  actorUserId: string | null;
  actorType: string;
  action: string;
  objectType: string;
  objectId: string;
  outcome: string;
  reason: string | null;
  authority: string | null;
  /** Correlates this record with its enterprise event and originating request. */
  traceId: string | null;
  occurredAt: string;
  /**
   * Hash-chain linkage. Exposed so a reviewer can verify integrity independently, but note that
   * the hash is a digest, not a payload: it reveals nothing about the record's contents.
   */
  hash: string;
  prevHash: string | null;
  basis: Extract<AuditBasis, "OBSERVED">;
};

/** A single enterprise event as exposed by this module. */
export type EventRecordView = {
  id: string;
  sequence: string;
  type: string;
  source: string;
  tenantId: string | null;
  subjectType: string;
  subjectId: string;
  actorUserId: string | null;
  actorType: string;
  classification: string;
  traceId: string;
  occurredAt: string;
  hash: string;
  prevHash: string | null;
  basis: Extract<AuditBasis, "OBSERVED">;
};

/**
 * A time window for a query. Both ends are inclusive dates.
 * A window is always echoed back on the result so a reader knows exactly what was examined —
 * "no privileged activity" means nothing without the period it covers.
 */
export type AuditWindow = {
  from: string;
  to: string;
};

export type ActorActivity = {
  actorUserId: string;
  actorType: string;
  totalActions: number;
  successCount: number;
  deniedCount: number;
  failureCount: number;
  distinctActions: string[];
  distinctObjectTypes: string[];
  firstSeen: string;
  lastSeen: string;
  /** Actions matching a caller-supplied privileged-action list. Never inferred from the name. */
  privilegedActionCount: number;
  basis: Extract<AuditBasis, "OBSERVED" | "DERIVED">;
};

export type ActivityTimelineEntry = {
  occurredAt: string;
  sequence: string;
  actorUserId: string | null;
  action: string;
  objectType: string;
  objectId: string;
  outcome: string;
  traceId: string | null;
};

/**
 * A correlation between an audit record and its enterprise event.
 * `complete` is false when one side is missing — reported, never inferred into existence.
 */
export type CorrelationView = {
  traceId: string;
  auditRecordIds: string[];
  eventIds: string[];
  complete: boolean;
  basis: Extract<AuditBasis, "OBSERVED" | "DATA_NOT_AVAILABLE">;
  explanation: string;
};

/**
 * An observation warranting human attention. Never called an anomaly, and never a conclusion:
 * `POTENTIAL_ANOMALY` is the ceiling, and `advisoryOnly` is structurally always true.
 */
export type AuditObservation = {
  code: AuditObservationCode;
  basis: Extract<AuditBasis, "OBSERVED" | "POTENTIAL_ANOMALY" | "REQUIRES_HUMAN_REVIEW">;
  subjectType: "AUDIT_RECORD" | "EVENT" | "ACTOR" | "TRACE" | "CHAIN";
  subjectId: string;
  detail: string;
  /** Always true: detecting a condition never authorises acting on it. */
  advisoryOnly: true;
};

export const AUDIT_OBSERVATION_CODE = [
  "DENIED_ACTION",
  "FAILED_ACTION",
  "REPEATED_DENIAL",
  "PRIVILEGED_ACTION",
  "MISSING_ACTOR_IDENTITY",
  "MISSING_TENANT_IDENTITY",
  "MISSING_TRACE_ID",
  "ORPHANED_EVENT",
  "ORPHANED_AUDIT_RECORD",
  "DUPLICATE_RECORD_ID",
  "FUTURE_DATED_RECORD",
  "OUT_OF_ORDER_SEQUENCE",
  "HASH_CHAIN_DISCONTINUITY",
  "EMPTY_WINDOW",
] as const;
export type AuditObservationCode = (typeof AUDIT_OBSERVATION_CODE)[number];

/** Result of inspecting the hash chain over a set of records. */
export type EvidenceChainReport = {
  recordsInspected: number;
  /**
   * Null when fewer than two records are in scope: a chain of one has no linkage to verify, and
   * reporting "intact" would overstate what was checked.
   */
  linkageVerified: boolean | null;
  discontinuities: Array<{ atSequence: string; detail: string }>;
  /**
   * IMPORTANT: this verifies LINKAGE (each record's prev_hash matches its predecessor's hash),
   * not cryptographic recomputation of each digest. Stated explicitly so no reader mistakes the
   * guarantee for more than it is.
   */
  verificationScope: string;
  basis: Extract<AuditBasis, "OBSERVED" | "DERIVED" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

export type GovernanceActivityView = {
  decisionActions: number;
  resolutionActions: number;
  capabilityActions: number;
  /** Governance actions that were DENIED — the ones a reviewer most needs to see. */
  deniedGovernanceActions: number;
  records: ActivityTimelineEntry[];
  basis: Extract<AuditBasis, "OBSERVED" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

export type AuditReport = {
  window: AuditWindow;
  tenantId: string;
  legalEntityId: string | null;
  auditRecordCount: number;
  eventCount: number;
  actorCount: number;
  outcomeCounts: Record<string, number>;
  topActions: Array<{ action: string; count: number }>;
  observations: AuditObservation[];
  evidenceChain: EvidenceChainReport;
  /** Records withheld from this caller by event classification vs clearance. */
  withheldEventCount: number;
  basis: Extract<AuditBasis, "OBSERVED" | "DERIVED" | "DATA_NOT_AVAILABLE">;
  explanation: string[];
};

/**
 * Analyses the substrate genuinely cannot support. Returned as explicit refusals rather than
 * omitted, so a reader knows the question was considered and answered honestly.
 */
export type UnsupportedAnalysis = {
  analysis: "AUTHENTICATION_EVENTS" | "RETENTION_COMPLIANCE" | "BEHAVIOURAL_BASELINE";
  basis: Extract<AuditBasis, "DATA_NOT_AVAILABLE">;
  missingInputs: string[];
  explanation: string[];
};
