/**
 * Inbound communications webhooks — the database boundary.
 *
 * Drives ingestWebhookEvent() with real signatures and asserts what was written.
 * A forged, unsigned, misconfigured or non-live request must leave no contact,
 * conversation or message behind. A verified event creates exactly one inbound
 * message. A replay or a conflicting duplicate never creates a second one. The
 * tenant always comes from the provider record, never from the payload.
 *
 * Signing helpers below re-implement each documented scheme independently of the
 * module under test. webhook-signature.test.ts pins the same schemes to vectors
 * computed with OpenSSL and the official Twilio SDK.
 */
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationContacts,
  communicationMessages,
  communicationProviders,
  communicationSecurityEvents,
  communicationWebhookEvents,
  tenants,
} from "@/db/schema";
import { ingestWebhookEvent, MAX_PAYLOAD_BYTES, type WebhookIngestInput } from "@/lib/communications/webhook-service";

const RUN = Date.now().toString(36).toUpperCase();
/**
 * Two seeded tenants, looked up by code. Tests must not insert tenants: the
 * shared database has pinned tenant counts (tests/finance) and 375 foreign keys
 * reference tenants, so a test-created tenant cannot be removed cleanly.
 */
const TENANT_CODE = "BEYU-GROUP";
const OTHER_TENANT_CODE = "BEYU-FINTECH";
let TENANT_ID = "";
let OTHER_TENANT_ID = "";
const PUBLIC_BASE = "https://beyu.example.test/api/v1/communications/webhook";

const WA_SECRET = `wa-app-secret-${RUN.toLowerCase()}-0123456789`;
const WA2_SECRET = `wa2-app-secret-${RUN.toLowerCase()}-0123456789`;
const SMS_TOKEN = `sms-auth-token-${RUN.toLowerCase()}-0123456789`;
const GEN_SECRET = `gen-webhook-secret-${RUN.toLowerCase()}-0123456789`;

const REF = {
  WA: `BEYU_WHI_WA_${RUN}_SECRET`,
  WA2: `BEYU_WHI_WA2_${RUN}_SECRET`,
  SMS: `BEYU_WHI_SMS_${RUN}_TOKEN`,
  GEN: `BEYU_WHI_GEN_${RUN}_SECRET`,
  UNSET: `BEYU_WHI_UNSET_${RUN}_SECRET`,
} as const;

const CODE = {
  WA: `WA_WHI_${RUN}`,
  WA2: `WA2_WHI_${RUN}`,
  SMS: `SMS_WHI_${RUN}`,
  GEN: `EML_WHI_${RUN}`,
  NO_SECRET: `WANS_WHI_${RUN}`,
  UNSET: `WAUNSET_WHI_${RUN}`,
  SIMULATED_LIVE: `WASIM_WHI_${RUN}`,
} as const;

const CREATED_ENV = Object.values(REF);

function metaSign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

function genericSign(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex")}`;
}

function twilioSign(token: string, url: string, form: URLSearchParams): string {
  const fields = new Map<string, string[]>();
  for (const [name, value] of form) fields.set(name, [...(fields.get(name) ?? []), value]);
  let data = url;
  for (const name of [...fields.keys()].sort()) {
    for (const value of [...new Set(fields.get(name) ?? [])].sort()) data += name + value;
  }
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

const SENDER_BASE = `255711${String(Date.now()).slice(-6)}`;
const SENDER = {
  LIVE: SENDER_BASE,
  FORGED: `${SENDER_BASE}1`,
  UNSIGNED: `${SENDER_BASE}2`,
  NO_SECRET: `${SENDER_BASE}3`,
  UNSET: `${SENDER_BASE}4`,
  INACTIVE: `${SENDER_BASE}5`,
  SIMULATED: `${SENDER_BASE}6`,
  REPLAY: `${SENDER_BASE}7`,
  CONFLICT: `${SENDER_BASE}8`,
  SECOND_PROVIDER: `${SENDER_BASE}9`,
  GENERIC: `${SENDER_BASE}0`,
  TENANT_SPOOF: `${SENDER_BASE}A`,
  SMS: `${SENDER_BASE}B`,
  STALE: `${SENDER_BASE}C`,
};

function waBody(messageId: string, text: string, sender: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    ...extra,
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_TEST",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "255700000000" },
              contacts: [{ wa_id: sender }],
              messages: [{ from: sender, id: messageId, type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
}

async function seededTenantId(code: string): Promise<string> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, code)).limit(1);
  if (!row) throw new Error(`Seeded tenant ${code} is missing; run the seed before these tests.`);
  return row.id;
}

