/**
 * Family Office — uncovered-table isolation register and cross-tenant probes.
 *
 * WHY THIS SUITE EXISTS. 387 of 464 public tables carry Row Level Security. The
 * 77 that do not are the kernel-era identity, people and family tables — the
 * oldest migrations, written before the RLS convention. For those tables the
 * DATABASE is not a tenant boundary at all: isolation depends entirely on
 * application-layer filtering. That is a defence-in-depth gap, and this suite
 * makes it measurable, pinned and reviewable rather than assumed.
 *
 * WHAT IT PROVES, EMPIRICALLY, USING THE REAL RUNTIME ROLE.
 *   - `beyu_runtime` is genuinely RLS-subject (NOBYPASSRLS, non-superuser), so
 *     every measurement below is meaningful rather than an artifact of privilege.
 *   - On an RLS-protected table, a tenant-scoped session sees ONLY its own rows.
 *   - On an uncovered table, the SAME session sees other tenants' rows, because
 *     no policy exists to stop it. This is measured, not asserted.
 *   - The write side is measured too, inside a transaction that is always rolled
 *     back, so the probe leaves no residue.
 *
 * THE REGISTER IDIOM. The uncovered set is PINNED rather than described. A table
 * that arrives without RLS fails this suite; a table that GAINS RLS also fails it
 * until the register is updated. That is deliberate: it mirrors
 * `KNOWN_METADATA_DEBT` in `src/lib/migration/integrity.ts`, where updating the
 * register is the reviewable act that turns silent rot into a visible decision.
 * Removing a name from these lists should be the visible consequence of a
 * migration that adds a policy — never a quiet edit to make a suite go green.
 *
 * WHAT THIS SUITE DOES NOT DO. It does not enable RLS, change a policy, grant or
 * revoke a privilege, or write anything that survives the test. It proves the gap
 * and pins its boundary; closing it is a migration, and a migration is a separate
 * reviewed decision (see `BEYU-FO-AUD-01` and the Phase 4C record).
 *
 * A NOTE ON WHAT THIS SUITE MUST NOT BECOME. It asserts the CURRENT state so the
 * gap cannot grow silently. It must never be read as "leakage is acceptable", and
 * it must never be satisfied by weakening an assertion. If a probe here starts
 * failing because RLS was added, the correct response is to update the register
 * and celebrate — not to relax the test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * A tenant that owns exactly one `legal_entities` row and one `role_assignments`
 * row, while both tables hold rows owned by OTHER tenants. That asymmetry is what
 * makes the probe discriminating: `visible == own` is isolation, and
 * `visible > own` is its absence.
 */
const TENANT_A = "TEN_BEYU_HEALTH";
/** A tenant that owns rows in both tables and is NOT the session tenant. */
const TENANT_B = "TEN_BEYU_GROUP";
/** An RLS-protected table with rows for many tenants. */
const PROTECTED_TABLE = "legal_entities";
/** Uncovered, tenant-scoped tables with rows across several tenants. */
const UNCOVERED_PROBES = ["role_assignments", "positions", "family_members"] as const;

const REGISTERED_UNCOVERED_TABLES = [
  "admin_authority_delegations", "admin_bootstrap_state", "admin_enrollment_sessions", "anomaly_signals",
  "architecture_decisions", "audit_chain_heads", "beneficiaries", "beyu_migrations",
  "blue_green_deployments", "canary_deployments", "compliance_assessments", "consents",
  "constitution_articles", "continuity_plans", "controls", "countries",
  "data_assets", "delegations", "emergency_access_grants", "employment_events",
  "entity_appointments", "family_members", "family_vault_items", "feature_flags",
  "governance_capability_registry", "governance_decision_registry", "idempotency_records", "integrations",
  "jurisdictions", "legal_matters", "metric_definitions", "model_registry",
  "noelia_ai_identity", "noelia_ai_requirements", "noelia_controls", "noelia_evaluations",
  "noelia_model_artifacts", "noelia_model_lifecycle_events", "noelia_model_provenance", "noelia_provider_lifecycle_events",
  "noelia_providers", "noelia_regulatory_changes", "noelia_requirement_controls", "noelia_risk_register",
  "noelia_risk_treatments", "notifications", "org_units", "os_registry",
  "parties", "permissions", "policies", "positions",
  "pvg_runs", "regulatory_changes", "release_approvals", "release_records",
  "release_transitions", "retention_policies", "role_assignments", "role_permissions",
  "roles", "rollback_requests", "sector_metrics", "service_principals",
  "sessions", "source_of_truth", "strategic_objectives", "tax_strategies",
  "tax_strategy_assessments", "tenants", "users", "waterfall_run_lines",
  "waterfall_runs", "waterfall_tiers", "workflow_instances", "workflows",
  "workforce_requests",
] as const;

const REGISTERED_TENANT_SCOPED_UNCOVERED = [
  "admin_authority_delegations", "anomaly_signals", "beneficiaries", "compliance_assessments",
  "consents", "controls", "delegations", "emergency_access_grants",
  "entity_appointments", "family_members", "family_vault_items", "idempotency_records",
  "integrations", "legal_matters", "notifications", "org_units",
  "policies", "positions", "role_assignments", "sector_metrics",
  "sessions", "strategic_objectives", "tax_strategy_assessments", "waterfall_runs",
  "workflow_instances", "workforce_requests",
] as const;

