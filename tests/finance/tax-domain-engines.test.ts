import { describe, expect, it } from "vitest";
import { buildTaxComplianceObligations } from "@/lib/finance/tax-compliance-engine";
import { assessCustomsClassificationReadiness } from "@/lib/finance/customs-classification-workflow";
import { taxAuditRiskTriage, validateTaxDisputeDossier } from "@/lib/finance/tax-audit-dispute-dossier";
import { filterNoeliaTaxCitations } from "@/lib/noelia/tax-intelligence";

describe("FINANCE_OS tax compliance planner", () => {
  it("creates separate VAT withholding payment and statement milestones", () => {
    const obligations = buildTaxComplianceObligations({
      taxType: "VAT_WITHHOLDING", periodStart: "2026-10-01", periodEnd: "2026-10-31",
    });
    expect(obligations.map((item) => [item.kind, item.dueDate])).toEqual([
      ["VAT_WITHHOLDING_PAYMENT", "2026-11-10"],
      ["VAT_WITHHOLDING_STATEMENT", "2026-11-10"],
    ]);
    expect(obligations.every((item) => item.status === "PLANNED_UNCONFIRMED" && item.calendarAdjustmentRequired)).toBe(true);
  });

  it("uses period-relative corporate instalment dates and unique, unallocated instalment rows", () => {
    const obligations = buildTaxComplianceObligations({
      taxType: "CORPORATE_INCOME_TAX",
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
      amountTzs: 12000000,
    });
    const instalments = obligations.filter((item) => item.kind === "CORPORATE_PROVISIONAL_INSTALMENT");
    expect(instalments.map((item) => item.dueDate)).toEqual([
      "2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30",
    ]);
    expect(new Set(instalments.map((item) => item.id)).size).toBe(4);
    expect(instalments.every((item) => item.amountTzs === null)).toBe(true);
    expect(() => buildTaxComplianceObligations({
      taxType: "CORPORATE_INCOME_TAX",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
    })).toThrow(/complete 12-month accounting period/);
  });

  it("does not duplicate annual presumptive liability into every quarterly milestone", () => {
    const obligations = buildTaxComplianceObligations({
      taxType: "PRESUMPTIVE_INCOME_TAX",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
      amountTzs: 500000,
      presumptiveTaxThresholdExceeded: true,
    });
    expect(new Set(obligations.map((item) => item.id)).size).toBe(4);
    expect(obligations.every((item) => item.amountTzs === null)).toBe(true);
  });

  it("rejects incomplete monthly periods and creates annual final-return deadlines", () => {
    expect(() => buildTaxComplianceObligations({
      taxType: "VAT", periodStart: "2026-10-02", periodEnd: "2026-10-31",
    })).toThrow(/complete calendar month/);
    const [annual] = buildTaxComplianceObligations({
      taxType: "CORPORATE_INCOME_TAX", periodStart: "2026-01-01", periodEnd: "2026-12-31",
    }).filter((item) => item.kind === "CORPORATE_FINAL_RETURN");
    expect(annual.dueDate).toBe("2027-06-30");
  });
});

describe("customs classification workflow", () => {
  it("rejects malformed specialist HS codes and invalid determination date windows", () => {
    const result = assessCustomsClassificationReadiness({
      caseId: "case-2", tenantId: "tenant-1", legalEntityId: "entity-1", jurisdictionCode: "TZ_MAINLAND",
      goodsDescription: "Industrial pump", composition: "Stainless steel", functionAndUse: "Water transfer",
      manufacturingProcess: "Machined and assembled", modelOrPartNumber: "P-1", countryOfOrigin: "CN",
      proposedHsCode: "87A899", customsValueTzs: 1000000, valuationMethod: "TRANSACTION_VALUE",
      evidenceDocumentIds: ["doc-1"], status: "SPECIALIST_DETERMINED", specialistId: "specialist-1",
      determinationReference: "TRA-RULING-1", effectiveFrom: "2026-02-31", effectiveTo: "2026-01-01",
    });
    expect(result.blockers.some((item) => item.includes("6–10 digits"))).toBe(true);
    expect(result.activationBlockers.some((item) => item.includes("effective-to"))).toBe(true);
    expect(result.canCalculateDuty).toBe(false);
  });

  it("never infers an HS code or enables duty calculation", () => {
    const result = assessCustomsClassificationReadiness({
      caseId: "case-1", tenantId: "tenant-1", legalEntityId: "entity-1", jurisdictionCode: "TZ_MAINLAND",
      goodsDescription: "Industrial pump", composition: "Stainless steel", functionAndUse: "Water transfer",
      manufacturingProcess: "Machined and assembled", modelOrPartNumber: "P-1", countryOfOrigin: "TZ",
      proposedHsCode: null, customsValueTzs: 1000000, valuationMethod: "TRANSACTION_VALUE",
      evidenceDocumentIds: ["doc-1"], status: "AWAITING_CUSTOMS_SPECIALIST", specialistId: null,
      determinationReference: null, effectiveFrom: null, effectiveTo: null,
    });
    expect(result.canCalculateDuty).toBe(false);
    expect(result.readyForSpecialist).toBe(true);
    expect(result.activationBlockers.some((item) => item.includes("specialist HS determination"))).toBe(true);
  });
});

