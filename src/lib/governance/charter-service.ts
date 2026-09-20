import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceCharters, governanceCharterTerms, governanceMembers } from "@/db/schema";
import { can, type Principal } from "../authz";
import { classificationRank } from "../constants";
import { withAuditTransaction } from "../audit";
import { GovernanceError } from "../governance";
import { tenantScopeIds } from "../tenant-scope";
import { authorizeBodyPresider as authorize, readBodyDocument as document } from "./body-authority";
import { newId, ID_PREFIX } from "../ids";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { assessComposition } from "./charter-rules";
import { CreateCharterSchema, CharterCommandSchema } from "./charter-contract";

export async function readBodyCharters(principal: Principal, bodyId: string) {
  const [body] = await db.select().from(governanceBodies).where(and(eq(governanceBodies.id, bodyId), inArray(governanceBodies.tenantId, await tenantScopeIds(principal)))).limit(1);
  if (!body || !can(principal, "governance:resolution.read", { entityId: body.legalEntityId ?? undefined }).allowed) throw new GovernanceError("NOT_FOUND", "Governing body is not visible.");
  const rows = await db.select({ header: governanceCharters, terms: governanceCharterTerms }).from(governanceCharters)
    .leftJoin(governanceCharterTerms, eq(governanceCharterTerms.id, governanceCharters.id)).where(eq(governanceCharters.bodyId, body.id)).orderBy(desc(governanceCharters.version));
  return { body, charters: rows.map(({ header, terms }) => ({ ...header,
    terms: terms && classificationRank(terms.classification) <= classificationRank(principal.clearance) ? terms : null })) };
}
function serial(value: unknown): Record<string, unknown> { return JSON.parse(JSON.stringify(value)); }

export async function createBodyCharter(principal: Principal, bodyId: string, raw: unknown, context: MutationContext) {
  const input = CreateCharterSchema.parse(raw);
  return db.transaction(async (tx) => {
    const { body } = await readBodyCharters(principal, bodyId);
    await tx.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
    const doc = await document(principal, body, input.documentId);
    const authority = await authorize(principal, bodyId, doc.classification, "CREATE");
    if (input.rules.quorumMinimum !== body.quorumMinimum || input.rules.majorityRule !== body.majorityRule) throw new GovernanceError("RULE_VIOLATION", "Charter cannot silently change canonical voting rules.");
    const [last] = await tx.select().from(governanceCharters).where(eq(governanceCharters.bodyId, bodyId)).orderBy(desc(governanceCharters.version)).limit(1);
    const id = newId(ID_PREFIX.charter);
    return withAuditTransaction(async (t) => {
      const [header] = await t.insert(governanceCharters).values({ id, bodyId, version: (last?.version ?? 0) + 1, createdByUserId: principal.userId }).returning();
      const [terms] = await t.insert(governanceCharterTerms).values({ id, documentId: doc.id, documentVersion: doc.version, documentChecksum: doc.checksum, purpose: input.purpose, rules: input.rules, classification: doc.classification }).returning();
      return { ...header, terms };
    }, (r) => ({ tenantId: body.tenantId, actorUserId: principal.userId, actorType: "HUMAN", action: "governance.charter.create", objectType: "GOVERNANCE_CHARTER", objectId: id, outcome: "SUCCESS", reason: input.purpose, newValue: serial(r), traceId: context.traceId }),
    (r) => ({ type: "GOVERNANCE_CHARTER_CREATED", source: "beyu-os/governance", domain: "GOVERNANCE", operation: "CREATE_CHARTER", tenantId: body.tenantId, legalEntityId: body.legalEntityId, subjectType: "GOVERNANCE_CHARTER", subjectId: id, actorUserId: principal.userId, actorType: "HUMAN", classification: doc.classification, payload: serial(r), traceId: context.traceId, correlationId: context.traceId, causationId: null,
      destinationDomain: null, authorityContext: { authorityId: body.id, decisionId: null, capabilityCode: null, permissionCode: "governance:resolution.approve", policyVersion: null },
      policyVersion: authority.policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null }));
  });
}

