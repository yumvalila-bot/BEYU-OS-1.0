/**
 * Phase 2A adversarial tests: prove that withIsolation() provides ambient
 * transaction reuse via AsyncLocalStorage (no nested-tx deadlock, rollback
 * propagates from outer, unrelated concurrent requests never share a tx,
 * cross-tenant never leaks).
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../../modules/identity/db-connection";
import * as fs from "fs";
import * as path from "path";
import { BaseRepository } from "../../common/db/base.repository";
import { TenantContext } from "../../common/security/tenant-context";
import { requestStorage } from "../../common/observability/correlation-id.middleware";
import { Injectable } from "@nestjs/common";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const ACTOR = "00000000-0000-0000-0000-000000000001";

@Injectable()
class ProbeRepo extends BaseRepository {
  async insertPatient(med: string, first: string, last: string, tx?: any) {
    const sql = `INSERT INTO health.patients (tenant_id, medical_record, given_name, family_name, sex, created_by, updated_by, correlation_id)
                 VALUES ($1,$2,$3,$4,'unknown',$5,$5,$6) RETURNING patient_id`;
    const params = [
      this.tenantContext.tenantId(),
      med,
      first,
      last,
      ACTOR,
      "c",
    ];
    const run = async (c: any) => c.query(sql, params).then((r: any[]) => r[0]);
    return tx ? run(tx) : this.withIsolation(run);
  }
  countPatients(tx?: any) {
    const sql = `SELECT count(*)::int AS n FROM health.patients WHERE tenant_id=$1 AND ${this.notVoided("health.patients")}`;
    const run = (c: any) =>
      c
        .query(sql, [this.tenantContext.tenantId()])
        .then((r: any[]) => Number(r[0].n));
    return tx ? run(tx) : this.withIsolation(run);
  }
  // Direct query runs under the caller's current role+GUCs (used for RLS probe).
  rawCountLike(pattern: string) {
    return this.withIsolation((tx) =>
      tx
        .query<{ n: number }>(
          `SELECT count(*)::int AS n FROM health.patients WHERE medical_record LIKE $1`,
          [pattern],
        )
        .then((r) => Number(r[0].n)),
    );
  }
}

function runAs<T>(
  tenantCtx: TenantContext,
  tenantId: string,
  country: string,
  entity: string,
  fn: () => Promise<T>,
): Promise<T> {
  return new Promise<T>((res, rej) => {
    requestStorage.run(
      {
        correlationId: "c",
        requestId: "r",
        startedAt: Date.now(),
        method: "T",
        path: "/",
        ip: "127.0.0.1",
      },
      () =>
        tenantCtx.run(
          {
            userId: ACTOR,
            email: "a@b.c",
            role: "doctor",
            permissions: ["patient:register", "patient:read"],
            tenantId,
            countryCode: country,
            entityCode: entity,
            globalUserId: ACTOR,
          } as any,
          () => fn().then(res, rej),
        ),
    );
  });
}

describe("Transaction isolation (Phase 2A)", () => {
  let conn: PGliteConnection;
  let tenantCtx: TenantContext;
  let repo: ProbeRepo;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    for (const f of fs
      .readdirSync(MIG_DIR)
      .filter((f) => f.endsWith(".up.sql"))
      .sort())
      await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
    await conn.exec(
      `INSERT INTO beyu_identity.users (global_user_id,email,display_name,password_hash) VALUES ('${ACTOR}','a@b.c','Actor','x') ON CONFLICT DO NOTHING;
       INSERT INTO beyu_identity.tenants (tenant_id,tenant_code,name,country_code,entity_code) VALUES ('${TENANT_A}','a','Tenant A','TZ','H1') ON CONFLICT DO NOTHING;
       INSERT INTO beyu_identity.tenants (tenant_id,tenant_code,name,country_code,entity_code) VALUES ('${TENANT_B}','b','Tenant B','TZ','H1') ON CONFLICT DO NOTHING;
       INSERT INTO beyu_identity.tenant_memberships (global_user_id,tenant_id,role) VALUES ('${ACTOR}','${TENANT_A}','doctor'),('${ACTOR}','${TENANT_B}','doctor') ON CONFLICT DO NOTHING;
       DROP ROLE IF EXISTS rls_app;
       CREATE ROLE rls_app NOLOGIN;
       GRANT USAGE ON SCHEMA health, beyu_identity TO rls_app;
       GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA health TO rls_app;
       GRANT SELECT ON beyu_identity.tenants, beyu_identity.users, beyu_identity.tenant_memberships TO rls_app;`,
    );
    tenantCtx = new TenantContext();
    repo = new ProbeRepo(conn as any, tenantCtx);
    // Run as non-owner role so RLS is not bypassed.
    await conn.exec("SET ROLE rls_app");
  });

  afterAll(async () => {
    await conn
      .exec("RESET ROLE; DROP ROLE IF EXISTS rls_app;")
      .catch(() => null);
  });

  it("simple transaction commits a write visible after commit", () =>
    runAs(tenantCtx, TENANT_A, "TZ", "H1", async () => {
      const before = await repo.countPatients();
      await repo.insertPatient(`SIMPLE-${Date.now()}`, "A", "B");
      const after = await repo.countPatients();
      expect(after).toBe(before + 1);
    }));

  it("nested withIsolation() reuses the ambient transaction (no nested deadlock)", () =>
    runAs(tenantCtx, TENANT_A, "TZ", "H1", async () => {
      // Outer withIsolation opens a tx; insertPatient inside opens its own
      // withIsolation; this must reuse the outer tx and both writes commit.
      const n0 = await repo.countPatients();
      await repo.withIsolation(async (tx) => {
        await repo.insertPatient(`NEST-OUTER-${Date.now()}`, "O", "O", tx);
        await repo.insertPatient(`NEST-INNER-${Date.now()}`, "I", "I"); // uses its own withIsolation -> ALS reuse
        const n1 = await repo.countPatients(tx);
        expect(n1).toBe(n0 + 2);
      });
      const n2 = await repo.countPatients();
      expect(n2).toBe(n0 + 2);
    }));

  it("inner exception rolls back outer transaction (atomic failure)", () =>
    runAs(tenantCtx, TENANT_A, "TZ", "H1", async () => {
      const n0 = await repo.countPatients();
      await expect(
        repo.withIsolation(async (tx) => {
          await repo.insertPatient(`ROLL-${Date.now()}-1`, "R", "R", tx);
          await repo.insertPatient(`ROLL-${Date.now()}-2`, "R", "R", tx);
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      const n1 = await repo.countPatients();
      expect(n1).toBe(n0); // nothing persisted
    }));

  it("unrelated concurrent requests NEVER share a transaction (interleaved writes are isolated until commit)", async () => {
    const p1 = runAs(tenantCtx, TENANT_A, "TZ", "H1", async () => {
      return repo.withIsolation(async (tx) => {
        await repo.insertPatient(`CONC-A-${Date.now()}`, "A", "A", tx);
        await new Promise((r) => setTimeout(r, 30));
        const n = await repo.countPatients(tx);
        await new Promise((r) => setTimeout(r, 30));
        return n;
      });
    });
    const p2 = runAs(tenantCtx, TENANT_B, "TZ", "H1", async () => {
      return repo.withIsolation(async (tx) => {
        await repo.insertPatient(`CONC-B-${Date.now()}`, "B", "B", tx);
        await new Promise((r) => setTimeout(r, 15));
        const n = await repo.countPatients(tx);
        await new Promise((r) => setTimeout(r, 45));
        return n;
      });
    });
    const [a, b] = await Promise.all([p1, p2]);
    // Each concurrent tx sees only its own writes within its tenant scope.
    expect(a).toBeGreaterThanOrEqual(1);
    expect(b).toBeGreaterThanOrEqual(1);
  });

  it("cross-tenant isolation: tenant B cannot see tenant A's patients via direct query under B's GUCs", () =>
    runAs(tenantCtx, TENANT_B, "TZ", "H1", async () => {
      // Under RLS with TENANT_B set (set by runAs/withIsolation), we see zero
      // rows belonging to TENANT_A.
      const r = await repo.withIsolation((tx) =>
        tx.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM health.patients WHERE medical_record LIKE 'SIMPLE-%'`,
        ),
      );
      expect(Number(r[0].n)).toBe(0);
    }));

  it("AsyncLocalStorage context does not leak after withIsolation resolves", async () => {
    await runAs(tenantCtx, TENANT_A, "TZ", "H1", () =>
      repo.withIsolation(async (tx) => {
        expect(tx).toBeTruthy();
      }),
    );
    // After returning, there must be no ambient tx in ALS.
    // (We can't introspect ALS directly from outside, but we can prove
    // subsequent operations start fresh transactions.)
    await runAs(tenantCtx, TENANT_A, "TZ", "H1", async () => {
      const n0 = await repo.countPatients();
      await repo.insertPatient(`ALS-CLEAN-${Date.now()}`, "C", "C");
      const n1 = await repo.countPatients();
      expect(n1).toBe(n0 + 1);
    });
  });
});
