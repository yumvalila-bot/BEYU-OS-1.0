/**
 * BEYU OS — Audit Intelligence engines (Phase 7G).
 *
 * Pure functions over audit and event records. No database, no principal, no authority — the
 * service layer applies those through the Phase 7B platform.
 *
 * FOUR INVARIANTS:
 *
 *   1. NOTHING IS DECLARED AN ANOMALY. The strongest verdict is POTENTIAL_ANOMALY paired with
 *      REQUIRES_HUMAN_REVIEW. These engines observe structure — a denial is a denial, a broken
 *      hash link is broken — and never infer intent, negligence or wrongdoing.
 *
 *   2. NO BASELINE IS INVENTED. There is no ratified definition of normal activity, so no
 *      statistical outlier detection is performed. "This actor did 40 things and others did 4"
 *      is not evidence of anything without a governed baseline, and inventing one would be
 *      inventing policy.
 *
 *   3. PRIVILEGE IS CALLER-DECLARED. Which actions count as privileged is a governance question.
 *      The caller supplies the list; nothing is inferred from action names, because "delete" in
 *      a name means nothing reliable.
 *
 *   4. AN EMPTY WINDOW IS REPORTED AS EMPTY, WITH ITS BOUNDS. "No privileged activity" is
 *      meaningless without the period examined, and silence is never reported as assurance.
 */
import { SpecialistError } from "../platform";
import type {
  ActivityTimelineEntry,
  ActorActivity,
  AuditObservation,
  AuditObservationCode,
  AuditRecordView,
  AuditWindow,
  CorrelationView,
  EventRecordView,
  EvidenceChainReport,
  GovernanceActivityView,
  UnsupportedAnalysis,
} from "./model";

export const AUDIT_INTEL_VERSION = "audit-intel-1.0.0";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertWindow(window: AuditWindow): void {
  if (!ISO_DATE.test(window.from) || !ISO_DATE.test(window.to)) {
    throw new SpecialistError("RULE_VIOLATION", "Window bounds must be ISO dates (YYYY-MM-DD).");
  }
  if (window.from > window.to) {
    throw new SpecialistError("RULE_VIOLATION", "Window 'from' must not be after 'to'.");
  }
}

/**
 * Compares two non-negative integer strings exactly.
 *
 * `sequence` is a Postgres bigint that can exceed Number.MAX_SAFE_INTEGER, and tsconfig targets
 * ES2017 so BigInt literals are unavailable. Length-then-lexicographic comparison is exact for
 * non-negative integers and loses no precision.
 */
export function compareSequence(a: string, b: string): number {
  const x = a.replace(/^0+(?=\d)/, "");
  const y = b.replace(/^0+(?=\d)/, "");
  if (x.length !== y.length) return x.length - y.length;
  return x < y ? -1 : x > y ? 1 : 0;
}

function observation(
  code: AuditObservationCode,
  basis: AuditObservation["basis"],
  subjectType: AuditObservation["subjectType"],
  subjectId: string,
  detail: string,
): AuditObservation {
  return { code, basis, subjectType, subjectId, detail, advisoryOnly: true };
}

// ===========================================================================
// 1. ACTOR ACTIVITY
// ===========================================================================

/**
 * Per-actor activity summary.
 *
 * `privilegedActions` is supplied by the caller. Passing an empty list yields a privileged count
 * of zero, which is honest: nothing was declared privileged, so nothing was counted.
 */
