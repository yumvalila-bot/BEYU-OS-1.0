import { z } from "zod";
import { NOELIA_ANALYSIS_TYPES } from "./types";
import { NoeliaToolRegistry } from "./tool-registry";
import type { NoeliaFinding, NoeliaSource } from "./types";
import { BeyuNoeliaReadService } from "./read-services";
import { BeyuNoeliaAnalyticsService } from "./analytics-service";
import { BeyuNoeliaWorkforceService } from "./workforce-service";
import { BeyuNoeliaLegalService } from "./legal-service";
import { BeyuNoeliaHealthBoundary } from "./health-boundary";
import { BeyuNoeliaMemoryService } from "./enterprise-memory";
import { BeyuNoeliaModelGateway } from "./model-gateway";
import { BeyuNoeliaAiPlatformService } from "./ai-platform";
import { can } from "@/lib/authz";

/**
 * Runtime envelope passed to every plan step: the question being asked.
 * Tools that take no structured input still declare this envelope so the
 * contract is explicit and unknown extra shapes never pass silently.
 */
const NOELIA_TOOL_ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

/**
 * Shared output contract for every registered capability. The registry
 * validates handler output against this shape after execution and DENIES
 * (OUTPUT_INVALID) on structural corruption — malformed output is never
 * propagated to a caller.
 */
