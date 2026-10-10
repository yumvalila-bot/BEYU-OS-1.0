import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const adminDsn = process.env.BEYU_ADMIN_DATABASE_URL ?? "";
function localDisposable(value: string): boolean {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.pathname !== "/postgres";
  } catch {
    return false;
  }
}

const suite = localDisposable(adminDsn) ? describe : describe.skip;

suite("knowledge_sources global write RLS", () => {
  let client: Client;
  const suffix = randomBytes(5).toString("hex");
  const id = `KNS_RLS_${suffix}`;
  const code = `RLS-GLOBAL-${suffix}`;
  const spoofId = `KNS_SPOOF_${suffix}`;
  const spoofCode = `RLS-SPOOF-${suffix}`;

  beforeAll(async () => {
    client = new Client({ connectionString: adminDsn });
    await client.connect();
    await client.query("begin");
    await client.query("set local role beyu_runtime");
    await client.query("select set_config('beyu.current_tenant_ids','TEN_BEYU_GROUP',true)");
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    await client.end();
  });

  const insertGlobal = () => client.query<{ authority_status: string }>(
    `insert into knowledge_sources
      (id,code,title,domain,owner_role,scope_type,tenant_id,provenance,effective_from,review_date,content)
     values ($1,$2,'Global RLS probe','GOVERNANCE','CHIEF_GOVERNANCE_OFFICER','GLOBAL',null,
             'disposable database test',current_date,current_date + 1,'test evidence')
     returning authority_status`,
    [id, code],
  );

  it("rejects global insertion from presentation-only tenant scope", async () => {
    await client.query("select set_config('beyu.global_scope','off',true)");
    await client.query("savepoint denied_global_insert");
    await expect(insertGlobal()).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint denied_global_insert");
    await client.query("release savepoint denied_global_insert");
  });

  it("rejects a spoofed service-account approval even when its labels claim human authority", async () => {
    await client.query("reset role");
    const identities = await client.query<{ service_id: string; requester_id: string }>(`
      select min(id) service_id, max(id) requester_id
      from (select id from users where status='ACTIVE' and not is_service_account order by id limit 2) active_humans
    `);
    expect(identities.rows[0]?.service_id).toBeTruthy();
    expect(identities.rows[0]?.requester_id).toBeTruthy();
    expect(identities.rows[0].service_id).not.toBe(identities.rows[0].requester_id);
    // Transaction-local fixture mutation: the row still carries every claimed
    // approval label, but the canonical identity is a service account.
    await client.query("update users set is_service_account=true where id=$1", [identities.rows[0].service_id]);
    const actionId = `ACT_SPOOF_${suffix}`;
    const approvalId = `APR_SPOOF_${suffix}`;
    const content = "spoofed approval must grant nothing";
    const input = {
      code: spoofCode,
      version: "1.0.0",
      scopeType: "GLOBAL",
      classification: "INTERNAL",
      content,
    };
    await client.query(
      `insert into approvals
        (id,tenant_id,object_type,object_id,approver_role,approver_user_id,decision,payload_digest,payload_version,
         target_tenant_id,mfa_verified,requested_by,valid_until)
       values ($1,'TEN_BEYU_GROUP','NOELIA_ACTION',$2,'CHIEF_GOVERNANCE_OFFICER',$3,'APPROVED','spoof-digest',1,
               'TEN_BEYU_GROUP',true,$4,now() + interval '1 hour')`,
      [approvalId, actionId, identities.rows[0].service_id, identities.rows[0].requester_id],
    );
    await client.query(
      `insert into noelia_action_requests
        (id,tenant_id,requesting_human_id,approving_human_id,approval_id,tool_name,input,input_digest,input_version,
         required_approver_role,target_tenant_id,risk,status,reason)
       values ($1,'TEN_BEYU_GROUP',$2,$3,$4,'knowledge.ingest',$5::jsonb,'spoof-digest',1,
               'CHIEF_GOVERNANCE_OFFICER','TEN_BEYU_GROUP','HIGH','APPROVED','spoof probe')`,
      [actionId, identities.rows[0].requester_id, identities.rows[0].service_id, approvalId, JSON.stringify(input)],
    );
    await client.query("set local role beyu_runtime");
    await client.query("select set_config('beyu.current_tenant_ids','TEN_BEYU_GROUP',true)");
    await client.query("select set_config('beyu.global_scope','on',true)");
    await client.query("select set_config('beyu.noelia_action_request_id',$1,true)", [actionId]);
    await client.query("savepoint spoofed_human_approval");
    await expect(client.query(
      `insert into knowledge_sources
        (id,code,title,domain,owner_role,scope_type,tenant_id,classification,provenance,effective_from,review_date,content,version)
       values ($1,$2,'Spoof probe','GOVERNANCE','CHIEF_GOVERNANCE_OFFICER','GLOBAL',null,'INTERNAL',
               'disposable database test',current_date,current_date + 1,$3,'1.0.0')`,
      [spoofId, spoofCode, content],
    )).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint spoofed_human_approval");
    await client.query("release savepoint spoofed_human_approval");
  });

  it("rejects direct runtime ingestion even with global scope when no approved action is bound", async () => {
    await client.query("select set_config('beyu.noelia_action_request_id','',true)");
    await client.query("select set_config('beyu.global_scope','on',true)");
    await client.query("savepoint unapproved_global_insert");
    await expect(insertGlobal()).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint unapproved_global_insert");
    await client.query("release savepoint unapproved_global_insert");

    // Owner-only fixture setup for the remaining RLS visibility probe. Runtime
    // ingestion itself is exercised through the governed action integration.
    await client.query("reset role");
    const inserted = await insertGlobal();
    expect(inserted.rows[0].authority_status).toBe("UNDER_REVIEW");
    await client.query("set local role beyu_runtime");
  });

  it("prevents a tenant-only context from mutating a visible global catalog row", async () => {
    await client.query("select set_config('beyu.global_scope','off',true)");
    // PostgreSQL UPDATE applies the policy's USING predicate before the trigger:
    // the visible-on-SELECT global row becomes non-targetable and the statement
    // truthfully succeeds with zero affected rows. Prove both zero effect and
    // unchanged owner-visible evidence; rejection is not the only fail-closed
    // RLS outcome.
    const denied = await client.query("update knowledge_sources set title='tenant overwrite' where id=$1 returning id", [id]);
    expect(denied.rowCount).toBe(0);
    await client.query("reset role");
    const ownerView = await client.query<{ title: string }>("select title from knowledge_sources where id=$1", [id]);
    expect(ownerView.rows[0]?.title).toBe("Global RLS probe");
    await client.query("set local role beyu_runtime");
  });

  it("rejects direct runtime publication without the canonical approved action binding", async () => {
    await client.query("select set_config('beyu.global_scope','on',true)");
    await client.query("savepoint unapproved_publication");
    await expect(client.query(
      "update knowledge_sources set authority_status='AUTHORITATIVE' where id=$1 returning id",
      [id],
    )).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint unapproved_publication");
    await client.query("release savepoint unapproved_publication");
  });
});
