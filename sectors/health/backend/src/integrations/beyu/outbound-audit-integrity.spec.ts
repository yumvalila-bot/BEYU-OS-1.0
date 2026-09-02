/**
 * Outbound audit integrity for the governed BEYU adapters.
 *
 * ROOT CAUSE THIS FILE GUARDS. The adapters used to write their audit rows with
 * raw SQL into `health.audit_events`. No migration has ever created that table
 * — the canonical Health audit ledger is `health.audit_log` (migration 006),
 * extended by 009 and 012. Every such write therefore failed with 42P01 and the
 * `catch` swallowed it, so 100% of BEYU outbound audit records were silently
 * lost. `audit_events` exists only in the unrelated Supabase-hosted enterprise
 * schemas (`public.audit_events` / `compliance.audit_events`), which are not
 * part of the backend migration set.
 *
 * The adapters now write through the canonical AuditService, which is the same
 * mechanism the other ~30 Health services use: per-tenant SHA-256 hash chain,
 * tenant/entity/country/actor columns, and the append-only triggers from
 * migrations 011/012.
 *
 * FAILURE SEMANTICS THESE TESTS LOCK IN (proven from the architecture, not
 * chosen arbitrarily):
 *
 *   MANDATORY, PRE-CALL  health.beyu_outbox — written by execute() BEFORE the
 *                        call, unguarded, requires an actor context. If it
 *                        cannot be written the outbound call never happens.
 *                        It shares the database/failure domain of the audit
 *                        ledger, so audit infrastructure being down already
 *                        blocks the call.
 *
 *   BEST-EFFORT, POST-CALL  health.audit_log — by the time it runs the external
 *                        side effect has already occurred, so throwing could not
 *                        undo it. It must however actually persist, and a
 *                        failure must be logged, never silently dropped.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { BeyuBaseAdapter } from "./adapters/beyu-base.adapter";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import { AuditService } from "../../modules/audit/audit.service";
import { buildTestBed, TEST_ACTOR } from "../../common/testing/test-bed";

const ENDPOINT_ENV = "TEST_AUDIT_ADAPTER_ENDPOINT";

/**
 * Adapter whose outbound call we control. Provider name is unique per instance
 * so circuit-breaker state (keyed on `provider:action` per tenant) cannot leak
 * between tests.
 */
class ProbeAdapter extends BeyuBaseAdapter {
  protected readonly config: {
    provider: string;
    endpointEnv: string;
    credentialEnvs: string[];
    defaultTimeoutMs: number;
    maxRetries: number;
    baseBackoffMs: number;
  };

  attempts = 0;

  constructor(
    db: any,
    tenantCtx: any,
    circuit: CircuitBreaker,
    cfg: any,
    auditService: AuditService,
    private readonly tag: string,
    private readonly behaviour: () => Promise<unknown>,
  ) {
    super(db, tenantCtx, circuit, cfg, auditService);
    this.config = {
      provider: `auditprobe-${tag}`,
      endpointEnv: ENDPOINT_ENV,
      credentialEnvs: [],
      defaultTimeoutMs: 2000,
      maxRetries: 0,
      baseBackoffMs: 1,
    };
  }

  call() {
    return this.execute(this.tag, { ping: true }, async () => {
      this.attempts += 1;
      return this.behaviour();
    });
  }
}

