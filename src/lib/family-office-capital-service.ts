/**
 * BEYU OS — Family Office CAPITAL & WEALTH API service.
 *
 * The thin governed boundary between the HTTP routes under
 * `/api/v1/family-office/*` and the pure engine in
 * `src/lib/family/office/capital-wealth/*`.
 *
 * Responsibilities, and only these:
 *   1. Read rows inside the caller's tenant scope (`tenantScopeIds`).
 *   2. Convert between the `numeric` string form PostgreSQL returns and the
 *      integer minor units the engine requires — the one place that conversion
 *      happens, so no route does it by hand.
 *   3. Validate through the engine before a write, and refuse the write when the
 *      engine returns findings.
 *   4. Append to the audit ledger in the same transaction as the write.
 *
 * It contains no financial arithmetic, no thresholds and no policy. All of that
 * is in the engine, where it is tested.
 *
 * BOUNDARY: nothing here posts, accrues, journals or reconciles. Every write
 * stamps `authoritativeOwner = 'FINANCE_OS'` (§32), and the engine refuses any
 * record that would claim to be posted truth.
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction } from "@/lib/audit";
import { assertWithinScope } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import {
  AUTHORITATIVE_ACCOUNTING_OWNER,
  consolidateCashFlow,
  buildFamilyBalanceSheet,
  projectLiquidity,
  raiseLiquidityAlerts,
  measureInvestment,
  summarisePortfolio,
  measureDebtBook,
  stressDebtBook,
  profileDebtExposure,
  summariseObligationRegister,
  validateObligation,
  validateInvestment,
  assertThesisIsComplete,
  measureProperty,
  validatePreInvestmentEntry,
  validatePostInvestmentReview,
  validateCommitteeDecision,
  validateRegulatoryEvent,
  validateTaxPosition,
  type CapitalEpistemicClass,
  type FamilyInvestment,
  type FamilyObligation,
  type FamilyProperty,
  type CashFlowItem,
  type BalanceSheetLine,
  type ContingentLiability,
  type ExpectedFlow,
  type RedLineLadder,
} from "@/lib/family/office/capital-wealth";

export const FAMILY_OFFICE_CAPITAL_SERVICE_VERSION = "family-office-capital-service-1.0.0";

export type FamilyOfficeActor = {
  tenantId: string;
  userId: string;
  traceId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export class FamilyOfficeCapitalError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "SCOPE" | "VALIDATION" | "GOVERNANCE",
    message: string,
    readonly findings: readonly string[] = [],
  ) {
    super(message);
    this.name = "FamilyOfficeCapitalError";
  }
}

export const FAMILY_OFFICE_ERROR_STATUS: Record<FamilyOfficeCapitalError["code"], number> = {
  NOT_FOUND: 404,
  SCOPE: 403,
  VALIDATION: 422,
  GOVERNANCE: 409,
};

/* ------------------------------------------------------------------ */
/* Money conversion — the ONLY place this happens                       */
/* ------------------------------------------------------------------ */

/**
 * Convert a `numeric(18,2)` string from PostgreSQL into integer minor units.
 *
 * `numeric` arrives as a string precisely so no float ever touches it. Splitting
 * on the decimal point and scaling keeps it exact: `parseFloat` would introduce
 * the very drift §33 forbids.
 */
export function numericToMinor(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const trimmed = String(value).trim();
  if (trimmed === "") return 0;
  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ""] = unsigned.split(".");
  const fracPadded = (frac + "00").slice(0, 2);
  const minor = Number(whole || "0") * 100 + Number(fracPadded || "0");
  if (!Number.isSafeInteger(minor)) {
    throw new FamilyOfficeCapitalError("VALIDATION", `Amount ${value} exceeds the safe integer range in minor units.`);
  }
  return negative ? -minor : minor;
}

