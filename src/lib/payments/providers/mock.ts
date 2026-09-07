/**
 * MOCK SANDBOX provider adapter.
 *
 * READ THIS FIRST: this adapter simulates a provider for local development and
 * for tests that must prove the pipeline without external credentials. It is
 * real code doing real verification of a real HMAC over real bytes — the
 * signature check is not stubbed, because a stubbed verification would make the
 * verification tests worthless. What is simulated is the other side: the sender.
 *
 * `isMock === true` is the load-bearing flag. `PRODUCTION_VERIFIED` is
 * unreachable for a mock at the type level (see `mockStatus()`), and the
 * ingest path records `isMock` into `provider_metadata.mock`, so a mock-sourced
 * row is identifiable forever after, including in reports.
 */
import {
  type InboundVerification,
  type NormalizedInbound,
  type OutboundPayoutRequest,
  type OutboundResult,
  type PaymentProviderAdapter,
  type ProviderCapability,
  type ProviderStatusReport,
  type RawInbound,
} from "./adapter";
import { isSupportedCurrency } from "../money";
import { readTimestampHeader, verifyHmac } from "./hmac";
import { describeUntrustedText, isSafeExternalRef, parseProviderAmountStrict } from "./parse-helpers";

export const MOCK_PROVIDER_CODE = "MOCK_SANDBOX";
export const MOCK_ADAPTER_VERSION = "payment-mock-1.0.0";

/**
 * What this simulation actually does, and nothing more (§9: do not pretend a
 * provider supports a capability it does not).
 *
 * `OUTBOUND_PAYOUT` and `REFUND` are deliberately ABSENT even though methods
 * exist for them: no money can leave through a mock, and declaring the capability
 * would let a caller treat a local "QUEUED" as a completed disbursement.
 * `TXN_QUERY` and `BALANCE_QUERY` are absent for the same reason in reverse — the
 * mock holds no state outside the request, so it can confirm nothing. A future
 * real adapter earns those entries by talking to a real provider, not by copying
 * this list.
 */
const MOCK_CAPABILITIES: readonly ProviderCapability[] = [
  "INBOUND_WEBHOOK",
  "REVERSAL_NOTICE",
  "SETTLEMENT_BATCH",
  "STATEMENT_FILE",
];

type MockPayload = {
  event_id?: unknown;
  type?: unknown;
  transaction_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  fee?: unknown;
  tax?: unknown;
  settlement_amount?: unknown;
  settlement_currency?: unknown;
  timestamp?: unknown;
  settled_at?: unknown;
  from?: unknown;
  to?: unknown;
  payer_name?: unknown;
  invoice_reference?: unknown;
  description?: unknown;
  provider_reference?: unknown;
  net_amount?: unknown;
  direction?: unknown;
  transaction_type?: unknown;
  metadata?: unknown;
};

export class MockProviderAdapter implements PaymentProviderAdapter {
  readonly providerCode = MOCK_PROVIDER_CODE;
  readonly displayName = "BEYU Payment Sandbox (mock)";
  readonly capabilities = MOCK_CAPABILITIES;
  readonly isMock = true;

  hasCapability(capability: ProviderCapability): boolean {
    return this.capabilities.includes(capability);
  }

  verifyInbound(
    input: RawInbound,
    context: { signingSecret: string | null; maxClockSkewSeconds: number },
  ): InboundVerification {
    if (!context.signingSecret) {
      return {
        signatureValid: false,
        timestampValid: false,
        replaySuspected: false,
        detail: "NO_WEBHOOK_SECRET_CONFIGURED",
        clockSkewSeconds: null,
      };
    }
    const skew = readTimestampHeader(
      input.headers["x-beyu-timestamp"] ?? input.headers["x-mock-timestamp"] ?? null,
      input.receivedAt,
      context.maxClockSkewSeconds,
    );
    const signatureValid = verifyHmac({
      secret: context.signingSecret,
      timestamp: (input.headers["x-beyu-timestamp"] ?? input.headers["x-mock-timestamp"] ?? "").trim(),
      rawBody: input.rawBody,
      presented: input.headers["x-beyu-signature"] ?? input.headers["x-mock-signature"] ?? null,
    });
    return {
      signatureValid,
      timestampValid: skew.valid,
      replaySuspected: !skew.valid && skew.detail === "TIMESTAMP_TOO_OLD",
      detail: !signatureValid ? "SIGNATURE_MISMATCH" : skew.detail,
      clockSkewSeconds: skew.skewSeconds,
    };
  }

