/**
 * FINANCE_OS — governed tax-intelligence capability contracts.
 *
 * This module is deliberately data- and authority-driven. It does not seed
 * Tanzanian tax rates, customs tariffs, filing deadlines, exemptions or legal
 * conclusions. A source is usable only after original-document authentication,
 * text validation and named specialist review. Operations remain gated until
 * both capability activation and a scoped specialist approval are recorded.
 *
 * Persistence continues through the canonical knowledge_sources registry and
 * governed knowledge.ingest workflow; this module is the domain contract, not
 * a second document store.
 */

export const TAX_INTELLIGENCE_CAPABILITIES = [
  {
    code: "TAX_LAW_INTELLIGENCE",
    title: "Tax Law Intelligence",
    description: "Effective-dated legislation, interpretations, amendments, exemptions, rulings and source relationships.",
    activation: "SOURCE_AUTHENTICATION_FIRST",
  },
  {
    code: "TAX_COMPUTATION_ENGINE",
    title: "Tax Computation Engine",
    description: "Income tax, corporate tax, PAYE, VAT, withholding, presumptive and other verified tax computations.",
    activation: "SPECIALIST_APPROVAL_REQUIRED",
  },
  {
    code: "CUSTOMS_INTELLIGENCE",
    title: "Customs & HS Intelligence",
    description: "HS classification, customs valuation, duties, exemptions, import controls and processing fees.",
    activation: "SPECIALIST_APPROVAL_REQUIRED",
  },
  {
    code: "TAX_COMPLIANCE_MANAGEMENT",
    title: "Tax Compliance Management",
    description: "Filing calendars, due dates, returns, payments, certificates and compliance monitoring.",
    activation: "SPECIALIST_APPROVAL_REQUIRED",
  },
  {
    code: "TAX_AUDIT_DISPUTE_INTELLIGENCE",
    title: "Tax Audit & Dispute Intelligence",
    description: "Audit readiness, evidence, objections, appeals, precedents and risk assessment.",
    activation: "SPECIALIST_APPROVAL_REQUIRED",
  },
  {
    code: "NOELIA_TAX_INTELLIGENCE",
    title: "NOELIA Tax Intelligence",
    description: "Cited answers, provision comparisons, calculation explanations and compliance-risk discovery.",
    activation: "VERIFIED_SOURCES_ONLY",
  },
] as const;

export type TaxCapabilityCode = (typeof TAX_INTELLIGENCE_CAPABILITIES)[number]["code"];
export type TaxInstrumentKind =
  | "ACT" | "FINANCE_ACT" | "REGULATION" | "ORDER" | "TREATY"
  | "RULING" | "JUDGMENT" | "PRACTICE_NOTICE" | "RATE_TABLE"
  | "CUSTOMS_TARIFF" | "CUSTOMS_NOTICE" | "OFFICIAL_FORM" | "OTHER";
export type TaxSourceAuthorityStatus =
  | "DISCOVERED" | "OFFICIAL_METADATA_VERIFIED" | "ORIGINAL_ACQUIRED"
  | "CHECKSUM_VERIFIED" | "TEXT_VALIDATED" | "SPECIALIST_REVIEWED"
  | "AUTHORITATIVE" | "SUPERSEDED" | "REJECTED";

export type TaxLegalAuthorityRecord = {
  sourceCode: string;
  title: string;
  jurisdictionCode: string;
  instrumentKind: TaxInstrumentKind;
  sourceUri: string | null;
  /** SHA-256 of the original acquired source file, not a third-party transcription. */
  sourceSha256: string | null;
  sourceAuthorityStatus: TaxSourceAuthorityStatus;
  publishedOn: string | null;
  commencedOn: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  officialSourceHost: string | null;
  textValidatedAt: string | null;
  textValidatedBy: string | null;
  specialistReviewedAt: string | null;
  specialistReviewerId: string | null;
  enablingProvision: string | null;
  amendsSourceCodes: readonly string[];
  repealsSourceCodes: readonly string[];
  supersedesSourceCodes: readonly string[];
  provisionReferences: readonly string[];
};

export type TaxSourceAuthenticationResult = {
  authenticated: boolean;
  sourceCode: string;
  reasons: string[];
};

/** Validate an ISO calendar date without relying on permissive Date parsing. */
export function isTaxIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Authentication is intentionally stricter than an OAG/TRA metadata listing.
 * Metadata alone never promotes a source to AUTHORITATIVE.
 */
