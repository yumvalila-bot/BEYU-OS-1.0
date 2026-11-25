/**
 * Migration 0086 contract — zero-cost policy and the embedding store.
 *
 * A migration is not "done" because it applied. It is done when the state it
 * claims is present can be observed, the controls it added actually refuse what
 * they are supposed to refuse, and the next migration cannot silently undo it.
 * These tests assert that state against a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;
const MIGRATION_FILE = "0086_zero_cost_model_policy_and_local_embeddings.sql";

describe("0086 file discipline", () => {
  const sqlPath = join(process.cwd(), "drizzle", MIGRATION_FILE);
  const source = readFileSync(sqlPath, "utf8");

  it("exists and is registered in the journal at idx 86", () => {
    const journal = JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
      entries: Array<{ idx: number; tag: string }>;
    };
    const entry = journal.entries.find((e) => e.idx === 86);
    expect(entry?.tag).toBe("0086_zero_cost_model_policy_and_local_embeddings");
    // The head must be 0086 — a later migration has to update this deliberately.
    expect(journal.entries.at(-1)?.idx).toBe(86);
  });

  it("never hides the breakpoint token inside a comment", () => {
    // A breakpoint-shaped token inside a comment splits a statement in half and
    // produces SQLSTATE 42601 at apply time. This was caught in authoring; the
    // assertion stops it coming back.
    const offenders = source
      .split("\n")
      .filter((line) => line.trim().startsWith("--") && line.includes("-->"))
      .map((line) => line.trim());
    expect(offenders).toEqual([]);
  });

  it("contains no GRANT statement (privileges come from the allowlist only)", () => {
    // setup-db-role.ts revokes everything and re-grants only what
    // runtime-privilege-allowlist.ts classifies, so a GRANT here would be
    // silently reverted. 0085 learned this the hard way.
    const grantStatements = source
      .split("--> statement-breakpoint")
      .map((fragment) => fragment.trim())
      .filter((fragment) =>
        fragment
          .split("\n")
          .filter((line) => !line.trim().startsWith("--"))
          .some((line) => /\bgrant\b/i.test(line)),
      );
    expect(grantStatements).toEqual([]);
  });

  it("is additive: no DROP TABLE, DROP COLUMN or destructive DDL", () => {
    const executable = source
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toMatch(/drop\s+table/i);
    expect(executable).not.toMatch(/drop\s+column/i);
    expect(executable).not.toMatch(/truncate/i);
  });
});

describe("0086 applied state", () => {
  let client: Client | null = null;

  beforeAll(async () => {
    if (!ADMIN_URL) return;
    client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end().catch(() => undefined);
  });

  it("records a verified ledger row", async () => {
    if (!client) return;
    const { rows } = await client.query<{ version: string; checksum: string }>(
      "select version, checksum from beyu_migrations where version like $1",
      ["0086%"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("adds the three cost-governance columns with fail-closed defaults", async () => {
    if (!client) return;
    const { rows } = await client.query<{ column_name: string; column_default: string }>(
      `select column_name, column_default from information_schema.columns
        where table_name = 'model_registry'
          and column_name in ('cost_class', 'deployment_kind', 'zero_cost_status')
        order by column_name`,
    );
    expect(rows.map((r) => r.column_name)).toEqual(["cost_class", "deployment_kind", "zero_cost_status"]);
    // The defaults must be the DENY path, not a permissive one.
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r.column_default]));
    expect(byName.cost_class).toContain("UNKNOWN");
    expect(byName.deployment_kind).toContain("REMOTE");
    expect(byName.zero_cost_status).toContain("DENIED_COST_UNKNOWN");
  });

  it("forbids a knowingly billed model from being approved and active", async () => {
    if (!client) return;
    await client.query("begin");
    try {
      await expect(
        client.query(
          `update model_registry set status = 'ACTIVE', approval_status = 'APPROVED', cost_class = 'PAID'
            where model = 'beyu-hive-deterministic-analyst'`,
        ),
      ).rejects.toThrow(/model_registry_zero_cost_executable_check/);
    } finally {
      await client.query("rollback");
    }
  });

  it("forbids a trial-credit model from being approved and active", async () => {
    if (!client) return;
    await client.query("begin");
    try {
      await expect(
        client.query(
          `update model_registry set status = 'ACTIVE', approval_status = 'APPROVED', cost_class = 'TRIAL'
            where model = 'beyu-hive-deterministic-analyst'`,
        ),
      ).rejects.toThrow(/model_registry_zero_cost_executable_check/);
    } finally {
      await client.query("rollback");
    }
  });

  it("permits RECORDING a paid model that is not executable, so an inventory stays honest", async () => {
    // The complement of the two tests above, and the reason the constraint was
    // narrowed. A registry that refused to store a paid model could not report
    // it, refuse it on screen, or keep the evidence it was assessed and
    // declined. Recording is allowed; EXECUTION is what the gate forbids.
    if (!client) return;
    await client.query("begin");
    try {
      await client.query(
        `insert into model_registry
           (id, provider, model, version, status, max_classification, approved_by,
            approval_status, cost_class, deployment_kind, zero_cost_status)
         values
           ('MOD_TEST_PAID_NOT_EXECUTABLE', 'vendor', 'frontier', '1', 'SUSPENDED', 'RESTRICTED',
            'TEST_USER', 'NOT_APPROVED', 'PAID', 'REMOTE', 'DENIED_COST_UNKNOWN')`,
      );
      const { rows } = await client.query<{ cost_class: string; status: string }>(
        `select cost_class, status from model_registry where id = 'MOD_TEST_PAID_NOT_EXECUTABLE'`,
      );
      expect(rows[0]).toEqual({ cost_class: "PAID", status: "SUSPENDED" });
    } finally {
      await client.query("rollback");
    }
  });

  it("the gate keys on EXECUTABILITY, not on the mere presence of a paid class", async () => {
    // Guards against a future edit that makes the constraint reject PAID
    // outright — which would break the honest-inventory property above while
    // still looking like a passing security test.
    if (!client) return;
    const { rows } = await client.query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'model_registry'::regclass
          and conname = 'model_registry_zero_cost_executable_check'`,
    );
    expect(rows).toHaveLength(1);
    // The definition must mention both executability attributes, or the gate is
    // firing on the wrong condition.
    expect(rows[0].def).toMatch(/APPROVED/);
    expect(rows[0].def).toMatch(/ACTIVE/);
    expect(rows[0].def).toMatch(/PAID/);
    expect(rows[0].def).toMatch(/TRIAL/);
  });

  it("declares the deterministic analyst as LOCAL_FREE and ALLOWED", async () => {
    if (!client) return;
    const { rows } = await client.query<{
      cost_class: string;
      deployment_kind: string;
      zero_cost_status: string;
    }>(
      `select cost_class, deployment_kind, zero_cost_status from model_registry
        where model = 'beyu-hive-deterministic-analyst'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].cost_class).toBe("LOCAL_FREE");
    expect(rows[0].deployment_kind).toBe("SELF_HOSTED");
    expect(rows[0].zero_cost_status).toBe("ALLOWED");
  });

  it("creates the embedding store with FORCE RLS and four command policies", async () => {
    if (!client) return;
    const rls = await client.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      "select relrowsecurity, relforcerowsecurity from pg_class where relname = 'noelia_knowledge_embeddings'",
    );
    expect(rls.rows).toHaveLength(1);
    expect(rls.rows[0].relrowsecurity).toBe(true);
    expect(rls.rows[0].relforcerowsecurity).toBe(true);

    const policies = await client.query<{ polname: string; cmd: string }>(
      `select p.polname, case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
              when 'w' then 'UPDATE' when 'd' then 'DELETE' else p.polcmd::text end as cmd
         from pg_policy p where p.polrelid = 'noelia_knowledge_embeddings'::regclass
        order by p.polname`,
    );
    expect(policies.rows.map((r) => r.cmd).sort()).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    // Every policy must be tenant-scoped, not USING(true).
    //
    // Both expressions must be coalesced INDIVIDUALLY before concatenation: an
    // INSERT policy has no polqual, and `text || null` is null in PostgreSQL —
    // so concatenating first silently produced a null that looked like "no
    // policy expression" rather than "an INSERT policy".
    const defs = await client.query<{ polname: string; def: string }>(
      `select p.polname,
              coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
              coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as def
         from pg_policy p where p.polrelid = 'noelia_knowledge_embeddings'::regclass
        order by p.polname`,
    );
    expect(defs.rows).toHaveLength(4);
    for (const row of defs.rows) {
      expect(row.def, `policy ${row.polname} must be tenant-scoped`).toMatch(/beyu_tenant_ids/);
      // And must never be an unconditional allow.
      expect(row.def, `policy ${row.polname} must not be USING(true)`).not.toMatch(/^\s*true\s*$/);
    }
  });

  it("installs pg_trgm and the trigram index for fuzzy matching", async () => {
    if (!client) return;
    const ext = await client.query<{ extversion: string }>(
      "select extversion from pg_extension where extname = 'pg_trgm'",
    );
    expect(ext.rows).toHaveLength(1);

    const index = await client.query<{ indexname: string }>(
      "select indexname from pg_indexes where indexname = 'knowledge_sources_title_trgm_idx'",
    );
    expect(index.rows).toHaveLength(1);
  });

  it("grants the runtime role full control of the embedding store (re-index needs it)", async () => {
    if (!client) return;
    const { rows } = await client.query<{ privilege_type: string }>(
      `select privilege_type from information_schema.role_table_grants
        where table_name = 'noelia_knowledge_embeddings' and grantee = 'beyu_runtime'
        order by privilege_type`,
    );
    expect(rows.map((r) => r.privilege_type)).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
  });

  it("keeps model_registry read-only for the runtime role (cost governance is admin-side)", async () => {
    if (!client) return;
    const sel = await client.query<{ x: boolean }>(
      "select has_table_privilege('beyu_runtime', 'model_registry', 'SELECT') as x",
    );
    const upd = await client.query<{ x: boolean }>(
      "select has_table_privilege('beyu_runtime', 'model_registry', 'UPDATE') as x",
    );
    expect(sel.rows[0].x).toBe(true);
    expect(upd.rows[0].x).toBe(false);
  });

  it("leaves the knowledge_sources immutability trigger armed", async () => {
    if (!client) return;
    const { rows } = await client.query<{ enabled: string }>(
      `select tgenabled::text as enabled from pg_trigger t
        where t.tgrelid = 'knowledge_sources'::regclass
          and t.tgname = 'protect_knowledge_original'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].enabled).toBe("O");
  });
});