  parseInbound(input: RawInbound): NormalizedInbound {
    let body: MockPayload;
    const gaps: string[] = [];
    try {
      const parsed: unknown = JSON.parse(input.rawBody);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("payload must be a JSON object");
      }
      body = parsed as MockPayload;
    } catch (e) {
      throw new MockParseError(`payload is not a JSON object: ${describeUntrustedText((e as Error).message, 160)}`);
    }

    const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
    if (!isSafeExternalRef(eventId)) throw new MockParseError("event_id is missing or not a safe external reference");

    const currency = typeof body.currency === "string" ? body.currency.trim().toUpperCase() : "";
    if (!/^[A-Z]{3}$/.test(currency)) throw new MockParseError("currency must be a 3-letter ISO code");
    // An unknown ISO code is refused with its own reason. Left to the amount
    // parser it would surface as "no usable amount", which sends whoever
    // investigates looking at the wrong field.
    if (!isSupportedCurrency(currency)) {
      throw new MockParseError(`currency "${currency}" has no registered minor-unit exponent, so its amounts cannot be represented exactly`);
    }

    const providerTransactionId =
      typeof body.transaction_id === "string" && isSafeExternalRef(body.transaction_id) ? body.transaction_id : null;
    if (providerTransactionId === null) gaps.push("MISSING_OR_UNSAFE_TRANSACTION_ID");

    const grossMinor = parseProviderAmountStrict(body.amount, currency, gaps, "amount");
    const feeMinor = parseProviderAmountStrict(body.fee ?? null, currency, gaps, "fee");
    const taxMinor = parseProviderAmountStrict(body.tax ?? null, currency, gaps, "tax");
    const declaredNet = parseProviderAmountStrict(body.net_amount ?? null, currency, gaps, "net_amount");
    // net is never guessed into existence. The basis is recorded with the value
    // so the accounting layer can see whether the provider reported it, whether
    // it was computed from reported components, or whether it is simply unknown.
    let netMinor: number | null = declaredNet;
    let netBasis: NormalizedInbound["netBasis"] = "UNRESOLVED";
    if (declaredNet !== null) {
      netBasis = "REPORTED";
      if (grossMinor !== null && (feeMinor !== null || taxMinor !== null)) {
        const expected = grossMinor - (feeMinor ?? 0) - (taxMinor ?? 0);
        if (expected !== declaredNet) {
          gaps.push("REPORTED_NET_DISAGREES_WITH_COMPONENTS");
          // A figure the provider's own components contradict is not a reported
          // number. Keeping it as if it were would launder the discrepancy into
          // the money model, where the accounting bridge would then balance on it.
          // The net becomes UNRESOLVED instead: visible, unrelied-upon, reviewable.
          netMinor = null;
          netBasis = "UNRESOLVED";
        }
      }
    } else if (grossMinor !== null && feeMinor !== null && taxMinor !== null) {
      netMinor = grossMinor - feeMinor - taxMinor;
      netBasis = "DERIVED_FROM_COMPONENTS";
      if (netMinor < 0) {
        gaps.push("FEE_AND_TAX_EXCEED_GROSS");
        netMinor = null;
        netBasis = "UNRESOLVED";
      }
    } else if (grossMinor !== null && feeMinor === null && taxMinor === null) {
      netMinor = grossMinor;
      netBasis = "DERIVED_FROM_GROSS";
      gaps.push("FEE_NOT_REPORTED_NET_TREATED_AS_GROSS");
    }
    if (grossMinor === null) gaps.push("GROSS_UNPARSEABLE");

