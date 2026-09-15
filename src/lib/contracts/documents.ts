/**
 * BEYU OS — §22 LEGAL DOCUMENT REGISTRY (pure engine over the canonical
 * `documents` table).
 *
 * Documents themselves stay canonical in `documents` (platform.ts): checksum,
 * storage URI, classification, retention code, supersession ids, approval. This
 * module only drives the ADDITIONAL governed legal lifecycle layered on top —
 * effective/expiry dating, legal-review state, execution method, signature
 * evidence, legal hold, provenance and blockchain anchoring posture — because
 * the mandate requires that surface for legal instruments, and it is not a
 * second document store.
 */

import {
  ContractModelError,
  addDaysIso,
  assertIsoDate,
  assertRef,
  daysBetweenIso,
} from "./pure";
import type { ExecutionMethod, LegalDocumentState } from "./vocabulary";

const LEGAL_DOC_EDGES: Record<LegalDocumentState, readonly LegalDocumentState[]> = {
  DRAFT: ["UNDER_REVIEW", "WITHDRAWN"],
  UNDER_REVIEW: ["DRAFT", "APPROVED", "LEGAL_HOLD", "WITHDRAWN"],
  APPROVED: ["EXECUTED", "UNDER_REVIEW", "LEGAL_HOLD", "WITHDRAWN"],
  EXECUTED: ["SUPERSEDED", "EXPIRED", "LEGAL_HOLD", "ARCHIVED"],
  SUPERSEDED: ["ARCHIVED", "LEGAL_HOLD"],
  EXPIRED: ["ARCHIVED", "LEGAL_HOLD"],
  WITHDRAWN: ["ARCHIVED"],
  LEGAL_HOLD: ["EXECUTED", "SUPERSEDED", "EXPIRED"],
  ARCHIVED: [],
};

/** Legal document state machine (§22 lifecycle, mirrored by 0042 CHECK constraints). */
export function evaluateLegalDocumentTransition(from: LegalDocumentState, to: LegalDocumentState): true {
  const edges = LEGAL_DOC_EDGES[from];
  if (!edges) throw new ContractModelError("UNKNOWN_STATE", `Unknown legal document state ${from}.`);
  if (!edges.includes(to)) {
    throw new ContractModelError("INVALID_TRANSITION", `Legal document cannot move ${from} → ${to}.`, { from, to });
  }
  return true;
}

/** Version supersession is strict and auditable: v(n+1) supersedes exactly v(n). */
export function assertSupersession(input: {
  newVersion: number;
  previousVersion: number;
  newSupersedesId: string;
}): { newVersion: number; previousVersion: number; newSupersedesId: string } {
  if (input.newVersion !== input.previousVersion + 1) {
    throw new ContractModelError("RULE_VIOLATION", "Document versions must be contiguous (+1); no silent version jumps.", {
      newVersion: input.newVersion,
      previousVersion: input.previousVersion,
    });
  }
  return {
    newVersion: input.newVersion,
    previousVersion: input.previousVersion,
    newSupersedesId: assertRef(input.newSupersedesId, "supersedesDocumentId"),
  };
}

export type DocumentIntake = {
  documentClass: string;
  title: string;
  version: number;
  jurisdictionCode: string;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  contentHash: string;
  executionMethod: ExecutionMethod;
  legalReviewStatus: string;
  provenance: string;
  retentionYears?: number | null;
};

/**
 * Write-time validation for a legal document lifecycle record. The content hash
 * is mandatory: a document that cannot be hashed cannot be anchored or verified.
 * Retention expiry is DERIVED from the retention period so a stale record is
 * detectable without trusting a client-supplied date.
 */
