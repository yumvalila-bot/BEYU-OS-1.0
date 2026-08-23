import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  aiDecisions,
  complianceAssessments,
  complianceObligations,
  capitalRequests,
  knowledgeSources,
  resolutions,
  risks,
  taxStrategies,
  treasuryPositions,
  waterfallRuns,
  type AiSource,
} from "@/db/schema";
import { listWorkforce } from "./hcm";
import { newId, ID_PREFIX } from "./ids";
import {
  CLASSIFICATION_ORDER,
  HIVE_RUNTIME,
  NOELIA_IDENTITY,
  NOELIA_PROMPT_VERSION,
  classificationRank,
  isKnownClassification,
  type Classification,
  type PermissionCode,
} from "./constants";
import { can, type Principal } from "./authz";
import { evaluatePolicy } from "./policy";
import { recordAuditTx, publishEventTx } from "./audit";

/**
 * NOELIA — the single AI identity of the BEYU ecosystem, executing on the
 * HIVE runtime. Noelia can NEVER bypass identity, authorization, tenancy,
 * classification or policy. Every material answer is recorded in ai_decisions.
 *
 * Pipeline:
 *  REQUEST → IDENTITY → AUTHORIZATION → CONTEXT → POLICY → DATA RETRIEVAL →
 *  KNOWLEDGE RETRIEVAL → ANALYSIS → TOOL EXECUTION → VALIDATION → RISK CHECK →
 *  HUMAN REVIEW IF REQUIRED → RECOMMENDATION → AUDIT → MONITORING
 */

export type NoeliaEngine =
  | "FINANCIAL"
  | "RISK"
  | "COMPLIANCE"
  | "GOVERNANCE"
  | "TAX"
  | "WORKFORCE"
  | "KNOWLEDGE";

export type NoeliaAnswer = {
  decisionId: string;
  engine: NoeliaEngine;
  outputClass: "FACT" | "INFERENCE" | "RECOMMENDATION" | "PREDICTION" | "UNCERTAINTY" | "REQUIRES_HUMAN_REVIEW";
  headline: string;
  findings: { label: string; value: string; kind: "FACT" | "INFERENCE" | "RECOMMENDATION" }[];
  narrative: string;
  sources: AiSource[];
  confidence: number;
  humanReviewRequired: boolean;
  deniedScopes: string[];
  policyDecision: string;
  toolsUsed: string[];
  latencyMs: number;
};

const MODEL = "beyu-hive-deterministic-analyst";
const MODEL_VERSION = "2026.01";

/** Intent routing — deterministic, inspectable, no hidden prompt behaviour. */
export function routeEngine(question: string): NoeliaEngine {
  const q = question.toLowerCase();
  if (/tax|vat|withhold|tra |deduction|capital allowance/.test(q)) return "TAX";
  if (/risk|threat|exposure|incident/.test(q)) return "RISK";
  if (/complian|regulat|gdpr|obligation|audit finding/.test(q)) return "COMPLIANCE";
  if (/resolution|board|governance|approval|policy/.test(q)) return "GOVERNANCE";
  if (/employee|workforce|headcount|hcm|staff|payroll/.test(q)) return "WORKFORCE";
  if (/cash|revenue|capital|treasury|waterfall|liquidity|financ|distribut/.test(q)) return "FINANCIAL";
  return "KNOWLEDGE";
}

const ENGINE_PERMISSION: Record<NoeliaEngine, PermissionCode> = {
  FINANCIAL: "finance:capital.read",
  RISK: "risk:register.read",
  COMPLIANCE: "compliance:obligation.read",
  GOVERNANCE: "governance:resolution.read",
  TAX: "finance:tax.read",
  WORKFORCE: "hcm:employee.read",
  KNOWLEDGE: "platform:dashboard.read",
};

async function retrieveKnowledge(question: string, clearance: Classification): Promise<AiSource[]> {
  const terms = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3)
    .slice(0, 6);
  if (terms.length === 0 || !isKnownClassification(clearance)) return [];

  const visibleClassifications = CLASSIFICATION_ORDER.filter(
    (classification) => classificationRank(classification) <= classificationRank(clearance),
  );
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      code: knowledgeSources.code,
      title: knowledgeSources.title,
      authority: knowledgeSources.authorityStatus,
      content: knowledgeSources.content,
    })
    .from(knowledgeSources)
    .where(
      and(
        eq(knowledgeSources.authorityStatus, "AUTHORITATIVE"),
        inArray(knowledgeSources.classification, visibleClassifications),
        lte(knowledgeSources.effectiveFrom, today),
        gte(knowledgeSources.reviewDate, today),
        or(isNull(knowledgeSources.expiresAt), gte(knowledgeSources.expiresAt, today)),
        sql`lower(${knowledgeSources.title} || ' ' || ${knowledgeSources.content}) ~ ${terms.join("|")}`,
      ),
    )
    .limit(4);
  return rows.map((r) => ({
    kind: "KNOWLEDGE_SOURCE",
    ref: r.code,
    label: r.title,
    authority: r.authority,
  }));
}

