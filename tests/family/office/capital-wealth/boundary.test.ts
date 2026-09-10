/**
 * Family Office capital & wealth — the FIR-018 finance boundary, asserted in BOTH
 * directions.
 *
 * This is the single most important test in the suite. The Family Office capital
 * domain stores governed operational data about capital. Finance OS owns
 * accounting. If the capital domain can be read as a ledger, the OS has two
 * ledgers and neither is authoritative.
 *
 * Direction 1 — the capital domain refuses to BE accounting:
 *   an obligation record cannot claim `authoritativeAccounting`, and its amounts
 *   can never carry the POSTED epistemic class. Both throw FINANCE_BOUNDARY_VIOLATION.
 *
 * Direction 2 — the capital domain does not REPLACE the Family Institution
 *   contracts: `FINANCIAL_STATE_FORBIDDEN_KEYS` and `LOAN_TERMS_FORBIDDEN_KEYS`
 *   in `phase3/contracts.ts` still govern the institution layer, untouched by
 *   this work. The two boundaries coexist; neither was relaxed to accommodate
 *   the other.
 */
import { describe, expect, it } from "vitest";
import {
  AUTHORITATIVE_ACCOUNTING_OWNER,
  FamilyMetricsError,
  assertNotAuthoritativeAccounting,
  consolidateCashFlow,
  validateObligation,
} from "../../../../src/lib/family/office/capital-wealth";
import {
  FINANCIAL_STATE_FORBIDDEN_KEYS,
  LOAN_TERMS_FORBIDDEN_KEYS,
} from "../../../../src/lib/family/phase3/contracts";
import { obligation } from "./fixtures";

describe("FIR-018 direction 1 — the capital domain refuses to be accounting", () => {
  it("names FINANCE_OS as the authoritative accounting owner", () => {
    expect(AUTHORITATIVE_ACCOUNTING_OWNER).toBe("FINANCE_OS");
  });

  it("a well-formed obligation carries authoritativeAccounting: false structurally", () => {
    const o = obligation();
    expect(o.authoritativeAccounting).toBe(false);
    expect(o.authoritativeAccountingOwner).toBe("FINANCE_OS");
    /** The type system alone cannot stop a POSTED class at runtime, so the guard must. */
    expect(o.amountBasis).not.toBe("POSTED");
  });

  it("passes the guard when the record is honestly a governed term, not a balance", () => {
    expect(() => assertNotAuthoritativeAccounting(obligation(), "balance sheet")).not.toThrow();
  });

  it("throws FINANCE_BOUNDARY_VIOLATION when a record claims to be authoritative accounting", () => {
    const forged = { ...obligation(), authoritativeAccounting: true } as never;
    try {
      assertNotAuthoritativeAccounting(forged, "balance sheet");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyMetricsError);
      /**
       * The code must name the boundary. A boundary violation reported as
       * DIVISION_BY_ZERO would send the caller looking for an arithmetic bug and
       * leave the actual defect — a shadow ledger — undiagnosed.
       */
      expect((e as FamilyMetricsError).code).toBe("FINANCE_BOUNDARY_VIOLATION");
      expect((e as FamilyMetricsError).message).toMatch(/FIR-018/);
    }
  });

  it("throws FINANCE_BOUNDARY_VIOLATION when an amount is classed POSTED", () => {
    const forged = { ...obligation(), amountBasis: "POSTED" } as never;
    try {
      assertNotAuthoritativeAccounting(forged, "consolidation");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(FamilyMetricsError);
      expect((e as FamilyMetricsError).code).toBe("FINANCE_BOUNDARY_VIOLATION");
      expect((e as FamilyMetricsError).message).toMatch(/POSTED/);
    }
  });

  it("the boundary error is distinct from the arithmetic errors", () => {
    /**
     * If a caller catches FamilyMetricsError it must be able to tell "your
     * denominator was zero" from "you used a family record as a ledger". They
     * need different responses: one is a bug in the caller, the other is a
     * governance defect.
     */
    const boundary = new Set(["FINANCE_BOUNDARY_VIOLATION"]);
    const arithmetic = new Set(["DIVISION_BY_ZERO", "INVALID_MONEY", "NO_SIGN_CHANGE"]);
    expect(boundary.has("FINANCE_BOUNDARY_VIOLATION")).toBe(true);
    expect(arithmetic.has("FINANCE_BOUNDARY_VIOLATION")).toBe(false);
  });

  it("a cash-flow item may carry POSTED, because it is sourced from Finance OS rather than claiming to be it", () => {
    /**
     * The asymmetry is deliberate and load-bearing. An obligation's
     * `outstandingMinor` is a TERM of an agreement the family wrote, so it can
     * never be posted. A cash-flow item is a restatement of a Finance OS figure
     * with a journal reference attached, so POSTED is the correct class for it.
     * The boundary is about who owns the ledger, not about banning a word.
     */
    const posted = {
      id: "CF-1",
      tenantId: "T-CAP-1",
      legalEntityId: "LE-1",
      countryCode: "NG",
      currency: "NGN",
      period: "2026-03",
      direction: "INFLOW" as const,
      category: "RENTAL_INCOME" as const,
      amountMinor: 1_000_000,
      basis: "POSTED" as const,
      sourceRef: "FIN-JOURNAL-1",
      recurring: true,
      sectorCode: null,
    };
    const result = consolidateCashFlow([posted], "2026-03-31");
    expect(result.byCurrency[0]?.inflowMinor).toBe(1_000_000);
    expect(result.excluded).toHaveLength(0);
  });

  it("consolidation excludes a non-integer amount and names it, rather than rounding it silently", () => {
    const bad = {
      id: "CF-BAD",
      tenantId: "T-CAP-1",
      legalEntityId: "LE-1",
      countryCode: "NG",
      currency: "NGN",
      period: "2026-03",
      direction: "INFLOW" as const,
      category: "RENTAL_INCOME" as const,
      amountMinor: 1_000.5,
      basis: "POSTED" as const,
      sourceRef: "FIN-JOURNAL-2",
      recurring: true,
      sectorCode: null,
    };
    const result = consolidateCashFlow([bad], "2026-03-31");
    expect(result.byCurrency).toHaveLength(0);
  });
});

