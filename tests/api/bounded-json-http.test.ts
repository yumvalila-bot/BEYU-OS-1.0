import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "@/db";
import { apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
let cookie = "";
beforeAll(async () => { if (available) cookie = await login("admin@beyu.os"); }, 180_000);
afterAll(async () => { await pool.end().catch(() => undefined); });

describe.skipIf(!available)("bounded JSON through the real governed HTTP boundary", () => {
  it("rejects excessive arrays before schema validation and does not echo the payload", async () => {
    const result = await apiPost<{ error: { code: string; message: string } }>("/api/v1/viz/scenes", { dimensions: Array(100_000).fill("sensitive-invalid-value") }, { cookie });
    // Depending on serialized size, the byte or structural limit fires first.
    expect([413, 422]).toContain(result.status);
    expect(result.body.error.code).toBe("PAYLOAD_LIMIT_EXCEEDED");
    expect(JSON.stringify(result.body)).not.toContain("sensitive-invalid-value");
  });
  it("returns a controlled 413 for oversized strings", async () => {
    const result = await apiPost<{ error: { code: string } }>("/api/v1/viz/scenes", { name: "x".repeat(1024 * 1024) }, { cookie });
    expect(result.status).toBe(413);
    expect(result.body.error.code).toBe("PAYLOAD_LIMIT_EXCEEDED");
  });
  it("preserves ordinary schema validation for a small request", async () => {
    const result = await apiPost<{ error: { code: string } }>("/api/v1/viz/scenes", { name: "x" }, { cookie });
    expect(result.status).toBe(422);
    expect(result.body.error.code).toBe("VALIDATION_FAILED");
  });
});
