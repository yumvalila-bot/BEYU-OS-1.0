/** Disposable fixture; approval itself always passes through the domain service. */
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceMembers, resolutions, resolutionVotes, tenants, users } from "../../src/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../../src/lib/authz";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
export const executionContext = { traceId: "GOVERNANCE_EXECUTION_TEST" };
export async function executionPrincipal(id = "USR_AMANI_BEYU"): Promise<Principal> {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  const [t] = await db.select().from(tenants).where(eq(tenants.id, u.primaryTenantId));
  const roles = (await loadGrants(u.id, t.id)).map((g) => g.code);
  return { userId: u.id, partyId: u.partyId, email: u.email, displayName: u.email, tenantId: t.id,
    tenantCode: t.code, tenantType: t.type, roles, permissions: permissionsForRoles(roles), clearance: clearanceForRoles(roles),
    entityScope: [], mfaSatisfied: true, sessionId: "TEST", riskScore: 0, emergencyPermissions: [] };
}
export async function executionResolution(principal: Principal, prefix = "GEXE") {
  const id = `RES_${prefix}_${randomUUID()}`;
  const [body] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, "GOV_GROUP_BOARD"));
  await db.insert(resolutions).values({ id, reference: id, tenantId: body.tenantId, bodyId: body.id,
    title: "Governance execution integration mandate", category: "OTHER", summary: "Disposable approved resolution fixture",
    rationale: "Test the real authority chain", dataBasis: "Integration fixture", consequences: "No Finance authority",
    proposedBy: principal.userId, classification: "RESTRICTED", requiredMajority: body.majorityRule, status: "TABLED",
    votingOpensAt: new Date(Date.now() - 7200000), votingClosesAt: new Date(Date.now() - 3600000) });
  const seats = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id));
  for (const seat of seats) await db.insert(resolutionVotes).values({ id: `VOT_${id}_${seat.id}`, resolutionId: id, memberId: seat.id, vote: "FOR" });
  const decision = await decideResolutionClosure(principal, { resolutionId: id }, executionContext);
  if (decision.outcome !== "APPROVED") throw new Error(`Fixture failed canonical approval: ${decision.outcome}`);
  return id;
}
export async function cleanupExecution(prefix = "GEXE") {
  const pattern = `RES_${prefix}_%`;
  await db.execute(sql`delete from governance_action_evidence where task_id in (select id from tasks where source_resolution_id like ${pattern})`);
  // Delete dependants before their immutable FK prerequisites.
  await db.execute(sql`delete from tasks where source_resolution_id like ${pattern} and depends_on_task_id is not null`);
  await db.execute(sql`delete from tasks where source_resolution_id like ${pattern}`);
  await db.execute(sql`delete from resolution_votes where resolution_id like ${pattern}`);
  await db.execute(sql`delete from resolutions where id like ${pattern}`);
  await db.execute(sql`delete from notifications where subject like 'Governance action%' and link_href like ${`%${prefix}%`}`);
}
