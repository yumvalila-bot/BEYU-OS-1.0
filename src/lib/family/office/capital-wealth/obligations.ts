/**
 * BEYU OS — FAMILY OFFICE CAPITAL & WEALTH ENGINE: the obligation register (§8).
 *
 * The question this module answers is: **WHO OWES WHOM?**
 *
 * ============================== WHAT THIS IS ================================
 *
 * A governed register of every obligation the family can see, with both sides of
 * the relationship named: lender, borrower, owner, entity, country, currency,
 * principal, interest, rate type, maturity, payment frequency, collateral,
 * guarantee, covenant, agreement, approval, status and audit history.
 *
 * It reuses the EXISTING ledger architecture. `src/lib/family/loan.ts` already
 * engineers the family loan lifecycle (statuses, seventeen documentation
 * disciplines, repayment schedules, eligibility, portfolio summary) and
 * `capital_requests` / `journal_entries` / `treasury_positions` already exist in
 * the Finance OS schema. This module does not re-engineer any of it: it names the
 * counterparty relationship those records imply, so that the family can be asked
 * "who owes whom?" and get one answer instead of six.
 *
 * ============================ WHAT THIS IS NOT ================================
 *
 * NOT a shadow ledger. FIR-018 forbids a
 * family record from becoming the system of record for financial state, and that
 * boundary is intact: an obligation's amounts here are the TERMS OF THE
 * AGREEMENT as governed data, explicitly marked non-authoritative, with a
 * reference to the Finance OS record that is authoritative. Accounting — the
 * accrual, the posting, the balance, the reconciliation — remains Finance OS's
 * (§32). A caller that presents an obligation amount as a posted balance is
 * refused by `assertNotAuthoritativeAccounting`.
 *
 * NOT a lender. Recording that A owes B is not lending to B (§7).
 */

import { assertMinorUnits, BPS_BASE, FamilyMetricsError, ratioBps, type CapitalEpistemicClass } from "./metrics";

export const FAMILY_OBLIGATION_REGISTER_VERSION = "family-obligation-register-1.0.0";

/**
 * Every monetary value in this layer is governed DATA ABOUT AN AGREEMENT, never
 * accounting truth. This constant is the boundary, stated once and referenced by
 * every record so that no reader can mistake a modelled term for a posted
 * balance.
 */
export const AUTHORITATIVE_ACCOUNTING_OWNER = "FINANCE_OS" as const;

/* ------------------------------------------------------------------ */
/* Closed vocabularies                                                 */
/* ------------------------------------------------------------------ */

/** The obligation kinds the register tracks (§8). */
export const OBLIGATION_KINDS = [
  "INTERCOMPANY_LOAN",
  "SHAREHOLDER_LOAN",
  "MORTGAGE",
  "PROJECT_DEBT",
  "VENDOR_FINANCING",
  "RECEIVABLE",
  "PAYABLE",
  "LEASE",
  "GUARANTEE",
  "BOND",
  "CAPITAL_COMMITMENT",
] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

/** Whether the family is on the receiving or the paying side. */
export const OBLIGATION_DIRECTIONS = ["FAMILY_IS_LENDER", "FAMILY_IS_BORROWER", "FAMILY_IS_GUARANTOR", "FAMILY_IS_BENEFICIARY"] as const;
export type ObligationDirection = (typeof OBLIGATION_DIRECTIONS)[number];

export const RATE_TYPES = ["FIXED", "FLOATING", "STEPPED", "ZERO", "IN_KIND"] as const;
export type RateType = (typeof RATE_TYPES)[number];

export const PAYMENT_FREQUENCIES = [
  { code: "MONTHLY", perYear: 12 },
  { code: "QUARTERLY", perYear: 4 },
  { code: "SEMI_ANNUAL", perYear: 2 },
  { code: "ANNUAL", perYear: 1 },
  { code: "AT_MATURITY", perYear: 0 },
] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number]["code"];

