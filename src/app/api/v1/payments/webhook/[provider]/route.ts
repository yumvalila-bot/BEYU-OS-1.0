/**
 * POST /api/v1/payments/webhook/[provider]
 *
 * THE ONE PUBLICLY REACHABLE WRITE ENDPOINT IN THIS PROGRAM, so its boundary is
 * stated explicitly:
 *
 *  - There is no session and no permission. Authentication is the provider's
 *    signature over `${timestamp}.${rawBody}`, verified against the secret named
 *    by the connection's `signing_secret_ref`. A request that cannot prove that
 *    is recorded and refused; it never becomes a transaction.
 *  - Tenant, legal entity and country come from the enabled connection, never from
 *    the body. An attacker cannot route money into another tenant by editing a
 *    field, and a provider cannot address a tenant it is not mounted for.
 *  - Body size is capped, the response is deliberately uninformative about which
 *    of several possible reasons failed, and every attempt (including failures)
 *    is written to the durable inbox so an attack is visible.
 *  - Acceptance means "recorded as an authenticated claim". It never means
 *    posted, and the response says so in the receipt code rather than in prose.
 *  - Rate limiting is per provider+IP and deliberately stricter than the
 *    authenticated default, because this endpoint is unauthenticated.
 */
import { apiError, apiOk, rateLimit } from "@/lib/api";
import { requestMeta } from "@/lib/session";
import { ingestWebhookEvent, MAX_PAYLOAD_BYTES, INGEST_VERSION } from "@/lib/payments/ingest";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const meta = await requestMeta();
  const traceId = meta.traceId;
  const { provider } = await context.params;
  const providerCode = (provider ?? "").toUpperCase();

  if (!PROVIDER_CODE.test(providerCode)) {
    return apiError("INVALID_PROVIDER", "Provider codes are 2-32 upper-case alphanumeric characters.", 400, traceId);
  }

  const limit = rateLimit(`payments:webhook:${providerCode}:${meta.ip ?? "unknown"}`, 60, 60_000);
  if (!limit.ok) {
    return apiError("RATE_LIMITED", "Too many webhook attempts for this channel.", 429, traceId);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return apiError("PAYLOAD_TOO_LARGE", `Body exceeds ${MAX_PAYLOAD_BYTES} bytes.`, 413, traceId);
  }

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  try {
    const receipt = await ingestWebhookEvent({
      providerCode,
      rawBody,
      headers,
      connectionIdHeader: headers["x-beyu-connection"] ?? null,
      sourceIp: meta.ip,
      receivedAt: new Date(),
      traceId,
      correlationId: headers["x-correlation-id"] ?? null,
    });

    if (receipt.outcome === "REJECTED") {
      // Never echo the payload or the reason detail: this endpoint is public.
      return apiError(receipt.code, "The event was recorded and refused.", receipt.status, traceId);
    }
    return apiOk(
      {
        outcome: receipt.outcome,
        code: receipt.code,
        webhookEventId: receipt.webhookEventId,
        transactionId: receipt.transactionId,
        verificationStatus: receipt.verificationStatus,
        trustLevel: receipt.trustLevel,
        reconciliationStatus: receipt.reconciliationStatus,
        gapCount: receipt.gaps.length,
        riskSignalCount: receipt.riskFindings.length,
        configurationProblemCount: receipt.configurationProblems.length,
        correlationId: receipt.correlationId,
        // The refusal to imply a ledger effect is part of the contract, so it is
        // returned in the body rather than left to the reader's assumption.
        ledgerEffect: "NONE",
        ingestVersion: INGEST_VERSION,
      },
      traceId,
      receipt.status,
      receipt.correlationId ?? traceId,
    );
  } catch {
    // The provider gets a retryable 503 and nothing else: no stack, no payload
    // echo, no hint about which internal step failed. The failure is in the audit
    // trail, where it belongs.
    return apiError("INGEST_UNAVAILABLE", "The event could not be processed and may be retried.", 503, traceId);
  }
}

/** Providers that retry with a GET must not be able to probe configuration. */
export async function GET() {
  return apiError("METHOD_NOT_ALLOWED", "Webhook ingestion is POST only. Use GET /api/v1/payments/providers for status.", 405, "GET-NOT-ALLOWED");
}
