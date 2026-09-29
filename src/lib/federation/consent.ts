/**
 * BEYU Federation & Trust — consent engine (program §79).
 *
 * Consent states: REQUESTED → GRANTED | DENIED; GRANTED → WITHDRAWN |
 * EXPIRED | SUPERSEDED; DENIED/WITHDRAWN/EXPIRED are terminal for the
 * purpose scope. Withdrawal MUST propagate: any access decision that
 * depends on a withdrawn consent fails closed (see guards.ts — a consent
 * whose status is not GRANTED is a denial).
 */
import { FederationInvariantError, type ConsentStatus } from "./catalog";

export interface ConsentRecord {
  id: string;
  status: ConsentStatus;
  purpose: string;
  grantedAt: string | null;
  withdrawnAt: string | null;
  expiresAt: string | null;
  supersededById: string | null;
}

const CONSENT_TRANSITIONS: Record<ConsentStatus, readonly ConsentStatus[]> = {
  REQUESTED: ["GRANTED", "DENIED"],
  GRANTED: ["WITHDRAWN", "EXPIRED", "SUPERSEDED"],
  DENIED: ["REQUESTED"], // a new request is a NEW consent record in practice; re-request allowed as explicit governance act
  WITHDRAWN: [],
  EXPIRED: ["REQUESTED"],
  SUPERSEDED: [],
};

export function canMoveConsent(from: ConsentStatus, to: ConsentStatus): boolean {
  return CONSENT_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertConsentMove(from: ConsentStatus, to: ConsentStatus): void {
  if (!canMoveConsent(from, to)) {
    throw new FederationInvariantError(
      `FAIL-CLOSED: illegal consent transition ${from} → ${to}. Allowed from ${from}: [${(CONSENT_TRANSITIONS[from] ?? []).join(", ") || "∅"}].`,
    );
  }
  if (to === "GRANTED") {
    // GRANTED is a recorded fact: it needs a grant timestamp (0071 CHECK).
  }
}

/**
 * Withdrawal propagation (program §79): given the full consent set for a
 * subject, compute which consents are EFFECTIVE for a purpose. Withdrawal of
 * a purpose consent invalidates every dependent access; superseded consents
 * point at their successor.
 */
export function effectiveConsent(consents: ConsentRecord[], purpose: string, now: Date): ConsentRecord | null {
  const forPurpose = consents.filter((c) => c.purpose === purpose);
  if (forPurpose.length === 0) return null;
  // Any WITHDRAWN or DENIED consent for the purpose blocks it outright.
  if (forPurpose.some((c) => c.status === "WITHDRAWN" || c.status === "DENIED")) return null;
  const granted = forPurpose.filter(
    (c) =>
      c.status === "GRANTED" &&
      (!c.expiresAt || new Date(c.expiresAt) > now) &&
      !c.supersededById,
  );
  if (granted.length === 0) return null;
  // Most recent grant wins.
  return granted.sort((a, b) => new Date(b.grantedAt ?? 0).getTime() - new Date(a.grantedAt ?? 0).getTime())[0];
}
