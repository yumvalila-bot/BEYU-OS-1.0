/**
 * BEYU Foundation OS — HIVE tool registration.
 *
 * All Foundation tools are sideEffects NONE: Noelia may analyse, summarise,
 * recommend and draft, but material actions (approve, transfer, post,
 * restructure) have NO tool path and remain human-governed. The registry
 * enforces RBAC/ABAC, tenant, entity, country and jurisdiction checks before
 * any handler runs; handlers additionally re-scope every query.
 */
import { z } from "zod";
import type { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";
import { noeliaToolOutputSchema } from "@/lib/noelia/default-tools";
import { BeyuNoeliaFoundationService } from "./noelia-service";

const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

const INTAKE_SCHEMA = z
  .object({
    mission: z.string(),
    activities: z.array(z.string()),
    beneficiaryScope: z.string(),
    geographicScope: z.string(),
    fundingModel: z.string(),
    governanceModel: z.string(),
    jurisdictionCode: z.string(),
    proposedVehicle: z.string(),
    taxObjectives: z.array(z.string()),
    donorModel: z.string(),
    grantmakingModel: z.string(),
    internationalActivities: z.boolean(),
    expectedWorkforce: z.number(),
    relatedEntities: z.array(z.string()),
  })
  .passthrough();

const GRAPH_SCHEMA = z.object({
  nodes: z.array(z.object({ id: z.string(), kind: z.string(), label: z.string(), jurisdiction: z.string() }).passthrough()),
  edges: z.array(z.object({ from: z.string(), to: z.string(), relation: z.string() }).passthrough()),
});

export function registerFoundationTools(
  registry: NoeliaToolRegistry,
  service = new BeyuNoeliaFoundationService(),
): void {
  const audit = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;

  registry.register({
    name: "foundation.registry.summary",
    permission: "foundation:registry.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Summarise authorised foundations by lifecycle status.",
    metadata: {
      stableId: "cap-foundation-registry-summary",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => service.registry(context),
  });

  registry.register({
    name: "foundation.compliance.posture",
    permission: "foundation:compliance.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Report authorised compliance posture: open, overdue, due-today and at-risk deadlines.",
    metadata: {
      stableId: "cap-foundation-compliance-posture",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => service.compliancePosture(context),
  });

  registry.register({
    name: "foundation.grants.pipeline",
    permission: "foundation:grant.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Summarise the authorised grant pipeline by lifecycle status. Cannot approve grants.",
    metadata: {
      stableId: "cap-foundation-grants-pipeline",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => service.grantPipeline(context),
  });

  registry.register({
    name: "foundation.funds.position",
    permission: "foundation:fund.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Summarise authorised fund balances, commitments and donations. Cannot move money.",
    metadata: {
      stableId: "cap-foundation-funds-position",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => service.fundPosition(context),
  });

  registry.register({
    name: "foundation.formation.draft",
    permission: "foundation:formation.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Draft a formation assessment from intake facts. Persists nothing; legal information only.",
    metadata: {
      stableId: "cap-foundation-formation-draft",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: INTAKE_SCHEMA,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => service.draftFormationAssessment(context, INTAKE_SCHEMA.parse(input)),
  });

  registry.register({
    name: "foundation.structure.draft",
    permission: "foundation:structure.simulate",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Draft a structure-change simulation. Executes nothing; human review required.",
    metadata: {
      stableId: "cap-foundation-structure-draft",
      version: "1.0.0",
      ownerRole: "FOUNDATION_DIRECTOR",
      domain: "FOUNDATION",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: z.object({ question: z.string(), before: GRAPH_SCHEMA, after: GRAPH_SCHEMA }),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) =>
      service.draftStructureSimulation(
        context,
        z.object({ question: z.string(), before: GRAPH_SCHEMA, after: GRAPH_SCHEMA }).parse(input),
      ),
  });
}