    const occurredAt = readInstant(body.timestamp, input.receivedAt, gaps, "timestamp");
    const providerSettledAt = readInstantOrNull(body.settled_at, gaps);

    const rawType = typeof body.type === "string" ? body.type.toUpperCase() : "";
    const eventType: NormalizedInbound["eventType"] =
      rawType === "SETTLEMENT" ? "SETTLEMENT" : rawType === "REVERSAL" ? "REVERSAL" : rawType === "TRANSACTION" ? "TRANSACTION" : "UNKNOWN";
    if (eventType === "UNKNOWN") gaps.push("UNRECOGNISED_EVENT_TYPE");

    const direction = body.direction === "OUTBOUND" ? "OUTBOUND" : "INBOUND";
    const declaredType = typeof body.transaction_type === "string" ? body.transaction_type.toUpperCase() : "";
    const transactionType = (
      eventType === "REVERSAL"
        ? "REVERSAL"
        : declaredType === "DEPOSIT" ||
            declaredType === "WITHDRAWAL" ||
            declaredType === "TRANSFER" ||
            declaredType === "PAYMENT" ||
            declaredType === "REFUND" ||
            declaredType === "FEE" ||
            declaredType === "SETTLEMENT_ADJUSTMENT"
          ? declaredType
          : direction === "INBOUND"
            ? "DEPOSIT"
            : "PAYMENT"
    ) as NormalizedInbound["transactionType"];

    const counterparty = pickCounterparty(body, direction, gaps);

    return {
      providerEventId: eventId,
      providerTransactionId,
      eventType,
      direction,
      transactionType,
      currency,
      grossMinor: grossMinor ?? 0,
      feeMinor,
      taxMinor,
      netMinor,
      netBasis,
      settlementCurrency:
        typeof body.settlement_currency === "string" && /^[A-Za-z]{3}$/.test(body.settlement_currency.trim())
          ? body.settlement_currency.trim().toUpperCase()
          : null,
      settlementMinor: parseProviderAmountStrict(body.settlement_amount ?? null, currency, gaps, "settlement_amount"),
      from: typeof body.from === "string" ? body.from : null,
      to: typeof body.to === "string" ? body.to : null,
      occurredAt,
      providerSettledAt,
      providerReference:
        typeof body.provider_reference === "string" && isSafeExternalRef(body.provider_reference)
          ? body.provider_reference
          : null,
      counterpartyRef: counterparty.ref,
      counterpartyName: counterparty.name,
      invoiceReference:
        typeof body.invoice_reference === "string" && isSafeExternalRef(body.invoice_reference)
          ? body.invoice_reference
          : null,
      description: typeof body.description === "string" ? describeUntrustedText(body.description, 200) : null,
      metadata: {
        mock: true,
        netBasis,
        adapterVersion: MOCK_ADAPTER_VERSION,
        declaredType: declaredType || null,
        rawEventType: rawType || null,
        extra: isPlainObject(body.metadata) ? (body.metadata as Record<string, unknown>) : {},
      },
      gaps,
    };
  }

  /**
   * Simulated outbound. It returns `QUEUED_LOCALLY`, never a provider id: a mock
   * that invented a confirmation number would be the single most dangerous lie
   * this file could tell.
   */
  async initiatePayout(input: OutboundPayoutRequest): Promise<OutboundResult> {
    // Capability is checked first, so a caller cannot reach a "queued" answer for
    // something this adapter has already declared it cannot do.
    if (!this.hasCapability("OUTBOUND_PAYOUT")) {
      return {
        ok: false,
        code: "CAPABILITY_NOT_SUPPORTED",
        message: `${this.providerCode} does not support OUTBOUND_PAYOUT. No payout was attempted and no money moved.`,
        retryable: false,
      };
    }
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      return { ok: false, code: "INVALID_AMOUNT", message: "Payout amount must be a positive integer of minor units.", retryable: false };
    }
    if (!isSafeExternalRef(input.destinationRef)) {
      return { ok: false, code: "INVALID_DESTINATION", message: "destinationRef is not a safe external reference.", retryable: false };
    }
    return {
      ok: true,
      providerTransactionId: "",
      state: "QUEUED_LOCALLY",
      acceptedAt: new Date(),
      raw: { mock: true, note: "No external provider was contacted; nothing has left the system." },
    };
  }

  async queryTransaction(providerTransactionId: string): Promise<OutboundResult> {
    return {
      ok: false,
      code: "MOCK_HAS_NO_LEDGER",
      message: `The mock sandbox cannot confirm anything about ${providerTransactionId || "an unknown transaction"}; it holds no state outside the request.`,
      retryable: false,
    };
  }
}

