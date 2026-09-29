/**
 * BEYU Federation & Trust — Noelia/HIVE federation monitoring (program §60).
 *
 * Noelia may OBSERVE and SUMMARIZE federation health: failures, missing
 * evidence, schema drift, connector degradation, compliance issues. This
 * module produces deterministic, read-only summaries from registry rows.
 *
 * Noelia MUST NOT grant authorization, approve protected access, bypass
 * RLS/RBAC/ABAC, manufacture credentials, activate government integrations
 * or promote to production. Nothing in this module writes, approves or
 * mutates; it returns observations. Execution of any recommended action
 * stays with a human through noelia_action_requests and the governed
 * approval path.
 */
export interface MonitoringInput {
  authorities: {
    code: string;
    officialName: string;
    lifecycleStatus: string;
    verificationStatus: string;
    accessCostStatus: string;
    govesbStatus: string;
    nextReviewAt: string | null;
    recordStatus: string;
  }[];
  connectors: {
    code: string;
    status: string;
    health: string;
    lastFailureAt: string | null;
    lastErrorCode: string | null;
    authFailures: number;
  }[];
  agreements: { code: string; status: string; expiryDate: string | null }[];
  credentials: { code: string; status: string; expiresAt: string | null }[];
  evidence: { id: string; status: string; expiresAt: string | null; subjectType: string; subjectId: string }[];
  incidents: { id: string; status: string; category: string; title: string }[];
  now?: Date;
}

export interface MonitoringFinding {
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  kind: string;
  subject: string;
  finding: string;
  recommendedAction: string;
}

export interface MonitoringReport {
  generatedAt: string;
  totals: { authorities: number; connectors: number; agreements: number; credentials: number; openIncidents: number };
  findings: MonitoringFinding[];
  summary: string;
  aiBoundary: string;
}

