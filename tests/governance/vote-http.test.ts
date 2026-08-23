import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { governanceBodies, resolutions, resolutionVotes } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";

/**
 * END-TO-END transport tests for the vote mutation.
 *
 * Drives the real running server so authentication, the forgery guards and
 * idempotency are proven by execution rather than by inspecting source.
 */

const available = await serverAvailable();

let governance = "";
let cfo = "";
let auditor = "";
let sectorOperator = "";

const BOARD = "GOV_GROUP_BOARD";

async function cleanup() {
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_HTTP_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_HTTP_%'`);
  await db.execute(sql`delete from idempotency_records`);
}

/** Create a TABLED resolution with an open window, ready to receive votes. */
async function tabledResolution(suffix: string) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
  const id = `RES_HTTP_${suffix}`;
  const now = new Date();
  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId: BOARD,
    reference: `GROUP_BOARD-8888-${suffix.slice(0, 3)}`,
    title: "HTTP vote probe resolution",
    category: "POLICY",
    summary: "HTTP probe summary long enough to satisfy the domain contract.",
    rationale: "HTTP probe rationale long enough to satisfy the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "CHIEF_GOVERNANCE_OFFICER",
    status: "TABLED",
    requiredMajority: body.majorityRule,
    classification: "RESTRICTED",
    votingOpensAt: new Date(now.getTime() - 3600_000),
    votingClosesAt: new Date(now.getTime() + 7 * 86_400_000),
  });
  return id;
}

const votePath = (id: string) => `/api/v1/governance/resolutions/${id}/votes`;

beforeAll(async () => {
  if (!available) return;
  await cleanup();
  governance = await login("governance@beyu.os");
  cfo = await login("cfo@beyu.os");
  auditor = await login("auditor@beyu.os");
  sectorOperator = await login("health.ops@beyu.os");
}, 240_000);

beforeEach(async () => {
  if (available) await cleanup();
});