/** Convert integer minor units back to the `numeric(18,2)` string form. */
export function minorToNumeric(minor: number): string {
  if (!Number.isInteger(minor)) {
    throw new FamilyOfficeCapitalError("VALIDATION", `Minor units must be an integer; received ${minor}.`);
  }
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

function auditBase(actor: FamilyOfficeActor, action: string, objectType: string, objectId: string, authority: string, newValue: Record<string, unknown>) {
  return {
    tenantId: actor.tenantId,
    actorUserId: actor.userId,
    actorType: "HUMAN" as const,
    action,
    objectType,
    objectId,
    outcome: "SUCCESS" as const,
    authority,
    newValue,
    ipAddress: actor.ipAddress ?? null,
    userAgent: actor.userAgent ?? null,
    traceId: actor.traceId,
  };
}

/* ------------------------------------------------------------------ */
/* Investments                                                         */
/* ------------------------------------------------------------------ */

export type InvestmentRow = typeof s.familyInvestments.$inferSelect;

function rowToInvestment(row: InvestmentRow): FamilyInvestment {
  return {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId ?? "",
    countryCode: row.countryCode,
    type: row.type as FamilyInvestment["type"],
    name: row.name,
    assetClass: row.assetClass,
    currency: row.currency,
    acquisitionCostMinor: numericToMinor(row.acquisitionCost),
    cashInvestedMinor: numericToMinor(row.cashInvested),
    acquisitionDate: row.acquisitionDate,
    valuation:
      row.currentValue === null
        ? null
        : {
            valueMinor: numericToMinor(row.currentValue),
            basis: (row.currentValueBasis ?? "OBSERVED") as CapitalEpistemicClass,
            source: row.currentValueSource ?? "unrecorded",
            asOf: row.valuedAsOf ?? row.createdAt.toISOString().slice(0, 10),
            professionalValuationDocumentRef: row.professionalValuationDocumentRef,
          },
    realisedGainMinor: numericToMinor(row.realisedGain),
    annualCashFlowMinor: numericToMinor(row.annualCashFlow),
    realisedCashFlowMinor: numericToMinor(row.realisedCashFlow),
    attributableDebtMinor: numericToMinor(row.attributableDebt),
    liquidity: row.liquidity as FamilyInvestment["liquidity"],
    riskBps: row.riskBps,
    governanceStatus: row.governanceStatus as FamilyInvestment["governanceStatus"],
    heldYears: row.heldYears,
    exitStrategy: row.exitStrategy,
    exitValueAssumptionMinor: row.exitValueAssumption === null ? null : numericToMinor(row.exitValueAssumption),
    legalReviewRef: row.legalReviewRef,
    taxReviewRef: row.taxReviewRef,
    committeeDecisionRef: row.committeeDecisionId,
    financeRecordRef: row.financeRecordRef,
  };
}

/** Read investments with their measures, inside the caller's tenant scope. */
export async function listInvestments(principal: Principal, asOf: string) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyInvestments).where(inArray(s.familyInvestments.tenantId, scope));
  const investments = rows.map(rowToInvestment);
  return {
    investments: investments.map((investment) => ({ ...investment, measures: measureInvestment(investment) })),
    portfolio: summarisePortfolio(investments, asOf),
    total: investments.length,
  };
}

async function tenantScope(principal: Principal): Promise<string[]> {
  const { tenantScopeIds } = await import("@/lib/tenant-scope");
  return tenantScopeIds(principal);
}

export interface CreateInvestmentInput {
  legalEntityId: string | null;
  countryCode: string;
  type: string;
  name: string;
  assetClass: string;
  currency: string;
  /** Minor units, supplied as integer minor units — never a decimal string. */
  acquisitionCostMinor: number;
  cashInvestedMinor: number;
  acquisitionDate: string;
  liquidity: string;
  governanceStatus: string;
  exitStrategy: string | null;
  legalReviewRef: string | null;
  taxReviewRef: string | null;
  committeeDecisionRef: string | null;
}

/**
 * Record an investment.
 *
 * Validated through the engine BEFORE the write: a record past screening with no
 * committee decision is refused, not stored and flagged later. The write and the
 * audit append share one transaction.
 */
