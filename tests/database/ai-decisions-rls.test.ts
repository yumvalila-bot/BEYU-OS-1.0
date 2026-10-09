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

suite("ai_decisions tenant/entity/country RLS and immutable evidence", () => {
  let client: Client;
  const suffix = randomBytes(5).toString("hex");
  const aeId = `AID_RLS_AE_${suffix}`;
  const muId = `AID_RLS_MU_${suffix}`;
  const tenantId = "TEN_BEYU_GROUP";

  beforeAll(async () => {
    client = new Client({ connectionString: adminDsn });
    await client.connect();
    await client.query("begin");
    const base = {
      agent: "NOELIA_AI",
      runtime: "HIVE",
      engine: "GOVERNANCE",
      model: "DETERMINISTIC",
      model_version: "test",
      prompt_version: "test",
      request_type: "RLS_TEST",
      question: "RLS fixture",
      inputs: {},
      retrieved_sources: [],
      tools_used: [],
      output: { fixture: true },
      output_class: "FACT",
      confidence: "1.0000",
      policy_decision: "ALLOWED",
      denied_scopes: [],
      human_review_required: false,
      latency_ms: 1,
    };
    for (const row of [
      { id: aeId, legal_entity_id: "LEN_BEYU_HOLDINGS", country_code: "AE" },
      { id: muId, legal_entity_id: "LEN_BEYU_FAMILY_TRUST", country_code: "MU" },
    ]) {
      await client.query(
        `insert into ai_decisions
          (id,tenant_id,legal_entity_id,country_code,agent,runtime,engine,model,model_version,prompt_version,
           request_type,question,inputs,retrieved_sources,tools_used,output,output_class,confidence,
           policy_decision,denied_scopes,human_review_required,latency_ms)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [row.id, tenantId, row.legal_entity_id, row.country_code, ...Object.values(base)],
      );
    }
    await client.query("set local role beyu_runtime");
    await client.query("select set_config('beyu.current_tenant_ids',$1,true)", [tenantId]);
    await client.query("select set_config('beyu.global_scope','off',true)");
    await client.query("select set_config('beyu.governance_context','on',true)");
    await client.query("select set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true)");
  });

  afterAll(async () => {
    if (!client) return;
    await client.query("reset role");
    await client.query("rollback");
    await client.end();
  });

  it("filters another entity in the same tenant", async () => {
    await client.query("select set_config('beyu.governance_entity_ids','LEN_BEYU_HOLDINGS',true)");
    await client.query("select set_config('beyu.governance_country_codes','AE',true)");
    const rows = await client.query<{ id: string }>("select id from ai_decisions where id=any($1::text[]) order by id", [[aeId, muId]]);
    expect(rows.rows.map((row) => row.id)).toEqual([aeId]);
  });

  it("filters country even when both entities are present", async () => {
    await client.query("select set_config('beyu.governance_entity_ids','LEN_BEYU_HOLDINGS,LEN_BEYU_FAMILY_TRUST',true)");
    await client.query("select set_config('beyu.governance_country_codes','MU',true)");
    const rows = await client.query<{ id: string }>("select id from ai_decisions where id=any($1::text[]) order by id", [[aeId, muId]]);
    expect(rows.rows.map((row) => row.id)).toEqual([muId]);
  });

  it("filters decisions above the transaction-local classification ceiling", async () => {
    await client.query("select set_config('beyu.governance_entity_ids','LEN_BEYU_HOLDINGS',true)");
    await client.query("select set_config('beyu.governance_country_codes','AE',true)");
    await client.query("select set_config('beyu.governance_classifications','PUBLIC',true)");
    const denied = await client.query("select id from ai_decisions where id=$1", [aeId]);
    expect(denied.rowCount).toBe(0);
    await client.query("select set_config('beyu.governance_classifications','PUBLIC,INTERNAL,CONFIDENTIAL,RESTRICTED,HIGHLY_RESTRICTED',true)");
  });

  it("allows review annotation but rejects original output mutation and deletion", async () => {
    await client.query("select set_config('beyu.governance_entity_ids','LEN_BEYU_HOLDINGS',true)");
    await client.query("select set_config('beyu.governance_country_codes','AE',true)");
    const reviewed = await client.query("update ai_decisions set reviewed_by='USR_REVIEWER', review_decision='CONFIRMED', reviewed_at=now() where id=$1 returning id", [aeId]);
    expect(reviewed.rowCount).toBe(1);

    await client.query("savepoint immutable_probe");
    await expect(client.query("update ai_decisions set output='{}'::jsonb where id=$1", [aeId])).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint immutable_probe");
    await client.query("release savepoint immutable_probe");

    await client.query("savepoint classification_probe");
    await expect(client.query("update ai_decisions set classification='PUBLIC' where id=$1", [aeId])).rejects.toMatchObject({ code: "55000" });
    await client.query("rollback to savepoint classification_probe");
    await client.query("release savepoint classification_probe");

    await client.query("savepoint delete_probe");
    await expect(client.query("delete from ai_decisions where id=$1", [aeId])).rejects.toMatchObject({ code: "42501" });
    await client.query("rollback to savepoint delete_probe");
    await client.query("release savepoint delete_probe");
  });
});