function readInstant(value: unknown, fallback: Date, gaps: string[], label: string): Date {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  gaps.push(`MISSING_OR_INVALID_${label.toUpperCase()}_USING_RECEIPT_TIME`);
  return fallback;
}

function readInstantOrNull(value: unknown, _gaps: string[]): Date | null {
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return null;
}

/**
 * Which side is the counterparty depends on direction. Guessing here would
 * attribute money to the wrong person, so an absent or unusable value becomes a
 * gap and an unmatched transaction, not a default.
 */
function pickCounterparty(
  body: MockPayload,
  direction: "INBOUND" | "OUTBOUND",
  gaps: string[],
): { ref: string | null; name: string | null } {
  const rawRef = direction === "INBOUND" ? body.from : body.to;
  if (typeof rawRef !== "string" || !isSafeExternalRef(rawRef)) {
    gaps.push("COUNTERPARTY_REF_ABSENT_OR_UNSAFE");
    return { ref: null, name: typeof body.payer_name === "string" ? describeUntrustedText(body.payer_name, 120) : null };
  }
  return { ref: rawRef, name: typeof body.payer_name === "string" ? describeUntrustedText(body.payer_name, 120) : null };
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export class MockParseError extends Error {
  readonly code = "PAYLOAD_UNPARSEABLE";
  constructor(message: string) {
    super(message);
    this.name = "MockParseError";
  }
}

/** The honest status of the mock: everything works, nothing is real. */
export function mockStatus(): ProviderStatusReport {
  return {
    provider: MOCK_PROVIDER_CODE,
    integrationStatus: "SANDBOX_VERIFIED",
    contractStatus: "NOT_REQUIRED",
    credentialStatus: "SANDBOX_ISSUED",
    apiAvailability: "NONE_FOUND",
    webhookModel: "PROVIDER_PUSH",
    settlementModel: "MANUAL_BATCH",
    signatureScheme: "HMAC_SHA256",
    regulatoryEnforcement: "NOT_INVESTIGATED",
    sandboxMode: "MOCK_ONLY",
    supportedCapabilities: MOCK_CAPABILITIES,
    evidence: {
      integrationStatus: "Inbound verification, parsing, idempotency and settlement matching exercised by tests/payments/* in this repository. No external system was contacted.",
      apiAvailability: "There is no API: this is an in-process simulation.",
      signatureScheme: "HMAC-SHA256 over `${timestamp}.${rawBody}`, constant-time compare (providers/hmac.ts).",
      settlementModel: "Settlement batches are supplied by the test/demo fixture, not by a provider.",
      regulatoryEnforcement: "Meaningless for a mock; recorded as NOT_INVESTIGATED rather than left blank.",
    },
    blockedOn: ["No external provider exists behind this adapter. It can never reach PRODUCTION_VERIFIED."],
    lastAssessedAt: "2026-09-06",
  };
}