export async function createInvestment(actor: FamilyOfficeActor, input: CreateInvestmentInput) {
  const id = newId(ID_PREFIX.foInvestment);
  const candidate = rowToInvestment({
    id,
    tenantId: actor.tenantId,
    legalEntityId: input.legalEntityId,
    countryCode: input.countryCode,
    type: input.type,
    name: input.name,
    assetClass: input.assetClass,
    currency: input.currency,
    acquisitionCost: minorToNumeric(input.acquisitionCostMinor),
    cashInvested: minorToNumeric(input.cashInvestedMinor),
    acquisitionDate: input.acquisitionDate,
    currentValue: null,
    currentValueBasis: null,
    currentValueSource: null,
    valuedAsOf: null,
    professionalValuationDocumentRef: null,
    realisedGain: "0.00",
    annualCashFlow: "0.00",
    realisedCashFlow: "0.00",
    attributableDebt: "0.00",
    liquidity: input.liquidity,
    riskBps: null,
    governanceStatus: input.governanceStatus,
    heldYears: 0,
    exitStrategy: input.exitStrategy,
    exitValueAssumption: null,
    legalReviewRef: input.legalReviewRef,
    taxReviewRef: input.taxReviewRef,
    committeeDecisionId: input.committeeDecisionRef,
    authoritativeOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
    financeRecordRef: null,
    classification: "RESTRICTED",
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as InvestmentRow);

  const findings = validateInvestment(candidate);
  if (findings.length > 0) {
    throw new FamilyOfficeCapitalError("VALIDATION", "The investment record was refused by the Family Office engine.", findings);
  }
  if (input.legalEntityId) await assertWithinScope({ tenantId: actor.tenantId } as Principal, actor.tenantId);

  return withAuditTransaction(
    async () => {
      await db.insert(s.familyInvestments).values({
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId,
        countryCode: input.countryCode,
        type: input.type,
        name: input.name,
        assetClass: input.assetClass,
        currency: input.currency,
        acquisitionCost: minorToNumeric(input.acquisitionCostMinor),
        cashInvested: minorToNumeric(input.cashInvestedMinor),
        acquisitionDate: input.acquisitionDate,
        liquidity: input.liquidity,
        governanceStatus: input.governanceStatus,
        exitStrategy: input.exitStrategy,
        legalReviewRef: input.legalReviewRef,
        taxReviewRef: input.taxReviewRef,
        committeeDecisionId: input.committeeDecisionRef,
        authoritativeOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
        classification: "RESTRICTED",
      });
      return { id };
    },
    () => auditBase(actor, "family.investment.create", "FAMILY_INVESTMENT", id, "family:investment.manage", { name: input.name, type: input.type, assetClass: input.assetClass, currency: input.currency, acquisitionCostMinor: input.acquisitionCostMinor, governanceStatus: input.governanceStatus }),
  );
}

/* ------------------------------------------------------------------ */
/* Obligations                                                         */
/* ------------------------------------------------------------------ */

type ObligationRow = typeof s.familyObligations.$inferSelect;

function rowToObligation(row: ObligationRow): FamilyObligation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    kind: row.kind as FamilyObligation["kind"],
    direction: row.direction as FamilyObligation["direction"],
    borrower: {
      ref: row.borrowerRef,
      name: row.borrowerName,
      partyType: row.borrowerPartyType as FamilyObligation["borrower"]["partyType"],
      countryCode: row.borrowerCountryCode,
      legalEntityRef: row.borrowerLegalEntityId,
    },
    lender: {
      ref: row.lenderRef,
      name: row.lenderName,
      partyType: row.lenderPartyType as FamilyObligation["lender"]["partyType"],
      countryCode: row.lenderCountryCode,
      legalEntityRef: row.lenderLegalEntityId,
    },
    ownerRef: row.ownerRef,
    terms: {
      currency: row.currency,
      principalMinor: numericToMinor(row.principal),
      annualRateBps: row.annualRateBps,
      rateType: row.rateType as FamilyObligation["terms"]["rateType"],
      floatingReference: row.floatingReference,
      floatingSpreadBps: row.floatingSpreadBps,
      maturityDate: row.maturityDate ?? "",
      paymentFrequency: row.paymentFrequency as FamilyObligation["terms"]["paymentFrequency"],
      amortisation: row.amortisation as FamilyObligation["terms"]["amortisation"],
    },
    security: {
      collateralDescription: row.collateralDescription,
      collateralRef: row.collateralRef,
      guaranteeDescription: row.guaranteeDescription,
      guarantorRef: row.guarantorRef,
      guaranteeDirection: row.guaranteeDirection as FamilyObligation["security"]["guaranteeDirection"],
    },
    governance: {
      agreementDocumentRef: row.agreementDocumentRef,
      approvalRef: row.approvalRef,
      authorisedBy: row.authorisedBy,
      legalReviewRef: row.legalReviewRef,
      jurisdictionRef: row.jurisdictionRef,
    },
    status: row.status as FamilyObligation["status"],
    outstandingMinor: numericToMinor(row.outstanding),
    financeRecordRef: row.financeRecordRef,
    authoritativeAccounting: false,
    authoritativeAccountingOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
    amountBasis: (row.epistemicClass ?? "OBSERVED") as FamilyObligation["amountBasis"],
    createdAt: row.createdAt.toISOString().slice(0, 10),
    updatedAt: row.updatedAt.toISOString().slice(0, 10),
  };
}

