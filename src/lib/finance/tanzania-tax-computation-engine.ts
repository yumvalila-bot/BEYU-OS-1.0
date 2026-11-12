/**
 * FINANCE_OS deterministic Tanzania Mainland tax calculator and filing-pack builder.
 *
 * Amounts are whole TZS. Arithmetic uses integer basis points and safe integers.
 * Public TRA guidance is used for current PAYE/VAT/WHT/presumptive schedules and
 * the OAG Income Tax Act for standard CIT/annual resident individual bands.
 *
 * Every result is a PROVISIONAL_ESTIMATE until the underlying original source
 * bytes are registered/checksummed and the relevant specialist signs off the
 * rule version. This module never submits returns or posts tax liabilities.
 */
export type TanzaniaTaxType =
  | "PAYE" | "CORPORATE_INCOME_TAX" | "PERSONAL_INCOME_TAX"
  | "PRESUMPTIVE_INCOME_TAX" | "VAT" | "VAT_WITHHOLDING" | "WITHHOLDING_TAX" | "CUSTOMS_PROCESSING_FEE";

export type TaxSourceRef = {
  code: string;
  title: string;
  uri: string;
  provision: string;
  evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW" | "OFFICIAL_ACT_REQUIRES_AMENDMENT_CROSSWALK" | "OFFICIAL_ACT_TEXT_REVIEWED_ORIGINAL_CHECKSUM_PENDING";
};

