import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, ne } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { aiDecisions, tenants } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";

const ENDPOINT = "/api/v1/ai/noelia";
const available = await serverAvailable();
let governance = "";
let sector = "";

beforeAll(async () => {
  if (!available) return;
  governance = await login("governance@beyu.os");
  sector = await login("health.ops@beyu.os");
}, 180_000);

afterAll(async () => {
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("Noelia over production HTTP", () => {
  it("rejects unauthenticated access", async () => {
    const response = await apiPost(ENDPOINT, { question: "Which risks exceed appetite?" });
    expect(response.status).toBe(401);
    expect((response.body as { error?: { code?: string } }).error?.code).toBe("UNAUTHENTICATED");
  });

  it("normalizes malformed input to a safe canonical 422", async () => {
    const response = await apiPost(ENDPOINT, { question: "x" }, { cookie: governance });
    expect(response.status).toBe(422);
    const body = response.body as { error?: { code?: string; message?: string; details?: unknown } };
    expect(body.error?.code).toBe("VALIDATION_FAILED");
    expect(body.error?.message).toBe("Request payload failed schema validation.");
    expect(JSON.stringify(body)).not.toMatch(/stack|postgres|select .* from/i);
  });

  it("rejects unknown request fields rather than widening context", async () => {
    const response = await apiPost(ENDPOINT, {
      question: "Which risks exceed appetite?",
      unrestrictedDatabase: true,
    }, { cookie: governance });
    expect(response.status).toBe(422);
    expect((response.body as { error?: { code?: string } }).error?.code).toBe("VALIDATION_FAILED");
  });

  it("executes a governed query and persists the AI decision", async () => {
    const question = `Which risks exceed appetite? HTTP-${Date.now()}`;
    const response = await apiPost<{ data: {
      decisionId: string;
      engine: string;
      toolsUsed: string[];
      policyDecision: string;
    } }>(ENDPOINT, { question }, { cookie: governance });
    expect(response.status).toBe(200);
    expect(response.body.data.engine).toBe("RISK");
    expect(response.body.data.toolsUsed).toContain("risk.register.query");

    const [decision] = await db.select().from(aiDecisions)
      .where(eq(aiDecisions.id, response.body.data.decisionId));
    expect(decision.question).toBe(question);
    expect(decision.agent).toBe("NOELIA");
    expect(decision.inputs).toMatchObject({ executingAi: "NOELIA" });
  });

  it("denies a cross-tenant target through tool scope without leaking data", async () => {
    const [health] = await db.select().from(tenants).where(eq(tenants.code, "BEYU-HEALTH")).limit(1);
    const [other] = await db.select().from(tenants).where(ne(tenants.id, health.id)).limit(1);
    const response = await apiPost<{ data: {
      outputClass: string;
      findings: unknown[];
      deniedScopes: string[];
    } }>(ENDPOINT, {
      question: "Which risks exceed appetite?",
      context: { tenantId: other.id },
    }, { cookie: sector });

    expect(response.status).toBe(200);
    expect(response.body.data.outputClass).toBe("REQUIRES_HUMAN_REVIEW");
    expect(response.body.data.findings).toEqual([]);
    expect(response.body.data.deniedScopes.some((scope) => scope.endsWith(":TENANT_DENIED"))).toBe(true);
  });
});
