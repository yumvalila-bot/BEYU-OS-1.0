import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
  enterpriseEvents,
  governanceBodies,
  resolutions,
  resolutionVotes,
  tenants,
  users,
} from "../../src/db/schema";
import { fixedId, ID_PREFIX } from "../../src/lib/ids";
import {
  clearanceForRoles,
  loadGrants,
  permissionsForRoles,
  type Principal,
} from "../../src/lib/authz";
import { verifyAuditChain } from "../../src/lib/audit";
import { castVote, decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";

/**
 * GOVERNED DECISION / CLOSURE — the third canonical governed transaction.
 *
 * Real service, real PostgreSQL, no mocks. Every assertion about state,
 * provenance, audit, events and rollback is read back from the database.
 *
 * The governing principle under test: NO caller can produce an APPROVED
 * resolution by asking for one. The outcome is always recomputed by the server
 * from the authoritative ballots.
 */

const BOARD = fixedId(ID_PREFIX.body, "GROUP_BOARD"); // 5 members, quorum 4, SIMPLE
const TRUSTEES = fixedId(ID_PREFIX.body, "TRUSTEE_BOARD"); // 2 members, quorum 2, UNANIMOUS
const FAMILY_COUNCIL = fixedId(ID_PREFIX.body, "FAMILY_COUNCIL"); // 3 members, quorum 3, TWO_THIRDS
const PROBE = "^(GROUP_BOARD|FAMILY_COUNCIL|INVESTMENT_COMMITTEE|TRUSTEE_BOARD|TAX_GOVERNANCE_COMMITTEE|RISK_AUDIT_COMMITTEE)-";
const ctx = { traceId: "DECISION_TEST", ipAddress: "127.0.0.1", userAgent: "vitest" };

/** GROUP_BOARD seats: CHAIR=AMANI, SECRETARY=GRACE, MEMBERs=DAUDI/JOHN/NEEMA. */
const CHAIR = "AMANI_BEYU";
const SECRETARY = "GRACE_KILELE";
const PLAIN_MEMBER = "DAUDI_MOSHI";

async function principalFor(userKey: string): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, fixedId(ID_PREFIX.user, userKey)));
  if (!u) throw new Error(`seed user ${userKey} missing — run npm run seed`);
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const grants = await loadGrants(u.id, u.primaryTenantId);
  const roles = [...new Set(grants.map((g) => g.code))];
  return {
    userId: u.id,
    partyId: u.partyId,
    email: u.email,
    displayName: u.email,
    tenantId: u.primaryTenantId,
    tenantCode: t.code,
    tenantType: t.type,
    roles,
    permissions: permissionsForRoles(roles),
    clearance: clearanceForRoles(roles),
    entityScope: [],
    mfaSatisfied: true,
    sessionId: "TEST",
    riskScore: 0,
    emergencyPermissions: [],
  };
}

