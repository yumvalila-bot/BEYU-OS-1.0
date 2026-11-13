/**
 * BEYU OS — MULTI_COMPANY_MANAGEMENT API boundary.
 *
 * Every MCM route uses the canonical `guarded()` wrapper, so authentication,
 * authorization, rate limiting, idempotency, error envelopes and audit behave
 * exactly as they do everywhere else in BEYU OS. This module adds only three
 * things:
 *
 *   1. the zod input contracts;
 *   2. the mapping of expected `McmError` refusals onto the canonical error
 *      envelope (a governed refusal is not a 500);
 *   3. small parsers that keep query-string handling out of the route bodies.
 *
 * NOTHING HERE AUTHORIZES ANYTHING. Authorization remains `can()` inside
 * `guarded()` plus the service-layer re-checks.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, type ApplicationBoundaryError } from "@/lib/api";
import { McmError } from "@/lib/mcm/model";

/** A governed reason is at least 8 characters; the audit ledger depends on it. */
export const mcmReason = z.string().trim().min(8, "A governed reason of at least 8 characters is required.").max(2000);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use an ISO date (YYYY-MM-DD).");
const periodCode = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use a period code such as 2026-07.");
const currency = z.string().trim().length(3).transform((value) => value.toUpperCase());
const minorUnits = z.string().regex(/^\d+$/, "Money is an integer of minor units, expressed as a string.");