export function actorActivity(
  records: AuditRecordView[],
  options: { privilegedActions?: string[] } = {},
): { actors: ActorActivity[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (records.length === 0) {
    return {
      actors: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: [
        "No audit records in scope. This is an absence of data, not evidence that no activity occurred.",
      ],
    };
  }

  const privileged = new Set(options.privilegedActions ?? []);
  const byActor = new Map<string, AuditRecordView[]>();
  for (const r of records) {
    const key = r.actorUserId ?? "__NO_ACTOR__";
    byActor.set(key, [...(byActor.get(key) ?? []), r]);
  }

  const actors = [...byActor.entries()]
    .map(([actorUserId, group]) => {
      const times = group.map((g) => g.occurredAt).sort();
      return {
        actorUserId,
        actorType: group[0].actorType,
        totalActions: group.length,
        successCount: group.filter((g) => g.outcome === "SUCCESS").length,
        deniedCount: group.filter((g) => g.outcome === "DENIED").length,
        failureCount: group.filter((g) => g.outcome === "FAILURE").length,
        distinctActions: [...new Set(group.map((g) => g.action))].sort(),
        distinctObjectTypes: [...new Set(group.map((g) => g.objectType))].sort(),
        firstSeen: times[0],
        lastSeen: times[times.length - 1],
        privilegedActionCount: group.filter((g) => privileged.has(g.action)).length,
        basis: "DERIVED" as const,
      };
    })
    .sort((a, b) => b.totalActions - a.totalActions || a.actorUserId.localeCompare(b.actorUserId));

  return {
    actors,
    basis: "DERIVED",
    explanation: [
      `${actors.length} actor(s) across ${records.length} audit record(s).`,
      privileged.size === 0
        ? "No privileged-action list was supplied, so privileged counts are zero by definition, not by finding."
        : `${privileged.size} action(s) were declared privileged by the caller.`,
      "Activity volume is reported without judgement: no ratified baseline of normal activity exists.",
    ],
  };
}

// ===========================================================================
// 2. TIMELINE
// ===========================================================================

/** Chronological timeline, ordered by the ledger's own monotonic sequence. */
export function activityTimeline(
  records: AuditRecordView[],
  options: { limit?: number } = {},
): { entries: ActivityTimelineEntry[]; basis: "OBSERVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (records.length === 0) {
    return {
      entries: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No audit records in scope for the requested timeline."],
    };
  }
  const limit = options.limit ?? 500;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new SpecialistError("RULE_VIOLATION", "limit must be a positive integer.");
  }

  const entries = [...records]
    // Sequence is a bigint in the database. tsconfig targets ES2017, so BigInt literals are
    // unavailable; comparing by length-then-lexicographic ordering is exact for non-negative
    // integer strings and avoids any precision loss from Number().
    .sort((a, b) => compareSequence(a.sequence, b.sequence))
    .slice(0, limit)
    .map((r) => ({
      occurredAt: r.occurredAt,
      sequence: r.sequence,
      actorUserId: r.actorUserId,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      outcome: r.outcome,
      traceId: r.traceId,
    }));

  return {
    entries,
    basis: "OBSERVED",
    explanation: [
      `${entries.length} of ${records.length} record(s) shown, ordered by the ledger's append-only sequence.`,
      "Ordering follows the immutable sequence rather than the timestamp, so clock adjustment cannot reorder history.",
    ],
  };
}

// ===========================================================================
// 3. FAILED / DENIED ACTIONS
// ===========================================================================

/**
 * Denials and failures. These are structural facts — the ledger recorded the outcome — so they
 * are OBSERVED rather than inferred. Repetition is flagged POTENTIAL_ANOMALY only, never
 * "attack" or "abuse".
 */
export function failedActionAnalysis(
  records: AuditRecordView[],
  options: { repeatedDenialThreshold?: number } = {},
): {
  denied: AuditRecordView[];
  failed: AuditRecordView[];
  observations: AuditObservation[];
  basis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  explanation: string[];
} {
  if (records.length === 0) {
    return {
      denied: [], failed: [], observations: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No audit records in scope; no conclusion about failures can be drawn."],
    };
  }

  const denied = records.filter((r) => r.outcome === "DENIED");
  const failed = records.filter((r) => r.outcome === "FAILURE");
  const observations: AuditObservation[] = [];

  for (const r of denied) {
    observations.push(observation("DENIED_ACTION", "OBSERVED", "AUDIT_RECORD", r.id,
      `${r.actorUserId ?? "unknown actor"} was denied ${r.action} on ${r.objectType} ${r.objectId}.`));
  }
  for (const r of failed) {
    observations.push(observation("FAILED_ACTION", "OBSERVED", "AUDIT_RECORD", r.id,
      `${r.action} on ${r.objectType} ${r.objectId} failed.`));
  }

  // Repetition is flagged only against a CALLER-SUPPLIED threshold. Choosing a number here would
  // be inventing a security policy.
  const threshold = options.repeatedDenialThreshold;
  if (threshold !== undefined) {
    if (!Number.isInteger(threshold) || threshold < 1) {
      throw new SpecialistError("RULE_VIOLATION", "repeatedDenialThreshold must be a positive integer.");
    }
    const byActor = new Map<string, number>();
    for (const r of denied) {
      const key = r.actorUserId ?? "__NO_ACTOR__";
      byActor.set(key, (byActor.get(key) ?? 0) + 1);
    }
    for (const [actor, n] of byActor) {
      if (n >= threshold) {
        observations.push(observation("REPEATED_DENIAL", "POTENTIAL_ANOMALY", "ACTOR", actor,
          `${n} denial(s) recorded against ${actor}, at or above the caller-supplied threshold of ${threshold}. ` +
          "This is a pattern for a human to review, not a finding of misconduct."));
      }
    }
  }

  return {
    denied, failed, observations,
    basis: "OBSERVED",
    explanation: [
      `${denied.length} denied and ${failed.length} failed action(s) out of ${records.length}.`,
      threshold === undefined
        ? "No repeated-denial threshold was supplied, so no repetition pattern is flagged. There is no ratified threshold to default to."
        : `Repetition flagged at the caller-supplied threshold of ${threshold}.`,
      "A denial means a control worked. It is not by itself evidence of an attack.",
    ],
  };
}