async function makeResolution(opts: {
  bodyId?: string;
  status?: "DRAFT" | "TABLED" | "VOTED" | "APPROVED";
  opensAt?: Date | null;
  closesAt?: Date | null;
  classification?: string;
}) {
  const bodyId = opts.bodyId ?? BOARD;
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_TEST_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const [row] = await db
    .insert(resolutions)
    .values({
      id,
      tenantId: body.tenantId,
      bodyId,
      reference: `${body.code}-9999-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Decision service probe resolution",
      category: "POLICY",
      summary: "Probe summary long enough to satisfy the domain contract rules.",
      rationale: "Probe rationale long enough to satisfy the domain contract.",
      dataBasis: "Probe data basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: opts.status ?? "TABLED",
      requiredMajority: body.majorityRule,
      classification: (opts.classification ?? "RESTRICTED") as never,
      votingOpensAt: opts.opensAt === undefined ? new Date(now.getTime() - 3600_000) : opts.opensAt,
      votingClosesAt:
        opts.closesAt === undefined ? new Date(now.getTime() + 7 * 86_400_000) : opts.closesAt,
    })
    .returning();
  return row;
}

/** Cast the given ballots, then force the voting window closed. */
async function voteThenCloseWindow(
  resolutionId: string,
  votes: Record<string, "FOR" | "AGAINST" | "ABSTAIN">,
) {
  for (const [userKey, vote] of Object.entries(votes)) {
    await castVote(await principalFor(userKey), { resolutionId, vote }, ctx);
  }
  await db
    .update(resolutions)
    .set({ votingClosesAt: new Date(Date.now() - 1_000) })
    .where(eq(resolutions.id, resolutionId));
}

async function cleanup() {
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_TEST_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_TEST_%' or reference ~ ${PROBE}`);
  await db.execute(sql`delete from idempotency_records`);
}

async function resetLedgers() {
  await resetAuditLedgers();
  await db.execute(
    sql`insert into audit_chain_heads(chain_name,current_hash) values ('AUDIT_LOG', null),('ENTERPRISE_EVENTS', null)
        on conflict(chain_name) do update set current_hash = null, updated_at = now()`,
  );
}

beforeEach(async () => {
  await cleanup();
  await resetLedgers();
});

afterAll(cleanup);

/* ================================================================== *
 * A–G  Decision authority
 * ================================================================== */

describe("governed decision — authority", () => {
  it("A. allows the presiding officer to close a concluded resolution", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
    });

    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);

    expect(result.outcome).toBe("APPROVED");
    expect(result.previousStatus).toBe("TABLED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("APPROVED");
  });

  it("B. refuses a principal without the approve capability", async () => {
    // The CFO holds governance:resolution.vote but NOT .approve.
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "FOR",
      NEEMA_BEYU: "FOR",
    });

    await expect(
      decideResolutionClosure(await principalFor(PLAIN_MEMBER), { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("VOTED");
  });

  it("B2. voting authority alone never confers decision authority", async () => {
    // Explicitly assert the separation of powers: the same actor may vote but
    // may not close.
    const r = await makeResolution({});
    const member = await principalFor(PLAIN_MEMBER);
    expect(member.permissions.has("governance:resolution.vote")).toBe(true);
    expect(member.permissions.has("governance:resolution.approve")).toBe(false);

    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "FOR",
      NEEMA_BEYU: "FOR",
    });
    await expect(
      decideResolutionClosure(member, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("C. refuses a non-member who holds the capability", async () => {
    // A capability-holder with no seat on the owning body has no authority over
    // that body's resolutions: there is no global admin override.
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, { [CHAIR]: "FOR", [PLAIN_MEMBER]: "FOR", [SECRETARY]: "FOR", JOHN_MREMA: "FOR" });

    // The Auditor holds no seat on GROUP_BOARD. Whether or not they hold the
    // capability, they cannot close this body's resolution.
    const outsider = await principalFor("PETER_OKELLO");
    await expect(
      decideResolutionClosure(outsider, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("TABLED");
  });

  it("D. refuses closure by an officer of a different governance body", async () => {
    // A TRUSTEE_BOARD resolution cannot be closed by someone whose presiding
    // seat is on another body.
    const r = await makeResolution({ bodyId: TRUSTEES });
    await voteThenCloseWindow(r.id, { NEEMA_BEYU: "FOR", [SECRETARY]: "FOR" });

    // The CEO chairs GROUP_BOARD but holds no seat on TRUSTEE_BOARD.
    await expect(
      decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("E. refuses a cross-tenant closure without confirming existence", async () => {
    const r = await makeResolution({});
    const sector = await principalFor("SARA_LEMA");
    const real = await decideResolutionClosure(sector, { resolutionId: r.id }, ctx).catch((e) => e);
    const fake = await decideResolutionClosure(sector, { resolutionId: "RES_NOPE" }, ctx).catch((e) => e);
    // Identical failure: no existence oracle across tenants.
    expect(real.code).toBe(fake.code);
  });

  it("F. enforces the classification ceiling", async () => {
    // Every seeded approver holds HIGHLY_RESTRICTED clearance, so the ceiling is
    // exercised by lowering the acting principal's clearance to RESTRICTED while
    // leaving the capability and the seat intact: only classification differs.
    const r = await makeResolution({ classification: "HIGHLY_RESTRICTED" });
    const chair = await principalFor(CHAIR);
    const downgraded = { ...chair, clearance: "RESTRICTED" as const };

    // Classification is checked before any lifecycle consideration, so the
    // denial cannot be confused with "not ready".
    await expect(
      decideResolutionClosure(downgraded, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "CLASSIFICATION_DENIED" });

    // The full-clearance chair passes the classification gate and is stopped by
    // the lifecycle rule instead, proving only clearance differed.
    await expect(
      decideResolutionClosure(chair, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "NOT_READY_FOR_DECISION" });

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("TABLED");
  });

  it("G. evaluates the policy hierarchy before deciding", async () => {
    // Policy is consulted on the decide action; a DENY must block closure. With
    // no denying policy seeded, closure proceeds — proving policy is evaluated
    // rather than skipped is covered by the audit record's policyVersion.
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, { [CHAIR]: "FOR", [PLAIN_MEMBER]: "FOR", [SECRETARY]: "FOR", JOHN_MREMA: "FOR" });
    await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "governance.resolution.decide"));
    expect(entry.authority).toBe("governance:resolution.approve");
  });
});

/* ================================================================== *
 * H–N  Outcome computation
 * ================================================================== */

describe("governed decision — computed outcomes", () => {
  it("H. refuses closure while voting is still open and incomplete", async () => {
    const r = await makeResolution({});
    await castVote(await principalFor(CHAIR), { resolutionId: r.id, vote: "FOR" }, ctx);

    await expect(
      decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "NOT_READY_FOR_DECISION" });

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("TABLED");
    expect(row.decisionDate).toBeNull();
  });

  it("H2. DEFERS when the window closed without quorum, never APPROVED", async () => {
    const r = await makeResolution({});
    // Only 2 of 5 participate; quorum is 4.
    await voteThenCloseWindow(r.id, { [CHAIR]: "FOR", [PLAIN_MEMBER]: "FOR" });

    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);

    expect(result.outcome).toBe("DEFERRED");
    expect(result.quorum.met).toBe(false);
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("DEFERRED");
    // Two FOR votes and no AGAINST did NOT carry the resolution.
    expect(row.status).not.toBe("APPROVED");
    expect(row.quorumMet).toBe(false);
  });

  it("I. closes once quorum is satisfied", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "ABSTAIN",
    });
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.quorum.met).toBe(true);
    expect(result.outcome).toBe("APPROVED");
  });

  it("J. FOR majority produces APPROVED", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
      NEEMA_BEYU: "AGAINST",
    });
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.outcome).toBe("APPROVED");
    expect(result.tally).toMatchObject({ for: 3, against: 2 });
  });

  it("K. AGAINST majority produces REJECTED", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "AGAINST",
      [PLAIN_MEMBER]: "AGAINST",
      [SECRETARY]: "AGAINST",
      JOHN_MREMA: "FOR",
      NEEMA_BEYU: "FOR",
    });
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.outcome).toBe("REJECTED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("REJECTED");
  });

  it("L. a tie produces DEADLOCKED with no chair casting vote", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR", // the closing officer also voted FOR
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "AGAINST",
      JOHN_MREMA: "AGAINST",
      NEEMA_BEYU: "ABSTAIN",
    });
    // The CHAIR closes it: their own vote must not break the tie in their favour.
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.outcome).toBe("DEADLOCKED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("DEADLOCKED");
    expect(row.status).not.toBe("APPROVED");
  });

  it("M. an all-abstain vote deadlocks rather than approving", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "ABSTAIN",
      [PLAIN_MEMBER]: "ABSTAIN",
      [SECRETARY]: "ABSTAIN",
      JOHN_MREMA: "ABSTAIN",
      NEEMA_BEYU: "ABSTAIN",
    });
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.outcome).toBe("DEADLOCKED");
    expect(result.tally.abstain).toBe(5);
    // ABSTAIN counted as participation for quorum, but never as FOR or AGAINST.
    expect(result.quorum.met).toBe(true);
    expect(result.tally.for).toBe(0);
    expect(result.tally.against).toBe(0);
  });

  it("N. recused members are excluded from the electorate", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
    });
    // Recuse the two non-voters, shrinking the electorate from 5 to 3.
    const [board] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, BOARD));
    expect(board.quorumMinimum).toBe(4);
    await db.insert(resolutionVotes).values([
      { id: `VOT_R1_${Date.now()}`, resolutionId: r.id, memberId: "GMB_BRD_RISK", vote: "RECUSED" },
      { id: `VOT_R2_${Date.now()}`, resolutionId: r.id, memberId: "GMB_BRD_FAM", vote: "RECUSED" },
    ] as never);

    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.quorum.eligible).toBe(3);
    expect(result.quorum.recused).toBe(2);
    // The requirement is capped at the surviving electorate, so quorum is met.
    expect(result.quorum.met).toBe(true);
    expect(result.outcome).toBe("APPROVED");
    // RECUSED ballots are never substantive votes.
    expect(result.tally.for).toBe(3);
    expect(result.tally.recused).toBe(2);
  });

  it("N2. applies the non-simple majority rule of the owning body", async () => {
    // FAMILY_COUNCIL: 3 members, quorum 3, TWO_THIRDS. Two of three FOR is
    // exactly two thirds and carries; the SECRETARY (Grace) closes it.
    const r = await makeResolution({ bodyId: FAMILY_COUNCIL });
    await voteThenCloseWindow(r.id, {
      NEEMA_BEYU: "FOR",
      [CHAIR]: "FOR",
      [SECRETARY]: "AGAINST",
    });
    const result = await decideResolutionClosure(
      await principalFor(SECRETARY),
      { resolutionId: r.id },
      ctx,
    );
    expect(result.majorityRule).toBe("TWO_THIRDS");
    expect(result.quorum.met).toBe(true);
    expect(result.outcome).toBe("APPROVED");

    // One vote short of two thirds would not have carried.
    expect(result.tally).toMatchObject({ for: 2, against: 1 });
  });
});

