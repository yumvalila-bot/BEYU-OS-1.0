/**
 * NIDA (National Identification Authority, Tanzania) adapter.
 *
 * OFFICIAL CONTRACT STATUS: NIDA publishes NO public developer portal or API
 * documentation. Authorized access requires a formal agreement with NIDA
 * (institutional authorization, data-sharing agreement, and — in the current
 * e-Government architecture — connectivity via the Government Enterprise
 * Service Bus). Unofficial community endpoints exist but are NOT authorized
 * interfaces and this adapter refuses to use them (§16.10: no scraping, no
 * undocumented interfaces).
 *
 * Therefore: status = CONTRACT_PENDING until an official NIDA/GovESB contract
 * and credentials are supplied by the owning institution. The adapter shape,
 * validation and audit path are complete so activation is a configuration +
 * authorization exercise, not an engineering one.
 *
 * CONSTITUTIONAL BOUNDARY: NIDA never replaces GlobalUserID. A NIDA response
 * only VERIFIES attributes of an existing BEYU identity; the gateway records
 * a subject digest, never raw NIN attributes, in audit.
 */
import {
  GovernmentAdapterError,
  type AdapterCallOptions,
  type AdapterConfigReport,
  type AdapterVerifyResult,
  type GovernmentAdapter,
  type GovernmentIntegrationStatus,
} from "../adapter";

export const NIDA_CREDENTIAL_REFS = [
  "BEYU_NIDA_GOVESB_URL",
  "BEYU_NIDA_CLIENT_CERT_REF",
  "BEYU_NIDA_AGREEMENT_REF",
] as const;

const NIN_PATTERN = /^\d{20}$/;

export class NidaAdapter implements GovernmentAdapter {
  readonly agencyCode = "NIDA";
  readonly displayName = "National Identification Authority — NIN verification (authorized channel only)";
  readonly isMock = false;
  readonly adapterVersion = "gov-nida-1.0.0";

  validateConfiguration(): AdapterConfigReport {
    const missing = NIDA_CREDENTIAL_REFS.filter((name) => !process.env[name]);
    return {
      configured: missing.length === 0,
      missing: [...missing],
      environment: missing.length > 0 ? "UNCONFIGURED" : "UAT",
    };
  }

  status(): GovernmentIntegrationStatus {
    // No official public contract exists to verify against; even a full
    // credential set cannot move this past CONTRACT_PENDING without the
    // signed agreement recorded in the registry by the governed admin path.
    return "CONTRACT_PENDING";
  }

  async verify(subject: Record<string, string>, _opts: AdapterCallOptions): Promise<AdapterVerifyResult> {
    const nin = subject.nin ?? "";
    if (!NIN_PATTERN.test(nin)) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "NIDA verification requires a 20-digit NIN.");
    }
    const config = this.validateConfiguration();
    return {
      outcome: "EXTERNAL_BLOCKED",
      missing: config.configured
        ? ["OFFICIAL_NIDA_CONTRACT (signed data-sharing agreement + GovESB onboarding)"]
        : config.missing,
    };
  }
}
