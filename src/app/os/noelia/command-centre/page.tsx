import Link from "next/link";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  aiDecisions,
  knowledgeSources,
  legalEntities,
  noeliaCouncilSessions,
  noeliaDecisionRecords,
  modelRegistry,
  noeliaEvaluations,
  noeliaRiskRegister,
  noeliaSimulations,
  workflowInstances,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { resolveNoeliaAuthorizedScope } from "@/lib/noelia/scope-service";
import { createDefaultNoeliaToolRegistry } from "@/lib/noelia/default-tools";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import {
  NOELIA_BRAINS,
  NOELIA_CANONICAL_IDENTITY,
  effectiveBrainReach,
} from "@/lib/noelia/cognitive/brain-contracts";
import {
  AGENT_SKILLS,
  SKILL_LIFECYCLE_STAGES,
  skillRegistrySummary,
} from "@/lib/noelia/cognitive/agent-skills";
import {
  HIVE_WORKFORCE_PROFILES,
  assertWorkforceIntegrity,
  resolveWorkforceReach,
  type WorkforceCapabilityIndex,
} from "@/lib/noelia/cognitive/workforce";
import { recordedEntityGraph } from "@/lib/noelia/cognitive/knowledge-graph";
import { decisionMemorySummary } from "@/lib/noelia/cognitive/decision-memory";
import { CommandCentreConsole } from "./command-console";

export const dynamic = "force-dynamic";

/**
 * NOELIA — HIVE COMMAND CENTRE.
 *
 * Every number on this page is read from an authorized backend query at request
 * time. Where a capability has produced no data, the page says so with an empty
 * state — it never renders a decorative metric, a placeholder agent or a
 * simulated status. Where the caller is not authorized for a module, the module
 * states the denial rather than hiding the fact.
 *
 * Modules rendered here map to the master prompt's Command Centre brief:
 *   Queen Bee Command · Cognitive Brain Centre · Institutional Brain ·
 *   Intelligence Council · Digital Twin · Model Centre · Governance Centre ·
 *   Workflow Command · Performance Centre · Predictive Intelligence.
 */
