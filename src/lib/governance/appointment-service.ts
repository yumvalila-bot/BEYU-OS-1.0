import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { governanceAppointments, governanceBodies, governanceMembers, governanceCharterTerms, legalEntities, users, notifications, resolutionVotes } from "@/db/schema";
import { clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../authz";
import { classificationRank } from "../constants";
import { GovernanceError } from "../governance";
import { withTenantDatabaseContext } from "../tenant-scope";
import { withAuditTransaction } from "../audit";
import { evaluatePolicy } from "../policy";
import { ID_PREFIX, newId } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { authorizeBodyPresider, readBodyDocument, readGoverningBody } from "./body-authority";
import { currentCharterComposition, assessComposition } from "./charter-rules";
import { APPOINTMENT_EVENTS, AppointmentCommandSchema, NominateMemberSchema } from "./appointment-contract";

type Appointment = typeof governanceAppointments.$inferSelect;
const serial = (value: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(value));
const fail = (message: string) => new GovernanceError("RULE_VIOLATION", message);
const today = () => new Date().toISOString().slice(0, 10);

export async function listBodyAppointments(p: Principal, bodyId: string) {
 const body = await readGoverningBody(p, bodyId);
 const rows = await db.select().from(governanceAppointments).where(eq(governanceAppointments.bodyId, bodyId)).orderBy(desc(governanceAppointments.createdAt));
 return { body, appointments: rows.filter((r) => classificationRank(r.classification) <= classificationRank(p.clearance)) };
}
export async function readAppointment(p: Principal, bodyId: string, id: string) {
 const { body, appointments } = await listBodyAppointments(p, bodyId);
 const row = appointments.find((r) => r.id === id);
 if (!row) throw new GovernanceError("NOT_FOUND", "Appointment is not visible.");
 return { body, row };
}
async function nominee(body: typeof governanceBodies.$inferSelect, userId: string, classification: Appointment["classification"]) {
 const [u] = await db.select().from(users).where(eq(users.id, userId)).for("share");
 if (!u || u.status !== "ACTIVE" || u.isServiceAccount || !u.partyId || u.primaryTenantId !== body.tenantId) throw fail("An active human nominee in the body's tenant is required.");
 const grants = (await loadGrants(u.id, body.tenantId)).filter((g) => !g.entityId || g.entityId === body.legalEntityId);
 if (!permissionsForRoles(grants.map((g) => g.code)).has("governance:resolution.read") || classificationRank(clearanceForRoles(grants.map((g) => g.code))) < classificationRank(classification) ||
     (grants.some((g) => g.entityId) && !grants.some((g) => g.entityId === body.legalEntityId))) throw fail("The nominee needs independently provisioned scoped read access; nomination cannot grant it.");
 return u;
}
async function snapshot(p: Principal, body: typeof governanceBodies.$inferSelect, row: Appointment) {
 const doc = await readBodyDocument(p, body, row.documentId);
 if (doc.version !== row.documentVersion || doc.checksum !== row.documentChecksum || doc.classification !== row.classification) throw fail("Appointment instrument changed; nominate a new immutable version.");
 const u = await nominee(body, row.nomineeUserId, row.classification);
 if (u.partyId !== row.partyId) throw fail("Nominee identity changed; a new nomination is required.");
}
async function prospective(body: typeof governanceBodies.$inferSelect, row: Appointment) {
 if (row.appointedOn < today()) throw fail("Activation cannot backdate authority; a new dated nomination is required.");
 const members = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, body.id));
 if (members.some((m) => m.partyId === row.partyId && m.appointedOn <= row.retiredOn && (!m.retiredOn || m.retiredOn >= row.appointedOn))) throw fail("An overlapping appointment for this party already exists.");
 const charter = await currentCharterComposition(body);
 if (!charter.charter || !charter.satisfied) throw fail("An adopted, readable charter and satisfied current composition are required; legacy or vacancy status cannot grant new membership.");
 if (charter.charter) {
  const [terms] = await db.select().from(governanceCharterTerms).where(eq(governanceCharterTerms.id, charter.charter.id));
  if (!terms) throw fail("Adopted composition terms are unavailable.");
  const candidate = { partyId: row.partyId, seatRole: row.seatRole, votingRights: row.votingRights, appointedOn: row.appointedOn, retiredOn: row.retiredOn };
  const boundaries = new Set([row.appointedOn, row.retiredOn]);
  for (const m of members) {
   if (m.appointedOn >= row.appointedOn && m.appointedOn <= row.retiredOn) boundaries.add(m.appointedOn);
   if (m.retiredOn) { const next = new Date(new Date(m.retiredOn).valueOf() + 86400000).toISOString().slice(0,10); if (next >= row.appointedOn && next <= row.retiredOn) boundaries.add(next); }
  }
  for (const date of boundaries) if (!assessComposition(terms.rules, [...members, candidate], date).satisfied) throw fail("Proposed term violates adopted composition at a membership boundary.");
 }
}
async function mandate(p: Principal, bodyId: string, row: Appointment, resolutionId: string) {
 const authority = await authorizeResolutionFollowUp(p, resolutionId, true);
 const r = authority.resolution;
 if (authority.body.id !== bodyId || r.category !== "APPOINTMENT" || r.linkedObjectType !== "GOVERNANCE_APPOINTMENT" || r.linkedObjectId !== row.id || classificationRank(r.classification) < classificationRank(row.classification)) throw fail("An appropriately classified APPOINTMENT decision explicitly approving this nomination is required.");
 const affectedSeats = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, bodyId), eq(governanceMembers.partyId, row.partyId)));
 if (affectedSeats.length) {
  const votes = await db.select().from(resolutionVotes).where(and(eq(resolutionVotes.resolutionId, r.id), inArray(resolutionVotes.memberId, affectedSeats.map((m) => m.id))));
  if (votes.some((v) => v.vote !== "RECUSED")) throw fail("A nominee's participation cannot approve their own appointment.");
 }
 return authority.decisionEvent.id;
}
async function transition(p: Principal, body: typeof governanceBodies.$inferSelect, command: keyof typeof APPOINTMENT_EVENTS, old: Appointment | null, perform: () => Promise<Appointment>, note: string, context: MutationContext, cause: string | null = null, policyVersion: string | null = null) {
 return withAuditTransaction(async (tx) => {
  const row = await perform();
  await tx.insert(notifications).values({ id: newId(ID_PREFIX.notification), tenantId: body.tenantId, userId: row.nomineeUserId, channel: "IN_APP", status: "QUEUED", subject: "Governance appointment update", body: "Review the current appointment record in the governed workspace. This message grants no authority.", linkHref: `/os/governance#appointment-${row.id}` });
  return row;
 }, (row) => ({ tenantId: body.tenantId, actorUserId: p.userId, actorType: "HUMAN", action: `governance.appointment.${command.toLowerCase()}`, objectType: "GOVERNANCE_APPOINTMENT", objectId: row.id, outcome: "SUCCESS", reason: note, oldValue: old ? serial(old) : null, newValue: serial(row), traceId: context.traceId }),
 (row) => ({ type: APPOINTMENT_EVENTS[command], source: "beyu-os/governance", domain: "GOVERNANCE", operation: command, tenantId: body.tenantId, legalEntityId: body.legalEntityId, subjectType: "GOVERNANCE_APPOINTMENT", subjectId: row.id, actorUserId: p.userId, actorType: "HUMAN", classification: row.classification, payload: serial(row), traceId: context.traceId, correlationId: context.traceId, causationId: cause, destinationDomain: null, policyVersion,
 authorityContext: { authorityId: body.id, decisionId: row.resolutionId, capabilityCode: null, permissionCode: command === "ACCEPT" || command === "DECLINE" ? "governance:resolution.read" : "governance:resolution.approve", policyVersion } }));
}
export async function nominateMember(p: Principal, bodyId: string, raw: unknown, context: MutationContext) {
 const input = NominateMemberSchema.parse(raw);
 return withTenantDatabaseContext(p, async () => {
  await db.execute(sql`select set_config('beyu.governance_appointment_actor', ${p.userId}, true)`);
  const body = await readGoverningBody(p, bodyId);
  await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
  const doc = await readBodyDocument(p, body, input.documentId);
  const authority = await authorizeBodyPresider(p, bodyId, doc.classification, "NOMINATE", "appointment");
  const u = await nominee(body, input.nomineeUserId, doc.classification);
  if (u.id === p.userId || u.partyId === p.partyId) throw new GovernanceError("FORBIDDEN", "A presiding officer cannot nominate themselves.");
  if (input.appointedOn < today()) throw fail("A nomination cannot backdate an appointment.");
  return transition(p, body, "NOMINATE", null, async () => {
   const [row] = await db.insert(governanceAppointments).values({ ...input, id: newId(ID_PREFIX.governanceAppointment), bodyId, partyId: u.partyId!, classification: doc.classification, documentVersion: doc.version, documentChecksum: doc.checksum, nominatedByUserId: p.userId }).returning(); return row;
  }, input.rationale, context, null, authority.policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null);
 });
}
export async function commandAppointment(p: Principal, bodyId: string, id: string, raw: unknown, context: MutationContext) {
 const input = AppointmentCommandSchema.parse(raw);
 return withTenantDatabaseContext(p, async () => {
  await db.execute(sql`select set_config('beyu.governance_appointment_actor', ${p.userId}, true)`);
  // Resolve immutable linkage before taking the canonical resolution→body→row locks.
  const initial = await readAppointment(p, bodyId, id);
  const resolutionId = input.command === "APPROVE" ? input.resolutionId : initial.row.resolutionId;
  const operation = async () => {
   await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
   await db.select().from(governanceAppointments).where(eq(governanceAppointments.id, id)).for("update");
   const { body, row } = await readAppointment(p, bodyId, id);
   if (row.revision !== input.expectedRevision) throw new GovernanceError("CONFLICT", "Stale appointment revision.");
   const expected = input.command === "APPROVE" ? "NOMINATED" : input.command === "ACTIVATE" ? "ACCEPTED" : "APPROVED";
   if (row.status !== expected && !(input.command === "DECLINE" && row.status === "ACCEPTED")) throw fail("Invalid appointment transition.");
   // Consent is not authority, but it must not attest to an already-ended term.
   // No arbitrary acceptance TTL is invented; the immutable term is the bound.
   if (input.command === "ACCEPT" && row.retiredOn < today()) throw fail("The appointment term has expired; a new nomination is required.");
   await snapshot(p, body, row);
   let cause: string | null = null, policyVersion: string | null = null;
   if (input.command === "ACCEPT" || input.command === "DECLINE") {
    if (p.userId !== row.nomineeUserId || p.partyId !== row.partyId || !p.mfaSatisfied) throw new GovernanceError("FORBIDDEN", "Only the authenticated human nominee with MFA may consent or decline.");
    const { entity } = await readBodyEntity(body);
    const roles = (await loadGrants(p.userId, p.tenantId)).filter((g) => !g.entityId || g.entityId === body.legalEntityId).map((g) => g.code);
    const policy = await evaluatePolicy({ action: `governance:appointment.${input.command.toLowerCase()}`, tenantId: body.tenantId, entityCode: entity.code, jurisdictionCode: entity.countryCode, roles, classification: row.classification, riskScore: p.riskScore, aiInitiated: false });
    policyVersion = policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null;
    if (policy.effect === "DENY" || policy.obligations.length) throw new GovernanceError("POLICY_DENIED", "Consent policy has undischarged restrictions.");
   } else {
    const authority = await authorizeBodyPresider(p, bodyId, row.classification, input.command, "appointment");
    policyVersion = authority.policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null;
    const [nominator] = await db.select().from(users).where(eq(users.id, row.nominatedByUserId)).for("share");
    if (input.command === "APPROVE" && (!nominator || nominator.partyId === p.partyId)) throw new GovernanceError("FORBIDDEN", "Approval must be independent of the nominating person, not just their account.");
    if (p.partyId === row.partyId || p.userId === row.nomineeUserId || (input.command === "APPROVE" && p.userId === row.nominatedByUserId)) throw new GovernanceError("FORBIDDEN", "Independent presiding approval and activation are required.");
    cause = await mandate(p, bodyId, row, resolutionId!);
    if (input.command === "ACTIVATE") await prospective(body, row);
   }
   return transition(p, body, input.command, row, async () => {
    const memberId = input.command === "ACTIVATE" ? newId(ID_PREFIX.member) : null;
    const [updated] = await db.update(governanceAppointments).set({ revision: row.revision + 1,
     status: input.command === "APPROVE" ? "APPROVED" : input.command === "ACCEPT" ? "ACCEPTED" : input.command === "ACTIVATE" ? "ACTIVE" : "DECLINED",
     ...(input.command === "APPROVE" ? { approvedByUserId: p.userId, resolutionId } : {}),
     ...(input.command === "ACCEPT" ? { acceptedAt: new Date() } : {}),
     ...(input.command === "ACTIVATE" ? { activatedByUserId: p.userId, memberId } : {}),
    }).where(and(eq(governanceAppointments.id, id), eq(governanceAppointments.revision, input.expectedRevision))).returning();
    if (!updated) throw new GovernanceError("CONFLICT", "Concurrent appointment transition.");
    if (memberId) {
     await db.execute(sql`select set_config('beyu.governance_appointment_id', ${id}, true)`);
     await db.insert(governanceMembers).values({ id: memberId, bodyId, partyId: row.partyId, seatRole: row.seatRole, votingRights: row.votingRights, appointedOn: row.appointedOn, retiredOn: row.retiredOn });
    }
    return updated;
   }, input.note, context, cause, policyVersion);
  };
  return resolutionId && (input.command === "APPROVE" || input.command === "ACTIVATE") ? withResolutionAuthorityLock(p, resolutionId, operation) : operation();
 });
}
async function readBodyEntity(body: typeof governanceBodies.$inferSelect) {
 const [entity] = body.legalEntityId ? await db.select().from(legalEntities).where(eq(legalEntities.id, body.legalEntityId)) : [];
 if (!entity || entity.tenantId !== body.tenantId || entity.status !== "ACTIVE" || body.status !== "ACTIVE") throw fail("Active scoped governing entity/body required.");
 return { entity };
}
