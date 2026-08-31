/**
 * NestJS E2E harness backed by PGlite (in-memory Postgres).
 *
 * Boots the AppModule with DB_CONNECTION overridden to a PGliteConnection
 * that has all migrations applied, so we can issue real HTTP requests via
 * supertest against the full Nest stack (auth/MFA/CSRF/RLS/audit/queue/etc.).
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { PGlite } from "@electric-sql/pglite";
import { AppModule } from "../../app.module";
import { DB_CONNECTION, PGliteConnection } from "../../modules/identity/db-connection";
import { TenantContext } from "../security/tenant-context";
import { requestStorage } from "../observability/correlation-id.middleware";

export const MIG_DIR = path.resolve(__dirname, "..", "..", "..", "database", "migrations");

export const E2E_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  globalUserId: "00000000-0000-0000-0000-000000000001",
  email: "doc@beyu.health",
  role: "doctor",
  permissions: [
    "patient:read", "patient:register", "phi:read", "phi:write",
    "rx:write", "rx:dispense", "rx:controlled",
    "order:lab", "order:imaging", "note:write", "note:sign",
    "appointment:read", "appointment:book", "appointment:transition",
    "encounter:start", "encounter:complete",
    "billing:read", "billing:write", "payment:receive",
    "inventory:read", "inventory:write",
    "audit:read", "report:read", "report:submit",
    "tenant:admin",
  ],
  tenantId: "11111111-1111-1111-1111-111111111111",
  countryCode: "TZ",
  entityCode: "HOSP-1",
  timezone: "Africa/Dar_es_Salaam",
};

export interface E2EHarness {
  app: INestApplication;
  db: PGlite;
  conn: PGliteConnection;
  tenantCtx: TenantContext;
  close(): Promise<void>;
  runInActorContext<T>(fn: () => Promise<T>): Promise<T>;
}

export async function buildE2EHarness(overrides: Record<string, any> = {}): Promise<E2EHarness> {
  const db = new PGlite();
  const conn = new PGliteConnection(db);
  const migs = fs.readdirSync(MIG_DIR).filter((f) => f.endsWith(".up.sql")).sort();
  for (const f of migs) {
    await conn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
  }
  await conn.exec(
    `INSERT INTO beyu_identity.users (global_user_id, email, display_name, password_hash)
       VALUES ('${E2E_ACTOR.userId}','${E2E_ACTOR.email}','Test Doctor','x')
       ON CONFLICT DO NOTHING;
     INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
       VALUES ('${E2E_ACTOR.tenantId}','test','Test Tenant','TZ','HOSP-1')
       ON CONFLICT DO NOTHING;
     INSERT INTO beyu_identity.tenant_memberships (global_user_id, tenant_id, role)
       VALUES ('${E2E_ACTOR.userId}','${E2E_ACTOR.tenantId}','doctor')
       ON CONFLICT DO NOTHING;`,
  );

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DB_CONNECTION)
    .useValue(conn)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.init();
  const tenantCtx = app.get<TenantContext>(TenantContext);

  function runInActorContext<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      requestStorage.run(
        { correlationId: "e2e-cid", requestId: "e2e-rid", startedAt: Date.now(), method: "E2E", path: "/", ip: "127.0.0.1" },
        () => tenantCtx.run(E2E_ACTOR as never, () => fn().then(res, rej)),
      );
    });
  }

  return {
    app, db, conn, tenantCtx,
    async close() { await app.close(); await db.close(); },
    runInActorContext,
  };
}