export const TANZANIA_TAX_SOURCES: Record<string, TaxSourceRef> = {
  TRA_PAYE_2026: {
    code: "TRA_PAYE_GUIDE",
    title: "Tanzania Revenue Authority — Pay As You Earn",
    uri: "https://www.tra.go.tz/page/pay-as-you-earn",
    provision: "Resident monthly PAYE bands; non-resident employment and secondary-employment guidance",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  TRA_VAT_2026: {
    code: "TRA_VAT_GUIDE",
    title: "Tanzania Revenue Authority — Value Added Tax",
    uri: "https://www.tra.go.tz/page/value-added-tax-vat",
    provision: "Mainland standard VAT rate, input-tax credit conditions, return/payment deadline and withholding",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  TRA_WHT_2026: {
    code: "TRA_WHT_GUIDE",
    title: "Tanzania Revenue Authority — Withholding Tax",
    uri: "https://www.tra.go.tz/page/withholding-tax",
    provision: "Published withholding categories/rates and monthly remittance deadline",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  TRA_PRESUMPTIVE_2026: {
    code: "TRA_INDIVIDUAL_INCOME_GUIDE",
    title: "Tanzania Revenue Authority — Income Tax for Individuals",
    uri: "https://www.tra.go.tz/page/income-tax-for-individuals",
    provision: "Published presumptive-turnover schedule; new-business relief is excluded pending individual eligibility approval",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  TRA_INDIVIDUAL_2026: {
    code: "TRA_INDIVIDUAL_TAX_GUIDE",
    title: "Tanzania Revenue Authority — Income Tax for Individuals",
    uri: "https://www.tra.go.tz/page/income-tax-for-individuals",
    provision: "Mainland monthly individual tax bands, presumptive eligibility/schedule and individual filing/payment calendar",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  TRA_CORPORATION_2026: {
    code: "TRA_CORPORATION_TAX_GUIDE",
    title: "Tanzania Revenue Authority — Corporation Tax",
    uri: "https://www.tra.go.tz/page/corporation-tax",
    provision: "Corporate provisional/final return filing periods and instalment calendar",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  OSG_FINANCE_ACT_2026: {
    code: "TZ_FINANCE_ACT_2_2026",
    title: "The Finance Act, No. 2 of 2026 — Office of the Solicitor General e-Library",
    uri: "https://elibrary.osg.go.tz/bitstreams/631b33c8-8b1f-4f86-a238-af89659d06ec/download",
    provision: "Sections 27, 91 and 95: presumptive tax turnover schedule; VAT withholding rates for goods/services and section 71 payment/statement deadline",
    evidenceStatus: "OFFICIAL_ACT_TEXT_REVIEWED_ORIGINAL_CHECKSUM_PENDING",
  },
  OAG_GN_158D_2026: {
    code: "TZ_GN_158D_2026",
    title: "OAG — Tanzania Revenue Authority (Customs Processing Fee) Regulations, 2026",
    uri: "https://oagmis.oag.go.tz/portal/legislation/4645/download",
    provision: "First Schedule: 1% of FOB value for dry cargo other than petroleum; TZS 20m per vessel for specified wet petroleum cargo",
    evidenceStatus: "OFFICIAL_GUIDANCE_REQUIRES_SPECIALIST_REVIEW",
  },
  OAG_INCOME_TAX_ACT_2023: {
    code: "TZ_INCOME_TAX_ACT_CAP332_RE2023",
    title: "Income Tax Act, Cap. 332 R.E. 2023",
    uri: "https://www.tra.go.tz/images/uploads/acts/The_Income_Tax_Act.pdf",
    provision: "First Schedule paragraphs 1(1) and 3(1): resident individual annual bands and standard corporate rate",
    evidenceStatus: "OFFICIAL_ACT_REQUIRES_AMENDMENT_CROSSWALK",
  },
};

export type TaxCalculation = {
  status: "PROVISIONAL_ESTIMATE" | "REQUIRES_SPECIALIST_REVIEW";
  taxType: TanzaniaTaxType;
  jurisdiction: "TZ_MAINLAND";
  currency: "TZS";
  taxBaseTzs: number;
  taxAmountTzs: number;
  effectiveRateBps: number;
  breakdown: Array<{ label: string; baseTzs: number; rateBps: number; taxTzs: number }>;
  sourceRefs: TaxSourceRef[];
  warnings: string[];
  formulaVersion: "TZ-MAINLAND-TAX-2026.1";
};

export class TaxCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TaxCalculationError";
  }
}

function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TaxCalculationError(`${label} must be a non-negative whole TZS safe integer.`);
  }
}

function roundBps(base: number, bps: number): number {
  assertMoney(base, "Tax base");
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) throw new TaxCalculationError("Rate must be 0–10,000 basis points.");
  const result = (BigInt(base) * BigInt(bps) + 5000n) / 10000n;
  const asNumber = Number(result);
  if (!Number.isSafeInteger(asNumber)) throw new TaxCalculationError("Calculated amount exceeds safe integer range.");
  return asNumber;
}

function progressiveTax(base: number, bands: Array<{ upTo: number | null; bps: number }>): { tax: number; lines: TaxCalculation["breakdown"] } {
  assertMoney(base, "Taxable income");
  let lower = 0;
  let tax = 0;
  const lines: TaxCalculation["breakdown"] = [];
  for (const band of bands) {
    const upper = band.upTo === null ? base : Math.min(base, band.upTo);
    const slice = Math.max(0, upper - lower);
    if (slice > 0) {
      const amount = roundBps(slice, band.bps);
      lines.push({ label: `${lower.toLocaleString("en-US")}–${band.upTo === null ? "above" : band.upTo.toLocaleString("en-US")}`, baseTzs: slice, rateBps: band.bps, taxTzs: amount });
      tax += amount;
    }
    if (band.upTo === null || base <= band.upTo) break;
    lower = band.upTo;
  }
  return { tax, lines };
}

function result(
  taxType: TanzaniaTaxType,
  base: number,
  tax: number,
  breakdown: TaxCalculation["breakdown"],
  sources: TaxSourceRef[],
  warnings: string[] = [],
): TaxCalculation {
  return {
    status: "PROVISIONAL_ESTIMATE",
    taxType,
    jurisdiction: "TZ_MAINLAND",
    currency: "TZS",
    taxBaseTzs: base,
    taxAmountTzs: tax,
    effectiveRateBps: base === 0 ? 0 : Math.round((tax / base) * 10000),
    breakdown,
    sourceRefs: sources,
    warnings: [
      "Estimate only: original source files/checksums and specialist ratification have not yet been completed in the governed legal registry.",
      "Do not use this estimate as a final tax return, tax payment instruction or accounting posting.",
      ...warnings,
    ],
    formulaVersion: "TZ-MAINLAND-TAX-2026.1",
  };
}

export function calculatePaye(input: {
  monthlyTaxablePayTzs: number;
  employeeStatus?: "RESIDENT_PRIMARY" | "RESIDENT_SECONDARY" | "NON_RESIDENT" | "NON_FULL_TIME_DIRECTOR";
}): TaxCalculation {
  const base = input.monthlyTaxablePayTzs;
  assertMoney(base, "Monthly taxable pay");
  const status = input.employeeStatus ?? "RESIDENT_PRIMARY";
  if (status === "NON_RESIDENT" || status === "NON_FULL_TIME_DIRECTOR") {
    const rate = status === "NON_RESIDENT" ? 1500 : 1500;
    const tax = roundBps(base, rate);
    return result("PAYE", base, tax, [{ label: status, baseTzs: base, rateBps: rate, taxTzs: tax }], [TANZANIA_TAX_SOURCES.TRA_PAYE_2026]);
  }
  if (status === "RESIDENT_SECONDARY") {
    const tax = roundBps(base, 3000);
    return result("PAYE", base, tax, [{ label: "Secondary employment — highest individual rate", baseTzs: base, rateBps: 3000, taxTzs: tax }], [TANZANIA_TAX_SOURCES.TRA_PAYE_2026], ["Secondary-employment withholding can be varied only through Commissioner authorization; confirm employee's primary-employer status."]);
  }
  const calc = progressiveTax(base, [
    { upTo: 270000, bps: 0 },
    { upTo: 520000, bps: 800 },
    { upTo: 760000, bps: 2000 },
    { upTo: 1000000, bps: 2500 },
    { upTo: null, bps: 3000 },
  ]);
  return result("PAYE", base, calc.tax, calc.lines, [TANZANIA_TAX_SOURCES.TRA_PAYE_2026, TANZANIA_TAX_SOURCES.TRA_INDIVIDUAL_2026, TANZANIA_TAX_SOURCES.OAG_INCOME_TAX_ACT_2023]);
}

export function calculateCorporateIncomeTax(input: {
  taxableIncomeTzs: number;
  specialRegimeClaimed?: boolean;
}): TaxCalculation {
  const base = input.taxableIncomeTzs;
  assertMoney(base, "Corporate taxable income");
  if (input.specialRegimeClaimed) {
    throw new TaxCalculationError("Special corporate regimes, incentives, perpetual-loss turnover tax and exemptions require a separately ratified rule; this standard-rate calculator refuses to apply them.");
  }
  const tax = roundBps(base, 3000);
  return result("CORPORATE_INCOME_TAX", base, tax, [{ label: "Standard corporate rate — Income Tax Act First Schedule para 3(1)", baseTzs: base, rateBps: 3000, taxTzs: tax }], [TANZANIA_TAX_SOURCES.OAG_INCOME_TAX_ACT_2023, TANZANIA_TAX_SOURCES.TRA_CORPORATION_2026], ["Special incentives, sector-specific rates, permanent-establishment repatriated income, loss rules, tax credits and adjustments are not modelled. Verify subsequent amendments before finalization."]);
}

export function calculatePersonalIncomeTax(input: {
  annualTaxableIncomeTzs: number;
  nonResident?: boolean;
}): TaxCalculation {
  const base = input.annualTaxableIncomeTzs;
  assertMoney(base, "Annual taxable income");
  if (input.nonResident) {
    const tax = roundBps(base, 3000);
    return result("PERSONAL_INCOME_TAX", base, tax, [{ label: "Non-resident individual — First Schedule para 1(4)", baseTzs: base, rateBps: 3000, taxTzs: tax }], [TANZANIA_TAX_SOURCES.OAG_INCOME_TAX_ACT_2023]);
  }
  const calc = progressiveTax(base, [
    { upTo: 3240000, bps: 0 },
    { upTo: 6240000, bps: 800 },
    { upTo: 9120000, bps: 2000 },
    { upTo: 12000000, bps: 2500 },
    { upTo: null, bps: 3000 },
  ]);
  return result("PERSONAL_INCOME_TAX", base, calc.tax, calc.lines, [TANZANIA_TAX_SOURCES.OAG_INCOME_TAX_ACT_2023, TANZANIA_TAX_SOURCES.TRA_INDIVIDUAL_2026], ["Investment-gain and commuted-pension special calculation, credits, foreign tax relief and other special rules are excluded."]);
}

export function calculateVat(input: {
  taxableSuppliesTzs: number;
  inputVatCreditTzs?: number;
  inputVatCreditVerified?: boolean;
  rate?: "STANDARD_18" | "ZERO_RATED";
}): TaxCalculation {
  const base = input.taxableSuppliesTzs;
  const inputCredit = input.inputVatCreditTzs ?? 0;
  assertMoney(base, "Taxable supplies");
  assertMoney(inputCredit, "Input VAT credit");
  const rate = input.rate ?? "STANDARD_18";
  const bps = rate === "ZERO_RATED" ? 0 : 1800;
  const output = roundBps(base, bps);
  const eligibleCredit = input.inputVatCreditVerified ? inputCredit : 0;
  const payable = Math.max(0, output - eligibleCredit);
  return result("VAT", base, payable, [
    { label: rate === "ZERO_RATED" ? "Zero-rated supplies" : "Mainland standard VAT", baseTzs: base, rateBps: bps, taxTzs: output },
    { label: input.inputVatCreditVerified ? "Verified input tax credit" : "Input tax credit not claimed pending evidence", baseTzs: eligibleCredit, rateBps: 0, taxTzs: -eligibleCredit },
  ], [TANZANIA_TAX_SOURCES.TRA_VAT_2026], [
    "Reduced 16% payment-channel rate and special designated categories are excluded; do not apply without the Commissioner General's applicable public notice and category verification.",
    "Exempt supplies, mixed-use apportionment, blocked input credits, six-month invoice rule, imports, reverse charge and special refund positions need additional rule-specific treatment.",
    ...(inputCredit > 0 && !input.inputVatCreditVerified ? ["Input VAT credit was excluded because supporting evidence was not marked verified."] : []),
    ...(eligibleCredit > output ? ["Excess input credit is shown as zero current payable; carry-forward/refund treatment must be prepared separately."] : []),
  ]);
}

export function calculateVatWithholding(input: {
  taxableValueTzs: number;
  supplyType: "GOODS" | "SERVICES" | "MIXED";
}): TaxCalculation {
  const base = input.taxableValueTzs;
  assertMoney(base, "Taxable supply value");
  const goodsBase = input.supplyType === "GOODS" ? base : input.supplyType === "MIXED" ? Math.round((base * 3) / 5) : 0;
  const servicesBase = base - goodsBase;
  const goodsTax = roundBps(goodsBase, 1500);
  const servicesTax = roundBps(servicesBase, 1200);
  return result("VAT_WITHHOLDING", base, goodsTax + servicesTax, [
    { label: "VAT withheld on goods — Finance Act 2026 s.91", baseTzs: goodsBase, rateBps: 1500, taxTzs: goodsTax },
    { label: "VAT withheld on services — Finance Act 2026 s.91", baseTzs: servicesBase, rateBps: 1200, taxTzs: servicesTax },
  ], [TANZANIA_TAX_SOURCES.OSG_FINANCE_ACT_2026, TANZANIA_TAX_SOURCES.TRA_VAT_2026], [
    "Only an appointed VAT withholding agent may withhold. Verify the appointment, taxable status, supply characterization and tax period before use.",
    "For mixed goods/services supplies, the statutory taxable value is apportioned 3:2 (goods:services).",
    "The official Finance Act text is reviewed, but original PDF bytes still require storage/checksum in the governed documents registry and specialist ratification.",
  ]);
}

export type WithholdingCategory =
  | "DIVIDEND_LISTED" | "DIVIDEND_OTHER" | "INTEREST" | "ROYALTY"
  | "OTHER_INVESTMENT_RETURN" | "COMMERCIAL_RENT" | "MINING_TECHNICAL_SERVICE"
  | "NON_RESIDENT_TRANSPORT" | "NON_RESIDENT_INSURANCE" | "GAMING_ADVERTISING_COMMISSION"
  | "SALT_PURCHASE" | "MOTOR_VEHICLE_HIRE" | "FOREST_PRODUCE"
  | "NATURAL_RESOURCE_PAYMENT" | "SERVICE_FEE" | "NON_FULL_TIME_DIRECTOR_FEE"
  | "MOBILE_MONEY_AGENT_COMMISSION" | "GOVERNMENT_GOODS_SUPPLY"
  | "AIRCRAFT_PAYMENT" | "CARBON_CREDIT" | "PRECIOUS_METALS";

const WHT_RATES: Record<WithholdingCategory, { resident: number | null; nonResident: number | null }> = {
  DIVIDEND_LISTED: { resident: 500, nonResident: 500 },
  DIVIDEND_OTHER: { resident: 1000, nonResident: 1000 },
  INTEREST: { resident: 1000, nonResident: 1000 },
  ROYALTY: { resident: 1000, nonResident: 1000 },
  OTHER_INVESTMENT_RETURN: { resident: 1500, nonResident: 1500 },
  COMMERCIAL_RENT: { resident: 1000, nonResident: 1000 },
  MINING_TECHNICAL_SERVICE: { resident: 1000, nonResident: 1500 },
  NON_RESIDENT_TRANSPORT: { resident: null, nonResident: 500 },
  NON_RESIDENT_INSURANCE: { resident: null, nonResident: 1000 },
  GAMING_ADVERTISING_COMMISSION: { resident: 1000, nonResident: null },
  SALT_PURCHASE: { resident: 200, nonResident: null },
  MOTOR_VEHICLE_HIRE: { resident: 1000, nonResident: null },
  FOREST_PRODUCE: { resident: 200, nonResident: null },
  NATURAL_RESOURCE_PAYMENT: { resident: 1500, nonResident: 1500 },
  SERVICE_FEE: { resident: 500, nonResident: 1500 },
  NON_FULL_TIME_DIRECTOR_FEE: { resident: 1500, nonResident: 1500 },
  MOBILE_MONEY_AGENT_COMMISSION: { resident: 1000, nonResident: null },
  GOVERNMENT_GOODS_SUPPLY: { resident: 200, nonResident: null },
  AIRCRAFT_PAYMENT: { resident: 1000, nonResident: 1500 },
  CARBON_CREDIT: { resident: 1000, nonResident: null },
  PRECIOUS_METALS: { resident: 200, nonResident: null },
};

export function calculateWithholdingTax(input: {
  grossPaymentTzs: number;
  category: WithholdingCategory;
  payeeResidency: "RESIDENT" | "NON_RESIDENT";
  treatyReliefClaimed?: boolean;
}): TaxCalculation {
  const base = input.grossPaymentTzs;
  assertMoney(base, "Gross payment");
  if (input.treatyReliefClaimed) throw new TaxCalculationError("Treaty relief cannot be applied without an authenticated, effective treaty and a specialist-approved beneficial-ownership/residency review.");
  const rate = WHT_RATES[input.category][input.payeeResidency === "RESIDENT" ? "resident" : "nonResident"];
  if (rate === null) throw new TaxCalculationError("This payment category/residency combination is not supported by the current published TRA schedule.");
  const tax = roundBps(base, rate);
  return result("WITHHOLDING_TAX", base, tax, [{ label: input.category, baseTzs: base, rateBps: rate, taxTzs: tax }], [TANZANIA_TAX_SOURCES.TRA_WHT_2026], ["Check payment characterization, exemption status, withholding-agent status, treaty eligibility and any 2026 Finance Act amendments before finalization."]);
}

export function calculatePresumptiveIncomeTax(input: {
  annualTurnoverTzs: number;
  records: "COMPLETE" | "INCOMPLETE";
  newBusinessReliefApproved?: boolean;
}): TaxCalculation {
  const turnover = input.annualTurnoverTzs;
  assertMoney(turnover, "Annual turnover");
  if (turnover > 200_000_000) throw new TaxCalculationError("Turnover exceeds the published presumptive regime threshold; use the ordinary income-tax computation.");
  if (input.newBusinessReliefApproved) {
    throw new TaxCalculationError("New-trader 12-month relief requires a separately authenticated GN 158B record and Commissioner approval; it is not applied by this calculator.");
  }
  let tax = 0;
  let label = "Turnover not exceeding TZS 4m";
  if (turnover > 11_000_000) {
    tax = roundBps(turnover, 400);
    label = "Turnover above TZS 11m and not exceeding TZS 200m";
  } else if (turnover > 7_000_000) {
    tax = input.records === "COMPLETE" ? 90000 + roundBps(turnover - 7_000_000, 300) : 250000;
    label = "Turnover above TZS 7m and not exceeding TZS 11m";
  } else if (turnover > 4_000_000) {
    tax = input.records === "COMPLETE" ? roundBps(turnover - 4_000_000, 300) : 100000;
    label = "Turnover above TZS 4m and not exceeding TZS 7m";
  }
  return result("PRESUMPTIVE_INCOME_TAX", turnover, tax, [{ label: `${label} — ${input.records.toLowerCase()} records`, baseTzs: turnover, rateBps: turnover === 0 ? 0 : Math.round((tax / turnover) * 10000), taxTzs: tax }], [TANZANIA_TAX_SOURCES.OSG_FINANCE_ACT_2026, TANZANIA_TAX_SOURCES.TRA_PRESUMPTIVE_2026, TANZANIA_TAX_SOURCES.TRA_INDIVIDUAL_2026], ["The published TRA guidance schedule is used; confirm statutory crosswalk, eligibility (resident individual, business-only income, excluded professions/services) and the GN 158B new-trader relief before finalizing."]);
}

export function calculateCustomsProcessingFee(input: {
  cargoType: "DRY_NON_PETROLEUM" | "WET_PETROLEUM";
  importOrigin: "NON_EAC" | "EAC_NON_ORIGINATING" | "EAC_ORIGINATING";
  originEvidenceVerified: boolean;
  fobValueTzs?: number;
  vesselCount?: number;
  exemptionClaimed?: boolean;
}): TaxCalculation {
  if (input.exemptionClaimed) {
    throw new TaxCalculationError("Customs exemptions require a verified GN 158D Second Schedule category, documentary proof and customs-specialist approval; automated exemption is disabled.");
  }
  if (input.importOrigin === "EAC_ORIGINATING") {
    if (!input.originEvidenceVerified) throw new TaxCalculationError("EAC originating status requires verified Rules of Origin evidence.");
    return result("CUSTOMS_PROCESSING_FEE", 0, 0, [{ label: "Outside GN 158D fee scope — verified EAC origin", baseTzs: 0, rateBps: 0, taxTzs: 0 }], [TANZANIA_TAX_SOURCES.OAG_GN_158D_2026], ["Confirm Rules of Origin certificate and customs entry evidence before relying on the zero-fee outcome."]);
  }
  if (input.importOrigin === "EAC_NON_ORIGINATING" && !input.originEvidenceVerified) {
    throw new TaxCalculationError("EAC non-originating status must be supported by a customs-origin determination.");
  }
  if (input.cargoType === "DRY_NON_PETROLEUM") {
    const fob = input.fobValueTzs ?? -1;
    assertMoney(fob, "FOB value");
    const fee = roundBps(fob, 100);
    return result("CUSTOMS_PROCESSING_FEE", fob, fee, [{ label: "Dry cargo — 1% of FOB value", baseTzs: fob, rateBps: 100, taxTzs: fee }], [TANZANIA_TAX_SOURCES.OAG_GN_158D_2026], ["Only for covered home-consumption imports; verify cargo category, customs value and Second Schedule exemptions."]);
  }
  const vessels = input.vesselCount ?? 0;
  if (!Number.isSafeInteger(vessels) || vessels <= 0) throw new TaxCalculationError("Wet petroleum cargo requires a positive whole vessel count.");
  const fee = vessels * 20_000_000;
  if (!Number.isSafeInteger(fee)) throw new TaxCalculationError("Calculated customs processing fee exceeds safe integer range.");
  return result("CUSTOMS_PROCESSING_FEE", 0, fee, [{ label: `Specified wet petroleum cargo — TZS 20m per vessel (${vessels} vessels)`, baseTzs: 0, rateBps: 0, taxTzs: fee }], [TANZANIA_TAX_SOURCES.OAG_GN_158D_2026], ["Applies only to specified wet petroleum cargo (diesel, petrol, Jet A-1 and illuminating kerosene); confirm the cargo is covered and no exemption applies."]);
}

export function computeTanzaniaTax(input:
  | { taxType: "PAYE"; monthlyTaxablePayTzs: number; employeeStatus?: Parameters<typeof calculatePaye>[0]["employeeStatus"] }
  | { taxType: "CORPORATE_INCOME_TAX"; taxableIncomeTzs: number; specialRegimeClaimed?: boolean }
  | { taxType: "PERSONAL_INCOME_TAX"; annualTaxableIncomeTzs: number; nonResident?: boolean }
  | { taxType: "PRESUMPTIVE_INCOME_TAX"; annualTurnoverTzs: number; records: "COMPLETE" | "INCOMPLETE"; newBusinessReliefApproved?: boolean }
  | { taxType: "VAT"; taxableSuppliesTzs: number; inputVatCreditTzs?: number; inputVatCreditVerified?: boolean; rate?: "STANDARD_18" | "ZERO_RATED" }
  | { taxType: "VAT_WITHHOLDING"; taxableValueTzs: number; supplyType: "GOODS" | "SERVICES" | "MIXED" }
  | { taxType: "WITHHOLDING_TAX"; grossPaymentTzs: number; category: WithholdingCategory; payeeResidency: "RESIDENT" | "NON_RESIDENT"; treatyReliefClaimed?: boolean }
  | { taxType: "CUSTOMS_PROCESSING_FEE"; cargoType: "DRY_NON_PETROLEUM" | "WET_PETROLEUM"; importOrigin: "NON_EAC" | "EAC_NON_ORIGINATING" | "EAC_ORIGINATING"; originEvidenceVerified: boolean; fobValueTzs?: number; vesselCount?: number; exemptionClaimed?: boolean }
): TaxCalculation {
  switch (input.taxType) {
    case "PAYE": return calculatePaye(input);
    case "CORPORATE_INCOME_TAX": return calculateCorporateIncomeTax(input);
    case "PERSONAL_INCOME_TAX": return calculatePersonalIncomeTax(input);
    case "PRESUMPTIVE_INCOME_TAX": return calculatePresumptiveIncomeTax(input);
    case "VAT": return calculateVat(input);
    case "VAT_WITHHOLDING": return calculateVatWithholding(input);
    case "WITHHOLDING_TAX": return calculateWithholdingTax(input);
    case "CUSTOMS_PROCESSING_FEE": return calculateCustomsProcessingFee(input);
  }
}


function addMonthsDate(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const monthIndex = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, monthIndex + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, monthIndex, Math.min(day, lastDay))).toISOString().slice(0, 10);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type TaxFilingPack = {
  status: "DRAFT_NOT_SUBMITTED";
  returnType: TanzaniaTaxType;
  taxpayer: { legalEntityId: string; legalName: string; tin: string };
  periodStart: string;
  periodEnd: string;
  dueDate: string | null;
  amountPayableTzs: number;
  paymentMilestones: Array<{ dueDate: string; label: string }>;
  calculation: TaxCalculation;
  checklist: string[];
  requiredApprovals: string[];
  submission: { channel: "TRA_IDRAS_OR_TAXPAYER_PORTAL"; status: "NOT_SUBMITTED"; receiptNumber: null };
};

