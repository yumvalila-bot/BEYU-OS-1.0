import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { governanceAppointments, governanceBodies, governanceBodyActivations, governanceCharters, governanceCharterTerms, governanceMembers } from "@/db/schema";
import type { Principal } from "../authz";
import { classificationRank, type Classification } from "../constants";
import { GovernanceError } from "../governance";
import { withTenantDatabaseContext } from "../tenant-scope";
import { withAuditTransaction } from "../audit";
import { ID_PREFIX, newId } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { readGoverningBody } from "./body-authority";
import { authorizeAppointmentPresider } from "./appointment-authority";
import { activatePlannedAppointment, assertAppointmentSnapshot, appointmentMandate } from "./appointment-service";
import { authorizeEstablishmentSuperior } from "./establishment-service";
import { assessComposition } from "./charter-rules";
import { ACTIVATION_EVENTS, ActivationCommandSchema, ActivationProposalSchema } from "./activation-contract";
type Plan = typeof governanceBodyActivations.$inferSelect;
const serial = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));
const fail = (message: string) => new GovernanceError("RULE_VIOLATION", message);
export async function listBodyActivations(p: Principal, bodyId: string) {
 const body = await readGoverningBody(p, bodyId);
 const rows = await db.select().from(governanceBodyActivations).where(eq(governanceBodyActivations.bodyId, bodyId));
 return { body, plans: rows.filter((r) => classificationRank(r.classification) <= classificationRank(p.clearance)) };
}
async function readPlan(p: Principal, bodyId: string, id: string) {
 const { body, plans } = await listBodyActivations(p, bodyId), row = plans.find((r) => r.id === id);
 if (!row) throw new GovernanceError("NOT_FOUND", "Activation plan is not visible.");
 return { body, row };
}
async function prepared(p: Principal, bodyId: string, ids: string[], command: string) {
 const body = await readGoverningBody(p, bodyId);
 if (body.status !== "DRAFT" || body.bodyType !== "COMMITTEE") throw fail("Only a dormant established committee can use initial activation.");
 if ((await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, bodyId))).length) throw fail("Initial activation cannot replace or silently alter existing membership.");
 const nominations = await db.select().from(governanceAppointments).where(and(eq(governanceAppointments.bodyId, bodyId), inArray(governanceAppointments.id, ids))).orderBy(governanceAppointments.id).for("update");
 const today = new Date().toISOString().slice(0,10);
 if (nominations.length !== ids.length || new Set(ids).size !== ids.length || nominations.some((n) => n.status !== "ACCEPTED" || !n.nominatedByPartyId || !n.approvedByPartyId || !n.initialCharterId || !n.acceptedAt || n.appointedOn < today || n.retiredOn < today)) throw fail("Every exact initial nomination needs current dated consent and immutable human provenance.");
 const classification = nominations.reduce<Classification>((level, n) => classificationRank(n.classification) > classificationRank(level) ? n.classification : level, "PUBLIC");
 const authority = await authorizeAppointmentPresider(p, bodyId, classification, command, true);
 const planAuthority = await authorizeEstablishmentSuperior(p, authority.authorityBodyId, classification, command === "PROPOSE_ACTIVATION" ? "PROPOSE" : command, "body_activation");
 authority.policy.appliedPolicies.push(...planAuthority.policy.appliedPolicies);
 if (!authority.initialCharterId || nominations.some((n) => n.initialCharterId !== authority.initialCharterId || n.authorityBodyId !== authority.authorityBodyId)) throw fail("All nominations must pin the same current superior-approved charter.");
 const [terms] = await db.select().from(governanceCharterTerms).where(eq(governanceCharterTerms.id, authority.initialCharterId));
 if (!terms) throw fail("Initial composition rules are unavailable.");
 for (const n of nominations) {
  await assertAppointmentSnapshot(p, body, n);
  if (!n.resolutionId) throw fail("Every initial appointment needs a current governed mandate.");
  await appointmentMandate(p, authority.authorityBodyId, n, n.resolutionId);
 }

 const boundaries = new Set([today]);
 const end = nominations.reduce((last, n) => n.retiredOn > last ? n.retiredOn : last, today);
 for (const n of nominations) {
  boundaries.add(n.appointedOn); boundaries.add(n.retiredOn);
  const next = new Date(new Date(n.retiredOn).valueOf() + 86400000).toISOString().slice(0,10);
  if (next <= end) boundaries.add(next);
 }
 for (const date of boundaries) if (!assessComposition(terms.rules, nominations, date).satisfied) throw fail("The whole initial composition violates mandatory rules at a term boundary.");
 return { body, nominations, classification, authority };
}
async function changed(p: Principal, body: typeof governanceBodies.$inferSelect, command: keyof typeof ACTIVATION_EVENTS, old: Plan | null, perform: () => Promise<Plan>, note: string, ctx: MutationContext, cause: string | null, policyVersion: string | null) {
 return withAuditTransaction(perform,
 (row) => ({ tenantId: body.tenantId, actorUserId: p.userId, actorType: "HUMAN", action: `governance.body_activation.${command.toLowerCase()}`, objectType: command === "ACTIVATE" ? "GOVERNANCE_BODY" : "GOVERNANCE_BODY_ACTIVATION", objectId: command === "ACTIVATE" ? body.id : row.id, outcome: "SUCCESS", reason: note, oldValue: command === "ACTIVATE" ? { plan: serial(old), body: serial(body) } : old ? serial(old) : null, newValue: command === "ACTIVATE" ? { plan: serial(row), body: serial({ ...body, status: "ACTIVE" }) } : serial(row), traceId: ctx.traceId }),
 (row) => ({ type: ACTIVATION_EVENTS[command], source: "beyu-os/governance", domain: "GOVERNANCE", operation: command, tenantId: body.tenantId, legalEntityId: body.legalEntityId, subjectType: command === "ACTIVATE" ? "GOVERNANCE_BODY" : "GOVERNANCE_BODY_ACTIVATION", subjectId: command === "ACTIVATE" ? body.id : row.id, actorUserId: p.userId, actorType: "HUMAN", classification: row.classification, payload: serial(row), traceId: ctx.traceId, correlationId: ctx.traceId, causationId: cause, destinationDomain: null, policyVersion,
 authorityContext: { authorityId: row.authorityBodyId, decisionId: row.resolutionId, capabilityCode: null, permissionCode: "governance:resolution.approve", policyVersion } }));
}
async function scoped<T>(p: Principal, fn: () => Promise<T>) {
 return withTenantDatabaseContext(p, async () => { await db.execute(sql`select set_config('beyu.body_activation_actor', ${p.userId}, true)`); return fn(); });
}
export async function proposeBodyActivation(p: Principal, bodyId: string, raw: unknown, ctx: MutationContext) {
 const input = ActivationProposalSchema.parse(raw);
 return scoped(p, async () => {
  await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
  const checked = await prepared(p, bodyId, input.nominationIds, "PROPOSE_ACTIVATION");
  const policyVersion = checked.authority.policy.appliedPolicies.map((v) => `${v.code}@${v.version}`).join(",") || null;
  return changed(p, checked.body, "PROPOSE", null, async () => {
   const [row] = await db.insert(governanceBodyActivations).values({ id: newId(ID_PREFIX.bodyActivation), bodyId, authorityBodyId: checked.authority.authorityBodyId, initialCharterId: checked.authority.initialCharterId!, nominationIds: [...input.nominationIds].sort(), rationale: input.rationale, classification: checked.classification, proposedByUserId: p.userId, proposedByPartyId: p.partyId }).returning(); return row;
  }, input.rationale, ctx, null, policyVersion);
 });
}
export async function commandBodyActivation(p: Principal, bodyId: string, id: string, raw: unknown, ctx: MutationContext) {
 const input = ActivationCommandSchema.parse(raw);
 return scoped(p, async () => {
  const initial = await readPlan(p, bodyId, id), resolutionId = input.command === "APPROVE" ? input.resolutionId : initial.row.resolutionId;
  const operation = async () => {
   await db.select().from(governanceBodies).where(eq(governanceBodies.id, initial.row.authorityBodyId)).for("update");
   await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
   await db.select().from(governanceBodyActivations).where(eq(governanceBodyActivations.id, id)).for("update");
   const { body, row } = await readPlan(p, bodyId, id);
   if (row.revision !== input.expectedRevision) throw new GovernanceError("CONFLICT", "Stale activation plan revision.");
   if (row.status !== ({ SUBMIT: "DRAFT", APPROVE: "IN_REVIEW", ACTIVATE: "APPROVED" } as const)[input.command]) throw fail("Invalid activation plan transition.");
   const checked = await prepared(p, bodyId, row.nominationIds, input.command);
   if (row.authorityBodyId !== checked.authority.authorityBodyId || row.initialCharterId !== checked.authority.initialCharterId || row.classification !== checked.classification) throw fail("Activation evidence changed; propose a new immutable plan.");
   let cause: string | null = null;
   if (input.command !== "SUBMIT") {
    if (p.userId === row.proposedByUserId || p.partyId === row.proposedByPartyId || checked.nominations.some((n) => n.partyId === p.partyId || n.nomineeUserId === p.userId)) throw new GovernanceError("FORBIDDEN", "Independent superior approval/activation cannot appoint the actor or approve their own plan.");
    const decision = await authorizeResolutionFollowUp(p, resolutionId!, true), r = decision.resolution;
    if (decision.body.id !== row.authorityBodyId || r.category !== "RESERVED_MATTER" || r.linkedObjectType !== "GOVERNANCE_BODY_ACTIVATION" || r.linkedObjectId !== id || classificationRank(r.classification) < classificationRank(row.classification)) throw fail("An exact superior RESERVED_MATTER decision on this frozen composition plan is required.");
    cause = decision.decisionEvent.id;
   }
   const policyVersion = checked.authority.policy.appliedPolicies.map((v) => `${v.code}@${v.version}`).join(",") || null;
   return changed(p, body, input.command, row, async () => {
    await db.execute(sql`select set_config('beyu.body_activation_id', ${id}, true)`);
    const [updated] = await db.update(governanceBodyActivations).set({ revision: row.revision + 1, status: input.command === "SUBMIT" ? "IN_REVIEW" : input.command === "APPROVE" ? "APPROVED" : "ACTIVE",
     ...(input.command === "APPROVE" ? { resolutionId, approvedByUserId: p.userId, approvedByPartyId: p.partyId } : {}),
     ...(input.command === "ACTIVATE" ? { activatedAt: new Date(), activatedByUserId: p.userId } : {}),
    }).where(and(eq(governanceBodyActivations.id, id), eq(governanceBodyActivations.revision, row.revision))).returning();
    if (!updated) throw new GovernanceError("CONFLICT", "Concurrent activation plan transition.");
    if (input.command === "ACTIVATE") {
     for (const n of checked.nominations) await activatePlannedAppointment(p, bodyId, n.id, n.revision, id, ctx);
     const [charter] = await db.select().from(governanceCharters).where(eq(governanceCharters.id, row.initialCharterId)).for("update");
     await db.execute(sql`select set_config('beyu.governance_charter_actor', ${p.userId}, true)`);
     await withAuditTransaction(async (tx) => {
      const [effective] = await tx.update(governanceCharters).set({ status: "ADOPTED", revision: charter.revision + 1 }).where(eq(governanceCharters.id, charter.id)).returning(); return effective;
     }, (effective) => ({ tenantId: body.tenantId, actorUserId: p.userId, actorType: "HUMAN", action: "governance.charter.effectuate_initial", objectType: "GOVERNANCE_CHARTER", objectId: charter.id, outcome: "SUCCESS", reason: input.note, oldValue: serial(charter), newValue: serial(effective), traceId: ctx.traceId }),
     (effective) => ({ type: "GOVERNANCE_CHARTER_ADOPTED", source: "beyu-os/governance", domain: "GOVERNANCE", operation: "EFFECTUATE_INITIAL", tenantId: body.tenantId, legalEntityId: body.legalEntityId, subjectType: "GOVERNANCE_CHARTER", subjectId: charter.id, actorUserId: p.userId, actorType: "HUMAN", classification: row.classification, payload: { ...serial(effective), activationPlanId: id, effectiveAt: updated.activatedAt?.toISOString() }, traceId: ctx.traceId, correlationId: ctx.traceId, causationId: cause, destinationDomain: null, policyVersion,
      authorityContext: { authorityId: row.authorityBodyId, decisionId: row.resolutionId, capabilityCode: null, permissionCode: "governance:resolution.approve", policyVersion } }));
     await db.update(governanceBodies).set({ status: "ACTIVE" }).where(eq(governanceBodies.id, bodyId));
    }
    return updated;
   }, input.note, ctx, cause, policyVersion);
  };
  return resolutionId && input.command !== "SUBMIT" ? withResolutionAuthorityLock(p, resolutionId, operation) : operation();
 });
}
