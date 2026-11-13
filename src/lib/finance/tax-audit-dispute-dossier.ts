/**
 * FINANCE_OS — tax audit, objection and appeal evidence dossier.
 * Risk scoring is a triage aid, never a finding of fraud or legal liability.
 */
function validCalendarDate(value: string): boolean {\n  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return false;\n  const parsed = new Date(`${value}T00:00:00.000Z`);\n  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;\n}\n\nexport type TaxDisputeStage = "PRE_AUDIT" | "AUDIT_NOTICE" | "INFORMATION_REQUEST" | "ASSESSMENT" | "OBJECTION" | "APPEAL" | "SETTLED" | "CLOSED";
export type TaxEvidenceItem = {
  documentId: string;
  sha256: string;
  evidenceType: "RETURN" | "LEDGER" | "INVOICE" | "CONTRACT" | "BANK" | "PAYROLL" | "CUSTOMS_ENTRY" | "CORRESPONDENCE" | "LEGAL_AUTHORITY" | "OTHER";
  periodStart: string;
  periodEnd: string;
  collectedBy: string;
  collectedAt: string;
  description: string;
};
export type TaxDisputeDossier = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  jurisdictionCode: string;
  stage: TaxDisputeStage;
  taxType: string;
  periodStart: string;
  periodEnd: string;
  noticeOrAssessmentReference: string | null;
  statutoryDeadline: string | null;
  disputedAmountTzs: number | null;
  evidence: readonly TaxEvidenceItem[];
  precedentSourceCodes: readonly string[];
  specialistOwnerId: string | null;
};
export function validateTaxDisputeDossier(dossier: TaxDisputeDossier): { readyForSpecialist: boolean; blockers: string[] } {
  const blockers: string[] = [];
  if (!dossier.tenantId || !dossier.legalEntityId || !dossier.jurisdictionCode) blockers.push("Tenant, legal entity and jurisdiction scope are required.");
  if (!validCalendarDate(dossier.periodStart) || !validCalendarDate(dossier.periodEnd) || dossier.periodEnd < dossier.periodStart) blockers.push("Dossier period must contain valid ordered ISO calendar dates.");\n  if (dossier.statutoryDeadline && !validCalendarDate(dossier.statutoryDeadline)) blockers.push("Statutory deadline must be a valid ISO calendar date.");\n  if (dossier.disputedAmountTzs !== null && (!Number.isSafeInteger(dossier.disputedAmountTzs) || dossier.disputedAmountTzs < 0)) blockers.push("Disputed amount must be a non-negative whole TZS safe integer.");\n  if (!dossier.noticeOrAssessmentReference && !["PRE_AUDIT", "CLOSED"].includes(dossier.stage)) blockers.push("Official TRA notice, assessment or appeal reference is required.");
  if (dossier.stage !== "PRE_AUDIT" && !dossier.statutoryDeadline) blockers.push("Statutory response/appeal deadline must be recorded from the notice and verified law.");
  if (!dossier.specialistOwnerId) blockers.push("Named tax/audit specialist ownership is required.");
  if (dossier.evidence.length === 0) blockers.push("At least one source document is required in the governed evidence vault.");
  for (const item of dossier.evidence) {
    if (!/^[a-f0-9]{64}$/i.test(item.sha256)) blockers.push(`Evidence ${item.documentId} has no valid SHA-256 checksum.`);\n    if (!item.documentId || !item.collectedBy || !validCalendarDate(item.collectedAt)) blockers.push(`Evidence ${item.documentId || "(unknown)"} must have a document ID, collector and valid collection date.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(item.periodEnd) || item.periodEnd < item.periodStart) blockers.push(`Evidence ${item.documentId} has an invalid period.`);
  }
  return { readyForSpecialist: blockers.length === 0, blockers };
}
export function taxAuditRiskTriage(input: { lateReturns: number; unexplainedLedgerVariancesTzs: number; missingWithholdingCertificates: number; unsupportedInputVatCreditsTzs: number; customsValueAdjustments: number }): { score: number; band: "LOW" | "MODERATE" | "HIGH" | "CRITICAL"; factors: string[]; disclaimer: string } {
  const factors: string[] = [];
  const score = Math.min(100,
    Math.max(0, input.lateReturns) * 12 +
    (input.unexplainedLedgerVariancesTzs > 0 ? 20 : 0) +
    Math.max(0, input.missingWithholdingCertificates) * 8 +
    (input.unsupportedInputVatCreditsTzs > 0 ? 25 : 0) +
    Math.max(0, input.customsValueAdjustments) * 7);
  if (input.lateReturns > 0) factors.push("Late return history");
  if (input.unexplainedLedgerVariancesTzs > 0) factors.push("Unexplained ledger-to-return variance");
  if (input.missingWithholdingCertificates > 0) factors.push("Missing withholding certificates");
  if (input.unsupportedInputVatCreditsTzs > 0) factors.push("Input VAT credits lacking supporting evidence");
  if (input.customsValueAdjustments > 0) factors.push("Customs valuation adjustments");
  return { score, band: score >= 75 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 25 ? "MODERATE" : "LOW", factors, disclaimer: "Risk triage only; not a finding of evasion, fraud, tax liability or TRA audit selection." };
}
