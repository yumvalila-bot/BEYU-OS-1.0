import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../src/db";
import { auditLog, documents, enterpriseEvents, governanceMembers, policies, resolutions, roleAssignments, tasks, users } from "../../src/db/schema";
import { type Principal } from "../../src/lib/authz";
import { verifyAuditChain, verifyEventChain } from "../../src/lib/audit";
import { withTenantDatabaseContext } from "../../src/lib/tenant-scope";
import { createGovernanceAction, commandGovernanceAction, listGovernanceActions } from "../../src/lib/governance/action-service";
import { ACTION_STATES, ActionCommandSchema, CreateActionSchema, canTransitionAction, type ActionCommand } from "../../src/lib/governance/action-contract";
import { cleanupExecution, executionContext as ctx, executionPrincipal, executionResolution } from "../helpers/governance-execution";
import { BeyuNoeliaReadService } from "../../src/lib/noelia/read-services";
import { createDefaultNoeliaToolRegistry } from "../../src/lib/noelia/default-tools";
import { requestedNoeliaTarget, resolveNoeliaAuthorizedScope } from "../../src/lib/noelia/scope-service";
import { resetAuditLedgers } from "../helpers/ledger-reset";
let chair: Principal, secretary: Principal, mandate: string;
const input = () => ({ title: "Deliver verified governance evidence", description: "Acceptance criteria: independently inspect the linked document", priority: "NORMAL" as const, dueAt: new Date(Date.now() + 86400000).toISOString() });
type Task = typeof tasks.$inferSelect;
async function runtime<T>(p: Principal, fn: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => { await tx.execute(sql`set local role beyu_runtime`); return withTenantDatabaseContext(p, fn); });
}
async function create(p = chair) { return runtime(p, () => createGovernanceAction(p, mandate, input(), ctx)); }
async function command(task: Task, command: ActionCommand["command"], p = chair, extra: Record<string, unknown> = {}) {
  return runtime(p, () => commandGovernanceAction(p, task.id, { command, expectedVersion: task.version, note: "Integration evidence review and progress", ...extra } as ActionCommand, ctx));
}
async function progress() {
  let t = await create(); t = await command(t, "ASSIGN", chair, { assigneeUserId: chair.userId }); return command(t, "START");
}
async function complete() { let t = await progress(); t = await command(t, "SUBMIT_EVIDENCE", chair, { documentId: "DOC_D4" }); return command(t, "COMPLETE"); }
beforeAll(async () => { await cleanupExecution(); await resetAuditLedgers(); chair = await executionPrincipal(); secretary = await executionPrincipal("USR_GRACE_KILELE"); mandate = await executionResolution(chair); });
afterAll(async () => { await cleanupExecution(); await db.execute(sql`delete from documents where id like 'DOC_GEXE_%'`); });

