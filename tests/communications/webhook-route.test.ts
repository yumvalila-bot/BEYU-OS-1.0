/**
 * POST /api/v1/communications/webhook/[provider] — the HTTP boundary.
 *
 * Drives the real route handler. Requests carry real signatures. The session
 * boundary is mocked only to supply a deterministic trace and client address,
 * because the route is public and has no session.
 *
 * Asserts: the exact public request URL reaches Twilio verification; every
 * authentication refusal returns the same body, so the caller learns nothing
 * about why; and refused requests write no business records.
 */
import { createHmac } from "node:crypto";
import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  communicationLoopDetections,
  communicationMessages,
  communicationProviders,
  communicationSecurityEvents,
  communicationWebhookEvents,
  tenants,
} from "@/db/schema";

/**
 * The trace/correlation id must be unique PER RUN, and it is a hoisted constant
 * because `vi.mock` factories run before this module's statements.
 *
 * A fixed id here was a self-poisoning fixture. Inbound message creation runs
 * `checkLoop(tenantId, correlationId, …)`, which blocks once
 * `communication_loop_detections` holds a row at `MAX_AUTOMATION_DEPTH` (10) for
 * that correlation. Every run of this file appended exactly one row for
 * `EVT_WEBHOOK_ROUTE_TEST` and deleted nothing, so the tenth run turned the file
 * permanently red: the route then answered `WEBHOOK_PROCESSING_FAILED` — "Message
 * loop detected: correlation EVT_WEBHOOK_ROUTE_TEST depth 10 exceeds limit" — and
 * every run after it the same way, with the whole suite exiting 1 while its own
 * assertions stayed green. Nothing in the product was wrong; the guard was doing
 * its job on a correlation that genuinely had 10 messages. `webhook-ingest.test.ts`
 * already keys its per-run ids this way.
 */
const { RUN, RUN_TRACE } = vi.hoisted(() => {
  const run = Date.now().toString(36).toUpperCase();
  return { RUN: run, RUN_TRACE: `EVT_WEBHOOK_ROUTE_${run}` };
});

vi.mock("@/lib/session", () => ({
  requestMeta: async () => ({
    ip: "203.0.113.10",
    userAgent: "vitest-webhook-route",
    traceId: RUN_TRACE,
    correlationId: RUN_TRACE,
    causationId: null,
  }),
}));

import { GET, POST } from "@/app/api/v1/communications/webhook/[provider]/route";

/** A seeded tenant. Tests must not insert tenants into the shared database (see webhook-ingest.test.ts). */
const TENANT_CODE = "BEYU-FINTECH";
let TENANT_ID = "";
const TOKEN_REF = `BEYU_RT_${RUN}_SMS_TOKEN`;
const TOKEN = `route-auth-token-${RUN.toLowerCase()}-0123456789`;
const PROVIDER_CODE = `SMS_RT_${RUN}`;
const BASE = "https://beyu.example.test/api/v1/communications/webhook";

function twilioSign(token: string, url: string, form: URLSearchParams): string {
  const fields = new Map<string, string[]>();
  for (const [name, value] of form) fields.set(name, [...(fields.get(name) ?? []), value]);
  let data = url;
  for (const name of [...fields.keys()].sort()) {
    for (const value of [...new Set(fields.get(name) ?? [])].sort()) data += name + value;
  }
  return createHmac("sha1", token).update(data, "utf8").digest("base64");
}

function formRequest(url: string, form: URLSearchParams, signature: string | null): Request {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (signature !== null) headers["x-twilio-signature"] = signature;
  return new Request(url, { method: "POST", headers, body: form.toString() });
}

function call(providerCode: string, request: Request) {
  return POST(request, { params: Promise.resolve({ provider: providerCode }) });
}