async function insertProvider(row: {
  code: string;
  channelCode: string;
  providerType: string;
  status: string;
  signingSecretRef: string | null;
  tenantId?: string | null;
}): Promise<void> {
  await db.insert(communicationProviders).values({
    id: `PROV_${row.code}`,
    code: row.code,
    channelCode: row.channelCode,
    providerType: row.providerType,
    name: `Inbound test ${row.code}`,
    status: row.status,
    signingSecretRef: row.signingSecretRef,
    tenantId: row.tenantId === undefined ? TENANT_ID : row.tenantId,
    healthStatus: "UNKNOWN",
  });
}

async function ingest(
  providerCode: string,
  rawBody: string,
  headers: Record<string, string>,
  overrides: Partial<WebhookIngestInput> = {},
) {
  return ingestWebhookEvent({
    providerCode,
    rawBody,
    headers,
    requestUrl: `${PUBLIC_BASE}/${providerCode}`,
    sourceIp: "203.0.113.9",
    receivedAt: new Date(),
    traceId: `TRACE_WHI_${RUN}_${Math.random().toString(36).slice(2, 8)}`,
    ...overrides,
  });
}

async function messagesWithProviderId(providerMessageId: string) {
  return db
    .select({ id: communicationMessages.id, tenantId: communicationMessages.tenantId, body: communicationMessages.body, direction: communicationMessages.direction })
    .from(communicationMessages)
    .where(eq(communicationMessages.providerMessageId, providerMessageId));
}

async function contactsForSender(sender: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(communicationContacts)
    .where(and(eq(communicationContacts.tenantId, TENANT_ID), eq(communicationContacts.displayName, sender)));
  return Number(row?.n ?? 0);
}

async function webhookRow(id: string) {
  const [row] = await db.select().from(communicationWebhookEvents).where(eq(communicationWebhookEvents.id, id)).limit(1);
  return row;
}

async function securityEventCount(webhookEventId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(communicationSecurityEvents)
    .where(eq(communicationSecurityEvents.webhookEventId, webhookEventId));
  return Number(row?.n ?? 0);
}