const REGISTERED_DELETE_HOLDERS = [
  "admin_enrollment_sessions", "anomaly_signals", "audit_chain_heads", "beneficiaries",
  "blue_green_deployments", "canary_deployments", "compliance_assessments", "consents",
  "continuity_plans", "data_assets", "employment_events", "entity_appointments",
  "family_members", "family_vault_items", "idempotency_records", "integrations",
  "legal_matters", "noelia_regulatory_changes", "noelia_risk_register", "noelia_risk_treatments",
  "notifications", "org_units", "parties", "positions",
  "pvg_runs", "regulatory_changes", "sector_metrics", "strategic_objectives",
  "tax_strategies", "tax_strategy_assessments", "tenants", "users",
  "waterfall_run_lines", "waterfall_runs", "waterfall_tiers", "workflows",
  "workforce_requests",
] as const;

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL (or DATABASE_URL) is required for this suite");
  return new Client({ connectionString: RUNTIME_URL });
}

/** Session-level tenant scope, mirroring one request's resolved tenant scope. */
async function setTenantContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

describe("the runtime role is genuinely RLS-subject", () => {
  it("beyu_runtime cannot bypass RLS, so every measurement below is meaningful", async () => {
    // Checked FIRST and against the live catalogue, not against an env var: if
    // the role could bypass RLS, the isolation results would be meaningless.
    const admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    try {
      const r = await admin.query(
        `select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'beyu_runtime'`,
      );
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0].rolsuper).toBe(false);
      expect(r.rows[0].rolbypassrls).toBe(false);
    } finally {
      await admin.end();
    }
  });
});

describe("the uncovered-table register is pinned", () => {
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
  });
  afterAll(async () => {
    await admin.end();
  });

  it("the set of tables without RLS is exactly the register — no more, no fewer", async () => {
    const r = await admin.query(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        order by c.relname`,
    );
    const live: string[] = r.rows.map((x: { t: string }) => x.t);
    // Widened to string[] deliberately: the register is a literal tuple, and
    // comparing it to live catalogue names needs the general type.
    const registered: string[] = [...REGISTERED_UNCOVERED_TABLES].sort();

    // Report the DIFFERENCE, not just inequality, so a failure says which table
    // arrived unprotected or which one gained a policy.
    const arrivedUnprotected = live.filter((t: string) => !registered.includes(t));
    const nowProtected = registered.filter((t) => !live.includes(t));
    expect({ arrivedUnprotected, nowProtected }).toEqual({ arrivedUnprotected: [], nowProtected: [] });
    expect(live).toHaveLength(REGISTERED_UNCOVERED_TABLES.length);
  });

  it("the tenant-scoped subset of the register is pinned", async () => {
    // These are the tables where the absence of a policy is a tenancy problem,
    // as opposed to the global/reference tables where a tenant policy would be
    // meaningless and a different disposition applies.
    const r = await admin.query(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          and exists (select 1 from information_schema.columns ic
                       where ic.table_schema = 'public' and ic.table_name = c.relname
                         and ic.column_name = 'tenant_id')
        order by c.relname`,
    );
    expect(r.rows.map((x: { t: string }) => x.t)).toEqual([...REGISTERED_TENANT_SCOPED_UNCOVERED]);
  });

  it("the DELETE-privilege register is pinned — least privilege is visible, not assumed", async () => {
    // `beyu_runtime` holds DELETE on 37 tables that have no RLS at all. On those
    // tables a delete is bounded by nothing but application code. Pinning the set
    // makes any future DELETE grant a deliberate, reviewable act.
    const r = await admin.query(
      `select c.relname as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
          and exists (select 1 from information_schema.role_table_grants g
                       where g.table_schema = 'public' and g.table_name = c.relname
                         and g.grantee = 'beyu_runtime' and g.privilege_type = 'DELETE')
        order by c.relname`,
    );
    expect(r.rows.map((x: { t: string }) => x.t)).toEqual([...REGISTERED_DELETE_HOLDERS]);
  });
});

