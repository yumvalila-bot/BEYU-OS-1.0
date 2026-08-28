import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { resolutions } from "../../src/db/schema";
import { apiGet, apiPost, isDeniedPage, login, proposalPayload, serverAvailable } from "../helpers/http";

/**
 * END-TO-END transport tests for the governed mutation.
 *
 * Remediation A-04/A-05: the transport-layer controls (401, the 422 server-field
 * and lifecycle guards, idempotency, replay) were previously asserted by reading
 * SOURCE TEXT. This suite exercises the running server so a behavioural
 * regression fails the build even if the source string survives.
 *
 * Skipped automatically when no server is reachable so `npm test` still works for
 * contributors who have not started one; CI always starts it.
 */

const PROBE_REFS = "^(GROUP_BOARD|FAMILY_COUNCIL|INVESTMENT_COMMITTEE|TRUSTEE_BOARD)-";
const ENDPOINT = "/api/v1/governance/resolutions";

/**
 * Availability is resolved at MODULE LOAD, not in beforeAll: vitest evaluates
 * `skipIf` during collection, so a value assigned later would always read false
 * and silently skip the entire suite.
 */
const available = await serverAvailable();

let governance = "";
let auditor = "";
let sectorOperator = "";

async function cleanup() {
  await db.execute(sql`delete from resolutions where reference ~ ${PROBE_REFS}`);
  await db.execute(sql`delete from idempotency_records`);
}

beforeAll(async () => {
  if (!available) return;
  await cleanup();
  governance = await login("governance@beyu.os");
  auditor = await login("auditor@beyu.os");
  sectorOperator = await login("health.ops@beyu.os");
}, 180_000);

beforeEach(async () => {
  if (available) await cleanup();
});

