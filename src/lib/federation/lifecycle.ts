/**
 * BEYU Federation & Trust — lifecycle engine (shared capability).
 *
 * Enforces the program §8 lifecycle machine in code, on top of the DB
 * catalogue CHECKs. Promotion into evidence-gated states re-validates the
 * evidence rows themselves (type, subject linkage, status, expiry) — a stale
 * or mis-linked evidence row cannot promote anything.
 */
import {
  FederationInvariantError,
  LIFECYCLE_TRANSITIONS,
  assertPromotable,
  type FederationLifecycle,
  type EvidenceStatus,
} from "./catalog";

export interface EvidenceRecord {
  id: string;
  type: string;
  subjectType: string;
  subjectId: string;
  status: EvidenceStatus;
  expiresAt: string | null;
}

export interface LifecycleContext {
  recordId: string; // the authority/service id the evidence must be linked to
  current: FederationLifecycle;
  to: FederationLifecycle;
  productionEvidence: EvidenceRecord | null;
  approvedBy: string | null;
  approvalReference: string | null;
  now?: Date;
}

const PRODUCTION_EVIDENCE_TYPES = new Set(["PRODUCTION_TEST", "SIGNED_AUTHORITY_CONFIRMATION", "OFFICIAL_CERTIFICATE"]);

/**
 * Validate a lifecycle move. Throws FederationInvariantError (fail-closed)
 * on any violation: unknown state, illegal transition, or a promotion into
 * an evidence-gated state whose evidence is missing, mis-linked, expired or
 * not a production-grade evidence type.
 */
export function assertLifecycleMove(ctx: LifecycleContext): void {
  const now = ctx.now ?? new Date();
  const from = ctx.current;
  const to = ctx.to;
  if (!LIFECYCLE_TRANSITIONS[from]?.includes(to)) {
    throw new FederationInvariantError(
      `FAIL-CLOSED: illegal federation lifecycle transition ${from} → ${to}. ` +
        `Allowed from ${from}: [${(LIFECYCLE_TRANSITIONS[from] ?? []).join(", ") || "∅"}].`,
    );
  }

  if (to === "PRODUCTION_APPROVAL" || to === "LIVE" || to === "LIVE_VERIFIED") {
    assertPromotable(to, {
      productionEvidenceId: ctx.productionEvidence?.id ?? null,
      approvedBy: ctx.approvedBy,
      approvalReference: ctx.approvalReference,
    });
    const ev = ctx.productionEvidence!;
    if (ev.subjectType !== "AUTHORITY" && ev.subjectType !== "SERVICE" && ev.subjectType !== "CONNECTOR") {
      throw new FederationInvariantError(`FAIL-CLOSED: production evidence ${ev.id} is not linked to an authority/service/connector.`);
    }
    if (ev.subjectId !== ctx.recordId) {
      throw new FederationInvariantError(
        `FAIL-CLOSED: production evidence ${ev.id} is linked to ${ev.subjectType}/${ev.subjectId}, not to ${ctx.recordId}. Evidence must identify what was verified.`,
      );
    }
    if (!PRODUCTION_EVIDENCE_TYPES.has(ev.type)) {
      throw new FederationInvariantError(
        `FAIL-CLOSED: production evidence type ${ev.type} is not production-grade (expected PRODUCTION_TEST, SIGNED_AUTHORITY_CONFIRMATION or OFFICIAL_CERTIFICATE).`,
      );
    }
    if (ev.status !== "VALID") {
      throw new FederationInvariantError(`FAIL-CLOSED: production evidence ${ev.id} is ${ev.status}, not VALID.`);
    }
    if (ev.expiresAt && new Date(ev.expiresAt) <= now) {
      throw new FederationInvariantError(`FAIL-CLOSED: production evidence ${ev.id} expired on ${ev.expiresAt}.`);
    }
  }

  if (to === "LIVE_VERIFIED" && (ctx.approvedBy === null || ctx.approvedBy === "")) {
    throw new FederationInvariantError("FAIL-CLOSED: LIVE_VERIFIED requires a named verifier/approver.");
  }
}

/**
 * Exceptional-state guard (program §8): SUSPENDED/REVOKED/EXPIRED/DEGRADED/
 * FAILED_VERIFICATION are reachable only from the transitions above; a
 * record in REVOKED is terminal.
 */
export function isTerminalLifecycle(state: FederationLifecycle): boolean {
  return state === "REVOKED";
}