export function assertDocumentIntake(input: DocumentIntake): {
  retentionExpiresOn: string | null;
  contentHash: string;
  expiryDate: string | null;
  termDays: number | null;
} {
  const contentHash = input.contentHash.trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(contentHash)) {
    throw new ContractModelError("INVALID_REFERENCE", "contentHash must be a 0x-prefixed 32-byte hex digest.", {
      field: "contentHash",
    });
  }
  assertRef(input.documentClass, "documentClass");
  assertRef(input.title, "title");
  assertRef(input.jurisdictionCode, "jurisdictionCode");
  assertRef(input.provenance, "provenance");
  if (!Number.isInteger(input.version) || input.version < 1) {
    throw new ContractModelError("RULE_VIOLATION", "Document version must be a positive integer.");
  }
  const effective = input.effectiveDate ? assertIsoDate(input.effectiveDate, "effectiveDate") : null;
  let expiry = input.expiryDate ? assertIsoDate(input.expiryDate, "expiryDate") : null;
  if (expiry && effective && daysBetweenIso(effective, expiry) < 0) {
    throw new ContractModelError("INVALID_DATE", "expiryDate cannot precede effectiveDate.", { expiry, effective });
  }
  // An indefinite legal instrument is a control gap, not a feature: when a term
  // is absent but an effective date exists, a 100-year review horizon is recorded
  // so renewal/expiry monitoring still has a computable date. This is a
  // MONITORING default, never a statement about legal duration.
  if (!expiry && effective) expiry = addDaysIso(effective, 36_525);
  let retentionExpiresOn: string | null = null;
  if (input.retentionYears !== null && input.retentionYears !== undefined) {
    if (!Number.isInteger(input.retentionYears) || input.retentionYears < 0 || input.retentionYears > 200) {
      throw new ContractModelError("OUT_OF_RANGE", "retentionYears must be an integer 0..200.");
    }
    const base = expiry ?? effective;
    if (!base) {
      throw new ContractModelError("INVALID_DATE", "Retention dating needs an effective or expiry date.");
    }
    retentionExpiresOn = addDaysIso(base, Math.round(input.retentionYears * 365.25));
  }
  return {
    retentionExpiresOn,
    contentHash,
    expiryDate: expiry,
    termDays: effective && expiry ? daysBetweenIso(effective, expiry) : null,
  };
}

/**
 * Disposal posture. A legal hold suspends disposal; supersession never deletes.
 * The canonical retention POLICY remains `retention_policies` — this consumes
 * the derived date, it does not define retention law.
 */
export function documentDisposalPosture(doc: {
  state: LegalDocumentState | string;
  legalHold: boolean;
  retentionExpiresOn?: string | null;
  asOfDate: string;
}): { allowed: boolean; reason: string } {
  if (doc.legalHold) return { allowed: false, reason: "LEGAL_HOLD_ACTIVE" };
  if (doc.state !== "SUPERSEDED" && doc.state !== "EXPIRED" && doc.state !== "ARCHIVED" && doc.state !== "WITHDRAWN") {
    return { allowed: false, reason: "STATE_NOT_DISPOSABLE" };
  }
  if (doc.retentionExpiresOn) {
    const remaining = daysBetweenIso(
      assertIsoDate(doc.asOfDate, "asOfDate"),
      assertIsoDate(doc.retentionExpiresOn, "retentionExpiresOn"),
    );
    if (remaining > 0) return { allowed: false, reason: `RETENTION_PERIOD_ACTIVE:${remaining}d` };
    return { allowed: true, reason: "RETENTION_EXPIRED_NO_HOLD" };
  }
  return { allowed: false, reason: "RETENTION_UNDetermined_NO_DATE_ON_RECORD" };
}

/** Expiry/renewal monitoring: how soon does this instrument need attention? */
export function documentAttentionWindow(doc: {
  expiryDate?: string | null;
  nextReviewDate?: string | null;
  asOfDate: string;
  noticeDays?: number;
}): { daysToExpiry: number | null; daysToReview: number | null; attention: "NONE" | "UPCOMING" | "DUE" | "OVERDUE" } {
  const notice = doc.noticeDays ?? 90;
  const daysToExpiry = doc.expiryDate ? daysBetweenIso(doc.asOfDate, assertIsoDate(doc.expiryDate, "expiryDate")) : null;
  const daysToReview = doc.nextReviewDate ? daysBetweenIso(doc.asOfDate, assertIsoDate(doc.nextReviewDate, "nextReviewDate")) : null;
  const candidates = [daysToExpiry, daysToReview].filter((n): n is number => n !== null);
  const nearest = candidates.length === 0 ? null : Math.min(...candidates);
  let attention: "NONE" | "UPCOMING" | "DUE" | "OVERDUE" = "NONE";
  if (nearest !== null) {
    if (nearest < 0) attention = "OVERDUE";
    else if (nearest <= Math.max(7, Math.round(notice / 6))) attention = "DUE";
    else if (nearest <= notice) attention = "UPCOMING";
  }
  return { daysToExpiry, daysToReview, attention };
}

/**
 * Provenance validation for a legal document record: origin, authority and
 * capture evidence must all be present. A copy with no provenance is a duplicate,
 * not a record.
 */
export function assertProvenance(input: { source: string; capturedBy: string; authorityRef?: string | null; origin: string }): {
  provenance: Record<string, string | null>;
} {
  return {
    provenance: {
      source: assertRef(input.source, "provenance.source"),
      origin: assertRef(input.origin, "provenance.origin"),
      capturedBy: assertRef(input.capturedBy, "provenance.capturedBy"),
      authorityRef: input.authorityRef ? assertRef(input.authorityRef, "authorityRef") : null,
    },
  };
}