/** Read the obligation register and the "who owes whom" summary. */
export async function listObligations(principal: Principal, asOf: string) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyObligations).where(inArray(s.familyObligations.tenantId, scope));
  const obligations = rows.map(rowToObligation);
  return { obligations, summary: summariseObligationRegister(obligations, asOf), total: obligations.length };
}

export interface CreateObligationInput {
  kind: string;
  direction: string;
  borrower: { ref: string; name: string; partyType: string; countryCode: string; legalEntityRef: string | null };
  lender: { ref: string; name: string; partyType: string; countryCode: string; legalEntityRef: string | null };
  ownerRef: string | null;
  terms: {
    currency: string;
    principalMinor: number;
    outstandingMinor: number;
    annualRateBps: number;
    rateType: string;
    floatingReference: string | null;
    floatingSpreadBps: number | null;
    maturityDate: string | null;
    paymentFrequency: string;
    amortisation: string;
  };
  security: { collateralDescription: string | null; collateralRef: string | null; guaranteeDescription: string | null; guarantorRef: string | null; guaranteeDirection: string };
  governance: { agreementDocumentRef: string | null; approvalRef: string | null; authorisedBy: string | null; legalReviewRef: string | null; jurisdictionRef: string | null };
  status: string;
  financeRecordRef: string | null;
}

