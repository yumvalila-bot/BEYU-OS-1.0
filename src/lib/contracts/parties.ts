/**
 * BEYU OS — §16 CONTRACT PARTY GOVERNANCE (pure posture engine).
 *
 * A counterparty profile is a GOVERNANCE overlay on the canonical identity
 * records (`parties`, `legal_entities`). This module decides whether the
 * recorded evidence supports contracting, and how risky the counterparty looks.
 * It never stores personal data beyond what governance requires, never creates
 * an identity, and never concludes anything about legal adequacy of a screening
 * regime — that stays `REQUIRES_LEGAL_REVIEW`.
 */

import { daysBetweenIso, assertIsoDate } from "./model";

export const PARTY_KINDS = [
  "EMPLOYEE",
  "CONTRACTOR",
  "CANDIDATE",
  "FOUNDING_PARTY",
  "DIRECTOR",
  "TRUSTEE",
  "SUPPLIER",
  "VENDOR",
  "CUSTOMER",
  "SUBSIDIARY",
  "SISTER_ENTITY",
  "NGO",
  "DONOR",
  "GOVERNMENT_MINISTRY",
  "GOVERNMENT_AGENCY",
  "GOVERNMENT_DEPARTMENT",
  "GOVERNMENT_LOCAL_AUTHORITY",
  "DEVELOPMENT_PARTNER",
  "INTERNATIONAL_ORGANIZATION",
  "BANK",
  "INSURER",
  "INVESTOR",
  "UNIVERSITY",
  "SCHOOL",
  "HOSPITAL",
  "COOPERATIVE",
  "RESEARCH_INSTITUTION",
  "COMMUNITY",
  "OTHER_AUTHORIZED",
] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];

/** Kinds for which KYB/KYC evidence is a mandatory pre-execution control. */
export const KYC_KYB_REQUIRED_KINDS: readonly PartyKind[] = PARTY_KINDS.filter(
  (k) => k !== "SUBSIDIARY" && k !== "SISTER_ENTITY",
);

export type ComplianceStatus = "CLEAR" | "UNDER_REVIEW" | "RESTRICTED" | "SANCTIONED" | "UNKNOWN";

export type PartyFacts = {
  kind: PartyKind;
  legalIdentityVerified: boolean;
  registrationRef?: string | null;
  beneficialOwnershipRecorded?: boolean;
  authorizedRepresentativeVerified: boolean;
  signingAuthorityVerified: boolean;
  taxMetadataRecorded?: boolean;
  kycKybStatus: "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "EXPIRED" | "REFUSED";
  complianceStatus: ComplianceStatus;
  lastScreenedOn?: string | null;
  asOfDate: string;
  screeningMaxAgeDays?: number;
  /** Count of prior disputes with this counterparty (relationship history). */
  openDisputes?: number;
  priorDisputes?: number;
  riskOverride?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
};

export type PartyPosture = {
  kycKybRequired: boolean;
  canContract: boolean;
  /** Blocking findings (must be cured before execution); advisory findings never block. */
  blockingFindings: string[];
  advisoryFindings: string[];
  /** 0–100 deterministic readiness; advisory only, never an authorization input. */
  readiness: number;
  riskRating: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  enforceability: "REQUIRES_LEGAL_REVIEW";
};

/**
 * Deterministic counterparty posture. Fail-closed: a missing verification is a
 * blocking finding, never a default-pass. Sanctions are an absolute block.
 */
export function evaluatePartyPosture(facts: PartyFacts): PartyPosture {
  const kycKybRequired = KYC_KYB_REQUIRED_KINDS.includes(facts.kind);
  const blocking: string[] = [];
  const advisory: string[] = [];
  let readiness = 100;
  const strike = (list: string[], msg: string, weight: number) => {
    list.push(msg);
    readiness = Math.max(0, readiness - weight);
  };

  if (!facts.legalIdentityVerified) {
    strike(blocking, "Legal identity is not verified against canonical records.", 35);
  }
  if (!facts.authorizedRepresentativeVerified) {
    strike(blocking, "Authorized representative is not verified.", 25);
  }
  if (!facts.signingAuthorityVerified) {
    strike(blocking, "Counterparty signing authority is not verified.", 25);
  }
  if (kycKybRequired) {
    if (facts.kycKybStatus !== "VERIFIED") {
      strike(blocking, `KYC/KYB status is ${facts.kycKybStatus}; VERIFIED is required before execution.`, 25);
    }
    const reg = typeof facts.registrationRef === "string" ? facts.registrationRef.trim() : "";
    if (!reg) strike(blocking, "Registration reference missing for an external counterparty.", 10);
  } else if (facts.kycKybStatus !== "NOT_REQUIRED") {
    strike(advisory, `Intra-group counterparty carries a KYC status of ${facts.kycKybStatus}; verify it is intentional.`, 0);
  }

  switch (facts.complianceStatus) {
    case "SANCTIONED":
      strike(blocking, "Compliance screening returned SANCTIONED — contracting is prohibited.", 100);
      break;
    case "RESTRICTED":
      strike(blocking, "Compliance screening returned RESTRICTED — authority review required before execution.", 40);
      break;
    case "UNDER_REVIEW":
      strike(advisory, "Compliance screening is still under review.", 15);
      break;
    case "UNKNOWN":
      strike(blocking, "Compliance status is unknown; screening evidence is required.", 30);
      break;
    case "CLEAR":
      break;
  }

  const maxAge = facts.screeningMaxAgeDays ?? 365;
  if (facts.lastScreenedOn) {
    const age = daysBetweenIso(assertIsoDate(facts.lastScreenedOn, "lastScreenedOn"), assertIsoDate(facts.asOfDate, "asOfDate"));
    if (age > maxAge) strike(blocking, `Screening evidence is ${age} days old (policy maximum ${maxAge}).`, 20);
    else if (age > maxAge * 0.75) strike(advisory, `Screening evidence is ${age} days old and approaching expiry.`, 5);
  } else {
    strike(blocking, "No screening date recorded — compliance freshness cannot be proven.", 15);
  }

  if (facts.taxMetadataRecorded === false) strike(advisory, "Tax metadata not recorded (withholding/registration consequences are jurisdiction-dependent).", 5);
  if (facts.beneficialOwnershipRecorded === false && (facts.kind === "INVESTOR" || facts.kind === "SUPPLIER" || facts.kind === "VENDOR")) {
    strike(advisory, "Beneficial ownership not recorded for a risk-sensitive counterparty class.", 5);
  }
  if ((facts.openDisputes ?? 0) > 0) strike(advisory, `${facts.openDisputes} open dispute(s) with this counterparty.`, 10);
  if ((facts.priorDisputes ?? 0) > 2) strike(advisory, `Relationship history shows ${facts.priorDisputes} prior disputes.`, 5);

  let risk: PartyPosture["riskRating"] = "LOW";
  if (readiness < 40) risk = "CRITICAL";
  else if (readiness < 60) risk = "HIGH";
  else if (readiness < 85) risk = "MEDIUM";
  if (facts.riskOverride) {
    // A recorded human override is the strongest signal; it never LOWERS below
    // the computed rating (an override cannot weaken a fail-closed finding).
    const order = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
    const computed = order.indexOf(risk);
    const overridden = order.indexOf(facts.riskOverride);
    risk = order[Math.max(computed, overridden)];
  }

  return {
    kycKybRequired,
    canContract: blocking.length === 0,
    blockingFindings: blocking,
    advisoryFindings: advisory,
    readiness,
    riskRating: risk,
    enforceability: "REQUIRES_LEGAL_REVIEW",
  };
}
