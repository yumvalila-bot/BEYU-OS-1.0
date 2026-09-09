/**
 * MOCK SANDBOX government adapter — proves the gateway pipeline (policy,
 * idempotency, fail-closed states, audit, RLS) without external credentials,
 * exactly like the payment MockProviderAdapter (src/lib/payments/providers/mock.ts).
 *
 * `isMock === true` is load-bearing: `status()` is typed MockReachableStatus,
 * so a mock reporting UAT_VERIFIED / PRODUCTION_READY / LIVE about itself is
 * a COMPILE ERROR, and mock output can never become production evidence.
 */
import { z } from "zod";
import {
  GovernmentAdapterError,
  type AdapterCallOptions,
  type AdapterConfigReport,
  type AdapterSubmitResult,
  type AdapterVerifyResult,
  type GovernmentAdapter,
  type MockReachableStatus,
} from "../adapter";

export const MOCK_AGENCY_CODE = "MOCK_GOV_SANDBOX";

export const mockGovSubmitSchema = z.object({
  kind: z.literal("MOCK_SUBMISSION"),
  reference: z.string().min(1).max(64),
  /** Test lever: which government behaviour the simulated agency exhibits. */
  behave: z.enum(["ACCEPT", "REJECT", "TIMEOUT"]).default("ACCEPT"),
});

export class MockGovernmentAdapter implements GovernmentAdapter {
  readonly agencyCode = MOCK_AGENCY_CODE;
  readonly displayName = "BEYU Government Sandbox (mock)";
  readonly isMock = true;
  readonly adapterVersion = "gov-mock-1.0.0";
  readonly submitSchema = mockGovSubmitSchema;

  validateConfiguration(): AdapterConfigReport {
    return { configured: true, missing: [], environment: "SANDBOX" };
  }

  status(): MockReachableStatus {
    return "SANDBOX_READY";
  }

  async submit(payload: unknown, opts: AdapterCallOptions): Promise<AdapterSubmitResult> {
    const parsed = mockGovSubmitSchema.safeParse(payload);
    if (!parsed.success) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "Payload does not satisfy the mock contract.");
    }
    switch (parsed.data.behave) {
      case "ACCEPT": {
        const raw = JSON.stringify({
          ack: "MOCK_ACK",
          ref: `MOCKGOV-${parsed.data.reference}`,
          idempotencyKey: opts.idempotencyKey,
        });
        return { outcome: "ACCEPTED", externalReference: `MOCKGOV-${parsed.data.reference}`, rawResponse: raw };
      }
      case "REJECT":
        return {
          outcome: "REJECTED",
          errorCode: "MOCK_VALIDATION_FAILURE",
          detail: "Simulated agency-side rejection.",
          rawResponse: JSON.stringify({ error: "MOCK_VALIDATION_FAILURE" }),
        };
      case "TIMEOUT":
        return { outcome: "EXTERNAL_UNAVAILABLE", detail: "Simulated agency outage." };
    }
  }

  async verify(subject: Record<string, string>, _opts: AdapterCallOptions): Promise<AdapterVerifyResult> {
    if (!subject.reference) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "Mock verification requires a reference.");
    }
    return {
      verified: true,
      attributes: { reference: subject.reference, status: "MOCK_VERIFIED" },
      rawResponse: JSON.stringify({ verified: true, reference: subject.reference }),
    };
  }
}