/** Record an obligation. Both sides must be named — that is the point of §8. */
export async function createObligation(actor: FamilyOfficeActor, input: CreateObligationInput) {
  const id = newId(ID_PREFIX.foObligation);
  const candidate: FamilyObligation = {
    id,
    tenantId: actor.tenantId,
    kind: input.kind as FamilyObligation["kind"],
    direction: input.direction as FamilyObligation["direction"],
    borrower: input.borrower as FamilyObligation["borrower"],
    lender: input.lender as FamilyObligation["lender"],
    ownerRef: input.ownerRef,
    terms: {
      currency: input.terms.currency,
      principalMinor: input.terms.principalMinor,
      annualRateBps: input.terms.annualRateBps,
      rateType: input.terms.rateType as FamilyObligation["terms"]["rateType"],
      floatingReference: input.terms.floatingReference,
      floatingSpreadBps: input.terms.floatingSpreadBps,
      maturityDate: input.terms.maturityDate ?? "",
      paymentFrequency: input.terms.paymentFrequency as FamilyObligation["terms"]["paymentFrequency"],
      amortisation: input.terms.amortisation as FamilyObligation["terms"]["amortisation"],
    },
    security: input.security as FamilyObligation["security"],
    governance: input.governance,
    status: input.status as FamilyObligation["status"],
    outstandingMinor: input.terms.outstandingMinor,
    financeRecordRef: input.financeRecordRef,
    authoritativeAccounting: false,
    authoritativeAccountingOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
    amountBasis: "OBSERVED",
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
  };

  const findings = validateObligation(candidate);
  if (findings.length > 0) {
    throw new FamilyOfficeCapitalError("VALIDATION", "The obligation record was refused by the Family Office engine.", findings);
  }

  return withAuditTransaction(
    async () => {
      await db.insert(s.familyObligations).values({
        id,
        tenantId: actor.tenantId,
        kind: candidate.kind,
        direction: candidate.direction,
        borrowerRef: candidate.borrower.ref,
        borrowerName: candidate.borrower.name,
        borrowerPartyType: candidate.borrower.partyType,
        borrowerCountryCode: candidate.borrower.countryCode,
        borrowerLegalEntityId: candidate.borrower.legalEntityRef,
        lenderRef: candidate.lender.ref,
        lenderName: candidate.lender.name,
        lenderPartyType: candidate.lender.partyType,
        lenderCountryCode: candidate.lender.countryCode,
        lenderLegalEntityId: candidate.lender.legalEntityRef,
        ownerRef: candidate.ownerRef,
        currency: candidate.terms.currency,
        principal: minorToNumeric(candidate.terms.principalMinor),
        outstanding: minorToNumeric(candidate.outstandingMinor),
        annualRateBps: candidate.terms.annualRateBps,
        rateType: candidate.terms.rateType,
        floatingReference: candidate.terms.floatingReference,
        floatingSpreadBps: candidate.terms.floatingSpreadBps,
        maturityDate: candidate.terms.maturityDate || null,
        paymentFrequency: candidate.terms.paymentFrequency,
        amortisation: candidate.terms.amortisation,
        collateralDescription: candidate.security.collateralDescription,
        collateralRef: candidate.security.collateralRef,
        guaranteeDescription: candidate.security.guaranteeDescription,
        guarantorRef: candidate.security.guarantorRef,
        guaranteeDirection: candidate.security.guaranteeDirection,
        agreementDocumentRef: candidate.governance.agreementDocumentRef,
        approvalRef: candidate.governance.approvalRef,
        authorisedBy: candidate.governance.authorisedBy,
        legalReviewRef: candidate.governance.legalReviewRef,
        jurisdictionRef: candidate.governance.jurisdictionRef,
        status: candidate.status,
        authoritativeOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
        epistemicClass: "OBSERVED",
        financeRecordRef: candidate.financeRecordRef,
        classification: "RESTRICTED",
      });
      return { id };
    },
    () =>
      auditBase(actor, "family.obligation.create", "FAMILY_OBLIGATION", id, "family:obligation.manage", {
        kind: candidate.kind,
        direction: candidate.direction,
        borrower: candidate.borrower.ref,
        lender: candidate.lender.ref,
        currency: candidate.terms.currency,
        principalMinor: candidate.terms.principalMinor,
        status: candidate.status,
      }),
  );
}

/* ------------------------------------------------------------------ */
/* Debt                                                                */
/* ------------------------------------------------------------------ */

/**
 * Build the debt book from the live obligation register.
 *
 * Positions are derived from obligations where the family is the borrower; NOI,
 * EBIT, equity, assets and revenue are supplied by the caller because they are
 * Finance OS and sector OS figures this service has no authority to invent.
 */
export async function buildDebtBook(principal: Principal, asOf: string, financials: { noiMinor: number; ebitMinor: number; equityMinor: number; totalAssetsMinor: number; revenueMinor: number; revenueToNoiBps: number }) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyObligations).where(inArray(s.familyObligations.tenantId, scope));
  const obligations = rows.map(rowToObligation).filter((o) => o.direction === "FAMILY_IS_BORROWER");

  const input = {
    asOf,
    positions: obligations.map((o) => ({
      id: o.id,
      currency: o.terms.currency,
      outstandingMinor: o.outstandingMinor,
      annualRateBps: o.terms.annualRateBps,
      rateType: (o.terms.rateType === "FLOATING" ? "FLOATING" : "FIXED") as "FIXED" | "FLOATING",
      maturityDate: o.terms.maturityDate,
      annualDebtServiceMinor: estimateAnnualDebtService(o),
      collateralValueMinor: o.security.collateralRef ? null : null,
      legalEntityId: o.borrower.legalEntityRef ?? "",
      countryCode: o.borrower.countryCode,
    })),
    ...financials,
  };

  return { measures: measureDebtBook(input), stress: stressDebtBook(input), exposure: profileDebtExposure(input) };
}

