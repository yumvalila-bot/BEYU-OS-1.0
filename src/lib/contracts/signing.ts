/**
 * BEYU OS — §38 ELECTRONIC SIGNATURE POSTURE (pure engine).
 *
 * Records and evaluates the mechanics of signing: who signed, in what order,
 * by which method, against which content hash, with which authentication
 * evidence. Two properties are constitutional here:
 *
 *  1. A signature binds a HASH, never the document: the hash is the commitment
 *     the anchor ledger can later publish (§37). Content never leaves BEYU.
 *  2. Signature method is METADATA. Nothing in this module (or anywhere in
 *     BEYU OS) infers legal enforceability from a wallet signature, an e-mail
 *     confirmation or a hash: `enforceability` is always REQUIRES_LEGAL_REVIEW
 *     until a human closes it under the governing law (§23, §74).
 */

import { assertHash32, assertRef, ContractModelError } from "./pure";
import type { ContractLifecycleState } from "./vocabulary";
import { LEGAL_REVIEW_CLOSED, type SignatureState, type ExecutionMethod } from "./vocabulary";

export const SIGNATURE_METHODS = [
  "QUALIFIED_ELECTRONIC",
  "ADVANCED_ELECTRONIC",
  "SIMPLE_ELECTRONIC",
  "WET_INK_SCANNED",
  "BOARD_RESOLUTION_ATTESTED",
  "BLOCKCHAIN_ADDRESS_ATTESTED",
  "COUNTERSIGNED_WET_INK",
] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

/**
 * Authentication evidence a signature method REQUIRES. A wallet signature with
 * no authentication evidence is not proven to be the signer, so it never
 * satisfies a signing slot — fail closed rather than assume.
 */
export const METHOD_AUTHENTICATION_EVIDENCE: Record<SignatureMethod, readonly string[]> = {
  QUALIFIED_ELECTRONIC: ["TSP_CERTIFICATE_ID", "SIGNING_NONCE", "DOCUMENT_HASH"],
  ADVANCED_ELECTRONIC: ["SIGNING_NONCE", "DOCUMENT_HASH"],
  SIMPLE_ELECTRONIC: ["AUTH_CHALLENGE_ID", "DOCUMENT_HASH"],
  WET_INK_SCANNED: ["WITNESS_REF", "DOCUMENT_HASH"],
  BOARD_RESOLUTION_ATTESTED: ["RESOLUTION_ID", "MINUTES_DOC_REF"],
  BLOCKCHAIN_ADDRESS_ATTESTED: ["SIGNATURE_PROOF_REF", "DOCUMENT_HASH", "CHAIN_ID"],
  COUNTERSIGNED_WET_INK: ["WITNESS_REF", "COUNTERPARTY_ACK_REF", "DOCUMENT_HASH"],
};

/** Methods whose jurisdictional validity is never assumed by software. */
export const METHOD_LEGAL_REVIEW_REQUIRED: Record<SignatureMethod, boolean> = {
  QUALIFIED_ELECTRONIC: true,
  ADVANCED_ELECTRONIC: true,
  SIMPLE_ELECTRONIC: true,
  WET_INK_SCANNED: true,
  BOARD_RESOLUTION_ATTESTED: false,
  BLOCKCHAIN_ADDRESS_ATTESTED: true,
  COUNTERSIGNED_WET_INK: true,
};

export type SignatureSlot = {
  sequence: number;
  partyId: string;
  signerPartyId?: string | null;
  state: SignatureState;
  method?: SignatureMethod | null;
  documentHash?: string | null;
  evidenceRefs?: readonly string[];
  signedAt?: string | null;
};

export type SigningPosture = {
  required: number;
  satisfied: number;
  complete: boolean;
  sequenceValid: boolean;
  hashesAgree: boolean;
  bindingDocumentHash: string | null;
  findings: string[];
  enforceability: "REQUIRES_LEGAL_REVIEW";
};

/**
 * Signing posture over a sequence of slots. Sequence is strict: slot n+1 cannot
 * be signed while slot n is unsatisfied. Hash agreement is a hard control: a
 * signature captured over a different digest is a finding, not a detail — it
 * means the parties did not sign the same content.
 */
