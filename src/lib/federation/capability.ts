/**
 * BEYU Federation & Trust — capability negotiation (program §61) and
 * jurisdiction transition planning (program §62–63).
 *
 * A BEYU company crossing from Tanzania into Kenya must NOT assume Tanzanian
 * services carry over. Negotiation: detect destination jurisdiction → load
 * its profile → determine, per capability, the legal basis, authorization,
 * data residency, connector, agreement and cost posture → require human
 * approval where required. Nothing here auto-connects anything.
 */
export interface JurisdictionProfileView {
  code: string;
  name: string;
  status: "PROPOSED" | "ACTIVE" | "INACTIVE";
  dataResidency: Record<string, unknown>;
  integrationRegime: Record<string, unknown>;
  crossBorderInterfaces: string[];
}

export interface CapabilityView {
  capabilityCode: string;
  availability: string;
  legalBasisRef: string | null;
  connectorRef: string | null;
  dataResidency: string | null;
  costStatus: string;
  requiresHumanApproval: "TRUE" | "FALSE" | "UNKNOWN";
}

export interface NegotiationInput {
  origin: JurisdictionProfileView;
  destination: JurisdictionProfileView;
  capabilities: Record<string, CapabilityView>; // destination jurisdiction capability rows
  subjectType: "PERSON" | "ORGANIZATION" | "TENANT" | "ENTITY" | "DATA";
  capabilitiesWanted: string[];
  hasLocalEntityInDestination?: boolean;
}

export interface CapabilityNegotiation {
  capabilityCode: string;
  availability: string;
  blockers: string[];
  requiresHumanApproval: boolean;
  notes: string[];
}

export interface TransitionPlan {
  origin: string;
  destination: string;
  subjectType: string;
  status: "PROPOSED" | "BLOCKED";
  capabilities: CapabilityNegotiation[];
  residencyRequirements: string[];
  legalRequirements: string[];
  agreementRequired: boolean;
  consentRequired: boolean;
  summary: string;
}

const CARRYOVER_RISK = new Set([
  "IDENTITY_VERIFICATION",
  "TAX_SERVICE",
  "HEALTH_SERVICE",
  "LAND_SERVICE",
  "FINANCE_SERVICE",
  "EMPLOYMENT_SERVICE",
  "SOCIAL_PROTECTION",
]);

/**
 * Negotiate capability availability across a jurisdiction boundary.
 * Deterministic and evidence-bound: a capability is AVAILABLE only when the
 * destination jurisdiction profile says so; otherwise the specific
 * REQUIRES_* / NOT_* state is returned with reasons.
 */