export const companyProfileSchema = z
  .object({
    legalEntityId: z.string().min(4).max(60),
    registeredOffice: z.string().trim().max(400).nullish(),
    registeredOfficeCountryCode: z.string().trim().length(2).nullish(),
    statutoryIdentifiers: z
      .array(
        z
          .object({
            scheme: z.string().trim().min(2).max(40),
            value: z.string().trim().min(1).max(80),
            issuer: z.string().trim().min(2).max(120),
            countryCode: z.string().trim().length(2),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    reportingCurrency: currency.optional(),
    reportingTimezone: z.string().trim().min(3).max(64),
    statutoryObligations: z.array(z.string().trim().min(2).max(160)).max(60).optional(),
    consolidated: z.boolean().optional(),
    consolidationMethod: z.enum(["FULL", "EQUITY", "PROPORTIONATE", "NONE"]).optional(),
    incorporationDocumentId: z.string().min(4).max(60).nullish(),
    pendingVerificationNote: z.string().trim().max(1000).nullish(),
    reason: mcmReason,
  })
  .strict();

export const verifyProfileSchema = z
  .object({
    legalEntityId: z.string().min(4).max(60),
    evidenceDocumentId: z.string().min(4).max(60),
    note: mcmReason,
  })
  .strict();

export const lifecycleSchema = z
  .object({
    legalEntityId: z.string().min(4).max(60),
    // Mirrors MCM_LIFECYCLE_TRANSITIONS in src/lib/mcm/model.ts exactly. The
    // service refuses an edge the machine does not contain, so the schema is a
    // convenience for the caller, never the control.
    toState: z.enum(["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "SUSPENDED", "DORMANT", "DISSOLVED", "ARCHIVED"]),
    effectiveDate: isoDate,
    reason: mcmReason,
    authorityRef: z.string().trim().max(200).nullish(),
    evidenceDocumentId: z.string().min(4).max(60).nullish(),
    approvalRef: z.string().trim().max(200).nullish(),
  })
  .strict();

export const relationshipSchema = z
  .object({
    subjectEntityId: z.string().min(4).max(60),
    objectEntityId: z.string().min(4).max(60),
    relationshipType: z.enum([
      "PARENT_SUBSIDIARY",
      "MANAGEMENT",
      "GOVERNANCE",
      "BRANCH",
      "OPERATIONAL_AFFILIATION",
      "SHARED_SERVICES",
      "AGENCY",
      "FRANCHISE",
    ]),
    instrumentRef: z.string().trim().max(200).nullish(),
    instrumentDocumentId: z.string().min(4).max(60).nullish(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullish(),
    scopeNote: mcmReason,
    provenance: z.string().trim().min(2).max(120),
    reason: mcmReason,
  })
  .strict();

export const endRelationshipSchema = z
  .object({ effectiveTo: isoDate, reason: mcmReason })
  .strict();

export const ownershipValidationSchema = z
  .object({ ownershipRecordId: z.string().min(4).max(60), reason: mcmReason })
  .strict();

export const intercompanyRaiseSchema = z
  .object({
    agreementId: z.string().min(4).max(60),
    reference: z.string().trim().min(3).max(60),
    transactionType: z.enum([
      "SERVICE_FEE",
      "COST_ALLOCATION",
      "MANAGEMENT_FEE",
      "INTERCOMPANY_LOAN",
      "LOAN_INTEREST",
      "ROYALTY",
      "GOODS_TRANSFER",
      "CAPITAL_CONTRIBUTION",
      "DIVIDEND",
      "EXPENSE_REIMBURSEMENT",
    ]),
    receivableEntityId: z.string().min(4).max(60),
    payableEntityId: z.string().min(4).max(60),
    periodCode,
    currency,
    amountMinor: minorUnits,
    counterpartyCurrency: currency.nullish(),
    counterpartyAmountMinor: minorUnits.nullish(),
    fxRateUsed: z.string().regex(/^\d+(\.\d+)?$/).nullish(),
    description: z.string().trim().min(8).max(1000),
    idempotencyKey: z.string().trim().min(8).max(120),
  })
  .strict();

export const intercompanyAuthorizeSchema = z
  .object({ side: z.enum(["RECEIVABLE", "PAYABLE"]), reason: mcmReason })
  .strict();

export const intercompanyReconcileSchema = z
  .object({ periodCode, currency, reason: mcmReason })
  .strict();

export const statutoryFilingSchema = z
  .object({
    legalEntityId: z.string().min(4).max(60),
    countryCode: z.string().trim().length(2),
    jurisdictionId: z.string().min(2).max(60).nullish(),
    authority: z.string().trim().min(2).max(120),
    filingCode: z.string().trim().min(2).max(60),
    title: z.string().trim().min(4).max(300),
    period: z.string().trim().min(4).max(40),
    dueOn: isoDate,
    status: z.enum(["PENDING", "IN_PROGRESS", "FILED", "ACKNOWLEDGED", "OVERDUE", "WAIVED", "REQUIRES_HUMAN_REVIEW"]),
    filingMode: z.enum(["MANUAL", "DOCUMENT_BASED", "VERIFIED_API"]),
    authorityReference: z.string().trim().max(200).nullish(),
    evidenceDocumentId: z.string().min(4).max(60).nullish(),
    complianceObligationId: z.string().min(4).max(60).nullish(),
    filedOn: isoDate.nullish(),
    note: z.string().trim().max(1000).nullish(),
  })
  .strict();

export const capitalProposalSchema = z
  .object({
    code: z.string().trim().min(3).max(40),
    title: z.string().trim().min(4).max(200),
    cycle: z.string().trim().regex(/^\d{4}(-[A-Z0-9]{2,10})?$/, "Use a cycle such as 2027 or 2027-H1."),
    beneficiaryEntityId: z.string().min(4).max(60),
    capitalRequestId: z.string().min(4).max(60).nullish(),
    currency,
    proposedAmountMinor: minorUnits,
    strategicPriority: z.string().trim().min(4).max(200),
    rationale: z.string().trim().min(20).max(4000),
  })
  .strict();

export const capitalDecisionSchema = z
  .object({
    status: z.enum(["APPROVED", "REJECTED", "DEFERRED"]),
    approvedAmountMinor: minorUnits.nullish(),
    decidingBodyId: z.string().min(4).max(60).nullish(),
    decisionResolutionRef: z.string().trim().max(200).nullish(),
    reason: mcmReason,
  })
  .strict();

export const moduleLinkSchema = z
  .object({
    legalEntityId: z.string().min(4).max(60),
    moduleType: z.enum([
      "LEGAL",
      "RISK",
      "COMPLIANCE",
      "INTERNAL_AUDIT",
      "DOCUMENTS",
      "CONTRACTS",
      "GOVERNANCE",
      "PERFORMANCE",
      "TREASURY",
      "WORKFORCE",
    ]),
    sourceTable: z.string().trim().min(3).max(80),
    sourceId: z.string().min(4).max(60),
    linkRole: z.enum(["GOVERNED_BY", "OWNED_BY", "SPONSORED_BY", "EVIDENCED_BY", "REPORTED_TO"]).optional(),
    note: z.string().trim().max(500).nullish(),
  })
  .strict();

export const countryProfileSchema = z
  .object({
    countryCode: z.string().trim().length(2),
    groupReportingCurrency: currency,
    localCurrency: currency,
    timezone: z.string().trim().min(3).max(64),
    languages: z.array(z.string().trim().min(2).max(40)).min(1).max(10),
    accountingFrameworks: z.array(z.string().trim().min(2).max(80)).max(10),
    incorporationAuthority: z.string().trim().max(160).nullish(),
    taxAuthority: z.string().trim().max(160).nullish(),
    socialSecurityAuthority: z.string().trim().max(160).nullish(),
    workersCompensationAuthority: z.string().trim().max(160).nullish(),
    filingModes: z
      .array(
        z
          .object({
            authority: z.string().trim().min(2).max(160),
            mode: z.enum(["MANUAL", "DOCUMENT_BASED", "VERIFIED_API"]),
            integrationCode: z.string().trim().max(80).optional(),
            note: z.string().trim().min(4).max(500),
          })
          .strict(),
      )
      .max(20),
    statutoryReports: z
      .array(
        z
          .object({
            code: z.string().trim().min(2).max(40),
            title: z.string().trim().min(2).max(200),
            authority: z.string().trim().min(2).max(160),
            frequency: z.string().trim().min(2).max(40),
          })
          .strict(),
      )
      .max(30),
    notes: z.string().trim().min(20).max(4000),
    effectiveFrom: isoDate,
  })
  .strict();

/**
 * Map an expected MCM refusal onto the canonical error envelope.
 *
 * Returns null for anything that is not an `McmError`, so genuine faults still
 * surface as 500s through the shared error boundary rather than being disguised
 * as governed refusals.
 */
export function mcmRefusal(
  err: unknown,
  traceId: string,
): NextResponse<ReturnType<typeof apiError> extends NextResponse<infer T> ? T : never> | null {
  if (err instanceof McmError) {
    return apiError(err.code, err.message, err.status, traceId, err.details);
  }
  if (err && typeof err === "object") {
    const boundary = err as ApplicationBoundaryError;
    if (boundary.code === "VALIDATION_FAILED") {
      return apiError(boundary.code, boundary.message, boundary.status, traceId, boundary.details);
    }
  }
  return null;
}

/** Read one required string query parameter, or throw a governed refusal. */
export function requireQuery(url: URL, key: string): string {
  const value = url.searchParams.get(key);
  if (!value || value.trim().length === 0) {
    throw new McmError("QUERY_PARAMETER_REQUIRED", `The query parameter "${key}" is required.`, 422);
  }
  return value.trim();
}

/** Read one optional string query parameter. */
export function optionalQuery(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
