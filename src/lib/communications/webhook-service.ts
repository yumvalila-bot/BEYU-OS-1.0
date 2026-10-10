/**
 * Webhook Security — reuse existing webhook framework pattern (payments).
 *
 * All external providers are untrusted.
 * Pipeline: Webhook → provider resolution → provider liveness → payload size →
 * signature verification (scheme per provider type, fail closed) → payload
 * parsing → durable idempotency claim → canonical event → processing.
 *
 * Nothing from an unauthenticated request reaches the idempotency claim, the
 * contact store, the conversation store or the message store. A refused request
 * is written as a REJECTED inbox row with a stable internal reason, and the
 * caller receives only a uniform refusal.
 *
 * Protect against: forged requests, replay, duplicates, malformed payloads,
 * provider spoofing, tenant spoofing, entity spoofing, country spoofing.
 * Never trust tenant/entity IDs supplied by external payloads.
 */

import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { communicationWebhookEvents, communicationProviders } from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { recordAudit, publishEvent } from "@/lib/audit";
import { createMessage } from "./message-service";
import { createConversation, listConversations } from "./conversation-service";
import { findContactByMethod, createContact } from "./contact-service";
import { sha256 } from "@/lib/crypto";
import { verifyInboundWebhook } from "./webhook-signature";
import type { VerificationStatus } from "./types";

export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KiB

/** Stored preview for refused requests. Refused bodies are unauthenticated, so they are kept short. */
const REFUSED_PAYLOAD_PREVIEW_CHARS = 2000;

/** Provider statuses that accept inbound events. Every other status is refused. */
const INBOUND_PROVIDER_STATUSES: ReadonlySet<string> = new Set(["CONNECTED", "VERIFIED"]);

/** Channels that have an inbound parser. */
const INBOUND_CHANNELS: ReadonlySet<string> = new Set(["WHATSAPP", "SMS", "EMAIL"]);

/** Caller credentials are never persisted in the inbox. */
const NON_PERSISTED_HEADERS: ReadonlySet<string> = new Set(["authorization", "cookie", "proxy-authorization"]);

/** Every authentication refusal gets this same response, so the caller learns nothing about why. */
const AUTHENTICATION_REFUSED = { code: "SIGNATURE_VERIFICATION_FAILED", status: 401 } as const;

/**
 * The platform envelope (audit, events) accepts only bounded traceable identifiers.
 * Provider IDs such as WhatsApp `wamid.…` or email Message-IDs do not match, so they
 * are used only for idempotency, through a bounded digest, and never as causation.
 */
const BOUNDED_IDENTIFIER = /^[A-Za-z0-9_-]{8,128}$/;

function boundedIdentifierOr(value: string | null | undefined, fallback: string): string {
  return value && BOUNDED_IDENTIFIER.test(value) ? value : fallback;
}

/** Refusals where a signature or timestamp was actually checked and failed. These raise a security event. */
const CRYPTOGRAPHIC_REFUSALS: ReadonlySet<string> = new Set([
  "SIGNATURE_MISSING",
  "SIGNATURE_MISMATCH",
  "TIMESTAMP_MISSING",
  "TIMESTAMP_MALFORMED",
  "TIMESTAMP_OUT_OF_WINDOW",
  "CONTENT_TYPE_NOT_FORM",
  "BODY_HASH_MISMATCH",
]);

type ProviderRecord = typeof communicationProviders.$inferSelect;

export type WebhookIngestInput = {
  providerCode: string;
  rawBody: string;
  headers: Record<string, string>;
  /** Exact public URL the provider called. Twilio signs over it, so it is never decoded or rebuilt. */
  requestUrl: string;
  connectionIdHeader?: string | null;
  sourceIp?: string | null;
  receivedAt: Date;
  traceId: string;
  correlationId?: string | null;
};

export type WebhookIngestResult = {
  outcome: "ACCEPTED" | "REJECTED" | "DUPLICATE";
  code: string;
  status: number;
  webhookEventId: string;
  tenantId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  verificationStatus: VerificationStatus;
  correlationId: string;
};

function lowerCaseKeys(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
}

function persistableHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([name]) => !NON_PERSISTED_HEADERS.has(name)));
}