// ===========================================================================
// 4. PRIVILEGED ACTIONS
// ===========================================================================

export function privilegedActionAnalysis(
  records: AuditRecordView[],
  privilegedActions: string[],
): {
  records: AuditRecordView[];
  observations: AuditObservation[];
  basis: "OBSERVED" | "DATA_NOT_AVAILABLE";
  explanation: string[];
} {
  if (privilegedActions.length === 0) {
    return {
      records: [], observations: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: [
        "No privileged-action list supplied. Which actions are privileged is a governance determination, " +
        "and this engine will not infer it from action names.",
      ],
    };
  }
  if (records.length === 0) {
    return {
      records: [], observations: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No audit records in scope."],
    };
  }

  const privileged = new Set(privilegedActions);
  const matched = records.filter((r) => privileged.has(r.action));
  const observations = matched.map((r) =>
    observation("PRIVILEGED_ACTION", "OBSERVED", "AUDIT_RECORD", r.id,
      `Privileged action ${r.action} by ${r.actorUserId ?? "unknown actor"} (${r.outcome}).`),
  );

  return {
    records: matched, observations,
    basis: "OBSERVED",
    explanation: [
      `${matched.length} privileged action(s) out of ${records.length}, against ${privileged.size} declared privileged action(s).`,
      "A privileged action being performed is expected activity, not a finding.",
    ],
  };
}

// ===========================================================================
// 5. CORRELATION
// ===========================================================================

/**
 * Correlates audit records with enterprise events by trace id.
 * An unmatched record is reported as incomplete — never invented into a pair.
 */
