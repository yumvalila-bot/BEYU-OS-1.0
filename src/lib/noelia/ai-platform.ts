import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import {
  modelRegistry,
  noeliaAiIdentity,
  noeliaEvaluations,
  noeliaIncidents,
  noeliaKillSwitch,
  noeliaProviders,
  noeliaRiskRegister,
  noeliaRoutingDecisions,
} from "@/db/schema";
import { classificationRank, isKnownClassification, type Classification } from "@/lib/constants";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

function requireCanonicalContext(): void {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia AI platform service requires canonical transaction-scoped tenant context");
  }
}

export type NoeliaRouteRequest = {
  /** Stable caller-supplied request id enables replay protection (additive). */
  requestId?: string;
  tenantId: string;
  legalEntityId: string | null;
  countryCode: string | null;
  osId?: string | null;
  task: string;
  capability: string;
  classification: Classification;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

export type NoeliaRouteVerdict = {
  decision: "SELECTED" | "DENIED" | "FAIL_CLOSED";
  selectedModelId: string | null;
  selectedProviderId: string | null;
  reasons: string[];
  requestId: string;
  routingId: string;
};

/**
 * Provider-independent Noelia AI platform layer (schema 0023).
 *
 * Rules:
 *  - Noelia remains a BEYU-owned enterprise AI identity, not a second human
 *    identity and never an independent authority.
 *  - Providers are registry rows, not authority. External providers stay
 *    optional and default-inactive until an accountable human activates them.
 *  - Models are implementations; a routed model is not an approver.
 *  - Kill switches stop capability; they never delete or rewrite evidence.
 *  - Routing decisions store only non-sensitive metadata — never prompts,
 *    outputs or model results.
 */
export class BeyuNoeliaAiPlatformService {
  async identity(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaAiIdentity.id,
        canonicalName: noeliaAiIdentity.canonicalName,
        identityType: noeliaAiIdentity.identityType,
        status: noeliaAiIdentity.status,
        version: noeliaAiIdentity.version,
        ownerOrganization: noeliaAiIdentity.ownerOrganization,
        riskLevel: noeliaAiIdentity.riskLevel,
        governingRole: noeliaAiIdentity.governingRole,
      })
      .from(noeliaAiIdentity)
      .orderBy(desc(noeliaAiIdentity.updatedAt));

    return {
      headline: `${rows.length} canonical AI identity record(s).`,
      findings: rows.map((row) => ({
        label: row.canonicalName,
        value: `${row.identityType} · ${row.status} · v${row.version} · owner ${row.ownerOrganization}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_IDENTITY",
        ref: row.id,
        label: row.canonicalName,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { identities: rows },
      narrative:
        "Noelia is a governed enterprise AI identity. It has no independent business or legal authority, and no role grants of its own.",
      confidence: 0.95,
    };
  }

  async providers(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaProviders.id,
        providerName: noeliaProviders.providerName,
        providerType: noeliaProviders.providerType,
        ownership: noeliaProviders.ownership,
        region: noeliaProviders.region,
        dataResidency: noeliaProviders.dataResidency,
        securityStatus: noeliaProviders.securityStatus,
        complianceStatus: noeliaProviders.complianceStatus,
        active: noeliaProviders.active,
      })
      .from(noeliaProviders)
      .orderBy(noeliaProviders.providerName);

    return {
      headline: `${rows.length} provider registry record(s).`,
      findings: rows.map((row) => ({
        label: row.providerName,
        value: `${row.providerType} · ${row.active ? "ACTIVE" : "INACTIVE"} · ${row.dataResidency} · security ${row.securityStatus}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_PROVIDER",
        ref: row.id,
        label: row.providerName,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { providers: rows },
      narrative:
        "External providers remain optional. A registered provider is never activated by default; a row in this registry does not by itself authorise use.",
      confidence: 0.95,
      humanReviewRequired: false,
    };
  }

  async evaluations(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaEvaluations.id,
        modelId: noeliaEvaluations.modelId,
        modelVersion: noeliaEvaluations.modelVersion,
        metric: noeliaEvaluations.metric,
        score: noeliaEvaluations.score,
        threshold: noeliaEvaluations.threshold,
        evaluatedAt: noeliaEvaluations.evaluatedAt,
        status: noeliaEvaluations.status,
        evidenceRef: noeliaEvaluations.evidenceRef,
      })
      .from(noeliaEvaluations)
      .orderBy(desc(noeliaEvaluations.evaluatedAt))
      .limit(50);

    return {
      headline: `${rows.length} model evaluation record(s).`,
      findings: rows.map((row) => ({
        label: `${row.modelId}@${row.modelVersion} · ${row.metric}`,
        value: `${row.score}${row.threshold ? ` (threshold ${row.threshold})` : ""} · ${row.status}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_EVALUATION",
        ref: row.id,
        label: `${row.modelId}@${row.modelVersion}`,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { evaluations: rows },
      narrative:
        "Evaluation records are evidence, not certificates. A model is production eligible only when its router-relevant evaluations are APPROVED for the requested context.",
      confidence: 0.9,
    };
  }

  async riskRegister(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaRiskRegister.id,
        riskCode: noeliaRiskRegister.riskCode,
        title: noeliaRiskRegister.title,
        category: noeliaRiskRegister.category,
        residualLikelihood: noeliaRiskRegister.residualLikelihood,
        residualImpact: noeliaRiskRegister.residualImpact,
        status: noeliaRiskRegister.status,
        ownerRole: noeliaRiskRegister.ownerRole,
        mitigation: noeliaRiskRegister.mitigation,
      })
      .from(noeliaRiskRegister)
      .orderBy(noeliaRiskRegister.riskCode);

    return {
      headline: `${rows.length} AI risk register record(s).`,
      findings: rows.map((row) => ({
        label: `${row.riskCode} · ${row.title}`,
        value: `${row.category} · residual ${row.residualLikelihood}/${row.residualImpact} · ${row.status}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_RISK",
        ref: row.id,
        label: `${row.riskCode} · ${row.title}`,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { risks: rows },
      narrative:
        "The AI risk register is a governance record, not a security bypass. Risk acceptance, closure and treatment changes remain accountable-human decisions.",
      confidence: 0.9,
    };
  }

  async incidents(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaIncidents.id,
        incidentCode: noeliaIncidents.incidentCode,
        classification: noeliaIncidents.classification,
        severity: noeliaIncidents.severity,
        status: noeliaIncidents.status,
        tenantId: noeliaIncidents.tenantId,
        modelId: noeliaIncidents.modelId,
        providerId: noeliaIncidents.providerId,
        toolName: noeliaIncidents.toolName,
        traceId: noeliaIncidents.traceId,
        detectedAt: noeliaIncidents.detectedAt,
        containedAt: noeliaIncidents.containedAt,
        resolvedAt: noeliaIncidents.resolvedAt,
        closedAt: noeliaIncidents.closedAt,
      })
      .from(noeliaIncidents)
      .orderBy(desc(noeliaIncidents.detectedAt))
      .limit(50);

    return {
      headline: `${rows.length} AI incident record(s) in scope.`,
      findings: rows.map((row) => ({
        label: `${row.incidentCode} · ${row.classification}`,
        value: `${row.severity} · ${row.status} · trace ${row.traceId}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_INCIDENT",
        ref: row.id,
        label: `${row.incidentCode} · ${row.classification}`,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { incidents: rows },
      narrative:
        "Incident handling records state and suspension. Containment never deletes audit evidence; resolution is an accountable human action.",
      confidence: 0.9,
    };
  }

  async killSwitches(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select()
      .from(noeliaKillSwitch)
      .orderBy(desc(noeliaKillSwitch.activatedAt))
      .limit(50);

    return {
      headline: `${rows.length} kill switch record(s).`,
      findings: rows.map((row) => ({
        label: `${row.targetType}:${row.targetRef}`,
        value: `${row.enabled ? "ENABLED" : "DISABLED"} · ${row.reason}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_KILL_SWITCH",
        ref: row.id,
        label: `${row.targetType}:${row.targetRef}`,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { killSwitches: rows },
      narrative:
        "A kill switch stops capability without mutating or deleting evidence. The Noelia runtime checks enabled kill switches before any model selection.",
      confidence: 0.95,
    };
  }

  async routingDecisions(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const rows = await db
      .select({
        id: noeliaRoutingDecisions.id,
        requestId: noeliaRoutingDecisions.requestId,
        tenantId: noeliaRoutingDecisions.tenantId,
        task: noeliaRoutingDecisions.task,
        capability: noeliaRoutingDecisions.capability,
        classification: noeliaRoutingDecisions.classification,
        riskLevel: noeliaRoutingDecisions.riskLevel,
        selectedModelId: noeliaRoutingDecisions.selectedModelId,
        selectedProviderId: noeliaRoutingDecisions.selectedProviderId,
        decision: noeliaRoutingDecisions.decision,
        denialReasons: noeliaRoutingDecisions.denialReasons,
        createdAt: noeliaRoutingDecisions.createdAt,
      })
      .from(noeliaRoutingDecisions)
      .where(inArray(noeliaRoutingDecisions.tenantId, context.scope.tenantIds))
      .orderBy(desc(noeliaRoutingDecisions.createdAt))
      .limit(50);

    return {
      headline: `${rows.length} routing decision(s) in scope.`,
      findings: rows.map((row) => ({
        label: row.capability,
        value: `${row.decision} · model ${row.selectedModelId ?? "none"} · ${row.riskLevel}`,
        kind: "FACT" as const,
      })),
      sources: rows.map((row) => ({
        kind: "AI_ROUTING_DECISION",
        ref: row.id,
        label: row.requestId,
        authority: "NOELIA_AI_PLATFORM",
      })),
      metadata: { decisions: rows },
      narrative:
        "Routing decisions contain non-sensitive selection metadata only. No prompt or model output is stored in this ledger.",
      confidence: 0.9,
    };
  }

  /**
   * Deterministic, provider-independent model selection.
   *
   * Selection is fail-closed: a missing/anonymous model, a disabled kill
   * switch target, a non-approved model or an unavailable provider all DENY
   * with the same reason as an empty registry. BEYU-owned/self-hosted models
   * are preferred over external ones; external models are only considered when
   * activated AND approved for the requested classification/residency.
   */
  async route(context: ToolInvocationContext, request: NoeliaRouteRequest): Promise<NoeliaRouteVerdict> {
    requireCanonicalContext();

    const requestId = request.requestId ?? `REQ_${Date.now()}_${context.traceId}`;
    const reasons: string[] = [];
    const routingId = `ART_${Date.now()}_${context.traceId}`;

    // Replay protection: a previously recorded routing decision for the same
    // requestId is authoritative and is not inserted a second time.
    const existing = await db
      .select()
      .from(noeliaRoutingDecisions)
      .where(eq(noeliaRoutingDecisions.requestId, requestId))
      .limit(1);
    if (existing.length > 0) {
      const prior = existing[0];
      return {
        decision: prior.decision === "SELECTED" ? "SELECTED" : prior.decision === "FAIL_CLOSED" ? "FAIL_CLOSED" : "DENIED",
        selectedModelId: prior.selectedModelId,
        selectedProviderId: prior.selectedProviderId,
        reasons: prior.denialReasons.length ? prior.denialReasons : ["Replay: routing decision already recorded."],
        requestId: prior.requestId,
        routingId: prior.id,
      };
    }

    // 1. Kill switch: an enabled switch at ANY matching scope denies first.
    const killSwitches = await db.select().from(noeliaKillSwitch).where(eq(noeliaKillSwitch.enabled, true));
    for (const switched of killSwitches) {
      const matches =
        switched.targetType === "ALL" ||
        switched.targetType === "AI_IDENTITY" && switched.targetRef === "NOELIA" ||
        switched.targetType === "TENANT" && switched.targetRef === request.tenantId ||
        switched.targetType === "CAPABILITY" && switched.targetRef === request.capability;
      if (matches) {
        const denialReasons = [`Active kill switch ${switched.targetType}:${switched.targetRef} blocks ${request.capability}.`];
        await db.insert(noeliaRoutingDecisions).values({
          id: routingId,
          requestId,
          tenantId: request.tenantId,
          legalEntityId: request.legalEntityId,
          countryCode: request.countryCode,
          osId: request.osId ?? null,
          task: request.task,
          capability: request.capability,
          classification: request.classification,
          riskLevel: request.riskLevel,
          selectedModelId: null,
          selectedProviderId: null,
          decision: "FAIL_CLOSED",
          denialReasons,
          policyVersion: "2026.09",
          createdBy: "NOELIA",
        });
        return {
          decision: "FAIL_CLOSED",
          selectedModelId: null,
          selectedProviderId: null,
          reasons: denialReasons,
          requestId,
          routingId,
        };
      }
    }

    // 2. Candidate models must be ACTIVE, APPROVED, evaluated and within the
    //    requested classification ceiling and data residency.
    const models = await db.select().from(modelRegistry).where(and(
      eq(modelRegistry.status, "ACTIVE"),
      eq(modelRegistry.approvalStatus, "APPROVED"),
      eq(modelRegistry.evaluationStatus, "APPROVED"),
    ));

    const candidates = [];
    for (const model of models) {
      if (model.maxClassification && isKnownClassification(model.maxClassification)) {
        if (classificationRank(request.classification) > classificationRank(model.maxClassification)) {
          reasons.push(`Model ${model.id} max classification ${model.maxClassification} cannot carry ${request.classification}.`);
          continue;
        }
      }
      if (model.dataResidency !== "BEYU_CONTROLLED" && request.countryCode && model.hostingLocation && model.hostingLocation !== request.countryCode) {
        reasons.push(`Model ${model.id} hosting ${model.hostingLocation} does not satisfy ${request.countryCode} residency.`);
        continue;
      }
      // Restricted/internal data is never routed to a non-BEYU-controlled or
      // external runtime while the provider is not formally trusted. This is a
      // fail-closed data-residency guard, not a policy that external providers
      // cannot eventually be qualified.
      if (
        isKnownClassification(request.classification) &&
        classificationRank(request.classification) > classificationRank("INTERNAL") &&
        (model.deploymentType === "EXTERNAL" || model.dataResidency !== "BEYU_CONTROLLED")
      ) {
        reasons.push(`Model ${model.id} is external/non-BEYU-controlled and cannot carry ${request.classification}.`);
        continue;
      }
      const providerRows = model.providerId
        ? await db.select().from(noeliaProviders).where(eq(noeliaProviders.id, model.providerId)).limit(1)
        : [];
      const provider = providerRows[0];
      if (model.providerId && (!provider || !provider.active)) {
        reasons.push(`Provider ${model.providerId ?? "unknown"} is not active for model ${model.id}.`);
        continue;
      }
      if (model.deploymentType === "EXTERNAL" && (!provider || provider.ownership === "BEYU" || !provider.active)) {
        reasons.push(`External model ${model.id} is not an activated BEYU-owned provider.`);
        continue;
      }
      candidates.push({ model, provider: provider ?? null });
    }

    // 3. Prefer internal/self-hosted deterministic models (never fabricate a
    //    different model when the only governed model is the HIVE analyst).
    candidates.sort((a, b) => {
      const aOwned = a.model.deploymentType === "SELF_HOSTED" || a.model.deploymentType === "BEYU_OWNED";
      const bOwned = b.model.deploymentType === "SELF_HOSTED" || b.model.deploymentType === "BEYU_OWNED";
      if (aOwned !== bOwned) return aOwned ? -1 : 1;
      if ((a.model.latencyMs ?? 0) !== (b.model.latencyMs ?? 0)) return (a.model.latencyMs ?? 0) - (b.model.latencyMs ?? 0);
      return a.model.id.localeCompare(b.model.id);
    });

    if (candidates.length === 0) {
      const denialReasons = reasons.length
        ? reasons
        : ["No approved and evaluated model satisfies the requested capability, classification or residency."];
      await db.insert(noeliaRoutingDecisions).values({
        id: routingId,
        requestId,
        tenantId: request.tenantId,
        legalEntityId: request.legalEntityId,
        countryCode: request.countryCode,
        osId: request.osId ?? null,
        task: request.task,
        capability: request.capability,
        classification: request.classification,
        riskLevel: request.riskLevel,
        selectedModelId: null,
        selectedProviderId: null,
        decision: "FAIL_CLOSED",
        denialReasons,
        policyVersion: "2026.09",
        createdBy: "NOELIA",
      });
      return {
        decision: "DENIED",
        selectedModelId: null,
        selectedProviderId: null,
        reasons: denialReasons,
        requestId,
        routingId,
      };
    }

    const chosen = candidates[0];
    await db.insert(noeliaRoutingDecisions).values({
      id: routingId,
      requestId,
      tenantId: request.tenantId,
      legalEntityId: request.legalEntityId,
      countryCode: request.countryCode,
      osId: request.osId ?? null,
      task: request.task,
      capability: request.capability,
      classification: request.classification,
      riskLevel: request.riskLevel,
      selectedModelId: chosen.model.id,
      selectedProviderId: chosen.provider?.id ?? null,
      decision: "SELECTED",
      denialReasons: [],
      policyVersion: "2026.09",
      createdBy: "NOELIA",
    });

    return {
      decision: "SELECTED",
      selectedModelId: chosen.model.id,
      selectedProviderId: chosen.provider?.id ?? null,
      reasons: [`Selected governed model ${chosen.model.id}.`],
      requestId,
      routingId,
    };
  }

  /** Report a model routing SELECT as a Noelia tool output for the runtime. */
  async routeOutput(context: ToolInvocationContext, request: NoeliaRouteRequest): Promise<NoeliaToolOutput> {
    const verdict = await this.route(context, request);

    // `route()` persists every decision (SELECTED and FAIL_CLOSED). Denials and
    // fail-closed verdicts are evidence too; routeOutput only renders them.
    const humanReviewRequired = verdict.decision !== "SELECTED";
    return {
      headline:
        verdict.decision === "SELECTED"
          ? `Model route selected: ${verdict.selectedModelId}.`
          : `Model route ${verdict.decision}: no model selected.`,
      findings: [{
        label: "Routing decision",
        value: verdict.decision === "SELECTED" ? `selected ${verdict.selectedModelId}` : `blocked (${verdict.decision})`,
        kind: verdict.decision === "SELECTED" ? "FACT" : "RECOMMENDATION",
        status: humanReviewRequired ? "REQUIRES_HUMAN_REVIEW" : "OBSERVED",
      }],
      sources: verdict.routingId ? [{
        kind: "AI_ROUTING_DECISION",
        ref: verdict.routingId,
        label: `${request.capability} route`,
        authority: "NOELIA_AI_PLATFORM",
      }] : [],
      metadata: { verdict },
      narrative:
        verdict.decision === "SELECTED"
          ? "The model route is governed metadata only; it grants no execution authority."
          : `Routing failed closed: ${verdict.reasons.join(" ")}`,
      confidence: verdict.decision === "SELECTED" ? 0.9 : 1,
      humanReviewRequired,
    };
  }

  async writeRoutingDenial(context: ToolInvocationContext, request: NoeliaRouteRequest, reasons: string[]): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    const requestId = `REQ_${Date.now()}_${context.traceId}`;
    const routingId = `ART_${Date.now()}_${context.traceId}`;
    await db.insert(noeliaRoutingDecisions).values({
      id: routingId,
      requestId,
      tenantId: request.tenantId,
      legalEntityId: request.legalEntityId,
      countryCode: request.countryCode,
      osId: request.osId ?? null,
      task: request.task,
      capability: request.capability,
      classification: request.classification,
      riskLevel: request.riskLevel,
      selectedModelId: null,
      selectedProviderId: null,
      decision: "FAIL_CLOSED",
      denialReasons: reasons,
      policyVersion: "2026.09",
      createdBy: "NOELIA",
    });
    return {
      headline: "Model route FAIL_CLOSED.",
      findings: [{
        label: "Routing decision",
        value: "FAIL_CLOSED",
        kind: "RECOMMENDATION",
        status: "REQUIRES_HUMAN_REVIEW",
      }],
      sources: [{
        kind: "AI_ROUTING_DECISION",
        ref: routingId,
        label: `${request.capability} route`,
        authority: "NOELIA_AI_PLATFORM",
      }],
      metadata: { requestId, routingId, reasons },
      narrative: `Routing failed closed: ${reasons.join(" ")}`,
      confidence: 1,
      humanReviewRequired: true,
    };
  }

  /**
   * Governance write: register an AI provider row.
   *
   * A registered provider is INACTIVE by default and carries no authority.
   * Activation is a separate explicit action by an accountable governance role.
   */
  async registerProvider(context: ToolInvocationContext, input: {
    id: string;
    providerName: string;
    providerType: "BEYU_OWNED" | "SELF_HOSTED" | "OPEN_WEIGHT" | "EXTERNAL";
    ownership?: string;
    endpoint?: string | null;
    region?: string | null;
    dataResidency?: string;
    authenticationMethod?: string;
    description?: string | null;
  }): Promise<NoeliaToolOutput> {
    requireCanonicalContext();
    await db.insert(noeliaProviders).values({
      id: input.id,
      providerName: input.providerName,
      providerType: input.providerType,
      ownership: input.ownership ?? "BEYU",
      endpoint: input.endpoint ?? null,
      region: input.region ?? null,
      dataResidency: input.dataResidency ?? "BEYU_CONTROLLED",
      authenticationMethod: input.authenticationMethod ?? "NONE",
      securityStatus: "NOT_ASSESSED",
      complianceStatus: "NOT_ASSESSED",
      active: false,
      description: input.description ?? null,
      assessment: {},
      createdBy: context.principal.userId,
    }).onConflictDoNothing({ target: noeliaProviders.id });

    return {
      headline: `Provider ${input.providerName} registered INACTIVE.`,
      findings: [{
        label: input.providerName,
        value: `${input.providerType} · INACTIVE · ${input.dataResidency ?? "BEYU_CONTROLLED"}`,
        kind: "FACT",
        status: "OBSERVED",
      }],
      sources: [{ kind: "AI_PROVIDER", ref: input.id, label: input.providerName, authority: "NOELIA_AI_PLATFORM" }],
      narrative:
        "Registration records governance metadata only and does not activate a provider. Activation remains an explicit accountable-human action with a security and compliance assessment.",
      confidence: 0.95,
    };
  }
}
