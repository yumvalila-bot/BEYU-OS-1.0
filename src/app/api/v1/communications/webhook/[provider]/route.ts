/**
 * POST /api/v1/communications/webhook/[provider]
 *
 * THE public write endpoint for communications providers (WhatsApp, SMS, Email).
 *
 * Boundary:
 * - No session, no permission. Authentication is provider's signature over
 *   `${timestamp}.${rawBody}`, verified against secret named by connection's
 *   `signing_secret_ref`. Failed verification is recorded and refused.
 * - Tenant, legal entity, country come from enabled provider connection, never
 *   from body. Attacker cannot route into another tenant by editing field.
 * - Body size capped, response uninformative about failure reason, every attempt
 *   written to durable inbox for visibility.
 * - Acceptance means "recorded as authenticated claim", never means posted.
 * - Rate limiting per provider+IP, stricter than authenticated default.
 */

import { apiError, apiOk, rateLimit } from "@/lib/api";
import { requestMeta } from "@/lib/session";
import { ingestWebhookEvent, MAX_PAYLOAD_BYTES } from "@/lib/communications/webhook-service";

export const dynamic = "force-dynamic";

const PROVIDER_CODE = /^[A-Z][A-Z0-9_]{1,31}$/;

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const meta = await requestMeta();
  const traceId = meta.traceId;
  const { provider } = await context.params;
  const providerCode = (provider ?? "").toUpperCase();

  if (!PROVIDER_CODE.test(providerCode)) {
    return apiError("INVALID_PROVIDER", "Provider codes are 2-32 upper-case alphanumeric.", 400, traceId);
  }

  const limit = rateLimit(`communications:webhook:${providerCode}:${meta.ip ?? "unknown"}`, 60, 60_000);
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
      return apiError(receipt.code, "The event was recorded and refused.", receipt.status, traceId);
    }

    return apiOk(
      {
        outcome: receipt.outcome,
        code: receipt.code,
        webhookEventId: receipt.webhookEventId,
        tenantId: receipt.tenantId,
        messageId: receipt.messageId,
        conversationId: receipt.conversationId,
        verificationStatus: receipt.verificationStatus,
        correlationId: receipt.correlationId,
        ledgerEffect: "NONE",
      },
      traceId,
      receipt.status,
      receipt.correlationId ?? traceId,
    );
  } catch {
    return apiError("INGEST_UNAVAILABLE", "The event could not be processed and may be retried.", 503, traceId);
  }
}

export async function GET() {
  return apiError("METHOD_NOT_ALLOWED", "Webhook ingestion is POST only. Use GET /api/v1/communications/providers for status.", 405, "GET-NOT-ALLOWED");
}