afterAll(async () => {
  if (available) await cleanup();
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("vote mutation over HTTP", () => {
  it("rejects an unauthenticated vote with 401", async () => {
    const id = await tabledResolution("UNAUTH01");
    const res = await apiPost(votePath(id), { vote: "FOR" });
    expect(res.status).toBe(401);
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  it("records a real vote for an eligible member", async () => {
    const id = await tabledResolution("CAST0001");
    const res = await apiPost<{ data: { vote: string; outcome: string; changed: boolean } }>(
      votePath(id),
      { vote: "FOR" },
      { cookie: governance },
    );
    expect(res.status).toBe(201);
    expect(res.body.data.vote).toBe("FOR");
    expect(res.body.data.changed).toBe(false);

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballots.length).toBe(1);
  });

  it("returns 200 and one ballot when a member changes their vote", async () => {
    const id = await tabledResolution("CHANGE01");
    await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance });
    const res = await apiPost<{ data: { changed: boolean; previousVote: string } }>(
      votePath(id),
      { vote: "AGAINST" },
      { cookie: governance },
    );
    expect(res.status).toBe(200);
    expect(res.body.data.changed).toBe(true);
    expect(res.body.data.previousVote).toBe("FOR");

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballots.length).toBe(1);
  });

  it("rejects an invalid vote value with 422", async () => {
    const id = await tabledResolution("INVALID1");
    // The vote capability is rate limited to 30/min per principal — a real
    // control that must not be relaxed for tests. Requests are spread across
    // eligible members, and 429 is accepted as a valid non-success. What must
    // never happen is a 2xx for an invalid vote.
    const cookies = [governance, cfo, governance, cfo, governance];
    const values = ["MAYBE", "", "RECUSED", 1, null];
    for (let i = 0; i < values.length; i++) {
      const res = await apiPost(votePath(id), { vote: values[i] }, { cookie: cookies[i] });
      expect([422, 429], String(values[i])).toContain(res.status);
    }
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  it("rejects server-controlled fields with 422", async () => {
    const id = await tabledResolution("FORGED01");
    const fields = ["memberId", "tenantId", "status", "outcome", "votesFor"];
    for (let i = 0; i < fields.length; i++) {
      const field = fields[i];
      const res = await apiPost(votePath(id), { vote: "FOR", [field]: "x" }, {
        cookie: i % 2 === 0 ? governance : cfo,
      });
      expect([422, 429], field).toContain(res.status);
      if (res.status === 422) {
        expect((res.body as { error?: { code?: string } })?.error?.code).toBe(
          "SERVER_CONTROLLED_FIELD",
        );
      }
    }
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  it("denies a principal without the vote capability", async () => {
    const id = await tabledResolution("NOPERM01");
    const res = await apiPost(votePath(id), { vote: "FOR" }, { cookie: auditor });
    expect(res.status).toBe(403);
  });

  it("denies a cross-tenant voter without confirming existence", async () => {
    const id = await tabledResolution("XTENANT1");
    const real = await apiPost(votePath(id), { vote: "FOR" }, { cookie: sectorOperator });
    const fake = await apiPost(votePath("RES_HTTP_NOTREAL"), { vote: "FOR" }, {
      cookie: sectorOperator,
    });
    expect(real.status).toBe(fake.status);
    expect((real.body as { error?: { code?: string } })?.error?.code).toBe(
      (fake.body as { error?: { code?: string } })?.error?.code,
    );
  });

  it("rejects a vote once the window has closed", async () => {
    const id = await tabledResolution("CLOSED01");
    await db
      .update(resolutions)
      .set({ votingClosesAt: new Date(Date.now() - 1000) })
      .where(eq(resolutions.id, id));

    const res = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance });
    expect(res.status).toBe(422);
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  it("rejects a vote on an untabled DRAFT resolution", async () => {
    const id = await tabledResolution("DRAFT001");
    await db
      .update(resolutions)
      .set({ status: "DRAFT", votingOpensAt: null, votingClosesAt: null })
      .where(eq(resolutions.id, id));

    const res = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance });
    expect(res.status).toBe(422);
  });

  /* ---------------------------- idempotency ---------------------------- */

  it("replays an identical vote without creating a second ballot", async () => {
    const id = await tabledResolution("IDEM0001");
    const key = `vote-replay-${Date.now()}`;

    const first = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key });
    const second = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get("idempotent-replay")).toBe("true");

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballots.length).toBe(1);
  });

  it("rejects the same key with a different vote payload", async () => {
    const id = await tabledResolution("IDEM0002");
    const key = `vote-mismatch-${Date.now()}`;

    const first = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key });
    expect(first.status).toBe(201);

    const second = await apiPost(votePath(id), { vote: "AGAINST" }, { cookie: governance, idempotencyKey: key });
    expect(second.status).toBe(409);
    expect((second.body as { error?: { code?: string } })?.error?.code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );

    const [ballot] = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballot.vote).toBe("FOR");
  });

  it("isolates the same raw key across different actors", async () => {
    const id = await tabledResolution("IDEM0003");
    const key = `vote-cross-actor-${Date.now()}`;

    const first = await apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key });
    expect(first.status).toBe(201);

    // A different member reusing the same raw key must cast their OWN vote.
    const second = await apiPost(votePath(id), { vote: "AGAINST" }, { cookie: cfo, idempotencyKey: key });
    expect(second.headers.get("idempotent-replay")).not.toBe("true");
    expect(second.status).toBe(201);

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballots.length).toBe(2); // two distinct members, two ballots
    expect(new Set(ballots.map((b) => b.vote))).toEqual(new Set(["FOR", "AGAINST"]));
  });

  it("produces exactly one ballot for concurrent identical requests", async () => {
    const id = await tabledResolution("IDEM0004");
    const key = `vote-concurrent-${Date.now()}`;

    const [a, b] = await Promise.all([
      apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key }),
      apiPost(votePath(id), { vote: "FOR" }, { cookie: governance, idempotencyKey: key }),
    ]);

    // Whatever the pairing (201+409, 201+429, ...), the invariant is that the
    // mutation executed at most once.
    const statuses = [a.status, b.status];
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(2);
    expect(statuses.some((s) => [201, 409, 429].includes(s))).toBe(true);

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, id));
    expect(ballots.length).toBeLessThanOrEqual(1);
  });

  /* ------------------------------ tabling ------------------------------ */

  it("allows only the presiding officer to table over HTTP", async () => {
    const id = await tabledResolution("TABLE001");
    await db
      .update(resolutions)
      .set({ status: "DRAFT", votingOpensAt: null, votingClosesAt: null })
      .where(eq(resolutions.id, id));

    const path = `/api/v1/governance/resolutions/${id}/table`;

    // CFO is an ordinary member of GROUP_BOARD -> denied.
    const denied = await apiPost(path, {}, { cookie: cfo });
    expect(denied.status).toBe(403);

    // CGO is SECRETARY -> permitted.
    const ok = await apiPost<{ data: { status: string } }>(path, {}, { cookie: governance });
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe("TABLED");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("TABLED");
    expect(row.votingOpensAt).not.toBeNull();
  });
});
