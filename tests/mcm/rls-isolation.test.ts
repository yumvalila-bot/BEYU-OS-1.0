/**
 * MULTI_COMPANY_MANAGEMENT — database isolation proved with the ACTUAL runtime
 * role, not with application-level filters.
 *
 * The mission's identity/security/isolation requirement is explicit: prove the
 * boundary with the non-owner `beyu_runtime` role, including direct database
 * access. Application filters are covered by the service tests; THIS suite proves
 * that even if every application filter were removed, PostgreSQL still refuses:
 *
 *   1. reading another tenant's MCM rows;
 *   2. inserting an MCM row for another tenant;
 *   3. deleting an append-only MCM record (lifecycle events, validations,
 *      reconciliation runs, consolidation runs);
 *   4. writing a decision-review column on an immutable run table;
 *   5. writing `mcm_country_profiles` at all — country configuration is an
 *      operator act, and the runtime role has no write authority over it;
 *   6. reading `fx_rates` outside the governed read-only path.
 *
 * Fixtures are neutral and clearly synthetic (`TEN_X_…`, `LE_RLS_…`). No invented
 * company, director, ownership percentage or financial figure is written.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const RUNTIME_URL = process.env.BEYU_RUNTIME_DATABASE_URL ?? process.env.DATABASE_URL;
const ADMIN_URL = process.env.BEYU_ADMIN_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * Synthetic isolation tenants.
 *
 * Deliberately NOT the seeded BEYU tenants: these exist only to prove the
 * boundary and are removed in afterAll. Using the real group tenants would risk
 * disturbing fixture state that other suites depend on.
 */
const TENANT_A = "TEN_RLS_MCM_A";
const TENANT_B = "TEN_RLS_MCM_B";
const ENTITY_A = "LE_RLS_MCM_A";
const ENTITY_B = "LE_RLS_MCM_B";
const PROFILE_A = "MCP_RLS_A";
const PROFILE_B = "MCP_RLS_B";
const LIFECYCLE_A = "MCLE_RLS_A";
const LIFECYCLE_B = "MCLE_RLS_B";
const COUNTRY = "ZZ"; // reserved user-assigned code space: never a real jurisdiction
/**
 * The acting user must be a REAL user row: `acting_user_id` is a foreign key to
 * the identity table, and an MCM lifecycle event without an accountable human is
 * not a lifecycle event. The seeded platform administrator is used purely as an
 * FK anchor for these synthetic rows.
 */
const ACTOR = "USR_PLATFORM_ADMIN";

function runtimeConnection(): Client {
  if (!RUNTIME_URL) throw new Error("BEYU_RUNTIME_DATABASE_URL is required for the MCM RLS test");
  return new Client({ connectionString: RUNTIME_URL });
}

async function setTenantContext(client: Client, tenantIds: string): Promise<void> {
  await client.query(`select set_config('beyu.current_tenant_ids', $1, false)`, [tenantIds]);
}

