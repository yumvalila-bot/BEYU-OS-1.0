/**
 * TRA Virtual Fiscal Device (VFD/EFDMS) adapter.
 *
 * OFFICIAL CONTRACT (verified discovery evidence, docs/integrations registry):
 *   TRA EFDMS exposes an HTTP+XML API. Test-server endpoints published in the
 *   official taxpayer integration guide:
 *     registration:  POST https://virtual.tra.go.tz/efdmsRctApi/api/vfdRegReq
 *     token:         POST https://virtual.tra.go.tz/efdmsRctApi/vfdtoken
 *     receipt post:  POST https://virtual.tra.go.tz/efdmsRctApi/api/efdmsRctInfo
 *     z-report post: POST https://virtual.tra.go.tz/efdmsRctApi/api/efdmszreport
 *   Authentication: bearer token + Cert-Serial header (base64 of certificate
 *   serial), payloads signed with the taxpayer's TRA-issued private key
 *   (EFDMSSIGNATURE). TRA issues the certificate, certkey and TIN binding
 *   during onboarding — those are EXTERNAL prerequisites BEYU cannot invent.
 *
 * WHAT THIS ADAPTER DOES TODAY:
 *   - Implements the canonical adapter contract with a strict payload schema
 *     for receipt/Z-report submissions (validation, idempotency, error
 *     semantics live in the gateway).
 *   - FAILS CLOSED: without the TRA-issued credential set the adapter reports
 *     EXTERNAL_BLOCKED and refuses to fabricate a fiscal outcome. A receipt is
 *     never represented as TRA-accepted unless TRA's actual response supplies
 *     the acknowledgement (RCTVCODE/ACKCODE + receipt verification number).
 *   - No live call is made from this repository build: production activation
 *     is HUMAN_REVIEW-gated behind the registry (PRODUCTION_READY/LIVE
 *     require enabled_by + approval_reference at the database level).
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

/** Env-var NAMES (never values). Mirrors government_agencies.credential_refs. */
export const TRA_VFD_CREDENTIAL_REFS = [
  "BEYU_TRA_VFD_BASE_URL",
  "BEYU_TRA_VFD_TIN",
  "BEYU_TRA_VFD_CERT_KEY",
  "BEYU_TRA_VFD_CERT_SERIAL",
  "BEYU_TRA_VFD_PRIVATE_KEY_REF",
] as const;

/** Fiscal receipt line, per the official receipt schema's ITEM block. */
const receiptItemSchema = z.object({
  description: z.string().min(1).max(200),
  quantity: z.number().positive(),
  amountMinor: z.number().int().nonnegative(),
  taxCode: z.string().min(1).max(8),
});

export const traReceiptSchema = z.object({
  kind: z.literal("FISCAL_RECEIPT"),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  customerIdType: z.string().min(1).max(2),
  customerId: z.string().max(64).optional(),
  customerName: z.string().max(120).optional(),
  items: z.array(receiptItemSchema).min(1),
  totals: z.object({
    totalTaxExclMinor: z.number().int().nonnegative(),
    totalTaxInclMinor: z.number().int().nonnegative(),
    taxMinor: z.number().int().nonnegative(),
  }),
  currency: z.literal("TZS"),
});

export const traZReportSchema = z.object({
  kind: z.literal("Z_REPORT"),
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dailyTotalMinor: z.number().int().nonnegative(),
  grossMinor: z.number().int().nonnegative(),
  taxMinor: z.number().int().nonnegative(),
});

export const traSubmitSchema = z.discriminatedUnion("kind", [traReceiptSchema, traZReportSchema]);

export class TraVfdAdapter implements GovernmentAdapter {
  readonly agencyCode = "TRA_VFD";
  readonly displayName = "Tanzania Revenue Authority — Virtual Fiscal Device (EFDMS)";
  readonly isMock = false;
  readonly adapterVersion = "gov-tra-vfd-1.0.0";
  readonly submitSchema = traSubmitSchema;

  validateConfiguration(): AdapterConfigReport {
    const missing = TRA_VFD_CREDENTIAL_REFS.filter((name) => !process.env[name]);
    const configured = missing.length === 0;
    const base = process.env.BEYU_TRA_VFD_BASE_URL ?? "";
    return {
      configured,
      missing: [...missing],
      environment: !configured
        ? "UNCONFIGURED"
        : base.includes("virtual.tra.go.tz")
          ? "UAT"
          : "PRODUCTION",
    };
  }

  status(): GovernmentIntegrationStatus {
    // Contract is verified from official documentation; credentials are an
    // external prerequisite. Without them, the honest status is
    // EXTERNAL_BLOCKED — never SANDBOX_READY by assumption.
    return this.validateConfiguration().configured ? "SANDBOX_READY" : "EXTERNAL_BLOCKED";
  }

  async submit(payload: unknown, _opts: AdapterCallOptions): Promise<AdapterSubmitResult> {
    const parsed = traSubmitSchema.safeParse(payload);
    if (!parsed.success) {
      throw new GovernmentAdapterError("INVALID_PAYLOAD", "Payload does not satisfy the TRA VFD contract.");
    }
    const config = this.validateConfiguration();
    if (!config.configured) {
      // EXACT truth: TRA credentials are not issued. Nothing was submitted.
      return { outcome: "EXTERNAL_BLOCKED", missing: config.missing };
    }
    // Credentials present: a real EFDMS token+post exchange belongs here.
    // Live connectivity is a CONTROLLED activation performed against the TRA
    // test server during onboarding — the repository build must not initiate
    // external calls from CI, so a configured-but-unactivated environment
    // still reports honestly rather than fabricating acceptance.
    return {
      outcome: "EXTERNAL_UNAVAILABLE",
      detail: "TRA_VFD live exchange requires activation on an authorized environment (see runbook docs/integrations/runbooks/TRA_VFD.md).",
    };
  }
}
