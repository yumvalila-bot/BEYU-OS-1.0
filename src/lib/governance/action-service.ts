/** Mandated work recording, NOT a domain execution engine. No Finance/AI adapter. */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, governanceActionEvidence, governanceBodies, legalEntities, notifications, resolutions, tasks, users } from "@/db/schema";
import { can, clearanceForRoles, loadGrants, permissionsForRoles, type Principal } from "../authz";
import { withAuditTransaction, type EventInput } from "../audit";
import { classificationRank } from "../constants";
import { newId, ID_PREFIX } from "../ids";
import { tenantScopeIds } from "../tenant-scope";
import { evaluatePolicy } from "../policy";
import { GovernanceError } from "../governance";
import { authorizeResolutionFollowUp, withResolutionAuthorityLock, type MutationContext } from "../governance-vote-service";
import { ACTION_EVENT_TYPES, ActionCommandSchema, CreateActionSchema, canTransitionAction, type ActionCommand, type CreateActionInput } from "./action-contract";

type Authority = Awaited<ReturnType<typeof authorizeResolutionFollowUp>>;
type Task = typeof tasks.$inferSelect;
const PRESIDING = new Set(["ASSIGN", "RETURN", "VERIFY", "CLOSE"]);
const NEXT: Record<string, string> = { ASSIGN: "ASSIGNED", START: "IN_PROGRESS", BLOCK: "BLOCKED", RESUME: "IN_PROGRESS", COMPLETE: "COMPLETED", RETURN: "IN_PROGRESS", VERIFY: "VERIFIED", CLOSE: "CLOSED" };