/**
 * Annual debt service estimate from the recorded terms.
 *
 * Labelled DERIVED, not OBSERVED: the schedule of record lives with the
 * agreement and with Finance OS. This is a same-convention estimate so the debt
 * book can be measured before a schedule is recorded, and `measureDebtBook`
 * reports it as such.
 */
function estimateAnnualDebtService(obligation: FamilyObligation): number {
  const interest = Math.trunc((obligation.outstandingMinor * obligation.terms.annualRateBps) / 10_000);
  if (obligation.terms.amortisation === "INTEREST_ONLY") return interest;
  if (obligation.terms.amortisation === "BULLET") return interest;
  const tenorYears = /^\d{4}-\d{2}-\d{2}$/.test(obligation.terms.maturityDate) ? Math.max(1, Math.round(daysUntil(new Date().toISOString().slice(0, 10), obligation.terms.maturityDate) / 365)) : 1;
  return interest + Math.trunc(obligation.outstandingMinor / tenorYears);
}

function daysUntil(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/* ------------------------------------------------------------------ */
/* Real estate                                                         */
/* ------------------------------------------------------------------ */

type PropertyRow = typeof s.familyRealEstateAssets.$inferSelect;

function rowToProperty(row: PropertyRow): FamilyProperty {
  return {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId ?? "",
    countryCode: row.countryCode,
    propertyClass: row.propertyClass as FamilyProperty["propertyClass"],
    name: row.name,
    stage: row.stage as FamilyProperty["stage"],
    operating: {
      grossPotentialRentMinor: numericToMinor(row.grossPotentialRent),
      vacancyBps: row.vacancyBps,
      otherIncomeMinor: numericToMinor(row.otherIncome),
      operatingExpensesMinor: numericToMinor(row.operatingExpenses),
      maintenanceMinor: numericToMinor(row.maintenance),
      propertyTaxMinor: numericToMinor(row.propertyTax),
      insuranceMinor: numericToMinor(row.insurance),
    },
    financing:
      row.purchasePrice === null
        ? null
        : {
            purchasePriceMinor: numericToMinor(row.purchasePrice),
            cashInvestedMinor: numericToMinor(row.cashInvested),
            debtMinor: numericToMinor(row.debt),
            annualRateBps: row.annualRateBps ?? 0,
            rateType: (row.rateType ?? "FIXED") as "FIXED" | "FLOATING",
            annualDebtServiceMinor: numericToMinor(row.annualDebtService),
            tenorMonths: row.tenorMonths ?? 0,
            amortisation: (row.amortisation ?? "AMORTISING") as "AMORTISING" | "BULLET" | "INTEREST_ONLY",
            currency: row.currency,
          },
    valuation:
      row.valuation === null
        ? null
        : {
            valueMinor: numericToMinor(row.valuation),
            basis: (row.valuationBasis ?? "OBSERVED") as CapitalEpistemicClass,
            source: row.valuationSource ?? "unrecorded",
            asOf: row.valuedAsOf ?? row.createdAt.toISOString().slice(0, 10),
            professionalValuationDocumentRef: row.professionalValuationDocumentRef,
          },
    heldYears: row.heldYears,
    exitValueMinor: row.exitValueAssumption === null ? null : numericToMinor(row.exitValueAssumption),
    exitStrategy: row.exitStrategy,
    annualCashFlowAfterDebtMinor: row.annualCashFlowAfterDebt === null ? null : numericToMinor(row.annualCashFlowAfterDebt),
    realisedCashFlowMinor: numericToMinor(row.realisedCashFlow),
    acquisitionCostMinor: numericToMinor(row.acquisitionCost),
    financeRecordRef: row.financeRecordRef,
  };
}

/** Read real-estate assets with their measures. */
export async function listProperties(principal: Principal) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyRealEstateAssets).where(inArray(s.familyRealEstateAssets.tenantId, scope));
  const properties = rows.map(rowToProperty);
  return { properties: properties.map((property) => ({ ...property, measures: measureProperty(property) })), total: properties.length };
}

