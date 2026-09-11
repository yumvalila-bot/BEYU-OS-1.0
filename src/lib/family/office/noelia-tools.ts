/**
 * BEYU Family Office — HIVE tool registration (capital, wealth & generational).
 *
 * All Family Office tools are sideEffects NONE: Noelia may analyse, calculate,
 * summarise, simulate, recommend, alert and draft, but approve, transfer, execute,
 * change ownership, bypass governance and CAP_POSTING have NO tool path and remain
 * human-governed. The registry enforces RBAC/ABAC, tenant, entity, country and
 * classification checks before any handler runs; handlers additionally re-scope
 * every query.
 *
 * `familyoffice:committee.decide` is deliberately NOT bound to any tool. That permission
 * is a HIGH_RISK_PERMISSION requiring MFA step-up, and registering it here would
 * give an AI actor a route to a human-authority step.
 */
import { z } from "zod";
import type { NoeliaToolRegistry } from "@/lib/noelia/tool-registry";
import { noeliaToolOutputSchema } from "@/lib/noelia/default-tools";
import { BeyuNoeliaFamilyOfficeService } from "./noelia-service";

const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

/**
 * Simulator inputs. Every rate is required and caller-supplied: the engine holds
 * no default return, fee, tax or inflation assumption, because a hard-coded one
 * would be an unratified investment policy presented as a fact.
 */
const SIMULATE_SCHEMA = z
  .object({
    startingCapitalMinor: z.number().int().nonnegative(),
    monthlyContributionMinor: z.number().int().nonnegative(),
    annualReturnBps: z.number().int().min(0).max(5000),
    annualFeeBps: z.number().int().min(0).max(1000),
    annualTaxBps: z.number().int().min(0).max(3000),
    annualInflationBps: z.number().int().min(0).max(3000),
    years: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(50)]),
    currency: z.string().trim().regex(/^[A-Z]{3}$/),
  })
  .passthrough();

export function registerFamilyOfficeTools(
  registry: NoeliaToolRegistry,
  service = new BeyuNoeliaFamilyOfficeService(),
): void {
  const audit = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;

  registry.register({
    name: "family.capital.investments",
    permission: "familyoffice:investment.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description: "Summarise authorised family investment positions, measures and governance status.",
    metadata: {
      stableId: "cap-family-capital-investments",
      version: "1.0.0",
      ownerRole: "FAMILY_OFFICE_DIRECTOR",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.investments(context),
  });

  registry.register({
    name: "family.capital.obligations",
    permission: "familyoffice:obligation.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description: "Report the obligation register — who owes whom, terms, maturity and rate exposure.",
    metadata: {
      stableId: "cap-family-capital-obligations",
      version: "1.0.0",
      ownerRole: "FAMILY_OFFICE_DIRECTOR",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.obligations(context),
  });

  registry.register({
    name: "family.capital.committee",
    permission: "familyoffice:committee.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description:
      "Summarise the capital allocation pipeline and committee decisions, re-validating quorum and majority from the recorded votes.",
    metadata: {
      stableId: "cap-family-capital-committee",
      version: "1.0.0",
      ownerRole: "INVESTMENT_COMMITTEE_MEMBER",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.committee(context),
  });

  registry.register({
    name: "family.capital.intelligence",
    permission: "familyoffice:intelligence.read",
    classification: "RESTRICTED",
    risk: "LOW",
    description:
      "Summarise regulatory, market and tax intelligence, separating reviewed positions from unreviewed assumptions and estimates.",
    metadata: {
      stableId: "cap-family-capital-intelligence",
      version: "1.0.0",
      ownerRole: "FAMILY_ANALYST",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.intelligence(context),
  });

  registry.register({
    name: "family.capital.liquidity",
    permission: "familyoffice:liquidity.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description: "Report the latest stored family liquidity projection, coverage and runway.",
    metadata: {
      stableId: "cap-family-capital-liquidity",
      version: "1.0.0",
      ownerRole: "TREASURY_OFFICER",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.liquidity(context),
  });

  /**
   * The one tool that computes rather than reads. It runs the pure projection
   * engine and persists nothing: the output is a labelled SCENARIO a human must
   * take through a governed path if it is ever to inform a decision.
   */
  registry.register({
    name: "family.capital.simulate",
    permission: "familyoffice:scenario.simulate",
    classification: "RESTRICTED",
    risk: "LOW",
    description:
      "Run a capital projection over 5/10/20/30/50 years from caller-supplied assumptions. Writes nothing; never guarantees an outcome.",
    metadata: {
      stableId: "cap-family-capital-simulate",
      version: "1.0.0",
      ownerRole: "FAMILY_ANALYST",
      domain: "FAMILY_OFFICE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 8000,
      retryPolicy: { maxRetries: 0, backoffMs: 0 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: audit,
      inputSchema: SIMULATE_SCHEMA,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: (context, input) => service.simulate(context, SIMULATE_SCHEMA.parse(input ?? {})),
  });
  /* ---- Protection & insurance: READ/SUMMARIZE ONLY (§27).             */
  /* No bind, cancel, beneficiary-change, claim-approval or transfer tool */
  /* exists, is registered, or can be derived from these two: Noelia      */
  /* prepares review packages and reports what the register says; the    */
  /* consequential acts stay on governed human routes with their own      */
  /* permissions (beneficiary.manage additionally requires MFA step-up).  */

  registry.register({
    name: "family.protection.policies",
    permission: "familyoffice:protection.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description: "Summarise the family's life-insurance protection book: counts, per-currency contingent death-benefit totals, review dates. Contingent protection is never merged into wealth.",
    metadata: {
      stableId: "cap-family-protection-policies",
      version: "1.0.0",
      ownerRole: "FAMILY_OFFICE_DIRECTOR",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.protectionPolicies(context),
  });

  registry.register({
    name: "family.protection.review-package",
    permission: "familyoffice:protection.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description: "Prepare the protection review package: list missing documents, review dates, payer records and incomplete ownership for in-scope policies. Reports gaps; never fills them.",
    metadata: {
      stableId: "cap-family-protection-review-package",
      version: "1.0.0",
      ownerRole: "FAMILY_OFFICE_DIRECTOR",
      domain: "FAMILY_OFFICE",
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
    execute: (context) => service.protectionReviewPackage(context),
  });
}
