/**
 * Government adapter contract — the ONLY shape through which a government
 * system can speak to BEYU OS. Sibling of the payment adapter contract
 * (src/lib/payments/providers/adapter.ts); read that file's preamble — the
 * same containment philosophy applies verbatim:
 *
 *   An adapter exists to translate; it has no database handle, no principal,
 *   no capability authority and no ability to assert a fact about a
 *   government outcome. It returns the government system's actual response
 *   plus an evidence bundle. Everything downstream — authorization, policy,
 *   idempotency, submission state, reconciliation, audit — lives OUTSIDE this
 *   interface, in the gateway, so adding an agency can never change how a
 *   government fact is proved.
 *
 * FABRICATION IS UNREPRESENTABLE:
 *   - `AdapterSubmitResult.outcome = "ACCEPTED"` requires `externalReference`
 *     (typed as a discriminated union — an accepted result WITHOUT the
 *     government's own reference does not compile).
 *   - A mock adapter can never report itself production-capable:
 *     `isMock: true` caps its reachable status at SANDBOX_READY.
 */

import type { z } from "zod";

/** Closed catalogue mirroring the government_agencies.integration_status CHECK. */
export const GOVERNMENT_INTEGRATION_STATUS = [
  "NOT_STARTED",
  "DISCOVERY",
  "CONTRACT_PENDING",
  "CONTRACT_VERIFIED",
  "IMPLEMENTING",
  "IMPLEMENTED",
  "SANDBOX_READY",
  "UAT_VERIFIED",
  "PRODUCTION_AUTHORIZATION_PENDING",
  "PRODUCTION_READY",
  "LIVE",
  "DEGRADED",
  "EXTERNAL_BLOCKED",
  "SUSPENDED",
] as const;
export type GovernmentIntegrationStatus = (typeof GOVERNMENT_INTEGRATION_STATUS)[number];

/** Statuses a MOCK/SANDBOX adapter may ever report about itself. */
export type MockReachableStatus = Extract<
  GovernmentIntegrationStatus,
  "NOT_STARTED" | "DISCOVERY" | "IMPLEMENTING" | "IMPLEMENTED" | "SANDBOX_READY" | "EXTERNAL_BLOCKED"
>;

/** Closed catalogue mirroring government_submissions.status CHECK. */
export const GOVERNMENT_SUBMISSION_STATUS = [
  "DRAFT",
  "PENDING_EXTERNAL",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "FAILED",
  "RETRY_REQUIRED",
  "RECONCILIATION_REQUIRED",
  "EXTERNAL_UNAVAILABLE",
  "EXTERNAL_BLOCKED",
] as const;
export type GovernmentSubmissionStatus = (typeof GOVERNMENT_SUBMISSION_STATUS)[number];

export type GovernmentAgencyCode =
  | "TRA_VFD"
  | "NHIF"
  | "NIDA"
  | "BRELA"
  | "DHIS2"
  | "TMDA"
  | "NSSF"
  | "WCF"
  | "OSHA"
  | "PSSSF"
  | (string & {}); // portfolio is extensible; the architecture is not

/**
 * Configuration resolution result. `credentialRefs` are env-var NAMES; values
 * are read from process.env at call time and never persisted or logged
 * (same model as payment provider connections).
 */
export type AdapterConfigReport = {
  configured: boolean;
  missing: string[]; // names of absent env vars — safe to log
  environment: "SANDBOX" | "UAT" | "PRODUCTION" | "UNCONFIGURED";
};

/**
 * The government system's actual answer — a discriminated union so that an
 * ACCEPTED outcome without the government's own reference is a TYPE ERROR,
 * not a code-review hope.
 */
export type AdapterSubmitResult =
  | {
      outcome: "ACCEPTED";
      /** The government system's OWN reference (e.g. TRA RCTNUM, NHIF claim ref). */
      externalReference: string;
      /** Raw response body digest source — the gateway hashes it for evidence. */
      rawResponse: string;
    }
  | { outcome: "REJECTED"; errorCode: string; detail: string; rawResponse: string }
  | { outcome: "RETRY_REQUIRED"; errorCode: string; detail: string }
  | { outcome: "EXTERNAL_UNAVAILABLE"; detail: string }
  | { outcome: "EXTERNAL_BLOCKED"; missing: string[] };

export type AdapterVerifyResult =
  | { verified: true; attributes: Record<string, string>; rawResponse: string }
  | { verified: false; errorCode: string; detail: string }
  | { outcome: "EXTERNAL_UNAVAILABLE"; detail: string }
  | { outcome: "EXTERNAL_BLOCKED"; missing: string[] };

/**
 * Canonical adapter interface. Methods are OPTIONAL capability slots — an
 * official government contract that has no query API simply omits `query`;
 * we never force an official contract into an artificial shape (§16.2).
 */
export interface GovernmentAdapter {
  readonly agencyCode: GovernmentAgencyCode;
  readonly displayName: string;
  /** Load-bearing flag: a mock can never report production capability. */
  readonly isMock: boolean;
  readonly adapterVersion: string;
  /** Zod schema for the payloads this adapter will accept for submit(). */
  readonly submitSchema?: z.ZodTypeAny;

  /** Report configuration completeness WITHOUT reading secret values into results. */
  validateConfiguration(): AdapterConfigReport;
  /** Self-reported integration status — capped for mocks at the type level. */
  status(): GovernmentIntegrationStatus;

  submit?(payload: unknown, opts: AdapterCallOptions): Promise<AdapterSubmitResult>;
  verify?(subject: Record<string, string>, opts: AdapterCallOptions): Promise<AdapterVerifyResult>;
  healthCheck?(): Promise<{ reachable: boolean; detail: string }>;
}

export type AdapterCallOptions = {
  idempotencyKey: string;
  correlationId: string;
  timeoutMs?: number;
};

export class GovernmentAdapterError extends Error {
  constructor(
    readonly code:
      | "NOT_CONFIGURED"
      | "UNSUPPORTED_CAPABILITY"
      | "INVALID_PAYLOAD"
      | "MALFORMED_RESPONSE"
      | "TIMEOUT",
    message: string,
  ) {
    super(message);
    this.name = "GovernmentAdapterError";
  }
}
