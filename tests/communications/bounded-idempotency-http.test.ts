import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { communicationContacts } from "@/db/schema";
import { baseUrl, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
const suffix = randomBytes(8).toString("hex");
const name = `Disposable contact ${suffix}`;
const key = `contact-${suffix}`;
let cookie = "";
let contactId = "";
beforeAll(async () => { if (available) cookie = await login("admin@beyu.os"); }, 180_000);
afterAll(async () => {
  if (!available) return;
  if (contactId) await db.delete(communicationContacts).where(eq(communicationContacts.id, contactId));
  await db.execute(sql`delete from idempotency_records where idempotency_key = ${key}`);
  if (cookie) await fetch(`${baseUrl()}/api/v1/auth/logout`, { method: "POST", headers: { cookie } });
});

async function post(payload: unknown, idempotencyKey: string) {
  return fetch(`${baseUrl()}/api/v1/communications/contacts`, {
    method: "POST", headers: { cookie, "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify(payload),
  });
}
describe.skipIf(!available)("communications single-read bounded idempotency", () => {
  it("validates the actual submitted body, replays the same payload and rejects key reuse for a different payload", async () => {
    const first = await post({ displayName: name }, key);
    const body = await first.json();
    expect(first.status, JSON.stringify(body)).toBe(201);
    contactId = body.data.contact.id;
    expect(body.data.contact.displayName).toBe(name);
    const replay = await post({ displayName: name }, key);
    expect(replay.status).toBe(201);
    expect(replay.headers.get("idempotent-replay")).toBe("true");
    expect((await replay.json()).data.contact.id).toBe(contactId);
    expect((await post({ displayName: `${name} changed` }, key)).status).toBe(409);
  });
  it("refuses unsupported media, malformed JSON, invalid UTF-8 and excessive complexity before claiming keys", async () => {
    const probes: Array<{ suffix: string; contentType: string; body: string | Uint8Array<ArrayBuffer>; expected: number }> = [
      { suffix: "media", contentType: "text/plain", body: '{"displayName":"test"}', expected: 415 },
      { suffix: "json", contentType: "application/json", body: '{"displayName":', expected: 400 },
      { suffix: "utf8", contentType: "application/json", body: new Uint8Array([0xc3, 0x28]), expected: 400 },
      { suffix: "nodes", contentType: "application/json", body: JSON.stringify({ displayName: "test", extra: Array(1001).fill(0) }), expected: 422 },
      { suffix: "schema", contentType: "application/json", body: JSON.stringify({ displayName: "" }), expected: 422 },
    ];
    for (const probe of probes) {
      const probeKey = `${probe.suffix}-${suffix}`;
      const response = await fetch(`${baseUrl()}/api/v1/communications/contacts`, {
        method: "POST", headers: { cookie, "content-type": probe.contentType, "idempotency-key": probeKey }, body: probe.body,
      });
      expect(response.status, probe.suffix).toBe(probe.expected);
      const records = await db.execute<{ n: number }>(sql`select count(*)::int as n from idempotency_records where idempotency_key = ${probeKey}`);
      expect(records.rows[0].n, probe.suffix).toBe(0);
    }
  });
  it("enforces strict media and JSON parsing on every converted mutation before claiming a key", async () => {
    const routes = ["approval", "broadcasts", "cases", "consent", "contacts", "conversations", "documents", "feedback", "invoice", "journeys", "messages", "providers", "reports", "scheduled", "templates"];
    for (const route of routes) {
      for (const probe of [
        { name: "media", contentType: "text/plain", expected: 415 },
        { name: "malformed", contentType: "application/json", expected: 400 },
      ]) {
        const probeKey = `boundary-${route}-${probe.name}-${suffix}`;
        const response = await fetch(`${baseUrl()}/api/v1/communications/${route}`, {
          method: "POST", headers: { cookie, "content-type": probe.contentType, "idempotency-key": probeKey }, body: "{",
        });
        expect(response.status, `${route} ${probe.name}`).toBe(probe.expected);
        const records = await db.execute<{ n: number }>(sql`select count(*)::int as n from idempotency_records where idempotency_key = ${probeKey}`);
        expect(records.rows[0].n, `${route} ${probe.name}`).toBe(0);
      }
    }
  });
  it("rejects an oversized body before claiming an idempotency key", async () => {
    const oversizedKey = `over-${suffix}`;
    const response = await post({ displayName: "x".repeat(1024 * 1024) }, oversizedKey);
    expect(response.status).toBe(413);
    const records = await db.execute<{ n: number }>(sql`select count(*)::int as n from idempotency_records where idempotency_key = ${oversizedKey}`);
    expect(records.rows[0].n).toBe(0);
  });
});
