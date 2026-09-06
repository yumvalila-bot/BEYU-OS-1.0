/**
 * NOELIA — governed intelligence facade.
 *
 * Architectural boundary:
 *   Noelia → registered capability/tool → BEYU service → canonical context-aware
 *   db → transaction-local tenant context → PostgreSQL → audit.
 *
 * This facade intentionally imports no database handle. Noelia is intelligence;
 * BEYU OS identity, policy, capability services and evidence remain authority.
 */
import type { Principal } from "./authz";
import { withTenantDatabaseContext } from "./tenant-scope";
import { createDefaultNoeliaToolRegistry } from "./noelia/default-tools";
import { BeyuNoeliaEvidenceService, BeyuNoeliaPolicyService } from "./noelia/platform-services";
import { NoeliaRuntime, routeEngine, type NoeliaModelPorts } from "./noelia/runtime";
import { BeyuNoeliaAiPlatformService } from "./noelia/ai-platform";
import { BeyuNoeliaModelGateway } from "./noelia/model-gateway";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "./noelia/scope-service";
import type { NoeliaAnalysisType, NoeliaAnswer, NoeliaBriefingStructure, NoeliaExecutiveBriefing, NoeliaTargetContext } from "./noelia/types";

export { routeEngine };
export type { NoeliaAnswer, NoeliaEngine, NoeliaExecutiveBriefing } from "./noelia/types";
export { NoeliaRuntime } from "./noelia/runtime";
export { NoeliaToolRegistry } from "./noelia/tool-registry";
export { decideMemoryVisibility, retrieveGovernedMemory } from "./noelia/memory";
export { BeyuNoeliaWorkflowService } from "./noelia/workflows";
export { BeyuNoeliaSchedulerService } from "./noelia/scheduler-service";
export {
  BeyuNoeliaComplianceService,
  ComplianceAccessError,
  ComplianceStateError,
  EvidenceIntegrityError,
  computeEvidenceHash,
  isEvidenceCurrent,
} from "./noelia/compliance-engine";
export type { CertificationState } from "./noelia/compliance-engine";

/** Phase 2 — production model ports: authoritative routing + governed gateway. */
function createNoeliaModelPorts(): NoeliaModelPorts {
  return {
    router: new BeyuNoeliaAiPlatformService(),
    gateway: new BeyuNoeliaModelGateway(),
  };
}

export async function askNoelia(params: {
  principal: Principal;
  question: string;
  traceId: string;
  target?: Partial<NoeliaTargetContext> | null;
}): Promise<NoeliaAnswer> {
  return withTenantDatabaseContext(params.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(params.principal);
    const target = requestedNoeliaTarget(params.principal, params.target);
    const runtime = new NoeliaRuntime(
      createDefaultNoeliaToolRegistry(),
      new BeyuNoeliaPolicyService(),
      new BeyuNoeliaEvidenceService(),
      createNoeliaModelPorts(),
    );
    return runtime.ask({
      principal: params.principal,
      question: params.question,
      traceId: params.traceId,
      target,
      scope,
    });
  });
}

/** Executive intelligence briefing (section 6 + section 20 contract). */
export async function briefNoelia(params: {
  principal: Principal;
  question: string;
  traceId: string;
  correlationId?: string | null;
  target?: Partial<NoeliaTargetContext> | null;
  horizon?: string | null;
  focus?: string | null;
  structure?: NoeliaBriefingStructure;
}): Promise<NoeliaExecutiveBriefing> {
  return withTenantDatabaseContext(params.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(params.principal);
    const target = requestedNoeliaTarget(params.principal, params.target);
    const runtime = new NoeliaRuntime(
      createDefaultNoeliaToolRegistry(),
      new BeyuNoeliaPolicyService(),
      new BeyuNoeliaEvidenceService(),
      createNoeliaModelPorts(),
    );
    return runtime.brief({
      principal: params.principal,
      question: params.question,
      traceId: params.traceId,
      correlationId: params.correlationId ?? params.traceId,
      target,
      scope,
      horizon: params.horizon,
      focus: params.focus,
      structure: params.structure,
    });
  });
}

/** Governed enterprise analytics (sections 7–8). */
export async function analyzeNoelia(params: {
  principal: Principal;
  analysisType: NoeliaAnalysisType;
  traceId: string;
  correlationId?: string | null;
  target?: Partial<NoeliaTargetContext> | null;
  options?: Record<string, unknown>;
}): Promise<NoeliaAnswer> {
  return withTenantDatabaseContext(params.principal, async () => {
    const scope = await resolveNoeliaAuthorizedScope(params.principal);
    const target = requestedNoeliaTarget(params.principal, params.target);
    const runtime = new NoeliaRuntime(
      createDefaultNoeliaToolRegistry(),
      new BeyuNoeliaPolicyService(),
      new BeyuNoeliaEvidenceService(),
      createNoeliaModelPorts(),
    );
    return runtime.analyze({
      principal: params.principal,
      analysisType: params.analysisType,
      traceId: params.traceId,
      correlationId: params.correlationId ?? params.traceId,
      target,
      scope,
      options: params.options,
    });
  });
}

/**
 * Scheduled briefing execution for the governed scheduler (section 17).
 *
 * The owner's principal is reconstructed from canonical identity tables by the
 * scheduler service; every tool invocation re-checks authorization, so a
 * revoked grant fails closed at run time. Nothing about a schedule grants
 * authority by existence.
 */
export async function runScheduledBriefing(params: {
  owner: Principal;
  schedule: {
    id: string;
    code: string;
    tenantId: string;
    legalEntityId: string | null;
    countryCode: string | null;
    horizon: string;
    briefingFocus: string;
  };
  traceId: string;
}): Promise<{ decisionId: string } | null> {
  return withTenantDatabaseContext(params.owner, async () => {
    const scope = await resolveNoeliaAuthorizedScope(params.owner);
    const target: NoeliaTargetContext = {
      tenantId: params.schedule.tenantId,
      legalEntityId: params.schedule.legalEntityId,
      countryCode: params.schedule.countryCode,
    };
    const runtime = new NoeliaRuntime(
      createDefaultNoeliaToolRegistry(),
      new BeyuNoeliaPolicyService(),
      new BeyuNoeliaEvidenceService(),
      createNoeliaModelPorts(),
    );
    const briefing = await runtime.brief({
      principal: params.owner,
      question: `Scheduled executive briefing ${params.schedule.code}: ${params.schedule.briefingFocus}`,
      traceId: params.traceId,
      correlationId: params.schedule.id,
      target,
      scope,
      horizon: params.schedule.horizon,
      focus: params.schedule.briefingFocus,
    });
    return { decisionId: briefing.decisionId };
  });
}
