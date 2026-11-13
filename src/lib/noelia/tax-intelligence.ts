/**
 * NOELIA Tax Intelligence — source-bound explanation helpers.
 * NOELIA may explain and compare approved materials; it cannot create authority.
 */
export type NoeliaTaxCitation = { sourceCode: string; title: string; provision: string; jurisdictionCode: string; effectiveFrom: string; effectiveTo: string | null; authorityStatus: string; sourceAuthenticationStatus: string; uri: string };
export function filterNoeliaTaxCitations(input: { citations: readonly NoeliaTaxCitation[]; jurisdictionCode: string; asOf: string }): { citations: NoeliaTaxCitation[]; requiresAuthority: boolean; explanation: string } {
  const citations = input.citations.filter((source) =>
    source.jurisdictionCode === input.jurisdictionCode &&
    source.authorityStatus === "AUTHORITATIVE" &&
    source.sourceAuthenticationStatus === "AUTHORITATIVE" &&
    source.effectiveFrom <= input.asOf &&
    (source.effectiveTo === null || source.effectiveTo >= input.asOf) &&
    Boolean(source.uri),
  );
  return {
    citations,
    requiresAuthority: citations.length === 0,
    explanation: citations.length
      ? "Answer only within the propositions supported by the cited, authenticated, effective-dated sources. Distinguish statutory text, administrative guidance, interpretation and recommendation."
      : "REQUIRES_AUTHORITY: no authenticated and effective source is available. Do not infer a tax rate, filing deadline, exemption, tariff or legal conclusion.",
  };
}
