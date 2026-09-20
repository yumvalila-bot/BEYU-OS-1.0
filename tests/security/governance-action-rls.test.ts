/** Actual runtime SQL, no service WHERE clause or privileged reads in assertions. */
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Client } from "pg";
import { db } from "../../src/db";
import { eq } from "drizzle-orm";
import { documents, governanceActionEvidence, tasks } from "../../src/db/schema";
import { createGovernanceAction, commandGovernanceAction } from "../../src/lib/governance/action-service";
import { executionPrincipal, executionResolution, cleanupExecution, executionContext as ctx } from "../helpers/governance-execution";
let runtime: Client; let id: string; let tenant: string;
async function session(fn: () => Promise<void>, changes: { tenant?: string; entity?: string; classification?: string } = {}) {
  await runtime.query("begin");
  try {
    await runtime.query(`select set_config('beyu.current_tenant_ids',$1,true), set_config('beyu.governance_context','on',true),
      set_config('beyu.governance_entity_ids',$2,true), set_config('beyu.governance_classifications',$3,true),set_config('beyu.global_scope','on',true),set_config('beyu.governance_actions_read','on',true)`,
    [changes.tenant ?? tenant, changes.entity ?? "", changes.classification ?? "PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED"]);
    await fn();
  } finally { await runtime.query("rollback"); }
}
beforeAll(async () => {
  if (!process.env.BEYU_RUNTIME_DATABASE_URL) throw new Error("Actual runtime DSN required");
  await cleanupExecution("GEXRLS");
  runtime = new Client({ connectionString: process.env.BEYU_RUNTIME_DATABASE_URL }); await runtime.connect();
  const role = await runtime.query("select rolsuper,rolbypassrls from pg_roles where rolname=current_user");
  expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false });
  const p = await executionPrincipal(); tenant = p.tenantId;
  const resolutionId = await executionResolution(p, "GEXRLS");
  let task = await createGovernanceAction(p, resolutionId, { title: "Runtime isolation probe", description: "Prove governed task and evidence isolation", priority: "NORMAL", dueAt: new Date(Date.now() + 86400000).toISOString() }, ctx);
  task = await commandGovernanceAction(p, task.id, { command: "ASSIGN", expectedVersion: 1, assigneeUserId: p.userId, note: "Accountable assignment probe" }, ctx);
  task = await commandGovernanceAction(p, task.id, { command: "START", expectedVersion: 2, note: "Start runtime probe work" }, ctx); id = task.id;
  await commandGovernanceAction(p, id, { command: "SUBMIT_EVIDENCE", expectedVersion: 3, documentId: "DOC_D4", note: "Evidence isolation probe" }, ctx);
});
afterAll(async () => { await cleanupExecution("GEXRLS"); if (runtime) await runtime.end(); });
describe("governance action database boundary", () => {
  it("enables FORCE RLS on canonical tasks and evidence", async () => {
    const rows = await runtime.query("select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1)", [["tasks", "governance_action_evidence"]]);
    expect(rows.rows).toHaveLength(2); expect(rows.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });
  it("denies both tables without context", async () => {
    expect((await runtime.query("select id from tasks where id=$1", [id])).rowCount).toBe(0);
    expect((await runtime.query("select id from governance_action_evidence where task_id=$1", [id])).rowCount).toBe(0);
  });
  it.each([{ tenant: "TEN_BEYU_FINTECH" }, { entity: "WRONG_ENTITY" }, { classification: "PUBLIC" }])("does not fall back to generic visibility for hidden mandates (%j)", async (changes) => session(async () => {
    expect((await runtime.query("select id from tasks where id=$1", [id])).rowCount).toBe(0);
    expect((await runtime.query("select id from governance_action_evidence where task_id=$1", [id])).rowCount).toBe(0);
  }, changes));
  it("withholds mandated work when the trusted role context lacks governance read", async () => session(async () => {
    await runtime.query("select set_config('beyu.governance_actions_read','off',true)");
    expect((await runtime.query("select id from tasks where id=$1", [id])).rowCount).toBe(0);
    expect((await runtime.query("select id from governance_action_evidence where task_id=$1", [id])).rowCount).toBe(0);
  }));
  it("allows exact scope and denies evidence deletion/update", async () => session(async () => {
    expect((await runtime.query("select id from tasks where id=$1", [id])).rowCount).toBe(1);
    expect((await runtime.query("select id from governance_action_evidence where task_id=$1", [id])).rowCount).toBe(1);
    expect((await runtime.query("delete from governance_action_evidence where task_id=$1", [id])).rowCount).toBe(0);
    expect((await runtime.query("update governance_action_evidence set note='Rewritten history' where task_id=$1", [id])).rowCount).toBe(0);
    expect((await runtime.query("delete from tasks where id=$1", [id])).rowCount).toBe(0);
  }));
  it.each([
    "source_resolution_id=null,version=version+1",
    "tenant_id='TEN_BEYU_FINTECH',version=version+1",
    "title='Forged mandate',version=version+1",
    "status='CLOSED',version=version+1",
    "version=version",
    "status='COMPLETED',completed_at=now(),completed_by_user_id=null,version=version+1",
  ])("blocks direct malformed task updates: %s", async (set) => session(async () => {
    await expect(runtime.query(`update tasks set ${set} where id=$1`, [id])).rejects.toHaveProperty("code", "23514");
  }));
  it("rejects cross-document evidence substitution even inside the tenant", async () => session(async () => {
    const [proof] = await db.select().from(governanceActionEvidence).where(eq(governanceActionEvidence.taskId, id));
    const [doc] = await db.select().from(documents).where(eq(documents.id, "DOC_D1"));
    await expect(runtime.query(`insert into governance_action_evidence(id,task_id,document_id,document_version,document_checksum,note,submitted_by_user_id)
      values('GAE_GEXRLS_FORGED',$1,$2,$3,$4,'Cross classification evidence',$5)`, [id, doc.id, doc.version, doc.checksum, proof.submittedByUserId])).rejects.toHaveProperty("code", "23514");
  }));
  it("evidence foreign keys prohibit deleting registered source records", async () => session(async () => {
    await expect(runtime.query("delete from documents where id='DOC_D4'")).rejects.toHaveProperty("code", "23503");
  }));
  it("does not expose entity-unbound generic tasks to entity-constrained contexts", async () => session(async () => {
    const ordinary = await db.select().from(tasks).where(eq(tasks.sourceResolutionId, "unused")); expect(ordinary).toHaveLength(0);
    expect((await runtime.query("select id from tasks where source_resolution_id is null")).rowCount).toBe(0);
  }, { entity: "LEN_BEYU_HOLDINGS" }));
});
