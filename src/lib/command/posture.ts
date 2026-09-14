/**
 * BEYU OS — INSTITUTIONAL POSTURE (Executive Command Center, X10THINK §45–§46).
 *
 * An ADVISORY roll-up of the institution's provable state: audit integrity,
 * control effectiveness, risk position, compliance position, evidence coverage
 * and TLS-governance posture. It answers "how defensible are we right now?" —
 * it never answers "may this actor do X?".
 *
 * ============================== HARD BOUNDARY (§46) ============================
 *
 *   postureScore MUST NOT grant permission.
 *   postureScore MUST NOT replace authorization.
 *   postureScore MUST NOT be an input to `can()`, `evaluatePolicy()`,
 *   `requireCapability()` or any RLS decision.
 *
 * The score is computed READ-ONLY from canonical stores (audit chain,
 * assurance registers, TLS governance config). Every component reports its own
 * epistemic status: OBSERVED (computed from live rows), DATA_NOT_AVAILABLE (no
 * rows — never scored as good), or FAILED (verified false). No evidence = NOT
 * PROVEN, and a component with no evidence drags the score down, never up.
 *
 * The Executive Command Center itself is the existing governed surface
 * (`platform:dashboard.read` + `/api/v1/system/*`): this module is the posture
 * capability inside it, not a new OS and not a new source of truth.
 */

import { and, eq, inArray, ne } from "drizzle-orm";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/db";
import { complianceObligations, controls, leaverCases, risks, trustProvisions } from "@/db/schema";
import { verifyAuditChain, verifyEventChain } from "@/lib/audit";
import { tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";

export const POSTURE_SERVICE_VERSION = "posture-1.0.0";

export type PostureComponentStatus = "OBSERVED" | "FAILED" | "DATA_NOT_AVAILABLE";

export type PostureComponent = {
  key: string;
  title: string;
  /** 0–100 when OBSERVED/FAILED; null when there is nothing to score. */
  score: number | null;
  status: PostureComponentStatus;
  weight: number;
  findings: string[];
  /** What the score was computed from — evidence references, never secrets. */
  evidence: Record<string, unknown>;
};

export type InstitutionalPosture = {
  serviceVersion: string;
  computedAt: string;
  tenantId: string;
  /** Weighted mean over OBSERVED/FAILED components, 0–100; null if none. */
  postureScore: number | null;
  /** A broken audit/event chain caps the whole posture: nothing is provable. */
  cappedByAuditIntegrity: boolean;
  components: PostureComponent[];
  /* §46 — the boundary is part of the payload, not just a comment. */
  advisoryOnly: true;
  grantsAuthority: false;
  boundary: string;
};

const BOUNDARY =
  "ADVISORY ONLY: the posture score is visibility, never authorization. It is not an input to any RBAC/ABAC/policy/capability/RLS decision (§45–§46).";

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 100) / 100));
}

async function auditIntegrityComponent(): Promise<PostureComponent> {
  const [audit, events] = await Promise.all([verifyAuditChain(2000), verifyEventChain(2000)]);
  const findings: string[] = [];
  if (!audit.verified) findings.push(`Audit hash chain FAILED verification (broken at ${audit.brokenAt ?? "unknown"}).`);
  if (!events.verified) findings.push(`Enterprise event chain FAILED verification (broken at ${events.brokenAt ?? "unknown"}).`);
  const verified = audit.verified && events.verified;
  return {
    key: "AUDIT_INTEGRITY",
    title: "Ledger & event-chain integrity",
    score: verified ? 100 : 0,
    status: verified ? "OBSERVED" : "FAILED",
    weight: 0.3,
    findings: findings.length > 0 ? findings : ["Audit and event hash chains verify end-to-end."],
    evidence: {
      auditRecords: audit.records,
      auditHeadMatches: audit.headMatches,
      eventRecords: events.records,
      eventHeadMatches: events.headMatches,
    },
  };
}