export function buildFederationMonitoringReport(input: MonitoringInput): MonitoringReport {
  const now = input.now ?? new Date();
  const findings: MonitoringFinding[] = [];
  const add = (severity: MonitoringFinding["severity"], kind: string, subject: string, finding: string, recommendedAction: string) =>
    findings.push({ severity, kind, subject, finding, recommendedAction });

  for (const a of input.authorities) {
    if (a.nextReviewAt && new Date(a.nextReviewAt) <= now) {
      add("MEDIUM", "REVIEW_OVERDUE", a.code, `Authority ${a.code} review is overdue (next_review_at ${a.nextReviewAt}).`, "Schedule a governed review; re-verify status against the official source before the next access cycle.");
    }
    if (a.lifecycleStatus === "FAILED_VERIFICATION") {
      add("HIGH", "FAILED_VERIFICATION", a.code, `Authority ${a.code} is in FAILED_VERIFICATION.`, "Review the failed verification record; restart from SANDBOX with corrected evidence before any retry.");
    }
    if (a.lifecycleStatus === "SUSPENDED") {
      add("HIGH", "SUSPENDED", a.code, `Authority ${a.code} integration is SUSPENDED.`, "Confirm suspension reason; keep all dependent services fail-closed until a governed resumption decision is recorded.");
    }
    if (a.verificationStatus === "REGISTERED" && a.lifecycleStatus !== "DISCOVERED" && a.lifecycleStatus !== "CLASSIFIED") {
      add("MEDIUM", "STATUS_DRIFT", a.code, `Authority ${a.code} has a lifecycle beyond CLASSIFIED but verification is still REGISTERED — status drift.`, "Reconcile verification records with lifecycle state; record evidence for each level up.");
    }
    if (a.recordStatus === "UNCERTAIN") {
      add("LOW", "UNCERTAIN_RECORD", a.code, `Authority ${a.code} record status is UNCERTAIN.`, "Resolve against the authoritative directory during the next reconciliation run.");
    }
  }

  for (const c of input.connectors) {
    if (c.health === "DOWN" || c.health === "DEGRADED") {
      add(c.health === "DOWN" ? "CRITICAL" : "HIGH", "CONNECTOR_DEGRADED", c.code, `Connector ${c.code} health is ${c.health}${c.lastErrorCode ? ` (last error ${c.lastErrorCode})` : ""}.`, "Apply the runbook: verify upstream availability, then rotate approved credentials / reconnect under the self-repair limits (no invented credentials).");
    }
    if (c.authFailures >= 5) {
      add("HIGH", "REPEATED_AUTH_FAILURE", c.code, `Connector ${c.code} has ${c.authFailures} recorded authentication failures.`, "Open a REPEATED_AUTH_FAILURE incident; verify credential state and authority-side account status. Do not retry beyond the rate-limit policy.");
    }
    if (c.status === "SUSPENDED" || c.status === "REVOKED") {
      add("MEDIUM", "CONNECTOR_INACTIVE", c.code, `Connector ${c.code} is ${c.status}.`, "Confirm dependent services are fail-closed; record the resumption requirement if applicable.");
    }
  }

  for (const ag of input.agreements) {
    if (ag.expiryDate && new Date(ag.expiryDate) <= now && ag.status === "ACTIVE") {
      add("CRITICAL", "AGREEMENT_EXPIRED", ag.code, `Agreement ${ag.code} is marked ACTIVE but its expiry date (${ag.expiryDate}) has passed.`, "EXPIRED agreements block access (fail-closed). Record the renewal or terminate; do not rely on the agreement until a governed renewal is evidenced.");
    }
    if (ag.status === "EXPIRED") {
      add("HIGH", "AGREEMENT_EXPIRED", ag.code, `Agreement ${ag.code} is EXPIRED.`, "Confirm dependent services are blocked; open an AGREEMENT_EXPIRY incident if any access was attempted.");
    }
  }

  for (const cr of input.credentials) {
    if (cr.expiresAt && new Date(cr.expiresAt) <= now && cr.status === "ISSUED") {
      add("CRITICAL", "CREDENTIAL_EXPIRED", cr.code, `Credential ${cr.code} is ISSUED but expired on ${cr.expiresAt}.`, "Block dependent access (fail-closed); initiate rotation through the governed credential lifecycle. Never fabricate a replacement.");
    }
    if (cr.status === "ROTATION_REQUIRED") {
      add("MEDIUM", "CREDENTIAL_ROTATION", cr.code, `Credential ${cr.code} is flagged ROTATION_REQUIRED.`, "Rotate on schedule through the governed path; record the new env-var refs (names only).");
    }
    if (cr.status === "REVOKED") {
      add("HIGH", "CREDENTIAL_REVOKED", cr.code, `Credential ${cr.code} is REVOKED.`, "Verify no connector is still referencing it; open a CREDENTIAL_COMPROMISE incident if the revocation was security-driven.");
    }
  }

  for (const e of input.evidence) {
    if (e.status === "VALID" && e.expiresAt && new Date(e.expiresAt) <= now) {
      add("MEDIUM", "EVIDENCE_EXPIRED", e.id, `Evidence ${e.id} (${e.subjectType}/${e.subjectId}) is VALID but past its revalidation date ${e.expiresAt}.`, "Revalidate against the official source or mark EXPIRED; evidence-gated states must not rest on stale evidence.");
    }
  }

  const openIncidents = input.incidents.filter((i) => i.status !== "CLOSED" && i.status !== "VERIFIED");
  for (const i of openIncidents) {
    add("HIGH", "OPEN_INCIDENT", i.id, `Open ${i.category} incident: ${i.title} (status ${i.status}).`, "Follow the incident response workflow; verify containment before any related access.");
  }

  const severityRank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  findings.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const high = findings.filter((f) => f.severity === "HIGH").length;
  const summary =
    findings.length === 0
      ? "No federation monitoring findings at this time. Registry states are all within policy."
      : `Federation monitoring found ${findings.length} finding(s): ${critical} critical, ${high} high. All findings are observations; no automated action has been taken.`;

  return {
    generatedAt: now.toISOString(),
    totals: {
      authorities: input.authorities.length,
      connectors: input.connectors.length,
      agreements: input.agreements.length,
      credentials: input.credentials.length,
      openIncidents: openIncidents.length,
    },
    findings,
    summary,
    aiBoundary:
      "Noelia/HIVE boundary (program §60): this report is an OBSERVATION. Noelia cannot grant authorization, approve protected access, bypass RLS/RBAC/ABAC or the legal basis/consent/agreement gates, manufacture credentials, activate government integrations, or promote to production. Recommended actions require a human through the governed approval path.",
  };
}