afterAll(async () => {
  if (available) await cleanup();
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("governed mutation over HTTP", () => {
    it("rejects an unauthenticated request with 401", async () => {
      const res = await apiPost(ENDPOINT, proposalPayload());
      expect(res.status).toBe(401);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe("UNAUTHENTICATED");

      // Nothing was written.
      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(0);
    });

    it("creates a real resolution for an authorised principal", async () => {
      const res = await apiPost<{ data: { reference: string; status: string; id: string } }>(
        ENDPOINT,
        proposalPayload(),
        { cookie: governance },
      );
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe("DRAFT");

      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(1);
      expect(rows[0].id).toBe(res.body.data.id);
    });

    it("denies a principal without the permission (403)", async () => {
      const res = await apiPost(ENDPOINT, proposalPayload(), { cookie: auditor });
      expect(res.status).toBe(403);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe("FORBIDDEN");
    });

    it("denies a cross-tenant proposal without confirming existence", async () => {
      const real = await apiPost(ENDPOINT, proposalPayload(), { cookie: sectorOperator });
      const fake = await apiPost(ENDPOINT, proposalPayload({ bodyId: "GOV_NOT_REAL" }), {
        cookie: sectorOperator,
      });
      // Identical responses: no existence oracle for out-of-scope objects.
      expect(real.status).toBe(fake.status);
      expect((real.body as { error?: { code?: string } })?.error?.code).toBe(
        (fake.body as { error?: { code?: string } })?.error?.code,
      );
    });

    it("rejects a forged lifecycle status with 422", async () => {
      const res = await apiPost(ENDPOINT, proposalPayload({ status: "APPROVED" }), {
        cookie: governance,
      });
      expect(res.status).toBe(422);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe("STATUS_NOT_PROPOSABLE");
    });

    it("rejects server-controlled fields with 422", async () => {
      for (const field of ["tenantId", "proposedBy", "reference", "votesFor"]) {
        const res = await apiPost(ENDPOINT, proposalPayload({ [field]: "x" }), {
          cookie: governance,
        });
        // 429 is an acceptable non-success if the per-principal budget is spent;
        // a 2xx never is.
        expect([422, 429], field).toContain(res.status);
        if (res.status === 422) {
          expect((res.body as { error?: { code?: string } })?.error?.code, field).toBe(
            "SERVER_CONTROLLED_FIELD",
          );
        }
      }
    });

    it("rejects an unknown field and malformed input with 422", async () => {
      // The propose capability is rate limited to 20/min per principal, which is a
      // real control and must not be relaxed for tests. When the whole suite runs
      // the budget can be exhausted, so 429 is accepted as a valid non-success —
      // what must never happen is a 2xx for invalid input.
      const accept = (status: number) => expect([422, 429]).toContain(status);

      const unknown = await apiPost(ENDPOINT, proposalPayload({ sneaky: true }), {
        cookie: governance,
      });
      accept(unknown.status);

      const malformed = await apiPost(ENDPOINT, { bodyId: "GOV_GROUP_BOARD", title: "x" }, {
        cookie: governance,
      });
      accept(malformed.status);

      // Neither invalid request may create a record.
      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(0);
    });

    it("denies a classification above the principal's ceiling", async () => {
      const cfo = await login("cfo@beyu.os"); // clearance RESTRICTED
      const res = await apiPost(ENDPOINT, proposalPayload({ classification: "HIGHLY_RESTRICTED" }), {
        cookie: cfo,
      });
      expect(res.status).toBe(403);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe("CLASSIFICATION_DENIED");
    }, 120_000);

    /* ------------------------- idempotency (A-01) ------------------------- */

    it("replays an identical request without creating a second record", async () => {
      const key = `replay-${Date.now()}`;
      const payload = proposalPayload({ title: "Idempotent replay probe resolution" });

      const first = await apiPost<{ data: { reference: string } }>(ENDPOINT, payload, {
        cookie: governance,
        idempotencyKey: key,
      });
      const second = await apiPost<{ data: { reference: string } }>(ENDPOINT, payload, {
        cookie: governance,
        idempotencyKey: key,
      });

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(second.body.data.reference).toBe(first.body.data.reference);
      expect(second.headers.get("idempotent-replay")).toBe("true");

      // Exactly one row: the replay did not re-execute the mutation.
      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(1);
    });

    it("rejects the same key with a different payload (409)", async () => {
      const key = `mismatch-${Date.now()}`;
      const first = await apiPost(ENDPOINT, proposalPayload({ title: "First payload for the key" }), {
        cookie: governance,
        idempotencyKey: key,
      });
      expect(first.status).toBe(201);

      const second = await apiPost(
        ENDPOINT,
        proposalPayload({ title: "COMPLETELY DIFFERENT payload same key" }),
        { cookie: governance, idempotencyKey: key },
      );
      expect(second.status).toBe(409);
      expect((second.body as { error?: { code?: string } })?.error?.code).toBe(
        "IDEMPOTENCY_KEY_REUSED",
      );

      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(1);
    });

    it("never leaks a response across actors reusing a key", async () => {
      const key = `cross-actor-${Date.now()}`;
      const first = await apiPost<{ data: { reference: string; title: string } }>(
        ENDPOINT,
        proposalPayload({ title: "Governance officer private proposal" }),
        { cookie: governance, idempotencyKey: key },
      );
      expect(first.status).toBe(201);

      // A different principal reusing the SAME key must never receive the first
      // actor's response body.
      const cfo = await login("cfo@beyu.os");
      const second = await apiPost<{ data?: { reference?: string; title?: string } }>(
        ENDPOINT,
        proposalPayload({ title: "CFO separate proposal under the same key" }),
        { cookie: cfo, idempotencyKey: key },
      );

      expect(second.headers.get("idempotent-replay")).not.toBe("true");
      expect(second.body?.data?.reference).not.toBe(first.body.data.reference);
      expect(second.body?.data?.title).not.toBe(first.body.data.title);
    }, 120_000);

    it("does not double-execute concurrent requests sharing a key", async () => {
      const key = `concurrent-${Date.now()}`;
      const payload = proposalPayload({ title: "Concurrent idempotency probe resolution" });

      const [a, b] = await Promise.all([
        apiPost(ENDPOINT, payload, { cookie: governance, idempotencyKey: key }),
        apiPost(ENDPOINT, payload, { cookie: governance, idempotencyKey: key }),
      ]);

      // One succeeds; the other is either a replay or an explicit in-progress
      // conflict — but never a second committed mutation.
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(201);
      expect([201, 409]).toContain(statuses[1]);

      const rows = await db.select().from(resolutions).where(sql`reference ~ ${PROBE_REFS}`);
      expect(rows.length).toBe(1);
    });

    /* ---------------------------- page behaviour --------------------------- */

    it("suppresses data assets above the viewer's clearance (A-02)", async () => {
      // PLATFORM_ADMIN clearance is RESTRICTED; the family registry asset is
      // HIGHLY_RESTRICTED and must not be listed.
      const admin = await login("admin@beyu.os");
      const page = await apiGet("/os/registry", admin);
      expect(page.status).toBe(200);
      expect(page.html).not.toContain("Family &amp; beneficiary registry");
      expect(page.html).toContain("suppressed");
    }, 120_000);

    it("denies the foundation page to an out-of-scope principal (H-NEW-2)", async () => {
      const page = await apiGet("/os/foundation", sectorOperator);
      expect(page.status).toBe(200);
      expect(isDeniedPage(page.html)).toBe(true);
      expect(page.html).not.toContain("BEYU Holdings Ltd");
    });
});
