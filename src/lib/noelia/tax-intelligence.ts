import type { NoeliaToolOutput } from "./types";

/**
 * NOELIA Tax Intelligence — source-bound explanation helpers.
 * NOELIA may explain and compare approved materials; it cannot create authority.
 */
export type NoeliaTaxCitation = { sourceCode: string; title: string; provision: string; jurisdictionCode: string; effectiveFrom: string; effectiveTo: string | null; authorityStatus: string; sourceAuthenticationStatus: string; uri: string };
export function filterNoeliaTaxCitations(input: { citations: readonly NoeliaTaxCitation[]; jurisdictionCode: string; additionalJurisdictionCodes?: readonly string[]; asOf: string }): { citations: NoeliaTaxCitation[]; requiresAuthority: boolean; explanation: string } {
  const parsedAsOf = new Date(`${input.asOf}T00:00:00.000Z`);
  const validAsOf = /^\d{4}-\d{2}-\d{2}$/.test(input.asOf) && Number.isFinite(parsedAsOf.getTime()) && parsedAsOf.toISOString().slice(0, 10) === input.asOf;
  const allowedJurisdictions = new Set([input.jurisdictionCode, ...(input.additionalJurisdictionCodes ?? [])]);
  const citations = validAsOf ? input.citations.filter((source) =>
    allowedJurisdictions.has(source.jurisdictionCode) &&
    (source.authorityStatus === "AUTHORITATIVE" || (source.authorityStatus === "SUPERSEDED" && source.effectiveTo !== null)) &&
    source.sourceAuthenticationStatus === "AUTHORITATIVE" &&
    source.effectiveFrom <= input.asOf &&
    (source.effectiveTo === null || source.effectiveTo >= input.asOf) &&
    Boolean(source.uri),
  ) : [];
  return {
    citations,
    requiresAuthority: citations.length === 0,
    explanation: citations.length
      ? "Answer only within the propositions supported by the cited, authenticated, effective-dated sources. Distinguish statutory text, administrative guidance, interpretation and recommendation."
      : "REQUIRES_AUTHORITY: no authenticated and effective source is available. Do not infer a tax rate, filing deadline, exemption, tariff or legal conclusion.",
  };
}

export type NoeliaTaxCalculationExplanationInput = {
  draftId: string;
  draftStatus: string;
  calculation: {
    taxType: string;
    taxBaseTzs: number;
    taxAmountTzs: number;
    effectiveRateBps: number;
    breakdown: Array<{ label: string; baseTzs: number; rateBps: number; taxTzs: number }>;
    sourceRefs: Array<{ code: string; title: string; provision: string; uri: string; effectiveFrom?: string; evidenceStatus?: string }>;
    warnings: string[];
    formulaVersion?: string;
    sourceSnapshotDate?: string;
  };
  filingPack: {
    dueDate: string | null;
    paymentMilestones?: Array<{ dueDate: string; label: string }>;
    complianceObligations?: Array<{ kind: string; dueDate: string; status: string; sourceCodes: string[] }>;
  } | null;
  authoritativeCitations: readonly NoeliaTaxCitation[];
};

const formatTzs = (value: number) => new Intl.NumberFormat("en-TZ", {
  style: "currency",
  currency: "TZS",
  maximumFractionDigits: 0,
}).format(value);

/** Explain a persisted calculation without converting a draft into legal approval or a filing. */
export function buildNoeliaTaxCalculationExplanation(input: NoeliaTaxCalculationExplanationInput): NoeliaToolOutput {
  const verifiedCodes = new Set(input.authoritativeCitations.map((citation) => citation.sourceCode));
  const missingSourceCodes = input.calculation.sourceRefs
    .map((source) => source.code)
    .filter((code) => !verifiedCodes.has(code));
  const findings = [
    { label: "Tax type", value: input.calculation.taxType, kind: "FACT" as const, status: "OBSERVED" as const },
    { label: "Tax base", value: formatTzs(input.calculation.taxBaseTzs), kind: "INFERENCE" as const, status: "DERIVED" as const },
    { label: "Calculated amount", value: formatTzs(input.calculation.taxAmountTzs), kind: "INFERENCE" as const, status: "DERIVED" as const },
    { label: "Effective rate", value: (input.calculation.effectiveRateBps / 100).toFixed(2) + "%", kind: "INFERENCE" as const, status: "DERIVED" as const },
    { label: "Draft status", value: input.draftStatus, kind: "FACT" as const, status: "OBSERVED" as const },
    ...(input.filingPack?.dueDate ? [{ label: "Filing/payment due date", value: input.filingPack.dueDate, kind: "INFERENCE" as const, status: "DERIVED" as const }] : []),
    ...input.calculation.breakdown.slice(0, 12).map((line) => ({
      label: line.label,
      value: `${formatTzs(line.taxTzs)} on ${formatTzs(line.baseTzs)} at ${(line.rateBps / 100).toFixed(2)}%`,
      kind: "INFERENCE" as const,
      status: "DERIVED" as const,
    })),
  ];
  const sourceWarnings = missingSourceCodes.length
    ? [`No currently authenticated, effective-dated legal source was found for: ${[...new Set(missingSourceCodes)].join(", ")}.`]
    : [];
  const complianceRisks = (input.filingPack?.complianceObligations ?? [])
    .filter((item) => item.status !== "CONFIRMED")
    .map((item) => `${item.kind} due ${item.dueDate} remains ${item.status.toLowerCase().replaceAll("_", " ")}.`);
  return {
    headline: `Explanation of ${input.calculation.taxType} draft ${input.draftId}`,
    findings,
    sources: input.authoritativeCitations.map((source) => ({
      kind: "TAX_LEGAL_AUTHORITY",
      ref: source.sourceCode,
      label: `${source.title} — ${source.provision}`,
      authority: source.authorityStatus,
    })),
    narrative: "This is an explanation of a stored internal calculation and filing workpaper. It is not a tax assessment, specialist approval, TRA submission or proof of payment. The breakdown shows the calculation inputs and formula components retained with the draft.",
    risks: [
      ...input.calculation.warnings,
      ...sourceWarnings,
      ...complianceRisks,
      "The return remains a draft until the independent specialist review and finance approval workflow completes.",
      "A submitted return is not accepted until an authoritative TRA acknowledgement/receipt is attached and validated.",
    ],
    assumptions: [
      ...(input.calculation.formulaVersion ? [`Formula version: ${input.calculation.formulaVersion}.`] : []),
      ...(input.calculation.sourceSnapshotDate ? [`Source snapshot date: ${input.calculation.sourceSnapshotDate}.`] : []),
    ],
    whatIsMissing: missingSourceCodes.length ? [...new Set(missingSourceCodes)] : [],
    humanReviewRequired: true,
    confidence: missingSourceCodes.length ? 0.35 : 0.65,
    metadata: {
      draftId: input.draftId,
      draftStatus: input.draftStatus,
      dueDate: input.filingPack?.dueDate ?? null,
      paymentMilestones: input.filingPack?.paymentMilestones ?? [],
      authoritativeSourceCount: input.authoritativeCitations.length,
      missingSourceCount: new Set(missingSourceCodes).size,
    },
  };
}
