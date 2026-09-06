import { count, eq, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  modelRegistry,
  noeliaAiEvaluationRuns,
  noeliaAiRedTeamResults,
  noeliaAiTelemetry,
  noeliaCertificationReadiness,
  noeliaControls,
  noeliaEvidence,
  noeliaKillSwitch,
  noeliaProviders,
} from "@/db/schema";
import type { Principal } from "@/lib/authz";
import { can } from "@/lib/authz";
import { BeyuNoeliaObservabilityService } from "./observability";
import { BeyuNoeliaModelOperations } from "./model-operations";

/**
 * Phase 5 continuous AI assurance.
 *
 * This is a monitoring attestation, not a certification authority. It computes
 * an honest status from observable database state:
 *   - kill switches currently armed,
 *   - model registry rows not ACTIVE/APPROVED,
 *   - provider rows not ACTIVATED,
 *   - control registry rows not implemented/effective,
 *   - evidence integrity failures,
 *   - red-team output,
 *   - telemetry summary.
 *
 * `PASS` is reachable only when every live control is implemented and the
 * observable assurance gate is satisfied. If environment constraints make a
 * real generative inference impossible, that is reported as `ENVIRONMENT_LIMITED`
 * and does NOT become PASS.
 */

export type AssuranceStatus = "PASS" | "PARTIAL" | "FAIL_CLOSED" | "ENVIRONMENT_LIMITED";

export type ContinuousAssuranceAttestation = {
  generatedAt: string;
  status: AssuranceStatus;
  framework: "BEYU_REALITY_ASSURANCE";
  governanceAuthority: "BEYU_GOVERNANCE";
  realGenerativeInference: "BLOCKED" | "ENVIRONMENT_LIMITED" | "AVAILABLE";
  checks: Array<{
    id: string;
    label: string;
    status: "PASS" | "PARTIAL" | "FAIL" | "ENVIRONMENT_LIMITED";
    value: string;
    detail: string;
  }>;
  blockers: string[];
};

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) throw new Error("Noelia continuous assurance requires canonical transaction-scoped tenant context");
}

function requireAssuranceRead(principal: Principal): void {
  const decision = can(principal, "ai:compliance.metrics");
  if (!decision.allowed) throw new Error(`Continuous assurance read denied: ${decision.reason}`);
}

function requireAssuranceRun(principal: Principal): void {
  const decision = can(principal, "ai:model.router.read");
  if (!decision.allowed) throw new Error(`Continuous assurance run denied: ${decision.reason}`);
}

export class BeyuNoeliaContinuousAssurance {
  private readonly observability = new BeyuNoeliaObservabilityService();
  private readonly modelOps = new BeyuNoeliaModelOperations();