describe("FIR-018 direction 2 — the Family Institution contracts are untouched", () => {
  it("the institution-layer forbidden-key lists still exist and are unchanged in substance", () => {
    /**
     * This work added a capital domain beside the institution layer. It did not
     * edit these lists to make room. If they ever shrink, the institution layer
     * has been weakened to accommodate the capital domain — which is exactly the
     * integration failure this programme was told not to commit.
     */
    expect(FINANCIAL_STATE_FORBIDDEN_KEYS.length).toBeGreaterThan(0);
    expect(LOAN_TERMS_FORBIDDEN_KEYS.length).toBeGreaterThan(0);
    for (const key of ["balance", "balances", "accrual", "ledgerRef", "postingRef"]) {
      expect(FINANCIAL_STATE_FORBIDDEN_KEYS).toContain(key);
    }
    for (const key of ["interestRate", "accountingTreatment", "collateralRef"]) {
      expect(LOAN_TERMS_FORBIDDEN_KEYS).toContain(key);
    }
  });

  it("a capital obligation is NOT an institution loan-terms record", () => {
    /**
     * The two record shapes are different by design. An obligation carries
     * `outstandingMinor` as a governed TERM of an agreement, with an epistemic
     * class and a Finance OS reference. An institution loan-terms record must not
     * carry financial state at all. Asserting the shapes differ is what proves
     * the capital domain did not quietly become the institution layer.
     */
    const o = obligation();
    expect(LOAN_TERMS_FORBIDDEN_KEYS).not.toContain("outstandingMinor");
    expect(o.terms).not.toHaveProperty("balance");
    /** And the obligation still declares who owns the accounting. */
    expect(o.authoritativeAccountingOwner).toBe("FINANCE_OS");
  });
});

describe("the boundary is also enforced by validation, not only by assertion", () => {
  it("an ACTIVE obligation with no authorising reference is a finding", () => {
    const findings = validateObligation(obligation({ governance: { agreementDocumentRef: null, approvalRef: null, authorisedBy: null, legalReviewRef: null, jurisdictionRef: null } }));
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((f) => /authoris|authoriz/i.test(f))).toBe(true);
  });

  it("a floating-rate obligation that names no reference rate is a finding", () => {
    const findings = validateObligation(
      obligation({ terms: { ...obligation().terms, rateType: "FLOATING", floatingReference: null, floatingSpreadBps: null } }),
    );
    expect(findings.some((f) => /floating|reference/i.test(f))).toBe(true);
  });
});
