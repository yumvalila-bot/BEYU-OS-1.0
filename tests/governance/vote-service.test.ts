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
import { verifyAuditChain, withAuditTransaction } from "../../src/lib/audit";
import { GovernanceError } from "../../src/lib/governance";
import { castVote, tableResolution } from "../../src/lib/governance-vote-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";

/**
 * Governed vote transaction — real service, real PostgreSQL, no mocks.
 *
 * Every assertion about persistence, quorum, audit, events and rollback is read
 * back from the database after the transaction commits.
 */

const BOARD = fixedId(ID_PREFIX.body, "GROUP_BOARD"); // 5 members, quorum 4, SIMPLE
const TRUSTEES = fixedId(ID_PREFIX.body, "TRUSTEE_BOARD"); // 2 members, quorum 2, UNANIMOUS
const PROBE = "^(GROUP_BOARD|FAMILY_COUNCIL|INVESTMENT_COMMITTEE|TRUSTEE_BOARD|TAX_GOVERNANCE_COMMITTEE|RISK_AUDIT_COMMITTEE)-";
const ctx = { traceId: "VOTE_TEST", ipAddress: "127.0.0.1", userAgent: "vitest" };

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

/** Insert a resolution directly so tests control its exact lifecycle state. */
async function makeResolution(opts: {
  bodyId?: string;
  status?: "DRAFT" | "TABLED" | "APPROVED";
  opensAt?: Date | null;
  closesAt?: Date | null;
  classification?: string;
  suffix?: string;
}) {
  const bodyId = opts.bodyId ?? BOARD;
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_TEST_${opts.suffix ?? Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const [row] = await db
    .insert(resolutions)
    .values({
      id,
      tenantId: body.tenantId,
      bodyId,
      reference: `${body.code}-9999-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Vote service probe resolution",
      category: "POLICY",
      summary: "Probe summary long enough to satisfy the domain contract rules.",
      rationale: "Probe rationale long enough to satisfy the domain contract.",
      dataBasis: "Probe data basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: opts.status ?? "TABLED",
      requiredMajority: body.majorityRule,
      classification: (opts.classification ?? "RESTRICTED") as never,
      votingOpensAt:
        opts.opensAt === undefined ? new Date(now.getTime() - 3600_000) : opts.opensAt,
      votingClosesAt:
        opts.closesAt === undefined ? new Date(now.getTime() + 7 * 86_400_000) : opts.closesAt,
    })
    .returning();
  return row;
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

describe("governed vote — membership and authorisation", () => {
  it("rejects a principal without the vote permission", async () => {
    // The auditor is a seated RISK_AUDIT member but holds no vote capability.
    const auditor = await principalFor("PETER_OKELLO");
    expect(auditor.permissions.has("governance:resolution.vote")).toBe(false);
    const r = await makeResolution({ bodyId: fixedId(ID_PREFIX.body, "RISK_AUDIT_COMMITTEE") });

    await expect(castVote(auditor, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  it("rejects a permitted principal who is NOT a member of the owning body", async () => {
    // The HCM director holds no governance seat anywhere.
    const hcm = await principalFor("ASHA_NDULU");
    const r = await makeResolution({});
    await expect(castVote(hcm, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toBeInstanceOf(
      GovernanceError,
    );
  });

  it("enforces membership of the SPECIFIC body, not governance membership generally", async () => {
    // The risk officer sits on GROUP_BOARD but NOT on TRUSTEE_BOARD.
    const risk = await principalFor("JOHN_MREMA");
    expect(risk.permissions.has("governance:resolution.vote")).toBe(true);

    const trusteeRes = await makeResolution({ bodyId: TRUSTEES });
    await expect(
      castVote(risk, { resolutionId: trusteeRes.id, vote: "FOR" }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // The same principal CAN vote on their own body.
    const boardRes = await makeResolution({});
    const ok = await castVote(risk, { resolutionId: boardRes.id, vote: "FOR" }, ctx);
    expect(ok.vote).toBe("FOR");
  });

  it("rejects a cross-tenant resolution without confirming existence", async () => {
    const sector = await principalFor("SARA_LEMA");
    const r = await makeResolution({});
    const real = await castVote(sector, { resolutionId: r.id, vote: "FOR" }, ctx).catch((e) => e);
    const fake = await castVote(sector, { resolutionId: "RES_NOPE", vote: "FOR" }, ctx).catch((e) => e);
    // Identical responses: no existence oracle.
    expect(real.code).toBe(fake.code);
  });

  it("enforces the classification ceiling", async () => {
    const cfo = await principalFor("DAUDI_MOSHI"); // clearance RESTRICTED
    const r = await makeResolution({ classification: "HIGHLY_RESTRICTED" });
    await expect(castVote(cfo, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "CLASSIFICATION_DENIED",
    });
  });

  it("allows a proposer who is independently an eligible member", async () => {
    const ceo = await principalFor("AMANI_BEYU"); // CHAIR of GROUP_BOARD
    const r = await makeResolution({});
    await db.update(resolutions).set({ proposedBy: "GROUP_CEO" }).where(eq(resolutions.id, r.id));
    const result = await castVote(ceo, { resolutionId: r.id, vote: "FOR" }, ctx);
    expect(result.vote).toBe("FOR");
  });

  it("does not let proposal ownership confer voting rights", async () => {
    const hcm = await principalFor("ASHA_NDULU");
    const r = await makeResolution({});
    // Mark the non-member as the proposer; they still cannot vote.
    await db.update(resolutions).set({ proposedBy: "HCM_DIRECTOR" }).where(eq(resolutions.id, r.id));
    await expect(castVote(hcm, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toBeInstanceOf(
      GovernanceError,
    );
  });
});

describe("governed vote — lifecycle and window", () => {
  it("rejects a vote on a DRAFT (untabled) resolution", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({ status: "DRAFT", opensAt: null, closesAt: null });
    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
  });

  it("rejects a vote before the window opens", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({
      opensAt: new Date(Date.now() + 86_400_000),
      closesAt: new Date(Date.now() + 2 * 86_400_000),
    });
    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
  });

  it("rejects a vote after the window closes", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({
      opensAt: new Date(Date.now() - 2 * 86_400_000),
      closesAt: new Date(Date.now() - 86_400_000),
    });
    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
    expect((await db.select().from(resolutionVotes)).length).toBe(0);
  });

  /**
   * §4 — BEYU OS has no scheduler, so an expired resolution simply STAYS TABLED
   * until a governed action closes it. That is safe only if expiry is enforced
   * on every write path, not by a background job. These tests pin that: the
   * resolution remains open-looking (TABLED, undecided) yet is permanently
   * unvotable.
   */
  it("permanently refuses votes after the window closes while the resolution stays TABLED", async () => {
    const r = await makeResolution({
      opensAt: new Date(Date.now() - 3 * 86_400_000),
      closesAt: new Date(Date.now() - 86_400_000),
    });

    // Every member of the electorate is refused, not just one.
    for (const userKey of ["AMANI_BEYU", "DAUDI_MOSHI", "GRACE_KILELE", "JOHN_MREMA", "NEEMA_BEYU"]) {
      await expect(
        castVote(await principalFor(userKey), { resolutionId: r.id, vote: "FOR" }, ctx),
      ).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    }

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    // The resolution is NOT silently finalised: no status change, no decision.
    expect(row.status).toBe("TABLED");
    expect(row.decisionDate).toBeNull();
    expect(row.quorumMet).toBe(false);
    expect(row.votesFor + row.votesAgainst + row.votesAbstain).toBe(0);
    // No ballot, no audit record and no event were produced by the refusals.
    expect((await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id))).length).toBe(0);
    expect((await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, r.id))).length).toBe(0);
  });

  it("refuses a vote when the window closes between the pre-check and the transaction", async () => {
    // The window is re-checked INSIDE the transaction, so a window that expires
    // during a request cannot be raced by a vote that passed the pre-check.
    const r = await makeResolution({ closesAt: new Date(Date.now() + 60_000) });
    const gov = await principalFor("GRACE_KILELE");

    // Close the window underneath the caller, exactly as elapsed time would.
    await db
      .update(resolutions)
      .set({ votingClosesAt: new Date(Date.now() - 1_000) })
      .where(eq(resolutions.id, r.id));

    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
    expect((await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id))).length).toBe(0);
  });

  it("rejects a vote on an already-decided resolution", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({ status: "APPROVED" });
    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
  });
});

describe("governed vote — tabling", () => {
  it("only the presiding officer may table", async () => {
    const r = await makeResolution({ status: "DRAFT", opensAt: null, closesAt: null });

    // CFO is an ordinary MEMBER of GROUP_BOARD.
    const cfo = await principalFor("DAUDI_MOSHI");
    await expect(tableResolution(cfo, { resolutionId: r.id }, ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    // The CGO is SECRETARY (a presiding seat) and holds the approve capability.
    const gov = await principalFor("GRACE_KILELE");
    const tabled = await tableResolution(gov, { resolutionId: r.id }, ctx);
    expect(tabled.status).toBe("TABLED");
    expect(new Date(tabled.votingClosesAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("tabling opens the window and is audited as its own action", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({ status: "DRAFT", opensAt: null, closesAt: null });
    await tableResolution(gov, { resolutionId: r.id }, ctx);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("TABLED");
    expect(row.votingOpensAt).not.toBeNull();
    expect(row.tabledByMemberId).toBeTruthy();

    const audit = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "governance.resolution.table"));
    expect(audit.length).toBe(1);

    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_TABLED"));
    expect(events.length).toBe(1);
  });

  it("refuses to table anything that is not DRAFT", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({ status: "TABLED" });
    await expect(tableResolution(gov, { resolutionId: r.id }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });
  });
});

describe("governed vote — ballots, changes and provenance", () => {
  it("records a first vote and leaves the resolution TABLED", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});
    const result = await castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx);

    expect(result.changed).toBe(false);
    expect(result.outcome).toBe("PENDING"); // 1 of 5 — no decision yet
    expect(result.status).toBe("TABLED");

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballots.length).toBe(1);
    expect(ballots[0].vote).toBe("FOR");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.votesFor).toBe(1);
  });

  it("keeps exactly one effective ballot when a member changes their vote", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});

    await castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx);
    const changed = await castVote(gov, { resolutionId: r.id, vote: "AGAINST" }, ctx);

    expect(changed.changed).toBe(true);
    expect(changed.previousVote).toBe("FOR");

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballots.length).toBe(1); // not two independent votes
    expect(ballots[0].vote).toBe("AGAINST");

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.votesFor).toBe(0);
    expect(row.votesAgainst).toBe(1);
  });

  it("preserves the previous vote in the immutable ledger", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});
    await castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx);
    await castVote(gov, { resolutionId: r.id, vote: "ABSTAIN" }, ctx);

    const trail = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.objectType, "RESOLUTION"), eq(auditLog.objectId, r.id)))
      .orderBy(auditLog.sequence);

    expect(trail.length).toBe(2);
    expect(trail[0].action).toBe("governance.resolution.vote.cast");
    expect(trail[1].action).toBe("governance.resolution.vote.change");
    // Provenance: the superseded vote survives even though the ballot row moved on.
    expect((trail[1].oldValue as Record<string, unknown>).vote).toBe("FOR");
    expect((trail[1].newValue as Record<string, unknown>).vote).toBe("ABSTAIN");
    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("emits distinct events for a cast and a change", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});
    await castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx);
    await castVote(gov, { resolutionId: r.id, vote: "AGAINST" }, ctx);

    const types = (
      await db.select().from(enterpriseEvents).orderBy(enterpriseEvents.sequence)
    ).map((e) => e.type);
    expect(types).toContain("GOVERNANCE_RESOLUTION_VOTE_CAST");
    expect(types).toContain("GOVERNANCE_RESOLUTION_VOTE_CHANGED");
  });

  it("rejects a vote change after the window closes", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});
    await castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx);

    // Close the window, then attempt a change.
    await db
      .update(resolutions)
      .set({ votingClosesAt: new Date(Date.now() - 1000) })
      .where(eq(resolutions.id, r.id));

    await expect(castVote(gov, { resolutionId: r.id, vote: "AGAINST" }, ctx)).rejects.toMatchObject({
      code: "RULE_VIOLATION",
    });

    const [ballot] = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballot.vote).toBe("FOR"); // unchanged
  });

  it("prevents a recused member from voting", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});

    // Record the recusal using the schema's existing representation.
    const [seat] = await db.execute<{ id: string }>(sql`
      select gm.id from governance_members gm
      join parties p on p.id = gm.party_id
      join users u on u.party_id = p.id
      where gm.body_id = ${BOARD} and u.id = ${gov.userId} limit 1
    `).then((res) => res.rows);

    await db.insert(resolutionVotes).values({
      id: `VOT_RECUSE_${Date.now()}`,
      resolutionId: r.id,
      memberId: seat.id,
      vote: "RECUSED",
      conflictDeclared: true,
    });

    await expect(castVote(gov, { resolutionId: r.id, vote: "FOR" }, ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("governed vote — voting conclusion", () => {
  /**
   * Voting CONCLUDES to VOTED; it never decides. APPROVED / REJECTED /
   * DEADLOCKED are produced only by the decision authority's closure, which is
   * covered in tests/governance/decision-service.test.ts.
   */
  /** Vote as every GROUP_BOARD member; returns the final result. */
  async function boardVotes(votes: Record<string, "FOR" | "AGAINST" | "ABSTAIN">, resolutionId: string) {
    let last;
    for (const [userKey, vote] of Object.entries(votes)) {
      const p = await principalFor(userKey);
      last = await castVote(p, { resolutionId, vote }, ctx);
    }
    return last!;
  }

  it("concludes to VOTED when the simple majority carries and every member has voted", async () => {
    const r = await makeResolution({});
    const result = await boardVotes(
      {
        AMANI_BEYU: "FOR",
        DAUDI_MOSHI: "FOR",
        GRACE_KILELE: "FOR",
        JOHN_MREMA: "AGAINST",
        NEEMA_BEYU: "ABSTAIN",
      },
      r.id,
    );

    // The ballots imply APPROVED, but the electorate cannot enact it.
    expect(result.outcome).toBe("APPROVED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("VOTED");
    expect(row.quorumMet).toBe(true);
    expect(row.votesFor).toBe(3);
    // No decision has been taken, so there is no decision date or actor.
    expect(row.decisionDate).toBeNull();
    expect(row.decidedByMemberId).toBeNull();
  });

  it("concludes to VOTED when the majority is against", async () => {
    const r = await makeResolution({});
    const result = await boardVotes(
      {
        AMANI_BEYU: "AGAINST",
        DAUDI_MOSHI: "AGAINST",
        GRACE_KILELE: "AGAINST",
        JOHN_MREMA: "FOR",
        NEEMA_BEYU: "ABSTAIN",
      },
      r.id,
    );
    expect(result.outcome).toBe("REJECTED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("VOTED");
    expect(row.decisionDate).toBeNull();
  });

  it("concludes to VOTED on a tie, with no automatic tie-break", async () => {
    const r = await makeResolution({});
    const result = await boardVotes(
      {
        AMANI_BEYU: "FOR", // CHAIR — must NOT break the tie
        DAUDI_MOSHI: "FOR",
        GRACE_KILELE: "AGAINST",
        JOHN_MREMA: "AGAINST",
        NEEMA_BEYU: "ABSTAIN",
      },
      r.id,
    );

    expect(result.outcome).toBe("DEADLOCKED");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("VOTED");
    expect(row.status).not.toBe("APPROVED");
    expect(row.status).not.toBe("REJECTED");
    expect(row.decisionDate).toBeNull();
  });

  it("does not decide while votes are still outstanding", async () => {
    const r = await makeResolution({});
    const result = await boardVotes({ AMANI_BEYU: "FOR", DAUDI_MOSHI: "FOR", GRACE_KILELE: "FOR" }, r.id);
    // 3 of 5 voted, all FOR — but two members have not voted yet.
    expect(result.outcome).toBe("PENDING");
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.status).toBe("TABLED");
    expect(row.decisionDate).toBeNull();
  });

  it("publishes a voting-concluded event, and NOT a decision event", async () => {
    const r = await makeResolution({});
    await boardVotes(
      {
        AMANI_BEYU: "FOR",
        DAUDI_MOSHI: "FOR",
        GRACE_KILELE: "FOR",
        JOHN_MREMA: "FOR",
        NEEMA_BEYU: "FOR",
      },
      r.id,
    );
    const concluded = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_VOTING_CONCLUDED"));
    expect(concluded.length).toBe(1);
    // The event carries the PROVISIONAL outcome the ballots imply, not a decision.
    expect((concluded[0].payload as Record<string, unknown>).provisionalOutcome).toBe("APPROVED");
    expect((concluded[0].payload as Record<string, unknown>).status).toBe("VOTED");

    // No decision event exists: nothing has been decided by voting alone.
    const decided = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_DECIDED"));
    expect(decided.length).toBe(0);
  });

  it("applies the UNANIMOUS rule for a body configured that way", async () => {
    // TRUSTEE_BOARD: 2 members, quorum 2, UNANIMOUS.
    const r = await makeResolution({ bodyId: TRUSTEES });
    const fam = await principalFor("NEEMA_BEYU");
    const gov = await principalFor("GRACE_KILELE");

    await castVote(fam, { resolutionId: r.id, vote: "FOR" }, ctx);
    const result = await castVote(gov, { resolutionId: r.id, vote: "AGAINST" }, ctx);

    // 1-1 under UNANIMOUS is a tie -> deadlock, not rejection.
    expect(result.outcome).toBe("DEADLOCKED");
  });

  it("excludes a recused member from quorum so the remainder can still decide", async () => {
    const r = await makeResolution({ bodyId: TRUSTEES });
    const fam = await principalFor("NEEMA_BEYU");
    const gov = await principalFor("GRACE_KILELE");

    const [seat] = await db.execute<{ id: string }>(sql`
      select gm.id from governance_members gm
      join parties p on p.id = gm.party_id
      join users u on u.party_id = p.id
      where gm.body_id = ${TRUSTEES} and u.id = ${gov.userId} limit 1
    `).then((res) => res.rows);

    await db.insert(resolutionVotes).values({
      id: `VOT_RECUSE2_${Date.now()}`,
      resolutionId: r.id,
      memberId: seat.id,
      vote: "RECUSED",
      conflictDeclared: true,
    });

    // Electorate shrinks to 1; that member's FOR vote carries unanimously.
    const result = await castVote(fam, { resolutionId: r.id, vote: "FOR" }, ctx);
    expect(result.quorum.eligible).toBe(1);
    expect(result.quorum.recused).toBe(1);
    expect(result.outcome).toBe("APPROVED");
  });
});

describe("governed vote — atomicity and concurrency", () => {
  it("rolls back the ballot when the audit append fails", async () => {
    const r = await makeResolution({});
    await expect(
      withAuditTransaction(
        async (tx) => {
          await tx.insert(resolutionVotes).values({
            id: "VOT_ATOMIC_FAIL",
            resolutionId: r.id,
            memberId: "GMB_BRD_CGO",
            vote: "FOR",
          });
          return { id: "VOT_ATOMIC_FAIL" };
        },
        () => ({
          tenantId: "TEN_BEYU_GROUP",
          action: null as never, // NOT NULL violation
          objectType: "RESOLUTION",
          objectId: r.id,
        }),
      ),
    ).rejects.toThrow();

    expect(
      (await db.select().from(resolutionVotes).where(eq(resolutionVotes.id, "VOT_ATOMIC_FAIL")))
        .length,
    ).toBe(0);
    expect((await verifyAuditChain()).records).toBe(0);
  });

  it("rolls back the ballot and audit when the event append fails", async () => {
    const r = await makeResolution({});
    await expect(
      withAuditTransaction(
        async (tx) => {
          await tx.insert(resolutionVotes).values({
            id: "VOT_EVENT_FAIL",
            resolutionId: r.id,
            memberId: "GMB_BRD_CGO",
            vote: "FOR",
          });
          return { id: "VOT_EVENT_FAIL" };
        },
        () => ({
          tenantId: "TEN_BEYU_GROUP",
          action: "governance.resolution.vote.cast",
          objectType: "RESOLUTION",
          objectId: r.id,
        }),
        () => ({
          type: null as never, // NOT NULL violation
          source: "beyu-os/governance",
          domain: "GOVERNANCE",
          operation: "CAST_VOTE",
          destinationDomain: null,
          tenantId: "TEN_BEYU_GROUP",
          legalEntityId: null,
          subjectType: "RESOLUTION",
          classification: "RESTRICTED",
          traceId: "TRACE-EVENT-FAIL",
          correlationId: "TRACE-EVENT-FAIL",
          causationId: null,
          authorityContext: null,
          policyVersion: null,
          subjectId: r.id,
        }),
      ),
    ).rejects.toThrow();

    expect(
      (await db.select().from(resolutionVotes).where(eq(resolutionVotes.id, "VOT_EVENT_FAIL")))
        .length,
    ).toBe(0);
    expect((await verifyAuditChain()).records).toBe(0);
    expect((await db.select().from(enterpriseEvents)).length).toBe(0);
  });

  /**
   * §2 — DOMAIN STATE + AUDIT + DURABLE DOMAIN EVENT must be atomic.
   *
   * The decision event is a hash-chained row in `enterprise_events`, so it is
   * durable domain state, not an external delivery. These two tests pin the
   * invariant from both sides: the event must be written with the decision, and
   * a failure to write it must undo the decision.
   */
  it("writes the voting-concluded event in the same transaction as the final vote", async () => {
    const r = await makeResolution({});
    // A decision is only reached once voting has concluded, which for an open
    // window means every eligible member has voted — so the fifth vote decides.
    const voters: [string, "FOR" | "AGAINST" | "ABSTAIN"][] = [
      ["AMANI_BEYU", "FOR"],
      ["DAUDI_MOSHI", "FOR"],
      ["GRACE_KILELE", "FOR"],
      ["JOHN_MREMA", "AGAINST"],
      ["NEEMA_BEYU", "ABSTAIN"],
    ];
    let result;
    for (const [userKey, vote] of voters) {
      result = await castVote(await principalFor(userKey), { resolutionId: r.id, vote }, ctx);
    }
    expect(result!.outcome).toBe("APPROVED");

    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(eq(enterpriseEvents.subjectId, r.id))
      .orderBy(enterpriseEvents.sequence);

    const decided = events.filter(
      (e) => e.type === "GOVERNANCE_RESOLUTION_VOTING_CONCLUDED",
    );
    expect(decided.length).toBe(1);

    // The deciding vote event and the decision event are adjacent in the single
    // append-only chain: nothing can be interleaved between them, which is only
    // possible if both were appended inside one transaction.
    const decidedIndex = events.findIndex(
      (e) => e.type === "GOVERNANCE_RESOLUTION_VOTING_CONCLUDED",
    );
    expect(events[decidedIndex - 1].type).toBe("GOVERNANCE_RESOLUTION_VOTE_CAST");
    expect(Number(decided[0].sequence)).toBe(Number(events[decidedIndex - 1].sequence) + 1);

    // The decision event carries the decision, not a re-derivation of it.
    const payload = decided[0].payload as Record<string, unknown>;
    expect(payload.provisionalOutcome).toBe("APPROVED");
    expect(payload.status).toBe("VOTED");
    expect(payload.tally).toEqual({ for: 3, against: 1, abstain: 1 });

    // Chain integrity holds across both appends.
    expect((await verifyAuditChain()).verified).toBe(true);
  });

  it("rolls back the vote, status, audit and events when the conclusion event cannot be persisted", async () => {
    const r = await makeResolution({});
    // Voting concludes when the fifth and last eligible member votes, so the
    // first four ballots leave the resolution TABLED and undecided.
    for (const [userKey, vote] of [
      ["AMANI_BEYU", "FOR"],
      ["DAUDI_MOSHI", "FOR"],
      ["GRACE_KILELE", "FOR"],
      ["JOHN_MREMA", "AGAINST"],
    ] as const) {
      await castVote(await principalFor(userKey), { resolutionId: r.id, vote }, ctx);
    }

    const before = {
      resolution: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
      ballots: (
        await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id))
      ).length,
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
    };
    expect(before.resolution.status).toBe("TABLED"); // not yet decided

    // Inject a real persistence failure for the decision event only.
    await db.execute(sql`
      create or replace function beyu_test_block_decision_event() returns trigger as $$
      begin
        if new.type = 'GOVERNANCE_RESOLUTION_VOTING_CONCLUDED' then
          raise exception 'injected conclusion-event persistence failure';
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
        castVote(await principalFor("NEEMA_BEYU"), { resolutionId: r.id, vote: "ABSTAIN" }, ctx),
      ).rejects.toThrow(/enterprise_events|injected conclusion-event persistence failure/);
    } finally {
      await db.execute(sql`drop trigger if exists beyu_test_block_decision_event on enterprise_events`);
      await db.execute(sql`drop function if exists beyu_test_block_decision_event()`);
    }

    const after = {
      resolution: (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0],
      ballots: (
        await db.select().from(resolutionVotes).where(eq(resolutionVotes.resolutionId, r.id))
      ).length,
      audits: (await verifyAuditChain()).records,
      events: (await db.select().from(enterpriseEvents)).length,
    };

    // 1. The status transition rolled back — no silent decision.
    expect(after.resolution.status).toBe("TABLED");
    expect(after.resolution.decisionDate).toBeNull();
    // 2. The vote mutation rolled back — the deciding ballot does not exist.
    expect(after.ballots).toBe(before.ballots);
    expect(
      (
        await db
          .select()
          .from(resolutionVotes)
          .where(
            and(eq(resolutionVotes.resolutionId, r.id), eq(resolutionVotes.memberId, "GMB_BRD_FAM")),
          )
      ).length,
    ).toBe(0);
    // 3. The tally rolled back.
    expect(after.resolution.votesFor).toBe(before.resolution.votesFor);
    expect(after.resolution.votesAgainst).toBe(before.resolution.votesAgainst);
    // 4. The audit record rolled back.
    expect(after.audits).toBe(before.audits);
    // 5. The vote event rolled back with the decision event.
    expect(after.events).toBe(before.events);
    // 6. Both ledgers remain verifiable.
    expect((await verifyAuditChain()).verified).toBe(true);

    // The resolution is still votable: the failure left no partial state behind.
    const retry = await castVote(
      await principalFor("NEEMA_BEYU"),
      { resolutionId: r.id, vote: "ABSTAIN" },
      ctx,
    );
    expect(retry.outcome).toBe("APPROVED");
    expect(
      (await db.select().from(resolutions).where(eq(resolutions.id, r.id)))[0].status,
    ).toBe("VOTED");
    expect(
      (
        await db
          .select()
          .from(enterpriseEvents)
          .where(eq(enterpriseEvents.type, "GOVERNANCE_RESOLUTION_VOTING_CONCLUDED"))
      ).length,
    ).toBe(1);
  });

  it("produces exactly one ballot under concurrent votes from the same member", async () => {
    const gov = await principalFor("GRACE_KILELE");
    const r = await makeResolution({});

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        castVote(gov, { resolutionId: r.id, vote: i % 2 === 0 ? "FOR" : "AGAINST" }, ctx),
      ),
    );
    expect(results.some((x) => x.status === "fulfilled")).toBe(true);

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballots.length).toBe(1);

    // The stored tally matches the single effective ballot.
    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.votesFor + row.votesAgainst + row.votesAbstain).toBe(1);
  });

  it("produces a correct tally under concurrent votes from different members", async () => {
    const r = await makeResolution({});
    const voters = ["AMANI_BEYU", "DAUDI_MOSHI", "GRACE_KILELE", "JOHN_MREMA", "NEEMA_BEYU"];
    const principals = await Promise.all(voters.map(principalFor));

    await Promise.allSettled(
      principals.map((p, i) =>
        castVote(p, { resolutionId: r.id, vote: i < 3 ? "FOR" : "AGAINST" }, ctx),
      ),
    );

    const ballots = await db
      .select()
      .from(resolutionVotes)
      .where(eq(resolutionVotes.resolutionId, r.id));
    expect(ballots.length).toBe(5);

    const [row] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(row.votesFor).toBe(3);
    expect(row.votesAgainst).toBe(2);
    expect(row.quorumMet).toBe(true);
    // 3-2 under SIMPLE with all five voting -> approved.
    expect(row.status).toBe("VOTED");
  });

  it("keeps the audit chain intact after concurrent voting", async () => {
    const r = await makeResolution({});
    const principals = await Promise.all(
      ["AMANI_BEYU", "DAUDI_MOSHI", "GRACE_KILELE"].map(principalFor),
    );
    await Promise.allSettled(
      principals.map((p) => castVote(p, { resolutionId: r.id, vote: "FOR" }, ctx)),
    );
    const chain = await verifyAuditChain();
    expect(chain.verified).toBe(true);
    expect(chain.duplicateParents).toBe(0);
  });
});