describe("BEYU outbound audit integrity (health.audit_log, canonical path)", () => {
  let bed: any;
  let circuit: CircuitBreaker;
  const cfg = {
    get: (k: string) =>
      k === ENDPOINT_ENV ? "https://example.invalid" : undefined,
  };

  /** PGliteConnection returns a bare row array; pg returns { rows }. Normalise. */
  const q = async (sql: string, params: any[] = []): Promise<any[]> => {
    const r = await bed.conn.query(sql, params);
    return r?.rows ?? r;
  };

  beforeAll(async () => {
    bed = await buildTestBed();
    circuit = new CircuitBreaker(bed.conn, bed.tenantCtx);
  });

  let seq = 0;
  function build(behaviour: () => Promise<unknown>) {
    seq += 1;
    const tag = `a${seq}`;
    return {
      tag,
      adapter: new ProbeAdapter(
        bed.conn,
        bed.tenantCtx,
        circuit,
        cfg,
        bed.audit,
        tag,
        behaviour,
      ),
    };
  }

  const ok = async () => ({ status: "ok" });
  const failing = () => async () => {
    throw Object.assign(new Error("downstream failure"), { status: 503 });
  };

  const auditRows = (tag: string) =>
    q(
      `SELECT audit_id, operation, tenant_id, entity_code, country_code,
              actor_global_user_id, correlation_id, result_status,
              source_service, auth_decision, entry_hash, metadata
         FROM health.audit_log
        WHERE operation = $1
        ORDER BY audit_id DESC`,
      [`beyu.outbound.${tag}`],
    );

  it("health.audit_events does not exist in ANY schema (phantom-table regression guard)", async () => {
    const rows = await q(
      `SELECT table_schema || '.' || table_name AS t
         FROM information_schema.tables
        WHERE table_name = 'audit_events'`,
    );
    expect(rows).toEqual([]);
  });

  it("no adapter source references health.audit_events any more", () => {
    const root = path.resolve(__dirname);
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          e.name.endsWith(".ts") &&
          !e.name.endsWith(".spec.ts") &&
          fs.readFileSync(p, "utf8").includes("health.audit_events")
        ) {
          hits.push(path.relative(root, p));
        }
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });

  it("persists a successful outbound call to health.audit_log with full tenant/entity/country/actor context", async () => {
    const { tag, adapter } = build(ok);
    await bed.run(() => adapter.call());

    const rows = await auditRows(tag);
    expect(rows.length).toBe(1);
    const r = rows[0];
    expect(r.operation).toBe(`beyu.outbound.${tag}`);
    expect(r.tenant_id).toBe(TEST_ACTOR.tenantId);
    expect(r.entity_code).toBe(TEST_ACTOR.entityCode);
    expect(r.country_code).toBe(TEST_ACTOR.countryCode);
    expect(r.actor_global_user_id).toBe(TEST_ACTOR.globalUserId);
    expect(r.correlation_id).toBeTruthy();
    expect(r.result_status).toBe("ok");
    expect(r.auth_decision).toBe("allowed");
    expect(r.source_service).toBe("health-api");
    expect(r.metadata.provider).toBe(`auditprobe-${tag}`);
    expect(r.metadata.idempotencyKey).toBeTruthy();
  });

  it("records a failed outbound call with result_status='error' and the error in metadata", async () => {
    const { tag, adapter } = build(failing());
    await bed.run(() => adapter.call()).catch(() => undefined);

    const rows = await auditRows(tag);
    expect(rows.length).toBe(1);
    expect(rows[0].result_status).toBe("error");
    expect(String(rows[0].metadata.error)).toContain("downstream failure");
  });

  it("participates in the per-tenant audit hash chain (64-char SHA-256 entry_hash)", async () => {
    const { tag, adapter } = build(ok);
    await bed.run(() => adapter.call());

    const rows = await auditRows(tag);
    expect(rows[0].entry_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("audit rows are append-only: UPDATE and DELETE are rejected by the DB triggers", async () => {
    const { tag, adapter } = build(ok);
    await bed.run(() => adapter.call());
    const id = (await auditRows(tag))[0].audit_id;

    await expect(
      q(
        `UPDATE health.audit_log SET operation='tampered' WHERE audit_id=$1::uuid`,
        [id],
      ),
    ).rejects.toThrow(/AUDIT_IMMUTABLE|AUDIT_CHAIN_IMMUTABLE/i);
    await expect(
      q(`DELETE FROM health.audit_log WHERE audit_id=$1::uuid`, [id]),
    ).rejects.toThrow(/AUDIT_IMMUTABLE/i);
  });

  it("tenant isolation: only the owning tenant's boundary can read the audit row", async () => {
    const { tag, adapter } = build(ok);
    await bed.run(() => adapter.call());
    expect((await auditRows(tag)).length).toBe(1);

    const OTHER = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    await bed.conn.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='audit_probe_role') THEN
          CREATE ROLE audit_probe_role NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA health, beyu_identity TO audit_probe_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA health TO audit_probe_role;
      GRANT SELECT ON beyu_identity.tenants, beyu_identity.users,
                      beyu_identity.tenant_memberships TO audit_probe_role;
    `);

    // Transaction-local GUCs set in the SAME statement as the count — the
    // proven pattern from src/database/rls-adversarial.spec.ts.
    const visibleAs = async (
      tenantId: string,
      country: string,
      entity: string,
    ) => {
      const r = await q(
        `SELECT set_config('app.tenant_id', $1, true),
                set_config('app.country_code', $2, true),
                set_config('app.entity_code', $3, true),
                (SELECT count(*)::int FROM health.audit_log
                  WHERE operation=$4) AS n`,
        [tenantId, country, entity, `beyu.outbound.${tag}`],
      );
      return r[0].n;
    };

    try {
      await bed.conn.exec(`SET ROLE audit_probe_role;`);

      // Positive control: with the owning tenant's boundary the row IS visible.
      // Without this every zero below could pass vacuously.
      expect(
        await visibleAs(
          TEST_ACTOR.tenantId,
          TEST_ACTOR.countryCode,
          TEST_ACTOR.entityCode,
        ),
      ).toBe(1);

      // A different tenant sees nothing. This is the assertion migration 019
      // makes true: before it, health_audit_isolation omitted the
      // app.tenant_id conjunct and this returned 1.
      expect(await visibleAs(OTHER, "KE", "HOSP-OTHER")).toBe(0);

      // Fail-closed: an empty boundary sees nothing either.
      expect(await visibleAs("", "", "")).toBe(0);
    } finally {
      await bed.conn.exec(`RESET ROLE;`);
    }
  });

  it("a failing audit write does NOT abort the outbound result (best-effort) but is not silent", async () => {
    await bed.conn.exec(`
      CREATE OR REPLACE FUNCTION health.test_block_outbound_audit() RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.operation LIKE 'beyu.outbound.%' THEN
          RAISE EXCEPTION 'SIMULATED_AUDIT_OUTAGE';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS test_block_outbound_audit ON health.audit_log;
      CREATE TRIGGER test_block_outbound_audit
        BEFORE INSERT ON health.audit_log
        FOR EACH ROW EXECUTE FUNCTION health.test_block_outbound_audit();
    `);
    const { tag, adapter } = build(ok);
    const errSpy = jest
      .spyOn((adapter as any).logger, "error")
      .mockImplementation(() => undefined);
    try {
      const result = await bed.run(() => adapter.call());
      // The external call still completed and the durable outbox row recorded it.
      expect(result).toEqual({ status: "ok" });
      expect(adapter.attempts).toBe(1);
      const ob = await q(
        `SELECT status FROM health.beyu_outbox WHERE provider=$1`,
        [`auditprobe-${tag}`],
      );
      expect(ob[0].status).toBe("delivered");
      // No audit row made it in...
      expect((await auditRows(tag)).length).toBe(0);
      // ...but the loss is loud, not silent: error level, naming the call.
      expect(errSpy).toHaveBeenCalled();
      const msg = String(errSpy.mock.calls[0][0]);
      expect(msg).toContain(`auditprobe-${tag}:${tag}`);
    } finally {
      errSpy.mockRestore();
      await bed.conn.exec(
        `DROP TRIGGER IF EXISTS test_block_outbound_audit ON health.audit_log;
         DROP FUNCTION IF EXISTS health.test_block_outbound_audit();`,
      );
    }
  });

  it("the outbox is the MANDATORY pre-call gate: if it cannot be written, no external call happens", async () => {
    await bed.conn.exec(`
      CREATE OR REPLACE FUNCTION health.test_block_outbox() RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'SIMULATED_OUTBOX_OUTAGE';
      END $$ LANGUAGE plpgsql;
      DROP TRIGGER IF EXISTS test_block_outbox ON health.beyu_outbox;
      CREATE TRIGGER test_block_outbox
        BEFORE INSERT ON health.beyu_outbox
        FOR EACH ROW EXECUTE FUNCTION health.test_block_outbox();
    `);
    try {
      const { adapter } = build(ok);
      await expect(bed.run(() => adapter.call())).rejects.toThrow();
      expect(adapter.attempts).toBe(0);
    } finally {
      await bed.conn.exec(
        `DROP TRIGGER IF EXISTS test_block_outbox ON health.beyu_outbox;
         DROP FUNCTION IF EXISTS health.test_block_outbox();`,
      );
    }
  });

  it("adapters stay fail-closed (NOT_CONFIGURED) and write no outbound audit at all", async () => {
    const noCfg = { get: () => undefined };
    const probe = new ProbeAdapter(
      bed.conn,
      bed.tenantCtx,
      circuit,
      noCfg,
      bed.audit,
      "notconfigured",
      ok,
    );
    await expect(bed.run(() => probe.call())).rejects.toThrow(/NOT_CONFIGURED/);
    expect(probe.attempts).toBe(0);
    expect((await auditRows("notconfigured")).length).toBe(0);
  });
});
