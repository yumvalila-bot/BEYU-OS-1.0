/** Shared presiding authority and governing-instrument checks; no new grant. */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, governanceBodies, governanceMembers, legalEntities, users } from "@/db/schema";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../authz";
import { classificationRank, type Classification } from "../constants";
import { GovernanceError } from "../governance";
import { tenantScopeIds } from "../tenant-scope";
import { evaluatePolicy } from "../policy";
import { hasEffectiveConstitution } from "./constitution";
export async function readGoverningBody(principal: Principal, bodyId: string) {
 const [body] = await db.select().from(governanceBodies).where(and(eq(governanceBodies.id, bodyId), inArray(governanceBodies.tenantId, await tenantScopeIds(principal)))).limit(1);
 if (!body || !can(principal, "governance:resolution.read", { entityId: body.legalEntityId ?? undefined }).allowed) throw new GovernanceError("NOT_FOUND", "Governing body is not visible.");
 return body;
}
export async function authorizeBodyPresider(principal: Principal, bodyId: string, classification: Classification, command: string, domain = "charter") {
  const body = await readGoverningBody(principal, bodyId);
  const [actor] = await db.select().from(users).where(eq(users.id, principal.userId)).for("share");
  const grants = (await loadGrants(principal.userId, principal.tenantId))
    .filter((grant) => !grant.entityId || grant.entityId === body.legalEntityId);
  const roles = grants.map((g) => g.code);
  const entities = grants.flatMap((g) => g.entityId ? [g.entityId] : []);
  const [entity] = body.legalEntityId ? await db.select().from(legalEntities).where(eq(legalEntities.id, body.legalEntityId)).limit(1) : [];
  const seats = await db.select().from(governanceMembers).where(and(eq(governanceMembers.bodyId, body.id), eq(governanceMembers.partyId, principal.partyId)));
  const today = new Date().toISOString().slice(0, 10);
  if (!actor || actor.status !== "ACTIVE" || actor.isServiceAccount || actor.partyId !== principal.partyId || !principal.mfaSatisfied ||
      body.status !== "ACTIVE" || !entity || entity.status !== "ACTIVE" || entity.tenantId !== body.tenantId ||
      !can(principal, "governance:resolution.approve", { tenantId: body.tenantId, entityId: body.legalEntityId!, classification }).allowed ||
      !permissionsForRoles(roles).has("governance:resolution.approve") || classificationRank(clearanceForRoles(roles)) < classificationRank(classification) ||
      (entities.length && !entities.includes(body.legalEntityId!)) ||
      !seats.some((s) => s.lifecycleStatus === "ACTIVE" && ["CHAIR", "SECRETARY"].includes(s.seatRole) && s.appointedOn <= today && (!s.retiredOn || s.retiredOn >= today))) {
    throw new GovernanceError("FORBIDDEN", "Current scoped presiding human authority with MFA is required.");
  }
  if (!await hasEffectiveConstitution()) throw new GovernanceError("POLICY_DENIED", "An effective constitution is required.");
  const policy = await evaluatePolicy({ action: `governance:${domain}.${command.toLowerCase()}`, tenantId: body.tenantId, entityCode: entity.code,
    jurisdictionCode: entity.countryCode, roles, classification, riskScore: principal.riskScore, aiInitiated: false });
  if (policy.effect === "DENY" || policy.obligations.length) throw new GovernanceError("POLICY_DENIED", "Governing-body policy denies this action or has undischarged obligations.");
  const permissionPolicy = await evaluatePolicy({ action: "governance:resolution.approve", tenantId: body.tenantId, entityCode: entity.code,
    jurisdictionCode: entity.countryCode, roles, classification, riskScore: principal.riskScore, aiInitiated: false });
  if (permissionPolicy.effect === "DENY" || permissionPolicy.obligations.length) throw new GovernanceError("POLICY_DENIED", "Approval capability policy has undischarged restrictions.");
  policy.appliedPolicies.push(...permissionPolicy.appliedPolicies);
  return { body, entity, policy };
}
export async function readBodyDocument(principal: Principal, body: typeof governanceBodies.$inferSelect, id: string) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.tenantId, body.tenantId))).for("share");
  const [entity] = body.legalEntityId ? await db.select().from(legalEntities).where(eq(legalEntities.id, body.legalEntityId)).limit(1) : [];
  if (!doc || !can(principal, "documents:registry.read", { tenantId: body.tenantId, entityId: body.legalEntityId ?? undefined, classification: doc.classification }).allowed) throw new GovernanceError("NOT_FOUND", "Governing instrument is not visible.");
  if (doc.authorityStatus !== "AUTHORITATIVE" || doc.supersededById || !/^[a-f0-9]{64}$/i.test(doc.checksum) ||
    (doc.effectiveDate && doc.effectiveDate > new Date().toISOString().slice(0, 10)) ||
    (doc.entityScope && doc.entityScope !== "*" && doc.entityScope !== entity?.code) || (doc.jurisdictionCode && doc.jurisdictionCode !== entity?.countryCode)) throw new GovernanceError("RULE_VIOLATION", "Current authoritative document in the body's entity/country is required.");
  return doc;
}