export function correlate(
  records: AuditRecordView[],
  events: EventRecordView[],
): { correlations: CorrelationView[]; observations: AuditObservation[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (records.length === 0 && events.length === 0) {
    return { correlations: [], observations: [], basis: "DATA_NOT_AVAILABLE", explanation: ["Nothing in scope to correlate."] };
  }

  const observations: AuditObservation[] = [];
  const traces = new Set<string>();
  for (const r of records) if (r.traceId) traces.add(r.traceId);
  for (const e of events) if (e.traceId) traces.add(e.traceId);

  for (const r of records) {
    if (!r.traceId) {
      observations.push(observation("MISSING_TRACE_ID", "OBSERVED", "AUDIT_RECORD", r.id,
        `Audit record ${r.id} carries no trace id and cannot be correlated with its event.`));
    }
  }

  const correlations = [...traces].sort().map((traceId) => {
    const auditRecordIds = records.filter((r) => r.traceId === traceId).map((r) => r.id).sort();
    const eventIds = events.filter((e) => e.traceId === traceId).map((e) => e.id).sort();
    const complete = auditRecordIds.length > 0 && eventIds.length > 0;

    if (!complete) {
      if (eventIds.length > 0) {
        observations.push(observation("ORPHANED_EVENT", "REQUIRES_HUMAN_REVIEW", "TRACE", traceId,
          `Trace ${traceId} has ${eventIds.length} event(s) but no audit record in scope. ` +
          "This may be a scope boundary rather than a defect."));
      } else {
        observations.push(observation("ORPHANED_AUDIT_RECORD", "REQUIRES_HUMAN_REVIEW", "TRACE", traceId,
          `Trace ${traceId} has ${auditRecordIds.length} audit record(s) but no event in scope.`));
      }
    }

    return {
      traceId,
      auditRecordIds,
      eventIds,
      complete,
      basis: "OBSERVED" as const,
      explanation: complete
        ? `Trace ${traceId} links ${auditRecordIds.length} audit record(s) to ${eventIds.length} event(s).`
        : `Trace ${traceId} is incomplete within the queried scope; the counterpart may exist outside it.`,
    };
  });

  return {
    correlations,
    observations,
    basis: "DERIVED",
    explanation: [
      `${correlations.length} trace(s); ${correlations.filter((c) => c.complete).length} complete.`,
      "An incomplete correlation is reported as incomplete. No counterpart record is ever synthesised.",
    ],
  };
}

// ===========================================================================
// 6. EVIDENCE CHAIN
// ===========================================================================

/**
 * Verifies hash-chain LINKAGE across consecutive records.
 *
 * Deliberately limited and says so: it checks that each record's prev_hash equals its
 * predecessor's hash. It does NOT recompute digests, so it detects broken or reordered linkage
 * but not a forgery that recomputed the whole chain consistently. Overstating this would be worse
 * than not checking at all.
 */
export function inspectEvidenceChain(
  records: Array<{ sequence: string; hash: string; prevHash: string | null }>,
): EvidenceChainReport {
  const verificationScope =
    "Verifies that each record's prev_hash matches the preceding record's hash within the queried " +
    "scope. Does NOT recompute cryptographic digests and does NOT prove the chain was never rewritten " +
    "wholesale.";

  if (records.length === 0) {
    return {
      recordsInspected: 0, linkageVerified: null, discontinuities: [], verificationScope,
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No records in scope; chain integrity cannot be assessed."],
    };
  }
  if (records.length === 1) {
    return {
      recordsInspected: 1, linkageVerified: null, discontinuities: [], verificationScope,
      basis: "DATA_NOT_AVAILABLE",
      explanation: [
        "Only one record in scope. A chain of one has no linkage to verify; reporting it as intact would overstate the check.",
      ],
    };
  }

  const ordered = [...records].sort((a, b) => compareSequence(a.sequence, b.sequence));
  const discontinuities: Array<{ atSequence: string; detail: string }> = [];

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (cur.prevHash !== prev.hash) {
      discontinuities.push({
        atSequence: cur.sequence,
        detail:
          `Record at sequence ${cur.sequence} declares prev_hash ${cur.prevHash ?? "null"}, but the ` +
          `preceding record (sequence ${prev.sequence}) has hash ${prev.hash}. ` +
          "This may indicate a gap in the queried scope rather than tampering.",
      });
    }
  }

  return {
    recordsInspected: ordered.length,
    linkageVerified: discontinuities.length === 0,
    discontinuities,
    verificationScope,
    basis: "DERIVED",
    explanation: [
      `${ordered.length} record(s) inspected; ${discontinuities.length} linkage discontinuity/discontinuities found.`,
      discontinuities.length > 0
        ? "A discontinuity requires human review. Filtered queries legitimately produce gaps, so this is not by itself evidence of tampering."
        : "Linkage is continuous across the records examined.",
      verificationScope,
    ],
  };
}

// ===========================================================================
// 7. DATA QUALITY
// ===========================================================================

export function auditDataQuality(
  records: AuditRecordView[],
  events: EventRecordView[],
  options: { asOf: string },
): { observations: AuditObservation[]; basis: "DERIVED" | "DATA_NOT_AVAILABLE"; explanation: string[] } {
  if (!ISO_DATE.test(options.asOf)) {
    throw new SpecialistError("RULE_VIOLATION", "asOf must be an ISO date (YYYY-MM-DD).");
  }
  if (records.length === 0 && events.length === 0) {
    return { observations: [], basis: "DATA_NOT_AVAILABLE", explanation: ["Nothing in scope to assess."] };
  }

  const observations: AuditObservation[] = [];
  const seenIds = new Set<string>();

  for (const r of records) {
    if (seenIds.has(r.id)) {
      observations.push(observation("DUPLICATE_RECORD_ID", "REQUIRES_HUMAN_REVIEW", "AUDIT_RECORD", r.id,
        `Audit record id ${r.id} appears more than once.`));
    }
    seenIds.add(r.id);

    if (!r.actorUserId) {
      observations.push(observation("MISSING_ACTOR_IDENTITY", "OBSERVED", "AUDIT_RECORD", r.id,
        `Audit record ${r.id} has no actor. System-originated actions may legitimately have none.`));
    }
    if (!r.tenantId) {
      observations.push(observation("MISSING_TENANT_IDENTITY", "OBSERVED", "AUDIT_RECORD", r.id,
        `Audit record ${r.id} has no tenant and cannot be attributed to an organisation.`));
    }
    if (r.occurredAt.slice(0, 10) > options.asOf) {
      observations.push(observation("FUTURE_DATED_RECORD", "POTENTIAL_ANOMALY", "AUDIT_RECORD", r.id,
        `Audit record ${r.id} is dated ${r.occurredAt}, after the date under review.`));
    }
  }

  for (const e of events) {
    if (e.occurredAt.slice(0, 10) > options.asOf) {
      observations.push(observation("FUTURE_DATED_RECORD", "POTENTIAL_ANOMALY", "EVENT", e.id,
        `Event ${e.id} is dated ${e.occurredAt}, after the date under review.`));
    }
  }

  // Sequence monotonicity: the ledger assigns sequence, so a regression is structurally notable.
  for (let i = 1; i < records.length; i += 1) {
    if (compareSequence(records[i].sequence, records[i - 1].sequence) <= 0) {
      observations.push(observation("OUT_OF_ORDER_SEQUENCE", "REQUIRES_HUMAN_REVIEW", "AUDIT_RECORD", records[i].id,
        `Sequence ${records[i].sequence} does not increase over the preceding ${records[i - 1].sequence}.`));
      break;
    }
  }

  return {
    observations,
    basis: "DERIVED",
    explanation: [
      `${observations.length} data-quality observation(s) across ${records.length} audit record(s) and ${events.length} event(s).`,
      "Observations are reported, never repaired. The audit ledger is append-only and must not be corrected by an analysis layer.",
    ],
  };
}