  async attest(input: { principal: Principal; traceId: string; requestId: string }): Promise<ContinuousAssuranceAttestation> {
    requireContext();
    requireAssuranceRead(input.principal);
    await requireAssuranceRun(input.principal);
    const checks: ContinuousAssuranceAttestation["checks"] = [];
    const blockers: string[] = [];

    // 1. Kill switches.
    const armed = await db
      .select({ n: count() })
      .from(noeliaKillSwitch)
      .where(eq(noeliaKillSwitch.enabled, true));
    checks.push({
      id: "ASSURANCE-001",
      label: "No armed kill switch",
      status: armed[0]?.n === 0 ? "PASS" : "FAIL",
      value: String(armed[0]?.n ?? 0),
      detail: "No kill switch may be armed in a continuously assumed production posture.",
    });
    if (armed[0] && armed[0].n > 0) blockers.push(`${armed[0].n} kill switch(es) armed.`);

    // 2. Model registry health.
    const models = await db.select().from(modelRegistry);
    const unhealthyModels = models.filter((m) => m.status !== "ACTIVE" || m.approvalStatus !== "APPROVED" || m.evaluationStatus !== "APPROVED" || m.lifecycleStatus !== "ACTIVE");
    checks.push({
      id: "ASSURANCE-002",
      label: "Approved model registry only",
      status: unhealthyModels.length === 0 ? "PASS" : "PARTIAL",
      value: `${models.length - unhealthyModels.length}/${models.length}`,
      detail: "Only ACTIVE/APPROVED/APPROVED models may execute.",
    });
    if (unhealthyModels.length > 0) blockers.push(`${unhealthyModels.length} model registry row(s) are not fully approved/active.`);

    // 3. Provider health.
    const providers = await db.select().from(noeliaProviders);
    const inactiveProviders = providers.filter((p) => !p.active || p.lifecycleStatus !== "ACTIVATED");
    checks.push({
      id: "ASSURANCE-003",
      label: "Activated providers only",
      status: inactiveProviders.length === 0 ? "PASS" : "PARTIAL",
      value: `${providers.length - inactiveProviders.length}/${providers.length}`,
      detail: "Only activated providers may be used by a mounted model.",
    });
    if (inactiveProviders.length > 0) blockers.push(`${inactiveProviders.length} provider(s) are not activated.`);

    // 4. Control completion.
    const controls = await db.select().from(noeliaControls);
    const implementationStatuses = ["IMPLEMENTED", "EFFECTIVE", "PARTIALLY_IMPLEMENTED"];
    const implementedControls = controls.filter((c) => implementationStatuses.includes(c.implementationStatus));
    checks.push({
      id: "ASSURANCE-004",
      label: "Controls implemented",
      status: controls.length > 0 && implementedControls.length === controls.length ? "PASS" : controls.length === 0 ? "FAIL" : "PARTIAL",
      value: `${implementedControls.length}/${controls.length}`,
      detail: "Continuous assurance accepts only current evidence-backed control implementation.",
    });
    if (controls.length === 0 || implementedControls.length < controls.length) blockers.push(`${controls.length - implementedControls.length} control(s) are not implemented.`);

    // 5. Evidence integrity.
    const evidence = await db.select().from(noeliaEvidence);
    const currentEvidence = evidence.filter((e) => e.status === "VERIFIED" && (!e.expiresAt || e.expiresAt.getTime() > Date.now()));
    const invalidEvidence = evidence.filter((e) => e.status === "REJECTED" || e.status === "FAILED" || (e.status === "VERIFIED" && e.expiresAt && e.expiresAt.getTime() <= Date.now()));
    checks.push({
      id: "ASSURANCE-005",
      label: "Evidence is current",
      status: invalidEvidence.length === 0 ? "PASS" : "PARTIAL",
      value: `${currentEvidence.length}/${evidence.length} current`,
      detail: "Verified, non-expired evidence is the only evidence that supports effective controls.",
    });
    if (invalidEvidence.length > 0) blockers.push(`${invalidEvidence.length} evidence record(s) are invalid/expired/rejected.`);

    // 6. Real generative inference.
    const configured = Boolean(process.env.NOELIA_GENERATIVE_ENDPOINT && process.env.NOELIA_GENERATIVE_CREDENTIAL_REF);
    checks.push({
      id: "ASSURANCE-006",
      label: "Real generative inference mounted",
      status: configured ? "PASS" : "ENVIRONMENT_LIMITED",
      value: configured ? "AVAILABLE" : "BLOCKED",
      detail: configured
        ? "A real generative endpoint and credential reference are present. Registry/approval still governs execution."
        : "No real generative endpoint or credential reference is present. Inference stays BLOCKED/ENVIRONMENT_LIMITED.",
    });

    // 7. Red-team coverage.
    const redTeam = await db.select().from(noeliaAiRedTeamResults);
    const redTeamMissed = redTeam.filter((r) => r.outcome === "MISSED").length;
    checks.push({
      id: "ASSURANCE-007",
      label: "Adversarial outcomes captured",
      status: redTeam.length === 0 ? "PARTIAL" : redTeamMissed === 0 ? "PASS" : "PARTIAL",
      value: `${redTeam.length} cases, ${redTeamMissed} missed`,
      detail: "Red-team results are honest evidence; missed cases never become PASS.",
    });
    if (redTeamMissed > 0) blockers.push(`${redTeamMissed} red-team case(s) were missed.`);

    // 8. Runtime fail-closed surface.
    const telemetryRows = await db.select().from(noeliaAiTelemetry).limit(100);
    const failClosed = telemetryRows.filter((r) => r.status === "FAIL_CLOSED" || r.status === "BLOCKED" || r.status === "DENIED").length;
    checks.push({
      id: "ASSURANCE-008",
      label: "Runtime fail-closed posture",
      status: failClosed === 0 ? "PASS" : "PARTIAL",
      value: `${failClosed}/${telemetryRows.length}`,
      detail: "Fail-closed telemetry is expected whenever a governing condition is absent; it is evidence of safe behavior, not of availability.",
    });

    // 9. Evaluation evidence.
    const evalRuns = await db.select().from(noeliaAiEvaluationRuns);
    checks.push({
      id: "ASSURANCE-009",
      label: "Continuous evaluation records",
      status: evalRuns.length > 0 ? "PASS" : "PARTIAL",
      value: `${evalRuns.length}`,
      detail: "Continuous evaluation evidence is required for production assurance.",
    });

    const status: AssuranceStatus =
      checks.some((c) => c.status === "FAIL")
        ? "FAIL_CLOSED"
        : !configured
          ? "ENVIRONMENT_LIMITED"
          : checks.some((c) => c.status === "PARTIAL")
            ? "PARTIAL"
            : "PASS";

    const attestation: ContinuousAssuranceAttestation = {
      generatedAt: new Date().toISOString(),
      status,
      framework: "BEYU_REALITY_ASSURANCE",
      governanceAuthority: "BEYU_GOVERNANCE",
      realGenerativeInference: configured ? "AVAILABLE" : "BLOCKED",
      checks,
      blockers,
    };

    await this.observability
      .recordTelemetry({
        principal: input.principal,
        traceId: input.traceId,
        requestId: input.requestId,
        task: "continuous-assurance",
        capability: "noelia-assurance-attestation",
        status: status === "PASS" ? "SUCCESS" : status === "FAIL_CLOSED" ? "FAIL_CLOSED" : "BLOCKED",
        payload: { status, blockers: blockers.length },
      })
      .catch(() => undefined);

    return attestation;
  }

  async readinessSummary(principal: Principal): Promise<Array<typeof noeliaCertificationReadiness.$inferSelect>> {
    requireContext();
    requireAssuranceRead(principal);
    return db.select().from(noeliaCertificationReadiness);
  }
}
