import { describe, expect, it } from "vitest";
import {
  calculateCorporateIncomeTax,
  calculateCustomsProcessingFee,
  calculateForestProduceSingleInstalment,
  calculatePaye,
  calculatePersonalIncomeTax,
  calculatePresumptiveIncomeTax,
  calculateVat,
  calculateVatWithholding,
  calculateWithholdingTax,\n  normalizeTanzaniaTin,
  computeTanzaniaTax,
  prepareTaxFilingPack,
  TaxCalculationError,
} from "@/lib/finance/tanzania-tax-computation-engine";

describe("FINANCE_OS Tanzania Mainland tax computation engine", () => {
  it("computes progressive resident PAYE using published monthly brackets", () => {
    expect(calculatePaye({ monthlyTaxablePayTzs: 270000 }).taxAmountTzs).toBe(0);
    expect(calculatePaye({ monthlyTaxablePayTzs: 520000 }).taxAmountTzs).toBe(20000);
    expect(calculatePaye({ monthlyTaxablePayTzs: 760000 }).taxAmountTzs).toBe(68000);
    expect(calculatePaye({ monthlyTaxablePayTzs: 1000000 }).taxAmountTzs).toBe(128000);
    expect(calculatePaye({ monthlyTaxablePayTzs: 1200000 }).taxAmountTzs).toBe(188000);
  });

  it("applies published non-resident and secondary-employment PAYE treatments", () => {
    expect(calculatePaye({ monthlyTaxablePayTzs: 1000000, employeeStatus: "NON_RESIDENT" }).taxAmountTzs).toBe(150000);
    expect(calculatePaye({ monthlyTaxablePayTzs: 1000000, employeeStatus: "RESIDENT_SECONDARY" }).taxAmountTzs).toBe(300000);
  });

  it("computes annual resident personal income tax bands", () => {
    expect(calculatePersonalIncomeTax({ annualTaxableIncomeTzs: 3240000 }).taxAmountTzs).toBe(0);
    expect(calculatePersonalIncomeTax({ annualTaxableIncomeTzs: 6240000 }).taxAmountTzs).toBe(240000);
    expect(calculatePersonalIncomeTax({ annualTaxableIncomeTzs: 9120000 }).taxAmountTzs).toBe(816000);
    expect(calculatePersonalIncomeTax({ annualTaxableIncomeTzs: 12000000 }).taxAmountTzs).toBe(1536000);
    expect(calculatePersonalIncomeTax({ annualTaxableIncomeTzs: 15000000 }).taxAmountTzs).toBe(2436000);
  });

  it("computes standard corporate income tax and refuses unmodelled special regimes", () => {
    expect(calculateCorporateIncomeTax({ taxableIncomeTzs: 10000000 }).taxAmountTzs).toBe(3000000);
    expect(() => calculateCorporateIncomeTax({ taxableIncomeTzs: 10000000, specialRegimeClaimed: true })).toThrow(TaxCalculationError);
  });

  it("computes VAT output and only recognizes explicitly verified input credits", () => {
    expect(calculateVat({ taxableSuppliesTzs: 1000000 }).taxAmountTzs).toBe(180000);
    expect(calculateVat({ taxableSuppliesTzs: 1000000, inputVatCreditTzs: 50000 }).taxAmountTzs).toBe(180000);
    expect(calculateVat({ taxableSuppliesTzs: 1000000, inputVatCreditTzs: 50000, inputVatCreditVerified: true }).taxAmountTzs).toBe(130000);
    expect(calculateVat({ taxableSuppliesTzs: 1000000, rate: "ZERO_RATED" }).taxAmountTzs).toBe(0);
  });

  it("computes forest-produce single instalment tax on the greatest statutory gross-payment value", () => {
    const result = calculateForestProduceSingleInstalment({
      farmGatePriceTzs: 1000000,
      purchasePriceTzs: 1200000,
      tfsValueTzs: 1100000,
      trigger: "TRANSPORT",
    });
    expect(result.taxBaseTzs).toBe(1200000);
    expect(result.taxAmountTzs).toBe(24000);
    expect(result.sourceRefs.some((source) => source.code === "TZ_FINANCE_ACT_2_2026")).toBe(true);
    expect(result.sourceRefs.some((source) => source.code === "TZ_GN_158F_2026_FOREST_PRODUCE")).toBe(true);
  });

  it("computes Finance Act 2026 VAT withholding on goods, services and mixed supplies", () => {
    expect(calculateVatWithholding({ taxableValueTzs: 1000000, supplyType: "GOODS" }).taxAmountTzs).toBe(30000);
    expect(calculateVatWithholding({ taxableValueTzs: 1000000, supplyType: "SERVICES" }).taxAmountTzs).toBe(60000);
    expect(calculateVatWithholding({ taxableValueTzs: 1000000, supplyType: "MIXED" }).taxAmountTzs).toBe(42000);
    expect(calculateVatWithholding({ taxableValueTzs: 1000000, supplyType: "MIXED" }).sourceRefs.some((source) => source.code === "TZ_FINANCE_ACT_2_2026")).toBe(true);
  });

  it("computes withholding categories and refuses treaty relief without approved treaty evidence", () => {
    expect(calculateWithholdingTax({ grossPaymentTzs: 1000000, category: "DIVIDEND_OTHER", payeeResidency: "RESIDENT" }).taxAmountTzs).toBe(100000);
    expect(calculateWithholdingTax({ grossPaymentTzs: 1000000, category: "SERVICE_FEE", payeeResidency: "NON_RESIDENT" }).taxAmountTzs).toBe(150000);
    expect(() => calculateWithholdingTax({ grossPaymentTzs: 1000000, category: "INTEREST", payeeResidency: "RESIDENT", treatyReliefClaimed: true })).toThrow(TaxCalculationError);
  });

  it("computes the published presumptive schedule and rejects out-of-regime turnover", () => {
    expect(calculatePresumptiveIncomeTax({ annualTurnoverTzs: 3000000, records: "COMPLETE" }).taxAmountTzs).toBe(0);
    expect(calculatePresumptiveIncomeTax({ annualTurnoverTzs: 6000000, records: "INCOMPLETE" }).taxAmountTzs).toBe(100000);
    expect(calculatePresumptiveIncomeTax({ annualTurnoverTzs: 10000000, records: "COMPLETE" }).taxAmountTzs).toBe(180000);
    expect(calculatePresumptiveIncomeTax({ annualTurnoverTzs: 12000000, records: "INCOMPLETE" }).taxAmountTzs).toBe(480000);
    expect(calculatePresumptiveIncomeTax({ annualTurnoverTzs: 12000000, records: "COMPLETE" }).taxAmountTzs).toBe(480000);
    expect(() => calculatePresumptiveIncomeTax({ annualTurnoverTzs: 201000000, records: "COMPLETE" })).toThrow(TaxCalculationError);
    expect(() => calculatePresumptiveIncomeTax({ annualTurnoverTzs: 6000000, records: "COMPLETE", newBusinessReliefApproved: true })).toThrow(TaxCalculationError);
  });

  it("returns provisional status and cites the source schedule for every calculation", () => {
    const result = computeTanzaniaTax({ taxType: "VAT", taxableSuppliesTzs: 100000 });
    expect(result.status).toBe("PROVISIONAL_ESTIMATE");
    expect(result.sourceRefs.length).toBeGreaterThan(0);
    expect(result.warnings.some((warning) => warning.includes("Estimate only"))).toBe(true);
  });

  it("prepares a draft VAT filing pack with the published 20th deadline and no submission", () => {
    const calculation = calculateVat({ taxableSuppliesTzs: 1000000 });
    const pack = prepareTaxFilingPack({
      taxpayer: { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "123456789" },
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      calculation,
    });
    expect(pack.dueDate).toBe("2026-11-20");
    expect(pack.status).toBe("DRAFT_NOT_SUBMITTED");
    expect(pack.submission.status).toBe("NOT_SUBMITTED");
    expect(pack.submission.receiptNumber).toBeNull();
  });

  it("computes GN 158D customs processing fees without inventing import duty", () => {
    expect(calculateCustomsProcessingFee({ cargoType: "DRY_NON_PETROLEUM", importOrigin: "NON_EAC", originEvidenceVerified: false, fobValueTzs: 10000000 }).taxAmountTzs).toBe(100000);
    expect(calculateCustomsProcessingFee({ cargoType: "WET_PETROLEUM", importOrigin: "NON_EAC", originEvidenceVerified: false, vesselCount: 2 }).taxAmountTzs).toBe(40000000);
    expect(calculateCustomsProcessingFee({ cargoType: "DRY_NON_PETROLEUM", importOrigin: "EAC_ORIGINATING", originEvidenceVerified: true, fobValueTzs: 10000000 }).taxAmountTzs).toBe(0);
    expect(() => calculateCustomsProcessingFee({ cargoType: "WET_PETROLEUM", importOrigin: "NON_EAC", originEvidenceVerified: false, vesselCount: 0 })).toThrow(TaxCalculationError);
    expect(() => calculateCustomsProcessingFee({ cargoType: "DRY_NON_PETROLEUM", importOrigin: "NON_EAC", originEvidenceVerified: false, fobValueTzs: 10000000, exemptionClaimed: true })).toThrow(TaxCalculationError);
  });

  it("prepares the TRA quarterly estimated-tax calendar for calendar-year entities", () => {
    const taxpayer = { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "123456789" };
    const presumptive = prepareTaxFilingPack({
      taxpayer, periodStart: "2026-01-01", periodEnd: "2026-12-31",
      calculation: calculatePresumptiveIncomeTax({ annualTurnoverTzs: 12000000, records: "INCOMPLETE" }),
    });
    expect(presumptive.dueDate).toBeNull();
    expect(presumptive.paymentMilestones).toHaveLength(4);
    expect(presumptive.paymentMilestones.map((item) => item.dueDate)).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"]);
    const small = prepareTaxFilingPack({
      taxpayer, periodStart: "2026-01-01", periodEnd: "2026-12-31",
      calculation: calculatePresumptiveIncomeTax({ annualTurnoverTzs: 3000000, records: "COMPLETE" }),
    });
    expect(small.paymentMilestones).toHaveLength(0);
  });

  it("prepares VAT withholding statement/payment due date under Finance Act 2026", () => {
    const pack = prepareTaxFilingPack({
      taxpayer: { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "123456789" },
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      calculation: calculateVatWithholding({ taxableValueTzs: 1000000, supplyType: "GOODS" }),
    });
    expect(pack.dueDate).toBe("2026-11-10");
    expect(pack.paymentMilestones).toEqual([]);
  });

  it("prepares WHT/PAYE due dates and annual income tax deadline", () => {
    const taxpayer = { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "123456789" };
    const wht = prepareTaxFilingPack({ taxpayer, periodStart: "2026-10-01", periodEnd: "2026-10-31", calculation: calculateWithholdingTax({ grossPaymentTzs: 100000, category: "INTEREST", payeeResidency: "RESIDENT" }) });
    expect(wht.dueDate).toBe("2026-11-07");
    const cit = prepareTaxFilingPack({ taxpayer, periodStart: "2026-01-01", periodEnd: "2026-12-31", calculation: calculateCorporateIncomeTax({ taxableIncomeTzs: 1000000 }) });
    expect(cit.dueDate).toBe("2027-06-30");
  });

  it("rejects partial-month VAT, PAYE and WHT filing packs", () => {
    const taxpayer = { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "123456789" };
    expect(() => prepareTaxFilingPack({
      taxpayer, periodStart: "2026-10-05", periodEnd: "2026-10-31",
      calculation: calculateVat({ taxableSuppliesTzs: 1000 }),
    })).toThrow(TaxCalculationError);
  });

  it("normalizes formatted Tanzania legal-entity TINs without accepting malformed identifiers", () => {
    expect(normalizeTanzaniaTin("TIN-121-441-002")).toBe("121441002");
    expect(normalizeTanzaniaTin("121-441-002")).toBe("121441002");
    expect(normalizeTanzaniaTin("12345678")).toBeNull();
    expect(normalizeTanzaniaTin("TIN-123-456-78A")).toBeNull();
  });

  it("rejects invalid amounts, invalid TINs and malformed filing periods", () => {
    expect(() => calculatePaye({ monthlyTaxablePayTzs: -1 })).toThrow(TaxCalculationError);
    expect(() => calculateVat({ taxableSuppliesTzs: Number.MAX_SAFE_INTEGER + 1 })).toThrow(TaxCalculationError);
    expect(() => prepareTaxFilingPack({
      taxpayer: { legalEntityId: "entity-1", legalName: "Example Ltd", tin: "bad" },
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      calculation: calculateVat({ taxableSuppliesTzs: 1000 }),
    })).toThrow(TaxCalculationError);
  });
});