function isInboundLive(provider: ProviderRecord): boolean {
  return (
    INBOUND_PROVIDER_STATUSES.has(provider.status) &&
    INBOUND_CHANNELS.has(provider.channelCode) &&
    !provider.providerType.toUpperCase().includes("SIMULATED")
  );
}

function parsePayload(rawBody: string): Record<string, unknown> {
  try {
    const json: unknown = JSON.parse(rawBody);
    if (json !== null && typeof json === "object" && !Array.isArray(json)) return json as Record<string, unknown>;
    return { raw: rawBody.slice(0, 5000) };
  } catch {
    // Form-encoded (Twilio).
    return Object.fromEntries(new URLSearchParams(rawBody).entries());
  }
}

function asIdentifier(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0 && value.length <= 255) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function extractProviderEventId(payload: Record<string, unknown>, channel: string): string {
  // Deterministic idempotency identity: provider + account + event/message ID
  if (channel === "WHATSAPP") {
    // Meta WhatsApp: entry[0].changes[0].value.messages[0].id or statuses[0].id
    try {
      const entry = (payload.entry as unknown[] ?? [])[0] as Record<string, unknown> | undefined;
      const changes = (entry?.changes as unknown[] ?? [])[0] as Record<string, unknown> | undefined;
      const value = changes?.value as Record<string, unknown> | undefined;
      const messages = value?.messages as Record<string, unknown>[] | undefined;
      const statuses = value?.statuses as Record<string, unknown>[] | undefined;
      const messageId = asIdentifier(messages?.[0]?.id);
      if (messageId) return messageId;
      const statusId = asIdentifier(statuses?.[0]?.id);
      if (statusId) return statusId;
    } catch {}
  }

  if (channel === "SMS") {
    const id = asIdentifier(payload.MessageSid) ?? asIdentifier(payload.message_id) ?? asIdentifier(payload.id);
    if (id) return id;
  }

  if (channel === "EMAIL") {
    const id = asIdentifier(payload.message_id) ?? asIdentifier(payload.event_id) ?? asIdentifier(payload.id);
    if (id) return id;
  }

  // Fallback: hash of payload
  return sha256(JSON.stringify(payload)).slice(0, 32);
}

/**
 * Write a refusal to the inbox and the audit chain, then return the uniform
 * caller-facing response. Nothing is written to contact, conversation or message
 * tables on this path.
 */
async function refuseEvent(args: {
  provider: ProviderRecord | null;
  providerCode: string;
  rawBody: string;
  headers: Record<string, string>;
  sourceIp: string | null;
  traceId: string;
  correlationId: string;
  reason: string;
  response: { code: string; status: number };
  raiseSecurityEvent: boolean;
}): Promise<WebhookIngestResult> {
  const webhookEventId = newId(ID_PREFIX.commWebhookEvent);

  await db.insert(communicationWebhookEvents).values({
    id: webhookEventId,
    providerId: args.provider?.id ?? null,
    providerCode: args.providerCode,
    channel: args.provider?.channelCode ?? "UNKNOWN",
    tenantId: args.provider?.tenantId ?? null,
    eventType: "UNKNOWN",
    rawPayload: args.rawBody.slice(0, REFUSED_PAYLOAD_PREVIEW_CHARS),
    headers: persistableHeaders(args.headers),
    signatureVerified: false,
    verificationStatus: "FAILED",
    idempotencyKey: `refused_${webhookEventId}`,
    status: "REJECTED",
    failureReason: args.reason,
    traceId: args.traceId,
    correlationId: args.correlationId,
    sourceIp: args.sourceIp,
  });

  await recordAudit({
    tenantId: args.provider?.tenantId ?? null,
    actorType: "SERVICE",
    action: "communications.webhook.ingest",
    objectType: "WEBHOOK_EVENT",
    objectId: webhookEventId,
    outcome: "DENIED",
    reason: args.reason,
    traceId: args.traceId,
  });

  if (args.raiseSecurityEvent && args.provider) {
    const { recordSecurityEvent } = await import("./security-service");
    await recordSecurityEvent({
      tenantId: args.provider.tenantId,
      eventType: "FAILED_WEBHOOK_SIGNATURE",
      severity: "HIGH",
      channel: args.provider.channelCode,
      providerId: args.provider.id,
      webhookEventId,
      details: {
        providerCode: args.providerCode,
        reason: args.reason,
        sourceIp: args.sourceIp,
        headers: Object.keys(args.headers),
      },
      ipAddress: args.sourceIp ?? undefined,
    });
  }

  return {
    outcome: "REJECTED",
    code: args.response.code,
    status: args.response.status,
    webhookEventId,
    tenantId: args.provider?.tenantId ?? null,
    verificationStatus: "FAILED",
    correlationId: args.correlationId,
  };
}

