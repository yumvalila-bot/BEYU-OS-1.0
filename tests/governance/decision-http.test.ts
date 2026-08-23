import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, pool } from "../../src/db";
import { auditLog, enterpriseEvents, governanceBodies, resolutions } from "../../src/db/schema";
import { apiPost, login, serverAvailable } from "../helpers/http";

/**
 * END-TO-END transport tests for the decision/closure mutation.
 *
 * Drives the real running server, so authentication, the forgery guards, the
 * error taxonomy and DB-backed idempotency are proven by execution.
 *
 * The central security property under test: no request body can manufacture an
 * APPROVED resolution. The server always recomputes the outcome.
 */

const available = await serverAvailable();

let governance = ""; // Grace — SECRETARY of GROUP_BOARD, holds .approve
let chair = ""; // Amani — CHAIR of GROUP_BOARD, also holds .approve
let cfo = ""; // Daudi — MEMBER, holds .vote but NOT .approve
let auditor = ""; // Peter — no seat on GROUP_BOARD

/**
 * The rate limiter is keyed by principal + capability. Rather than weakening a
 * production security control for the tests, the request-heavy cases are driven
 * by the CHAIR and the rest by the SECRETARY: both are legitimate presiding
 * officers of GROUP_BOARD, so the split is realistic as well as isolating.
 */

const BOARD = "GOV_GROUP_BOARD";

/**
 * The audit ledger and event stream are append-only and are NOT truncated by
 * this suite (other suites and the denial path write to them too). Resolution
 * ids are therefore made unique per run, so per-resolution assertions cannot be
 * polluted by rows left behind by an earlier run.
 */
const RUN = Math.random().toString(36).slice(2, 6).toUpperCase();

/** GROUP_BOARD member ids, used to seed a concluded ballot set directly. */
const SEATS = ["GMB_BRD_CEO", "GMB_BRD_CFO", "GMB_BRD_CGO", "GMB_BRD_RISK", "GMB_BRD_FAM"];

async function cleanup() {
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_DEC_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_DEC_%'`);
  await db.execute(sql`delete from idempotency_records`);
}

/**
 * Create a resolution whose voting has concluded with the given ballots and a
 * closed window, ready to be decided.
 */
async function concludedResolution(
  suffix: string,
  votes: Record<string, "FOR" | "AGAINST" | "ABSTAIN"> = {
    GMB_BRD_CEO: "FOR",
    GMB_BRD_CFO: "FOR",
    GMB_BRD_CGO: "FOR",
    GMB_BRD_RISK: "AGAINST",
    GMB_BRD_FAM: "ABSTAIN",
  },
) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
  const id = `RES_DEC_${RUN}_${suffix}`;
  const now = new Date();
  const tally = { for: 0, against: 0, abstain: 0 };
  for (const v of Object.values(votes)) {
    if (v === "FOR") tally.for += 1;
    else if (v === "AGAINST") tally.against += 1;
    else tally.abstain += 1;
  }
  const allVoted = SEATS.every((s) => s in votes);

  await db.insert(resolutions).values({
    id,
    tenantId: body.tenantId,
    bodyId: BOARD,
    reference: `GROUP_BOARD-7788-${RUN}${suffix.slice(0, 3)}`,
    title: "HTTP decision probe resolution",
    category: "POLICY",
    summary: "HTTP probe summary long enough to satisfy the domain contract.",
    rationale: "HTTP probe rationale long enough to satisfy the contract.",
    dataBasis: "Probe basis.",
    consequences: "Probe consequences.",
    proposedBy: "CHIEF_GOVERNANCE_OFFICER",
    // Voting has concluded but nothing has been decided.
    status: allVoted ? "VOTED" : "TABLED",
    requiredMajority: body.majorityRule,
    classification: "RESTRICTED",
    votesFor: tally.for,
    votesAgainst: tally.against,
    votesAbstain: tally.abstain,
    quorumMet: tally.for + tally.against + tally.abstain >= body.quorumMinimum,
    votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
    // Window already closed, so closure is legitimate.
    votingClosesAt: new Date(now.getTime() - 3600_000),
  });

  for (const [memberId, vote] of Object.entries(votes)) {
    await db.execute(sql`
      insert into resolution_votes (id, resolution_id, member_id, vote)
      values (${`VOT_DEC_${RUN}_${suffix}_${memberId}`}, ${id}, ${memberId}, ${vote})`);
  }
  return id;
}