describe("governance action contracts and lifecycle", () => {
  it("rejects client authority, forged outcome, unknown commands and non-integer revisions", () => {
    expect(CreateActionSchema.safeParse({ ...input(), tenantId: chair.tenantId }).success).toBe(false);
    expect(ActionCommandSchema.safeParse({ command: "VERIFY", expectedVersion: 1, note: "Review evidence", verifiedByUserId: secretary.userId }).success).toBe(false);
    for (const value of [0, -1, 1.1, NaN]) expect(ActionCommandSchema.safeParse({ command: "START", expectedVersion: value, note: "Start action work" }).success).toBe(false);
    expect(ActionCommandSchema.safeParse({ command: "POST_PAYMENT", expectedVersion: 1, note: "Attempt execution" }).success).toBe(false);
    expect(canTransitionAction("UNKNOWN", "CLOSED")).toBe(false);
    for (const state of ACTION_STATES) expect(canTransitionAction("CLOSED", state)).toBe(false);
    expect(canTransitionAction("COMPLETED", "CLOSED")).toBe(false);
  });
  it("runs the complete chain as NON-OWNER runtime with independent review, events and immutable evidence", async () => {
    let t = await complete();
    await expect(command(t, "VERIFY")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(command(t, "CLOSE", secretary)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    t = await command(t, "VERIFY", secretary); t = await command(t, "CLOSE");
    expect(t).toMatchObject({ status: "CLOSED", version: 7, completedByUserId: chair.userId, verifiedByUserId: secretary.userId });
    const rows = await runtime(chair, () => listGovernanceActions(chair, mandate));
    expect(rows.find((r) => r.id === t.id)?.evidence).toHaveLength(1);
    const events = await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, t.id));
    expect(events).toHaveLength(7); expect(events.every((e) => e.causationId && e.correlationId === ctx.traceId && e.actorType === "HUMAN")).toBe(true);
    const audits = await db.select().from(auditLog).where(eq(auditLog.objectId, t.id));
    expect(audits).toHaveLength(7);
    await expect(command(t, "START")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    expect((await verifyAuditChain()).verified).toBe(true); expect((await verifyEventChain()).verified).toBe(true);
  });
  it("cannot mark work complete without current evidence", async () => {
    const t = await progress(); await expect(command(t, "COMPLETE")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    const [persisted] = await db.select().from(tasks).where(eq(tasks.id, t.id)); expect(persisted.version).toBe(t.version);
  });
  it("does not infer a mandate from status-only seed data", async () => {
    const [approved] = await db.select().from(resolutions).where(eq(resolutions.id, mandate));
    const id = "RES_GEXE_REFERENCE";
    await db.insert(resolutions).values({ ...approved, id, reference: id });
    await expect(runtime(chair, () => createGovernanceAction(chair, id, input(), ctx))).rejects.toMatchObject({ code: "GOVERNANCE_NOT_SATISFIED" });
  });
  it("blocks another worker and preserves separation of duties", async () => {
    const t = await progress(); await expect(command(t, "BLOCK", secretary)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it.each(["mfa", "classification", "entity", "permission"])("fails closed on absent %s authority", async (kind) => {
    const p = { ...chair, ...(kind === "mfa" ? { mfaSatisfied: false } : kind === "classification" ? { clearance: "PUBLIC" as const } : kind === "entity" ? { entityScope: ["WRONG_ENTITY"] } : { permissions: new Set<never>() }) };
    await expect(create(p)).rejects.toHaveProperty("code");
    if (kind === "classification" || kind === "entity") await expect(runtime(p, () => listGovernanceActions(p, mandate))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("denies service-account actors even with a copied human principal", async () => {
    await db.update(users).set({ isServiceAccount: true }).where(eq(users.id, chair.userId));
    try { await expect(create()).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await db.update(users).set({ isServiceAccount: false }).where(eq(users.id, chair.userId)); }
  });
  it("rechecks current appointments and action-specific policy", async () => {
    const t = await create();
    await db.update(governanceMembers).set({ retiredOn: "1900-01-01" }).where(eq(governanceMembers.id, "GMB_BRD_CEO"));
    try { await expect(command(t, "ASSIGN", chair, { assigneeUserId: chair.userId })).rejects.toMatchObject({ code: "FORBIDDEN" }); }
    finally { await db.update(governanceMembers).set({ retiredOn: null }).where(eq(governanceMembers.id, "GMB_BRD_CEO")); }
    await db.insert(policies).values({ id: "POL_GEXE", code: "GEXE", title: "Action approval probe", level: "ENTERPRISE", domain: "GOVERNANCE", effectiveFrom: "2000-01-01", body: "Probe", ownerRole: "CHIEF_GOVERNANCE_OFFICER", rules: [{ id: "review", action: "governance:action.assign", effect: "REQUIRE_APPROVAL", message: "Additional review required" }] });
    try { await expect(command(t, "ASSIGN", chair, { assigneeUserId: chair.userId })).rejects.toMatchObject({ code: "POLICY_DENIED" }); }
    finally { await db.delete(policies).where(eq(policies.id, "POL_GEXE")); }
  });
  it("Noelia reports scoped implementation facts but has no verification mutation tool", async () => {
    const t = await create();
    await runtime(chair, async () => {
      const scope = await resolveNoeliaAuthorizedScope(chair);
      const context = { principal: chair, scope, target: requestedNoeliaTarget(chair, null), traceId: ctx.traceId };
      const output = await new BeyuNoeliaReadService().governance(context);
      expect(output.findings?.some((f) => f.label.startsWith(mandate) && f.value.includes("actions closed"))).toBe(true);
      expect(output.humanReviewRequired).toBe(true);
      expect(output.narrative).toContain("cannot vote");
      expect((await createDefaultNoeliaToolRegistry().invoke("governance.action.verify", context, { id: t.id })).allowed).toBe(false);
      const hidden = await new BeyuNoeliaReadService().governance({ ...context, target: { ...context.target, legalEntityId: "WRONG_ENTITY" } });
      expect(hidden.findings).toHaveLength(0);
    });
    const [unchanged] = await db.select().from(tasks).where(eq(tasks.id, t.id)); expect(unchanged.version).toBe(1);
  });
  it("cannot use cached approval permissions after dated role grants expire", async () => {
    const grants = await db.select().from(roleAssignments).where(eq(roleAssignments.userId, chair.userId));
    try {
      await db.update(roleAssignments).set({ effectiveTo: "2025-12-31" }).where(eq(roleAssignments.userId, chair.userId));
      await expect(create()).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally { for (const grant of grants) await db.update(roleAssignments).set({ effectiveTo: grant.effectiveTo }).where(eq(roleAssignments.id, grant.id)); }
  });
  it("serializes concurrent revisions with exactly one mutation/event", async () => {
    const t = await create();
    const results = await Promise.allSettled([command(t, "ASSIGN", chair, { assigneeUserId: chair.userId }), command(t, "ASSIGN", chair, { assigneeUserId: chair.userId })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.find((r) => r.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    const events = await db.select().from(enterpriseEvents).where(and(eq(enterpriseEvents.subjectId, t.id), eq(enterpriseEvents.type, "GOVERNANCE_ACTION_ASSIGNED")));
    expect(events).toHaveLength(1);
  });
  it("enforces prerequisite verification before starting dependent work", async () => {
    let prerequisite = await complete();
    let dependent = await runtime(chair, () => createGovernanceAction(chair, mandate, { ...input(), dependsOnTaskId: prerequisite.id }, ctx));
    dependent = await command(dependent, "ASSIGN", chair, { assigneeUserId: chair.userId });
    await expect(command(dependent, "START")).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    prerequisite = await command(prerequisite, "VERIFY", secretary);
    expect((await command(dependent, "START")).status).toBe("IN_PROGRESS");
  });
  it("rolls back task, audit, event and notification with an enclosing transaction", async () => {
    let id = "";
    await expect(db.transaction(async () => { const t = await create(); id = t.id; await command(t, "ASSIGN", chair, { assigneeUserId: chair.userId }); throw new Error("rollback probe"); })).rejects.toThrow("rollback probe");
    expect(await db.select().from(tasks).where(eq(tasks.id, id))).toHaveLength(0);
    expect(await db.select().from(enterpriseEvents).where(eq(enterpriseEvents.subjectId, id))).toHaveLength(0);
    expect(await db.select().from(auditLog).where(eq(auditLog.objectId, id))).toHaveLength(0);
  });
  it.each(["tenant", "classification", "entity", "jurisdiction", "authority", "checksum"])("rejects inappropriate %s evidence", async (kind) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, "DOC_D4"));
    const id = `DOC_GEXE_${kind}`;
    const changes = kind === "tenant" ? { tenantId: "TEN_BEYU_FINTECH" } : kind === "classification" ? { classification: "HIGHLY_RESTRICTED" as const }
      : kind === "entity" ? { entityScope: "WRONG_ENTITY" } : kind === "jurisdiction" ? { jurisdictionCode: "ZZ" }
      : kind === "authority" ? { authorityStatus: "UNDER_REVIEW" as const } : { checksum: "invalid" };
    await db.insert(documents).values({ ...doc, id, ...changes });
    const t = await progress(); await expect(command(t, "SUBMIT_EVIDENCE", chair, { documentId: id })).rejects.toHaveProperty("code");
  });
  it("allows blocker/resumption and governed rework, but never accepts drifted proof", async () => {
    const [original] = await db.select().from(documents).where(eq(documents.id, "DOC_D4"));
    const doc = { ...original, id: "DOC_GEXE_REWORK" }; await db.insert(documents).values(doc);
    let t = await progress(); t = await command(t, "BLOCK"); t = await command(t, "RESUME");
    t = await command(t, "SUBMIT_EVIDENCE", chair, { documentId: doc.id });
    await expect(command(t, "SUBMIT_EVIDENCE", chair, { documentId: doc.id })).rejects.toMatchObject({ code: "CONFLICT" });
    t = await command(t, "COMPLETE"); await db.update(documents).set({ version: "4.0.0", checksum: "a".repeat(64) }).where(eq(documents.id, doc.id));
    await expect(command(t, "VERIFY", secretary)).rejects.toMatchObject({ code: "RULE_VIOLATION" });
    t = await command(t, "RETURN", secretary); expect(t.completedAt).toBeNull();
    t = await command(t, "SUBMIT_EVIDENCE", chair, { documentId: doc.id }); t = await command(t, "COMPLETE");
    expect((await command(t, "VERIFY", secretary)).status).toBe("VERIFIED");
  });
});