// ===========================================================================
// 8. GOVERNANCE ACTIVITY
// ===========================================================================

export function governanceActivity(records: AuditRecordView[]): GovernanceActivityView {
  if (records.length === 0) {
    return {
      decisionActions: 0, resolutionActions: 0, capabilityActions: 0, deniedGovernanceActions: 0,
      records: [],
      basis: "DATA_NOT_AVAILABLE",
      explanation: ["No audit records in scope. This is not evidence that no governance activity occurred."],
    };
  }

  // Matched on the OBJECT TYPE the ledger itself records, not on guessed action-name substrings.
  const isGovernance = (r: AuditRecordView) =>
    r.objectType === "RESOLUTION" || r.objectType === "GOVERNANCE_DECISION" ||
    r.objectType === "CAPABILITY" || r.objectType === "POLICY" || r.objectType === "VOTE";

  const governance = records.filter(isGovernance);

  return {
    decisionActions: governance.filter((r) => r.objectType === "GOVERNANCE_DECISION" || r.objectType === "VOTE").length,
    resolutionActions: governance.filter((r) => r.objectType === "RESOLUTION").length,
    capabilityActions: governance.filter((r) => r.objectType === "CAPABILITY").length,
    deniedGovernanceActions: governance.filter((r) => r.outcome === "DENIED").length,
    records: governance.map((r) => ({
      occurredAt: r.occurredAt, sequence: r.sequence, actorUserId: r.actorUserId,
      action: r.action, objectType: r.objectType, objectId: r.objectId,
      outcome: r.outcome, traceId: r.traceId,
    })),
    basis: "OBSERVED",
    explanation: [
      `${governance.length} governance-related record(s) out of ${records.length}.`,
      "Classification uses the object type recorded by the ledger, not inference from action names.",
    ],
  };
}

// ===========================================================================
// 9. EXPLICIT REFUSALS
// ===========================================================================

/**
 * Analyses the substrate cannot support. Returned as documented refusals so a reader knows the
 * question was considered rather than overlooked.
 */
export function unsupportedAnalyses(): UnsupportedAnalysis[] {
  return [
    {
      analysis: "AUTHENTICATION_EVENTS",
      basis: "DATA_NOT_AVAILABLE",
      missingInputs: [
        "no auth_events / login_attempts table exists",
        "`sessions` holds current session state, not a history of authentication attempts",
      ],
      explanation: [
        "Failed-login and brute-force analysis cannot be performed: successful and failed authentication " +
        "attempts are not recorded as history anywhere in the schema.",
        "Counting rows in `sessions` would measure live sessions, not authentication behaviour, and " +
        "presenting it as security analysis would be misleading.",
      ],
    },
    {
      analysis: "RETENTION_COMPLIANCE",
      basis: "DATA_NOT_AVAILABLE",
      missingInputs: ["no retention period, expiry or disposal column on audit_log or enterprise_events"],
      explanation: [
        "No retention policy is represented in the schema, and none has been ratified.",
        "Whether records are held for the correct period is therefore REQUIRES_AUTHORITY, not a computation.",
      ],
    },
    {
      analysis: "BEHAVIOURAL_BASELINE",
      basis: "DATA_NOT_AVAILABLE",
      missingInputs: ["no ratified baseline of normal activity", "no historical comparison period defined"],
      explanation: [
        "Statistical outlier detection requires a definition of normal. None is ratified.",
        "Flagging activity as unusual against a self-invented baseline would manufacture accusations " +
        "against named individuals from arbitrary arithmetic.",
      ],
    },
  ];
}
