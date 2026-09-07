/**
 * WEBHOOK AUTHENTICATION and PROVIDER-STATUS HONESTY — program §12, §13, §14, §33,
 * §42, §55, §58.
 *
 * Two separate jobs, both tested here because both are about not believing what
 * you are told:
 *   - an inbound event must prove it came from the channel it claims;
 *   - the platform must not claim more about a provider than it has established.
 *
 * Pure unit level: no database, no network. The integration consequences of a
 * refused signature are covered by the HTTP suite and the demo.
 */
import { describe, expect, it } from "vitest";
import { canonicalString, computeHmac, generateWebhookSecret, readTimestampHeader, verifyHmac } from "@/lib/payments/providers/hmac";
import { MOCK_PROVIDER_CODE, MockProviderAdapter } from "@/lib/payments/providers/mock";
import { REGISTERED_PROVIDER_CODES, allStatuses, adapterCapabilities, adapterFor, assertNoLiveIntegrationClaim, hasAdapter, statusFor } from "@/lib/payments/providers";
import { PROVIDER_CAPABILITY, type ProviderStatusReport } from "@/lib/payments/providers/adapter";

const SECRET = "unit-test-only-secret-not-a-real-credential";
const adapter = new MockProviderAdapter();

const RECEIVED_AT = new Date("2026-09-06T10:00:00.000Z");
const RECEIVED_EPOCH = Math.floor(RECEIVED_AT.getTime() / 1000);

function inbound(body: string, headers: Record<string, string> = {}) {
  return { providerCode: MOCK_PROVIDER_CODE, rawBody: body, headers, receivedAt: RECEIVED_AT, sourceIp: "203.0.113.9" };
}

function signed(body: string, timestamp = String(RECEIVED_EPOCH)) {
  return { "x-beyu-timestamp": timestamp, "x-beyu-signature": computeHmac(SECRET, timestamp, body) };
}

describe("inbound authentication", () => {
  it("the signature covers the timestamp and the exact bytes received", () => {
    expect(canonicalString("1786183200", `{"a":1}`)).toBe(`1786183200.{"a":1}`);
    const body = `{"amount":"250000"}`;
    const presented = computeHmac(SECRET, "1786183200", body);
    expect(verifyHmac({ secret: SECRET, timestamp: "1786183200", rawBody: body, presented })).toBe(true);
    // A different secret, a different byte, a different timestamp: all refused.
    expect(verifyHmac({ secret: "other", timestamp: "1786183200", rawBody: body, presented })).toBe(false);
    expect(verifyHmac({ secret: SECRET, timestamp: "1786183200", rawBody: `{"amount":"250001"}`, presented })).toBe(false);
    expect(verifyHmac({ secret: SECRET, timestamp: "1786183201", rawBody: body, presented })).toBe(false);
  });

  it("an absent or malformed signature header cannot be guessed into validity", () => {
    const body = `{"amount":"1"}`;
    for (const presented of [null, undefined, "", "sha256=", "sha256=deadbeef", "deadbeef", `sha256=${"0".repeat(64)}`]) {
      expect(verifyHmac({ secret: SECRET, timestamp: "1787817600", rawBody: body, presented }), String(presented)).toBe(false);
    }
  });

  it("a valid signature on a stale timestamp is still refused, and says why", () => {
    const stale = readTimestampHeader(String(RECEIVED_EPOCH - 100_000), RECEIVED_AT, 300);
    expect(stale.valid).toBe(false);
    expect(stale.detail).toBe("TIMESTAMP_TOO_OLD");
    expect(readTimestampHeader(null, new Date(), 300).detail).toBe("MISSING_TIMESTAMP_HEADER");
    expect(readTimestampHeader("not-a-time", new Date(), 300).detail).toBe("UNPARSEABLE_TIMESTAMP");
    const future = readTimestampHeader(String(RECEIVED_EPOCH + 3600), RECEIVED_AT, 300);
    expect(future.detail).toBe("TIMESTAMP_IN_FUTURE");
  });

  it("the adapter refuses when no secret is configured, rather than accepting everything", () => {
    const body = JSON.stringify({ event_id: "E1", transaction_id: "T1", amount: "1", currency: "TZS" });
    const unconfigured = adapter.verifyInbound({ ...inbound(body, signed(body)), receivedAt: RECEIVED_AT } as never, { signingSecret: null, maxClockSkewSeconds: 300 });
    expect(unconfigured.signatureValid).toBe(false);
    expect(unconfigured.detail).toBe("NO_WEBHOOK_SECRET_CONFIGURED");

    // Signature validity and timestamp validity are separate readings, on purpose:
    // a correctly signed message sent long ago is still authentic but must not be
    // replayed, and the platform records which of the two failed.
    const stale = adapter.verifyInbound({ ...inbound(body, signed(body, String(RECEIVED_EPOCH - 100_000))), receivedAt: RECEIVED_AT } as never, { signingSecret: SECRET, maxClockSkewSeconds: 300 });
    expect(stale.signatureValid).toBe(true);
    expect(stale.timestampValid).toBe(false);
    expect(stale.replaySuspected).toBe(true);
    expect(stale.detail).toBe("TIMESTAMP_TOO_OLD");

    const fresh = adapter.verifyInbound({ ...inbound(body, signed(body, String(RECEIVED_EPOCH - 30))), receivedAt: RECEIVED_AT } as never, { signingSecret: SECRET, maxClockSkewSeconds: 300 });
    expect(fresh.signatureValid).toBe(true);
    expect(fresh.timestampValid).toBe(true);
    expect(fresh.replaySuspected).toBe(false);
    expect(fresh.detail).toBe("TIMESTAMP_WITHIN_WINDOW");

    // A genuine replay of an old, still-correctly-signed event is flagged as such.
    const replayed = adapter.verifyInbound({ ...inbound(body, signed(body, String(RECEIVED_EPOCH - 86_400))), receivedAt: RECEIVED_AT } as never,
      { signingSecret: SECRET, maxClockSkewSeconds: 300 },
    );
    expect(replayed.signatureValid).toBe(true);
    expect(replayed.replaySuspected).toBe(true);
    expect(replayed.timestampValid).toBe(false);
  });

  it("a generated secret is high-entropy and never embedded in source", () => {
    const a = generateWebhookSecret();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(generateWebhookSecret());
  });
});

