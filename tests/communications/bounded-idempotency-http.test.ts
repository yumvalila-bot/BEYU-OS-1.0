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
  it("rejects an oversized body before claiming an idempotency key", async () => {
    const oversizedKey = `over-${suffix}`;
    const response = await post({ displayName: "x".repeat(1024 * 1024) }, oversizedKey);
    expect(response.status).toBe(413);
    const records = await db.execute<{ n: number }>(sql`select count(*)::int as n from idempotency_records where idempotency_key = ${oversizedKey}`);
    expect(records.rows[0].n).toBe(0);
  });
});
