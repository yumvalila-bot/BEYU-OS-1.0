/**
 * Audit hash-chain integrity, including concurrency.
 *
 * WHY THIS EXISTS. Two defects made the per-tenant chain unusable, both proven
 * against real PostgreSQL 16.14 with ten concurrent same-tenant writers:
 *
 *   1. NO CONCURRENCY CONTROL. The chain-tip lookup took no lock. Ten
 *      concurrent writers all read the committed tip (or nothing at all), so
 *      several anchored at HEALTH_AUDIT_GENESIS_v1 and several reused the same
 *      prev_hash. Measured on the pre-fix code: 3 genesis-rooted entries and 7
 *      reused prev_hash values out of 10 rows. Nothing detected it — migration
 *      012's header claims the database enforces "prev_hash must equal the last
 *      entry_hash", but trg_audit_chain_verify only checks that entry_hash is a
 *      64-char digest and that hash fields are immutable after insert.
 *
 *   2. THE TIP WAS SELECTED BY ORDERING. `ORDER BY audit_id DESC` cannot mean
 *      "most recent": audit_id is gen_random_uuid(), so it selected an arbitrary
 *      row. This broke the chain even for strictly sequential writers, which is
 *      why fixing only the lock was not enough.
 *
 * The fix serializes same-tenant writers with pg_advisory_xact_lock and derives
 * the tip as "the entry no other row points at". FOR UPDATE was ruled out by
 * measurement, not preference: on an empty chain there is no row to lock, and
 * beyu_identity.tenants — the one row that always exists — is read-only for the
 * runtime role (`SELECT ... FOR UPDATE` returns 42501).
 *
 * ENGINE. createTestDbConnection() returns a real PgConnection when
 * TEST_DATABASE_URL is set, else PGlite. Genuine parallelism — separate
 * sessions racing for one chain — only occurs against a real server, which is
 * where CI runs this file (the `audit-chain-integrity` pattern in the real
 * PostgreSQL security step). Under PGlite the same assertions run against
 * serialized transactions, so the chain invariants and every immutability,
 * isolation and actor rule are still enforced here.
 */
import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import {
  createTestSuperuserConnection,
  TestDbConnection,
} from "../identity/test-connection";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { AuditService } from "./audit.service";
import { AUDIT_GENESIS } from "../../common/crypto/crypto";

jest.setTimeout(120_000);

// src/modules/audit -> backend/database/migrations
const MIG = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
const UNIQUE = Date.now().toString(36);
const TENANT_A = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaa01";
const TENANT_B = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbb02";
const USER_A = "11111111-1111-4111-1111-1111111111a1";

interface ChainRow {
  audit_id: string;
  entry_hash: string | null;
  prev_hash: string | null;
  hash_version: number;
}