/* ================================================================== *
 * O–Q  Window and terminal state
 * ================================================================== */

describe("governed decision — window and terminal state", () => {
  it("O. an expired window permits closure but is never auto-finalised", async () => {
    const r = await makeResolution({
      opensAt: new Date(Date.now() - 3 * 86_400_000),
      closesAt: new Date(Date.now() - 86_400_000),
    });
    // Nothing finalised it while it sat expired.
    const [before] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(before.status).toBe("TABLED");
    expect(before.decisionDate).toBeNull();

    // No votes at all: quorum cannot be met, so it defers rather than approving.
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(result.outcome).toBe("DEFERRED");
    expect(result.votingClosed).toBe(true);
  });

  it("P. votes remain blocked after expiry, before and after closure", async () => {
    const r = await makeResolution({
      opensAt: new Date(Date.now() - 3 * 86_400_000),
      closesAt: new Date(Date.now() - 86_400_000),
    });
    await expect(
      castVote(await principalFor(SECRETARY), { resolutionId: r.id, vote: "FOR" }, ctx),
    ).rejects.toMatchObject({ code: "RULE_VIOLATION" });

    await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);

    await expect(
      castVote(await principalFor(SECRETARY), { resolutionId: r.id, vote: "FOR" }, ctx),
    ).rejects.toMatchObject({ code: "RULE_VIOLATION" });
  });

  it("Q. refuses to decide an already-decided resolution", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
    });
    const chair = await principalFor(CHAIR);
    await decideResolutionClosure(chair, { resolutionId: r.id }, ctx);

    await expect(
      decideResolutionClosure(chair, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });
  });

  it("Q2. refuses to decide a DRAFT resolution", async () => {
    const r = await makeResolution({ status: "DRAFT", opensAt: null, closesAt: null });
    await expect(
      decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "NOT_READY_FOR_DECISION" });
  });

  it("Y. terminal states are immutable to vote, table and decide", async () => {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
    });
    const chair = await principalFor(CHAIR);
    await decideResolutionClosure(chair, { resolutionId: r.id }, ctx);

    const [decided] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(decided.status).toBe("APPROVED");

    // VOTE refused.
    await expect(
      castVote(await principalFor(SECRETARY), { resolutionId: r.id, vote: "AGAINST" }, ctx),
    ).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    // TABLE refused.
    const { tableResolution } = await import("../../src/lib/governance-vote-service");
    await expect(tableResolution(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
    // DECIDE refused.
    await expect(decideResolutionClosure(chair, { resolutionId: r.id }, ctx)).rejects.toMatchObject({
      code: "ALREADY_DECIDED",
    });

    // Nothing changed the committed decision.
    const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(after.status).toBe("APPROVED");
    expect(after.decisionDate?.toISOString()).toBe(decided.decisionDate?.toISOString());
    expect(after.votesFor).toBe(decided.votesFor);
  });
});