/** Executes the governed pipeline and persists the AI decision record. */
export async function askNoelia(params: {
  principal: Principal;
  question: string;
  traceId: string;
}): Promise<NoeliaAnswer> {
  const started = Date.now();
  const { principal, question } = params;
  const engine = routeEngine(question);
  const deniedScopes: string[] = [];
  const toolsUsed: string[] = [];
  const sources: AiSource[] = [];
  const findings: NoeliaAnswer["findings"] = [];

  // --- AUTHORIZATION: Noelia inherits, never exceeds, the user's authority ---
  const engineAccess = can(principal, ENGINE_PERMISSION[engine]);
  if (!engineAccess.allowed) deniedScopes.push(ENGINE_PERMISSION[engine]);

  // --- POLICY ---
  const policy = await evaluatePolicy({
    action: "ai:noelia.query",
    tenantId: principal.tenantId,
    roles: principal.roles,
    aiInitiated: true,
  });

  let headline = "";
  let narrative = "";
  let outputClass: NoeliaAnswer["outputClass"] = "INFERENCE";
  let confidence = 0.62;
  let humanReviewRequired = policy.obligations.some((o) => o.type === "HUMAN_REVIEW");

  if (policy.effect === "DENY") {
    outputClass = "REQUIRES_HUMAN_REVIEW";
    headline = "Request blocked by enterprise policy.";
    narrative = policy.denials.map((d) => `${d.policyCode}: ${d.message}`).join(" ");
    humanReviewRequired = true;
  } else if (!engineAccess.allowed) {
    outputClass = "REQUIRES_HUMAN_REVIEW";
    headline = "Insufficient authority for this intelligence domain.";
    narrative = `Noelia operates strictly within your granted permissions. ${engineAccess.reason}. Request an authorized grant through Identity & Access governance.`;
    confidence = 1;
  } else {
    const tenantId = principal.tenantId;
    switch (engine) {
      case "FINANCIAL": {
        toolsUsed.push("finance.treasury.aggregate", "finance.capital.pipeline", "finance.waterfall.latest");
        const [treasury] = await db
          .select({
            total: sql<string>`coalesce(sum(${treasuryPositions.baseCurrencyBalance}),0)`,
            accounts: sql<number>`count(*)`,
          })
          .from(treasuryPositions)
          .where(eq(treasuryPositions.tenantId, tenantId));
        const pipeline = await db
          .select({
            status: capitalRequests.status,
            total: sql<string>`coalesce(sum(${capitalRequests.amount}),0)`,
            n: sql<number>`count(*)`,
          })
          .from(capitalRequests)
          .where(eq(capitalRequests.tenantId, tenantId))
          .groupBy(capitalRequests.status);
        const [lastRun] = await db
          .select()
          .from(waterfallRuns)
          .where(eq(waterfallRuns.tenantId, tenantId))
          .orderBy(desc(waterfallRuns.executedAt))
          .limit(1);

        findings.push({ label: "Consolidated treasury (base ccy)", value: Number(treasury?.total ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 }), kind: "FACT" });
        for (const p of pipeline) {
          findings.push({ label: `Capital pipeline · ${p.status}`, value: `${p.n} request(s), ${Number(p.total).toLocaleString("en-US", { maximumFractionDigits: 0 })}`, kind: "FACT" });
        }
        if (lastRun) {
          findings.push({
            label: "Latest waterfall run",
            value: `${lastRun.period} · gross ${Number(lastRun.grossAmount).toLocaleString("en-US")} ${lastRun.currency} · residual ${Number(lastRun.residual).toLocaleString("en-US")}`,
            kind: "FACT",
          });
          sources.push({ kind: "WATERFALL_RUN", ref: lastRun.id, label: `Waterfall ${lastRun.period}`, authority: "FINANCE_OS" });
        }
        const approved = pipeline.find((p) => p.status === "APPROVED");
        headline = "Liquidity and capital posture assembled from Finance OS records.";
        narrative = `Finance OS remains authoritative for all financial consequences. ${
          approved
            ? `Approved capital commitments of ${Number(approved.total).toLocaleString("en-US")} must be funded from the distributable tiers of the active waterfall before any owner distribution.`
            : "No approved capital commitments are currently outstanding."
        } Any change to allocation requires a governed resolution.`;
        outputClass = "INFERENCE";
        confidence = 0.86;
        break;
      }
      case "RISK": {
        toolsUsed.push("risk.register.query");
        const rows = await db
          .select()
          .from(risks)
          .where(eq(risks.tenantId, tenantId))
          .orderBy(desc(sql`${risks.residualLikelihood} * ${risks.residualImpact}`))
          .limit(5);
        for (const r of rows) {
          findings.push({
            label: `${r.code} · ${r.title}`,
            value: `residual ${r.residualLikelihood * r.residualImpact} (appetite ${r.appetiteThreshold}) · ${r.category} · ${r.treatment}`,
            kind: "FACT",
          });
          sources.push({ kind: "RISK", ref: r.code, label: r.title, authority: "RISK_ENGINE" });
        }
        const breaches = rows.filter((r) => r.residualLikelihood * r.residualImpact > r.appetiteThreshold);
        headline = `${breaches.length} risk(s) currently exceed enterprise appetite.`;
        narrative = breaches.length
          ? `Escalation is recommended to the Risk & Audit Committee for: ${breaches.map((b) => b.code).join(", ")}. Owners must confirm mitigation adequacy; Noelia cannot close or accept a risk.`
          : "All monitored residual scores sit within the approved appetite threshold.";
        outputClass = "RECOMMENDATION";
        humanReviewRequired = humanReviewRequired || breaches.length > 0;
        confidence = 0.83;
        break;
      }
      case "COMPLIANCE": {
        toolsUsed.push("compliance.obligation.query", "compliance.assessment.latest");
        const rows = await db
          .select({
            code: complianceObligations.code,
            title: complianceObligations.title,
            framework: complianceObligations.framework,
            jurisdiction: complianceObligations.jurisdictionCode,
            state: complianceAssessments.state,
          })
          .from(complianceObligations)
          .leftJoin(complianceAssessments, eq(complianceAssessments.obligationId, complianceObligations.id))
          .where(eq(complianceObligations.tenantId, tenantId))
          .limit(12);
        const buckets = new Map<string, number>();
        for (const r of rows) {
          const key = r.state ?? "NOT_ASSESSED";
          buckets.set(key, (buckets.get(key) ?? 0) + 1);
        }
        for (const [k, v] of buckets) findings.push({ label: `Obligations · ${k}`, value: String(v), kind: "FACT" });
        const problem = rows.filter((r) => r.state === "NON_COMPLIANT" || r.state === "PARTIALLY_COMPLIANT");
        for (const p of problem.slice(0, 4)) {
          sources.push({ kind: "OBLIGATION", ref: p.code, label: `${p.framework} ${p.title}`, authority: "COMPLIANCE_ENGINE" });
        }
        headline = problem.length
          ? `${problem.length} obligation(s) are not fully compliant.`
          : "No non-compliant obligations detected in the assessed population.";
        narrative =
          "Compliance state is jurisdiction-aware and never inferred. Unassessed obligations remain NOT_ASSESSED — Noelia will not assert compliance without evidence and human confirmation.";
        outputClass = problem.length ? "RECOMMENDATION" : "FACT";
        humanReviewRequired = humanReviewRequired || problem.length > 0;
        confidence = 0.88;
        break;
      }
      case "GOVERNANCE": {
        toolsUsed.push("governance.resolution.query");
        const rows = await db
          .select()
          .from(resolutions)
          .where(eq(resolutions.tenantId, tenantId))
          .orderBy(desc(resolutions.createdAt))
          .limit(6);
        for (const r of rows) {
          findings.push({
            label: `${r.reference} · ${r.title}`,
            value: `${r.status} · ${r.category} · quorum ${r.quorumMet ? "met" : "not met"} · ${r.votesFor}/${r.votesAgainst}/${r.votesAbstain}`,
            kind: "FACT",
          });
          sources.push({ kind: "RESOLUTION", ref: r.reference, label: r.title, authority: "GOVERNANCE_ENGINE" });
        }
        const pending = rows.filter((r) => r.status === "DRAFT" || r.status === "TABLED");
        headline = `${pending.length} resolution(s) awaiting a governance decision.`;
        narrative =
          "Every material decision is traceable to who, what, when, why, under which authority, on which data, under which policy and with which approvals. Noelia may summarise but never vote, approve or record an outcome.";
        outputClass = "FACT";
        confidence = 0.94;
        break;
      }
      case "TAX": {
        toolsUsed.push("tax.knowledge.query");
        const rows = await db.select().from(taxStrategies).limit(20);
        const authoritative = rows.filter((r) => r.authorityStatus === "AUTHORITATIVE");
        for (const r of authoritative.slice(0, 5)) {
          findings.push({
            label: `${r.code} · ${r.title}`,
            value: `${r.jurisdictionCode} · ${r.position} · ${r.statutoryReference}`,
            kind: "FACT",
          });
          sources.push({ kind: "TAX_STRATEGY", ref: r.code, label: r.statutoryReference, authority: r.authorityStatus });
        }
        headline = "Tax positions are jurisdiction-bound and legally sourced.";
        narrative =
          "Noelia distinguishes legal tax planning, lawful avoidance and aggressive/uncertain positions, and will never surface or assist unlawful evasion. Eligibility must be assessed against the specific taxpayer's facts in Finance OS → Tax Strategy Intelligence; approval requires the Tax Governance workflow.";
        outputClass = "REQUIRES_HUMAN_REVIEW";
        humanReviewRequired = true;
        confidence = 0.79;
        break;
      }
      case "WORKFORCE": {
        toolsUsed.push("hcm.employee.aggregate");
        const workforce = await listWorkforce(principal);
        const byEntity = new Map<string, { n: number; active: number }>();
        for (const r of workforce.records) {
          const bucket = byEntity.get(r.legalEntityName) ?? { n: 0, active: 0 };
          bucket.n += 1;
          if (r.status === "ACTIVE") bucket.active += 1;
          byEntity.set(r.legalEntityName, bucket);
        }
        for (const [entity, r] of byEntity) {
          findings.push({ label: `Headcount · ${entity}`, value: `${r.active} active of ${r.n}`, kind: "FACT" });
        }
        headline = "Workforce figures drawn from the single HCM employee master.";
        narrative =
          "HCM is the only source of truth for the workforce; Sector OSs consume governed HCM data and may not hold independent employee masters. Compensation consequences remain authoritative in Finance OS.";
        outputClass = "FACT";
        confidence = 0.92;
        break;
      }
      default: {
        toolsUsed.push("knowledge.rag.search");
        headline = "Answer assembled from governed enterprise knowledge.";
        narrative =
          "Only knowledge marked AUTHORITATIVE within its review window is used. Where authoritative knowledge is absent, Noelia states uncertainty rather than fabricating authority.";
        outputClass = "UNCERTAINTY";
        confidence = 0.55;
      }
    }
  }

  const knowledge = await retrieveKnowledge(question, principal.clearance);
  sources.push(...knowledge);
  if (knowledge.length > 0) toolsUsed.push("knowledge.rag.search");
  if (sources.length === 0 && outputClass !== "REQUIRES_HUMAN_REVIEW") {
    confidence = Math.min(confidence, 0.6);
  }

  const latencyMs = Date.now() - started;
  const decisionId = newId(ID_PREFIX.aiDecision);

  await db.transaction(async (rawTx) => {
    const tx = rawTx as unknown as typeof db;
    await tx.insert(aiDecisions).values({
      id: decisionId,
      tenantId: principal.tenantId,
      userId: principal.userId,
      agent: NOELIA_IDENTITY,
      runtime: HIVE_RUNTIME,
      engine,
      model: MODEL,
      modelVersion: MODEL_VERSION,
      promptVersion: NOELIA_PROMPT_VERSION,
      requestType: "ANALYSIS",
      question,
      inputs: { tenantId: principal.tenantId, roles: principal.roles, clearance: principal.clearance },
      retrievedSources: sources,
      toolsUsed,
      output: { headline, narrative, findings },
      outputClass,
      confidence: confidence.toFixed(4),
      policyDecision: policy.effect,
      deniedScopes,
      humanReviewRequired,
      latencyMs,
    });
    await recordAuditTx(tx, {
      tenantId: principal.tenantId,
      actorUserId: principal.userId,
      actorType: "AI",
      action: "ai.noelia.query",
      objectType: "AI_DECISION",
      objectId: decisionId,
      reason: question.slice(0, 240),
      aiVersion: `${MODEL}@${MODEL_VERSION}/${NOELIA_PROMPT_VERSION}`,
      traceId: params.traceId,
    });
    await publishEventTx(tx, {
      type: "AI_DECISION_RECORDED",
      source: "beyu-os/ai",
      domain: "AI",
      operation: "NOELIA_QUERY",
      destinationDomain: null,
      tenantId: principal.tenantId,
      legalEntityId: null,
      subjectType: "AI_DECISION",
      subjectId: decisionId,
      actorUserId: principal.userId,
      actorType: "AI",
      classification: "RESTRICTED",
      payload: { engine, outputClass, humanReviewRequired, confidence },
      traceId: params.traceId,
      correlationId: params.traceId,
      causationId: null,
      authorityContext: {
        authorityId: null,
        decisionId: null,
        capabilityCode: null,
        permissionCode: "ai:noelia.query",
        policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null,
      },
      policyVersion: policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null,
    });
  });

  return {
    decisionId,
    engine,
    outputClass,
    headline,
    findings,
    narrative,
    sources,
    confidence,
    humanReviewRequired,
    deniedScopes,
    policyDecision: policy.effect,
    toolsUsed,
    latencyMs,
  };
}
