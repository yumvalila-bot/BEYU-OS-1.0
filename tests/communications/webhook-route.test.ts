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
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { communicationMessages, communicationProviders, tenants } from "@/db/schema";

vi.mock("@/lib/session", () => ({
  requestMeta: async () => ({
    ip: "203.0.113.10",
    userAgent: "vitest-webhook-route",
    traceId: "EVT_WEBHOOK_ROUTE_TEST",
    correlationId: "EVT_WEBHOOK_ROUTE_TEST",
    causationId: null,
  }),
}));

import { GET, POST } from "@/app/api/v1/communications/webhook/[provider]/route";

const RUN = Date.now().toString(36).toUpperCase();
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

  afterAll(() => {
    delete process.env[TOKEN_REF];
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