function summary(task: Task) {
  return { title: task.title, description: task.description, priority: task.priority,
    dueAt: task.dueAt?.toISOString() ?? null, dependsOnTaskId: task.dependsOnTaskId,
    status: task.status, version: task.version, assigneeUserId: task.assigneeUserId,
    sourceResolutionId: task.sourceResolutionId, completedByUserId: task.completedByUserId,
    completedAt: task.completedAt?.toISOString() ?? null, verifiedByUserId: task.verifiedByUserId,
    verifiedAt: task.verifiedAt?.toISOString() ?? null, closedAt: task.closedAt?.toISOString() ?? null };
}
function event(authority: Authority, principal: Principal, task: Task, command: string, context: MutationContext): EventInput {
  return { type: ACTION_EVENT_TYPES[command], source: "beyu-os/governance", domain: "GOVERNANCE",
    operation: command, destinationDomain: null, tenantId: task.tenantId, legalEntityId: authority.body.legalEntityId,
    subjectType: "GOVERNANCE_ACTION", subjectId: task.id, actorUserId: principal.userId, actorType: "HUMAN",
    classification: authority.resolution.classification, payload: summary(task), traceId: context.traceId,
    correlationId: context.traceId, causationId: authority.decisionEvent.id,
    policyVersion: authority.policy.appliedPolicies.map((p) => `${p.code}@${p.version}`).join(",") || null,
    authorityContext: { authorityId: authority.resolution.id, decisionId: authority.resolution.id,
      capabilityCode: null, permissionCode: command === "CREATE" || PRESIDING.has(command) ? "governance:resolution.approve" : "governance:resolution.read", policyVersion: null } };
}
async function actionPolicy(authority: Authority, principal: Principal, command: string) {
  const [entity] = authority.body.legalEntityId
    ? await db.select().from(legalEntities).where(eq(legalEntities.id, authority.body.legalEntityId)).limit(1) : [];
  const policy = await evaluatePolicy({ action: `governance:action.${command.toLowerCase()}`, tenantId: authority.resolution.tenantId,
    entityCode: entity?.code, jurisdictionCode: entity?.countryCode, roles: authority.livePrincipal.roles,
    classification: authority.resolution.classification, riskScore: principal.riskScore, aiInitiated: false });
  if (policy.effect === "DENY" || policy.obligations.length) throw new GovernanceError("POLICY_DENIED", "Action policy denies this command or requires undischarged approval.");
  authority.policy.appliedPolicies.push(...policy.appliedPolicies);
}
async function assertAssignee(id: string, authority: Authority) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user || user.status !== "ACTIVE" || user.isServiceAccount || user.primaryTenantId !== authority.resolution.tenantId) {
    throw new GovernanceError("FORBIDDEN", "Assignee must be an active human in the resolution tenant.");
  }
  const grants = await loadGrants(id, user.primaryTenantId);
  const roles = grants.map((g) => g.code);
  const entities = grants.map((g) => g.entityId).filter((e): e is string => !!e);
  if (!permissionsForRoles(roles).has("governance:resolution.read") ||
      classificationRank(clearanceForRoles(roles)) < classificationRank(authority.resolution.classification) ||
      (entities.length && (!authority.body.legalEntityId || !entities.includes(authority.body.legalEntityId)))) {
    throw new GovernanceError("FORBIDDEN", "Assignee lacks current scope or clearance for this mandate.");
  }
}
async function evidenceDocument(principal: Principal, authority: Authority, id: string) {
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.tenantId, authority.resolution.tenantId))).for("share");
  if (!doc || !can(principal, "documents:registry.read", { tenantId: doc.tenantId, classification: doc.classification, entityId: authority.body.legalEntityId ?? undefined }).allowed) {
    throw new GovernanceError("NOT_FOUND", "Evidence document not found within your authorized scope.");
  }
  const [entity] = authority.body.legalEntityId
    ? await db.select().from(legalEntities).where(eq(legalEntities.id, authority.body.legalEntityId)).limit(1) : [];
  if (doc.authorityStatus !== "AUTHORITATIVE" || doc.supersededById || !/^[a-f0-9]{64}$/i.test(doc.checksum) ||
      (doc.effectiveDate && doc.effectiveDate > new Date().toISOString().slice(0, 10)) ||
      classificationRank(doc.classification) > classificationRank(authority.resolution.classification) ||
      (doc.entityScope && doc.entityScope !== "*" && doc.entityScope !== entity?.code) ||
      (doc.jurisdictionCode && doc.jurisdictionCode !== entity?.countryCode)) {
    throw new GovernanceError("RULE_VIOLATION", "Evidence must be current, authoritative and within the mandate's entity, country and classification scope.");
  }
  return doc;
}
async function verifyEvidence(principal: Principal, authority: Authority, taskId: string) {
  const entries = await db.select().from(governanceActionEvidence).where(eq(governanceActionEvidence.taskId, taskId));
  if (!entries.length) throw new GovernanceError("RULE_VIOLATION", "Document evidence is required.");
  for (const id of [...new Set(entries.map((e) => e.documentId))].sort()) {
    const doc = await evidenceDocument(principal, authority, id);
    if (!entries.some((e) => e.documentId === id && e.documentVersion === doc.version && e.documentChecksum === doc.checksum)) {
      throw new GovernanceError("RULE_VIOLATION", "Document evidence changed; return for rework and submit the current version.");
    }
  }
}
async function notify(task: Task, recipient: string, classification: Authority["resolution"]["classification"], subject: string) {
  await db.insert(notifications).values({ id: newId("NTF"), tenantId: task.tenantId, userId: recipient,
    channel: "IN_APP", urgency: task.priority, subject, body: "A governance action requires your attention. Access is rechecked when opened.",
    classification, linkHref: `/os/governance#resolution-${encodeURIComponent(task.sourceResolutionId!)}`, status: "QUEUED" });
}

export async function createGovernanceAction(principal: Principal, resolutionId: string, raw: CreateActionInput, context: MutationContext) {
  const input = CreateActionSchema.parse(raw);
  if (new Date(input.dueAt).getTime() <= Date.now()) throw new GovernanceError("RULE_VIOLATION", "The deadline must be in the future.");
  return withResolutionAuthorityLock(principal, resolutionId, async () => {
    const authority = await authorizeResolutionFollowUp(principal, resolutionId, true);
    await actionPolicy(authority, principal, "CREATE");
    if (input.dependsOnTaskId) {
      const [dependency] = await db.select().from(tasks).where(and(eq(tasks.id, input.dependsOnTaskId), eq(tasks.sourceResolutionId, resolutionId))).limit(1);
      if (!dependency) throw new GovernanceError("NOT_FOUND", "Dependency must belong to this resolution.");
    }
    return withAuditTransaction(async (tx) => {
      const [task] = await tx.insert(tasks).values({ id: newId(ID_PREFIX.task), tenantId: authority.resolution.tenantId,
        sourceResolutionId: resolutionId, title: input.title, description: input.description, priority: input.priority,
        dueAt: new Date(input.dueAt), dependsOnTaskId: input.dependsOnTaskId ?? null, createdByUserId: principal.userId, status: "OPEN" }).returning();
      return task;
    }, (task) => ({ tenantId: task.tenantId, actorUserId: principal.userId, actorType: "HUMAN",
      action: "governance.action.create", objectType: "GOVERNANCE_ACTION", objectId: task.id,
      outcome: "SUCCESS", authority: resolutionId, reason: input.description, newValue: summary(task), traceId: context.traceId,
    }), (task) => event(authority, principal, task, "CREATE", context));
  });
}