describe("normalization refuses to invent money", () => {
  const base = { event_id: "E1", transaction_id: "T1", currency: "TZS", timestamp: RECEIVED_AT.toISOString() };

  it("an unreported fee stays null and is recorded as a gap", () => {
    const parsed = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "250000" })) } as never);
    expect(parsed.grossMinor).toBe(250000);
    expect(parsed.feeMinor).toBeNull();
    expect(parsed.netBasis).toBe("DERIVED_FROM_GROSS");
    expect(parsed.gaps).toContain("FEE_ABSENT");
  });

  it("a reported net is trusted as a claim, not recomputed silently", () => {
    const parsed = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "250000", fee: "1000", tax: "0", net_amount: "249000" })) } as never);
    expect(parsed.netMinor).toBe(249000);
    expect(parsed.netBasis).toBe("REPORTED");
    const inconsistent = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "250000", fee: "1000", tax: "0", net_amount: "250000" })) } as never);
    expect(inconsistent.gaps.join(" ")).toMatch(/NET|CONSISTEN|IMBALANC/i);
  });

  it("zero and absent are different facts", () => {
    const zero = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "250000", fee: "0", tax: "0", net_amount: "250000" })) } as never);
    expect(zero.feeMinor).toBe(0);
    expect(zero.gaps.join(" ")).not.toMatch(/FEE_ABSENT/);
  });

  it("a provider cannot report money in a currency the platform cannot represent", () => {
    expect(() => adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "10", currency: "ZZZ" })) } as never)).toThrowError(/no registered minor-unit exponent/i);
    expect(() => adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "10", currency: "TSH" })) } as never)).toThrowError(/no registered minor-unit exponent/i);
    // Malformed codes are refused before the currency table is consulted, so the
    // reason stays truthful about what was wrong.
    expect(() => adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "10", currency: "shillings" })) } as never)).toThrowError(/3-letter ISO/i);
  });

  it("client-supplied status is metadata, never authority", () => {
    const parsed = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "1000", status: "COMPLETED", accounting_status: "POSTED", tenant_id: "TEN_OTHER" })) } as never);
    expect(Object.keys(parsed)).not.toContain("status");
    expect(parsed.metadata as Record<string, unknown>).not.toHaveProperty("accounting_status");
    expect(JSON.stringify(parsed)).not.toContain("TEN_OTHER");
  });

  it("a missing provider transaction id is recorded as absent, not synthesised from the amount", () => {
    const parsed = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, amount: "1000" }).replace(`"transaction_id":"T1",`, "")) } as never);
    expect(parsed.providerTransactionId).toBeNull();
  });

  it("reversals are a distinct event type, and direction is only ever what the provider declared", () => {
    const parsed = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, type: "REVERSAL", amount: "1000" })) } as never);
    expect(parsed.eventType).toBe("REVERSAL");
    expect(parsed.transactionType).toBe("REVERSAL");
    // `direction` is NOT inferred from the reversal. Whether cash left or arrived
    // is the provider's statement about its own ledger; inventing it here would put
    // a claim into the canonical record that the provider did not make.
    expect(parsed.direction).toBe("INBOUND");
    const declared = adapter.parseInbound({ ...inbound(JSON.stringify({ ...base, type: "REVERSAL", amount: "1000", direction: "OUTBOUND" })) } as never);
    expect(declared.direction).toBe("OUTBOUND");
  });
});

