import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../src/db";
import { apiPost, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();
let governance = "";

beforeAll(async () => {
  if (available) governance = await login("governance@beyu.os");
}, 180_000);

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("shared production validation boundary", () => {
  it.each([
    ["Noelia", "/api/v1/ai/noelia", { question: "x" }],
    ["canonical resolutions", "/api/v1/governance/resolutions", { bodyId: "GOV_GROUP_BOARD", title: "x" }],
  ])("returns canonical 422 for %s Zod validation", async (_name, path, payload) => {
    const response = await apiPost(path, payload, { cookie: governance });
    expect(response.status).toBe(422);
    const body = response.body as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    expect(body.error?.message).toBe("Request payload failed schema validation.");
    expect(JSON.stringify(body)).not.toMatch(/stack|postgres|select .* from/i);
  });
});