describe("tax audit and dispute dossier", () => {
  it("requires checksum-backed evidence and statutory deadlines", () => {
    const result = validateTaxDisputeDossier({
      id: "d-1", tenantId: "t-1", legalEntityId: "e-1", jurisdictionCode: "TZ_MAINLAND",
      stage: "OBJECTION", taxType: "VAT", periodStart: "2026-01-01", periodEnd: "2026-01-31",
      noticeOrAssessmentReference: "TRA-123", statutoryDeadline: null, disputedAmountTzs: 500000,
      evidence: [{ documentId: "doc-1", sha256: "bad", evidenceType: "RETURN", periodStart: "2026-01-01",
        periodEnd: "2026-01-31", collectedBy: "u-1", collectedAt: "2026-02-01", description: "Filed VAT return" }],
      precedentSourceCodes: [], specialistOwnerId: null,
    });
    expect(result.readyForSpecialist).toBe(false);
    expect(result.blockers.some((item) => item.includes("SHA-256"))).toBe(true);
    expect(result.blockers.some((item) => item.includes("deadline"))).toBe(true);
  });

  it("scores audit indicators as triage, not a legal conclusion", () => {
    const result = taxAuditRiskTriage({
      lateReturns: 2, unexplainedLedgerVariancesTzs: 1000, missingWithholdingCertificates: 1,
      unsupportedInputVatCreditsTzs: 5000, customsValueAdjustments: 0,
    });
    expect(result.band).toBe("CRITICAL");
    expect(result.disclaimer).toContain("not a finding");
  });
});

describe("NOELIA tax citation boundary", () => {
  it("returns only authenticated, effective-dated authority", () => {
    const source = {
      sourceCode: "ACT-2026", title: "Finance Act 2026", provision: "s.91", jurisdictionCode: "TZ",
      effectiveFrom: "2026-07-01", effectiveTo: null, authorityStatus: "AUTHORITATIVE",
      sourceAuthenticationStatus: "AUTHORITATIVE", uri: "https://official.example/act.pdf",
    };
    const result = filterNoeliaTaxCitations({ citations: [source, { ...source, sourceCode: "DRAFT", authorityStatus: "DRAFT" }], jurisdictionCode: "TZ", asOf: "2026-11-13" });
    expect(result.citations.map((item) => item.sourceCode)).toEqual(["ACT-2026"]);
    expect(result.requiresAuthority).toBe(false);
  });

  it("can explain a superseded tax rule for its historical effective period only", () => {
    const historical = {
      sourceCode: "OLD", title: "Old rule", provision: "s.1", jurisdictionCode: "TZ",
      effectiveFrom: "2024-01-01", effectiveTo: "2025-12-31", authorityStatus: "SUPERSEDED",
      sourceAuthenticationStatus: "AUTHORITATIVE", uri: "https://official.example/old.pdf",
    };
    const inWindow = filterNoeliaTaxCitations({ citations: [historical], jurisdictionCode: "TZ", asOf: "2025-06-30" });
    const outOfWindow = filterNoeliaTaxCitations({ citations: [historical], jurisdictionCode: "TZ", asOf: "2026-01-01" });
    expect(inWindow.citations).toHaveLength(1);
    expect(outOfWindow.requiresAuthority).toBe(true);
  });

  it("fails closed when the only source is outside its effective window", () => {
    const result = filterNoeliaTaxCitations({
      citations: [{
        sourceCode: "OLD", title: "Old rule", provision: "s.1", jurisdictionCode: "TZ",
        effectiveFrom: "2020-01-01", effectiveTo: "2025-12-31", authorityStatus: "AUTHORITATIVE",
        sourceAuthenticationStatus: "AUTHORITATIVE", uri: "https://official.example/old.pdf",
      }],
      jurisdictionCode: "TZ", asOf: "2026-11-13",
    });
    expect(result.requiresAuthority).toBe(true);
    expect(result.explanation).toContain("REQUIRES_AUTHORITY");
  });
});