export async function commandBodyCharter(principal: Principal, bodyId: string, charterId: string, raw: unknown, context: MutationContext) {
  const input = CharterCommandSchema.parse(raw);
  const operation = async () => {
    const { body } = await readBodyCharters(principal, bodyId);
    await db.select().from(governanceBodies).where(eq(governanceBodies.id, bodyId)).for("update");
    const [row] = await db.select({ header: governanceCharters, terms: governanceCharterTerms }).from(governanceCharters)
      .innerJoin(governanceCharterTerms, eq(governanceCharterTerms.id, governanceCharters.id))
      .where(and(eq(governanceCharters.id, charterId), eq(governanceCharters.bodyId, bodyId))).for("update", { of: governanceCharters });
    if (!row || classificationRank(row.terms.classification) > classificationRank(principal.clearance)) throw new GovernanceError("NOT_FOUND", "Charter is not visible.");
    const { header, terms } = row;
    const checked = await authorize(principal, bodyId, terms.classification, input.command);
    if (header.revision !== input.expectedRevision) throw new GovernanceError("CONFLICT", "Stale charter revision.");
    if (header.status !== (input.command === "SUBMIT" ? "DRAFT" : "IN_REVIEW")) throw new GovernanceError("RULE_VIOLATION", "Invalid charter transition.");
    const doc = await document(principal, body, terms.documentId);
    if (doc.version !== terms.documentVersion || doc.checksum !== terms.documentChecksum) throw new GovernanceError("RULE_VIOLATION", "Charter document changed; propose a new version.");
    let cause: string | null = null;
    if (input.command === "ADOPT") {
      const authority = await authorizeResolutionFollowUp(principal, input.resolutionId, true);
      if (authority.body.id !== bodyId || authority.resolution.category !== "POLICY" || authority.resolution.linkedObjectType !== "GOVERNANCE_CHARTER" || authority.resolution.linkedObjectId !== charterId || classificationRank(authority.resolution.classification) < classificationRank(terms.classification)) throw new GovernanceError("RULE_VIOLATION", "An appropriately classified POLICY decision explicitly approving this charter is required.");
      if (header.createdByUserId === principal.userId) throw new GovernanceError("FORBIDDEN", "The charter author cannot record their own adoption.");
      const members = await db.select().from(governanceMembers).where(eq(governanceMembers.bodyId, bodyId));
      const assessment = assessComposition(terms.rules, members);
      if (!assessment.satisfied || terms.rules.quorumMinimum !== body.quorumMinimum || terms.rules.majorityRule !== body.majorityRule) throw new GovernanceError("RULE_VIOLATION", "Current composition/voting rules do not satisfy the proposed charter.");
      const [current] = await db.select().from(governanceCharters).where(and(eq(governanceCharters.bodyId, bodyId), eq(governanceCharters.status, "ADOPTED"))).orderBy(desc(governanceCharters.version)).limit(1);
      if (current && current.version >= header.version) throw new GovernanceError("RULE_VIOLATION", "An older version cannot supersede current adopted terms.");
      cause = authority.decisionEvent.id;
    }
    return withAuditTransaction(async (tx) => {
      const [updated] = await tx.update(governanceCharters).set({ revision: header.revision + 1, status: input.command === "SUBMIT" ? "IN_REVIEW" : "ADOPTED",
        ...(input.command === "ADOPT" ? { resolutionId: input.resolutionId, adoptedByUserId: principal.userId, adoptedAt: new Date() } : {}) }).where(and(eq(governanceCharters.id, charterId), eq(governanceCharters.revision, input.expectedRevision))).returning();
      if (!updated) throw new GovernanceError("CONFLICT", "Concurrent charter change.");
      return updated;
    }, (r) => ({ tenantId: body.tenantId, actorUserId: principal.userId, actorType: "HUMAN", action: `governance.charter.${input.command.toLowerCase()}`, objectType: "GOVERNANCE_CHARTER", objectId: charterId, outcome: "SUCCESS", reason: input.note, oldValue: serial(header), newValue: serial(r), traceId: context.traceId }),
    (r) => ({ type: input.command === "SUBMIT" ? "GOVERNANCE_CHARTER_SUBMITTED" : "GOVERNANCE_CHARTER_ADOPTED", source: "beyu-os/governance", domain: "GOVERNANCE", operation: input.command, tenantId: body.tenantId, legalEntityId: body.legalEntityId, subjectType: "GOVERNANCE_CHARTER", subjectId: charterId, actorUserId: principal.userId, actorType: "HUMAN", classification: terms.classification, payload: serial(r), traceId: context.traceId, correlationId: context.traceId, causationId: cause, destinationDomain: null,
      authorityContext: { authorityId: bodyId, decisionId: input.command === "ADOPT" ? input.resolutionId : null, capabilityCode: null, permissionCode: "governance:resolution.approve", policyVersion: null },
      policyVersion: checked.policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null }));
  };
  return input.command === "ADOPT" ? withResolutionAuthorityLock(principal, input.resolutionId, operation) : db.transaction(operation);
}

export async function assertCharterReadable(principal: Principal, bodyId: string, charterId: string) {
  const row = (await readBodyCharters(principal, bodyId)).charters.find((c) => c.id === charterId);
  if (!row?.terms) throw new GovernanceError("NOT_FOUND", "Charter terms are not visible.");
}
export async function canManageCharters(principal: Principal, bodyId: string) {
  try { await authorize(principal, bodyId, principal.clearance, "CREATE"); return true; }
  catch (e) { if (e instanceof GovernanceError) return false; throw e; }
}