export async function ingestWebhookEvent(input: WebhookIngestInput): Promise<WebhookIngestResult> {
  const { providerCode, rawBody, receivedAt, traceId } = input;
  const headers = lowerCaseKeys(input.headers);
  const sourceIp = input.sourceIp ?? null;
  const correlationId = boundedIdentifierOr(input.correlationId, traceId);

  const refusalBase = { providerCode, rawBody, headers, sourceIp, traceId, correlationId };

  // 1. Provider resolution — from code, never from payload.
  const [provider] = await db
    .select()
    .from(communicationProviders)
    .where(eq(communicationProviders.code, providerCode))
    .limit(1);

  if (!provider) {
    return refuseEvent({
      ...refusalBase,
      provider: null,
      reason: "PROVIDER_NOT_FOUND",
      response: AUTHENTICATION_REFUSED,
      raiseSecurityEvent: false,
    });
  }

  // 2. The provider must be live for inbound traffic. Anything else is refused,
  //    including SIMULATED, CONFIGURED, NOT_CONNECTED, DEGRADED and FAILED.
  if (!isInboundLive(provider)) {
    return refuseEvent({
      ...refusalBase,
      provider,
      reason: "PROVIDER_NOT_ACTIVE",
      response: AUTHENTICATION_REFUSED,
      raiseSecurityEvent: false,
    });
  }

  // 3. Payload size.
  if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) {
    return refuseEvent({
      ...refusalBase,
      provider,
      reason: "PAYLOAD_TOO_LARGE",
      response: { code: "PAYLOAD_TOO_LARGE", status: 413 },
      raiseSecurityEvent: false,
    });
  }

  // 4. Signature verification. Runs before parsing, before any claim and before
  //    any business write. The scheme comes from provider_type.
  const verdict = verifyInboundWebhook({
    providerType: provider.providerType,
    signingSecretRef: provider.signingSecretRef,
    requestUrl: input.requestUrl,
    rawBody,
    headers,
    receivedAt,
  });
  if (!verdict.verified) {
    return refuseEvent({
      ...refusalBase,
      provider,
      reason: verdict.reason,
      response: AUTHENTICATION_REFUSED,
      // Only a failed cryptographic check is a security signal. A provider that
      // is not configured or not live is an operational state, not an attack.
      raiseSecurityEvent: CRYPTOGRAPHIC_REFUSALS.has(verdict.reason),
    });
  }

  // 5. Only now is the payload trusted enough to parse.
  const parsed = parsePayload(rawBody);

  // 6. Idempotency — provider + provider event/message ID. Claimed only after authentication.
  const providerEventId = extractProviderEventId(parsed, provider.channelCode);
  const idempotencyKey = providerEventId;
  const eventType = typeof parsed.type === "string" ? parsed.type : typeof parsed.event === "string" ? parsed.event : "MESSAGE";

  const webhookEventId = newId(ID_PREFIX.commWebhookEvent);
  const claimed = await db.execute(
    sql`INSERT INTO communication_webhook_events
        (id, provider_id, provider_code, channel, tenant_id, event_type, raw_payload, parsed_payload, headers, signature_verified, verification_status, idempotency_key, provider_event_id, status, trace_id, correlation_id, source_ip)
        VALUES (${webhookEventId}, ${provider.id}, ${providerCode}, ${provider.channelCode}, ${provider.tenantId}, ${eventType.slice(0, 64)}, ${rawBody}, ${JSON.stringify(parsed)}, ${JSON.stringify(persistableHeaders(headers))}, true, 'VERIFIED', ${idempotencyKey}, ${providerEventId}, 'RECEIVED', ${traceId}, ${correlationId}, ${sourceIp})
        ON CONFLICT (provider_code, idempotency_key) DO NOTHING
        RETURNING id`,
  );

  if (claimed.rows.length === 0) {
    // The event was already claimed. Replay of the same authenticated body is a
    // duplicate and changes nothing. A different authenticated body under the same
    // event ID is a conflict and is never processed.
    const { rows } = await db.execute(
      sql`SELECT id, tenant_id, raw_payload FROM communication_webhook_events WHERE provider_code = ${providerCode} AND idempotency_key = ${idempotencyKey} LIMIT 1`,
    );
    const existing = rows[0] as { id: string; tenant_id: string | null; raw_payload: string } | undefined;
    if (!existing) {
      throw new Error("IDEMPOTENCY_RECORD_UNAVAILABLE");
    }

    // Rows written before the full body was stored hold a 10,000-character prefix.
    const sameBody =
      existing.raw_payload === rawBody ||
      (existing.raw_payload.length === 10_000 && rawBody.startsWith(existing.raw_payload));

    if (!sameBody) {
      await recordAudit({
        tenantId: provider.tenantId,
        actorType: "SERVICE",
        action: "communications.webhook.ingest",
        objectType: "WEBHOOK_EVENT",
        objectId: existing.id,
        outcome: "DENIED",
        reason: "DUPLICATE_PAYLOAD_MISMATCH",
        traceId,
      });
      return {
        outcome: "REJECTED",
        code: "DUPLICATE_PAYLOAD_MISMATCH",
        status: 409,
        webhookEventId: existing.id,
        tenantId: provider.tenantId,
        verificationStatus: "VERIFIED",
        correlationId,
      };
    }

    return {
      outcome: "DUPLICATE",
      code: "DUPLICATE_EVENT",
      status: 200,
      webhookEventId: existing.id,
      tenantId: existing.tenant_id ?? provider.tenantId,
      verificationStatus: "VERIFIED",
      correlationId,
    };
  }

  // 7. Process inbound message if applicable
  let messageId: string | null = null;
  let conversationId: string | null = null;

  try {
    // Only process MESSAGE type inbound
    if (provider.channelCode === "WHATSAPP" || provider.channelCode === "SMS" || provider.channelCode === "EMAIL") {
      const inbound = await parseInboundMessage(parsed, provider.channelCode);
      if (inbound) {
        // Resolve tenant from provider (never from payload)
        const tenantId = provider.tenantId;
        if (tenantId) {
          // Resolve contact
          const methodType = provider.channelCode === "EMAIL" ? "EMAIL" : provider.channelCode === "WHATSAPP" ? "WHATSAPP" : "PHONE";
          let contact360 = await findContactByMethod(tenantId, methodType as never, inbound.from);

          if (!contact360) {
            // Create contact for inbound unknown — but mark unverified
            contact360 = await createContact({
              tenantId,
              displayName: inbound.from,
              primaryPhone: methodType !== "EMAIL" ? inbound.from : null,
              primaryEmail: methodType === "EMAIL" ? inbound.from : null,
              createdBy: "SYSTEM_WEBHOOK",
              methods: [{ type: methodType as never, value: inbound.from, isPrimary: true }],
            });
          }

          // Find or create conversation
          const conversations = await listConversations(tenantId, { contactId: contact360.contact.id, status: "OPEN", limit: 1 });
          let conv = conversations[0];
          if (!conv) {
            conv = await createConversation({
              tenantId,
              contactId: contact360.contact.id,
              channel: provider.channelCode,
              correlationId,
              createdBy: "SYSTEM_WEBHOOK",
            });
          }
          conversationId = conv.id;

          // Create inbound message. Idempotent per provider + provider event ID, and caused by the inbox event.
          const msgResult = await createMessage({
            tenantId,
            conversationId: conv.id,
            contactId: contact360.contact.id,
            channel: provider.channelCode as never,
            providerId: provider.id,
            direction: "INBOUND",
            messageType: "TEXT",
            sender: inbound.from,
            recipient: inbound.to,
            body: inbound.body,
            correlationId,
            causationId: webhookEventId,
            idempotencyKey: `inbound_${sha256(`${providerCode}:${providerEventId}`).slice(0, 40)}`,
            traceId,
            providerMessageId: inbound.providerMessageId,
            createdBy: "SYSTEM_WEBHOOK",
          });
          messageId = msgResult.message.id;
        }
      }
    }

    // Mark webhook as processed
    await db.execute(sql`UPDATE communication_webhook_events SET status = 'PROCESSED', processed_at = now() WHERE id = ${webhookEventId}`);

    await recordAudit({
      tenantId: provider.tenantId,
      actorType: "SERVICE",
      action: "communications.webhook.ingest",
      objectType: "WEBHOOK_EVENT",
      objectId: webhookEventId,
      outcome: "SUCCESS",
      newValue: {
        providerCode,
        channel: provider.channelCode,
        eventType,
        providerEventId,
        messageId,
        conversationId,
      },
      traceId,
    });

    await publishEvent({
      type: "COMMUNICATION_RECEIVED",
      source: "BEYU_OS",
      domain: "communications",
      operation: "webhook.ingest",
      destinationDomain: null,
      tenantId: provider.tenantId,
      legalEntityId: null,
      subjectType: "WEBHOOK_EVENT",
      subjectId: webhookEventId,
      actorType: "SERVICE",
      classification: "INTERNAL",
      payload: {
        webhookEventId,
        providerCode,
        channel: provider.channelCode,
        providerEventId,
        messageId,
        conversationId,
      },
      traceId,
      correlationId,
      causationId: webhookEventId,
      authorityContext: null,
      policyVersion: null,
    });

    return {
      outcome: "ACCEPTED",
      code: "WEBHOOK_ACCEPTED",
      status: 200,
      webhookEventId,
      tenantId: provider.tenantId,
      messageId: messageId ?? undefined,
      conversationId: conversationId ?? undefined,
      verificationStatus: "VERIFIED",
      correlationId,
    };
  } catch (error) {
    const err = error as Error;
    await db.execute(
      sql`UPDATE communication_webhook_events SET status = 'FAILED', failure_reason = ${err.message} WHERE id = ${webhookEventId}`,
    );

    return {
      outcome: "ACCEPTED", // Accepted but processing failed — provider should not retry indefinitely for business logic failures
      code: "WEBHOOK_PROCESSING_FAILED",
      status: 200,
      webhookEventId,
      tenantId: provider.tenantId,
      verificationStatus: "VERIFIED",
      correlationId,
    };
  }
}

