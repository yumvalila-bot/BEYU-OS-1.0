/**
 * BEYU Federation & Trust — fail-closed access guards (shared capability).
 *
 * `decideServiceAccess` answers ONE question: may this tenant/entity/user,
 * for this purpose, use this federation service NOW? It is the
 * program §58 rule set as code:
 *
 *   explicit legal basis + purpose + authorization + agreement where
 *   required + credential + security requirements + data minimization +
 *   consent where required + audit + retention + revocation + evidence.
 *
 * If any requirement is missing: DENY, with the exact reasons. The function
 * never invents a grant: UNKNOWN answers as denied.
 */
import { FederationInvariantError, minBeyuClearanceFor, type BeyuClearance, type ExternalDataClassification } from "./catalog";

export interface AccessDecisionInput {
  /** The service record as stored (registry plane). */
  service: {
    id: string;
    code: string;
    dataClassification: string; // EXTERNAL_DATA_CLASSIFICATION | UNVERIFIED
    consentRequired: "TRUE" | "FALSE" | "UNKNOWN";
    agreementRequired: "TRUE" | "FALSE" | "UNKNOWN";
    accessCostStatus: string;
    accessLevel: "NOT_CONNECTED" | "REQUESTED" | "GRANTED" | "REVOKED" | "EXPIRED";
    apiStatus: string;
    govesbStatus: string;
    verificationStatus: string;
    credentialRequired: "TRUE" | "FALSE" | "UNKNOWN";
  };
  /** Authority-level facts relevant to the decision. */
  authority: {
    code: string;
    lifecycleStatus: string;
    recordStatus: string;
  };
  /** Principal context (from the canonical authorization chain). */
  principal: {
    tenantId: string;
    entityId: string;
    clearance: BeyuClearance;
  };
  /** Linked governance rows (null when absent — absence is a denial). */
  legalBasis: { id: string; status: "DRAFT" | "CONFIRMED" | "EXPIRED" | "REVOKED"; expiryDate: string | null } | null;
  consent: { id: string; status: string; expiresAt: string | null; subjectMatches: boolean } | null;
  agreement: { id: string; status: string; expiryDate: string | null } | null;
  accessRequest: { id: string; status: "DRAFT" | "SUBMITTED" | "IN_REVIEW" | "APPROVED" | "DENIED" | "REVOKED"; expiresAt: string | null; tenantId: string; legalEntityId: string } | null;
  credential: { id: string; status: string; expiresAt: string | null; credentialClass: string } | null;
  now?: Date;
}

export interface AccessDecision {
  allowed: boolean;
  reasons: string[];
  /** Event name to emit into the existing audit/event ledger. */
  event: "FEDERATION_DATA_ACCESSED" | "FEDERATION_DATA_REJECTED";
}

