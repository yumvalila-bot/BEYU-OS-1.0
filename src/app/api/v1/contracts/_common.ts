/**
 * Shared helpers for the `/api/v1/contracts/*` and `/api/v1/blockchain/*` routes.
 *
 * Routes stay thin: authentication, authorization, rate limiting, idempotency,
 * the error envelope and the audit append all belong to the existing
 * `guarded()` / `withIdempotency()` machinery in `src/lib/api.ts`, and every
 * business decision belongs to the pure engines. Nothing here reimplements
 * either.
 *
 * What this file does: (1) re-export the closed vocabularies so a request schema
 * and the engine literally share one source of truth — a route cannot accept a
 * state the engine would refuse, because both import the same `as const` array
 * and TypeScript carries its literal union into the service call; and (2) map the
 * domain error contract onto the HTTP envelope.
 */

import { apiError } from "@/lib/api";
import { CONTRACT_ERROR_STATUS, ContractError } from "@/lib/contracts/errors";
import { ContractModelError } from "@/lib/contracts/pure";
import { CONTRACT_ACTIONS } from "@/lib/contracts/model";
import {
  ANCHOR_METHODS,
  ANCHOR_STATUSES,
  CONTRACT_OPERATIONAL_STATUSES,
  EVENT_KINDS,
  ORACLE_FEEDS,
  ORACLE_SOURCE_KINDS,
  RECONCILIATION_FINDINGS,
  SUPPORTED_NETWORKS,
} from "@/lib/blockchain/model";
import {
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_TYPES,
  DISPUTE_STATES,
  DISPUTE_TYPES,
  EXECUTION_METHODS,
  LEGAL_DOCUMENT_CLASSES,
  LEGAL_DOCUMENT_STATES,
  OBLIGATION_KINDS,
  OBLIGATION_RESPONSIBLE_PARTY_ROLES,
  OBLIGATION_RISK_SEVERITIES,
  OBLIGATION_STATES,
  SIGNATURE_STATES,
} from "@/lib/contracts/vocabulary";
import { SIGNATURE_METHODS } from "@/lib/contracts/signing";

export {
  ANCHOR_METHODS,
  ANCHOR_STATUSES,
  CONTRACT_ACTIONS,
  CONTRACT_LIFECYCLE_STATES,
  CONTRACT_OPERATIONAL_STATUSES,
  CONTRACT_TYPES,
  DISPUTE_STATES,
  DISPUTE_TYPES,
  EVENT_KINDS,
  EXECUTION_METHODS,
  LEGAL_DOCUMENT_CLASSES,
  LEGAL_DOCUMENT_STATES,
  OBLIGATION_KINDS,
  OBLIGATION_RESPONSIBLE_PARTY_ROLES,
  OBLIGATION_RISK_SEVERITIES,
  OBLIGATION_STATES,
  ORACLE_FEEDS,
  ORACLE_SOURCE_KINDS,
  RECONCILIATION_FINDINGS,
  SIGNATURE_METHODS,
  SIGNATURE_STATES,
};

export const CONTRACT_API_VERSION = "contracts-api-1.0.0";

/** Network keys are a catalogue, not a literal union: derived, then pinned. */
export const NETWORK_KEYS = SUPPORTED_NETWORKS.map((n) => n.key) as [string, ...string[]];

export const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;
export const SEVERITIES = OBLIGATION_RISK_SEVERITIES;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const HASH32 = /^0x[0-9a-fA-F]{64}$/;
export const ADDRESS20 = /^0x[0-9a-fA-F]{40}$/;

/**
 * Map a domain error onto the standard error envelope, or `null` when the error
 * is not domain-shaped. An unrecognized error is re-thrown so it reaches the
 * platform handler instead of being dressed up as a 4xx — an infrastructure
 * failure must never look like a business refusal.
 */
export function contractApiError(err: unknown, traceId: string) {
  if (err instanceof ContractError) {
    return apiError(err.code, err.message, CONTRACT_ERROR_STATUS[err.code], traceId, err.detail);
  }
  if (err instanceof ContractModelError) {
    return apiError(err.code, err.message, 422, traceId, err.detail);
  }
  return null;
}

/** Today in UTC, for read models that need an explicit `asOf` default. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
