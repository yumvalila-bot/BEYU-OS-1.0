import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { assertJsonComplexity, JSON_INPUT_LIMITS, JsonInputLimitError, readBoundedJson } from "@/lib/bounded-json";
import { parseBody } from "@/lib/api";

const request = (text: string, headers?: HeadersInit) => new Request("http://local.test/api", { method: "POST", headers, body: text });

describe("bounded JSON validation boundary", () => {
  it("accepts ordinary JSON and preserves empty/malformed behavior", async () => {
    expect(await parseBody(request('{"items":[1,2]}'), z.object({ items: z.array(z.number()) }))).toEqual({ items: [1, 2] });
    expect(await readBoundedJson(request("{"))).toEqual({});
  });
  it("rejects a previously consumed body rather than validating an empty object", async () => {
    const consumed = request('{"secret":"original"}');
    await consumed.json();
    await expect(parseBody(consumed, z.object({}).passthrough())).rejects.toMatchObject({ status: 400 });
  });
  it("rejects an oversized array before Zod evaluates its elements", async () => {
    const element = vi.fn((value: unknown) => value);
    const schema = z.array(z.unknown().transform(element).pipe(z.number()));
    await expect(parseBody(request(JSON.stringify(Array(100_000).fill("invalid"))), schema)).rejects.toBeInstanceOf(JsonInputLimitError);
    expect(element).not.toHaveBeenCalled();
  });
  it("limits oversized bodies even without Content-Length", async () => {
    await expect(readBoundedJson(request('"' + 'a'.repeat(JSON_INPUT_LIMITS.bytes) + '"'))).rejects.toMatchObject({ status: 413 });
    await expect(readBoundedJson(request('{}', { 'content-length': String(JSON_INPUT_LIMITS.bytes + 1) }))).rejects.toMatchObject({ status: 413 });
  });
  it("rejects excessive depth, keys, strings and total nodes", () => {
    let nested: unknown = null;
    for (let i = 0; i <= JSON_INPUT_LIMITS.depth; i++) nested = [nested];
    expect(() => assertJsonComplexity(nested)).toThrow(JsonInputLimitError);
    expect(() => assertJsonComplexity(Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [i, 0])))).toThrow(JsonInputLimitError);
    expect(() => assertJsonComplexity('x'.repeat(JSON_INPUT_LIMITS.stringLength + 1))).toThrow(JsonInputLimitError);
    expect(() => assertJsonComplexity(Array.from({ length: 100 }, () => Array(101).fill(0)))).toThrow(JsonInputLimitError);
  });
});
