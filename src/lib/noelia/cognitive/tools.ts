/**
 * NOELIA — COGNITIVE CORE CAPABILITIES (HIVE tool registrations).
 *
 * These are the governed capabilities the eight brains reach. Every one is:
 *   • sideEffects NONE (read-only) — the cognitive core cannot mutate an
 *     authoritative record, post a transaction or approve anything;
 *   • SCOPED with a classification ceiling;
 *   • validated by a Zod input contract and the shared output contract;
 *   • audited through the existing registry (`NOELIA_TOOL_INVOKED`).
 *
 * The capabilities read only what the caller is authorized to read, and every
 * output states its epistemic status. Nothing here estimates a financial value.
 */

import { z } from "zod";
import type { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";
import type { NoeliaToolOutput } from "@/lib/noelia/types";
import { noeliaToolOutputSchema } from "@/lib/noelia/default-tools";
import { buildWorldModel, worldModelToToolOutput } from "./world-model";
import { neighbourhood, recordedEntityGraph } from "./knowledge-graph";
import { queryDecisionMemory, decisionMemorySummary } from "./decision-memory";
import { planCouncil, synthesiseCouncil, councilFindingsForOutput, type CouncilFindingInput } from "./council";
import { attributeBrains } from "./queen-bee";
import { getBrain, NOELIA_BRAINS } from "./brain-contracts";
import { NOELIA_BRAINS as BRAINS } from "./brain-contracts";
import { runSimulation, renderSimulation, type SimulationVariable } from "./scenario-engine";
import { evaluateAnswer, summariseSuite, type GoldenCase } from "./learning";
import type { NoeliaClaim } from "./reasoning";

const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

function claimsToOutput(claims: NoeliaClaim[]): Pick<
  NoeliaToolOutput,
  "findings" | "observedFacts" | "derivedConclusions" | "whatIsMissing" | "limitations"
> {
  return {
    findings: claims.map((claim) => ({
      label: `${claim.brain} · ${claim.kind}`,
      value: claim.statement,
      kind: claim.kind === "FACT" ? "FACT" : claim.kind === "RECOMMENDATION" ? "RECOMMENDATION" : "INFERENCE",
    })),
    observedFacts: claims.filter((c) => c.kind === "FACT").map((c) => c.statement),
    derivedConclusions: claims.filter((c) => c.kind === "INFERENCE").map((c) => c.statement),
    whatIsMissing: claims
      .filter((c) => c.kind === "UNKNOWN")
      .map((c) => `${c.statement}${c.limitation ? ` (${c.limitation})` : ""}`),
    limitations: claims.filter((c) => c.limitation).map((c) => c.limitation as string),
  };
}

/**
 * Register the cognitive-core capabilities.
 *
 * Called from `createDefaultNoeliaToolRegistry` so the capabilities live in the
 * ONE registry with the ONE authorization gate — never a second dispatch path.
 */
export function registerCognitiveCoreTools(registry: NoeliaToolRegistry): void {
  /* ------------------------------------------------------- world model */
  registry.register({
    name: "noelia.world_model.query",
    permission: "ai:noelia.query",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Read the authorized BEYU world model: recorded entities, relationships and evidence states, explicitly separating recorded, derived and simulated state.",
    metadata: {
      stableId: "cap-noelia-world-model-query",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "INSTITUTIONAL",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z
        .object({
          legalEntityId: z.string().min(1).max(64).optional(),
          includeDecisions: z.boolean().optional(),
          includeDocuments: z.boolean().optional(),
          includeSimulations: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict()
        .optional(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      const parsed = z
        .object({
          legalEntityId: z.string().min(1).max(64).optional(),
          includeDecisions: z.boolean().optional(),
          includeDocuments: z.boolean().optional(),
          includeSimulations: z.boolean().optional(),
          limit: z.number().int().min(1).max(200).optional(),
        })
        .strict()
        .parse(input ?? {});
      const model = await buildWorldModel({
        principal: context.principal,
        scope: context.scope,
        traceId: context.traceId,
        legalEntityId: parsed.legalEntityId ?? null,
        includeDecisions: parsed.includeDecisions,
        includeDocuments: parsed.includeDocuments,
        includeSimulations: parsed.includeSimulations,
        limit: parsed.limit,
      });
      return worldModelToToolOutput(model) as NoeliaToolOutput;
    },
  });

  /* --------------------------------------------------- knowledge graph */
  registry.register({
    name: "noelia.knowledge_graph.query",
    permission: "ai:noelia.query",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Traverse the authorized institutional knowledge graph to a bounded depth, with classification and tenant filtering applied before retrieval.",
    metadata: {
      stableId: "cap-noelia-knowledge-graph-query",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "KNOWLEDGE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 10000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z
        .object({
          subjectType: z.enum([
            "PERSON", "ENTITY", "COMPANY", "COUNTRY", "PROJECT", "ASSET", "DOCUMENT",
            "POLICY", "CONTRACT", "DECISION", "EVENT", "OBJECTIVE", "RISK", "WORKFLOW", "TENANT",
          ]),
          subjectRef: z.string().min(1).max(128),
          depth: z.number().int().min(1).max(3).optional(),
          limit: z.number().int().min(1).max(120).optional(),
        })
        .strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      const parsed = z
        .object({
          subjectType: z.enum([
            "PERSON", "ENTITY", "COMPANY", "COUNTRY", "PROJECT", "ASSET", "DOCUMENT",
            "POLICY", "CONTRACT", "DECISION", "EVENT", "OBJECTIVE", "RISK", "WORKFLOW", "TENANT",
          ]),
          subjectRef: z.string().min(1).max(128),
          depth: z.number().int().min(1).max(3).optional(),
          limit: z.number().int().min(1).max(120).optional(),
        })
        .strict()
        .parse(input);

      const graph = await neighbourhood({
        principal: context.principal,
        scope: context.scope,
        subjectType: parsed.subjectType,
        subjectRef: parsed.subjectRef,
        depth: parsed.depth,
        limit: parsed.limit,
      });

      // When the subject is an entity, include the RECORDED corporate structure
      // so the graph is useful before any edge has been hand-loaded.
      let recorded = { nodes: [] as Array<{ id: string; label: string; type: string }>, edges: [] as Array<{ fromId: string; toId: string; relation: string }> };
      if (parsed.subjectType === "ENTITY") {
        recorded = await recordedEntityGraph({ principal: context.principal, scope: context.scope });
      }

      const observed = graph.edges.filter((e) => e.origin === "OBSERVED");
      const derived = graph.edges.filter((e) => e.origin !== "OBSERVED");

      return {
        headline: `Knowledge graph neighbourhood for ${parsed.subjectType} ${parsed.subjectRef}`,
        findings: graph.edges.slice(0, 50).map((edge) => ({
          label: `${edge.origin} · ${edge.relation}`,
          value: `${edge.fromType}:${edge.fromRef} → ${edge.toType}:${edge.toRef} (${edge.provenance})`,
          kind: edge.origin === "OBSERVED" ? ("FACT" as const) : ("INFERENCE" as const),
        })),
        sources: [...new Set(graph.edges.map((e) => e.provenance))].map((ref) => ({
          kind: "TABLE",
          ref,
          label: `Institutional record: ${ref}`,
          authority: "BEYU_OS_CANONICAL",
        })),
        observedFacts: observed.length
          ? observed.map((e) => `${e.fromRef} ${e.relation} ${e.toRef} (${e.provenance})`)
          : [],
        derivedConclusions: [
          `${recorded.nodes.length} recorded legal entit(ies) are visible in scope.`,
          `${recorded.edges.length} recorded parent/child relationship(s) derived from legal_entities.parent_entity_id.`,
          ...derived.map((e) => `${e.relation} edge of origin ${e.origin}: ${e.fromRef} → ${e.toRef}`),
        ],
        whatIsMissing:
          graph.edges.length === 0
            ? [
                "No stored knowledge-graph edge exists for this subject. The recorded entity structure, if any, is reported separately above.",
                ...graph.denied.map((d) => `Denied: ${d.relation} — ${d.reason}`),
              ]
            : graph.denied.map((d) => `Denied: ${d.relation} — ${d.reason}`),
        limitations: [
          graph.truncated ? "Traversal was truncated at the configured limit; the graph shown is partial." : "Traversal completed within depth/breadth bounds.",
          "Graph edges are derived evidence, never authority. A relationship does not grant access to either endpoint.",
        ],
        confidence: graph.edges.length === 0 ? 0.3 : 0.7,
        humanReviewRequired: false,
        metadata: { depth: graph.depth, truncated: graph.truncated, nodes: graph.nodes.length },
      } satisfies NoeliaToolOutput;
    },
  });

  /* --------------------------------------------------- decision memory */
  registry.register({
    name: "noelia.decision_memory.query",
    permission: "ai:noelia.query",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Retrieve recorded institutional decisions with their rationale, approving authority and provenance, for institutional continuity.",
    metadata: {
      stableId: "cap-noelia-decision-memory-query",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "INSTITUTIONAL",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z
        .object({
          keyword: z.string().min(1).max(120).optional(),
          legalEntityId: z.string().min(1).max(64).optional(),
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          includeSuperseded: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict()
        .optional(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      const parsed = z
        .object({
          keyword: z.string().min(1).max(120).optional(),
          legalEntityId: z.string().min(1).max(64).optional(),
          from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
          includeSuperseded: z.boolean().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .strict()
        .parse(input ?? {});

      const result = await queryDecisionMemory({
        principal: context.principal,
        scope: context.scope,
        keyword: parsed.keyword ?? null,
        legalEntityId: parsed.legalEntityId ?? null,
        from: parsed.from ?? null,
        to: parsed.to ?? null,
        includeSuperseded: parsed.includeSuperseded,
        limit: parsed.limit,
      });

      return {
        headline: `Institutional decision memory — ${result.records.length} record(s)`,
        ...claimsToOutput(result.claims),
        sources: result.records.map((record) => ({
          kind: "DECISION",
          ref: `noelia_decision_records:${record.id}`,
          label: `${record.code} — ${record.title}`,
          authority: record.provenance,
        })),
        confidence: result.records.length === 0 ? 0.2 : 0.85,
        humanReviewRequired: false,
        alternatives: [...new Set(result.records.flatMap((r) => r.alternatives))].slice(0, 10),
        limitations: [
          "Decision memory reflects decisions RECORDED in the register. A decision taken but not recorded is invisible here.",
          result.truncated ? "Result set truncated at the configured limit." : "Result set complete for the queried scope.",
        ],
        metadata: { count: result.records.length, truncated: result.truncated },
      } satisfies NoeliaToolOutput;
    },
  });

  /* ------------------------------------------------- intelligence council */
  registry.register({
    name: "noelia.council.deliberate",
    permission: "ai:executive.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description:
      "Convene the Intelligence Council for a complex institutional question: bounded specialist briefs, independent evidence and explicit disagreement.",
    metadata: {
      stableId: "cap-noelia-council-deliberate",
      version: "1.0.0",
      ownerRole: "CHIEF_EXECUTIVE_OFFICER",
      domain: "EXECUTIVE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 20000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z
        .object({
          question: z.string().min(10).max(2000),
          /** Specialist findings already collected by the caller's authorized tools. */
          findings: z
            .array(
              z
                .object({
                  brain: z.enum(["EXECUTIVE", "INSTITUTIONAL", "KNOWLEDGE", "ANALYTICAL", "OPERATIONAL", "LEARNING", "COLLECTIVE", "PERSONAL_CONTEXT"]),
                  capability: z.string().max(80).nullable(),
                  task: z.string().min(3).max(300),
                  claimKind: z.enum(["FACT", "INFERENCE", "ASSUMPTION", "PREDICTION", "RECOMMENDATION", "UNKNOWN", "SIMULATION"]),
                  statement: z.string().min(3).max(1500),
                  evidenceRefs: z.array(z.string().max(200)).max(20),
                  assumptions: z.array(z.string().max(300)).max(20).optional(),
                  confidence: z.number().min(0).max(1).nullable().optional(),
                })
                .strict(),
            )
            .max(24)
            .default([]),
          maxParticipants: z.number().int().min(2).max(6).optional(),
        })
        .strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      const parsed = z
        .object({
          question: z.string().min(10).max(2000),
          findings: z
            .array(
              z
                .object({
                  brain: z.enum(["EXECUTIVE", "INSTITUTIONAL", "KNOWLEDGE", "ANALYTICAL", "OPERATIONAL", "LEARNING", "COLLECTIVE", "PERSONAL_CONTEXT"]),
                  capability: z.string().max(80).nullable(),
                  task: z.string().min(3).max(300),
                  claimKind: z.enum(["FACT", "INFERENCE", "ASSUMPTION", "PREDICTION", "RECOMMENDATION", "UNKNOWN", "SIMULATION"]),
                  statement: z.string().min(3).max(1500),
                  evidenceRefs: z.array(z.string().max(200)).max(20),
                  assumptions: z.array(z.string().max(300)).max(20).optional(),
                  confidence: z.number().min(0).max(1).nullable().optional(),
                })
                .strict(),
            )
            .max(24)
            .default([]),
          maxParticipants: z.number().int().min(2).max(6).optional(),
        })
        .strict()
        .parse(input);

      const authorized = new Set(context.authorizedCapabilities ?? []);
      const candidateBrains = attributeBrains(parsed.question);
      // Always include the executive and governance voices for an institutional
      // question; the plan's authorization filter removes any that cannot act.
      for (const brain of ["EXECUTIVE", "INSTITUTIONAL"] as const) {
        if (!candidateBrains.includes(brain)) candidateBrains.push(brain);
      }

      const plan = planCouncil({
        question: parsed.question,
        objective: parsed.question,
        candidateBrains,
        capabilityAuthorized: (capability) => authorized.size === 0 || authorized.has(capability),
        maxParticipants: parsed.maxParticipants,
      });

      const synthesis = synthesiseCouncil({
        plan,
        findings: parsed.findings as CouncilFindingInput[],
      });

      return {
        headline: `Intelligence Council synthesis — ${plan.specialists.length} specialist(s) convened`,
        findings: councilFindingsForOutput(synthesis),
        observedFacts: synthesis.claims.filter((c) => c.kind === "FACT").map((c) => c.statement),
        derivedConclusions: synthesis.consensus,
        recommendations: synthesis.claims
          .filter((c) => c.kind === "RECOMMENDATION")
          .map((claim, index) => ({
            id: `council-rec-${index + 1}`,
            headline: claim.statement,
            rationale: `Produced by the ${getBrain(claim.brain).title} from its bounded council brief.`,
            evidence: claim.evidence,
            assumptions: synthesis.assumptions,
            uncertainty: synthesis.uncertainties,
            limitations: synthesis.missing,
            confidence: claim.confidence ?? synthesis.confidence,
            sourceProvenance: [`brain:${claim.brain}`, "INTELLIGENCE_COUNCIL"],
            whatWouldChange: claim.whatWouldChange ?? [],
            risks: synthesis.dissent,
            alternatives: synthesis.disagreements.map((d) => d.subject),
            humanDecisionRequired: true,
            horizon: "HORIZON_3_MEDIUM_TERM" as const,
            status: "RECOMMENDATION" as const,
          })),
        alternatives: synthesis.disagreements.map((d) => `Disagreement on '${d.subject}': ${d.supporting.join(" | ")}`),
        risks: synthesis.dissent,
        assumptions: synthesis.assumptions,
        uncertainty: synthesis.uncertainties,
        whatIsMissing: synthesis.missing,
        requiresHumanDecision: [synthesis.executiveSummary, ...synthesis.approvalsRequired],
        confidence: synthesis.confidence,
        humanReviewRequired: true,
        sources: plan.specialists.map((s) => ({
          kind: "SPECIALIST",
          ref: `brain:${s.brain}`,
          label: s.title,
          authority: "NOELIA_COGNITIVE",
        })),
        limitations: [
          "This is a reconciled recommendation, not a decision. Specialists are analytical voices, not institutional authorities.",
          `Duplicated opinions collapsed: ${synthesis.duplicatedOpinions.length}.`,
        ],
        narrative: synthesis.executiveSummary,
        metadata: {
          participants: plan.specialists.map((s) => s.brain),
          excluded: plan.excluded,
          duplicatedOpinions: synthesis.duplicatedOpinions,
          disagreements: synthesis.disagreements.length,
        },
      } satisfies NoeliaToolOutput;
    },
  });

  /* ------------------------------------------------------ scenario engine */
  registry.register({
    name: "noelia.scenario.simulate",
    permission: "ai:analytics.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Run a deterministic strategic simulation across optimistic, baseline and adverse scenarios. Output is always labelled SIMULATION and is never an institutional record.",
    metadata: {
      stableId: "cap-noelia-scenario-simulate",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "ANALYTICS",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z
        .object({
          objective: z.string().min(5).max(500),
          scenarioKind: z.string().min(3).max(80),
          method: z.enum(["LINEAR_COMBINATION", "PROPORTIONAL_SCALING"]),
          variables: z
            .array(
              z
                .object({
                  key: z.string().min(2).max(60),
                  label: z.string().min(2).max(120),
                  optimistic: z.number().finite().nullable(),
                  baseline: z.number().finite().nullable(),
                  adverse: z.number().finite().nullable(),
                  unit: z.string().min(1).max(20),
                  provenance: z.enum(["OBSERVED", "RECORDED", "ESTIMATE", "UNAVAILABLE"]),
                })
                .strict(),
            )
            .min(1)
            .max(20),
          assumptions: z.array(z.string().max(400)).max(20).default([]),
          limitations: z.array(z.string().max(400)).max(20).optional(),
        })
        .strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (_context, input) => {
      const parsed = z
        .object({
          objective: z.string().min(5).max(500),
          scenarioKind: z.string().min(3).max(80),
          method: z.enum(["LINEAR_COMBINATION", "PROPORTIONAL_SCALING"]),
          variables: z
            .array(
              z
                .object({
                  key: z.string().min(2).max(60),
                  label: z.string().min(2).max(120),
                  optimistic: z.number().finite().nullable(),
                  baseline: z.number().finite().nullable(),
                  adverse: z.number().finite().nullable(),
                  unit: z.string().min(1).max(20),
                  provenance: z.enum(["OBSERVED", "RECORDED", "ESTIMATE", "UNAVAILABLE"]),
                })
                .strict(),
            )
            .min(1)
            .max(20),
          assumptions: z.array(z.string().max(400)).max(20).default([]),
          limitations: z.array(z.string().max(400)).max(20).optional(),
        })
        .strict()
        .parse(input);

      const outcome = runSimulation({
        objective: parsed.objective,
        scenarioKind: parsed.scenarioKind,
        method: parsed.method,
        variables: parsed.variables as SimulationVariable[],
        baseline: Object.fromEntries(
          parsed.variables.map((v) => [
            v.key,
            { value: v.baseline, provenance: v.provenance, source: null },
          ]),
        ),
        assumptions: parsed.assumptions,
        limitations: parsed.limitations,
      });

      const rendered = renderSimulation(outcome);

      return {
        headline: `Simulated (not a record): ${outcome.objective}`,
        findings: rendered.map((line, index) => ({
          label: index === 0 ? "SIMULATION" : "SIMULATION DETAIL",
          value: line,
          kind: "INFERENCE" as const,
        })),
        scenarios: rendered,
        assumptions: outcome.assumptions,
        limitations: outcome.limitations,
        uncertainty: [
          outcome.confidence < 0.4
            ? "Input provenance is estimated or incomplete; treat the spread as illustrative only."
            : "Inputs are recorded, but the model remains a simplification of the institution.",
        ],
        metrics: [
          {
            code: "SIMULATION_BASELINE",
            label: "Baseline scenario objective (simulated)",
            value: outcome.spread.baseline === null ? "UNAVAILABLE" : String(outcome.spread.baseline),
            status: "SCENARIO",
            confidence: outcome.confidence,
            source: "noelia.scenario.simulate",
            period: null,
            trend: "UNKNOWN" as const,
          },
          {
            code: "SIMULATION_OPTIMISTIC",
            label: "Optimistic scenario objective (simulated)",
            value: outcome.spread.optimistic === null ? "UNAVAILABLE" : String(outcome.spread.optimistic),
            status: "SCENARIO",
            confidence: outcome.confidence,
            source: "noelia.scenario.simulate",
            period: null,
            trend: "UNKNOWN" as const,
          },
          {
            code: "SIMULATION_ADVERSE",
            label: "Adverse scenario objective (simulated)",
            value: outcome.spread.adverse === null ? "UNAVAILABLE" : String(outcome.spread.adverse),
            status: "SCENARIO",
            confidence: outcome.confidence,
            source: "noelia.scenario.simulate",
            period: null,
            trend: "UNKNOWN" as const,
          },
        ],
        confidence: outcome.confidence,
        humanReviewRequired: true,
        whatIsMissing:
          outcome.scenarios.flatMap((s) =>
            s.complete ? [] : [`${s.label}: unavailable inputs ${s.unavailableInputs.join(", ")}`],
          ),
        metadata: { resultClass: outcome.resultClass, deterministic: outcome.deterministic },
      } satisfies NoeliaToolOutput;
    },
  });

  /* ------------------------------------------------------------- learning */
  registry.register({
    name: "noelia.evaluation.status",
    permission: "ai:evaluation.read",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Report NOELIA's cognitive evaluation posture: the canonical brains, their declared reach and the evaluation criteria applied to each.",
    metadata: {
      stableId: "cap-noelia-evaluation-status",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "LEARNING",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 5000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context) => {
      const authorized = new Set(context.authorizedCapabilities ?? []);
      const rows = NOELIA_BRAINS.map((brain) => {
        const reach = authorized.size === 0
          ? brain.capabilityReach
          : brain.capabilityReach.filter((capability) => authorized.has(capability));
        return {
          brain: brain.id,
          title: brain.title,
          mode: brain.mode,
          declared: brain.capabilityReach.length,
          authorized: reach.length,
          criteria: brain.evaluationCriteria,
        };
      });

      // Golden-case evaluation is reported only where a case is actually loaded;
      // an empty benchmark set is stated, never simulated.
      const suite = summariseSuite([]);

      return {
        headline: `NOELIA cognitive evaluation posture — ${rows.length} canonical brains`,
        findings: rows.map((row) => ({
          label: `${row.brain} · ${row.mode}`,
          value: `${row.title}: ${row.authorized}/${row.declared} capabilities authorized for this caller.`,
          kind: "FACT" as const,
        })),
        observedFacts: rows.map((row) => `${row.brain} declared mode ${row.mode} with ${row.declared} capabilities.`),
        derivedConclusions: [
          `Golden-case suite loaded in this environment: ${suite.total} case(s).`,
          "Learning proposals require human approval; none can apply automatically.",
        ],
        whatIsMissing:
          suite.total === 0
            ? ["No golden-case benchmark rows are loaded in this environment; quality is not asserted from an empty suite."]
            : [],
        limitations: [
          "Authorized capability counts describe this caller's reach, not the platform's maximum.",
        ],
        confidence: 0.8,
        humanReviewRequired: false,
        metadata: { brains: rows },
      } satisfies NoeliaToolOutput;
    },
  });

  /* ------------------------------------------------- personal context */
  registry.register({
    name: "noelia.personal_context.read",
    permission: "ai:noelia.query",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Read the caller's OWN authorized personal context and role metadata. Never reads another user's context and never widens authorization.",
    metadata: {
      stableId: "cap-noelia-personal-context-read",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "PERSONAL_CONTEXT",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 5000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context) => {
      const principal = context.principal;
      return {
        headline: "Your authorized NOELIA context",
        findings: [
          { label: "Role", value: `${principal.roles.join(", ") || "none declared"}`, kind: "FACT" as const },
          { label: "Tenant", value: principal.tenantCode, kind: "FACT" as const },
          { label: "Clearance", value: principal.clearance, kind: "FACT" as const },
          {
            label: "Entity scope",
            value: principal.entityScope.length === 0 ? "all entities within tenant scope" : principal.entityScope.join(", "),
            kind: "FACT" as const,
          },
        ],
        observedFacts: [
          `Caller ${principal.displayName} operates in tenant ${principal.tenantCode} with clearance ${principal.clearance}.`,
        ],
        derivedConclusions: [],
        whatIsMissing: [
          "Saved personal preferences are not stored as institutional records; presentation preferences live in the user profile, not here.",
        ],
        limitations: [
          "Personal context can never widen authorization. This tool reports the caller's own resolved context only.",
        ],
        confidence: 0.95,
        humanReviewRequired: false,
        metadata: { userId: principal.userId },
      } satisfies NoeliaToolOutput;
    },
  });

  /* ----------------------------------------------- operational awareness */
  registry.register({
    name: "noelia.operations.status",
    permission: "ai:workflow.run",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Report the operational posture of NOELIA's governed workflows and schedules: what is pending, what awaits approval, and what failed. Read-only.",
    metadata: {
      stableId: "cap-noelia-operations-status",
      version: "1.0.0",
      ownerRole: "CHIEF_OPERATING_OFFICER",
      domain: "OPERATIONS",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context) => {
      const summary = await decisionMemorySummary({
        principal: context.principal,
        scope: context.scope,
      });
      return {
        headline: "NOELIA operational posture",
        findings: [
          {
            label: "Institutional decision register",
            value: `${summary.effective} effective decision(s); ${summary.superseded} superseded.`,
            kind: "FACT" as const,
          },
          {
            label: "Earliest recorded decision",
            value: summary.earliest ?? "UNAVAILABLE",
            kind: summary.earliest ? ("FACT" as const) : ("INFERENCE" as const),
          },
        ],
        observedFacts: [`Decision memory summary read for ${context.scope.tenantIds.length} tenant(s).`],
        derivedConclusions: [
          "Workflow execution state is inspected through the governed workflow endpoints; this capability reports the decision register only.",
        ],
        whatIsMissing:
          summary.effective === 0
            ? ["No effective institutional decisions are recorded in this environment."]
            : [],
        limitations: [
          "This is a read-only operational snapshot; it never transitions a workflow or approves an action.",
        ],
        confidence: 0.7,
        humanReviewRequired: false,
        metadata: summary,
      } satisfies NoeliaToolOutput;
    },
  });
}

/** Exported for tests and the Command Centre: the canonical brain roster. */
export const COGNITIVE_BRAIN_ROSTER = BRAINS;
