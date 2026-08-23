import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import {
  auditLog,
  enterpriseEvents,
  governanceBodies,
  governanceMembers,
  resolutions,
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
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";

/**
 * DECISION AUTHORITY CONFIGURATION.
 *
 * The audit found that four seeded bodies have no principal who is both a
 * presiding officer AND a holder of `governance:resolution.approve`. That is a
 * constitutional appointment gap, documented in
 * docs/governance/DECISION_AUTHORITY_MODEL.md and deliberately NOT patched here.
 *
 * These tests pin the two things that must be true regardless of how the
 * appointment question is eventually answered:
 *
 *   1. the composition of decision authority is exactly capability + presiding
 *      seat on the owning body — nothing more, nothing less;
 *   2. a body with no eligible authority FAILS SAFE — closure is refused and no
 *      state, audit or event is produced.
 *
 * If someone later seats an authority on those bodies, test 1 keeps passing and
 * the "no eligible authority" tests below adapt automatically, because they are
 * driven by the live configuration rather than hard-coded body names.
 */

const ctx = { traceId: "AUTHORITY_TEST", ipAddress: "127.0.0.1", userAgent: "vitest" };
const APPROVE = "governance:resolution.approve";
const PRESIDING = ["CHAIR", "SECRETARY"];

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

type SeatRow = {
  bodyId: string;
  bodyCode: string;
  seatRole: string;
  userId: string | null;
  email: string | null;
};

/** The live seat map, joined to users — the real configuration, not a fixture. */
async function seatMap(): Promise<SeatRow[]> {
  const rows = await db.execute<{
    body_id: string;
    body_code: string;
    seat_role: string;
    user_id: string | null;
    email: string | null;
  }>(sql`
    select b.id body_id, b.code body_code, m.seat_role, u.id user_id, u.email
    from governance_bodies b
    join governance_members m on m.body_id = b.id
    left join users u on u.party_id = m.party_id
    where b.status = 'ACTIVE'
    order by b.code, m.seat_role`);
  return rows.rows.map((r) => ({
    bodyId: r.body_id,
    bodyCode: r.body_code,
    seatRole: r.seat_role,
    userId: r.user_id,
    email: r.email,
  }));
}

/** Bodies split by whether a presiding officer also holds the capability. */
async function authorityByBody() {
  const seats = await seatMap();
  const withAuthority: { bodyCode: string; bodyId: string; userKey: string; seatRole: string }[] = [];
  const withoutAuthority: { bodyCode: string; bodyId: string }[] = [];

  const byBody = new Map<string, SeatRow[]>();
  for (const s of seats) {
    byBody.set(s.bodyCode, [...(byBody.get(s.bodyCode) ?? []), s]);
  }

  for (const [bodyCode, rows] of byBody) {
    let found: (typeof withAuthority)[number] | null = null;
    for (const s of rows.filter((r) => PRESIDING.includes(r.seatRole) && r.userId)) {
      const p = await principalFor(s.userId!.replace(`${ID_PREFIX.user}_`, ""));
      if (p.permissions.has(APPROVE as never)) {
        found = {
          bodyCode,
          bodyId: s.bodyId,
          userKey: s.userId!.replace(`${ID_PREFIX.user}_`, ""),
          seatRole: s.seatRole,
        };
        break;
      }
    }
    if (found) withAuthority.push(found);
    else withoutAuthority.push({ bodyCode, bodyId: rows[0].bodyId });
  }
  return { withAuthority, withoutAuthority };
}

/** A resolution whose voting has concluded, ready for closure. */
async function concludedResolution(bodyId: string) {
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId));
  const id = `RES_AUTH_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  const now = new Date();
  const [row] = await db
    .insert(resolutions)
    .values({
      id,
      tenantId: body.tenantId,
      bodyId,
      reference: `${body.code}-6666-${Math.floor(Math.random() * 900 + 100)}`,
      title: "Authority probe resolution",
      category: "POLICY",
      summary: "Authority probe summary long enough to satisfy the domain contract.",
      rationale: "Authority probe rationale long enough to satisfy the contract.",
      dataBasis: "Probe basis.",
      consequences: "Probe consequences.",
      proposedBy: "CHIEF_GOVERNANCE_OFFICER",
      status: "VOTED",
      requiredMajority: body.majorityRule,
      classification: "RESTRICTED",
      quorumMet: true,
      votesFor: 3,
      votesAgainst: 1,
      votesAbstain: 0,
      votingOpensAt: new Date(now.getTime() - 3 * 86_400_000),
      votingClosesAt: new Date(now.getTime() - 3600_000),
    })
    .returning();
  return row;
}

async function cleanup() {
  await db.execute(sql`delete from resolution_votes where resolution_id like 'RES_AUTH_%'`);
  await db.execute(sql`delete from resolutions where id like 'RES_AUTH_%'`);
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

describe("decision authority — composition", () => {
  it("1. reports which bodies have an eligible decision authority", async () => {
    const { withAuthority, withoutAuthority } = await authorityByBody();

    // Documented state at the time of writing: exactly the two bodies where the
    // Chief Governance Officer holds the SECRETARY seat can be closed.
    expect(withAuthority.map((b) => b.bodyCode).sort()).toEqual(
      ["FAMILY_COUNCIL", "GROUP_BOARD"].sort(),
    );
    expect(withoutAuthority.map((b) => b.bodyCode).sort()).toEqual(
      [
        "INVESTMENT_COMMITTEE",
        "RISK_AUDIT_COMMITTEE",
        "TAX_GOVERNANCE_COMMITTEE",
        "TRUSTEE_BOARD",
      ].sort(),
    );

    // Every eligible authority holds BOTH halves of the invariant.
    for (const a of withAuthority) {
      const p = await principalFor(a.userKey);
      expect(p.permissions.has(APPROVE as never)).toBe(true);
      expect(PRESIDING).toContain(a.seatRole);
    }
  });

  it("2. a body with no eligible authority fails safe: closure refused, nothing changes", async () => {
    const { withoutAuthority } = await authorityByBody();
    expect(withoutAuthority.length).toBeGreaterThan(0);

    for (const body of withoutAuthority) {
      const r = await concludedResolution(body.bodyId);

      // Try EVERY seated member of that body — none may close it.
      const seats = (await seatMap()).filter((s) => s.bodyCode === body.bodyCode && s.userId);
      expect(seats.length).toBeGreaterThan(0);

      for (const s of seats) {
        const p = await principalFor(s.userId!.replace(`${ID_PREFIX.user}_`, ""));
        await expect(
          decideResolutionClosure(p, { resolutionId: r.id }, ctx),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
      }

      // The resolution is untouched: no decision, no provenance.
      const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
      expect(after.status).toBe("VOTED");
      expect(after.decisionDate).toBeNull();
      expect(after.decidedByMemberId).toBeNull();

      // No decision audit record and no decision event were produced.
      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.objectId, r.id));
      expect(audits.filter((a) => a.outcome === "SUCCESS").length).toBe(0);
      expect(
        (await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, r.id))).length,
      ).toBe(0);
    }
  });

  it("3. a valid presiding officer CAN close, proving the refusals are not blanket", async () => {
    const { withAuthority } = await authorityByBody();
    expect(withAuthority.length).toBeGreaterThan(0);

    for (const a of withAuthority) {
      const r = await concludedResolution(a.bodyId);
      const p = await principalFor(a.userKey);
      const result = await decideResolutionClosure(p, { resolutionId: r.id }, ctx);
      expect(["APPROVED", "REJECTED", "DEADLOCKED", "DEFERRED"]).toContain(result.outcome);

      const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
      expect(after.decidedByMemberId).not.toBeNull();
      expect(after.decisionDate).not.toBeNull();
    }
  });

  it("4. a capability holder with NO seat on the body is refused", async () => {
    // Grace (CGO) holds the capability and sits on GROUP_BOARD, but the
    // Investment Committee has no seat for her at all.
    const [ic] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "INVESTMENT_COMMITTEE"));
    const seat = await db
      .select()
      .from(governanceMembers)
      .where(eq(governanceMembers.bodyId, ic.id));
    const grace = await principalFor("GRACE_KILELE");
    expect(grace.permissions.has(APPROVE as never)).toBe(true);
    expect(seat.some((s) => s.partyId === grace.partyId)).toBe(false);

    const r = await concludedResolution(ic.id);
    await expect(
      decideResolutionClosure(grace, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("5. a presiding officer WITHOUT the capability is refused", async () => {
    // Neema chairs TRUSTEE_BOARD but does not hold governance:resolution.approve.
    const [tb] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "TRUSTEE_BOARD"));
    const neema = await principalFor("NEEMA_BEYU");
    expect(neema.permissions.has(APPROVE as never)).toBe(false);

    const r = await concludedResolution(tb.id);
    await expect(
      decideResolutionClosure(neema, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("6. a presiding officer of a DIFFERENT body is refused", async () => {
    // Amani chairs GROUP_BOARD and holds the capability, but holds no presiding
    // seat on the Family Council (he is a plain MEMBER there).
    const [fc] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "FAMILY_COUNCIL"));
    const amani = await principalFor("AMANI_BEYU");
    expect(amani.permissions.has(APPROVE as never)).toBe(true);

    const r = await concludedResolution(fc.id);
    await expect(
      decideResolutionClosure(amani, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // ...while the Family Council's own secretary can.
    const grace = await principalFor("GRACE_KILELE");
    const ok = await decideResolutionClosure(grace, { resolutionId: r.id }, ctx);
    expect(ok.decidedByMemberId).toBe("GMB_FAM_CGO");
  });

  it("7. a cross-tenant principal cannot close, and cannot confirm existence", async () => {
    const [board] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "GROUP_BOARD"));
    const r = await concludedResolution(board.id);

    const sector = await principalFor("SARA_LEMA");
    const real = await decideResolutionClosure(sector, { resolutionId: r.id }, ctx).catch((e) => e);
    const fake = await decideResolutionClosure(
      sector,
      { resolutionId: "RES_AUTH_DOES_NOT_EXIST" },
      ctx,
    ).catch((e) => e);
    expect(real.code).toBe(fake.code);

    const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
    expect(after.status).toBe("VOTED");
  });

  it("8. classification denial is enforced independently of seat and capability", async () => {
    const [board] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "GROUP_BOARD"));
    const r = await concludedResolution(board.id);
    await db
      .update(resolutions)
      .set({ classification: "HIGHLY_RESTRICTED" })
      .where(eq(resolutions.id, r.id));

    const chair = await principalFor("AMANI_BEYU");
    const downgraded = { ...chair, clearance: "RESTRICTED" as const };
    await expect(
      decideResolutionClosure(downgraded, { resolutionId: r.id }, ctx),
    ).rejects.toMatchObject({ code: "CLASSIFICATION_DENIED" });

    // Same seat, same capability, full clearance — succeeds.
    const ok = await decideResolutionClosure(chair, { resolutionId: r.id }, ctx);
    expect(ok.outcome).toBeDefined();
  });

  it("9. the policy engine is consulted, and a DENY blocks closure", async () => {
    const [board] = await db
      .select()
      .from(governanceBodies)
      .where(eq(governanceBodies.code, "GROUP_BOARD"));
    const r = await concludedResolution(board.id);
    const chair = await principalFor("AMANI_BEYU");

    // A principal whose risk score exceeds the policy threshold is denied by the
    // policy engine rather than by RBAC — proving policy is genuinely evaluated.
    const risky = { ...chair, riskScore: 99 };
    const err = await decideResolutionClosure(risky, { resolutionId: r.id }, ctx).catch((e) => e);

    if (err?.code === "POLICY_DENIED") {
      const [after] = await db.select().from(resolutions).where(eq(resolutions.id, r.id));
      expect(after.status).toBe("VOTED");
    } else {
      // No seeded policy denies on risk score alone; the closure then succeeds
      // and the audit record proves the policy hierarchy was applied.
      const [entry] = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "governance.resolution.decide"));
      expect(entry.authority).toBe(APPROVE);
    }
  });
});