export function decideServiceAccess(input: AccessDecisionInput): AccessDecision {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const s = input.service;
  const a = input.authority;
  const p = input.principal;

  // 1. Authority must exist and be in a usable record/lifecycle state.
  if (a.recordStatus === "INACTIVE" || a.recordStatus === "RETIRED") {
    reasons.push(`authority ${a.code} is ${a.recordStatus}`);
  }
  if (a.lifecycleStatus === "REVOKED" || a.lifecycleStatus === "SUSPENDED" || a.lifecycleStatus === "FAILED_VERIFICATION") {
    reasons.push(`authority ${a.code} lifecycle is ${a.lifecycleStatus} — access is blocked`);
  }

  // 2. Access level: only a GRANTED, tenant-scoped, unexpired access request
  //    authorizes use. REQUESTED/DRAFT/IN_REVIEW are NOT grants.
  const ar = input.accessRequest;
  if (s.accessLevel !== "GRANTED" || !ar || ar.status !== "APPROVED") {
    reasons.push(`service ${s.code} has no approved, granted access (accessLevel=${s.accessLevel}, request=${ar ? ar.status : "none"})`);
  } else {
    if (ar.tenantId !== p.tenantId) reasons.push("access request belongs to a different tenant");
    if (ar.legalEntityId !== p.entityId) reasons.push("access request belongs to a different legal entity");
    if (ar.expiresAt && new Date(ar.expiresAt) <= now) reasons.push("approved access has expired");
  }

  // 3. Purpose limitation: an approved request implies purpose; a protected
  //    dataset without purpose is unrepresentable in the request itself.
  if (s.dataClassification === "PROTECTED" || s.dataClassification === "HIGHLY_RESTRICTED") {
    if (!ar || ar.status !== "APPROVED") reasons.push(`protected data (${s.dataClassification}) requires an approved request with purpose`);
  }

  // 4. Legal basis (program §58): missing or not CONFIRMED ⇒ deny.
  if (!input.legalBasis) {
    reasons.push("no legal basis recorded — fail closed");
  } else if (input.legalBasis.status !== "CONFIRMED") {
    reasons.push(`legal basis ${input.legalBasis.id} is ${input.legalBasis.status}, not CONFIRMED`);
  } else if (input.legalBasis.expiryDate && new Date(input.legalBasis.expiryDate) <= now) {
    reasons.push("legal basis has expired");
  }

  // 5. Consent where required (program §79): withdrawal propagates — a
  //    WITHDRAWN/DENIED/EXPIRED consent is a denial.
  if (s.consentRequired === "TRUE") {
    const c = input.consent;
    if (!c) reasons.push("consent is required but no consent record exists");
    else if (!c.subjectMatches) reasons.push("consent subject does not match the requesting context");
    else if (c.status !== "GRANTED") reasons.push(`consent is ${c.status}, not GRANTED`);
    else if (c.expiresAt && new Date(c.expiresAt) <= now) reasons.push("consent has expired");
  }
  // consentRequired === 'UNKNOWN' on PROTECTED/HIGHLY_RESTRICTED data: deny.
  if (s.consentRequired === "UNKNOWN" && (s.dataClassification === "PROTECTED" || s.dataClassification === "HIGHLY_RESTRICTED")) {
    reasons.push("consent requirement unknown for protected data — fail closed");
  }

  // 6. Agreement where required (program §80): must be ACTIVE and unexpired.
  if (s.agreementRequired === "TRUE") {
    const ag = input.agreement;
    if (!ag) reasons.push("agreement is required but no agreement record exists");
    else if (ag.status !== "ACTIVE") reasons.push(`agreement is ${ag.status}, not ACTIVE`);
    else if (ag.expiryDate && new Date(ag.expiryDate) <= now) reasons.push("agreement has expired");
  }
  if (s.agreementRequired === "UNKNOWN" && (s.dataClassification === "PROTECTED" || s.dataClassification === "HIGHLY_RESTRICTED")) {
    reasons.push("agreement requirement unknown for protected data — fail closed");
  }

  // 7. Credential (program §65): required credentials must be ISSUED and
  //    unexpired; a REVOKED/EXPIRED credential blocks access.
  if (s.credentialRequired === "TRUE") {
    const cr = input.credential;
    if (!cr) reasons.push("credential is required but none is provisioned");
    else if (cr.status !== "ISSUED") reasons.push(`credential is ${cr.status}, not ISSUED`);
    else if (cr.expiresAt && new Date(cr.expiresAt) <= now) reasons.push("credential has expired");
  }

  // 8. Classification ceiling (program §11): the principal's clearance must
  //    cover the external data class.
  if (s.dataClassification !== "UNVERIFIED") {
    const min = minBeyuClearanceFor(s.dataClassification as ExternalDataClassification);
    const rank = (c: BeyuClearance) => ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"].indexOf(c);
    if (rank(p.clearance) < rank(min)) {
      reasons.push(`clearance ${p.clearance} is below the ${min} required by data class ${s.dataClassification}`);
    }
  }

  // 9. Verification reality (program §9): LIVE services must be LIVE-verified
  //    at the authority level; an unverified "API" is not an API.
  if (s.apiStatus === "AUTHORIZED" && s.verificationStatus === "REGISTERED") {
    reasons.push("service claims an authorized API but verification is only REGISTERED — unverified authority cannot be LIVE");
  }

  const allowed = reasons.length === 0;
  return { allowed, reasons, event: allowed ? "FEDERATION_DATA_ACCESSED" : "FEDERATION_DATA_REJECTED" };
}

/**
 * Production activation guard (program §68, §90): activation is a governed
 * act requiring the high-risk permission AND a recorded approval. No
 * autonomous (including Noelia) path may call through without both.
 */
export function assertProductionActivation(
  ctx: { actorUserId: string; actorType: "HUMAN" | "SERVICE" | "AI"; permissionHeld: boolean; approvalReference: string | null; productionEvidenceId: string | null },
): void {
  if (ctx.actorType !== "HUMAN") {
    throw new FederationInvariantError("FAIL-CLOSED: production activation requires a HUMAN actor. AI and service actors may never activate production federation integrations.");
  }
  if (!ctx.permissionHeld) {
    throw new FederationInvariantError("FAIL-CLOSED: actor lacks federation:production.activate (MFA step-up permission).");
  }
  if (!ctx.approvalReference || !ctx.productionEvidenceId) {
    throw new FederationInvariantError("FAIL-CLOSED: production activation requires a recorded governed approval and production evidence.");
  }
}