export function negotiateCapabilities(input: NegotiationInput): TransitionPlan {
  const { origin, destination, capabilities, subjectType } = input;
  const capResults: CapabilityNegotiation[] = [];
  const residency: string[] = [];
  const legal: string[] = [];
  let agreementRequired = false;
  let consentRequired = false;

  // Data residency: a destination profile with localization rules blocks
  // free cross-border transfer (program §63).
  const dr = destination.dataResidency as Record<string, unknown> | null;
  if (dr && dr.localization) {
    residency.push(`${destination.code} enforces data localization (${JSON.stringify(dr.localization)}). Transfer mechanism must be approved in-destination.`);
  }
  if (dr && dr.approvedTransferMechanisms && Array.isArray(dr.approvedTransferMechanisms) && dr.approvedTransferMechanisms.length > 0) {
    residency.push(`Approved transfer mechanisms in ${destination.code}: ${(dr.approvedTransferMechanisms as string[]).join(", ")}.`);
  }
  if (residency.length === 0) {
    residency.push("No residency restriction recorded for the destination profile — verify against current destination data-protection law before transfer.");
  }

  // Cross-border interface presence.
  if (destination.crossBorderInterfaces.length === 0) {
    legal.push(`No cross-border interface recorded for ${destination.code} — treat all cross-border flows as UNVERIFIED until a profile is reconciled.`);
  } else {
    legal.push(`Recorded cross-border interfaces for ${destination.code}: ${destination.crossBorderInterfaces.join(", ")}.`);
  }

  for (const wanted of input.capabilitiesWanted) {
    const cap = capabilities[wanted];
    const blockers: string[] = [];
    const notes: string[] = [];
    let availability = "NOT_IMPLEMENTED";
    let requiresHumanApproval = true;

    if (!cap) {
      availability = "NOT_IMPLEMENTED";
      blockers.push(`Capability ${wanted} is not recorded for ${destination.code}. Origin (${origin.code}) capabilities do NOT carry over.`);
      if (CARRYOVER_RISK.has(wanted)) {
        blockers.push(`${wanted} is a non-portable jurisdiction capability; assume it is unavailable in ${destination.code} until evidenced.`);
      }
    } else {
      availability = cap.availability;
      if (cap.availability === "REQUIRES_AUTHORIZATION") blockers.push(`Authorization must be obtained in ${destination.code}.`);
      if (cap.availability === "REQUIRES_CONSENT") {
        blockers.push(`Subject consent is required in ${destination.code}.`);
        consentRequired = true;
      }
      if (cap.availability === "REQUIRES_AGREEMENT") {
        blockers.push(`A ${destination.code} agreement is required before use.`);
        agreementRequired = true;
      }
      if (cap.availability === "REQUIRES_LOCAL_ENTITY") {
        blockers.push(`A local entity/registration in ${destination.code} is required.`);
        if (input.hasLocalEntityInDestination) blockers.pop();
      }
      if (cap.availability === "REQUIRES_GOVERNMENT_CONNECTION") blockers.push(`Requires a governed government connection in ${destination.code} (none may be assumed from ${origin.code}).`);
      if (cap.availability === "REQUIRES_HUMAN_APPROVAL") blockers.push("Human approval is mandated for this capability.");
      if (cap.availability === "NOT_AVAILABLE") blockers.push(`Capability is not available in ${destination.code}.`);
      if (cap.availability === "NOT_CERTIFIED") blockers.push(`Capability exists but is not certified in ${destination.code}.`);
      if (cap.availability === "AVAILABLE") {
        notes.push("Available per the destination jurisdiction profile; cost/status remain as recorded (UNKNOWN_COST unless evidenced).");
      }
      if (cap.legalBasisRef) legal.push(`${wanted}: legal basis reference ${cap.legalBasisRef} (destination).`);
      if (cap.dataResidency) residency.push(`${wanted}: residency note ${cap.dataResidency}`);
      if (cap.costStatus && cap.costStatus !== "UNKNOWN_COST") notes.push(`${wanted}: recorded cost status ${cap.costStatus}.`);
    }

    requiresHumanApproval = blockers.length > 0 || cap?.requiresHumanApproval === "TRUE" || cap?.requiresHumanApproval === "UNKNOWN";

    capResults.push({ capabilityCode: wanted, availability, blockers, requiresHumanApproval, notes });
  }

  const status = capResults.some((c) => c.availability === "NOT_AVAILABLE" || c.blockers.some((b) => b.includes("not available"))) ? "BLOCKED" : "PROPOSED";
  const summary =
    capResults.length === 0
      ? "No capabilities negotiated."
      : capResults
          .map((c) => `${c.capabilityCode}=${c.availability}`)
          .join(", ");

  return {
    origin: origin.code,
    destination: destination.code,
    subjectType,
    status,
    capabilities: capResults,
    residencyRequirements: residency,
    legalRequirements: legal,
    agreementRequired,
    consentRequired,
    summary,
  };
}

/**
 * Validate a recorded jurisdiction transition (program §62): origin and
 * destination must differ and both jurisdictions must be known profiles.
 */
export function assertTransitionShape(t: { originJurisdiction: string; destinationJurisdiction: string; knownJurisdictions: string[] }): void {
  if (t.originJurisdiction === t.destinationJurisdiction) {
    throw new Error("Transition origin and destination must differ.");
  }
  if (!t.knownJurisdictions.includes(t.originJurisdiction) || !t.knownJurisdictions.includes(t.destinationJurisdiction)) {
    throw new Error("Transition references an unknown jurisdiction profile.");
  }
}
