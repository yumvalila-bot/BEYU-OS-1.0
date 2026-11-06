import { describe, expect, it } from "vitest";
import { readBoundedText } from "@/lib/bounded-json";

function req(bytes: Uint8Array): Request {
  const stream = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes.subarray(0, 2)); c.enqueue(bytes.subarray(2)); c.close(); } });
  return new Request("http://local.test", { method: "POST", body: stream, duplex: "half" } as RequestInit);
}

describe("bounded webhook text", () => {
  it("preserves the same text decoding as Request.text for signed Unicode and malformed UTF-8", async () => {
    for (const bytes of [new TextEncoder().encode('{"message":"Karibu 🐝"}'), new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0x28])]) {
      expect(await readBoundedText(req(bytes), 256)).toBe(await req(bytes).text());
    }
  });
  it("rejects byte overflow while reading the stream", async () => {
    await expect(readBoundedText(req(new Uint8Array(257)), 256)).rejects.toMatchObject({ status: 413 });
  });
});