/** Narrow the API envelope to the decision result. */
function decisionOf(res: { body: unknown }) {
  return (res.body as { data: { outcome: string; decidedByMemberId: string; status: string } }).data;
}

const decisionPath = (id: string) => `/api/v1/governance/resolutions/${id}/decision`;

beforeAll(async () => {
  if (!available) return;
  await cleanup();
  governance = await login("governance@beyu.os");
  chair = await login("ceo@beyu.os");
  cfo = await login("cfo@beyu.os");
  auditor = await login("auditor@beyu.os");
}, 240_000);

beforeEach(async () => {
  if (available) await cleanup();
});

afterAll(async () => {
  if (available) await cleanup();
  await pool.end().catch(() => undefined);
});

describe.skipIf(!available)("decision mutation over HTTP", () => {
  it("rejects an unauthenticated decision with 401", async () => {
    const id = await concludedResolution("UNAUTH01");
    const res = await apiPost(decisionPath(id), {});
    expect(res.status).toBe(401);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("VOTED");
  });

  it("records a real decision for the presiding officer", async () => {
    const id = await concludedResolution("DECIDE01");
    const res = await apiPost(decisionPath(id), {}, { cookie: governance });

    expect(res.status).toBe(200);
    expect(decisionOf(res).outcome).toBe("APPROVED");

    // Verified in the database, not merely in the response.
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("APPROVED");
    expect(row.decidedByMemberId).toBe("GMB_BRD_CGO");
    expect(row.decisionDate).not.toBeNull();
    expect(row.votesFor).toBe(3);

    // Audit and durable event both persisted.
    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, id), eq(auditLog.action, "governance.resolution.decide")));
    expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(1);

    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.subjectId, id));
    expect(events.filter((e) => e.type === "GOVERNANCE_RESOLUTION_DECIDED").length).toBe(1);
  });

  it("denies a member who lacks the approve capability with 403", async () => {
    const id = await concludedResolution("NOCAP001");
    const res = await apiPost(decisionPath(id), {}, { cookie: cfo });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("VOTED");
  });

  it("denies a non-member of the body with 403", async () => {
    const id = await concludedResolution("NOSEAT01");
    const res = await apiPost(decisionPath(id), {}, { cookie: auditor });
    expect(res.status).toBe(403);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("VOTED");
  });

  it("returns 422 NOT_READY_FOR_DECISION while voting is still open", async () => {
    const id = await concludedResolution("NOTREADY", { GMB_BRD_CEO: "FOR" });
    // Reopen the window: one vote cast, four outstanding.
    await db
      .update(resolutions)
      .set({ votingClosesAt: new Date(Date.now() + 86_400_000) })
      .where(eq(resolutions.id, id));

    const res = await apiPost(decisionPath(id), {}, { cookie: governance });
    expect(res.status).toBe(422);
    expect((res.body as { error?: { code?: string } })?.error?.code).toBe("NOT_READY_FOR_DECISION");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("TABLED");
    expect(row.decisionDate).toBeNull();
  });

  it("returns 409 ALREADY_DECIDED on a second decision", async () => {
    const id = await concludedResolution("ALREADY1");
    const first = await apiPost(decisionPath(id), {}, { cookie: governance });
    expect(first.status).toBe(200);

    const second = await apiPost(decisionPath(id), {}, { cookie: governance });
    expect(second.status).toBe(409);
    expect((second.body as { error?: { code?: string } })?.error?.code).toBe("ALREADY_DECIDED");
  });

  it("returns 404 for a resolution outside the caller's scope", async () => {
    const res = await apiPost(decisionPath("RES_DEC_NOPE"), {}, { cookie: governance });
    expect(res.status).toBe(404);
  });

  it("defers rather than approving when quorum was never met", async () => {
    // Only two of five participated; quorum is four.
    const id = await concludedResolution("NOQUORUM", {
      GMB_BRD_CEO: "FOR",
      GMB_BRD_CFO: "FOR",
    });
    const res = await apiPost(decisionPath(id), {}, { cookie: governance });

    expect(res.status).toBe(200);
    expect(decisionOf(res).outcome).toBe("DEFERRED");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("DEFERRED");
    // Two FOR and zero AGAINST did NOT approve it.
    expect(row.status).not.toBe("APPROVED");
    expect(row.quorumMet).toBe(false);
  });

  /* ---- Forgery: the outcome can never be supplied by the client ---- */

  it("rejects a forged outcome with 422 and decides nothing", async () => {
    const id = await concludedResolution("FORGE001", {
      GMB_BRD_CEO: "AGAINST",
      GMB_BRD_CFO: "AGAINST",
      GMB_BRD_CGO: "AGAINST",
      GMB_BRD_RISK: "FOR",
      GMB_BRD_FAM: "FOR",
    });

    for (const forged of [
      { outcome: "APPROVED" },
      { status: "APPROVED" },
      { decision: "APPROVED" },
      { finalOutcome: "APPROVED" },
      { quorumResult: { met: true } },
      { approvalResult: "APPROVED" },
      { voteCount: 99 },
      { tally: { for: 99, against: 0, abstain: 0 } },
    ]) {
      const res = await apiPost(decisionPath(id), forged, { cookie: chair });
      expect(res.status).toBe(422);
      expect((res.body as { error?: { code?: string } })?.error?.code).toBe(
        "SERVER_CONTROLLED_FIELD",
      );
    }

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("VOTED");
    expect(row.decisionDate).toBeNull();
  });

  it("computes REJECTED from the ballots even when the caller wants approval", async () => {
    // The ballots reject the resolution. The caller may only ask for closure —
    // and closure produces the mathematically correct result.
    const id = await concludedResolution("COMPUTE1", {
      GMB_BRD_CEO: "AGAINST",
      GMB_BRD_CFO: "AGAINST",
      GMB_BRD_CGO: "AGAINST",
      GMB_BRD_RISK: "FOR",
      GMB_BRD_FAM: "FOR",
    });
    const res = await apiPost(
      decisionPath(id),
      { decisionNote: "The board wishes to approve this." },
      { cookie: governance },
    );

    expect(res.status).toBe(200);
    expect(decisionOf(res).outcome).toBe("REJECTED");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("REJECTED");
  });

  it("rejects an unknown field with 422", async () => {
    const id = await concludedResolution("STRICT01");
    const res = await apiPost(decisionPath(id), { wildcard: true }, { cookie: governance });
    expect(res.status).toBe(422);
  });

  /* ---- R, S: DB-backed idempotency ---- */

  it("R. replays an identical decision without deciding twice", async () => {
    const id = await concludedResolution("IDEMDEC1");
    const key = `decision-replay-${Date.now()}`;

    const first = await apiPost(decisionPath(id), {}, { cookie: governance, idempotencyKey: key });
    const second = await apiPost(decisionPath(id), {}, { cookie: governance, idempotencyKey: key });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("idempotent-replay")).toBe("true");
    // Identical logical result, not a second decision.
    expect(decisionOf(second).outcome).toBe(decisionOf(first).outcome);

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectId, id), eq(auditLog.action, "governance.resolution.decide")));
    expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(1);

    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, id));
    expect(events.filter((e) => e.type === "GOVERNANCE_RESOLUTION_DECIDED").length).toBe(1);
  });

  it("S. rejects the same key with a different payload", async () => {
    const id = await concludedResolution("IDEMDEC2");
    const key = `decision-mismatch-${Date.now()}`;

    const first = await apiPost(
      decisionPath(id),
      { decisionNote: "First note." },
      { cookie: governance, idempotencyKey: key },
    );
    expect(first.status).toBe(200);

    const second = await apiPost(
      decisionPath(id),
      { decisionNote: "A different note." },
      { cookie: governance, idempotencyKey: key },
    );
    expect(second.status).toBe(409);
    expect((second.body as { error?: { code?: string } })?.error?.code).toBe(
      "IDEMPOTENCY_KEY_REUSED",
    );
  });

  it("T. concurrent decision requests decide exactly once", async () => {
    const id = await concludedResolution("CONCUR01");

    const results = await Promise.all(
      Array.from({ length: 4 }, () => apiPost(decisionPath(id), {}, { cookie: chair })),
    );
    expect(results.filter((r) => r.status === 200).length).toBe(1);
    // The losers report a governed conflict or a rate limit, never a 500.
    for (const r of results.filter((r) => r.status !== 200)) {
      expect([409, 429]).toContain(r.status);
    }
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, id));
    expect(row.status).toBe("APPROVED");

    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, id));
    expect(events.filter((e) => e.type === "GOVERNANCE_RESOLUTION_DECIDED").length).toBe(1);
  });
});