export default async function NoeliaCommandCentrePage() {
  const access = await requireAccess("ai:noelia.query");
  if (!access.allowed) return <Denied reason={access.reason} capability="ai:noelia.query" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const scope = await resolveNoeliaAuthorizedScope(principal);
    const registry = createDefaultNoeliaToolRegistry();

    // The caller's ACTUAL authorized capability set from the one registry, using
    // the caller's own resolved scope. Passed into the brain cards so the
    // "authorized reach" shown is real, not declared.
    const toolContext = {
      principal,
      traceId: "COMMAND_CENTRE_READ",
      target: { tenantId: principal.tenantId, legalEntityId: null, countryCode: null },
      scope,
    };
    const authorizedCapabilities = registry.authorizedToolNames(toolContext);

    const brainCards = NOELIA_BRAINS.map((brain) => {
      const reach = effectiveBrainReach(brain.id, authorizedCapabilities);
      return {
        id: brain.id,
        ordinal: brain.ordinal,
        title: brain.title,
        mandate: brain.mandate,
        mode: brain.mode,
        declared: brain.capabilityReach.length,
        authorized: reach.length,
        reach,
        criteria: brain.evaluationCriteria,
        status:
          reach.length === 0 ? ("BLOCKED" as const) : reach.length < brain.capabilityReach.length ? ("DEGRADED" as const) : ("ACTIVE" as const),
      };
    });

    const [decisions, council, simulations, decisionSummary, entityGraph, recentDecisions] = await Promise.all([
      db
        .select({ id: aiDecisions.id })
        .from(aiDecisions)
        .where(and(eq(aiDecisions.tenantId, principal.tenantId), eq(aiDecisions.userId, principal.userId)))
        .limit(500),
      db
        .select({
          id: noeliaCouncilSessions.id,
          question: noeliaCouncilSessions.question,
          status: noeliaCouncilSessions.status,
          participants: noeliaCouncilSessions.participants,
          confidence: noeliaCouncilSessions.confidence,
          startedAt: noeliaCouncilSessions.startedAt,
          humanDecisionRequired: noeliaCouncilSessions.humanDecisionRequired,
        })
        .from(noeliaCouncilSessions)
        .where(inArray(noeliaCouncilSessions.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]))
        .orderBy(desc(noeliaCouncilSessions.startedAt))
        .limit(5),
      db
        .select({
          id: noeliaSimulations.id,
          objective: noeliaSimulations.objective,
          label: noeliaSimulations.scenarioLabel,
          kind: noeliaSimulations.scenarioKind,
          createdAt: noeliaSimulations.createdAt,
          confidence: noeliaSimulations.confidence,
        })
        .from(noeliaSimulations)
        .where(inArray(noeliaSimulations.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]))
        .orderBy(desc(noeliaSimulations.createdAt))
        .limit(5),
      decisionMemorySummary({ principal, scope }),
      recordedEntityGraph({ principal, scope, limit: 60 }),
      db
        .select({
          id: noeliaDecisionRecords.id,
          code: noeliaDecisionRecords.decisionCode,
          title: noeliaDecisionRecords.title,
          status: noeliaDecisionRecords.status,
          decidedOn: noeliaDecisionRecords.decidedOn,
          decidedByRole: noeliaDecisionRecords.decidedByRole,
        })
        .from(noeliaDecisionRecords)
        .where(
          and(
            inArray(noeliaDecisionRecords.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]),
            eq(noeliaDecisionRecords.status, "EFFECTIVE"),
          ),
        )
        .orderBy(desc(noeliaDecisionRecords.decidedOn))
        .limit(6),
    ]);

    // ---- Model Centre, Research Centre, Performance Centre, Workflow Command ----
    // Each reads a real table. Where the table is empty in this tenant the module
    // renders an explicit empty state rather than a decorative placeholder.
    const [modelRows, sourceRows, evaluationRows, workflowRows, riskRows] = await Promise.all([
      db
        .select({
          id: modelRegistry.id,
          provider: modelRegistry.provider,
          model: modelRegistry.model,
          version: modelRegistry.version,
          status: modelRegistry.status,
          deploymentType: modelRegistry.deploymentType,
          maxClassification: modelRegistry.maxClassification,
          costClass: modelRegistry.costClass,
          zeroCostStatus: modelRegistry.zeroCostStatus,
        })
        .from(modelRegistry)
        .orderBy(desc(modelRegistry.approvedAt))
        .limit(8),
      db
        .select({
          id: knowledgeSources.id,
          title: knowledgeSources.title,
          domain: knowledgeSources.domain,
          authorityStatus: knowledgeSources.authorityStatus,
          classification: knowledgeSources.classification,
          reviewDate: knowledgeSources.reviewDate,
        })
        .from(knowledgeSources)
        .where(inArray(knowledgeSources.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]))
        .orderBy(desc(knowledgeSources.reviewDate))
        .limit(6)
        .catch(() => []),
      db
        .select({
          id: noeliaEvaluations.id,
          dataset: noeliaEvaluations.dataset,
          testSuite: noeliaEvaluations.testSuite,
          metric: noeliaEvaluations.metric,
          score: noeliaEvaluations.score,
          status: noeliaEvaluations.status,
          evaluatedAt: noeliaEvaluations.evaluatedAt,
        })
        .from(noeliaEvaluations)
        .orderBy(desc(noeliaEvaluations.evaluatedAt))
        .limit(6),
      db
        .select({
          id: workflowInstances.id,
          state: workflowInstances.state,
          objectType: workflowInstances.objectType,
          currentStep: workflowInstances.currentStep,
          startedAt: workflowInstances.startedAt,
        })
        .from(workflowInstances)
        .where(inArray(workflowInstances.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]))
        .orderBy(desc(workflowInstances.startedAt))
        .limit(6),
      db
        .select({
          id: noeliaRiskRegister.id,
          riskCode: noeliaRiskRegister.riskCode,
          title: noeliaRiskRegister.title,
          status: noeliaRiskRegister.status,
          residualLikelihood: noeliaRiskRegister.residualLikelihood,
          residualImpact: noeliaRiskRegister.residualImpact,
        })
        .from(noeliaRiskRegister)
        .orderBy(desc(noeliaRiskRegister.riskCode))
        .limit(6),
    ]);

    const entityCount = await db
      .select({ id: legalEntities.id })
      .from(legalEntities)
      .where(
        and(
          inArray(legalEntities.tenantId, scope.tenantIds.length ? scope.tenantIds : ["__none__"]),
          isNull(legalEntities.effectiveTo),
        ),
      )
      .limit(200);

    // Workforce reach is resolved against the SAME live registry, so a
    // specialist can only display a capability that is (a) declared, (b)
    // registered, and (c) authorized for this caller. Nothing here is estimated.
    assertWorkforceIntegrity();
    const registryRows = registry.list() as unknown as { name: string; risk?: string }[];
    const workforceIndex: WorkforceCapabilityIndex = {
      registered: new Set(registryRows.map((row) => row.name)),
      riskOf: (capability) =>
        (registryRows.find((row) => row.name === capability)?.risk as "LOW" | "MEDIUM" | "HIGH" | undefined) ??
        null,
    };
    const workforceCards = HIVE_WORKFORCE_PROFILES.map((profile) => ({
      code: profile.code,
      title: profile.title,
      mandate: profile.mandate,
      supervisor: profile.supervision,
      mayPost: profile.mayPost,
      declared: profile.capabilities.length,
      reach: resolveWorkforceReach(profile, authorizedCapabilities, workforceIndex),
    }));

    // Skills are declarations over the SAME registry the workforce uses, so they
    // are summarised from the static catalogue and its own guards — not from a
    // second runtime. `reached` is the furthest COMPLETE stage, which is why a
    // blocked skill cannot display as finished.
    const skillRows = skillRegistrySummary();

    const activeBrains = brainCards.filter((b) => b.status === "ACTIVE").length;
    const blockedBrains = brainCards.filter((b) => b.status === "BLOCKED").length;
    const cognitiveCapabilities = authorizedCapabilities.filter((name) => name.startsWith("noelia."));

    return (
      <div className="space-y-5">
        <header className="beyu-panel px-5 py-5">
          <div className="beyu-kicker text-[#b08d1c]">HIVE COMMAND CENTRE</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">
            {NOELIA_CANONICAL_IDENTITY.displayName} · {NOELIA_CANONICAL_IDENTITY.identity.replace("_", " ")}
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed beyu-muted">
            One unified institutional intelligence identity with eight interconnected cognitive brains, governed by BEYU OS
            authorization. Every status below is read from authorized backend data at request time. NOELIA observes and
            advises; she never approves, posts, moves funds or alters an authoritative institutional record.
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-[11.5px] sm:grid-cols-4">
            <div>
              <dt className="beyu-kicker beyu-muted">System</dt>
              <dd className="mt-1 font-semibold">{NOELIA_CANONICAL_IDENTITY.systemId}</dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">Runtime</dt>
              <dd className="mt-1 font-semibold">{NOELIA_CANONICAL_IDENTITY.runtime}</dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">Tenant</dt>
              <dd className="mt-1 font-semibold">{principal.tenantCode}</dd>
            </div>
            <div>
              <dt className="beyu-kicker beyu-muted">Motto</dt>
              <dd className="mt-1 font-semibold">{NOELIA_CANONICAL_IDENTITY.motto}</dd>
            </div>
          </dl>
        </header>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Brains active" value={String(activeBrains)} sub={`${blockedBrains} blocked by authorization`} tone="gold" />
          <Metric label="Cognitive capabilities" value={String(cognitiveCapabilities.length)} sub="authorized for you" />
          <Metric label="Authorized entities" value={String(entityGraph.nodes.length)} sub={`of ${entityCount.length} in scope`} />
          <Metric
            label="Recorded decisions"
            value={String(decisionSummary.effective)}
            sub={decisionSummary.earliest ? `since ${decisionSummary.earliest}` : "none recorded"}
          />
        </div>

        {/* ------------------------------------------------ BRAIN CENTRE */}
        <Panel
          kicker="COGNITIVE BRAIN CENTRE"
          title="Eight interconnected brains — one identity"
          action={<Badge tone="slate">{activeBrains}/8 active</Badge>}
        >
          <p className="mb-4 text-[12px] leading-relaxed beyu-muted">
            A brain is a declaration bound to the single HIVE dispatch point, not a separate assistant. The
            &quot;authorized&quot; count is the intersection of each brain&apos;s declared reach with your actual
            authorized capabilities — never a wider claim.
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {brainCards.map((brain) => (
              <li key={brain.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="beyu-kicker beyu-muted">BRAIN {String(brain.ordinal).padStart(2, "0")}</div>
                    <h3 className="mt-1 truncate text-[14px] font-semibold">{brain.title}</h3>
                  </div>
                  <Badge tone={brain.status === "ACTIVE" ? "green" : brain.status === "DEGRADED" ? "amber" : "red"}>
                    {brain.status}
                  </Badge>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed beyu-muted">{brain.mandate}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <Badge tone="slate">{brain.mode}</Badge>
                  <Badge tone="slate">
                    {brain.authorized}/{brain.declared} capabilities
                  </Badge>
                </div>
                {brain.reach.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[11.5px] font-medium text-[#a8830f] dark:text-[#efd98f]">
                      Authorized capabilities ({brain.reach.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {brain.reach.map((capability) => (
                        <li key={capability} className="font-mono text-[11px] beyu-muted">
                          {capability}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        {/* --------------------------------------- QUEEN BEE COMMAND */}
        <CommandCentreConsole
          authorizedCapabilities={authorizedCapabilities}
          hasExecutive={authorizedCapabilities.includes("noelia.council.deliberate")}
          hasSimulation={authorizedCapabilities.includes("noelia.scenario.simulate")}
          hasWorldModel={authorizedCapabilities.includes("noelia.world_model.query")}
          hasGraph={authorizedCapabilities.includes("noelia.knowledge_graph.query")}
        />

        {/* -------------------------------------- INSTITUTIONAL BRAIN */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel kicker="INSTITUTIONAL BRAIN" title="Recorded decision memory">
            {recentDecisions.length === 0 ? (
              <EmptyState message="No institutional decision has been recorded in your authorized scope. Decisions appear here only after an authorized human records them through the governed path." />
            ) : (
              <ul className="space-y-2">
                {recentDecisions.map((decision) => (
                  <li key={decision.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-[11px] beyu-muted">{decision.code}</div>
                        <div className="mt-0.5 text-[13px] font-medium">{decision.title}</div>
                      </div>
                      <Badge tone={stateTone(decision.status)}>{decision.status}</Badge>
                    </div>
                    <div className="mt-1.5 text-[11.5px] beyu-muted">
                      {decision.decidedOn} · {decision.decidedByRole}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] beyu-muted">
              Superseded decisions are preserved as history; NOELIA cannot create, amend or approve a decision record.
            </p>
          </Panel>

          <Panel kicker="DIGITAL TWIN" title="Institutional structure (recorded)">
            {entityGraph.nodes.length === 0 ? (
              <EmptyState message="No legal entity is visible in your authorized scope." />
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="green">{entityGraph.nodes.length} entities</Badge>
                  <Badge tone="slate">{entityGraph.edges.length} parent/child edges</Badge>
                  <Badge tone="slate">RECORDED state</Badge>
                </div>
                <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                  {entityGraph.nodes.slice(0, 20).map((node) => (
                    <li key={node.id} className="truncate text-[12px] beyu-muted" title={node.label}>
                      {node.label}
                    </li>
                  ))}
                </ul>
                {entityGraph.nodes.length > 20 && (
                  <p className="mt-2 text-[11px] beyu-muted">Showing 20 of {entityGraph.nodes.length}.</p>
                )}
              </>
            )}
            <p className="mt-3 text-[11.5px] beyu-muted">
              Derived from the canonical corporate registry. Financial values, asset valuations and performance
              indicators are Finance OS records and are never estimated here.
            </p>
          </Panel>
        </div>

        {/* ----------------------------- COUNCIL + SIMULATION HISTORY */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel kicker="INTELLIGENCE COUNCIL" title="Recent deliberations">
            {council.length === 0 ? (
              <EmptyState message="No Intelligence Council session has been convened in your authorized scope. Convene one from Queen Bee Command above." />
            ) : (
              <ul className="space-y-2">
                {council.map((session) => (
                  <li key={session.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-[13px] font-medium">{session.question}</div>
                      <Badge tone={stateTone(session.status)}>{session.status}</Badge>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] beyu-muted">
                      <span>{session.participants.length} specialists</span>
                      {session.confidence !== null && <span>· confidence {Number(session.confidence).toFixed(2)}</span>}
                      {session.humanDecisionRequired && <span>· human decision required</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel kicker="STRATEGIC SIMULATION" title="Recent scenario runs">
            {simulations.length === 0 ? (
              <EmptyState message="No simulation has been run in your authorized scope. Simulations are never institutional records and are never posted to a ledger." />
            ) : (
              <ul className="space-y-2">
                {simulations.map((sim) => (
                  <li key={sim.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-[13px] font-medium">{sim.objective}</div>
                      <Badge tone="amber">{sim.label}</Badge>
                    </div>
                    <div className="mt-1.5 text-[11.5px] beyu-muted">
                      {sim.kind} · SIMULATION only
                      {sim.confidence !== null ? ` · confidence ${Number(sim.confidence).toFixed(2)}` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ------------------------------------------- HIVE WORKFORCE (L5) */}
        <Panel
          kicker="HIVE WORKFORCE"
          title="Twelve specialist capabilities — one dispatcher"
          action={<Badge tone="slate">{workforceCards.filter((w) => w.reach.length > 0).length}/12 reachable</Badge>}
        >
          <p className="mb-4 text-[12px] leading-relaxed beyu-muted">
            A specialist is a declaration over the one capability registry, not a separate agent. The count shown is the
            three-way intersection of declared reach, registered capability and your authorization. No specialist can
            post, approve, move funds or alter an authoritative record.
          </p>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workforceCards.map((specialist) => (
              <li key={specialist.code} className="rounded-lg border border-black/10 p-3.5 dark:border-white/10">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="min-w-0 truncate text-[13px] font-semibold" title={specialist.title}>
                    {specialist.title}
                  </h3>
                  {/* "emerald"/"rose" are not palette keys in components/brand.tsx
                      and silently fall back to slate, which made 0/4 look
                      identical to 4/4. Use the real keys. */}
                  <Badge tone={specialist.reach.length === 0 ? "red" : specialist.reach.length < specialist.declared ? "amber" : "green"}>
                    {specialist.reach.length}/{specialist.declared}
                  </Badge>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed beyu-muted">{specialist.mandate}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge tone="slate">{specialist.supervisor}</Badge>
                  <Badge tone={specialist.mayPost ? "red" : "slate"}>{specialist.mayPost ? "MAY POST" : "NO POSTING"}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ------------------------------------------- AGENT SKILLS (L5) */}
        <Panel
          kicker="AGENT SKILLS"
          title="SPECIFY → PLAN → BUILD → TEST → REVIEW → SIMPLIFY → SHIP"
          action={
            <Badge tone="slate">
              {skillRows.filter((r) => r.atHumanGate).length}/{skillRows.length} at human gate
            </Badge>
          }
        >
          <p className="mb-4 text-[12px] leading-relaxed beyu-muted">
            A skill is a declaration over the same governed capabilities a specialist uses. It adds one thing the
            workforce does not model: an ordered seven-stage lifecycle with a recorded state per stage. The lifecycle
            ends at SHIP, which means &ldquo;ready for a human to merge&rdquo; — never &ldquo;merged&rdquo;. An assistant
            does not merge, deploy or release.
          </p>
          <ul className="space-y-3">
            {skillRows.map((skill) => {
              const definition = AGENT_SKILLS.find((s) => s.code === skill.code);
              const states = new Map((definition?.lifecycle ?? []).map((r) => [r.stage, r]));
              return (
                <li key={skill.code} className="rounded-lg border border-black/10 p-3.5 dark:border-white/10">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold">{skill.title}</h3>
                    <Badge tone={skill.atHumanGate ? "green" : skill.blockedStages.length > 0 ? "amber" : "slate"}>
                      {skill.atHumanGate ? "AT HUMAN GATE" : skill.reached ?? "NOT STARTED"}
                    </Badge>
                  </div>
                  {/* The stage chain is rendered as a sequence so a gap is
                      visible rather than implied by an aggregate count. */}
                  <ol className="mt-2.5 flex flex-wrap items-center gap-1">
                    {SKILL_LIFECYCLE_STAGES.map((stage, index) => {
                      const record = states.get(stage);
                      const state = record?.state ?? "NOT_STARTED";
                      const tone =
                        state === "COMPLETE" ? "green" : state === "BLOCKED" ? "red" : state === "IN_PROGRESS" ? "amber" : "slate";
                      return (
                        <li key={stage} className="flex items-center gap-1">
                          <span title={record?.blockedReason ?? record?.evidence ?? stage}>
                            <Badge tone={tone}>{stage}</Badge>
                          </span>
                          {index < SKILL_LIFECYCLE_STAGES.length - 1 ? (
                            <span aria-hidden className="text-[10px] beyu-muted">
                              ›
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                  {skill.blockedStages.length > 0 ? (
                    <p className="mt-2 text-[11px] leading-relaxed beyu-muted">
                      <span className="font-semibold">Blocked at {skill.blockedStages.join(", ")}:</span>{" "}
                      {definition?.lifecycle.find((r) => r.state === "BLOCKED")?.blockedReason ?? "No reason recorded."}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* ------------------------------------------ MODEL + RESEARCH + PERF + FLOW */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel kicker="MODEL CENTRE" title="Registered models">
            {modelRows.length === 0 ? (
              <EmptyState message="No model is registered. NOELIA falls back to the deterministic analyst and reports DEGRADED rather than calling a paid provider." />
            ) : (
              <ul className="space-y-2">
                {modelRows.map((model) => (
                  <li key={model.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium" title={`${model.provider}/${model.model}`}>
                          {model.provider} · {model.model}
                        </div>
                        <div className="mt-0.5 text-[11px] beyu-muted">
                          v{model.version} · {model.deploymentType} · max {model.maxClassification}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {/* Cost class and its verdict are shown per model because
                              "is this free?" is the question that decides whether
                              execution is even permitted. The gateway refuses any
                              model whose verdict is not ALLOWED. */}
                          <Badge tone={model.costClass === "LOCAL_FREE" ? "green" : model.costClass === "PAID" || model.costClass === "TRIAL" ? "red" : "amber"}>
                            {model.costClass}
                          </Badge>
                          <span className="text-[10.5px] beyu-muted">
                            zero-cost: {model.zeroCostStatus}
                          </span>
                        </div>
                      </div>
                      <Badge tone={stateTone(model.status)}>{model.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] leading-relaxed beyu-muted">
              Registry state is not runtime state. A model is only used once its router evaluations are APPROVED; a
              registered model is never claimed to be reachable. Cost class is a separate gate: execution is refused
              unless the zero-cost verdict is ALLOWED, so a model can be approved and still never run because its cost
              is unverified. Remote inference is disabled by default; account-level billing is not inspectable from
              here and is therefore not claimed to be zero.
            </p>
          </Panel>

          <Panel kicker="RESEARCH CENTRE" title="Governed knowledge sources">
            {sourceRows.length === 0 ? (
              <EmptyState message="No knowledge source is registered in your authorized scope. Citation is never synthesized." />
            ) : (
              <ul className="space-y-2">
                {sourceRows.map((source) => (
                  <li key={source.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium" title={source.title}>
                          {source.title}
                        </div>
                        <div className="mt-0.5 text-[11px] beyu-muted">
                          {source.domain} · {source.classification} · review {source.reviewDate}
                        </div>
                      </div>
                      <Badge tone={stateTone(source.authorityStatus)}>{source.authorityStatus}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel kicker="PERFORMANCE CENTRE" title="Model evaluation evidence">
            {evaluationRows.length === 0 ? (
              <EmptyState message="No evaluation has been recorded. A model without recorded evaluation evidence is not production-eligible — the absence is reported, never filled with an invented score." />
            ) : (
              <ul className="space-y-2">
                {evaluationRows.map((evaluation) => (
                  <li key={evaluation.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">
                          {evaluation.metric}: {evaluation.score}
                        </div>
                        <div className="mt-0.5 text-[11px] beyu-muted">
                          {evaluation.testSuite} · {evaluation.dataset} · {evaluation.evaluatedAt}
                        </div>
                      </div>
                      <Badge tone={stateTone(evaluation.status)}>{evaluation.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel kicker="WORKFLOW COMMAND" title="Active workflow instances">
            {workflowRows.length === 0 ? (
              <EmptyState message="No workflow instance is running in your authorized scope. NOELIA observes workflow state; she cannot start, advance or approve a workflow." />
            ) : (
              <ul className="space-y-2">
                {workflowRows.map((instance) => (
                  <li key={instance.id} className="rounded-lg border border-black/10 px-3 py-2.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-medium">{instance.objectType}</div>
                        <div className="mt-0.5 text-[11px] beyu-muted">step {instance.currentStep}</div>
                      </div>
                      <Badge tone={stateTone(instance.state)}>{instance.state}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[11.5px] beyu-muted">
              <Link className="underline decoration-[#b08d1c]" href="/os/workflow">
                Open Workflow Command
              </Link>{" "}
              for approvals, retries and full instance detail.
            </p>
          </Panel>
        </div>

        {/* ------------------------------------- PREDICTIVE INTELLIGENCE + RISK */}
        <Panel kicker="PREDICTIVE INTELLIGENCE" title="Simulation and forecasting posture">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h3 className="text-[13px] font-semibold">Scenario runs</h3>
              {simulations.length === 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed beyu-muted">
                  No simulation recorded. Run one from the Queen Bee console above — results are labelled SIMULATION and
                  are never written to a ledger or treated as a record.
                </p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  {simulations.map((sim) => (
                    <li key={sim.id} className="flex items-start justify-between gap-2">
                      <span className="min-w-0 truncate" title={sim.objective}>
                        {sim.objective}
                      </span>
                      <Badge tone="amber">SIMULATION</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="text-[13px] font-semibold">Registered AI risks</h3>
              {riskRows.length === 0 ? (
                <p className="mt-2 text-[12px] leading-relaxed beyu-muted">No AI risk is registered in this scope.</p>
              ) : (
                <ul className="mt-2 space-y-1.5 text-[12px]">
                  {riskRows.map((risk) => (
                    <li key={risk.id} className="flex items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="font-mono text-[11px] beyu-muted">{risk.riskCode}</span>{" "}
                        <span className="truncate">{risk.title}</span>
                      </span>
                      <Badge tone={stateTone(risk.status)}>{risk.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        {/* ------------------------------------------------- FOOTER LINKS */}
        <Panel kicker="GOVERNANCE CENTRE" title="Adjacent governed surfaces">
          <ul className="grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-2">
            <li>
              <Link className="underline decoration-[#b08d1c]" href="/os/noelia/governance">
                NOELIA AI Governance &amp; Compliance
              </Link>
              <span className="ml-2 beyu-muted">Model registry, risk register, audits and controls.</span>
            </li>
            <li>
              <Link className="underline decoration-[#b08d1c]" href="/os/workflow">
                Workflow Command
              </Link>
              <span className="ml-2 beyu-muted">Durable workflow state, approvals and retries.</span>
            </li>
            <li>
              <Link className="underline decoration-[#b08d1c]" href="/os/audit">
                Audit ledger
              </Link>
              <span className="ml-2 beyu-muted">Material tool calls, approvals and denials.</span>
            </li>
            <li>
              <Link className="underline decoration-[#b08d1c]" href="/os/noelia">
                NOELIA console
              </Link>
              <span className="ml-2 beyu-muted">Ask, brief and analyse through the governed runtime.</span>
            </li>
          </ul>
        </Panel>
      </div>
    );
  });
}