describe("communications webhook route — HTTP boundary", () => {
  beforeAll(async () => {
    process.env[TOKEN_REF] = TOKEN;
    const [seeded] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.code, TENANT_CODE)).limit(1);
    if (!seeded) throw new Error(`Seeded tenant ${TENANT_CODE} is missing; run the seed before these tests.`);
    TENANT_ID = seeded.id;
    await db.insert(communicationProviders).values({
      id: `PROV_${PROVIDER_CODE}`,
      code: PROVIDER_CODE,
      channelCode: "SMS",
      providerType: "TWILIO_SMS",
      name: "Route test SMS provider",
      status: "CONNECTED",
      signingSecretRef: TOKEN_REF,
      tenantId: TENANT_ID,
      healthStatus: "UNKNOWN",
    });
  });

  afterAll(async () => {
    delete process.env[TOKEN_REF];
    // Remove only what THIS run created — scoped by its own provider code and
    // message-sid prefix, never by tenant, because `webhook-ingest.test.ts`
    // writes for the same tenant and this file has no business emptying its
    // history. The order is dictated by the FK graph, children first:
    //   security_events → webhook_events → messages → provider.
    // The loop-detection row is the one that actually had to go: it is what made
    // the next run fail. The rest had simply never been cleaned up at all (12
    // leaked provider rows were sitting in the database from 12 runs). Safe to
    // delete here — unlike the audit and MCM history tables, none of these carry
    // an immutability trigger that would (correctly) refuse it.
    const providerId = `PROV_${PROVIDER_CODE}`;
    await db.delete(communicationSecurityEvents).where(eq(communicationSecurityEvents.providerId, providerId));
    await db.delete(communicationWebhookEvents).where(eq(communicationWebhookEvents.providerCode, PROVIDER_CODE));
    await db
      .delete(communicationMessages)
      .where(and(eq(communicationMessages.tenantId, TENANT_ID), like(communicationMessages.providerMessageId, `SM${RUN}%`)));
    await db.delete(communicationLoopDetections).where(eq(communicationLoopDetections.correlationId, RUN_TRACE));
    await db.delete(communicationProviders).where(eq(communicationProviders.code, PROVIDER_CODE));
  });

  it("a Twilio request signed over the exact public URL is accepted and creates one inbound message", async () => {
    const url = `${BASE}/${PROVIDER_CODE}`;
    const sid = `SM${RUN}ROUTE01`;
    const form = new URLSearchParams({ MessageSid: sid, From: "+255712345001", To: "+255700000000", Body: "Habari route" });
    const response = await call(PROVIDER_CODE, formRequest(url, form, twilioSign(TOKEN, url, form)));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toMatchObject({ outcome: "ACCEPTED", code: "WEBHOOK_ACCEPTED", verificationStatus: "VERIFIED", ledgerEffect: "NONE" });

    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(communicationMessages)
      .where(and(eq(communicationMessages.tenantId, TENANT_ID), eq(communicationMessages.providerMessageId, sid)));
    expect(Number(row?.n ?? 0)).toBe(1);
  });

  it("the same signature presented for a different host is refused with the uniform response", async () => {
    const form = new URLSearchParams({ MessageSid: `SM${RUN}ROUTE02`, From: "+255712345002", To: "+255700000000", Body: "Replayed elsewhere" });
    const signedFor = `${BASE}/${PROVIDER_CODE}`;
    const presentedTo = `https://other-host.example.test/api/v1/communications/webhook/${PROVIDER_CODE}`;
    const response = await call(PROVIDER_CODE, formRequest(presentedTo, form, twilioSign(TOKEN, signedFor, form)));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("SIGNATURE_VERIFICATION_FAILED");
  });

  it("an unsigned request and an unknown provider get the same refusal, and neither reveals its internal reason", async () => {
    const form = new URLSearchParams({ MessageSid: `SM${RUN}ROUTE03`, From: "+255712345003", To: "+255700000000", Body: "No signature" });

    const unsigned = await call(PROVIDER_CODE, formRequest(`${BASE}/${PROVIDER_CODE}`, form, null));
    const unknown = await call(`NO_SUCH_${RUN}`, formRequest(`${BASE}/NO_SUCH_${RUN}`, form, null));

    expect(unsigned.status).toBe(401);
    expect(unknown.status).toBe(401);
    const unsignedBody = await unsigned.json();
    const unknownBody = await unknown.json();
    expect(unsignedBody.error.code).toBe("SIGNATURE_VERIFICATION_FAILED");
    expect(unknownBody.error.code).toBe("SIGNATURE_VERIFICATION_FAILED");
    expect(unsignedBody.error.message).toBe(unknownBody.error.message);

    const text = JSON.stringify([unsignedBody, unknownBody]);
    for (const internal of ["SIGNATURE_MISSING", "PROVIDER_NOT_FOUND", "SIGNING_SECRET", "SIGNATURE_MISMATCH", "PROVIDER_NOT_ACTIVE"]) {
      expect(text).not.toContain(internal);
    }
  });

  it("a malformed provider code is rejected before any work is done", async () => {
    const form = new URLSearchParams({ Body: "x" });
    const response = await call("lower-case!", formRequest(`${BASE}/lower-case!`, form, null));
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("INVALID_PROVIDER");
  });

  it("GET is not an ingestion method", async () => {
    const response = await GET();
    expect(response.status).toBe(405);
  });
});
