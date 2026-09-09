/**
 * DHIS2 (Ministry of Health national HMIS instance) adapter.
 *
 * OFFICIAL CONTRACT (verified discovery evidence): DHIS2 is an open-source
 * platform with a fully documented, versioned Web API
 * (https://docs.dhis2.org — /api/dataValueSets for aggregate reporting,
 * basic or PAT authentication). The SOFTWARE contract is public and stable;
 * what is EXTERNAL is authorization onto Tanzania's national instance:
 * instance URL, reporting credentials, orgUnit and dataSet assignments are
 * issued by the Ministry of Health to registered facilities.
 *
 * DATA BOUNDARY (§16.5-E): aggregate indicators only. Patient-level data
 * never crosses this adapter — the schema cannot express it.
 */
import { z } from "zod";
import {
  GovernmentAdapterError,
  type AdapterCallOptions,
  type AdapterConfigReport,
  type AdapterSubmitResult,
  type GovernmentAdapter,
  type GovernmentIntegrationStatus,
} from "../adapter";

export const DHIS2_CREDENTIAL_REFS = [
  "BEYU_DHIS2_BASE_URL",
  "BEYU_DHIS2_USERNAME_REF",
  "BEYU_DHIS2_PAT_REF",
  "BEYU_DHIS2_ORG_UNIT",
] as const;

/** Aggregate data value — the ONLY shape this adapter can carry. */
const dataValueSchema = z.object({
  dataElement: z.string().min(1).max(64),
  categoryOptionCombo: z.string().max(64).optional(),
  value: z.string().min(1).max(64),
});

export const dhis2AggregateSchema = z.object({
  kind: z.literal("DHIS2_AGGREGATE_REPORT"),
  dataSet: z.string().min(1).max(64),
  period: z.string().regex(/^\d{4}(0[1-9]|1[0-2])?(Q[1-4])?$/), // yyyy / yyyyMM / yyyyQn
  orgUnit: z.string().min(1).max(64),
  dataValues: z.array(dataValueSchema).min(1),
});

export class Dhis2Adapter implements GovernmentAdapter {
  readonly agencyCode = "DHIS2";
  readonly displayName = "DHIS2 national health reporting (aggregate only)";
  readonly isMock = false;
  readonly adapterVersion = "gov-dhis2-1.0.0";
  readonly submitSchema = dhis2AggregateSchema;

  validateConfiguration(): AdapterConfigReport {
    const missing = DHIS2_CREDENTIAL_REFS.filter((name) => !process.env[name]);
    return {
      configured: missing.length === 0,
      missing: [...missing],
      environment: missing.length > 0 ? "UNCONFIGURED" : "UAT",
    };
  }

  status(): GovernmentIntegrationStatus {
    return this.validateConfiguration().configured ? "SANDBOX_READY" : "EXTERNAL_BLOCKED";
  }

  async submit(payload: unknown, _opts: AdapterCallOptions): Promise<AdapterSubmitResult> {
    const parsed = dhis2AggregateSchema.safeParse(payload);
    if (!parsed.success) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "Payload does not satisfy the DHIS2 dataValueSets contract.");
    }
    const config = this.validateConfiguration();
    if (!config.configured) return { outcome: "EXTERNAL_BLOCKED", missing: config.missing };
    return {
      outcome: "EXTERNAL_UNAVAILABLE",
      detail: "DHIS2 live reporting requires activation against the authorized national instance (runbook docs/integrations/runbooks/DHIS2.md).",
    };
  }
}