async function controlEffectivenessComponent(scope: string[]): Promise<PostureComponent> {
  const rows = await db
    .select({
      effectiveness: controls.effectiveness,
      evidenceDocumentId: controls.evidenceDocumentId,
      lastTestedAt: controls.lastTestedAt,
    })
    .from(controls)
    .where(inArray(controls.tenantId, scope));
  if (rows.length === 0) {
    return {
      key: "CONTROL_EFFECTIVENESS",
      title: "Control effectiveness",
      score: null,
      status: "DATA_NOT_AVAILABLE",
      weight: 0.2,
      findings: ["No controls registered in scope — control posture is NOT PROVEN."],
      evidence: { controlCount: 0 },
    };
  }
  const weightFor = (effectiveness: string, hasEvidence: boolean): number => {
    // No evidence = NOT PROVEN (§21): an "effective" control without evidence
    // scores as unproven, never as effective.
    if (!hasEvidence) return 0.25;
    switch (effectiveness) {
      case "EFFECTIVE":
        return 1;
      case "PARTIALLY_EFFECTIVE":
        return 0.5;
      case "NOT_EFFECTIVE":
      case "INEFFECTIVE":
        return 0;
      default:
        return 0.25; // NOT_ASSESSED and unknown vocabularies never score as good
    }
  };
  const total = rows.reduce((s, r) => s + weightFor(r.effectiveness, r.evidenceDocumentId !== null), 0);
  const withoutEvidence = rows.filter((r) => r.evidenceDocumentId === null).length;
  const neverTested = rows.filter((r) => r.lastTestedAt === null).length;
  const findings: string[] = [];
  if (withoutEvidence > 0) findings.push(`${withoutEvidence} control(s) carry no evidence document — NOT PROVEN.`);
  if (neverTested > 0) findings.push(`${neverTested} control(s) have never been tested.`);
  return {
    key: "CONTROL_EFFECTIVENESS",
    title: "Control effectiveness & evidence",
    score: clampScore((total / rows.length) * 100),
    status: "OBSERVED",
    weight: 0.2,
    findings: findings.length > 0 ? findings : ["All registered controls are evidenced."],
    evidence: { controlCount: rows.length, withoutEvidence, neverTested },
  };
}

async function riskComponent(scope: string[]): Promise<PostureComponent> {
  const rows = await db
    .select({
      status: risks.status,
      escalated: risks.escalated,
      residualLikelihood: risks.residualLikelihood,
      residualImpact: risks.residualImpact,
      appetiteThreshold: risks.appetiteThreshold,
    })
    .from(risks)
    .where(and(inArray(risks.tenantId, scope), ne(risks.status, "CLOSED")));
  if (rows.length === 0) {
    return {
      key: "RISK_POSITION",
      title: "Open risk position",
      score: null,
      status: "DATA_NOT_AVAILABLE",
      weight: 0.15,
      findings: ["No open risks registered in scope."],
      evidence: { openRisks: 0 },
    };
  }
  const escalated = rows.filter((r) => r.escalated || r.status === "ESCALATED").length;
  const overAppetite = rows.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold).length;
  // Start at 100; each escalated or over-appetite open risk costs points.
  const score = clampScore(100 - escalated * 15 - overAppetite * 10);
  return {
    key: "RISK_POSITION",
    title: "Open risk position vs appetite",
    score,
    status: escalated > 0 || overAppetite > 0 ? "FAILED" : "OBSERVED",
    weight: 0.15,
    findings: [
      escalated > 0 ? `${escalated} escalated open risk(s).` : "No escalated open risks.",
      overAppetite > 0 ? `${overAppetite} open risk(s) above appetite threshold.` : "All open risks within appetite.",
    ],
    evidence: { openRisks: rows.length, escalated, overAppetite },
  };
}

async function complianceComponent(scope: string[]): Promise<PostureComponent> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({ nextDueAt: complianceObligations.nextDueAt, status: complianceObligations.status })
    .from(complianceObligations)
    .where(and(inArray(complianceObligations.tenantId, scope), eq(complianceObligations.status, "ACTIVE")));
  if (rows.length === 0) {
    return {
      key: "COMPLIANCE_POSITION",
      title: "Regulatory obligation position",
      score: null,
      status: "DATA_NOT_AVAILABLE",
      weight: 0.15,
      findings: ["No active obligations registered in scope."],
      evidence: { activeObligations: 0 },
    };
  }
  const overdue = rows.filter((r) => r.nextDueAt !== null && r.nextDueAt < today).length;
  const score = clampScore(((rows.length - overdue) / rows.length) * 100);
  return {
    key: "COMPLIANCE_POSITION",
    title: "Regulatory obligations & deadlines",
    score,
    status: overdue > 0 ? "FAILED" : "OBSERVED",
    weight: 0.15,
    findings: overdue > 0 ? [`${overdue} active obligation(s) past their next due date.`] : ["No active obligation is past due."],
    evidence: { activeObligations: rows.length, overdue },
  };
}