export const OBLIGATION_STATUSES = [
  "DRAFT",
  "PROPOSED",
  "UNDER_REVIEW",
  "APPROVED",
  "DOCUMENTED",
  "ACTIVE",
  "RESTRUCTURED",
  "IN_DEFAULT",
  "SETTLED",
  "WRITTEN_OFF",
  "TERMINATED",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

/** Statuses that represent a live obligation for aggregation purposes. */
export const LIVE_OBLIGATION_STATUSES: readonly ObligationStatus[] = ["APPROVED", "DOCUMENTED", "ACTIVE", "RESTRUCTURED", "IN_DEFAULT"];

export const OBLIGATION_TRANSITIONS: Record<ObligationStatus, readonly ObligationStatus[]> = {
  DRAFT: ["PROPOSED", "TERMINATED"],
  PROPOSED: ["UNDER_REVIEW", "TERMINATED"],
  UNDER_REVIEW: ["APPROVED", "TERMINATED"],
  APPROVED: ["DOCUMENTED", "TERMINATED"],
  DOCUMENTED: ["ACTIVE", "TERMINATED"],
  ACTIVE: ["RESTRUCTURED", "IN_DEFAULT", "SETTLED"],
  RESTRUCTURED: ["ACTIVE", "IN_DEFAULT", "SETTLED"],
  IN_DEFAULT: ["RESTRUCTURED", "SETTLED", "WRITTEN_OFF"],
  SETTLED: [],
  WRITTEN_OFF: [],
  TERMINATED: [],
};

export function canTransitionObligation(from: ObligationStatus, to: ObligationStatus): boolean {
  return OBLIGATION_TRANSITIONS[from].includes(to);
}

/**
 * Assert a status transition is legal.
 *
 * `SETTLED`, `WRITTEN_OFF` and `TERMINATED` are terminal. A terminal obligation
 * cannot be revived: correcting a settled obligation is a NEW obligation with a
 * reference to the old one, so the audit history stays a single unbroken chain.
 */
export function assertObligationTransition(from: ObligationStatus, to: ObligationStatus): void {
  if (from === to) return;
  if (!canTransitionObligation(from, to)) {
    throw new FamilyMetricsError(
      "INVALID_PERIOD",
      `Obligation status cannot move from ${from} to ${to}. Permitted: ${OBLIGATION_TRANSITIONS[from].join(", ") || "none (terminal state)"}.`,
      { from, to },
    );
  }
}

/* ------------------------------------------------------------------ */
/* The obligation record                                               */
/* ------------------------------------------------------------------ */

/** A party to an obligation. Both sides are always named — never "counterparty". */
export type ObligationParty = {
  /** Stable party identifier (a `parties.id`, `legal_entities.id` or external ref). */
  ref: string;
  name: string;
  /** FAMILY_GROUP | FAMILY_MEMBER | GROUP_ENTITY | EXTERNAL_LENDER | EXTERNAL_BORROWER | GOVERNMENT | OTHER. */
  partyType: "FAMILY_GROUP" | "FAMILY_MEMBER" | "GROUP_ENTITY" | "EXTERNAL_LENDER" | "EXTERNAL_BORROWER" | "GOVERNMENT" | "OTHER";
  /** ISO 3166-1 alpha-2. Country isolation depends on it being present. */
  countryCode: string;
  /** The legal entity the party acts through, when it acts through one. */
  legalEntityRef: string | null;
};

/** The terms of the agreement, as governed data. Not accounting. */
export type ObligationTerms = {
  currency: string;
  principalMinor: number;
  /** Annual rate in basis points. Ignored when `rateType` is ZERO. */
  annualRateBps: number;
  rateType: RateType;
  /** For FLOATING: the reference rate this obligation tracks. Never assumed. */
  floatingReference: string | null;
  /** Spread over the reference, basis points. Required when floating. */
  floatingSpreadBps: number | null;
  maturityDate: string;
  paymentFrequency: PaymentFrequency;
  /** Amortising or bullet — determines whether principal is repaid before maturity. */
  amortisation: "AMORTISING" | "BULLET" | "INTEREST_ONLY";
};

/** Security and support behind the obligation. */
export type ObligationSecurity = {
  collateralDescription: string | null;
  /** Reference to the governed collateral record or document. */
  collateralRef: string | null;
  guaranteeDescription: string | null;
  guarantorRef: string | null;
  /** A guarantee given BY the family is a contingent liability, not an asset. */
  guaranteeDirection: "RECEIVED" | "GIVEN" | "NONE";
};

/** The governance and documentary chain. Each is a reference, never a claim. */
export type ObligationGovernance = {
  agreementDocumentRef: string | null;
  approvalRef: string | null;
  /** The resolution or approval that authorised it. Absent means unauthorised. */
  authorisedBy: string | null;
  legalReviewRef: string | null;
  /** Jurisdiction whose law governs the agreement. */
  jurisdictionRef: string | null;
};

export type FamilyObligation = {
  id: string;
  tenantId: string;
  kind: ObligationKind;
  direction: ObligationDirection;
  /** The party owing the money. */
  borrower: ObligationParty;
  /** The party owed the money. */
  lender: ObligationParty;
  /** The beneficial owner of the obligation, where it differs from the lender. */
  ownerRef: string | null;
  terms: ObligationTerms;
  security: ObligationSecurity;
  governance: ObligationGovernance;
  status: ObligationStatus;
  /** Outstanding principal as governed data. NOT a posted balance. */
  outstandingMinor: number;
  /** Reference to the authoritative Finance OS record for this obligation. */
  financeRecordRef: string | null;
  /** Always false. Set structurally so no record can claim to be accounting. */
  authoritativeAccounting: false;
  /** Always FINANCE_OS. */
  authoritativeAccountingOwner: typeof AUTHORITATIVE_ACCOUNTING_OWNER;
  /** Epistemic class of the amounts: OBSERVED from the agreement, never POSTED. */
  amountBasis: Extract<CapitalEpistemicClass, "OBSERVED" | "DERIVED" | "ASSUMPTION">;
  createdAt: string;
  updatedAt: string;
};

/* ------------------------------------------------------------------ */
/* Boundary guards                                                     */
/* ------------------------------------------------------------------ */

/**
 * Refuse any use of an obligation record as accounting authority.
 *
 * This is the FIR-018 boundary applied to the capital domain. An obligation's
 * `outstandingMinor` is the governed term of an agreement; the balance of record
 * lives in Finance OS. Presenting one as the other is the specific failure that
 * would make the Family Office a shadow ledger.
 */
export function assertNotAuthoritativeAccounting(obligation: FamilyObligation, usage: string): void {
  if (obligation.authoritativeAccounting !== false) {
    throw new FamilyMetricsError(
      "FINANCE_BOUNDARY_VIOLATION",
      `${usage}: an obligation record cannot be authoritative accounting. FIR-018 forbids a family record from being a shadow ledger; the authoritative owner is ${AUTHORITATIVE_ACCOUNTING_OWNER}.`,
      { obligationId: obligation.id, usage },
    );
  }
  if (obligation.amountBasis === "POSTED" as CapitalEpistemicClass) {
    throw new FamilyMetricsError(
      "FINANCE_BOUNDARY_VIOLATION",
      `${usage}: an obligation amount can never be classed POSTED. Posting is Finance OS's authority (§32).`,
      { obligationId: obligation.id },
    );
  }
}

/**
 * Validate an obligation record.
 *
 * Both sides of the relationship must be named (the whole point of §8 is that
 * the register can answer "who owes whom", which it cannot do with one side
 * missing); a floating rate must name its reference; a guarantee given by the
 * family must be visible as a contingent liability; and an ACTIVE obligation
 * must have an authorising reference, because an unauthorised live obligation is
 * a governance defect the moment it is recorded rather than when it is read.
 */
export function validateObligation(obligation: FamilyObligation): readonly string[] {
  const findings: string[] = [];
  assertMinorUnits(obligation.terms.principalMinor, "principal");
  assertMinorUnits(obligation.outstandingMinor, "outstanding");
  assertNotAuthoritativeAccounting(obligation, "validateObligation");

  if (!obligation.borrower.ref.trim() || !obligation.lender.ref.trim()) {
    findings.push("Both borrower and lender must be named. An obligation with one unnamed side cannot answer 'who owes whom'.");
  }
  if (obligation.borrower.ref === obligation.lender.ref && obligation.kind !== "INTERCOMPANY_LOAN") {
    findings.push(`Borrower and lender are the same party (${obligation.borrower.ref}) for a ${obligation.kind}; only an intercompany loan may be self-referential, and even then the two entities must differ.`);
  }
  if (!/^[A-Z]{2}$/.test(obligation.borrower.countryCode) || !/^[A-Z]{2}$/.test(obligation.lender.countryCode)) {
    findings.push("Both parties must carry an ISO 3166-1 alpha-2 country code. Country isolation depends on it.");
  }
  if (obligation.terms.rateType === "FLOATING" && !obligation.terms.floatingReference) {
    findings.push("A floating-rate obligation must name its reference rate. An unnamed reference cannot be stressed.");
  }
  if (obligation.terms.rateType === "FLOATING" && obligation.terms.floatingSpreadBps === null) {
    findings.push("A floating-rate obligation must state its spread over the reference.");
  }
  if (obligation.terms.rateType === "ZERO" && obligation.terms.annualRateBps !== 0) {
    findings.push(`A ZERO rate type must carry 0 bps; received ${obligation.terms.annualRateBps}.`);
  }
  if (obligation.terms.rateType !== "ZERO" && obligation.terms.annualRateBps < 0) {
    findings.push(`A non-zero rate must not be negative; received ${obligation.terms.annualRateBps} bps.`);
  }
  if (obligation.terms.paymentFrequency === "AT_MATURITY" && obligation.terms.amortisation === "AMORTISING") {
    findings.push("An amortising obligation cannot pay only at maturity.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(obligation.terms.maturityDate)) {
    findings.push(`Maturity must be an ISO date; received "${obligation.terms.maturityDate}". An undated maturity is never assumed to be far away.`);
  }
  if (obligation.security.guaranteeDirection === "GIVEN" && !obligation.security.guarantorRef) {
    findings.push("A guarantee GIVEN by the family must name the guarantor: it is a contingent liability on the family balance sheet.");
  }
  if (LIVE_OBLIGATION_STATUSES.includes(obligation.status) && !obligation.governance.authorisedBy) {
    findings.push(`An obligation in ${obligation.status} must carry an authorising reference. An unauthorised live obligation is a governance defect.`);
  }
  if (obligation.status === "DOCUMENTED" && !obligation.governance.agreementDocumentRef) {
    findings.push("A DOCUMENTED obligation must reference its agreement document.");
  }
  if (obligation.status === "ACTIVE" && !obligation.financeRecordRef) {
    findings.push("An ACTIVE obligation must reference the authoritative Finance OS record; otherwise the family cannot reconcile it.");
  }
  return findings;
}

/* ------------------------------------------------------------------ */
/* Aggregation — "who owes whom?"                                       */
/* ------------------------------------------------------------------ */

export type CounterpartyExposure = {
  counterpartyRef: string;
  counterpartyName: string;
  partyType: ObligationParty["partyType"];
  countryCode: string;
  /** Obligations where the family owes this party. */
  owedByFamilyMinor: number;
  /** Obligations where this party owes the family. */
  owedToFamilyMinor: number;
  /** Contingent: guarantees the family has given that support this party. */
  guaranteedByFamilyMinor: number;
  netMinor: number;
  obligationCount: number;
  obligationIds: string[];
};

export type ObligationRegisterSummary = {
  engineVersion: string;
  asOf: string;
  /** Per-currency, because totalling across currencies without a ratified rate is invention. */
  byCurrency: {
    currency: string;
    owedByFamilyMinor: number;
    owedToFamilyMinor: number;
    guaranteedByFamilyMinor: number;
    netMinor: number;
    liveCount: number;
  }[];
  counterparties: CounterpartyExposure[];
  byKind: { kind: ObligationKind; count: number; owedByFamilyMinor: number; owedToFamilyMinor: number }[];
  byCountry: { countryCode: string; owedByFamilyMinor: number; owedToFamilyMinor: number }[];
  /** Obligations excluded from the summary, with the reason. Never silently dropped. */
  excluded: { obligationId: string; reason: string }[];
  /** Every amount here is governed data, not accounting. */
  authoritativeAccountingOwner: typeof AUTHORITATIVE_ACCOUNTING_OWNER;
  explanation: string[];
};

/**
 * Aggregate the register into "who owes whom", per currency, per counterparty,
 * per kind and per country.
 *
 * Totals are kept PER CURRENCY. There is no ratified FX policy (P4 remains
 * unratified — see the note in `src/lib/specialist/treasury/model.ts`), so
 * cross-currency totalling would be invention. A caller that needs a
 * single-currency total must supply a rated conversion and label it ASSUMPTION.
 */
export function summariseObligationRegister(obligations: readonly FamilyObligation[], asOf: string): ObligationRegisterSummary {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new FamilyMetricsError("INVALID_PERIOD", `asOf must be an ISO date; received "${asOf}".`, { asOf });
  }
  const excluded: { obligationId: string; reason: string }[] = [];
  const live: FamilyObligation[] = [];
  for (const o of obligations) {
    const findings = validateObligation(o);
    if (findings.length > 0) {
      excluded.push({ obligationId: o.id, reason: findings[0] });
      continue;
    }
    if (!LIVE_OBLIGATION_STATUSES.includes(o.status)) {
      excluded.push({ obligationId: o.id, reason: `Status ${o.status} is not a live obligation.` });
      continue;
    }
    live.push(o);
  }

  const currencies = [...new Set(live.map((o) => o.terms.currency))].sort();
  const byCurrency = currencies.map((currency) => {
    const rows = live.filter((o) => o.terms.currency === currency);
    const owedByFamily = rows.filter((o) => o.direction === "FAMILY_IS_BORROWER").reduce((s, o) => s + o.outstandingMinor, 0);
    const owedToFamily = rows.filter((o) => o.direction === "FAMILY_IS_LENDER" || o.direction === "FAMILY_IS_BENEFICIARY").reduce((s, o) => s + o.outstandingMinor, 0);
    const guaranteed = rows.filter((o) => o.direction === "FAMILY_IS_GUARANTOR").reduce((s, o) => s + o.outstandingMinor, 0);
    return { currency, owedByFamilyMinor: owedByFamily, owedToFamilyMinor: owedToFamily, guaranteedByFamilyMinor: guaranteed, netMinor: owedToFamily - owedByFamily, liveCount: rows.length };
  });

  const counterpartyMap = new Map<string, CounterpartyExposure>();
  for (const o of live) {
    const other = o.direction === "FAMILY_IS_BORROWER" ? o.lender : o.borrower;
    const existing =
      counterpartyMap.get(other.ref) ??
      ({
        counterpartyRef: other.ref,
        counterpartyName: other.name,
        partyType: other.partyType,
        countryCode: other.countryCode,
        owedByFamilyMinor: 0,
        owedToFamilyMinor: 0,
        guaranteedByFamilyMinor: 0,
        netMinor: 0,
        obligationCount: 0,
        obligationIds: [],
      } as CounterpartyExposure);
    if (o.direction === "FAMILY_IS_BORROWER") existing.owedByFamilyMinor += o.outstandingMinor;
    else if (o.direction === "FAMILY_IS_GUARANTOR") existing.guaranteedByFamilyMinor += o.outstandingMinor;
    else existing.owedToFamilyMinor += o.outstandingMinor;
    existing.obligationCount += 1;
    existing.obligationIds.push(o.id);
    existing.netMinor = existing.owedToFamilyMinor - existing.owedByFamilyMinor;
    counterpartyMap.set(other.ref, existing);
  }

  const kinds = [...new Set(live.map((o) => o.kind))].sort();
  const byKind = kinds.map((kind) => {
    const rows = live.filter((o) => o.kind === kind);
    return {
      kind,
      count: rows.length,
      owedByFamilyMinor: rows.filter((o) => o.direction === "FAMILY_IS_BORROWER").reduce((s, o) => s + o.outstandingMinor, 0),
      owedToFamilyMinor: rows.filter((o) => o.direction !== "FAMILY_IS_BORROWER").reduce((s, o) => s + o.outstandingMinor, 0),
    };
  });

  const countries = [...new Set(live.flatMap((o) => [o.borrower.countryCode, o.lender.countryCode]))].sort();
  const byCountry = countries.map((countryCode) => {
    const rows = live.filter((o) => o.borrower.countryCode === countryCode || o.lender.countryCode === countryCode);
    return {
      countryCode,
      owedByFamilyMinor: rows.filter((o) => o.direction === "FAMILY_IS_BORROWER").reduce((s, o) => s + o.outstandingMinor, 0),
      owedToFamilyMinor: rows.filter((o) => o.direction !== "FAMILY_IS_BORROWER").reduce((s, o) => s + o.outstandingMinor, 0),
    };
  });

  return {
    engineVersion: FAMILY_OBLIGATION_REGISTER_VERSION,
    asOf,
    byCurrency,
    counterparties: [...counterpartyMap.values()].sort((a, b) => Math.abs(b.owedByFamilyMinor + b.owedToFamilyMinor) - Math.abs(a.owedByFamilyMinor + a.owedToFamilyMinor)),
    byKind,
    byCountry,
    excluded,
    authoritativeAccountingOwner: AUTHORITATIVE_ACCOUNTING_OWNER,
    explanation: [
      `${live.length} live obligation(s) across ${currencies.length} currency(ies); ${excluded.length} excluded and named.`,
      "Totals are per currency. No cross-currency total is produced because no FX rate has been ratified; a single-currency figure would require a rated conversion labelled ASSUMPTION.",
      "Every amount is the governed term of an agreement. The balance of record is Finance OS's (§32).",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Covenants                                                           */
/* ------------------------------------------------------------------ */

/**
 * A covenant attached to an obligation.
 *
 * A covenant is a promise with a measurable test. Recording the test is what
 * makes a breach detectable before it is a default; recording only the promise
 * makes it detectable after.
 */
export type ObligationCovenant = {
  id: string;
  obligationId: string;
  /** FINANCIAL | INFORMATION | RESTRICTIVE | MAINTENANCE. */
  covenantType: "FINANCIAL" | "INFORMATION" | "RESTRICTIVE" | "MAINTENANCE";
  code: string;
  description: string;
  /** The measure the covenant tests, e.g. "DSCR", "LTV", "INTEREST_COVERAGE". */
  measureCode: string | null;
  /** MIN = must stay at or above; MAX = must stay at or below. */
  direction: "MIN" | "MAX" | null;
  /** Threshold in basis points where the measure is a ratio. */
  thresholdBps: number | null;
  /** What happens on breach, as written in the agreement. Never inferred. */
  consequenceOnBreach: string | null;
  /** Grace or cure period in days, as written. Never assumed to exist. */
  curePeriodDays: number | null;
};

export type CovenantTest = {
  covenantId: string;
  code: string;
  /** Null when the covenant has no measurable test (an information or restrictive covenant). */
  basis: CapitalEpistemicClass | null;
  observedBps: number | null;
  thresholdBps: number | null;
  /** Null when the covenant is not measurable, or the threshold is absent. */
  status: "COMPLIANT" | "BREACHED" | "NOT_MEASURABLE" | "THRESHOLD_ABSENT" | "MEASURE_ABSENT" | null;
  headroomBps: number | null;
  consequenceOnBreach: string | null;
  explanation: string;
};

/**
 * Test a covenant against an observed measure.
 *
 * The honest outcomes matter more than the happy one: a covenant with no
 * threshold is `THRESHOLD_ABSENT`, a measure that was not supplied is
 * `MEASURE_ABSENT`, and an information covenant is `NOT_MEASURABLE`. None of
 * those is COMPLIANT, because absence of a breach signal is not evidence of
 * compliance.
 */
export function testCovenant(covenant: ObligationCovenant, observedBps: number | null): CovenantTest {
  if (covenant.measureCode === null || covenant.direction === null) {
    return {
      covenantId: covenant.id,
      code: covenant.code,
      basis: null,
      observedBps,
      thresholdBps: covenant.thresholdBps,
      status: "NOT_MEASURABLE",
      headroomBps: null,
      consequenceOnBreach: covenant.consequenceOnBreach,
      explanation: `"${covenant.description}" is a ${covenant.covenantType.toLowerCase()} covenant with no measurable test. Compliance is a documentary judgement, not an arithmetic one, and is not asserted here.`,
    };
  }
  if (covenant.thresholdBps === null) {
    return {
      covenantId: covenant.id,
      code: covenant.code,
      basis: "REQUIRES_POLICY",
      observedBps,
      thresholdBps: null,
      status: "THRESHOLD_ABSENT",
      headroomBps: null,
      consequenceOnBreach: covenant.consequenceOnBreach,
      explanation: `The covenant tests ${covenant.measureCode} but no threshold is recorded. An untested covenant is not a compliant one.`,
    };
  }
  if (observedBps === null) {
    return {
      covenantId: covenant.id,
      code: covenant.code,
      basis: "DATA_NOT_AVAILABLE",
      observedBps: null,
      thresholdBps: covenant.thresholdBps,
      status: "MEASURE_ABSENT",
      headroomBps: null,
      consequenceOnBreach: covenant.consequenceOnBreach,
      explanation: `${covenant.measureCode} was not supplied, so the covenant cannot be tested. This is reported as absent, never as compliant.`,
    };
  }
  const compliant = covenant.direction === "MIN" ? observedBps >= covenant.thresholdBps : observedBps <= covenant.thresholdBps;
  const headroom = covenant.direction === "MIN" ? observedBps - covenant.thresholdBps : covenant.thresholdBps - observedBps;
  return {
    covenantId: covenant.id,
    code: covenant.code,
    basis: "DERIVED",
    observedBps,
    thresholdBps: covenant.thresholdBps,
    status: compliant ? "COMPLIANT" : "BREACHED",
    headroomBps: headroom,
    consequenceOnBreach: covenant.consequenceOnBreach,
    explanation: compliant
      ? `${covenant.measureCode} of ${observedBps} bps is inside the ${covenant.direction === "MIN" ? "floor" : "ceiling"} of ${covenant.thresholdBps} bps; headroom ${headroom} bps.`
      : `${covenant.measureCode} of ${observedBps} bps breaches the ${covenant.direction === "MIN" ? "floor" : "ceiling"} of ${covenant.thresholdBps} bps by ${-headroom} bps. Consequence on breach: ${covenant.consequenceOnBreach ?? "not recorded in the agreement"}.`,
  };
}

/**
 * Netting ratio for a counterparty, in basis points: what they owe the family
 * over what the family owes them. Useful for spotting a counterparty the family
 * is simultaneously lending to and borrowing from, which is a governance
 * question rather than an arithmetic one.
 */
export function counterpartyNettingBps(exposure: CounterpartyExposure): number | null {
  return ratioBps(exposure.netMinor, Math.max(exposure.owedByFamilyMinor, exposure.owedToFamilyMinor, 1));
}

export { BPS_BASE };
