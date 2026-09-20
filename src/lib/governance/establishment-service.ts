import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceBodyEstablishments, notifications } from "@/db/schema";
import type { Principal } from "../authz";
import { classificationRank } from "../constants";
import { GovernanceError } from "../governance";
import { withTenantDatabaseContext } from "../tenant-scope";
import { withAuditTransaction } from "../audit";
import { newId, ID_PREFIX } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { authorizeBodyPresider, readBodyDocument, readGoverningBody } from "./body-authority";
import { currentCharterComposition } from "./charter-rules";
import { EstablishmentProposalSchema, EstablishmentCommandSchema, ESTABLISHMENT_EVENTS } from "./establishment-contract";
type Proposal = typeof governanceBodyEstablishments.$inferSelect;
const serial = (v: unknown): Record<string, unknown> => JSON.parse(JSON.stringify(v));
const fail = (message: string) => new GovernanceError("RULE_VIOLATION", message);
export async function listBodyEstablishments(p: Principal, parentId: string) {
 const parent = await readGoverningBody(p, parentId);
 const rows = await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.parentBodyId, parentId));
 return { parent, proposals: rows.filter((r) => classificationRank(r.classification) <= classificationRank(p.clearance)) };
}
export async function readBodyEstablishment(p: Principal, parentId: string, id: string) {
 const view = await listBodyEstablishments(p, parentId), row = view.proposals.find((r) => r.id === id);
 if (!row) throw new GovernanceError("NOT_FOUND", "Body establishment is not visible.");
 return { parent: view.parent, row };
}
async function superior(p: Principal, parentId: string, classification: Proposal["classification"], command: string) {
 const authority = await authorizeBodyPresider(p, parentId, classification, command, "body_establishment");
 if (!["BOARD", "TRUSTEES"].includes(authority.body.bodyType)) throw fail("Only an authorized board or trustees may propose an internal committee in this increment.");
 const composition = await currentCharterComposition(authority.body);
 if (!composition.charter || !composition.satisfied) throw fail("Superior authority requires an adopted readable charter and satisfied composition.");
 return { ...authority, charter: composition.charter };
}
async function changed(p: Principal, parent: typeof governanceBodies.$inferSelect, command: keyof typeof ESTABLISHMENT_EVENTS, old: Proposal | null, perform: () => Promise<Proposal>, note: string, ctx: MutationContext, cause: string | null, policyVersion: string | null) {
 return withAuditTransaction(async (tx) => {
  const row = await perform();
  await tx.insert(notifications).values({ id: newId(ID_PREFIX.notification), tenantId: parent.tenantId, userId: row.proposedByUserId, channel: "IN_APP", status: "QUEUED", subject: "Governance body establishment update", body: "Review the current governed establishment record. This notification grants no authority.", linkHref: `/os/governance#body-establishment-${row.id}` });
  return row;
 },
 (row) => ({ tenantId: parent.tenantId, actorUserId: p.userId, actorType: "HUMAN", action: `governance.body.${command.toLowerCase()}`, objectType: "GOVERNANCE_BODY_ESTABLISHMENT", objectId: row.id, outcome: "SUCCESS", reason: note, oldValue: old ? serial(old) : null, newValue: serial(row), traceId: ctx.traceId }),
 (row) => ({ type: ESTABLISHMENT_EVENTS[command], source: "beyu-os/governance", domain: "GOVERNANCE", operation: command, tenantId: parent.tenantId, legalEntityId: parent.legalEntityId, subjectType: "GOVERNANCE_BODY_ESTABLISHMENT", subjectId: row.id, actorUserId: p.userId, actorType: "HUMAN", classification: row.classification, payload: serial(row), traceId: ctx.traceId, correlationId: ctx.traceId, causationId: cause, destinationDomain: null, policyVersion,
 authorityContext: { authorityId: parent.id, decisionId: row.resolutionId, capabilityCode: null, permissionCode: "governance:resolution.approve", policyVersion } }));
}
async function scoped<T>(p: Principal, fn: () => Promise<T>) {
 try { return await withTenantDatabaseContext(p, async () => { await db.execute(sql`select set_config('beyu.body_establishment_actor', ${p.userId}, true)`); return fn(); }); }
 catch (error) {
  const e = error as { code?: string; cause?: { code?: string } };
  if (e.code === "23505" || e.cause?.code === "23505") throw new GovernanceError("CONFLICT", "Body code or establishment is unavailable; no duplicate was created.");
  throw error;
 }
}
export async function proposeBodyEstablishment(p: Principal, parentId: string, raw: unknown, ctx: MutationContext) {
 const input = EstablishmentProposalSchema.parse(raw);
 return scoped(p, async () => {
  const parent = await readGoverningBody(p, parentId);
  await db.select().from(governanceBodies).where(eq(governanceBodies.id, parentId)).for("update");
  const doc = await readBodyDocument(p, parent, input.documentId), authority = await superior(p, parentId, doc.classification, "PROPOSE");
  if (input.rules.quorumMinimum !== parent.quorumMinimum || input.rules.majorityRule !== parent.majorityRule) throw fail("Initial committee rules must preserve superior quorum and voting controls.");
  const policyVersion = authority.policy.appliedPolicies.map((v) => `${v.code}@${v.version}`).join(",") || null;
  return changed(p, parent, "PROPOSE", null, async () => {
   const [row] = await db.insert(governanceBodyEstablishments).values({ ...input, id: newId(ID_PREFIX.bodyEstablishment), parentBodyId: parentId, parentCharterId: authority.charter.id, documentVersion: doc.version, documentChecksum: doc.checksum, classification: doc.classification, reservedMatters: parent.reservedMatters, proposedByUserId: p.userId, proposedByPartyId: p.partyId }).returning(); return row;
  }, input.purpose, ctx, null, policyVersion);
 });
}
export async function commandBodyEstablishment(p: Principal, parentId: string, id: string, raw: unknown, ctx: MutationContext) {
 const input = EstablishmentCommandSchema.parse(raw);
 return scoped(p, async () => {
  const initial = await readBodyEstablishment(p, parentId, id);
  const resolutionId = input.command === "APPROVE" ? input.resolutionId : initial.row.resolutionId;
  const operation = async () => {
   await db.select().from(governanceBodies).where(eq(governanceBodies.id, parentId)).for("update");
   await db.select().from(governanceBodyEstablishments).where(eq(governanceBodyEstablishments.id, id)).for("update");
   const { parent, row } = await readBodyEstablishment(p, parentId, id);
   const authority = await superior(p, parentId, row.classification, input.command);
   if (row.revision !== input.expectedRevision) throw new GovernanceError("CONFLICT", "Stale establishment revision.");
   if (row.status !== ({ SUBMIT: "DRAFT", APPROVE: "IN_REVIEW", ESTABLISH: "APPROVED" } as const)[input.command]) throw fail("Invalid establishment transition.");
   const doc = await readBodyDocument(p, parent, row.documentId);
   if (authority.charter.id !== row.parentCharterId || doc.version !== row.documentVersion || doc.checksum !== row.documentChecksum || doc.classification !== row.classification || row.rules.quorumMinimum !== parent.quorumMinimum || row.rules.majorityRule !== parent.majorityRule || JSON.stringify(row.reservedMatters) !== JSON.stringify(parent.reservedMatters)) throw fail("Superior mandate or charter instrument changed; propose a new immutable version.");
   let cause: string | null = null;
   if (input.command !== "SUBMIT") {
    if (p.userId === row.proposedByUserId || p.partyId === row.proposedByPartyId) throw new GovernanceError("FORBIDDEN", "Independent superior-body approval and establishment are required.");
    const decision = await authorizeResolutionFollowUp(p, resolutionId!, true), r = decision.resolution;
    if (decision.body.id !== parentId || r.category !== "RESERVED_MATTER" || r.linkedObjectType !== "GOVERNANCE_BODY_ESTABLISHMENT" || r.linkedObjectId !== id || classificationRank(r.classification) < classificationRank(row.classification)) throw fail("A superior-body RESERVED_MATTER decision explicitly approving this establishment is required.");
    cause = decision.decisionEvent.id;
   }
   const policyVersion = authority.policy.appliedPolicies.map((v) => `${v.code}@${v.version}`).join(",") || null;
   return changed(p, parent, input.command, row, async () => {
    const bodyId = input.command === "ESTABLISH" ? newId(ID_PREFIX.body) : null;
    const [updated] = await db.update(governanceBodyEstablishments).set({ status: input.command === "SUBMIT" ? "IN_REVIEW" : input.command === "APPROVE" ? "APPROVED" : "ESTABLISHED", revision: row.revision + 1,
     ...(input.command === "APPROVE" ? { approvedByUserId: p.userId, resolutionId } : {}), ...(bodyId ? { bodyId } : {}) }).where(and(eq(governanceBodyEstablishments.id, id), eq(governanceBodyEstablishments.revision, row.revision))).returning();
    if (!updated) throw new GovernanceError("CONFLICT", "Concurrent establishment transition.");
    if (bodyId) {
     await db.execute(sql`select set_config('beyu.body_establishment_id', ${id}, true)`);
     await db.insert(governanceBodies).values({ id: bodyId, tenantId: parent.tenantId, legalEntityId: parent.legalEntityId, code: row.code, name: row.name, bodyType: "COMMITTEE", quorumMinimum: row.rules.quorumMinimum, majorityRule: row.rules.majorityRule, reservedMatters: row.reservedMatters, charterDocumentId: row.documentId, classification: row.classification, status: "DRAFT" });
    }
    return updated;
   }, input.note, ctx, cause, policyVersion);
  };
  return input.command === "SUBMIT" ? operation() : withResolutionAuthorityLock(p, resolutionId!, operation);
 });
}