export async function commandGovernanceAction(principal: Principal, taskId: string, raw: ActionCommand, context: MutationContext) {
  const input = ActionCommandSchema.parse(raw);
  const scope = await tenantScopeIds(principal);
  const [target] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), inArray(tasks.tenantId, scope))).limit(1);
  if (!target?.sourceResolutionId) throw new GovernanceError("NOT_FOUND", "Governance action not found.");
  return withResolutionAuthorityLock(principal, target.sourceResolutionId, async () => {
    const authority = await authorizeResolutionFollowUp(principal, target.sourceResolutionId!, PRESIDING.has(input.command));
    await actionPolicy(authority, principal, input.command);
    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).for("update");
    if (!task || task.sourceResolutionId !== target.sourceResolutionId || task.tenantId !== authority.resolution.tenantId) throw new GovernanceError("NOT_FOUND", "Governance action not found.");
    if (task.version !== input.expectedVersion) throw new GovernanceError("CONFLICT", "Stale action revision; reload before retrying.");
    if (!PRESIDING.has(input.command) && task.assigneeUserId !== principal.userId) throw new GovernanceError("FORBIDDEN", "Only the accountable assignee may record progress or evidence.");
    if (input.command === "VERIFY" && (task.completedByUserId === principal.userId || task.assigneeUserId === principal.userId)) {
      throw new GovernanceError("FORBIDDEN", "Independent verification is required; the owner or completer cannot verify their own work.");
    }
    const next = input.command === "SUBMIT_EVIDENCE" ? "IN_PROGRESS" : NEXT[input.command];
    if (input.command === "SUBMIT_EVIDENCE" ? task.status !== "IN_PROGRESS" : !canTransitionAction(task.status, next)) {
      throw new GovernanceError("RULE_VIOLATION", "Invalid action transition.");
    }
    if (task.dependsOnTaskId && ["START", "RESUME", "COMPLETE", "VERIFY", "CLOSE"].includes(input.command)) {
      const [dependency] = await db.select().from(tasks).where(and(eq(tasks.id, task.dependsOnTaskId), eq(tasks.sourceResolutionId, task.sourceResolutionId!))).limit(1);
      if (!dependency || !["VERIFIED", "CLOSED"].includes(dependency.status)) throw new GovernanceError("RULE_VIOLATION", "Dependency must be independently verified first.");
    }
    if (input.command === "ASSIGN") await assertAssignee(input.assigneeUserId, authority);
    if (["COMPLETE", "VERIFY", "CLOSE"].includes(input.command)) await verifyEvidence(principal, authority, task.id);
    const doc = input.command === "SUBMIT_EVIDENCE" ? await evidenceDocument(principal, authority, input.documentId) : null;
    if (doc) {
      const [duplicate] = await db.select().from(governanceActionEvidence).where(and(eq(governanceActionEvidence.taskId, task.id),
        eq(governanceActionEvidence.documentId, doc.id), eq(governanceActionEvidence.documentVersion, doc.version), eq(governanceActionEvidence.documentChecksum, doc.checksum))).limit(1);
      if (duplicate) throw new GovernanceError("CONFLICT", "This exact document version is already linked.");
    }
    return withAuditTransaction(async (tx) => {
      if (doc) await tx.insert(governanceActionEvidence).values({ id: newId(ID_PREFIX.actionEvidence), taskId: task.id,
        documentId: doc.id, documentVersion: doc.version, documentChecksum: doc.checksum,
        submittedByUserId: principal.userId, note: input.note });
      const now = new Date();
      const [updated] = await tx.update(tasks).set({ status: next, version: task.version + 1,
        ...(input.command === "ASSIGN" ? { assigneeUserId: input.assigneeUserId } : {}),
        ...(input.command === "COMPLETE" ? { completedByUserId: principal.userId, completedAt: now } : {}),
        ...(input.command === "RETURN" ? { completedByUserId: null, completedAt: null } : {}),
        ...(input.command === "VERIFY" ? { verifiedByUserId: principal.userId, verifiedAt: now } : {}),
        ...(input.command === "CLOSE" ? { closedAt: now } : {}),
      }).where(and(eq(tasks.id, task.id), eq(tasks.version, input.expectedVersion))).returning();
      if (!updated) throw new GovernanceError("CONFLICT", "Concurrent action change; reload before retrying.");
      if (input.command === "ASSIGN") await notify(updated, updated.assigneeUserId!, authority.resolution.classification, "Governance action assigned");
      if (input.command === "COMPLETE" || input.command === "RETURN") await notify(updated,
        input.command === "RETURN" ? updated.assigneeUserId! : updated.createdByUserId!, authority.resolution.classification,
        input.command === "RETURN" ? "Governance action returned for rework" : "Governance action awaits independent verification");
      return updated;
    }, (updated) => ({ tenantId: task.tenantId, actorUserId: principal.userId, actorType: "HUMAN",
      action: `governance.action.${input.command.toLowerCase()}`, objectType: "GOVERNANCE_ACTION", objectId: task.id,
      outcome: "SUCCESS", authority: task.sourceResolutionId!, reason: input.note, oldValue: summary(task),
      newValue: { ...summary(updated), ...(doc ? { documentId: doc.id, documentVersion: doc.version, documentChecksum: doc.checksum } : {}) }, traceId: context.traceId,
    }), (updated) => ({ ...event(authority, principal, updated, input.command, context),
      payload: { ...summary(updated), note: input.note, ...(doc ? { documentId: doc.id, documentVersion: doc.version, documentChecksum: doc.checksum } : {}) } }));
  });
}

