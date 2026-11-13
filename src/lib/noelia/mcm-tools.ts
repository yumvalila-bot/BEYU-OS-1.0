/**
 * Multi-Company Management (MCM) — Noelia read-only tools.
 *
 * These expose the ALREADY-GOVERNED MCM read services to NOELIA. They are
 * adapters, not a second implementation: every tool delegates to
 * `src/lib/mcm/read-services.ts`, whose `visibleEntities()` is the single place
 * the entity boundary is decided and whose per-capability `can(...)` checks
 * decide what may be summarised. Nothing here re-derives scope, clearance,
 * tenant, entity or classification, and nothing here can widen it.
 *
 * WHY READ-ONLY
 *   The MCM capability is deliberately asymmetric. Creating a company, moving its
 *   lifecycle state, validating ownership, submitting a statutory filing,
 *   reconciling intercompany, running or finalising a consolidation, proposing or
 *   approving capital, raising a purchase order, capitalising an asset and
 *   moving a project are all governed actions on their own routes with their own
 *   approvals. NOELIA may SUMMARISE a recorded position; it may never perform
 *   any of them. There is no tool path for any of them, and
 *   `sideEffects: "NONE"` on every tool below is the machine-checkable statement
 *   of that — the registry records it, the contract test asserts it.
 *
 * EPISTEMICS
 *   Every figure keeps the data state the service assigned it (ACTUAL /
 *   RESTRICTED / UNAVAILABLE / …). A RESTRICTED figure is reported as "you lack
 *   the source capability", never as zero. A UNAVAILABLE figure is reported as
 *   "no recorded row", never as a zero balance. An entity with no MCM profile is
 *   "not yet profiled", never "no facts". Where the capability genuinely stops —
 *   no governed FX rate can be recorded yet, and no parent-investment or
 *   unrealised-profit elimination is computed — the answer says so instead of
 *   implying a finished consolidation.
 */
import { z } from "zod";
import type { NoeliaToolRegistry } from "./tool-registry";
import { noeliaToolOutputSchema } from "./default-tools";
import type { NoeliaFinding, NoeliaMetricView, ToolInvocationContext } from "./types";
import { hasDatabaseTransactionContext } from "@/db";
import { can } from "@/lib/authz";
import {
  buildHierarchy,
  consolidationOverview,
  countryViews,
  entityFinancialSnapshots,
  governanceOverview,
  integrationHealth,
  intercompanyOverview,
  moduleRollup,
  ownershipOverview,
  riskComplianceOverview,
  visibleEntities,
  type VisibleEntity,
} from "@/lib/mcm/read-services";
import type { McmFigure } from "@/lib/mcm/model";

function requireContext() {
  if (!hasDatabaseTransactionContext()) {
    throw new Error("Noelia MCM tools require canonical tenant context");
  }
}

/** Every MCM tool accepts an optional natural-language envelope. */
const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

/** Optional narrowing to ONE legal entity by its registry code. */
const ENTITY_QUERY = z
  .object({
    entityCode: z.string().min(1).optional(),
    period: z.string().optional(),
    question: z.string().optional(),
  })
  .passthrough()
  .optional();

const AUDIT = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;

/** A finding that states a boundary is a FACT about the answer, not a gap. */
function boundary(label: string, reason: string, provenance: string | null = null): NoeliaFinding {
  return { label, value: reason, kind: "FACT", status: "UNAVAILABLE", provenance };
}

function metric(
  label: string,
  value: string,
  code: string,
  source: string,
): NoeliaMetricView {
  return { code, label, value, status: "OBSERVED", confidence: null, source, period: null, trend: "UNKNOWN" };
}

/** Render a governed figure without ever turning "cannot see" into "zero". */
function figureValue(figure: McmFigure): string {
  if (figure.dataState === "ACTUAL" && figure.amountMinor !== null) {
    return `${figure.currency ?? ""} ${figure.amountMinor}`.trim();
  }
  return figure.reason ?? figure.dataState;
}

function figureFinding(label: string, figure: McmFigure, code: string): NoeliaFinding {
  return {
    label,
    value: figureValue(figure),
    kind: "FACT",
    status: figure.dataState === "ACTUAL" ? "OBSERVED" : "UNAVAILABLE",
    metricCode: code,
    provenance: figure.source,
  };
}