export function evaluateSigningPosture(slots: readonly SignatureSlot[]): SigningPosture {
  if (slots.length === 0) {
    return {
      required: 0,
      satisfied: 0,
      complete: false,
      sequenceValid: false,
      hashesAgree: false,
      bindingDocumentHash: null,
      findings: ["No signature slots exist for this execution package."],
      enforceability: "REQUIRES_LEGAL_REVIEW",
    };
  }
  const ordered = [...slots].sort((a, b) => a.sequence - b.sequence);
  const findings: string[] = [];
  let sequenceValid = true;
  let satisfied = 0;
  let bindingHash: string | null = null;
  let hashesAgree = true;

  ordered.forEach((slot, index) => {
    if (slot.sequence !== index + 1) {
      sequenceValid = false;
      findings.push(`Slot sequence must be contiguous from 1; found ${slot.sequence} at position ${index + 1}.`);
    }
    assertRef(slot.partyId, `slot[${index}].partyId`);
    if (slot.state === "SIGNED") {
      satisfied += 1;
      if (slot.method) {
        const requiredEvidence = METHOD_AUTHENTICATION_EVIDENCE[slot.method];
        const have = new Set((slot.evidenceRefs ?? []).map((r) => r.trim().toUpperCase()));
        const missing = requiredEvidence.filter((r) => !have.has(r));
        if (missing.length > 0) {
          findings.push(
            `Slot ${slot.sequence} (${slot.method}) lacks required authentication evidence: ${missing.join(", ")}.`,
          );
          sequenceValid = false;
        }
      } else {
        findings.push(`Slot ${slot.sequence} is SIGNED with no recorded method.`);
        sequenceValid = false;
      }
      if (slot.documentHash) {
        const h = slot.documentHash.toLowerCase();
        if (bindingHash === null) bindingHash = h;
        else if (bindingHash !== h) {
          hashesAgree = false;
          findings.push(`Slot ${slot.sequence} binds a different document hash than earlier slots.`);
        }
      } else {
        findings.push(`Slot ${slot.sequence} records no document hash — signature is not bound to content.`);
        sequenceValid = false;
      }
      if (!slot.signedAt) findings.push(`Slot ${slot.sequence} has no signature timestamp.`);
    } else if (slot.state === "REJECTED" || slot.state === "WITHDRAWN" || slot.state === "EXPIRED") {
      findings.push(`Slot ${slot.sequence} is ${slot.state}; execution cannot complete on this package.`);
    }
  });

  const complete = satisfied === ordered.length && hashesAgree && sequenceValid;
  return {
    required: ordered.length,
    satisfied,
    complete,
    sequenceValid,
    hashesAgree,
    bindingDocumentHash: bindingHash,
    findings,
    enforceability: "REQUIRES_LEGAL_REVIEW",
  };
}

/** Validate a signature record at write time (server-side, never client-trusted). */
export function assertSignatureRecordable(input: {
  method: SignatureMethod;
  documentHash: string;
  evidenceRefs: readonly string[];
  signedAtIso: string;
}): { method: SignatureMethod; documentHash: string; evidenceRefs: string[]; legalReviewRequired: boolean } {
  const method = input.method;
  const documentHash = assertHash32(input.documentHash, "documentHash");
  const evidence = input.evidenceRefs.map((e) => assertRef(e, "evidenceRef"));
  const required = METHOD_AUTHENTICATION_EVIDENCE[method];
  const have = new Set(evidence.map((e) => e.toUpperCase()));
  const missing = required.filter((r) => !have.has(r.toUpperCase()));
  if (missing.length > 0) {
    throw new ContractModelError(
      "EVIDENCE_REQUIRED",
      `Signature method ${method} requires authentication evidence: ${missing.join(", ")}.`,
      { method, missing },
    );
  }
  return { method, documentHash, evidenceRefs: evidence, legalReviewRequired: METHOD_LEGAL_REVIEW_REQUIRED[method] };
}

/**
 * Signature evidence is a pre-condition of `SIGNATURE_PENDING → EXECUTED`; this
 * names the requirement so the service and the model cannot drift.
 */
export function signaturePreconditionFor(state: ContractLifecycleState): boolean {
  return state === "SIGNATURE_PENDING";
}

/** Execution method legality: an on-chain method never implies legal effect. */
export function executionMethodPosture(method: ExecutionMethod, legalReviewStatus: string): {
  method: ExecutionMethod;
  legalReviewClosed: boolean;
  enforceability: "REQUIRES_LEGAL_REVIEW";
  note: string;
} {
  return {
    method,
    legalReviewClosed: legalReviewStatus === LEGAL_REVIEW_CLOSED,
    enforceability: "REQUIRES_LEGAL_REVIEW",
    note:
      method === "ONCHAIN_ATTESTED"
        ? "An on-chain attestation proves existence and integrity of a commitment at a point in time. It does not prove contractual validity, capacity, authority or enforceability under any governing law."
        : "Execution method is recorded as evidence; enforceability is a legal determination made by a human.",
  };
}