/** Read only. Never grants authority or executes a transition. */
export async function assertGovernanceActionsReadable(principal: Principal, resolutionId: string) {
  const scope = await tenantScopeIds(principal);
  const [row] = await db.select({ resolution: resolutions, body: governanceBodies }).from(resolutions)
    .innerJoin(governanceBodies, eq(resolutions.bodyId, governanceBodies.id))
    .where(and(eq(resolutions.id, resolutionId), inArray(resolutions.tenantId, scope))).limit(1);
  if (!row || !can(principal, "governance:resolution.read", { tenantId: row.resolution.tenantId,
    classification: row.resolution.classification, entityId: row.body.legalEntityId ?? undefined }).allowed) {
    throw new GovernanceError("NOT_FOUND", "Resolution not found within your authorized scope.");
  }
  return row;
}

/** Also called before idempotency replay: stored responses are not authority. */
export async function assertGovernanceActionReadable(principal: Principal, taskId: string) {
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, taskId), inArray(tasks.tenantId, await tenantScopeIds(principal)))).limit(1);
  if (!task?.sourceResolutionId) throw new GovernanceError("NOT_FOUND", "Governance action not found.");
  await assertGovernanceActionsReadable(principal, task.sourceResolutionId);
}

export async function listGovernanceActions(principal: Principal, resolutionId: string) {
  const row = await assertGovernanceActionsReadable(principal, resolutionId);
  const rows = await db.select().from(tasks).where(and(eq(tasks.sourceResolutionId, resolutionId), eq(tasks.tenantId, row.resolution.tenantId))).orderBy(asc(tasks.createdAt));
  const evidence = rows.length && can(principal, "documents:registry.read", { tenantId: row.resolution.tenantId,
    classification: row.resolution.classification, entityId: row.body.legalEntityId ?? undefined }).allowed
    ? await db.select().from(governanceActionEvidence).where(inArray(governanceActionEvidence.taskId, rows.map((t) => t.id))) : [];
  return rows.map((task) => ({ ...task, overdue: task.status !== "CLOSED" && !!task.dueAt && task.dueAt.getTime() < Date.now(),
    evidence: evidence.filter((e) => e.taskId === task.id) }));
}