async function scopeFor(context: ToolInvocationContext, input: unknown) {
  const all = await visibleEntities(context.principal);
  const parsed = (ENTITY_QUERY.parse(input ?? {}) ?? {}) as { entityCode?: string };
  const selected = parsed.entityCode ? all.filter((entity) => entity.code === parsed.entityCode) : all;
  return { all, selected, entityCode: parsed.entityCode ?? null };
}

/** The one "nothing in scope" answer, so every tool explains itself identically. */
function nothingInScope(all: VisibleEntity[], entityCode: string | null) {
  return {
    headline: "No company is in your scope",
    findings: [
      boundary(
        "Scope",
        all.length === 0
          ? "No legal entity is visible to this principal's tenant, entity and classification scope."
          : `The entity code "${entityCode}" is not in your visible scope.`,
      ),
    ],
    confidence: 1,
    humanReviewRequired: false,
  };
}

export function registerMcmTools(registry: NoeliaToolRegistry): void {
  /* ------------------------------------------------------------------ */
  /* Portfolio                                                          */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.portfolio.hierarchy",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Summarise the corporate hierarchy the caller may see: companies by level, country and lifecycle state, with a parent outside scope marked rather than hidden. Read-only.",
    metadata: {
      stableId: "cap-mcm-portfolio-hierarchy",
      version: "1.0.0",
      ownerRole: "GROUP_CEO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENTITY_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all, selected, entityCode } = await scopeFor(context, input);
      if (selected.length === 0) return nothingInScope(all, entityCode);

      const roots = buildHierarchy(selected);
      const findings: NoeliaFinding[] = [];
      const walk = (nodes: typeof roots, depth: number) => {
        for (const node of nodes) {
          findings.push({
            label: `${"—".repeat(depth)}${depth > 0 ? " " : ""}${node.code} · ${node.legalName}`,
            value: [
              node.entityType,
              node.countryCode,
              node.status,
              node.profile?.mcmLifecycleState ?? "NOT PROFILED",
            ].join(" · "),
            kind: "FACT",
            status: node.parentOutsideScope ? "UNVERIFIED" : "OBSERVED",
            provenance: node.profile ? `mcm_company_profiles:${node.profile.id}` : "legal_entities",
          });
          walk(node.children, depth + 1);
        }
      };
      walk(roots, 0);

      const byCountry = new Set(selected.map((entity) => entity.countryCode));
      const unprofiled = selected.filter((entity) => entity.profile === null).length;
      const outOfScopeParents = findings.filter((finding) => finding.status === "UNVERIFIED").length;

      return {
        headline: `${selected.length} ${selected.length === 1 ? "company" : "companies"} in scope · ${roots.length} at root level`,
        findings,
        metrics: [
          metric("Companies in scope", String(selected.length), "MCM_ENTITIES_VISIBLE", "legal_entities"),
          metric("Countries", String(byCountry.size), "MCM_COUNTRIES_VISIBLE", "legal_entities"),
          metric("Awaiting an MCM profile", String(unprofiled), "MCM_ENTITIES_UNPROFILED", "mcm_company_profiles"),
        ],
        narrative:
          "The hierarchy comes from the registry's recorded parent entity." +
          (outOfScopeParents > 0
            ? ` ${outOfScopeParents} node(s) have a canonical parent that exists but is outside your scope — that is not the same as having no parent.`
            : "") +
          (unprofiled > 0
            ? ` ${unprofiled} ${unprofiled === 1 ? "company has" : "companies have"} no MCM profile yet: not yet profiled, never "no facts".`
            : ""),
        confidence: 1,
        humanReviewRequired: false,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Financial posture                                                  */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.company.financial_snapshot",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report each company's recorded treasury, approved capital and headcount, each figure carrying its own data state. Read-only; posts nothing and approves nothing.",
    metadata: {
      stableId: "cap-mcm-company-financial-snapshot",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENTITY_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all, selected, entityCode } = await scopeFor(context, input);
      if (selected.length === 0) return nothingInScope(all, entityCode);

      const parsed = (ENTITY_QUERY.parse(input ?? {}) ?? {}) as { period?: string };
      const snapshots = await entityFinancialSnapshots(context.principal, selected, parsed.period ?? null);
      const findings: NoeliaFinding[] = [];
      for (const snapshot of snapshots) {
        findings.push(figureFinding(`${snapshot.entityCode} · Treasury`, snapshot.treasury, "MCM_TREASURY"));
        findings.push(
          figureFinding(`${snapshot.entityCode} · Capital requested`, snapshot.capitalRequested, "MCM_CAPITAL_REQUESTED"),
        );
        findings.push(
          figureFinding(`${snapshot.entityCode} · Capital approved`, snapshot.capitalApproved, "MCM_CAPITAL_APPROVED"),
        );
        if (snapshot.treasuryAsOf) {
          findings.push({
            label: `${snapshot.entityCode} · Treasury as of`,
            value: snapshot.treasuryAsOf,
            kind: "FACT",
            status: "OBSERVED",
            provenance: "treasury_positions",
          });
        }
        findings.push({
          label: `${snapshot.entityCode} · Headcount`,
          value: snapshot.employeeCount === null ? "UNAVAILABLE (requires hcm:employee.read)" : String(snapshot.employeeCount),
          kind: "FACT",
          status: snapshot.employeeCount === null ? "UNAVAILABLE" : "OBSERVED",
          metricCode: "MCM_HEADCOUNT",
          provenance: "employees",
        });
      }

      const restricted = findings.filter((finding) => finding.status === "UNAVAILABLE");
      return {
        headline: `Financial posture for ${snapshots.length} ${snapshots.length === 1 ? "company" : "companies"}`,
        findings,
        narrative:
          restricted.length > 0
            ? `${restricted.length} figure(s) are not visible to you. Each states why: a missing capability or an unrecorded period. Neither means zero. MCM owns none of these numbers — they are Finance OS and HCM figures, sourced and dated by those systems.`
            : "Every figure is an ACTUAL recorded row. MCM owns none of these numbers — they are Finance OS and HCM figures.",
        confidence: 1,
        humanReviewRequired: false,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Intercompany                                                       */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.intercompany.position",
    permission: "mcm:intercompany.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report recorded intercompany transactions and their authorization/reconciliation state between companies in scope. Read-only; reconciles nothing and posts nothing.",
    metadata: {
      stableId: "cap-mcm-intercompany-position",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      const overview = await intercompanyOverview(context.principal, all);
      if (overview.restrictedReason) {
        return {
          headline: "Intercompany position is restricted",
          findings: [boundary("Capability", overview.restrictedReason)],
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      const unauthorized = overview.transactions.filter(
        (transaction) => !transaction.receivableAuthorized || !transaction.payableAuthorized,
      );
      const differing = overview.transactions.filter(
        (transaction) => transaction.reconciliationDifferenceMinor !== null,
      );
      return {
        headline:
          overview.transactions.length === 0
            ? "No intercompany transaction is recorded between companies in scope"
            : `${overview.transactions.length} intercompany transaction(s) · ${overview.agreements} agreement(s)`,
        findings: overview.transactions.map((transaction) => ({
          label: `${transaction.reference} · ${transaction.receivableEntityCode} → ${transaction.payableEntityCode}`,
          value: `${transaction.currency} ${transaction.amountMinor} · ${transaction.periodCode} · ${
            transaction.reconciliationDifferenceMinor === null
              ? "no recorded difference"
              : `difference ${transaction.reconciliationDifferenceMinor}`
          }`,
          kind: "FACT" as const,
          status: transaction.receivableAuthorized && transaction.payableAuthorized ? "OBSERVED" : "UNVERIFIED",
          provenance: `intercompany_transactions:${transaction.id}`,
        })),
        metrics: [
          metric("Agreements", String(overview.agreements), "MCM_IC_AGREEMENTS", "intercompany_agreements"),
          metric("Awaiting authorization", String(unauthorized.length), "MCM_IC_UNAUTHORIZED", "intercompany_transactions"),
          metric("Recorded differences", String(differing.length), "MCM_IC_DIFFERENCES", "intercompany_transactions"),
        ],
        narrative:
          unauthorized.length > 0
            ? `${unauthorized.length} transaction(s) are not authorized on both legs. Reconciliation and authorization are governed finance actions with their own approvals; NOELIA reports the state and never performs them.`
            : "Every recorded transaction is authorized on both legs.",
        confidence: 1,
        humanReviewRequired: unauthorized.length > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Consolidation                                                      */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.consolidation.status",
    permission: "mcm:consolidation.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report recorded consolidation runs and the entities each covered. Read-only; runs no consolidation and finalises nothing.",
    metadata: {
      stableId: "cap-mcm-consolidation-status",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      const overview = await consolidationOverview(context.principal);
      if (overview.restrictedReason) {
        return {
          headline: "Consolidation status is restricted",
          findings: [boundary("Capability", overview.restrictedReason)],
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      if (overview.runs.length === 0) {
        return {
          headline: "No consolidation run is recorded",
          findings: [
            boundary(
              "Consolidation engine",
              "No run exists. Consolidation runs only when a named preparer calls for it and an independent reviewer reviews it — nothing computes it on a schedule — so an absent run means it has not been performed for these entities and this period, never that the group is consolidated. Treat any consolidated figure as unproduced.",
            ),
          ],
          narrative: `${all.length} ${all.length === 1 ? "company is" : "companies are"} visible to you; that is a scope statement, not a consolidation scope.`,
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      const entitiesWithoutFigures = overview.runs.filter((run) => run.entitiesIncluded === 0).length;
      return {
        headline: `${overview.runs.length} consolidation run(s) recorded`,
        findings: [
          ...overview.runs.map((run): NoeliaFinding => ({
            label: `Run ${run.periodCode} · ${run.state}`,
            value: `${run.entitiesIncluded} entities · ${run.dataState}${run.reviewedByUserId ? " · reviewed" : " · NOT reviewed"}`,
            kind: "FACT" as const,
            status: run.state === "REVIEWED" || run.reviewedByUserId ? "OBSERVED" : "REQUIRES_HUMAN_REVIEW",
            provenance: `mcm_consolidation_runs:${run.id}`,
          })),
          // A run whose totals are populated is still not a filed consolidation, and
          // an assistant that reads one as complete is the failure mode this tool
          // exists to prevent. The limits are stated rather than left to be inferred.
          {
            label: "Structural limits",
            value:
              "no investment-against-equity elimination, no intra-group unrealised-profit elimination, and no posting to the ledger — prepared figures only",
            kind: "FACT" as const,
            status: "REQUIRES_HUMAN_REVIEW" as const,
            provenance: "mcm:consolidation.limitations",
          },
        ],
        narrative:
          "A recorded run is evidence that consolidation was prepared. Finalising it remains a governed finance decision; a run that has not been reviewed is marked as such." +
          (entitiesWithoutFigures > 0
            ? ` ${entitiesWithoutFigures} run(s) consolidated no entities because their balances were unavailable; a run with no consolidated figures is not a nil consolidation, and its totals are not zero.`
            : ""),
        confidence: 1,
        humanReviewRequired: true,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Risk & compliance                                                  */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.risk_and_compliance.overview",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Summarise open risks, compliance obligations and statutory filings across companies in scope, naming the source capability of each section. Read-only.",
    metadata: {
      stableId: "cap-mcm-risk-compliance-overview",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENTITY_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all, selected, entityCode } = await scopeFor(context, input);
      if (selected.length === 0) return nothingInScope(all, entityCode);
      const overview = await riskComplianceOverview(context.principal, selected);
      const findings: NoeliaFinding[] = [];

      if (overview.risks === null) findings.push(boundary("Risks", "Requires risk:register.read."));
      else {
        findings.push({
          label: "Risks open",
          value: `${overview.risks.open} open of ${overview.risks.total} · ${overview.risks.aboveAppetite} above appetite`,
          kind: "FACT",
          status: "OBSERVED",
          provenance: "risks",
        });
        for (const [category, count] of Object.entries(overview.risks.byCategory)) {
          findings.push({ label: `Risk · ${category}`, value: String(count), kind: "FACT", status: "OBSERVED", provenance: "risks" });
        }
      }

      if (overview.obligations === null) findings.push(boundary("Obligations", "Requires compliance:obligation.read."));
      else {
        findings.push({
          label: "Obligations",
          value: `${overview.obligations.total} total · ${overview.obligations.dueSoon} due soon · ${overview.obligations.overdue} overdue`,
          kind: "FACT",
          status: "OBSERVED",
          provenance: "compliance_obligations",
        });
        for (const [framework, count] of Object.entries(overview.obligations.byFramework)) {
          findings.push({
            label: `Obligation · ${framework}`,
            value: String(count),
            kind: "FACT",
            status: "OBSERVED",
            provenance: "compliance_obligations",
          });
        }
      }

      if (overview.filings === null) findings.push(boundary("Filings", "Requires mcm:filing.manage."));
      else {
        findings.push({
          label: "Statutory filings",
          value: `${overview.filings.total} total · ${overview.filings.pending} pending · ${overview.filings.overdue} overdue`,
          kind: "FACT",
          status: "OBSERVED",
          provenance: "mcm_statutory_filings",
        });
      }

      const restricted = findings.filter((finding) => finding.status === "UNAVAILABLE");
      return {
        headline: `Risk & compliance across ${selected.length} ${selected.length === 1 ? "company" : "companies"}`,
        findings,
        narrative:
          restricted.length > 0
            ? `${restricted.length} section(s) are outside your capability. That is a permission boundary, not an absence of risk or obligation — do not read a blank section as "clear".`
            : overview.restrictedReason ??
              "Every section is sourced and named. An obligation count is a recorded fact, not a legal opinion.",
        confidence: 1,
        humanReviewRequired: restricted.length > 0 || (overview.obligations?.overdue ?? 0) > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Ownership                                                          */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.ownership.structure",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report recorded ownership relationships and their validation state between companies in scope. Read-only; validates no ownership and changes no register.",
    metadata: {
      stableId: "cap-mcm-ownership-structure",
      version: "1.0.0",
      ownerRole: "GROUP_CEO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 12000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      // `ownershipOverview` answers with an EMPTY set both when nothing is
      // recorded and when the caller lacks `organization:ownership.read`, and
      // its shape carries no restrictedReason. The tool therefore states the
      // boundary itself, so "no records" is never reported about a company the
      // caller cannot see that section for.
      const ownershipRead = can(context.principal, "organization:ownership.read").allowed;
      if (!ownershipRead) {
        return {
          headline: "Ownership structure is restricted",
          findings: [boundary("Capability", "Requires organization:ownership.read.")],
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      const overview = await ownershipOverview(context.principal, all);
      const validated = Object.values(overview.validationSummary).reduce((sum, count) => sum + count, 0);
      const unvalidated = overview.records.filter(
        (record) => record.latestValidation === null || record.latestValidation !== "VALIDATED",
      );
      const undocumented = overview.records.filter((record) => !record.hasSupportingDocument);
      const findings: NoeliaFinding[] = [];
      for (const record of overview.records) {
        findings.push({
          label: `${record.ownerEntityCode ?? record.ownerPartyId ?? "OWNER UNRECORDED"} → ${record.ownedEntityCode}`,
          value: `${record.economicPct}% economic · ${record.votingPct}% voting · ${record.instrument}`,
          kind: "FACT",
          status: record.latestValidation === "VALIDATED" ? "OBSERVED" : "UNVERIFIED",
          provenance: `ownership_records:${record.id}`,
        });
      }
      for (const code of overview.entitiesWithNoOwnerRecorded) {
        findings.push({
          label: `${code} · no owner recorded`,
          value: "No ownership record covers this company in your scope. That is an absent record, not a certified parentless company.",
          kind: "FACT",
          status: "UNAVAILABLE",
          provenance: null,
        });
      }
      return {
        headline:
          overview.records.length === 0
            ? "No ownership relationship is recorded between companies in scope"
            : `${overview.records.length} ownership relationship(s) recorded`,
        findings,
        metrics: [
          metric("Relationships", String(overview.records.length), "MCM_OWNERSHIP_RECORDS", "ownership_records"),
          metric("Validation events", String(validated), "MCM_OWNERSHIP_VALIDATIONS", "ownership_validations"),
          metric("Not validated", String(unvalidated.length), "MCM_OWNERSHIP_UNVALIDATED", "ownership_records"),
          metric("Without supporting document", String(undocumented.length), "MCM_OWNERSHIP_UNDOCUMENTED", "ownership_records"),
        ],
        narrative:
          (unvalidated.length > 0
            ? `${unvalidated.length} relationship(s) carry no VALIDATED decision. `
            : "") +
          (undocumented.length > 0 ? `${undocumented.length} have no supporting document on file. ` : "") +
          "Validation is a governed action; NOELIA reports the recorded state and never validates.",
        confidence: 1,
        humanReviewRequired: unvalidated.length > 0 || undocumented.length > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Jurisdictions                                                      */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.jurisdiction.coverage",
    permission: "mcm:country.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report the countries in which the caller's companies operate, with each recorded jurisdiction configuration and any country that has none. Read-only.",
    metadata: {
      stableId: "cap-mcm-jurisdiction-coverage",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      if (all.length === 0) return nothingInScope(all, null);
      const views = await countryViews(all);
      const configured = new Set(views.filter((view) => view.configuration !== null).map((view) => view.countryCode));
      const unconfigured = views.filter((view) => view.configuration === null).map((view) => view.countryCode);
      return {
        headline: `${views.length} ${views.length === 1 ? "country" : "countries"} in scope · ${configured.size} configured`,
        findings: views.map((view) => ({
          label: `${view.countryCode} · ${view.countryName}`,
          value: `${view.entities} ${view.entities === 1 ? "company" : "companies"} (${view.activeEntities} active)${
            view.region ? ` · ${view.region}` : ""
          }`,
          kind: "FACT" as const,
          status: view.configuration ? "OBSERVED" : "UNAVAILABLE",
          provenance: view.configuration
            ? `mcm_country_profiles:${view.countryCode}:v${view.configuration.version}`
            : "legal_entities",
        })),
        narrative:
          unconfigured.length > 0
            ? `${unconfigured.length} country code(s) have no ACTIVE jurisdiction configuration. That is a configuration gap, not a compliance conclusion: the statutory obligations for ${unconfigured.join(", ")} are unknown to this capability.`
            : "Every country in scope carries an ACTIVE jurisdiction configuration.",
        confidence: 1,
        humanReviewRequired: unconfigured.length > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Module rollup                                                      */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.module_rollup",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Roll up procurement, asset, project and capital-allocation records per module across companies in scope, marking each module outside your capability. Read-only.",
    metadata: {
      stableId: "cap-mcm-module-rollup",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 15000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENTITY_QUERY,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all, selected, entityCode } = await scopeFor(context, input);
      if (selected.length === 0) return nothingInScope(all, entityCode);
      const rollup = await moduleRollup(context.principal, selected);

      const findings: NoeliaFinding[] = [];
      const add = (label: string, value: string | null, permission: string, provenance: string) => {
        findings.push(
          value === null
            ? boundary(label, `Requires ${permission}.`)
            : { label, value, kind: "FACT", status: "OBSERVED", provenance },
        );
      };
      add(
        "Procurement",
        rollup.procurement ? `${rollup.procurement.records} record(s)` : null,
        "mcm:procurement.read",
        "purchase_orders",
      );
      add("Assets", rollup.assets ? `${rollup.assets.records} record(s)` : null, "mcm:asset.read", "fixed_assets");
      add("Projects", rollup.projects ? `${rollup.projects.records} record(s)` : null, "mcm:project.read", "projects");
      add(
        "Capital allocations",
        rollup.capitalAllocations ? `${rollup.capitalAllocations.records} record(s)` : null,
        "mcm:capital.read",
        "capital_allocations",
      );

      const restricted = findings.filter((finding) => finding.status === "UNAVAILABLE").length;
      return {
        headline: `Module rollup across ${selected.length} ${selected.length === 1 ? "company" : "companies"}`,
        findings,
        narrative:
          rollup.restrictedReason ??
          (restricted > 0
            ? `${restricted} module(s) are outside your capability. A record count is not an approval, a valuation or a commitment.`
            : "Counts are recorded rows. A record count is not an approval, a valuation or a commitment."),
        confidence: 1,
        humanReviewRequired: restricted > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Governance                                                         */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.governance.overview",
    permission: "mcm:company.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report the governance bodies recorded against companies in scope, with entities that have none. Read-only; appoints nobody and decides nothing.",
    metadata: {
      stableId: "cap-mcm-governance-overview",
      version: "1.0.0",
      ownerRole: "CHIEF_GOVERNANCE_OFFICER",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      // `governanceOverview` returns `appointments: null` for BOTH "no bodies"
      // and "no capability", so the tool checks the capability it is reporting
      // on and says which of the two it is.
      if (!can(context.principal, "governance:body.read").allowed) {
        return {
          headline: "Governance overview is restricted",
          findings: [boundary("Capability", "Requires governance:body.read.")],
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      const overview = await governanceOverview(context.principal, all);
      const findings: NoeliaFinding[] = overview.bodies.map((body) => ({
        label: `${body.code} · ${body.name}`,
        value: `${body.bodyType} · ${body.status} · quorum ${body.quorumMinimum} · ${body.majorityRule}`,
        kind: "FACT" as const,
        status: "OBSERVED",
        provenance: `governance_bodies:${body.id}`,
      }));
      for (const code of overview.entitiesWithoutBody) {
        findings.push({
          label: `${code} · no governing body`,
          value: "No governance body is recorded against this company. An absent record is a gap to close, never a finding that governance is adequate.",
          kind: "FACT",
          status: "UNAVAILABLE",
          provenance: null,
        });
      }
      return {
        headline:
          overview.bodies.length === 0
            ? "No governance body is recorded against companies in scope"
            : `${overview.bodies.length} governance ${overview.bodies.length === 1 ? "body" : "bodies"} recorded`,
        findings,
        narrative:
          overview.entitiesWithoutBody.length > 0
            ? `${overview.entitiesWithoutBody.length} ${overview.entitiesWithoutBody.length === 1 ? "company has" : "companies have"} no recorded governing body. Appointment, activation and removal remain governed actions on their own routes.`
            : "Every company in scope carries a recorded governance body. Appointment and removal remain governed actions.",
        confidence: 1,
        humanReviewRequired: overview.entitiesWithoutBody.length > 0,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Integration health                                                 */
  /* ------------------------------------------------------------------ */
  registry.register({
    name: "mcm.integration.health",
    permission: "mcm:integration.read",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Report the recorded state of MCM cross-module data contracts: which are wired, which are dormant and why. Read-only.",
    metadata: {
      stableId: "cap-mcm-integration-health",
      version: "1.0.0",
      ownerRole: "PLATFORM_ADMIN",
      domain: "MULTI_COMPANY",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      // Integration health is a TENANT-level property of the contracts
      // themselves; it is not derived from any entity, so there is no entity
      // narrowing to honour and claiming "SCOPED" here would be a lie.
      entityRestrictions: "NONE",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context, input) => {
      requireContext();
      const { all } = await scopeFor(context, input);
      const health = await integrationHealth(context.principal);
      if (health.restrictedReason) {
        return {
          headline: "Integration health is restricted",
          findings: [boundary("Capability", health.restrictedReason)],
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      const wired = health.contracts.filter((contract) => contract.state === "WIRED").length;
      if (health.contracts.length === 0) {
        return {
          headline: "No cross-module data contract is declared for this tenant",
          findings: [
            boundary(
              "Integration contracts",
              "No MCM integration contract is registered. That is NOT a clean bill of health: it means the modules have no declared feed to be healthy or unhealthy about.",
            ),
          ],
          narrative: `${all.length} ${all.length === 1 ? "company is" : "companies are"} in scope.`,
          confidence: 1,
          humanReviewRequired: true,
        };
      }
      return {
        headline: `${wired} of ${health.contracts.length} module contract(s) wired`,
        findings: health.contracts.map((contract) => ({
          label: `${contract.code} · ${contract.counterpartSystem}`,
          value:
            contract.state === "WIRED"
              ? `${contract.dataSet} from ${contract.dataOwner} · ceiling ${contract.classificationCeiling}`
              : contract.note || contract.lastFailureReason || `No canonical source for ${contract.dataSet}`,
          kind: "FACT" as const,
          status: contract.state === "WIRED" ? "OBSERVED" : "UNAVAILABLE",
          provenance: `mcm_integration_contracts:${contract.code}`,
        })),
        narrative: `${all.length} ${all.length === 1 ? "company is" : "companies are"} in scope. A DORMANT contract means the module is not yet wired to a canonical source — never that the module has no data.`,
        confidence: 1,
        humanReviewRequired: wired < health.contracts.length,
      };
    },
  });
}
