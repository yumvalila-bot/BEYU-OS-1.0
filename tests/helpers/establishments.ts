import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { governanceBodies, governanceBodyEstablishments, governanceMembers, resolutions, resolutionVotes } from "../../src/db/schema";
import { appointmentFixture, cleanupAppointments, asAppointmentActor } from "./appointments";
import { charterFixtureRules } from "./charters";
import { decideResolutionClosure } from "../../src/lib/governance-vote-service";
import type { Principal } from "../../src/lib/authz";
export { appointmentFixture as establishmentFixture, asAppointmentActor as asEstablishmentActor };
export const establishmentInput = (extra = {}) => ({ code: `COM_${randomUUID().replaceAll("-", "_").toUpperCase()}`, name: "Proposed internal governance committee", purpose: "A bounded internal committee mandate; no initial membership or security authority", documentId: "DOC_D4", rules: charterFixtureRules, ...extra });
export async function establishmentBallot(id: string, chair: Principal, category = "RESERVED_MATTER") {
 const [proposal] = await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, id));
 const [parent] = await db.select().from(governanceBodies).where(eq(governanceBodies.id, proposal.parentBodyId));
 const resolutionId = `RES_${id}`;
 await db.insert(resolutions).values({ id: resolutionId, reference: resolutionId, tenantId: parent.tenantId, bodyId: parent.id, title: "Establish the identified inactive committee", category, summary: "Fixture", rationale: "Independent superior mandate", dataBasis: "Immutable proposed charter", consequences: "No membership, RBAC or Finance authority", proposedBy: chair.userId, status: "TABLED", requiredMajority: parent.majorityRule, classification: proposal.classification, linkedObjectType: "GOVERNANCE_BODY_ESTABLISHMENT", linkedObjectId: id, votingOpensAt: new Date(0), votingClosesAt: new Date(1) });
 for (const m of await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, parent.id))) await db.insert(resolutionVotes).values({ id: `${resolutionId}_${m.id}`, resolutionId, memberId: m.id, vote: "FOR" });
 await asAppointmentActor(chair, () => decideResolutionClosure(chair, { resolutionId }, { traceId: "ESTABLISHMENT_FIXTURE" }));
 return resolutionId;
}
export async function cleanupEstablishments(prefix: string) {
 const rows = await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.parentBodyId, `GOV_${prefix}`));
 await db.delete(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.parentBodyId, `GOV_${prefix}`));
 for (const r of rows) if (r.bodyId) {
  await db.execute(sql`delete from governance_charter_terms where id in (select id from governance_charters where body_id=${r.bodyId})`);
  await db.execute(sql`delete from governance_charters where body_id=${r.bodyId}`);
  await db.execute(sql`delete from resolution_votes where resolution_id in (select id from resolutions where body_id=${r.bodyId})`);
  await db.delete(resolutions).where(eq(resolutions.bodyId, r.bodyId));
  await db.delete(governanceBodies).where(eq(governanceBodies.id, r.bodyId));
 }
 await cleanupAppointments(prefix);
}