export function authenticateTaxLegalSource(
  source: TaxLegalAuthorityRecord,
  approvedOfficialHosts: readonly string[],
): TaxSourceAuthenticationResult {
  const reasons: string[] = [];
  if (!source.sourceUri || !source.officialSourceHost) {
    reasons.push("Original official source URI and host are required.");
  } else {
    try {
      const uri = new URL(source.sourceUri);
      if (uri.protocol !== "https:" || uri.hostname.toLowerCase() !== source.officialSourceHost.toLowerCase()) {
        reasons.push("Source URI must be HTTPS and match its declared official host.");
      }
      if (!approvedOfficialHosts.map((host) => host.toLowerCase()).includes(uri.hostname.toLowerCase())) {
        reasons.push("Source host is not in the approved official-source host register.");
      }
    } catch {
      reasons.push("Source URI is invalid.");
    }
  }
  if (!source.sourceSha256 || !/^[a-f0-9]{64}$/i.test(source.sourceSha256)) {
    reasons.push("SHA-256 checksum of the acquired original document is required.");
  }
  if (!isTaxIsoDate(source.publishedOn)) reasons.push("Publication date is missing or invalid.");
  if (!isTaxIsoDate(source.commencedOn)) reasons.push("Commencement date is missing or invalid.");
  if (!isTaxIsoDate(source.effectiveFrom)) reasons.push("Effective-from date is missing or invalid.");
  if (source.effectiveTo && !isTaxIsoDate(source.effectiveTo)) reasons.push("Effective-to date is invalid.");
  if (source.effectiveTo && source.effectiveFrom && source.effectiveTo < source.effectiveFrom) {
    reasons.push("Effective-to date precedes effective-from date.");
  }
  if (!isTaxIsoDate(source.textValidatedAt) || !source.textValidatedBy) {
    reasons.push("Source text must be validated against the original page images by a named reviewer.");
  }
  if (!isTaxIsoDate(source.specialistReviewedAt) || !source.specialistReviewerId) {
    reasons.push("A named tax/legal specialist review is required.");
  }
  if (source.sourceAuthorityStatus !== "AUTHORITATIVE") {
    reasons.push(`Source authority status is ${source.sourceAuthorityStatus}; AUTHORITATIVE is required.`);
  }
  if (source.instrumentKind === "REGULATION" || source.instrumentKind === "ORDER") {
    if (!source.enablingProvision) reasons.push("Subsidiary legislation must identify its enabling statutory provision.");
  }
  if (source.provisionReferences.length === 0) {
    reasons.push("At least one page/section/regulation/article citation is required.");
  }
  return { authenticated: reasons.length === 0, sourceCode: source.sourceCode, reasons };
}

export function selectEffectiveTaxAuthorities(
  sources: readonly TaxLegalAuthorityRecord[],
  jurisdictionCode: string,
  asOf: string,
  approvedOfficialHosts: readonly string[],
): TaxLegalAuthorityRecord[] {
  if (!isTaxIsoDate(asOf)) throw new Error("asOf must be a valid ISO calendar date.");
  return sources
    .filter((source) =>
      source.jurisdictionCode === jurisdictionCode &&
      source.effectiveFrom !== null &&
      source.effectiveFrom <= asOf &&
      (source.effectiveTo === null || source.effectiveTo >= asOf) &&
      authenticateTaxLegalSource(source, approvedOfficialHosts).authenticated,
    )
    .sort((a, b) => a.sourceCode.localeCompare(b.sourceCode));
}

export type TaxSpecialistRole =
  | "TAX_SPECIALIST" | "TAX_MANAGER" | "CUSTOMS_SPECIALIST"
  | "COMPLIANCE_SPECIALIST" | "AUDIT_SPECIALIST" | "FINANCE_CONTROLLER";
export type TaxSpecialistApproval = {
  approvalRef: string;
  capability: TaxCapabilityCode;
  status: "PENDING" | "APPROVED" | "REVOKED";
  approverId: string;
  approverRole: TaxSpecialistRole;
  approvedAt: string;
  expiresAt: string | null;
  sourceCodes: readonly string[];
};

export type TaxCapabilityActivation = {
  capability: TaxCapabilityCode;
  status: "INACTIVE" | "PILOT" | "ACTIVE";
  activationApprovalRef: string | null;
};

const REQUIRED_APPROVER_ROLES: Record<TaxCapabilityCode, readonly TaxSpecialistRole[]> = {
  TAX_LAW_INTELLIGENCE: ["TAX_SPECIALIST", "TAX_MANAGER"],
  TAX_COMPUTATION_ENGINE: ["TAX_SPECIALIST", "TAX_MANAGER", "FINANCE_CONTROLLER"],
  CUSTOMS_INTELLIGENCE: ["CUSTOMS_SPECIALIST", "TAX_MANAGER"],
  TAX_COMPLIANCE_MANAGEMENT: ["TAX_SPECIALIST", "TAX_MANAGER", "COMPLIANCE_SPECIALIST"],
  TAX_AUDIT_DISPUTE_INTELLIGENCE: ["TAX_SPECIALIST", "TAX_MANAGER", "AUDIT_SPECIALIST"],
  NOELIA_TAX_INTELLIGENCE: ["TAX_SPECIALIST", "TAX_MANAGER"],
};