export function prepareTaxFilingPack(input: {
  taxpayer: { legalEntityId: string; legalName: string; tin: string };
  periodStart: string;
  periodEnd: string;
  calculation: TaxCalculation;
}): TaxFilingPack {
  if (!input.taxpayer.legalEntityId || !input.taxpayer.legalName.trim() || !/^\d{9}$/.test(input.taxpayer.tin)) {
    throw new TaxCalculationError("Taxpayer legal entity, legal name and nine-digit TIN are required to prepare a filing pack.");
  }
  if (!validDate(input.periodStart) || !validDate(input.periodEnd) || input.periodEnd < input.periodStart) {
    throw new TaxCalculationError("Filing period must contain valid ordered ISO dates.");
  }
  const isCalendarYear = input.periodStart.endsWith("-01-01") && input.periodEnd.endsWith("-12-31") &&
    input.periodStart.slice(0, 4) === input.periodEnd.slice(0, 4);
  if (["PERSONAL_INCOME_TAX", "PRESUMPTIVE_INCOME_TAX"].includes(input.calculation.taxType) && !isCalendarYear) {
    throw new TaxCalculationError("Individual and presumptive year-of-income filing packs require 1 January through 31 December.");
  }
  let dueDate: string | null = null;
  const paymentMilestones: Array<{ dueDate: string; label: string }> = [];
  if (["VAT", "VAT_WITHHOLDING", "PAYE", "WITHHOLDING_TAX"].includes(input.calculation.taxType)) {
    const start = new Date(`${input.periodStart}T00:00:00Z`);
    const end = new Date(`${input.periodEnd}T00:00:00Z`);
    const firstDay = start.getUTCDate() === 1;
    const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    if (!firstDay || !sameMonth || end.getUTCDate() !== lastDay) {
      throw new TaxCalculationError("VAT, PAYE and withholding filing packs require one complete calendar-month period.");
    }
  }
  if (input.calculation.taxType === "VAT") {
    const nextMonth = addMonthsDate(input.periodEnd, 1);
    dueDate = `${nextMonth.slice(0, 7)}-20`;
  } else if (input.calculation.taxType === "PAYE" || input.calculation.taxType === "WITHHOLDING_TAX") {
    const nextMonth = addMonthsDate(input.periodEnd, 1);
    dueDate = `${nextMonth.slice(0, 7)}-07`;
  } else if (input.calculation.taxType === "CORPORATE_INCOME_TAX" || input.calculation.taxType === "PERSONAL_INCOME_TAX") {
    dueDate = addMonthsDate(input.periodEnd, 6);
  }
  if (["CORPORATE_INCOME_TAX", "PERSONAL_INCOME_TAX", "PRESUMPTIVE_INCOME_TAX"].includes(input.calculation.taxType) && isCalendarYear) {
    const year = Number(input.periodEnd.slice(0, 4));
    const dates = ["03-31", "06-30", "09-30", "12-31"];
    dates.forEach((date, index) => paymentMilestones.push({
      dueDate: `${year}-${date}`,
      label: index === 0 ? "First estimated-tax instalment / provisional statement" : `Estimated-tax instalment ${index + 1}`,
    }));
    if (input.calculation.taxType === "PRESUMPTIVE_INCOME_TAX" && input.calculation.taxAmountTzs <= 50000) paymentMilestones.splice(0, paymentMilestones.length);
  }
  return {
    status: "DRAFT_NOT_SUBMITTED",
    returnType: input.calculation.taxType,
    taxpayer: input.taxpayer,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    dueDate,
    amountPayableTzs: input.calculation.taxAmountTzs,
    calculation: input.calculation,
    checklist: [
      "Confirm TIN and tax registration for this return type.",
      "Reconcile taxable income/supplies/payments to the general ledger and source documents.",
      "Attach invoices, payroll, withholding certificates, bank/payment evidence and supporting schedules as applicable.",
      "Verify tax rules and all amendments effective during the filing period.",
      "Obtain Tax Specialist review and Finance Controller approval.",
      "Confirm the due date and filing form against the current TRA portal before submission.",
    ],
    requiredApprovals: ["TAX_SPECIALIST", "FINANCE_CONTROLLER"],
    submission: { channel: "TRA_IDRAS_OR_TAXPAYER_PORTAL", status: "NOT_SUBMITTED", receiptNumber: null },
  };
}