describe("provider status ledger is honest about being empty", () => {
  it("ten independent fields, one per concern, and never a single 'integrated' flag", () => {
    for (const status of allStatuses()) {
      for (const field of ["integrationStatus", "contractStatus", "credentialStatus", "apiAvailability", "webhookModel", "settlementModel", "signatureScheme", "regulatoryEnforcement", "sandboxMode"] as const) {
        expect(typeof status[field], `${status.provider}.${field}`).toBe("string");
      }
      expect(Array.isArray(status.supportedCapabilities), status.provider).toBe(true);
      expect(status.evidence, status.provider).toBeTruthy();
      expect(status.lastAssessedAt, status.provider).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(status).not.toHaveProperty("integrated");
    }
  });

  it("only the mock has code, and the mock cannot be mistaken for a provider", () => {
    expect(hasAdapter(MOCK_PROVIDER_CODE)).toBe(true);
    expect(REGISTERED_PROVIDER_CODES.length).toBeGreaterThanOrEqual(9);
    for (const code of REGISTERED_PROVIDER_CODES) {
      if (code === MOCK_PROVIDER_CODE) continue;
      expect(hasAdapter(code), code).toBe(false);
      expect(adapterFor(code), code).toBeNull();
      const status = statusFor(code)!;
      expect(status.integrationStatus, code).toBe("NOT_INTEGRATED");
      expect(status.apiAvailability, code).toBe("UNVERIFIED");
      expect(status.blockedOn.length, code).toBeGreaterThan(0);
      expect(Object.values(status.evidence).join(" "), code).toMatch(/NOT VERIFIED|NOT INVESTIGATED|NOT ISSUED/);
    }
  });

  it("a live status cannot be claimed while its own evidence says nothing was verified", () => {
    const mock = statusFor(MOCK_PROVIDER_CODE)!;
    expect(assertNoLiveIntegrationClaim(mock).ok).toBe(true);
    const promoted: ProviderStatusReport = { ...mock, integrationStatus: "PRODUCTION_VERIFIED" };
    const verdict = assertNoLiveIntegrationClaim(promoted);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/unverified|blockedOn/);
    const evidenced: ProviderStatusReport = {
      ...promoted,
      blockedOn: [],
      evidence: { apiAvailability: "Verified against provider documentation rev. 12, 2026-08-01, ticket OPS-771" },
    };
    expect(assertNoLiveIntegrationClaim(evidenced).ok).toBe(true);
  });

  it("a mock declares only the capabilities it actually performs", () => {
    const declared = adapterCapabilities(MOCK_PROVIDER_CODE);
    expect(declared).toContain("INBOUND_WEBHOOK");
    expect(declared).toContain("SETTLEMENT_BATCH");
    // Money cannot leave, and nothing can be confirmed after the fact.
    expect(declared).not.toContain("OUTBOUND_PAYOUT");
    expect(declared).not.toContain("REFUND");
    expect(declared).not.toContain("TXN_QUERY");
    expect(declared).not.toContain("BALANCE_QUERY");
    for (const c of declared) expect(PROVIDER_CAPABILITY).toContain(c);
  });

  it("the mock refuses to initiate a payout instead of pretending to queue it", async () => {
    const payout = await adapter.initiatePayout({
      amountMinor: 1000,
      currency: "TZS",
      destinationRef: "255712000111",
      destinationType: "MSISDN",
      payerReference: "PAY-1",
      description: "attempt",
      idempotencyKey: "idem-1",
    });
    expect(payout.ok).toBe(false);
    if (!payout.ok) expect(payout.code).toBe("CAPABILITY_NOT_SUPPORTED");
    else expect.unreachable("a mock must not report a payout as accepted");
  });

  it("the mock cannot confirm a transaction it does not hold", async () => {
    const query = await adapter.queryTransaction("T-unknown");
    expect(query.ok).toBe(false);
    if (!query.ok) expect(query.code).toBe("MOCK_HAS_NO_LEDGER");
  });

  it("the mock is recorded as sandbox-only and permanently blocked from production", () => {
    const mock = statusFor(MOCK_PROVIDER_CODE)!;
    expect(mock.integrationStatus).toBe("SANDBOX_VERIFIED");
    expect(mock.sandboxMode).toBe("MOCK_ONLY");
    expect(mock.blockedOn.join(" ")).toMatch(/never reach PRODUCTION_VERIFIED|No external provider/);
  });
});