export type TaxOperationGate = {
  allowed: boolean;
  status: "BLOCKED" | "SPECIALIST_REVIEW_REQUIRED" | "READY";
  capability: TaxCapabilityCode;
  reasons: string[];
  sourceCodes: string[];
  approvalRef: string | null;
};

/**
 * A capability cannot run merely because a source is present. It needs an
 * active capability record, a current specialist approval, and every cited
 * source must authenticate for the requested date and jurisdiction.
 */
export function evaluateTaxOperationGate(input: {
  capability: TaxCapabilityCode;
  activation: TaxCapabilityActivation;
  approval: TaxSpecialistApproval | null;
  sources: readonly TaxLegalAuthorityRecord[];
  jurisdictionCode: string;
  asOf: string;
  approvedOfficialHosts: readonly string[];
}): TaxOperationGate {
  const reasons: string[] = [];
  const effectiveSources = selectEffectiveTaxAuthorities(
    input.sources, input.jurisdictionCode, input.asOf, input.approvedOfficialHosts,
  );
  if (input.activation.capability !== input.capability || input.activation.status !== "ACTIVE") {
    reasons.push("Capability is not ACTIVE under an approved activation record.");
  }
  if (!input.activation.activationApprovalRef) {
    reasons.push("Capability activation approval reference is missing.");
  }
  const approval = input.approval;
  if (!approval || approval.capability !== input.capability || approval.status !== "APPROVED") {
    reasons.push("Current capability-specific specialist approval is required.");
  } else {
    if (!REQUIRED_APPROVER_ROLES[input.capability].includes(approval.approverRole)) {
      reasons.push("Approver role is not authorized for this tax capability.");
    }
    if (!approval.approverId || !approval.approvalRef || !isTaxIsoDate(approval.approvedAt)) {
      reasons.push("Approval identity, reference and date must be recorded.");
    }
    if (approval.expiresAt && (!isTaxIsoDate(approval.expiresAt) || approval.expiresAt < input.asOf)) {
      reasons.push("Specialist approval has expired or has an invalid expiry date.");
    }
    if (approval.sourceCodes.length === 0 || approval.sourceCodes.some((code) =>
      !effectiveSources.some((source) => source.sourceCode === code))) {
      reasons.push("Approval must explicitly cover currently effective authenticated source codes.");
    }
  }
  if (effectiveSources.length === 0) {
    reasons.push("No authenticated, effective-dated official source is available for this jurisdiction and date.");
  }
  const allowed = reasons.length === 0;
  return {
    allowed,
    status: allowed ? "READY" : (reasons.some((reason) => reason.includes("specialist approval") || reason.includes("Approver role")) ? "SPECIALIST_REVIEW_REQUIRED" : "BLOCKED"),
    capability: input.capability,
    reasons,
    sourceCodes: effectiveSources.map((source) => source.sourceCode),
    approvalRef: approval?.approvalRef ?? null,
  };
}

export type TaxComputationType =
  | "PERSONAL_INCOME_TAX" | "CORPORATE_INCOME_TAX" | "PAYE" | "VAT"
  | "WITHHOLDING_TAX" | "PRESUMPTIVE_TAX" | "EXCISE" | "STAMP_DUTY"
  | "OTHER_STATUTORY_TAX";

export type TaxComputationRequest = {
  jurisdictionCode: string;
  taxType: TaxComputationType;
  asOf: string;
  currency: string;
  taxPeriod: string;
  facts: Readonly<Record<string, string | number | boolean>>;
};

/** Gate only: no numeric result is returned until the verified rules engine is approved. */
export function prepareTaxComputation(input: {
  request: TaxComputationRequest;
  gate: TaxOperationGate;
}): { status: "BLOCKED" | "READY_FOR_SPECIALIST_EXECUTION"; liability: null; reasons: string[]; sourceCodes: string[] } {
  if (!input.gate.allowed || input.gate.capability !== "TAX_COMPUTATION_ENGINE") {
    return {
      status: "BLOCKED",
      liability: null,
      reasons: input.gate.reasons.length ? input.gate.reasons : ["Tax computation capability gate is not satisfied."],
      sourceCodes: input.gate.sourceCodes,
    };
  }
  return {
    status: "READY_FOR_SPECIALIST_EXECUTION",
    liability: null,
    reasons: ["Authority gate passed; a separately approved deterministic calculation method and specialist sign-off are still required."],
    sourceCodes: input.gate.sourceCodes,
  };
}