describe("cross-tenant isolation, measured with the runtime role", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();
    rt = runtimeConnection();
    await rt.connect();
    await setTenantContext(rt, TENANT_A);
  });

  afterAll(async () => {
    await rt.end();
    await admin.end();
  });

  it("an RLS-protected table shows the session tenant its own rows and nothing else", async () => {
    const total = await admin.query(`select count(*)::int n from ${PROTECTED_TABLE}`);
    const own = await admin.query(`select count(*)::int n from ${PROTECTED_TABLE} where tenant_id = $1`, [TENANT_A]);
    const visible = await rt.query(`select count(*)::int n from ${PROTECTED_TABLE}`);

    // The probe must be discriminating: the table must hold other tenants' rows,
    // otherwise "visible == own" would be trivially true and prove nothing.
    expect(total.rows[0].n).toBeGreaterThan(own.rows[0].n);
    expect(own.rows[0].n).toBeGreaterThan(0);
    expect(visible.rows[0].n).toBe(own.rows[0].n);
  });

  it("an UNCOVERED table shows the same session other tenants' rows — the gap, measured", async () => {
    for (const table of UNCOVERED_PROBES) {
      const total = await admin.query(`select count(*)::int n from ${table}`);
      const own = await admin.query(`select count(*)::int n from ${table} where tenant_id = $1`, [TENANT_A]);
      const visible = await rt.query(`select count(*)::int n from ${table}`);

      // Meaningful only if the table holds rows this session does not own.
      expect(total.rows[0].n, `${table} must hold rows for the gap to be measurable`).toBeGreaterThan(own.rows[0].n);
      // The finding: the database does NOT restrict the session to its tenant.
      expect(visible.rows[0].n, `${table} is expected to expose other tenants' rows until it gains RLS`).toBe(
        total.rows[0].n,
      );
    }
  });

  it("the write side is exposed on uncovered tables and blocked on protected ones", async () => {
    // Measured inside transactions that are ALWAYS rolled back, so nothing
    // survives. The write is a NO-OP UPDATE (`set id = id`): it exercises the
    // write privilege and the policy without changing a value, which also means
    // no foreign-key action can be triggered and nothing can be cascaded.
    //
    // Two incidental controls were discovered while building this probe, and both
    // are recorded because they are real:
    //   - `role_assignments` grants SELECT only to the runtime role, so an earlier
    //     draft of this probe failed with "permission denied". Least privilege is
    //     already doing work there.
    //   - `family_members` DOES grant DELETE, but a cross-tenant delete is refused
    //     by foreign key (`beneficiaries_family_member_id_family_members_id_fk`).
    //     That is referential integrity, not tenant isolation: it stops a delete
    //     only when a dependent row happens to exist. It would not stop a read,
    //     and it would not stop a delete of an undepended-on row.
    const writeProbe = "family_members";

    for (const [label, table] of [["uncovered", writeProbe], ["protected", PROTECTED_TABLE]] as const) {
      const granted = await admin.query(
        `select 1 from information_schema.role_table_grants
          where table_schema='public' and table_name=$1 and grantee='beyu_runtime' and privilege_type='UPDATE'`,
        [table],
      );
      expect(granted.rows, `${table} (${label}) must hold an UPDATE grant for this probe to be meaningful`).toHaveLength(1);
    }

    const exposed = await admin.query(`select count(*)::int n from ${writeProbe} where tenant_id = $1`, [TENANT_B]);
    expect(exposed.rows[0].n, "tenant B must own rows for this probe to be meaningful").toBeGreaterThan(0);
    const protectedBefore = await admin.query(`select count(*)::int n from ${PROTECTED_TABLE}`);

    let uncoveredWritten = -1;
    await rt.query("begin");
    try {
      const u = await rt.query(`update ${writeProbe} set id = id where tenant_id = $1`, [TENANT_B]);
      uncoveredWritten = u.rowCount ?? 0;
    } finally {
      await rt.query("rollback");
    }

    let protectedWritten = -1;
    await rt.query("begin");
    try {
      const u = await rt.query(`update ${PROTECTED_TABLE} set id = id where tenant_id = $1`, [TENANT_B]);
      protectedWritten = u.rowCount ?? 0;
    } finally {
      await rt.query("rollback");
    }

    // Uncovered: the session tenant can write another tenant's rows. The rollback
    // undoes it; the measurement is the finding.
    expect(uncoveredWritten).toBe(exposed.rows[0].n);
    // Protected: the policy's USING clause matches nothing for this session.
    expect(protectedWritten).toBe(0);

    // Prove the rollbacks worked rather than trusting them.
    const protectedAfter = await admin.query(`select count(*)::int n from ${PROTECTED_TABLE}`);
    expect(protectedAfter.rows[0].n).toBe(protectedBefore.rows[0].n);
    const exposedAfter = await admin.query(`select count(*)::int n from ${writeProbe} where tenant_id = $1`, [TENANT_B]);
    expect(exposedAfter.rows[0].n).toBe(exposed.rows[0].n);
  });

  it("the probe discriminates — it would notice if the gap closed", async () => {
    // A guard that cannot fail proves nothing. This asserts the two measurements
    // that this suite relies on actually differ, so a future migration that added
    // a policy to an uncovered table would flip the earlier expectation and fail
    // loudly until the register was updated.
    const protectedVisible = await rt.query(`select count(*)::int n from ${PROTECTED_TABLE}`);
    const uncoveredVisible = await rt.query(`select count(*)::int n from role_assignments`);
    const protectedOwn = await admin.query(`select count(*)::int n from ${PROTECTED_TABLE} where tenant_id = $1`, [TENANT_A]);

    expect(protectedVisible.rows[0].n).toBe(protectedOwn.rows[0].n); // isolated
    expect(uncoveredVisible.rows[0].n).toBeGreaterThan(protectedOwn.rows[0].n); // not isolated
  });
});