/* ------------------------------------------------------------------ */
/* Cash flow, balance sheet, liquidity                                 */
/* ------------------------------------------------------------------ */

/** Read consolidated cash flow for a period. */
export async function readCashFlow(principal: Principal, asOf: string, period?: string) {
  const scope = await tenantScope(principal);
  const conditions = [inArray(s.familyCashFlowItems.tenantId, scope)];
  if (period) conditions.push(eq(s.familyCashFlowItems.period, period));
  const rows = await db.select().from(s.familyCashFlowItems).where(and(...conditions));
  const items: CashFlowItem[] = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId ?? "",
    countryCode: row.countryCode,
    currency: row.currency,
    period: row.period,
    direction: row.direction as "INFLOW" | "OUTFLOW",
    category: row.category as CashFlowItem["category"],
    amountMinor: numericToMinor(row.amount),
    basis: row.basis as CapitalEpistemicClass,
    sourceRef: row.sourceRef,
    recurring: row.recurring,
    sectorCode: row.sectorCode,
  }));
  return { items, consolidation: consolidateCashFlow(items, asOf), total: items.length };
}

export interface CreateCashFlowItemInput {
  legalEntityId: string | null;
  countryCode: string;
  currency: string;
  period: string;
  direction: "INFLOW" | "OUTFLOW";
  category: string;
  amountMinor: number;
  basis: string;
  sourceRef: string;
  recurring: boolean;
  sectorCode: string | null;
}

/** Record a cash-flow item. Validated by the engine's category rules on read. */
export async function createCashFlowItem(actor: FamilyOfficeActor, input: CreateCashFlowItemInput) {
  const id = newId(ID_PREFIX.foCashFlowItem);
  const probe: CashFlowItem = {
    id,
    tenantId: actor.tenantId,
    legalEntityId: input.legalEntityId ?? "",
    countryCode: input.countryCode,
    currency: input.currency,
    period: input.period,
    direction: input.direction,
    category: input.category as CashFlowItem["category"],
    amountMinor: input.amountMinor,
    basis: input.basis as CapitalEpistemicClass,
    sourceRef: input.sourceRef,
    recurring: input.recurring,
    sectorCode: input.sectorCode,
  };
  const consolidation = consolidateCashFlow([probe], new Date().toISOString().slice(0, 10));
  if (consolidation.excluded.length > 0) {
    throw new FamilyOfficeCapitalError("VALIDATION", "The cash-flow item was refused by the Family Office engine.", consolidation.excluded.map((e) => e.reason));
  }

  return withAuditTransaction(
    async () => {
      await db.insert(s.familyCashFlowItems).values({
        id,
        tenantId: actor.tenantId,
        legalEntityId: input.legalEntityId,
        countryCode: input.countryCode,
        currency: input.currency,
        period: input.period,
        direction: input.direction,
        category: input.category,
        amount: minorToNumeric(input.amountMinor),
        basis: input.basis,
        sourceRef: input.sourceRef,
        recurring: input.recurring,
        sectorCode: input.sectorCode,
        authoritativeOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
        classification: "RESTRICTED",
      });
      return { id };
    },
    () => auditBase(actor, "family.cashflow.create", "FAMILY_CASH_FLOW_ITEM", id, "family:cashflow.read", { period: input.period, direction: input.direction, category: input.category, currency: input.currency, amountMinor: input.amountMinor, basis: input.basis }),
  );
}

