/**
 * Contract-pending government adapters.
 *
 * For agencies where discovery found NO officially published machine
 * interface (BRELA ORS is a public portal without a developer API; TMDA,
 * NSSF, WCF, OSHA and PSSSF publish portals, not APIs), the honest state is
 * CONTRACT_PENDING: the canonical adapter slot exists, the gateway can route
 * to it, and every call reports EXTERNAL_BLOCKED naming the missing official
 * contract — nothing is scraped, nothing is fabricated (§16.6, §16.10).
 *
 * One class, many instances: these agencies currently share identical
 * behaviour (refuse until an official contract + credentials exist). The
 * moment any agency publishes a real interface, it gets its own adapter file
 * with a verified contract schema — extending the PORTFOLIO, never the
 * architecture.
 */
import type {
  AdapterCallOptions,
  AdapterConfigReport,
  AdapterVerifyResult,
  GovernmentAdapter,
  GovernmentIntegrationStatus,
} from "../adapter";

export class ContractPendingAdapter implements GovernmentAdapter {
  readonly isMock = false;
  readonly adapterVersion = "gov-contract-pending-1.0.0";

  constructor(
    readonly agencyCode: string,
    readonly displayName: string,
    /** What exactly is missing — surfaced verbatim in EXTERNAL_BLOCKED results. */
    private readonly missingContract: string,
  ) {}

  validateConfiguration(): AdapterConfigReport {
    return { configured: false, missing: [this.missingContract], environment: "UNCONFIGURED" };
  }

  status(): GovernmentIntegrationStatus {
    return "CONTRACT_PENDING";
  }

  async verify(_subject: Record<string, string>, _opts: AdapterCallOptions): Promise<AdapterVerifyResult> {
    return { outcome: "EXTERNAL_BLOCKED", missing: [this.missingContract] };
  }
}

/** The contract-pending portfolio (initial ten minus those with verified interfaces). */
export function createContractPendingAdapters(): ContractPendingAdapter[] {
  return [
    new ContractPendingAdapter(
      "BRELA",
      "Business Registrations and Licensing Agency — company verification",
      "OFFICIAL_BRELA_API (ORS is a public portal; no developer API is published — verification requires an official BRELA/GovESB integration agreement)",
    ),
    new ContractPendingAdapter(
      "TMDA",
      "Tanzania Medicines and Medical Devices Authority",
      "OFFICIAL_TMDA_API (no public integration interface published; requires TMDA integration agreement)",
    ),
    new ContractPendingAdapter(
      "NSSF",
      "National Social Security Fund — employer/member services",
      "OFFICIAL_NSSF_API (employer portal only; machine integration requires an NSSF agreement)",
    ),
    new ContractPendingAdapter(
      "WCF",
      "Workers Compensation Fund — employer registration and claims",
      "OFFICIAL_WCF_API (portal only; machine integration requires a WCF agreement)",
    ),
    new ContractPendingAdapter(
      "OSHA",
      "Occupational Safety and Health Authority — workplace compliance",
      "OFFICIAL_OSHA_API (portal only; machine integration requires an OSHA agreement)",
    ),
    new ContractPendingAdapter(
      "PSSSF",
      "Public Service Social Security Fund — member/employer services",
      "OFFICIAL_PSSSF_API (portal only; machine integration requires a PSSSF agreement)",
    ),
  ];
}
