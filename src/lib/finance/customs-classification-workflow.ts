/**
 * FINANCE_OS — customs classification and valuation case workflow.
 * No HS code, tariff, customs value, exemption or origin is machine-inferred.
 */
export type CustomsClassificationCase = {
  caseId: string;
  tenantId: string;
  legalEntityId: string;
  jurisdictionCode: "TZ_MAINLAND";
  goodsDescription: string;
  composition: string;
  functionAndUse: string;
  manufacturingProcess: string;
  modelOrPartNumber: string | null;
  countryOfOrigin: string | null;
  proposedHsCode: string | null;
  customsValueTzs: number | null;
  valuationMethod: "TRANSACTION_VALUE" | "IDENTICAL_GOODS" | "SIMILAR_GOODS" | "DEDUCTIVE" | "COMPUTED" | "FALLBACK" | null;
  evidenceDocumentIds: readonly string[];
  status: "DRAFT" | "AWAITING_CUSTOMS_SPECIALIST" | "RULING_REQUESTED" | "SPECIALIST_DETERMINED" | "REJECTED";
  specialistId: string | null;
  determinationReference: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};
export type CustomsClassificationReadiness = {
  readyForSpecialist: boolean;
  canCalculateDuty: false;
  blockers: string[];
  activationBlockers: string[];
};
export function assessCustomsClassificationReadiness(input: CustomsClassificationCase): CustomsClassificationReadiness {
  const blockers: string[] = [];
  const activationBlockers: string[] = [];
  if (!input.goodsDescription.trim()) blockers.push("Specific commercial goods description is required.");
  if (!input.composition.trim()) blockers.push("Material/composition and constituent proportions are required.");
  if (!input.functionAndUse.trim()) blockers.push("Principal function and intended use are required.");
  if (!input.manufacturingProcess.trim()) blockers.push("Manufacturing/processing details are required.");
  if (input.evidenceDocumentIds.length === 0) blockers.push("Invoices, catalogue/specification sheets and product photographs must be attached to the governed evidence vault.");
  if (!input.countryOfOrigin) blockers.push("Country of origin and Rules of Origin evidence are required.");
  if (!input.customsValueTzs || !Number.isSafeInteger(input.customsValueTzs) || input.customsValueTzs <= 0) blockers.push("Customs value and valuation evidence are required.");
  if (!input.valuationMethod) blockers.push("A GATT/WTO customs valuation method must be identified and justified.");
  if (!input.specialistId || !input.determinationReference || !input.effectiveFrom) {
    activationBlockers.push("Named specialist HS determination/ruling and effective date are required before any duty computation.");
  }
  return {
    readyForSpecialist: blockers.length === 0,
    canCalculateDuty: false,
    blockers,
    activationBlockers: [
      ...activationBlockers,
      "An authenticated, effective-dated customs tariff and exemption schedule must be approved before duty calculation.",
    ],
  };
}
