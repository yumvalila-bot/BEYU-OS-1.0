/**
 * BEYU OS — Family Office: document/instrument engine.
 *
 * Common support for documents, instruments, versions, signatures,
 * approvals, evidence, references, effective dates, supersession and
 * jurisdiction.
 *
 * CRITICAL DISTINCTION — DOCUMENT vs AUTHORITY:
 *   a document reference is EVIDENCE and TEXT. It never confers authority.
 *   Authority for an act comes only from the §26.4 authority-proof model
 *   (a canonical RESOLUTION or DELEGATION). The structures here have NO
 *   authority-granting field by construction, and the validator refuses
 *   any "confersAuthority"-style key (boundary enforcement, tested).
 */

import { familyError } from "../phase3/errors";
import { isIsoDate, type EffectivePeriod } from "./types";
import { SUPERIOR_INSTRUMENTS, type SuperiorInstrument } from "../model";

export function isSuperiorInstrument(value: string): value is SuperiorInstrument {
  return (SUPERIOR_INSTRUMENTS as readonly string[]).includes(value);
}

/** Canonical document reference: the platform documents table + checksum. */
export interface FamilyDocumentRef {
  documentRef: string;
  /** Canonical document checksum (KDD-3: evidence is document-bound). */
  checksum: string;
  version: number;
  period: EffectivePeriod | null;
  jurisdictionRef: string | null;
  /** Explicit classification — the caller chooses; no default exists. */
  classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED" | "HIGHLY_RESTRICTED";
}

export function assertFamilyDocumentRef(d: FamilyDocumentRef): void {
  if (typeof d.documentRef !== "string" || d.documentRef.trim() === "") throw familyError("EVIDENCE_INSUFFICIENT", "FamilyDocumentRef.documentRef is required.", []);
  if (typeof d.checksum !== "string" || d.checksum.trim() === "") {
    throw familyError("EVIDENCE_INSUFFICIENT", "FamilyDocumentRef.checksum is required — evidence is checksum-bound.", []);
  }
  if (d.period !== null) {
    if (!isIsoDate(d.period.effectiveFrom) || (d.period.effectiveTo !== null && !isIsoDate(d.period.effectiveTo))) {
      throw familyError("EVIDENCE_INSUFFICIENT", "document period must be ISO dates.", []);
    }
  }
}

export const INSTRUMENT_KINDS = ["TRUST_INSTRUMENT", "CORPORATE_DOCUMENT", "GOVERNANCE_CHARTER", "CONSENT", "OTHER"] as const;
export type InstrumentKind = (typeof INSTRUMENT_KINDS)[number];

/**
 * A governing instrument reference. Note what is ABSENT: there is no
 * `confersAuthority` field, no authority list, no grant clause value.
 * An instrument is (a) a superior instrument the family is subordinate to,
 * or (b) supporting evidence for a ratification — never a standalone
 * source of family-act authority.
 */
export interface FamilyInstrumentRef {
  instrumentRef: string;
  documentRef: FamilyDocumentRef;
  kind: InstrumentKind;
  /** When the instrument is a superior instrument: which class. */
  superiorInstrument: SuperiorInstrument | null;
  jurisdictionRef: string;
  status: "ACTIVE" | "SUPERSEDED" | "REVOKED";
  supersededByRef: string | null;
  version: number;
}

/** Keys that would turn an instrument/document into an authority source. */
const DOCUMENT_AUTHORITY_FORBIDDEN_KEYS = ["confersAuthority", "authorityGranted", "grantsAuthority", "authorityList", "powerGranted"] as const;

/**
 * Boundary enforcement: a document/instrument structure must not carry
 * authority-conferring fields. Returns the offending keys (throws on any).
 */
export function assertDocumentIsNotAuthority(shape: Record<string, unknown>, label: string): string[] {
  const keys = new Set(Object.keys(shape).map((k) => k.toLowerCase()));
  const found = DOCUMENT_AUTHORITY_FORBIDDEN_KEYS.filter((k) => keys.has(k.toLowerCase()));
  if (found.length > 0) {
    throw familyError("POLICY_INVENTION_REFUSED", `${label} must not carry authority-conferring fields (document ≠ authority). Forbidden: ${found.join(", ")}.`, [], { fields: found });
  }
  return found;
}

export function assertFamilyInstrumentRef(i: FamilyInstrumentRef): void {
  assertFamilyDocumentRef(i.documentRef);
  if (i.superiorInstrument !== null && !isSuperiorInstrument(i.superiorInstrument)) {
    throw familyError("SUPERIOR_INSTRUMENT_CONFLICT", `Unknown superior instrument class "${i.superiorInstrument}".`, []);
  }
  if (typeof i.jurisdictionRef !== "string" || i.jurisdictionRef.trim() === "") {
    throw familyError("AUTHORITY_UNPROVEN", "An instrument must carry an explicit jurisdiction reference — jurisdiction is never inferred.", []);
  }
  if (i.status === "SUPERSEDED" && i.supersededByRef === null) {
    throw familyError("SUPERIOR_INSTRUMENT_CONFLICT", "A superseded instrument must name its successor.", []);
  }
  if (i.status !== "SUPERSEDED" && i.supersededByRef !== null) {
    throw familyError("SUPERIOR_INSTRUMENT_CONFLICT", "Only a superseded instrument may carry supersededByRef.", []);
  }
}

/** A signature is EVIDENCE of execution of a document — not authority. */
export interface SignatureRef {
  signatureRef: string;
  documentRef: string;
  signerRef: string;
  method: "WET_INK" | "DIGEST" | "GOVERNED_ELECTRONIC";
  signedAt: string;
  evidenceRef: string;
}

export function assertSignatureRef(s: SignatureRef): void {
  if (!isIsoDate(s.signedAt)) throw familyError("EVIDENCE_INSUFFICIENT", "Signature.signedAt must be an ISO date.", []);
  if (typeof s.evidenceRef !== "string" || s.evidenceRef.trim() === "") {
    throw familyError("EVIDENCE_INSUFFICIENT", "A signature must cite its evidence record.", []);
  }
}

/** An approval reference (the human approval record — governance layer). */
export interface ApprovalReference {
  approvalRef: string;
  approverUserId: string;
  approvedAt: string;
  authorityRef: string;
}

/** Version + supersession validation for any versioned reference. */
export function assertVersionChain(version: number, supersededByRef: string | null, status: string): void {
  if (!Number.isInteger(version) || version < 1) throw familyError("EVIDENCE_INSUFFICIENT", "version must be a positive integer.", []);
  if (status === "SUPERSEDED" && supersededByRef === null) {
    throw familyError("SUPERIOR_INSTRUMENT_CONFLICT", "A superseded version must name its successor.", []);
  }
}