export type CustomsAssessmentRequest = {
  jurisdictionCode: string;
  asOf: string;
  hsCode: string;
  originCountry: string;
  customsValueMinor: number;
  currency: string;
  procedureCode: string;
};

/** HS classification is a specialist determination; no tariff is inferred from a code shape. */
export function validateCustomsAssessmentRequest(request: CustomsAssessmentRequest): string[] {
  const reasons: string[] = [];
  if (!/^\d{6,10}$/.test(request.hsCode)) reasons.push("HS code must be a 6–10 digit code supplied or confirmed by a customs specialist.");
  if (!Number.isSafeInteger(request.customsValueMinor) || request.customsValueMinor < 0) reasons.push("Customs value must be a non-negative safe integer in minor currency units.");
  if (!/^[A-Z]{3}$/.test(request.currency)) reasons.push("Currency must be a three-letter ISO code.");
  if (!isTaxIsoDate(request.asOf)) reasons.push("Assessment date must be a valid ISO date.");
  if (!request.originCountry || !request.procedureCode) reasons.push("Origin country and customs procedure are required facts.");
  return reasons;
}

export type TaxComplianceObligation = {
  code: string;
  title: string;
  jurisdictionCode: string;
  period: string;
  dueDate: string;
  sourceCode: string;
  provisionReference: string;
  status: "DRAFT" | "SPECIALIST_CONFIRMED" | "COMPLETED" | "OVERDUE" | "DISPUTED";
};

/** Filing dates are never guessed: an obligation is schedulable only with a verified legal source. */
export function validateTaxComplianceObligation(
  obligation: TaxComplianceObligation,
  sources: readonly TaxLegalAuthorityRecord[],
  approvedOfficialHosts: readonly string[],
): string[] {
  const source = sources.find((candidate) => candidate.sourceCode === obligation.sourceCode);
  if (!source || !authenticateTaxLegalSource(source, approvedOfficialHosts).authenticated) {
    return ["Obligation has no authenticated legal source; do not schedule or mark a filing deadline as authoritative."];
  }
  if (!source.provisionReferences.includes(obligation.provisionReference)) {
    return ["Obligation provision reference is not present in the authenticated source record."];
  }
  if (!isTaxIsoDate(obligation.dueDate)) return ["Due date must be an explicit valid date from the verified legal source."];
  if (source.jurisdictionCode !== obligation.jurisdictionCode) return ["Obligation jurisdiction does not match its source."];
  return [];
}

export type TaxAuditEvidence = {
  evidenceId: string;
  evidenceType: "RETURN" | "PAYMENT" | "INVOICE" | "CONTRACT" | "LEDGER" | "CUSTOMS_ENTRY" | "CORRESPONDENCE" | "JUDGMENT" | "OTHER";
  sourceUri: string;
  checksum: string;
  capturedAt: string;
  classification: "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
};

export function validateTaxAuditEvidence(evidence: TaxAuditEvidence): string[] {
  const reasons: string[] = [];
  if (!evidence.evidenceId || !evidence.sourceUri.startsWith("https://")) reasons.push("Evidence must have an identifier and secure source URI.");
  if (!/^[a-f0-9]{64}$/i.test(evidence.checksum)) reasons.push("Evidence SHA-256 checksum is required.");
  if (!isTaxIsoDate(evidence.capturedAt)) reasons.push("Evidence capture date must be valid.");
  return reasons;
}

/** NOELIA may explain and compare; it may not elevate model output into legal authority. */
export function validateNoeliaTaxCitations(input: {
  jurisdictionCode: string;
  asOf: string;
  sources: readonly TaxLegalAuthorityRecord[];
  citedSourceCodes: readonly string[];
  approvedOfficialHosts: readonly string[];
}): { reliable: boolean; reasons: string[]; citations: Array<{ sourceCode: string; provisions: readonly string[] }> } {
  const reasons: string[] = [];
  const effective = selectEffectiveTaxAuthorities(input.sources, input.sources[0]?.jurisdictionCode ?? "", input.asOf, input.approvedOfficialHosts);
  const citations = input.citedSourceCodes.flatMap((code) => {
    const source = effective.find((candidate) => candidate.sourceCode === code);
    return source ? [{ sourceCode: source.sourceCode, provisions: source.provisionReferences }] : [];
  });
  if (input.citedSourceCodes.length === 0) reasons.push("NOELIA tax answers require at least one authenticated legal citation.");
  if (citations.length !== input.citedSourceCodes.length) reasons.push("One or more cited sources are unauthenticated, superseded or outside their effective period.");
  return { reliable: reasons.length === 0, reasons, citations };
}
