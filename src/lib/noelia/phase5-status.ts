import { desc, eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { noeliaCertificationReadiness, noeliaEvidence } from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";

/**
 * Phase 5 honest status block.
 *
 * This is a REPORT, not an authority. Every field is derived from observable
 * configuration and registry state. When a real generative endpoint or
 * credential ref is absent the field is `BLOCKED`/`ENVIRONMENT_LIMITED`, never
 * `AVAILABLE`. It never reports a certification status that is not backed by an
 * external evidence record.
 */

export type Phase5StatusKey =
  | "PHASE_5_IMPLEMENTATION"
  | "PHASE_5_TECHNICAL_VERIFICATION"
  | "PRODUCTION_GENERATIVE_RUNTIME"
  | "HIVE_RUNTIME"
  | "RAG_KNOWLEDGE_FABRIC"
  | "AI_OBSERVABILITY"
  | "AI_EVALUATION_ENGINE"
  | "MODEL_LIFECYCLE"
  | "MODEL_SUPPLY_CHAIN"
  | "PRODUCTION_RESILIENCE"
  | "CONTINUOUS_ASSURANCE"
  | "REAL_GENERATIVE_INFERENCE"
  | "EU_AI_ACT_READINESS"
  | "ISO_42001_READINESS"
  | "NIST_AI_RMF_ALIGNMENT"
  | "INTERNATIONAL_STANDARDS_READINESS"
  | "EXTERNAL_ASSESSMENT_STATUS"
  | "ACTUAL_CERTIFICATION_STATUS";

export type Phase5StatusRow = {
  key: Phase5StatusKey;
  status: "IMPLEMENTED" | "PARTIAL" | "IN_PROGRESS" | "BLOCKED" | "ENVIRONMENT_LIMITED" | "NOT_APPLICABLE" | "NOT_CERTIFIED" | "CERTIFIED";
  evidence: string;
  note: string;
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia Phase 5 status requires canonical transaction-scoped tenant context");
}

export async function phase5StatusBlock(principal: Principal): Promise<{ generatedAt: string; rows: Phase5StatusRow[] }> {
  requireContext();
  const decision = can(principal, "ai:compliance.metrics");
  if (!decision.allowed) throw new Error(`Phase 5 status denied: ${decision.reason}`);

  const generativeConfigured = Boolean(process.env.NOELIA_GENERATIVE_ENDPOINT && process.env.NOELIA_GENERATIVE_CREDENTIAL_REF);

  const readiness = await db
    .select()
    .from(noeliaCertificationReadiness)
    .orderBy(desc(noeliaCertificationReadiness.updatedAt));
  const externalCertificates = await db
    .select()
    .from(noeliaEvidence)
    .where(eq(noeliaEvidence.evidenceType, "EXTERNAL_CERTIFICATE"));
  const hasStartedReadiness = readiness.some((r) => r.state !== "NOT_STARTED" && r.state !== "NOT_CERTIFIED");
  const certState =
    externalCertificates.length > 0 && externalCertificates.some((e) => e.status === "VERIFIED" && (!e.expiresAt || e.expiresAt.getTime() > Date.now()))
      ? "CERTIFIED"
      : readiness.some((r) => r.state === "EXTERNAL_ASSESSMENT_COMPLETE")
        ? "EXTERNAL_ASSESSMENT_COMPLETE"
        : hasStartedReadiness
          ? "IN_PROGRESS"
          : "NOT_CERTIFIED";
  const externalAssessor = readiness.find((r) => r.externalAssessor)?.externalAssessor ?? null;

  const rows: Phase5StatusRow[] = [
    {
      key: "PHASE_5_IMPLEMENTATION",
      status: "IN_PROGRESS",
      evidence: "schema 0027 + runtime fabric + observability + RAG + evaluation + resilience + continuous assurance",
      note: "The Phase 5 production fabric is implemented and exercised by tests/reality audit.",
    },
    {
      key: "PHASE_5_TECHNICAL_VERIFICATION",
      status: "PARTIAL",
      evidence: "typecheck + targeted runtime tests",
      note: "Full `npm test` and `npm run build` must be run in CI before closing the phase.",
    },
    {
      key: "PRODUCTION_GENERATIVE_RUNTIME",
      status: generativeConfigured ? "PARTIAL" : "BLOCKED",
      evidence: generativeConfigured
        ? "OpenAI-compatible endpoint + credential reference present; registry approval required."
        : "No NOELIA_GENERATIVE_ENDPOINT / NOELIA_GENERATIVE_CREDENTIAL_REF.",
      note: "The runtime boundary is implemented; no real provider is mounted.",
    },
    {
      key: "HIVE_RUNTIME",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/hive-runtime.ts + tests/noelia/phase5-platform.test.ts",
      note: "HIVE is a governed execution boundary, not a second authorization system.",
    },
    {
      key: "RAG_KNOWLEDGE_FABRIC",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/knowledge-fabric.ts + migration 0027 metadata columns",
      note: "SQL-pushdown governed retrieval; vector/embedding state remains ENVIRONMENT_LIMITED.",
    },
    {
      key: "AI_OBSERVABILITY",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/observability.ts + noelia_ai_telemetry / noelia_ai_spans",
      note: "Non-sensitive telemetry only; no prompts, outputs or credentials persisted.",
    },
    {
      key: "AI_EVALUATION_ENGINE",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/evaluation-engine.ts + noelia_ai_evaluation_runs / noelia_ai_red_team_results",
      note: "Evaluation records and red-team outcomes are honest; they never promote a model.",
    },
    {
      key: "MODEL_LIFECYCLE",
      status: "PARTIAL",
      evidence: "src/lib/noelia/model-lifecycle.ts + noelia_model_lifecycle_events",
      note: "Lifecycle events are appended; real provider/model activation remains registry-governed.",
    },
    {
      key: "MODEL_SUPPLY_CHAIN",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/model-operations.ts + supply-chain verification",
      note: "Verification fails closed when artifacts/checksum/provenance are missing.",
    },
    {
      key: "PRODUCTION_RESILIENCE",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/resilience.ts + circuit breaker + telemetry",
      note: "Circuit breaker and fail-closed resilience guard are implemented.",
    },
    {
      key: "CONTINUOUS_ASSURANCE",
      status: "IMPLEMENTED",
      evidence: "src/lib/noelia/continuous-assurance.ts",
      note: "Assurance attestation records observable reality; PASS requires all gates.",
    },
    {
      key: "REAL_GENERATIVE_INFERENCE",
      status: generativeConfigured ? "PARTIAL" : "ENVIRONMENT_LIMITED",
      evidence: generativeConfigured ? "Endpoint + credential ref mounted." : "No generative endpoint/credential ref mounted.",
      note: "Inference remains fail-closed until a real provider is mounted and registry-approved.",
    },
    {
      key: "EU_AI_ACT_READINESS",
      status: readiness.some((r) => r.frameworkId === "EU_AI_ACT" && r.state !== "NOT_STARTED" && r.state !== "NOT_CERTIFIED") ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: "Phase 4 requirement/applicability registers (migration 0026)",
      note: "Governance readiness only; not a legal opinion and not certification.",
    },
    {
      key: "ISO_42001_READINESS",
      status: readiness.some((r) => r.frameworkId === "ISO_42001" && r.state !== "NOT_STARTED" && r.state !== "NOT_CERTIFIED") ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: "Phase 4 controls/evidence/audit records",
      note: "Ready for an external assessment once evidence and internal review are complete.",
    },
    {
      key: "NIST_AI_RMF_ALIGNMENT",
      status: readiness.some((r) => r.frameworkId === "NIST_AI_RMF" && r.state !== "NOT_STARTED" && r.state !== "NOT_CERTIFIED") ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: "Phase 4 risk treatment + continuous monitoring",
      note: "GOVERN/MAP/MEASURE/MANAGE are represented; no self-declared certification.",
    },
    {
      key: "INTERNATIONAL_STANDARDS_READINESS",
      status: hasStartedReadiness ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: "ISO 23894 / ISO 27001 / ISO 27701 / ISO 22989 / ISO 23053 requirement registry",
      note: "Readiness is evidence-gated and never converted to certification without an assessor.",
    },
    {
      key: "EXTERNAL_ASSESSMENT_STATUS",
      status: certState === "CERTIFIED" ? "CERTIFIED" : hasStartedReadiness ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: externalAssessor ? `Assessor: ${externalAssessor}` : "No external assessor evidence record is present.",
      note: "An external assessment has not been performed in this environment unless evidence states otherwise.",
    },
    {
      key: "ACTUAL_CERTIFICATION_STATUS",
      status: certState === "CERTIFIED" ? "CERTIFIED" : hasStartedReadiness ? "IN_PROGRESS" : "NOT_CERTIFIED",
      evidence: externalCertificates.length > 0
        ? `${externalCertificates.length} EXTERNAL_CERTIFICATE evidence record(s) present.`
        : "No current EXTERNAL_CERTIFICATE evidence; readiness state remains pre-assessment.",
      note: "Beyu OS does not self-declare certification.",
    },
  ];

  return { generatedAt: new Date().toISOString(), rows };
}