export const noeliaToolOutputSchema = z.object({
  findings: z.array(z.object({
    label: z.string(),
    value: z.string(),
    kind: z.enum(["FACT", "INFERENCE", "RECOMMENDATION"]),
    status: z.string().optional(),
    metricCode: z.string().nullable().optional(),
    horizon: z.string().nullable().optional(),
    confidence: z.number().nullable().optional(),
    provenance: z.string().nullable().optional(),
  }).passthrough()).optional(),
  sources: z.array(z.object({
    kind: z.string(),
    ref: z.string(),
    label: z.string(),
    authority: z.string(),
  }).passthrough()).optional(),
  headline: z.string().optional(),
  narrative: z.string().optional(),
  confidence: z.number().optional(),
  humanReviewRequired: z.boolean().optional(),
  metrics: z.array(z.object({
    code: z.string(),
    label: z.string(),
    value: z.string(),
    status: z.string(),
    confidence: z.number().nullable(),
    source: z.string().nullable(),
    period: z.string().nullable(),
    trend: z.enum(["UP", "DOWN", "FLAT", "UNKNOWN"]),
  }).passthrough()).optional(),
  recommendations: z.array(z.object({ id: z.string() }).passthrough()).optional(),
  alternatives: z.array(z.string()).optional(),
  risks: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional(),
  uncertainty: z.array(z.string()).optional(),
  limitations: z.array(z.string()).optional(),
  whatWouldChangeRecommendation: z.array(z.string()).optional(),
  observedFacts: z.array(z.string()).optional(),
  derivedConclusions: z.array(z.string()).optional(),
  forecasts: z.array(z.string()).optional(),
  scenarios: z.array(z.string()).optional(),
  whatIsMissing: z.array(z.string()).optional(),
  requiresHumanDecision: z.array(z.string()).optional(),
  deteriorating: z.array(z.string()).optional(),
  improving: z.array(z.string()).optional(),
  managementAttentionRequired: z.array(z.string()).optional(),
  opportunities: z.array(z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

/**
 * Build the production registry. Handlers are BEYU service adapters only.
 *
 * Every capability carries the full governed contract (stable id, version,
 * owner role, domain, side effects, idempotency, timeout, retry, jurisdiction
 * and entity restrictions, approval and audit requirements). Unknown tools,
 * unknown capabilities and unregistered handlers DENY.
 */
export function createDefaultNoeliaToolRegistry(
  services = new BeyuNoeliaReadService(),
  analytics = new BeyuNoeliaAnalyticsService(),
  workforce = new BeyuNoeliaWorkforceService(),
  legal = new BeyuNoeliaLegalService(),
  health = new BeyuNoeliaHealthBoundary(),
  memory = new BeyuNoeliaMemoryService(),
  models = new BeyuNoeliaModelGateway(),
  aiPlatform = new BeyuNoeliaAiPlatformService(),
): NoeliaToolRegistry {
  const registry = new NoeliaToolRegistry();

  /* ---------------- Finance OS intelligence ---------------- */

  registry.register({
    name: "finance.treasury.aggregate",
    permission: "finance:treasury.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Aggregate authorized treasury positions through Finance OS.",
    metadata: {
      stableId: "cap-finance-treasury-aggregate",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.treasury(context),
  });
  registry.register({
    name: "finance.capital.pipeline",
    permission: "finance:capital.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Read the authorized capital request pipeline through Finance OS.",
    metadata: {
      stableId: "cap-finance-capital-pipeline",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.capitalPipeline(context),
  });
  registry.register({
    name: "finance.waterfall.latest",
    permission: "finance:waterfall.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read the latest authorized waterfall result through Finance OS.",
    metadata: {
      stableId: "cap-finance-waterfall-latest",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.latestWaterfall(context),
  });
  registry.register({
    name: "finance.cash.position",
    permission: "finance:treasury.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Canonical cash position through the Finance OS treasury engine.",
    metadata: {
      stableId: "cap-finance-cash-position",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => analytics.kpiAnalysis(context),
  });
  registry.register({
    name: "finance.maturity.profile",
    permission: "finance:treasury.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Maturity profile through the Finance OS treasury engine (honest DATA_NOT_AVAILABLE).",
    metadata: {
      stableId: "cap-finance-maturity-profile",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context) => {
      const treasury = await analytics.loadTreasuryForTool(context);
      return {
        headline: treasury.length
          ? "Maturity profile is DATA_NOT_AVAILABLE: positions carry no maturity information."
          : "Maturity profile is UNAVAILABLE: no treasury positions in scope.",
        findings: [{
          label: "Maturity profile",
          value: "DATA_NOT_AVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        narrative: "treasury_positions has no maturity/tenor column; deriving a ladder from account type would be fabrication.",
        confidence: 0.4,
      };
    },
  });
  registry.register({
    name: "finance.fx.view",
    permission: "finance:treasury.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "FX resolution through the Finance OS FX engine (honest REQUIRES_AUTHORITY).",
    metadata: {
      stableId: "cap-finance-fx-view",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z.object({
        fromCurrency: z.string().length(3).toUpperCase(),
        toCurrency: z.string().length(3).toUpperCase(),
      }),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      const { fromCurrency, toCurrency } = z.object({
        fromCurrency: z.string().length(3).toUpperCase(),
        toCurrency: z.string().length(3).toUpperCase(),
      }).parse(input ?? {});
      const { resolveRate } = await import("@/lib/finance/fx");
      const result = await resolveRate({
        fromCurrency,
        toCurrency,
        asOf: new Date().toISOString().slice(0, 10),
        governedRates: [],
      });
      const rate = result.usable ? result.rate?.rate : null;
      return {
        headline: rate !== null
          ? `FX ${fromCurrency}→${toCurrency} resolves ${rate}.`
          : `FX ${fromCurrency}→${toCurrency} requires authority.`,
        findings: [{
          label: "FX resolution",
          value: rate ?? "REQUIRES_AUTHORITY",
          kind: rate !== null ? "FACT" : "INFERENCE",
          status: rate !== null ? "OBSERVED" : "REQUIRES_HUMAN_REVIEW",
        }],
        narrative: result.reason,
        confidence: rate !== null ? 0.9 : 0.6,
        humanReviewRequired: rate === null,
      };
    },
  });
  registry.register({
    name: "finance.reconciliation.status",
    permission: "finance:ledger.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Treasury-to-ledger reconciliation status through Finance OS.",
    metadata: {
      stableId: "cap-finance-reconciliation-status",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context) => {
      const { reconcileTreasuryToLedger } = await import("@/lib/finance/reconciliation");
      const result = await reconcileTreasuryToLedger(context.target.tenantId);
      const reconciled = result.status === "RECONCILED";
      return {
        headline: reconciled
          ? "Treasury reconciles to ledger."
          : `Reconciliation state: ${result.status}.`,
        findings: [{
          label: "Reconciliation",
          value: result.status,
          kind: reconciled ? "FACT" : "INFERENCE",
          status: reconciled ? "OBSERVED" : "REQUIRES_HUMAN_REVIEW",
        }],
        narrative: result.reason,
        confidence: 0.85,
        humanReviewRequired: !reconciled,
      };
    },
  });

  /* ---------------- Risk / compliance / governance ---------------- */

  registry.register({
    name: "risk.register.query",
    permission: "risk:register.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Read authorized risk register evidence.",
    metadata: {
      stableId: "cap-risk-register-query",
      version: "1.0.0",
      ownerRole: "CHIEF_RISK_COMPLIANCE",
      domain: "RISK",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.riskRegister(context),
  });
  registry.register({
    name: "risk.analysis",
    permission: "risk:register.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Deterministic risk analysis over the canonical risk register.",
    metadata: {
      stableId: "cap-risk-analysis",
      version: "1.0.0",
      ownerRole: "CHIEF_RISK_COMPLIANCE",
      domain: "RISK",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => analytics.riskAnalysis(context),
  });
  registry.register({
    name: "compliance.obligation.query",
    permission: "compliance:obligation.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Read authorized obligations and confirmed assessments.",
    metadata: {
      stableId: "cap-compliance-obligation-query",
      version: "1.0.0",
      ownerRole: "CHIEF_RISK_COMPLIANCE",
      domain: "COMPLIANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.compliance(context),
  });
  registry.register({
    name: "compliance.analysis",
    permission: "compliance:obligation.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Deterministic compliance analysis over confirmed obligations.",
    metadata: {
      stableId: "cap-compliance-analysis",
      version: "1.0.0",
      ownerRole: "CHIEF_RISK_COMPLIANCE",
      domain: "COMPLIANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => analytics.complianceAnalysis(context),
  });

  /* ---------------- Analytics dispatcher (17 governed types) ---------------- */

  registry.register({
    name: "analytics.run",
    permission: "ai:analytics.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Governed analytics dispatcher over the 17 canonical analysis types; every measure comes from a specialist engine with scope pushdown.",
    metadata: {
      stableId: "cap-analytics-run",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "ANALYTICS",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 30000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      outputSchema: noeliaToolOutputSchema,
      inputSchema: z.object({
        analysisType: z.enum(NOELIA_ANALYSIS_TYPES),
        options: z.record(z.unknown()).optional(),
      }).strict(),
    },
    execute: (context, input) => {
      const { analysisType, options } = z.object({
        analysisType: z.enum(NOELIA_ANALYSIS_TYPES),
        options: z.record(z.unknown()).optional(),
      }).parse(input ?? {});
      return analytics.analyze(analysisType, context, options ?? {});
    },
  });

  registry.register({
    name: "governance.resolution.query",
    permission: "governance:resolution.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read authorized resolution evidence.",
    metadata: {
      stableId: "cap-governance-resolution-query",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "GOVERNANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.governance(context),
  });

  registry.register({
    name: "governance.strategic.objectives",
    permission: "governance:resolution.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read strategic objectives with DERIVED progress (current vs governed target); evidence, never authority.",
    metadata: {
      stableId: "cap-governance-strategic-objectives",
      version: "1.0.0",
      ownerRole: "GROUP_CEO",
      domain: "GOVERNANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.strategicObjectives(context),
  });

  /* ---------------- Tax / legal intelligence ---------------- */

  registry.register({
    name: "tax.knowledge.query",
    permission: "finance:tax.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Read authoritative tax intelligence for authorized countries.",
    metadata: {
      stableId: "cap-tax-knowledge-query",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "TAX",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.tax(context),
  });
  registry.register({
    name: "legal.knowledge.query",
    permission: "legal:matter.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Jurisdiction-aware legal knowledge retrieval; unknown authority fails closed.",
    metadata: {
      stableId: "cap-legal-knowledge-query",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "LEGAL",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z.object({
        question: z.string().min(1).max(500),
        jurisdictionCode: z.string().length(2).optional(),
        domain: z.enum(["LEGAL", "TAX"]).default("LEGAL"),
      }).strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => legal.knowledge(context, input),
  });
  registry.register({
    name: "legal.authority.status",
    permission: "legal:matter.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Authority status for a cited legal/tax source; unknown authorities fail closed.",
    metadata: {
      stableId: "cap-legal-authority-status",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "LEGAL",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: z.object({
        citation: z.string().min(2).max(200),
        jurisdictionCode: z.string().length(2).optional(),
      }).strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => legal.authorityStatus(context, input),
  });

  /* ---------------- HCM intelligence ---------------- */

  registry.register({
    name: "hcm.employee.aggregate",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Aggregate workforce through the canonical HCM service.",
    metadata: {
      stableId: "cap-hcm-employee-aggregate",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => services.workforce(context),
  });
  registry.register({
    name: "hcm.workforce.observe",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Canonical workforce observation (headcount, status, occupancy).",
    metadata: {
      stableId: "cap-hcm-workforce-observe",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => workforce.observe(context),
  });
  registry.register({
    name: "hcm.organization.structure",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Canonical organizational structure through HCM.",
    metadata: {
      stableId: "cap-hcm-organization-structure",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => workforce.organization(context),
  });
  registry.register({
    name: "hcm.workforce.quality",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Workforce data-quality assessment through HCM observe.",
    metadata: {
      stableId: "cap-hcm-workforce-quality",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => workforce.quality(context),
  });
  registry.register({
    name: "hcm.turnover.analyze",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Turnover analysis from employment-event history; UNAVAILABLE where no history exists.",
    metadata: {
      stableId: "cap-hcm-turnover-analyze",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => workforce.turnover(context),
  });
  registry.register({
    name: "hcm.succession.signals",
    permission: "hcm:employee.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Succession-relevant signals from organizational structure; no invented readiness scores.",
    metadata: {
      stableId: "cap-hcm-succession-signals",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => workforce.successionSignals(context),
  });

  /* ---------------- Health OS boundary ---------------- */

  registry.register({
    name: "health.runtime.status",
    permission: "ai:noelia.query",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Health OS integration boundary: reports registered runtime status; never fabricates clinical data.",
    metadata: {
      stableId: "cap-health-runtime-status",
      version: "1.0.0",
      ownerRole: "PLATFORM_ADMIN",
      domain: "HEALTH",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => health.status(context),
  });

  /* ---------------- Knowledge / RAG / memory ---------------- */

  registry.register({
    name: "knowledge.rag.search",
    permission: "ai:noelia.query",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Retrieve governed, scoped and classification-filtered knowledge.",
    metadata: {
      stableId: "cap-knowledge-rag-search",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "KNOWLEDGE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => services.knowledge(context, input),
  });
  registry.register({
    name: "knowledge.ingest",
    permission: "ai:knowledge.ingest",
    classification: "CONFIDENTIAL",
    risk: "HIGH",
    approverRole: "CHIEF_GOVERNANCE_OFFICER",
    description: "Register a governed knowledge source with provenance, authority and effective windows.",
    metadata: {
      stableId: "cap-knowledge-ingest",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "KNOWLEDGE",
      sideEffects: "DOMAIN_WRITE",
      idempotent: false,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: { approverRole: "CHIEF_GOVERNANCE_OFFICER", reason: "Knowledge registration becomes governed retrieval content." },
      auditRequirements: { event: "NOELIA_KNOWLEDGE_INGESTED", objectType: "KNOWLEDGE_SOURCE" },
      outputSchema: noeliaToolOutputSchema,
      inputSchema: z.object({
        code: z.string().min(3).max(64),
        title: z.string().min(3).max(200),
        domain: z.string().min(2).max(40),
        content: z.string().min(10).max(20000),
        sourceUri: z.string().url().optional(),
        jurisdictionCode: z.string().length(2).optional(),
        scopeType: z.enum(["GLOBAL", "ENTERPRISE", "TENANT", "ENTITY", "COUNTRY"]),
        classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
        authorityStatus: z.enum(["AUTHORITATIVE", "UNDER_REVIEW", "SUPERSEDED", "DRAFT"]).default("UNDER_REVIEW"),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reviewDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        supersedesCode: z.string().nullable().optional(),
        provenance: z.string().min(3).max(500),
        keywords: z.array(z.string().min(1).max(40)).max(30).default([]),
      }).strict(),
    },
    execute: (context, input) => memory.ingestKnowledge(context, input),
  });
  registry.register({
    name: "memory.read",
    permission: "ai:memory.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read governed enterprise memory within the resolved scope and clearance.",
    metadata: {
      stableId: "cap-memory-read",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "MEMORY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      outputSchema: noeliaToolOutputSchema,
      inputSchema: z.object({
        query: z.string().min(1).max(500),
        memoryClass: z.string().max(60).optional(),
        limit: z.number().int().min(1).max(50).default(10),
      }).strict(),
    },
    execute: (context, input) => memory.search(context, input),
  });
  registry.register({
    name: "memory.write",
    permission: "ai:memory.write",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Write governed enterprise memory owned by the requesting principal.",
    metadata: {
      stableId: "cap-memory-write",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "MEMORY",
      sideEffects: "DOMAIN_WRITE",
      idempotent: false,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_MEMORY_WRITTEN", objectType: "ENTERPRISE_MEMORY" },
      outputSchema: noeliaToolOutputSchema,
      inputSchema: z.object({
        memoryClass: z.string().min(3).max(60),
        content: z.string().min(5).max(10000),
        classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
        legalEntityId: z.string().nullable().optional(),
        countryCode: z.string().length(2).nullable().optional(),
        expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        retentionCode: z.string().min(2).max(40).default("STANDARD"),
        legalHold: z.boolean().default(false),
        metadata: z.record(z.unknown()).default({}),
      }).strict(),
    },
    execute: (context, input) => memory.write(context, input),
  });

  /* ---------------- Model gateway ---------------- */

  registry.register({
    name: "model.registry.read",
    permission: "ai:model.registry.read",
    classification: "INTERNAL",
    risk: "LOW",
    description: "Read the governed model registry (approved models and providers).",
    metadata: {
      stableId: "cap-model-registry-read",
      version: "1.0.0",
      ownerRole: "PLATFORM_ADMIN",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => models.registry(context),
  });

  /* ---------------- Noelia AI platform (schema 0023) ---------------- */

  registry.register({
    name: "ai.identity.read",
    permission: "ai:identity.read",
    classification: "INTERNAL",
    risk: "LOW",
    description: "Read the canonical BEYU AI identity registry (e.g. NOELIA).",
    metadata: {
      stableId: "cap-ai-identity-read",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.identity(context),
  });
  registry.register({
    name: "ai.providers.list",
    permission: "ai:provider.registry.read",
    classification: "INTERNAL",
    risk: "LOW",
    description: "List the governed AI provider registry; external providers always reported as optional/inactive unless activated.",
    metadata: {
      stableId: "cap-ai-providers-list",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.providers(context),
  });
  registry.register({
    name: "ai.evaluations.list",
    permission: "ai:evaluation.read",
    classification: "INTERNAL",
    risk: "LOW",
    description: "List governed model evaluation evidence (evidence, not certificates).",
    metadata: {
      stableId: "cap-ai-evaluations-list",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.evaluations(context),
  });
  registry.register({
    name: "ai.risk.register.list",
    permission: "ai:risk.register.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read the BEYU AI risk register.",
    metadata: {
      stableId: "cap-ai-risk-register-list",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.riskRegister(context),
  });
  registry.register({
    name: "ai.incidents.list",
    permission: "ai:incident.manage",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "List AI incidents visible in the requesting tenant scope.",
    metadata: {
      stableId: "cap-ai-incidents-list",
      version: "1.0.0",
      ownerRole: "AI_SECURITY_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.incidents(context),
  });
  registry.register({
    name: "ai.killswitch.list",
    permission: "ai:killswitch.manage",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "List active and historical kill switch records.",
    metadata: {
      stableId: "cap-ai-killswitch-list",
      version: "1.0.0",
      ownerRole: "AI_SECURITY_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.killSwitches(context),
  });
  registry.register({
    name: "ai.routing.decisions.list",
    permission: "ai:model.router.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Read non-sensitive model routing decision metadata within the requesting tenant scope.",
    metadata: {
      stableId: "cap-ai-routing-decisions-list",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      inputSchema: NOELIA_TOOL_ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context) => aiPlatform.routingDecisions(context),
  });
  registry.register({
    name: "ai.model.route",
    permission: "ai:model.registry.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description: "Deterministically route a capability to a governed model; fails closed when no approved model satisfies the context.",
    metadata: {
      stableId: "cap-ai-model-route",
      version: "1.0.0",
      ownerRole: "AI_GOVERNANCE_OFFICER",
      domain: "AI",
      sideEffects: "DOMAIN_WRITE",
      idempotent: false,
      timeoutMs: 10000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_ROUTING_DECISION" },
      inputSchema: z.object({
        task: z.string().min(2).max(200),
        capability: z.string().min(2).max(100),
        classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
        riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
        legalEntityId: z.string().nullable().optional(),
        countryCode: z.string().length(2).nullable().optional(),
        osId: z.string().nullable().optional(),
      }).strict(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => {
      const parsed = z.object({
        task: z.string().min(2).max(200),
        capability: z.string().min(2).max(100),
        classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]),
        riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
        legalEntityId: z.string().nullable().optional(),
        countryCode: z.string().length(2).nullable().optional(),
        osId: z.string().nullable().optional(),
      }).parse(input ?? {});
      return aiPlatform.routeOutput(context, {
        tenantId: context.target.tenantId,
        legalEntityId: parsed.legalEntityId ?? context.target.legalEntityId,
        countryCode: parsed.countryCode ?? context.target.countryCode,
        osId: parsed.osId ?? null,
        task: parsed.task,
        capability: parsed.capability,
        classification: parsed.classification,
        riskLevel: parsed.riskLevel,
      });
    },
  });

  /* ---------------- Cross-OS intelligence ---------------- */

  registry.register({
    name: "cross.os.intelligence",
    permission: "ai:analytics.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description: "Cross-OS aggregation; every domain independently authorized; cross-tenant DENY.",
    metadata: {
      stableId: "cap-cross-os-intelligence",
      version: "1.0.0",
      ownerRole: "GROUP_CEO",
      domain: "CROSS_OS",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 15000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" },
      outputSchema: noeliaToolOutputSchema,
      inputSchema: z.object({
        domains: z.array(z.enum([
          "FINANCE", "HCM", "HEALTH", "AGRICULTURE", "TAX", "LEGAL",
          "RISK", "COMPLIANCE", "GOVERNANCE", "FOUNDATION", "FAMILY_OFFICE", "TRUST",
        ])).min(2).max(10),
        focus: z.string().max(300).optional(),
      }).strict(),
    },
    execute: async (context, input) => {
      const { domains } = z.object({
        domains: z.array(z.enum([
          "FINANCE", "HCM", "HEALTH", "AGRICULTURE", "TAX", "LEGAL",
          "RISK", "COMPLIANCE", "GOVERNANCE", "FOUNDATION", "FAMILY_OFFICE", "TRUST",
        ])).min(2).max(10),
        focus: z.string().max(300).optional(),
      }).parse(input ?? {});
      // Each domain must be independently authorized: possessing one domain's
      // permission never implies another's. Domains without a registered
      // governed capability report UNAVAILABLE — never fabricated findings.
      const domainPermission: Record<string, string> = {
        FINANCE: "finance:treasury.read",
        HCM: "hcm:employee.read",
        HEALTH: "ai:noelia.query",
        RISK: "risk:register.read",
        COMPLIANCE: "compliance:obligation.read",
        GOVERNANCE: "governance:resolution.read",
        TAX: "finance:tax.read",
        LEGAL: "legal:matter.read",
      };
      const toolByDomain: Record<string, string> = {
        FINANCE: "finance.treasury.aggregate",
        HCM: "hcm.workforce.observe",
        HEALTH: "health.runtime.status",
        RISK: "risk.register.query",
        COMPLIANCE: "compliance.obligation.query",
        GOVERNANCE: "governance.resolution.query",
        TAX: "tax.knowledge.query",
        LEGAL: "legal.knowledge.query",
      };
      const findings: NoeliaFinding[] = [];
      const sources: NoeliaSource[] = [];
      const denied: string[] = [];
      const unavailable: string[] = [];
      for (const domain of domains) {
        const tool = toolByDomain[domain];
        if (!tool) {
          // No governed capability is registered for this domain in the
          // canonical registry; intelligence is UNAVAILABLE, never invented.
          unavailable.push(domain);
          findings.push({
            label: `${domain} intelligence`,
            value: "No governed capability registered; UNAVAILABLE.",
            kind: "INFERENCE",
            status: "UNAVAILABLE",
            provenance: "CROSS_OS:REGISTRY",
          });
          continue;
        }
        const permission = domainPermission[domain] as Parameters<typeof can>[1];
        const access = can(context.principal, permission);
        if (!access.allowed) {
          denied.push(`${domain}:${access.reason.split(":")[0]}`);
          continue;
        }
        const result = await registry.invoke(tool, context, {});
        if (!result.allowed) {
          denied.push(`${domain}:${result.decision.code}`);
          continue;
        }
        findings.push(...(result.output.findings ?? []).map((f) => ({ ...f, provenance: `${domain}:${f.provenance ?? "tool"}` })));
        sources.push(...(result.output.sources ?? []));
      }
      return {
        headline: denied.length || unavailable.length
          ? `Cross-OS view assembled with ${denied.length} domain(s) denied and ${unavailable.length} unavailable.`
          : "Cross-OS view assembled.",
        findings,
        sources,
        metadata: { domains, denied, unavailable },
        confidence: sources.length > 0 ? 0.8 : 0.4,
        humanReviewRequired: denied.length > 0,
      };
    },
  });

  return registry;
}