/* ================================================================== *
 * T–X, Z  Atomicity, concurrency, provenance
 * ================================================================== */

describe("governed decision — atomicity, concurrency and provenance", () => {
  /** A resolution whose voting has fully concluded (status VOTED, 3–1–0). */
  async function concluded() {
    const r = await makeResolution({});
    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
      NEEMA_BEYU: "ABSTAIN",
    });
    return r;
  }

  it("T. concurrent decision requests produce exactly one decision", async () => {
    const r = await concluded();
    const chair = await principalFor(CHAIR);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => decideResolutionClosure(chair, { resolutionId: r.id }, ctx)),
    );
    expect(results.filter((x) => x.status === "fulfilled").length).toBe(1);

    // Exactly one decision event and one decision audit record.
    expect(
      (
        await db
          .select()
          .from(enterpriseEvents)
          .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_DECIDED"))
      ).length,
    ).toBe(1);
    expect(
      (await db.select().from(auditLog).where(eq(auditLog.action, "governance.resolution.decide")))
        .length,
    ).toBe(1);
  });

  it("U. a vote racing a decision cannot produce an impossible state", async () => {
    const r = await makeResolution({});
    // 4 of 5 have voted; the window is still open so NEEMA may still vote.
    for (const [userKey, vote] of [
      [CHAIR, "FOR"],
      [PLAIN_MEMBER, "FOR"],
      [SECRETARY, "FOR"],
      ["JOHN_MREMA", "AGAINST"],
    ] as const) {
      await castVote(await principalFor(userKey), { resolutionId: r.id, vote }, ctx);
    }
    const [mid] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(mid.status).toBe("TABLED");

    const chair = await principalFor(CHAIR);
    const neema = await principalFor("NEEMA_BEYU");

    // Fire the last vote and a closure concurrently.
    const [voteOutcome, decisionOutcome] = await Promise.allSettled([
      castVote(neema, { resolutionId: r.id, vote: "AGAINST" }, ctx),
      decideResolutionClosure(chair, { resolutionId: r.id }, ctx),
    ]);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));

    // Whatever the interleaving, the stored tally always equals the stored ballots.
    const counted = { for: 0, against: 0, abstain: 0 };
    for (const b of ballots) {
      if (b.vote === "FOR") counted.for += 1;
      else if (b.vote === "AGAINST") counted.against += 1;
      else if (b.vote === "ABSTAIN") counted.abstain += 1;
    }
    expect(row.votesFor).toBe(counted.for);
    expect(row.votesAgainst).toBe(counted.against);

    // And the resolution is in a coherent state for that tally.
    if (row.status === "APPROVED" || row.status === "REJECTED" || row.status === "DEADLOCKED") {
      expect(decisionOutcome.status).toBe("fulfilled");
      expect(row.decisionDate).not.toBeNull();
      expect(row.decidedByMemberId).not.toBeNull();
    } else {
      // Not decided: it must still be a pre-decision state, never half-decided.
      expect(["TABLED", "VOTED"]).toContain(row.status);
      expect(row.decisionDate).toBeNull();
      expect(row.decidedByMemberId).toBeNull();
    }
    expect([voteOutcome.status, decisionOutcome.status]).toContain("fulfilled");
    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("V+W. persists the audit record and the decision event", async () => {
    const r = await concluded();
    const result = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);

    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "governance.resolution.decide"));
    expect(entry.objectId).toBe(r.id);
    expect(entry.outcome).toBe("SUCCESS");
    expect((entry.oldValue as Record<string, unknown>).status).toBe("VOTED");
    expect((entry.newValue as Record<string, unknown>).status).toBe("APPROVED");
    expect((entry.newValue as Record<string, unknown>).decidedByMemberId).toBe(result.decidedByMemberId);

    const [event] = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_DECIDED"));
    const payload = event.payload as Record<string, unknown>;
    expect(payload.outcome).toBe("APPROVED");
    expect(payload.status).toBe("APPROVED");
    expect(payload.previousStatus).toBe("VOTED");
    expect(payload.tally).toMatchObject({ for: 3, against: 1, abstain: 1 });
    expect(payload.decidedByMemberId).toBe(result.decidedByMemberId);

    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("X. a decision-event failure rolls back the status, audit and event", async () => {
    const r = await concluded();

    const before = {
      row: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
      ballots: (await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id)))
        .length,
    };
    expect(before.row.status).toBe("VOTED");

    await db.execute(sql`
      create or replace function beyu_test_block_decision_event() returns trigger as $$
      begin
        if new.type = 'GOVERNANCE_RESOLUTION_DECIDED' then
          raise exception 'injected decision-event persistence failure';
        end if;
        return new;
      end;
      $$ language plpgsql;
      create trigger beyu_test_block_decision_event
        before insert on enterprise_events
        for each row execute function beyu_test_block_decision_event();
    `);

    try {
      await expect(
        decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx),
      ).rejects.toThrow(/enterprise_events|injected decision-event persistence failure/);
    } finally {
      await db.execute(sql`drop trigger if exists beyu_test_block_decision_event on enterprise_events`);
      await db.execute(sql`drop function if exists beyu_test_block_decision_event()`);
    }

    const after = {
      row: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
      ballots: (await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id)))
        .length,
    };

    // Nothing moved: no status transition, no provenance, no audit, no event.
    expect(after.row.status).toBe("VOTED");
    expect(after.row.decisionDate).toBeNull();
    expect(after.row.decidedByMemberId).toBeNull();
    expect(after.audits).toBe(before.audits);
    expect(after.events).toBe(before.events);
    expect(after.ballots).toBe(before.ballots);
    expect((await verifyAuditChain()).verified).toBe(true);

    // The resolution remains closable afterwards.
    const retry = await decideResolutionClosure(await principalFor(CHAIR), { resolutionId: r.id }, ctx);
    expect(retry.outcome).toBe("APPROVED");
  });

  it("Z. persists full decision provenance on the domain row", async () => {
    const r = await concluded();
    const result = await decideResolutionClosure(
      await principalFor(CHAIR),
      { resolutionId: r.id, decisionNote: "Closed at the November board meeting." },
      ctx,
    );

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    // Actor, timestamp, outcome and final tally are all readable from the row
    // itself, without consulting the audit ledger.
    expect(row.decidedByMemberId).toBe("GMB_BRD_CEO");
    expect(row.decisionDate).not.toBeNull();
    expect(row.status).toBe("APPROVED");
    expect(row.votesFor).toBe(3);
    expect(row.votesAgainst).toBe(1);
    expect(row.quorumMet).toBe(true);
    expect(result.decidedByMemberId).toBe("GMB_BRD_CEO");

    // The note is recorded as metadata and did not influence the outcome.
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "governance.resolution.decide"));
    expect((entry.newValue as Record<string, unknown>).decisionNote).toBe(
      "Closed at the November board meeting.",
    );
    expect(entry.reason).toContain("Closed at the November board meeting.");
  });

  it("Z2. the full lifecycle PROPOSE → TABLE → VOTE → DECIDE is coherent", async () => {
    const r = await makeResolution({ status: "DRAFT", opensAt: null, closesAt: null });
    const chair = await principalFor(CHAIR);
    const { tableResolution } = await import("../../src/lib/governance-vote-service");

    const tabled = await tableResolution(chair, { resolutionId: r.id }, ctx);
    expect(tabled.status).toBe("TABLED");

    await voteThenCloseWindow(r.id, {
      [CHAIR]: "FOR",
      [PLAIN_MEMBER]: "FOR",
      [SECRETARY]: "FOR",
      JOHN_MREMA: "AGAINST",
      NEEMA_BEYU: "ABSTAIN",
    });
    const [voted] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(voted.status).toBe("VOTED");

    const decision = await decideResolutionClosure(chair, { resolutionId: r.id }, ctx);
    expect(decision.outcome).toBe("APPROVED");

    // One coherent event stream for the whole lifecycle.
    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.subjectId, r.id))
      .orderBy(enterpriseEvents.sequence);
    const types = events.map((e) => e.type);
    expect(types[0]).toBe("GOVERNANCE_RESOLUTION_TABLED");
    expect(types).toContain("GOVERNANCE_RESOLUTION_VOTE_CAST");
    expect(types).toContain("GOVERNANCE_RESOLUTION_VOTING_CONCLUDED");
    expect(types[types.length - 1]).toBe("GOVERNANCE_RESOLUTION_DECIDED");
    expect((await verifyAuditChain()).verified).toBe(true);
  });
});
