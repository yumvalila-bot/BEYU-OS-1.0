/**
 * External integration adapter framework (Phase 2Z).
 *
 * Every external system (NHIF, TRA, TMDA, PACS, video, FHIR, payment, SMS,
 * email, MTUHA submission, Finance OS, HIVE) is reached through a typed
 * adapter implementing ExternalAdapter. Adapters MUST:
 *  - Validate their configuration on bootstrap; if credentials/URLs are
 *    absent they report state='unavailable' (fail-closed, no fabrication).
 *  - Observe timeout + retry + idempotency on every outbound call.
 *  - Emit audit events before/after every outbound mutation.
 *  - Never log credentials, tokens, or PHI payloads.
 *  - Map provider errors into typed DomainError subclasses.
 *
 * The AdapterRegistry is the ONLY permitted way to reach external providers.
 */
import { Injectable } from "@nestjs/common";
import { DomainError } from "../../common/errors/domain.error";

export type IntegrationProvider =
  | "nhif" | "tra" | "tmda" | "pacs" | "video_provider" | "fhir_endpoint"
  | "mtuha_submission" | "finance_os" | "payment_gateway" | "sms_gateway"
  | "email_gateway" | "hive";

export type IntegrationState = "available" | "configured" | "failed" | "unavailable";

export interface AdapterStatus {
  provider: IntegrationProvider;
  state: IntegrationState;
  last_check_at: Date | null;
  last_error: string | null;
  configured_fields: string[];
  missing_fields: string[];
}

export interface AdapterCallOptions {
  timeoutMs?: number;
  idempotencyKey?: string;
  correlationId?: string;
  dryRun?: boolean;
}

export interface ExternalAdapter<TReq, TRes> {
  readonly provider: IntegrationProvider;
  probe(): Promise<AdapterStatus>;
  call(req: TReq, opts?: AdapterCallOptions): Promise<TRes>;
}

@Injectable()
export class AdapterRegistry {
  private readonly adapters = new Map<IntegrationProvider, ExternalAdapter<unknown, unknown>>();

  register(adapter: ExternalAdapter<unknown, unknown>): void {
    this.adapters.set(adapter.provider, adapter);
  }

  get<TReq = unknown, TRes = unknown>(provider: IntegrationProvider): ExternalAdapter<TReq, TRes> | null {
    return (this.adapters.get(provider) as ExternalAdapter<TReq, TRes>) ?? null;
  }

  async probeAll(): Promise<AdapterStatus[]> {
    return Promise.all(Array.from(this.adapters.values()).map((a) => a.probe()));
  }
}

function stubAdapter(provider: IntegrationProvider, missingFields: string[]): ExternalAdapter<unknown, unknown> {
  return {
    provider,
    async probe(): Promise<AdapterStatus> {
      return {
        provider,
        state: "unavailable",
        last_check_at: new Date(),
        last_error: "Adapter not configured. Live integration BLOCKED — credentials/endpoint required.",
        configured_fields: [],
        missing_fields: missingFields,
      };
    },
    async call(): Promise<never> {
      throw DomainError.unavailable(
        `External provider '${provider}' is not configured. Live integration is BLOCKED until credentials and endpoint are configured.`,
      );
    },
  };
}

/** Fail-closed stubs for every regulated external dependency. These are
 *  registered automatically until a real adapter with credentials replaces
 *  them. No fabricated endpoints. No fabricated PASS. */
export const STUB_ADAPTERS: ExternalAdapter<unknown, unknown>[] = [
  stubAdapter("nhif",             ["NHIF_ENDPOINT", "NHIF_USERNAME", "NHIF_PASSWORD", "NHIF_FACILITY_CODE"]),
  stubAdapter("tra",              ["TRA_ENDPOINT", "TRA_TIN", "TRA_CERT_PATH", "TRA_KEY_PATH"]),
  stubAdapter("tmda",             ["TMDA_ENDPOINT", "TMDA_API_KEY"]),
  stubAdapter("pacs",             ["PACS_DICOM_ENDPOINT", "PACS_WADO_URL"]),
  stubAdapter("video_provider",   ["VIDEO_PROVIDER_API_KEY", "VIDEO_PROVIDER_SECRET", "VIDEO_PROVIDER_BASE_URL"]),
  stubAdapter("fhir_endpoint",    ["FHIR_ENDPOINT_BASE_URL", "FHIR_ENDPOINT_TOKEN"]),
  stubAdapter("mtuha_submission", ["MTUHA_ENDPOINT", "MTUHA_FACILITY_ID", "MTUHA_CREDENTIAL"]),
  stubAdapter("finance_os",       ["FINANCE_OS_ENDPOINT", "FINANCE_OS_TOKEN"]),
  stubAdapter("payment_gateway",  ["PAYMENT_PROVIDER", "PAYMENT_API_KEY", "PAYMENT_WEBHOOK_SECRET"]),
  stubAdapter("sms_gateway",      ["SMS_PROVIDER", "SMS_API_KEY"]),
  stubAdapter("email_gateway",    ["EMAIL_SMTP_HOST", "EMAIL_SMTP_USER", "EMAIL_SMTP_PASS"]),
  stubAdapter("hive",             ["HIVE_ENDPOINT", "HIVE_TOKEN"]),
];

/** Bootstrap helper: register all stub adapters (fail-closed defaults). */
export function registerStubAdapters(reg: AdapterRegistry): void {
  for (const a of STUB_ADAPTERS) reg.register(a);
}