/** Read the latest balance-sheet snapshots and rebuild one from supplied lines. */
export async function readBalanceSheet(principal: Principal, params: { asOf: string; lines: BalanceSheetLine[]; contingents: ContingentLiability[]; capitalCommitments: { currency: string; amountMinor: number }[] }) {
  const scope = await tenantScope(principal);
  const snapshots = await db.select().from(s.familyBalanceSheetSnapshots).where(inArray(s.familyBalanceSheetSnapshots.tenantId, scope));
  return { snapshots, computed: buildFamilyBalanceSheet(params), total: snapshots.length };
}

/** Project liquidity from supplied liquid resources and expected flows. */
export async function readLiquidity(
  principal: Principal,
  params: { asOf: string; currency: string; liquidMinor: number; nearLiquidMinor: number; illiquidMinor: number; flows: ExpectedFlow[]; coverageLadder: RedLineLadder | null },
) {
  await tenantScope(principal);
  const position = projectLiquidity(params);
  return { position, alerts: raiseLiquidityAlerts(position, params.coverageLadder) };
}

/* ------------------------------------------------------------------ */
/* Committee, journal, intelligence                                    */
/* ------------------------------------------------------------------ */

/** Read committee decisions inside scope. */
export async function listCommitteeDecisions(principal: Principal) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyCommitteeDecisions).where(inArray(s.familyCommitteeDecisions.tenantId, scope));
  return { decisions: rows, total: rows.length };
}

/** Read the decision journal inside scope. */
export async function listDecisionJournal(principal: Principal) {
  const scope = await tenantScope(principal);
  const [entries, reviews] = await Promise.all([
    db.select().from(s.familyDecisionJournalEntries).where(inArray(s.familyDecisionJournalEntries.tenantId, scope)),
    db.select().from(s.familyPostInvestmentReviews).where(inArray(s.familyPostInvestmentReviews.tenantId, scope)),
  ]);
  return { entries, reviews, total: entries.length };
}

/** Read the regulatory / market intelligence register. */
export async function listIntelligence(principal: Principal, asOf: string) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyRegulatoryEvents).where(inArray(s.familyRegulatoryEvents.tenantId, scope));
  const { summariseIntelligenceRegister } = await import("@/lib/family/office/capital-wealth");
  const events = rows.map((row) => ({
    id: row.id,
    tenantId: row.tenantId,
    domain: row.domain as never,
    classification: row.classification as never,
    title: row.title,
    summary: row.summary,
    source: row.source,
    sourceUrl: row.sourceUrl,
    eventDate: row.eventDate,
    jurisdictionRef: row.jurisdictionRef,
    countryCodes: row.countryCodes,
    confidence: row.confidence as never,
    affectedEntityRefs: row.affectedEntityRefs,
    affectedAssetRefs: row.affectedAssetRefs,
    recommendedAction: row.recommendedAction,
    reviewAssignedTo: row.reviewAssignedTo,
    reviewDueDate: row.reviewDueDate,
    status: row.status as never,
    recordedBy: row.recordedBy,
    recordedByActorType: row.recordedByActorType as never,
    recordedAt: row.createdAt.toISOString(),
  }));
  return { events, summary: summariseIntelligenceRegister(events, asOf), total: events.length };
}

/** Read generational plans inside scope. */
export async function listGenerationalPlans(principal: Principal) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyGenerationalPlans).where(inArray(s.familyGenerationalPlans.tenantId, scope));
  return { plans: rows, total: rows.length };
}

/** Read capital allocation cases inside scope. */
export async function listAllocations(principal: Principal) {
  const scope = await tenantScope(principal);
  const rows = await db.select().from(s.familyCapitalAllocations).where(inArray(s.familyCapitalAllocations.tenantId, scope));
  return { allocations: rows, total: rows.length };
}

/* Re-exported so the routes have one import surface. */
export { assertThesisIsComplete, validatePreInvestmentEntry, validatePostInvestmentReview, validateCommitteeDecision, validateRegulatoryEvent, validateTaxPosition };
export type { RedLineLadder };