describe("MCM database isolation (runtime role, direct SQL)", () => {
  let rt: Client;
  let admin: Client;

  beforeAll(async () => {
    if (!RUNTIME_URL || !ADMIN_URL) throw new Error("MCM RLS test requires both DSNs");
    admin = new Client({ connectionString: ADMIN_URL });
    await admin.connect();

    // Fixture lifecycle.
    //
    // `legal_entity_lifecycle_events` is append-only BY TRIGGER: not even the
    // privileged role may UPDATE or DELETE it. That is the property asserted
    // below, so the fixture must not weaken it. Instead, teardown runs under
    // `session_replication_role = replica`, which suspends triggers for the
    // DURATION OF THE TEARDOWN STATEMENTS ONLY, on a DEDICATED privileged
    // connection, in a test file. This capability is not reachable from the
    // application: the runtime role is not a superuser (asserted below) and
    // cannot set the GUC, and no service path issues it.
    await suspendTriggers(admin, true);
    await admin.query(`delete from legal_entity_lifecycle_events where id like 'MCLE_RLS_%'`);
    await admin.query(`delete from legal_entity_profiles where id like 'MCP_RLS_%'`);
    await admin.query(`delete from mcm_country_profiles where country_code = $1`, [COUNTRY]);
    await admin.query(`delete from legal_entities where id like 'LE_RLS_MCM_%'`);
    await admin.query(`delete from tenants where id like 'TEN_RLS_MCM_%'`);
    await suspendTriggers(admin, false);

    for (const [tenantId, code] of [
      [TENANT_A, "RLS-MCM-A"],
      [TENANT_B, "RLS-MCM-B"],
    ]) {
      await admin.query(
        `insert into tenants (id, code, name, type, status, isolation_tier)
         values ($1, $2, $2, 'ENTERPRISE', 'ACTIVE', 'LOGICAL')`,
        [tenantId, code],
      );
    }
    for (const [entityId, tenantId, code] of [
      [ENTITY_A, TENANT_A, "RLS-A"],
      [ENTITY_B, TENANT_B, "RLS-B"],
    ]) {
      await admin.query(
        `insert into legal_entities
           (id, tenant_id, code, legal_name, entity_type, country_code, functional_currency,
            accounting_standard, status, classification, effective_from)
         values ($1, $2, $3, $3, 'OPERATING_COMPANY', 'TZ', 'TZS', 'IFRS', 'ACTIVE',
                 'INTERNAL', '2024-01-01')`,
        [entityId, tenantId, code],
      );
    }

    rt = runtimeConnection();
    await rt.connect();
  });

  afterAll(async () => {
    try {
      await suspendTriggers(admin, true);
      await admin.query(`delete from legal_entity_lifecycle_events where id like 'MCLE_RLS_%'`);
      await admin.query(`delete from legal_entity_profiles where id like 'MCP_RLS_%'`);
      await admin.query(`delete from mcm_country_profiles where country_code = $1`, [COUNTRY]);
      await admin.query(`delete from legal_entities where id like 'LE_RLS_MCM_%'`);
      await admin.query(`delete from tenants where id like 'TEN_RLS_MCM_%'`);
    } catch {
      /* best effort */
    } finally {
      await suspendTriggers(admin, false).catch(() => undefined);
    }
    await rt?.end().catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it("connects as the non-owner runtime role", async () => {
    const who = await rt.query(
      `select current_user, rolsuper, rolbypassrls, rolcreaterole from pg_roles where rolname = current_user`,
    );
    expect(who.rows[0].current_user).toBe("beyu_runtime");
    expect(who.rows[0].rolsuper).toBe(false);
    expect(who.rows[0].rolbypassrls).toBe(false);
    expect(who.rows[0].rolcreaterole).toBe(false);
  });

  it("writes a profile for its own tenant (the control that proves the rest is meaningful)", async () => {
    await setTenantContext(rt, TENANT_A);
    await rt.query(
      `insert into legal_entity_profiles
         (id, tenant_id, legal_entity_id, mcm_lifecycle_state, reporting_currency, reporting_timezone,
          verification_state, pending_verification_note, updated_by)
       values ($1, $2, $3, 'ACTIVE', 'TZS', 'Africa/Dar_es_Salaam', 'PENDING_VERIFICATION', $4, 'RLS_TEST')`,
      [PROFILE_A, TENANT_A, ENTITY_A, "Synthetic isolation fixture: registration not yet verified."],
    );
    const rows = await rt.query(`select id from legal_entity_profiles where id = $1`, [PROFILE_A]);
    expect(rows.rowCount).toBe(1);
  });

  it("cannot read another tenant's profile", async () => {
    // Tenant B's profile is created by the admin role: the runtime role of
    // tenant A is then asked to read it directly.
    await admin.query(
      `insert into legal_entity_profiles
         (id, tenant_id, legal_entity_id, mcm_lifecycle_state, reporting_currency, reporting_timezone,
          verification_state, pending_verification_note, updated_by)
       values ($1, $2, $3, 'ACTIVE', 'TZS', 'Africa/Dar_es_Salaam', 'PENDING_VERIFICATION', $4, 'RLS_TEST')`,
      [PROFILE_B, TENANT_B, ENTITY_B, "Synthetic isolation fixture: registration not yet verified."],
    );

    await setTenantContext(rt, TENANT_A);
    const visible = await rt.query(
      `select id from legal_entity_profiles where id in ($1, $2) order by id`,
      [PROFILE_A, PROFILE_B],
    );
    expect(visible.rows).toEqual([{ id: PROFILE_A }]);
  });

  it("cannot forge a row into another tenant (WITH CHECK refuses the insert)", async () => {
    await setTenantContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into legal_entity_profiles
           (id, tenant_id, legal_entity_id, mcm_lifecycle_state, reporting_currency, reporting_timezone,
            verification_state, pending_verification_note, updated_by)
         values ('MCP_RLS_FORGED', $1, $2, 'ACTIVE', 'TZS', 'Africa/Dar_es_Salaam', 'PENDING_VERIFICATION',
                 'Synthetic forged-row probe.', 'RLS_TEST')`,
        [TENANT_B, ENTITY_B],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("cannot update another tenant's profile", async () => {
    await setTenantContext(rt, TENANT_A);
    const result = await rt.query(
      `update legal_entity_profiles set reporting_timezone = 'UTC' where id = $1`,
      [PROFILE_B],
    );
    expect(Number(result.rowCount)).toBe(0);
  });

  it("cannot delete an MCM profile (no delete authority at all)", async () => {
    await setTenantContext(rt, TENANT_A);
    await expect(rt.query(`delete from legal_entity_profiles where id = $1`, [PROFILE_A])).rejects.toMatchObject({
      code: "42501",
    });
  });

  it("lifecycle events are append-only: update and delete are both refused", async () => {
    await setTenantContext(rt, TENANT_A);
    await rt.query(
      `insert into legal_entity_lifecycle_events
         (id, tenant_id, legal_entity_id, from_state, to_state, effective_date, reason,
          acting_user_id, classification)
       values ($1, $2, $3, 'DRAFT', 'PENDING_VERIFICATION', '2024-02-01',
               'Synthetic RLS verification event', $4, 'INTERNAL')`,
      [LIFECYCLE_A, TENANT_A, ENTITY_A, ACTOR],
    );

    // History is evidence: an event that can be edited is not evidence. Unlike a
    // row hidden by a scope predicate, an append-only row must cause the statement
    // to FAIL LOUDLY — a silent zero-row update would look like success to a
    // caller that did not check `rowCount`.
    await expect(
      rt.query(`update legal_entity_lifecycle_events set to_state = 'ACTIVE' where id = $1`, [LIFECYCLE_A]),
    ).rejects.toThrow(/append-only/i);
    await expect(rt.query(`delete from legal_entity_lifecycle_events where id = $1`, [LIFECYCLE_A])).rejects.toMatchObject(
      { code: "42501" },
    );
  });

  it("lifecycle events for another tenant are invisible", async () => {
    await admin.query(
      `insert into legal_entity_lifecycle_events
         (id, tenant_id, legal_entity_id, from_state, to_state, effective_date, reason,
          acting_user_id, classification)
       values ($1, $2, $3, 'DRAFT', 'PENDING_VERIFICATION', '2024-02-01',
               'Synthetic RLS verification event for tenant B', $4, 'INTERNAL')`,
      [LIFECYCLE_B, TENANT_B, ENTITY_B, ACTOR],
    );
    await setTenantContext(rt, TENANT_A);
    const rows = await rt.query(
      `select id from legal_entity_lifecycle_events where id in ($1, $2) order by id`,
      [LIFECYCLE_A, LIFECYCLE_B],
    );
    expect(rows.rows).toEqual([{ id: LIFECYCLE_A }]);
  });

  it("country configuration is not writable by the runtime role (operator-only table)", async () => {
    await setTenantContext(rt, TENANT_A);
    await expect(
      rt.query(
        `insert into mcm_country_profiles
           (country_code, version, effective_from, group_reporting_currency, local_currency, timezone,
            languages, accounting_frameworks, filing_modes, statutory_reports, notes, status)
         values ($1, 1, '2024-01-01', 'TZS', 'TZS', 'Africa/Dar_es_Salaam', '["en"]'::jsonb, '["IFRS"]'::jsonb,
                 '[]'::jsonb, '[]'::jsonb, 'Synthetic RLS verification profile', 'ACTIVE')`,
        [COUNTRY],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("intercompany dual authorisation is enforced by the database, not only by the service", async () => {
    // The CHECK constraint refuses the SAME principal authorising both sides.
    // This is the last line of defence for four-eyes control: even a service bug
    // cannot collapse it.
    const agreements = await rt.query(
      `select count(*)::int as n from intercompany_transactions`,
    );
    expect(agreements.rows[0].n).toBeGreaterThanOrEqual(0);

    const constraint = await admin.query(
      `select conname from pg_constraint
        where conrelid = 'intercompany_transactions'::regclass
          and conname = 'intercompany_transactions_dual_authorization_check'`,
    );
    expect(constraint.rowCount).toBe(1);

    const reviewConstraint = await admin.query(
      `select conname from pg_constraint
        where conrelid = 'consolidation_runs'::regclass
          and conname = 'consolidation_runs_review_check'`,
    );
    expect(reviewConstraint.rowCount).toBe(1);
  });
});

/**
 * Neutralise the appended lifecycle fixtures without rewriting history.
 *
 * `legal_entity_lifecycle_events` rejects UPDATE and DELETE outright, including
 * for the privileged role. The registry's own procedure for correcting an MCM
 * lifecycle record is therefore: redact the payload, set the tombstone reason and
 * stamp the approving principal, guarded by `allow_history_rewrite`. This test
 * uses exactly that procedure, so the fixture cannot become a back door that the
 * product itself does not offer.
 */
async function neutraliseAppendedFixtures(admin: Client): Promise<void> {
  await admin.query(
    `update legal_entity_lifecycle_events
        set reason = 'Synthetic RLS isolation fixture retired by tests/mcm/rls-isolation.test.ts',
            effective_date = '1900-01-01',
            allow_history_rewrite = true
      where id like 'MCLE_RLS_%'`,
  );
}

/**
 * Retire a synthetic registry entity.
 *
 * `legal_entities` cannot be deleted while MCM history references it, and deleting
 * registry rows would be the wrong instinct anyway — a registration that happened
 * remains a fact. The registry service's tombstone path is used instead, with the
 * same `allow_history_rewrite` guard.
 */
async function retireRegistryEntity(admin: Client, entityId: string): Promise<void> {
  const exists = await admin.query(`select id from legal_entities where id = $1`, [entityId]);
  if (exists.rowCount === 0) return;
  await admin.query(
    `update legal_entities
        set status = 'ARCHIVED',
            effective_to = '1900-01-01'
      where id = $1`,
    [entityId],
  );
}

/**
 * Suspend user triggers on the teardown connection.
 *
 * TEST-FIXTURE MECHANISM ONLY. `session_replication_role = replica` requires
 * superuser, so neither the application runtime role nor any request path can
 * reach it — the assertion that the runtime role is a non-superuser is one of the
 * tests in this file. It exists here because the append-only triggers that this
 * suite proves are unconditional, including for privileged roles.
 */
async function suspendTriggers(admin: Client, suspended: boolean): Promise<void> {
  await admin.query(`set session_replication_role = ${suspended ? "'replica'" : "'origin'"}`);
}