describe("audit hash-chain integrity", () => {
  let admin: TestDbConnection;
  let db: TestDbConnection;
  let tenantCtx: TenantContext;
  let audit: AuditService;

  const rows = async (tenantId: string, op: string): Promise<ChainRow[]> =>
    (await admin.query(
      `SELECT audit_id, entry_hash, prev_hash, hash_version
         FROM health.audit_log
        WHERE tenant_id=$1::uuid AND operation=$2
        ORDER BY created_at, audit_id`,
      [tenantId, op],
    )) as unknown as ChainRow[];

  /** Order-independent chain invariants. A valid chain has exactly one genesis
   *  root, reuses no prev_hash, and every prev_hash resolves to a real entry. */
  const diagnose = (all: ChainRow[], subset: ChainRow[]) => {
    const known = new Set(all.map((r) => r.entry_hash));
    const genesisRoots = subset.filter((r) => r.prev_hash === AUDIT_GENESIS);
    const seen = new Set<string>();
    let reused = 0;
    for (const r of subset) {
      if (seen.has(r.prev_hash as string)) reused++;
      seen.add(r.prev_hash as string);
    }
    const dangling = subset.filter(
      (r) => r.prev_hash !== AUDIT_GENESIS && !known.has(r.prev_hash as string),
    );
    return {
      genesisRoots: genesisRoots.length,
      reused,
      dangling: dangling.length,
    };
  };

  const actor = (tenantId: string) =>
    ({
      userId: USER_A,
      globalUserId: USER_A,
      email: "chain@beyu.health",
      role: "doctor",
      permissions: ["audit:read"],
      tenantId,
      countryCode: "TZ",
      entityCode: "HOSP-1",
    }) as any;

  /** Run fn with the ambient actor + correlation context AuditService reads. */
  const asActor = <T>(tenantId: string, i: number, fn: () => Promise<T>) =>
    tenantCtx.run(actor(tenantId), () =>
      requestStorage.run(
        { correlationId: `chain-${i}`, requestId: `req-${i}` } as any,
        fn,
      ),
    );

  const record = (tenantId: string, op: string, i: number) =>
    asActor(tenantId, i, () =>
      db.transaction((tx) =>
        audit.record(tx, {
          operation: op,
          resourceType: "chain_test",
          resourceId: `${op}-${i}`,
          metadata: { i },
        }),
      ),
    );

  beforeAll(async () => {
    admin = await createTestSuperuserConnection();
    db = admin;
    tenantCtx = new TenantContext();
    audit = new AuditService(db, tenantCtx);

    // createTestSuperuserConnection() hands back a FRESH EMPTY scratch
    // database on a real server (and a blank PGlite otherwise), so the schema
    // is applied here directly rather than through the migration runner — the
    // runner would record a second beyu_migrations ledger for a database CI has
    // already migrated.
    for (const f of fs
      .readdirSync(MIG)
      .filter((x) => x.endsWith(".up.sql"))
      .sort()) {
      await admin.exec(fs.readFileSync(path.join(MIG, f), "utf8"));
    }

    await admin.exec(`
      INSERT INTO beyu_identity.users
        (global_user_id, email, display_name, password_hash)
      VALUES ('${USER_A}','chain-${UNIQUE}@beyu.health','chain','x')
      ON CONFLICT (global_user_id) DO NOTHING;
      INSERT INTO beyu_identity.tenants
        (tenant_id, tenant_code, name, country_code, entity_code)
      VALUES ('${TENANT_A}','CHAIN-A-${UNIQUE}','chain A','TZ','HOSP-1'),
             ('${TENANT_B}','CHAIN-B-${UNIQUE}','chain B','TZ','HOSP-1')
      ON CONFLICT (tenant_id) DO NOTHING;
      INSERT INTO beyu_identity.tenant_memberships
        (global_user_id, tenant_id, role)
      VALUES ('${USER_A}','${TENANT_A}','doctor')
      ON CONFLICT DO NOTHING;
    `);
  });

  afterAll(async () => {
    await (admin as any).close?.();
  });

  it("1. a single audit entry is valid: genesis-rooted, 64-char hash, version 1", async () => {
    await record(TENANT_A, "chain.single", 0);
    const r = await rows(TENANT_A, "chain.single");
    expect(r.length).toBe(1);
    expect(r[0].prev_hash).toBe(AUDIT_GENESIS);
    expect(r[0].entry_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(r[0].hash_version).toBe(1);
  });

  it("2. sequential entries chain: each prev_hash equals the prior entry_hash", async () => {
    for (let i = 0; i < 5; i++) await record(TENANT_A, "chain.seq", i);
    const r = await rows(TENANT_A, "chain.seq");
    expect(r.length).toBe(5);
    for (let k = 1; k < r.length; k++) {
      expect(r[k].prev_hash).toBe(r[k - 1].entry_hash);
    }
  });

  it("3. concurrent same-tenant writers form ONE chain (no fork, no reused prev_hash)", async () => {
    const N = 10;
    await Promise.all(
      Array.from({ length: N }, (_, i) => record(TENANT_A, "chain.conc", i)),
    );
    const all = (await admin.query(
      `SELECT entry_hash, prev_hash FROM health.audit_log WHERE tenant_id=$1::uuid`,
      [TENANT_A],
    )) as unknown as ChainRow[];
    const subset = await rows(TENANT_A, "chain.conc");
    expect(subset.length).toBe(N);

    const d = diagnose(all, subset);
    expect(d.reused).toBe(0);
    expect(d.dangling).toBe(0);
    // Exactly one genesis root across the tenant's whole chain.
    const tenantGenesis = all.filter((r) => r.prev_hash === AUDIT_GENESIS);
    expect(tenantGenesis.length).toBe(1);
  });

  it("4. concurrent different-tenant writers keep independent, valid chains", async () => {
    const N = 8;
    await Promise.all([
      ...Array.from({ length: N }, (_, i) =>
        record(TENANT_A, "chain.mixed", i),
      ),
      ...Array.from({ length: N }, (_, i) =>
        record(TENANT_B, "chain.mixed", i),
      ),
    ]);

    for (const tenantId of [TENANT_A, TENANT_B]) {
      const all = (await admin.query(
        `SELECT entry_hash, prev_hash FROM health.audit_log WHERE tenant_id=$1::uuid`,
        [tenantId],
      )) as unknown as ChainRow[];
      const subset = await rows(tenantId, "chain.mixed");
      expect(subset.length).toBe(N);
      const d = diagnose(all, subset);
      expect(d.reused).toBe(0);
      expect(d.dangling).toBe(0);
      expect(all.filter((r) => r.prev_hash === AUDIT_GENESIS).length).toBe(1);
    }

    // Chains are genuinely separate: no hash from one tenant appears in the other.
    const [a, b] = await Promise.all([
      rows(TENANT_A, "chain.mixed"),
      rows(TENANT_B, "chain.mixed"),
    ]);
    const bHashes = new Set(b.map((r) => r.entry_hash));
    expect(a.some((r) => bHashes.has(r.entry_hash as string))).toBe(false);
  });

  it("5/6. tampering and core-field UPDATE are both rejected", async () => {
    await record(TENANT_A, "chain.tamper", 0);
    const id = (await rows(TENANT_A, "chain.tamper"))[0].audit_id;
    await expect(
      admin.query(
        `UPDATE health.audit_log SET entry_hash='00' WHERE audit_id=$1::uuid`,
        [id],
      ),
    ).rejects.toThrow(/AUDIT_CHAIN_IMMUTABLE/i);
    await expect(
      admin.query(
        `UPDATE health.audit_log SET operation='tampered' WHERE audit_id=$1::uuid`,
        [id],
      ),
    ).rejects.toThrow(/AUDIT_IMMUTABLE/i);
  });

  it("7. DELETE is rejected (append-only)", async () => {
    await record(TENANT_A, "chain.delete", 0);
    const id = (await rows(TENANT_A, "chain.delete"))[0].audit_id;
    await expect(
      admin.query(`DELETE FROM health.audit_log WHERE audit_id=$1::uuid`, [id]),
    ).rejects.toThrow(/AUDIT_IMMUTABLE/i);
  });

  it("8. tenant isolation holds for a non-owner role (RLS)", async () => {
    await record(TENANT_A, "chain.rls", 0);
    await admin.exec(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='chain_probe_role') THEN
          CREATE ROLE chain_probe_role NOLOGIN;
        END IF;
      END $$;
      GRANT USAGE ON SCHEMA health, beyu_identity TO chain_probe_role;
      GRANT SELECT ON ALL TABLES IN SCHEMA health TO chain_probe_role;
      GRANT SELECT ON beyu_identity.tenants TO chain_probe_role;
    `);
    const countAs = async (
      tenantId: string,
      country: string,
      entity: string,
    ) => {
      const r = (await admin.query(
        `SELECT set_config('app.tenant_id',$1,true),
                set_config('app.country_code',$2,true),
                set_config('app.entity_code',$3,true),
                (SELECT count(*)::int FROM health.audit_log
                  WHERE operation='chain.rls') AS n`,
        [tenantId, country, entity],
      )) as unknown as Array<{ n: number }>;
      return r[0].n;
    };
    try {
      await admin.exec(`SET ROLE chain_probe_role;`);
      expect(await countAs(TENANT_A, "TZ", "HOSP-1")).toBe(1); // positive control
      expect(await countAs(TENANT_B, "KE", "HOSP-OTHER")).toBe(0);
      expect(await countAs("", "", "")).toBe(0); // fail-closed
    } finally {
      await admin.exec(`RESET ROLE;`);
    }
  });

  it("9. an audit write outside actor context is refused, not recorded anonymously", async () => {
    await expect(
      db.transaction((tx) =>
        audit.record(tx, {
          operation: "chain.noactor",
          resourceType: "chain_test",
        }),
      ),
    ).rejects.toThrow(/outside actor context/i);
    expect((await rows(TENANT_A, "chain.noactor")).length).toBe(0);
  });

  it("10. every entry carries a 64-char entry_hash and hash_version 1", async () => {
    const all = (await admin.query(
      `SELECT entry_hash, hash_version FROM health.audit_log
        WHERE tenant_id IN ($1::uuid,$2::uuid) AND operation LIKE 'chain.%'`,
      [TENANT_A, TENANT_B],
    )) as unknown as Array<{ entry_hash: string | null; hash_version: number }>;
    expect(all.length).toBeGreaterThan(0);
    for (const r of all) {
      expect(r.entry_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.hash_version).toBe(1);
    }
  });

  it("the chain-tip support index from migration 020 exists", async () => {
    const r = (await admin.query(
      `SELECT count(*)::int AS n FROM pg_indexes
        WHERE schemaname='health' AND tablename='audit_log'
          AND indexname='idx_audit_log_prev_hash'`,
    )) as unknown as Array<{ n: number }>;
    expect(r[0].n).toBe(1);
  });
});
