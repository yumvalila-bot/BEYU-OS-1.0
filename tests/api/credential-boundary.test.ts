import { describe, expect, it } from "vitest";
import { CREDENTIAL_JSON_BYTES, readCredentialJson } from "@/lib/bounded-json";

const json = (body: string, headers: HeadersInit = { "content-type": "application/json" }) =>
  new Request("http://local.test", { method: "POST", headers, body });

describe("strict credential request boundary", () => {
  it("accepts a normal credential object and a case-insensitive JSON media type", async () => {
    expect(await readCredentialJson(json('{"email":"a@example.test","password":"correct horse"}', { "content-type": "Application/JSON; charset=utf-8" })))
      .toEqual({ email: "a@example.test", password: "correct horse" });
  });
  it("rejects wrong media types, malformed JSON, and consumed bodies", async () => {
    await expect(readCredentialJson(json('{}', { "content-type": "text/plain" }))).rejects.toMatchObject({ status: 415 });
    await expect(readCredentialJson(json('{'))).rejects.toMatchObject({ status: 400 });
    const consumed = json('{}');
    await consumed.text();
    await expect(readCredentialJson(consumed)).rejects.toMatchObject({ status: 400 });
  });
  it("enforces the streaming limit without trusting Content-Length", async () => {
    const data = new TextEncoder().encode('"' + 'x'.repeat(CREDENTIAL_JSON_BYTES) + '"');
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(data.subarray(0, 10)); controller.enqueue(data.subarray(10)); controller.close(); } });
    const req = new Request("http://local.test", { method: "POST", headers: { "content-type": "application/json", "content-length": "2" }, body, duplex: "half" } as RequestInit);
    await expect(readCredentialJson(req)).rejects.toMatchObject({ status: 413 });
    await expect(readCredentialJson(json('{}', { "content-type": "application/json", "content-length": String(CREDENTIAL_JSON_BYTES + 1) }))).rejects.toMatchObject({ status: 413 });
  });
  it("rejects a structurally wide payload before schema validation", async () => {
    await expect(readCredentialJson(json(JSON.stringify(Array(1001).fill(0))))).rejects.toMatchObject({ status: 422 });
  });
});