async function parseInboundMessage(
  payload: Record<string, unknown>,
  channel: string,
): Promise<{ from: string; to: string; body: string; providerMessageId: string } | null> {
  if (channel === "WHATSAPP") {
    try {
      const entry = (payload.entry as unknown[] ?? [])[0] as Record<string, unknown> | undefined;
      const changes = (entry?.changes as unknown[] ?? [])[0] as Record<string, unknown> | undefined;
      const value = changes?.value as Record<string, unknown> | undefined;
      const messages = value?.messages as Record<string, unknown>[] | undefined;
      const contacts = value?.contacts as Record<string, unknown>[] | undefined;
      const metadata = value?.metadata as Record<string, unknown> | undefined;
      if (messages && messages.length > 0) {
        const msg = messages[0];
        const text = (msg.text as Record<string, unknown> | undefined)?.body as string ?? (msg.button as Record<string, unknown> | undefined)?.text as string ?? "";
        return {
          from: (msg.from as string) ?? (contacts?.[0]?.wa_id as string) ?? "unknown",
          to: (metadata?.display_phone_number as string) ?? "unknown",
          body: text,
          providerMessageId: msg.id as string,
        };
      }
    } catch {
      return null;
    }
  }

  if (channel === "SMS") {
    const from = (payload.From as string) ?? (payload.from as string) ?? "unknown";
    const to = (payload.To as string) ?? (payload.to as string) ?? "unknown";
    const body = (payload.Body as string) ?? (payload.body as string) ?? "";
    const id = (payload.MessageSid as string) ?? (payload.id as string) ?? `sms_${Date.now()}`;
    if (from !== "unknown") {
      return { from, to, body, providerMessageId: id };
    }
  }

  if (channel === "EMAIL") {
    const from = (payload.from as string) ?? (payload.sender as string) ?? "unknown";
    const to = (payload.to as string) ?? "unknown";
    const body = (payload.text as string) ?? (payload.body as string) ?? "";
    const id = (payload.message_id as string) ?? `email_${Date.now()}`;
    if (from !== "unknown") {
      return { from, to, body, providerMessageId: id };
    }
  }

  return null;
}