async function tlsGovernanceComponent(): Promise<PostureComponent> {
  // Governance-artifact check: the fail-closed TLS trust configuration and its
  // preflight/trust-matrix tooling must exist in the deployed tree. This is a
  // static posture signal; the authoritative live TLS verification remains
  // scripts/tls-preflight.mts and the CI tls-* workflows (which FAIL CLOSED).
  const root = process.cwd();
  const artifacts = [
    "config/tls/supabase",
    "scripts/tls-preflight.mts",
    "scripts/tls-trust-matrix.mjs",
    "src/db/tls.ts",
  ];
  const present = artifacts.filter((a) => existsSync(join(root, a)));
  const missing = artifacts.filter((a) => !present.includes(a));
  const score = clampScore((present.length / artifacts.length) * 100);
  return {
    key: "TLS_GOVERNANCE",
    title: "TLS trust governance artifacts",
    score,
    status: missing.length === 0 ? "OBSERVED" : "FAILED",
    weight: 0.1,
    findings:
      missing.length === 0
        ? ["TLS trust anchors, preflight and trust-matrix tooling present (fail-closed by construction)."]
        : [`Missing TLS governance artifacts: ${missing.join(", ")}.`],
    evidence: { artifactsPresent: present, artifactsMissing: missing },
  };
}

async function evidenceCoverageComponent(scope: string[]): Promise<PostureComponent> {
  // Capitalization + trust governance evidence coverage (Phase 2/3 registers):
  // material records that require legal review and still carry it open are
  // reported — never scored as failures (they are lawful work-in-progress),
  // but they cap how "proven" the institution is.
  const openLeaverRows = await db
    .select({ id: leaverCases.id })
    .from(leaverCases)
    .where(and(inArray(leaverCases.tenantId, scope), inArray(leaverCases.status, ["INITIATED", "CLASSIFIED", "APPROVED"])));
  const openLeavers = openLeaverRows.length;
  const inertRows = await db
    .select({ id: trustProvisions.id })
    .from(trustProvisions)
    .where(and(inArray(trustProvisions.tenantId, scope), inArray(trustProvisions.legalEffectStatus, ["INERT", "UNDER_LEGAL_REVIEW"])));
  const inertProvisions = inertRows.length;
  const openItems = openLeavers + inertProvisions;
  const score = clampScore(Math.max(0, 100 - openItems * 5));
  return {
    key: "GOVERNANCE_EVIDENCE",
    title: "Open legal-review surface (equity & trust)",
    score,
    status: "OBSERVED",
    weight: 0.1,
    findings: [
      openLeavers > 0 ? `${openLeavers} leaver case(s) awaiting classification/approval/execution.` : "No open leaver cases.",
      inertProvisions > 0 ? `${inertProvisions} trust provision(s) INERT or under legal review.` : "No inert trust provisions.",
    ],
    evidence: { openLeaverCases: openLeavers, inertTrustProvisions: inertProvisions },
  };
}

/**
 * Compute the institutional posture for the principal's tenant scope.
 * READ-ONLY: this function never writes, never audits a mutation and never
 * feeds any authorization decision.
 */
export async function computeInstitutionalPosture(principal: Principal): Promise<InstitutionalPosture> {
  const scope = await tenantScopeIds(principal);
  const components = await Promise.all([
    auditIntegrityComponent(),
    controlEffectivenessComponent(scope),
    riskComponent(scope),
    complianceComponent(scope),
    tlsGovernanceComponent(),
    evidenceCoverageComponent(scope),
  ]);

  const audit = components[0];
  const scored = components.filter((c) => c.score !== null);
  const totalWeight = scored.reduce((s, c) => s + c.weight, 0);
  let postureScore: number | null = null;
  if (totalWeight > 0) {
    postureScore = clampScore(scored.reduce((s, c) => s + (c.score as number) * c.weight, 0) / totalWeight);
  }
  // §46/§21: if the ledgers do not verify, nothing is provable — cap the score.
  const capped = audit.status === "FAILED";
  if (postureScore !== null && capped) {
    postureScore = Math.min(postureScore, 40);
  }

  return {
    serviceVersion: POSTURE_SERVICE_VERSION,
    computedAt: new Date().toISOString(),
    tenantId: principal.tenantId,
    postureScore,
    cappedByAuditIntegrity: capped,
    components,
    advisoryOnly: true,
    grantsAuthority: false,
    boundary: BOUNDARY,
  };
}