describe("communications inbound webhooks — database boundary", () => {
  beforeAll(async () => {
    process.env[REF.WA] = WA_SECRET;
    process.env[REF.WA2] = WA2_SECRET;
    process.env[REF.SMS] = SMS_TOKEN;
    process.env[REF.GEN] = GEN_SECRET;
    delete process.env[REF.UNSET];

    TENANT_ID = await seededTenantId(TENANT_CODE);
    OTHER_TENANT_ID = await seededTenantId(OTHER_TENANT_CODE);

    await insertProvider({ code: CODE.WA, channelCode: "WHATSAPP", providerType: "META_WHATSAPP", status: "VERIFIED", signingSecretRef: REF.WA });
    await insertProvider({ code: CODE.WA2, channelCode: "WHATSAPP", providerType: "META_WHATSAPP", status: "VERIFIED", signingSecretRef: REF.WA2 });
    await insertProvider({ code: CODE.SMS, channelCode: "SMS", providerType: "TWILIO_SMS", status: "CONNECTED", signingSecretRef: REF.SMS });
    await insertProvider({ code: CODE.GEN, channelCode: "EMAIL", providerType: "GENERIC_SIGNED_WEBHOOK", status: "VERIFIED", signingSecretRef: REF.GEN });
    await insertProvider({ code: CODE.NO_SECRET, channelCode: "WHATSAPP", providerType: "META_WHATSAPP", status: "VERIFIED", signingSecretRef: null });
    await insertProvider({ code: CODE.UNSET, channelCode: "WHATSAPP", providerType: "META_WHATSAPP", status: "VERIFIED", signingSecretRef: REF.UNSET });
    await insertProvider({ code: CODE.SIMULATED_LIVE, channelCode: "WHATSAPP", providerType: "META_WHATSAPP_SIMULATED", status: "CONNECTED", signingSecretRef: REF.WA });
  });

  afterAll(() => {
    for (const name of CREATED_ENV) delete process.env[name];
  });

  it("a verified WhatsApp event creates one contact, conversation and inbound message in the provider's tenant", async () => {
    const eventId = `wamid.${RUN}.LIVE`;
    const body = waBody(eventId, "Habari", SENDER.LIVE);
    const receipt = await ingest(CODE.WA, body, { "content-type": "application/json", "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED", status: 200, tenantId: TENANT_ID, verificationStatus: "VERIFIED" });
    expect(receipt.messageId).toBeTruthy();
    expect(receipt.conversationId).toBeTruthy();

    const messages = await messagesWithProviderId(eventId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ tenantId: TENANT_ID, body: "Habari", direction: "INBOUND" });
    expect(await contactsForSender(SENDER.LIVE)).toBe(1);

    const row = await webhookRow(receipt.webhookEventId);
    expect(row).toMatchObject({ status: "PROCESSED", signatureVerified: true, verificationStatus: "VERIFIED", tenantId: TENANT_ID });
  });

  it("a realistic base64 WhatsApp message ID (dots, padding) is processed, not just accepted", async () => {
    const eventId = `wamid.HBgM${RUN}FQIAERgSQjBDRjg0RDYwRkZBRjdBRjRFAA==`;
    const body = waBody(eventId, "Realistic identifier", SENDER.LIVE);
    const receipt = await ingest(CODE.WA, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(await messagesWithProviderId(eventId)).toHaveLength(1);
    expect((await webhookRow(receipt.webhookEventId))?.status).toBe("PROCESSED");
  });

  it("a forged request signed with the wrong secret is refused, leaves no business record, and raises a security event", async () => {
    const eventId = `wamid.${RUN}.FORGED`;
    const body = waBody(eventId, "Forged", SENDER.FORGED);
    const receipt = await ingest(CODE.WA, body, { "x-hub-signature-256": metaSign("an-attacker-chosen-secret-000", body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", code: "SIGNATURE_VERIFICATION_FAILED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
    expect(await contactsForSender(SENDER.FORGED)).toBe(0);

    const row = await webhookRow(receipt.webhookEventId);
    expect(row).toMatchObject({ status: "REJECTED", failureReason: "SIGNATURE_MISMATCH", signatureVerified: false, verificationStatus: "FAILED" });
    expect(await securityEventCount(receipt.webhookEventId)).toBe(1);
  });

  it("the sha256= prefix on its own is not a signature (regression: the old check accepted it)", async () => {
    const eventId = `wamid.${RUN}.PREFIX`;
    const body = waBody(eventId, "Prefix only", SENDER.FORGED);
    const receipt = await ingest(CODE.WA, body, { "x-hub-signature-256": "sha256=" });

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
  });

  it("an unsigned request is refused even though the provider has a signing secret", async () => {
    const eventId = `wamid.${RUN}.UNSIGNED`;
    const body = waBody(eventId, "No signature", SENDER.UNSIGNED);
    const receipt = await ingest(CODE.WA, body, { "content-type": "application/json" });

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("SIGNATURE_MISSING");
  });

  it("a provider with no signing secret reference is disabled, even for a well-formed payload (regression: this used to be processed)", async () => {
    const eventId = `wamid.${RUN}.NOSECRET`;
    const body = waBody(eventId, "No secret configured", SENDER.NO_SECRET);
    const receipt = await ingest(CODE.NO_SECRET, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
    expect(await contactsForSender(SENDER.NO_SECRET)).toBe(0);
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("SIGNING_SECRET_REF_MISSING");
  });

  it("a signing secret whose environment variable is not set disables the provider", async () => {
    const eventId = `wamid.${RUN}.UNSETREF`;
    const body = waBody(eventId, "Secret not set", SENDER.UNSET);
    const receipt = await ingest(CODE.UNSET, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("SIGNING_SECRET_NOT_CONFIGURED");
  });

  it.each(["NOT_CONNECTED", "CONFIGURED", "DEGRADED", "FAILED", "SIMULATED"])(
    "a provider in status %s accepts no inbound events, even with a valid signature",
    async (status) => {
      const code = `WAST_${status}_${RUN}`;
      await insertProvider({ code, channelCode: "WHATSAPP", providerType: "META_WHATSAPP", status, signingSecretRef: REF.WA });
      const eventId = `wamid.${RUN}.STATUS.${status}`;
      const body = waBody(eventId, "Not live", SENDER.INACTIVE);
      const receipt = await ingest(code, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

      expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
      expect(await messagesWithProviderId(eventId)).toHaveLength(0);
      expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("PROVIDER_NOT_ACTIVE");
    },
  );

  it("a simulated provider type is refused even when its status says CONNECTED", async () => {
    const eventId = `wamid.${RUN}.SIMULATED`;
    const body = waBody(eventId, "Simulated", SENDER.SIMULATED);
    const receipt = await ingest(CODE.SIMULATED_LIVE, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect(await messagesWithProviderId(eventId)).toHaveLength(0);
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("PROVIDER_NOT_ACTIVE");
  });

  it("replaying the identical verified request is a duplicate: no second message, and the stored event is not rewritten", async () => {
    const eventId = `wamid.${RUN}.REPLAY`;
    const body = waBody(eventId, "Once", SENDER.REPLAY);
    const headers = { "content-type": "application/json", "x-hub-signature-256": metaSign(WA_SECRET, body) };

    const first = await ingest(CODE.WA, body, headers);
    const second = await ingest(CODE.WA, body, headers);

    expect(first).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(second).toMatchObject({ outcome: "DUPLICATE", code: "DUPLICATE_EVENT", status: 200, webhookEventId: first.webhookEventId });
    expect(await messagesWithProviderId(eventId)).toHaveLength(1);
    expect((await webhookRow(first.webhookEventId))?.status).toBe("PROCESSED");
  });

  it("a different validly signed body under an already-claimed event ID is a conflict and is never processed", async () => {
    const eventId = `wamid.${RUN}.CONFLICT`;
    const original = waBody(eventId, "Original text", SENDER.CONFLICT);
    const altered = waBody(eventId, "Altered text", SENDER.CONFLICT, { attempt: 2 });

    const first = await ingest(CODE.WA, original, { "x-hub-signature-256": metaSign(WA_SECRET, original) });
    const conflict = await ingest(CODE.WA, altered, { "x-hub-signature-256": metaSign(WA_SECRET, altered) });

    expect(first).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(conflict).toMatchObject({ outcome: "REJECTED", code: "DUPLICATE_PAYLOAD_MISMATCH", status: 409, webhookEventId: first.webhookEventId });
    const messages = await messagesWithProviderId(eventId);
    expect(messages).toHaveLength(1);
    expect(messages[0].body).toBe("Original text");
  });

  it("the same provider event ID on a different provider is a different event", async () => {
    const eventId = `wamid.${RUN}.SHARED`;
    const bodyA = waBody(eventId, "On provider one", SENDER.LIVE);
    const bodyB = waBody(eventId, "On provider two", SENDER.SECOND_PROVIDER);

    const a = await ingest(CODE.WA, bodyA, { "x-hub-signature-256": metaSign(WA_SECRET, bodyA) });
    const b = await ingest(CODE.WA2, bodyB, { "x-hub-signature-256": metaSign(WA2_SECRET, bodyB) });

    expect(a).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(b).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(a.webhookEventId).not.toBe(b.webhookEventId);
    expect(await messagesWithProviderId(eventId)).toHaveLength(2);
  });

  it("generic signed webhook: a correctly signed request outside the skew window is refused as a replay", async () => {
    const now = Date.now();
    const staleTimestamp = String(Math.floor(now / 1000) - 3600);
    const eventId = `EVT-STALE-${RUN}`;
    const body = JSON.stringify({ event_id: eventId, message_id: eventId, type: "MESSAGE", from: SENDER.STALE, to: "inbox@beyu.example.test", text: "Stale" });
    const receipt = await ingest(
      CODE.GEN,
      body,
      { "x-beyu-timestamp": staleTimestamp, "x-beyu-signature": genericSign(GEN_SECRET, staleTimestamp, body) },
      { receivedAt: new Date(now) },
    );

    expect(receipt).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("TIMESTAMP_OUT_OF_WINDOW");
    expect(await contactsForSender(SENDER.STALE)).toBe(0);
  });

  it("generic signed webhook: a fresh request is accepted once, and its replay is a duplicate", async () => {
    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const eventId = `EVT-FRESH-${RUN}`;
    const body = JSON.stringify({ event_id: eventId, message_id: eventId, type: "MESSAGE", from: SENDER.GENERIC, to: "inbox@beyu.example.test", text: "Fresh" });
    const headers = { "x-beyu-timestamp": timestamp, "x-beyu-signature": genericSign(GEN_SECRET, timestamp, body) };

    const first = await ingest(CODE.GEN, body, headers, { receivedAt: new Date(now) });
    const replay = await ingest(CODE.GEN, body, headers, { receivedAt: new Date(now + 5000) });

    expect(first).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED" });
    expect(replay.outcome).toBe("DUPLICATE");
    expect(await messagesWithProviderId(eventId)).toHaveLength(1);
  });

  it("Twilio: a form request signed over the exact public URL is accepted; the same signature for another URL is refused", async () => {
    const providerUrl = `${PUBLIC_BASE}/${CODE.SMS}`;
    const form = new URLSearchParams({
      MessageSid: `SM${RUN}SMS0001`,
      From: `+${SENDER.SMS}`,
      To: "+255700000000",
      Body: "Habari kutoka Twilio",
    });
    const rawBody = form.toString();
    const headers = { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": twilioSign(SMS_TOKEN, providerUrl, form) };

    const accepted = await ingest(CODE.SMS, rawBody, headers, { requestUrl: providerUrl });
    expect(accepted).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED", status: 200 });
    expect(await messagesWithProviderId(`SM${RUN}SMS0001`)).toHaveLength(1);

    const forgedUrl = `https://attacker.example.test/api/v1/communications/webhook/${CODE.SMS}`;
    const refused = await ingest(CODE.SMS, rawBody, headers, { requestUrl: forgedUrl });
    expect(refused).toMatchObject({ outcome: "REJECTED", status: 401 });
    expect((await webhookRow(refused.webhookEventId))?.failureReason).toBe("SIGNATURE_MISMATCH");
  });

  it("tenant spoofing: a payload that names another tenant does not move the message out of the provider's tenant", async () => {
    const eventId = `wamid.${RUN}.TENANTSPOOF`;
    const body = waBody(eventId, "Who am I", SENDER.TENANT_SPOOF, {
      tenant_id: OTHER_TENANT_ID,
      tenantId: OTHER_TENANT_ID,
      legal_entity_id: "LE_OTHER",
    });
    const receipt = await ingest(CODE.WA, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED", tenantId: TENANT_ID });
    const messages = await messagesWithProviderId(eventId);
    expect(messages).toHaveLength(1);
    expect(messages[0].tenantId).toBe(TENANT_ID);
    const [other] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(communicationMessages)
      .where(and(eq(communicationMessages.tenantId, OTHER_TENANT_ID), eq(communicationMessages.providerMessageId, eventId)));
    expect(Number(other?.n ?? 0)).toBe(0);
  });

  it("an unknown provider code is refused with the uniform response and is not linked to any tenant", async () => {
    const body = waBody(`wamid.${RUN}.UNKNOWN`, "Unknown", SENDER.FORGED);
    const receipt = await ingest(`NO_SUCH_PROVIDER_${RUN}`, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", code: "SIGNATURE_VERIFICATION_FAILED", status: 401, tenantId: null });
    const row = await webhookRow(receipt.webhookEventId);
    expect(row).toMatchObject({ providerId: null, tenantId: null, failureReason: "PROVIDER_NOT_FOUND" });
  });

  it("an oversized body is refused with 413 before any signature or parsing work", async () => {
    const body = "x".repeat(MAX_PAYLOAD_BYTES + 1);
    const receipt = await ingest(CODE.WA, body, { "x-hub-signature-256": metaSign(WA_SECRET, body) });

    expect(receipt).toMatchObject({ outcome: "REJECTED", code: "PAYLOAD_TOO_LARGE", status: 413 });
    expect((await webhookRow(receipt.webhookEventId))?.failureReason).toBe("PAYLOAD_TOO_LARGE");
  });
});
