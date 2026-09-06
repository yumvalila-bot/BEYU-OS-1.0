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
import {
  DB_CONNECTION,
  PGliteConnection,
} from "../../modules/identity/db-connection";
import { TenantContext } from "../security/tenant-context";
import { requestStorage } from "../observability/correlation-id.middleware";
import { DomainExceptionFilter } from "../errors/domain-exception.filter";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require("cookie-parser");

export const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

export const E2E_ACTOR = {
  userId: "00000000-0000-0000-0000-000000000001",
  globalUserId: "00000000-0000-0000-0000-000000000001",
  email: "doc@beyu.health",
  role: "doctor",
  permissions: [
    "patient:read",
    "patient:register",
    "phi:read",
    "phi:write",
    "rx:write",
    "rx:dispense",
    "rx:controlled",
    "order:lab",
    "order:imaging",
    "note:write",
    "note:sign",
    "appointment:read",
    "appointment:book",
    "appointment:transition",
    "encounter:start",
    "encounter:complete",
    "billing:read",
    "billing:write",
    "payment:receive",
    "inventory:read",
    "inventory:write",
    "audit:read",
    "report:read",
    "report:submit",
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

export async function buildE2EHarness(
  _overrides: Record<string, any> = {},
): Promise<E2EHarness> {
  // Seed minimal env vars required for JWT signing/verification in-process.
  process.env.JWT_SECRET =
    process.env.JWT_SECRET ?? "e2e-jwt-secret-do-not-use";
  process.env.JWT_ISSUER = process.env.JWT_ISSUER ?? "https://beyu.health/e2e";
  process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "beyu-health-os";
  process.env.REFRESH_TOKEN_SECRET =
    process.env.REFRESH_TOKEN_SECRET ?? "e2e-refresh-secret-do-not-use";
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "pglite://e2e";
  process.env.CSRF_SECRET =
    process.env.CSRF_SECRET ?? "e2e-csrf-secret-do-not-use";
  // Allow HTTP E2E harness to bypass live HCM verification (no practitioner
  // records are seeded in the PGlite database). Production deployments MUST
  // set BEYU_HCM_ENDPOINT and leave this flag unset — the adapter ignores
  // it whenever a real endpoint is configured, boot validation refuses it
  // under NODE_ENV=production, and the harness itself never sets it when
  // NODE_ENV is production.
  if (process.env.NODE_ENV !== "production") {
    process.env.BEYU_HCM_BYPASS_FOR_TEST = "true";
    // Identity test harness: registrations link to SYNTHETIC canonical
    // references through the REAL bridge machinery (link-once, conflict
    // detection, acting gate). Production refuses this flag at boot AND
    // structurally in IdentityFederationService.mode().
    process.env.BEYU_IDENTITY_TEST_HARNESS = "true";
  }
  const db = new PGlite();
  const conn = new PGliteConnection(db);
  const migs = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();
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
       ON CONFLICT DO NOTHING;
     INSERT INTO beyu_identity.beyu_identity_links (global_user_id, beyu_user_id, linked_by)
       VALUES ('${E2E_ACTOR.userId}','BEYU-TEST-${E2E_ACTOR.userId}','e2e-harness')
       ON CONFLICT (global_user_id) DO NOTHING;`,
  );

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(DB_CONNECTION)
    .useValue(conn)
    .compile();

  const app = moduleFixture.createNestApplication();
  app.use(cookieParser());
  // Match production main.ts: normalize DomainError to its mapped HTTP status
  // (e.g. NOT_FOUND→404, INVALID_STATE→409) instead of a bare 500. Opt-in only
  // because the pre-existing E2E scenarios assert the raw (unfiltered) Nest
  // error shape; scenarios that assert normalized domain codes should pass
  // { normalizeDomainErrors: true }.
  if (_overrides.normalizeDomainErrors) {
    app.useGlobalFilters(new DomainExceptionFilter());
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  const tenantCtx = app.get<TenantContext>(TenantContext);

  function runInActorContext<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((res, rej) => {
      requestStorage.run(
        {
          correlationId: "e2e-cid",
          requestId: "e2e-rid",
          startedAt: Date.now(),
          method: "E2E",
          path: "/",
          ip: "127.0.0.1",
        },
        () => tenantCtx.run(E2E_ACTOR as never, () => fn().then(res, rej)),
      );
    });
  }

  return {
    app,
    db,
    conn,
    tenantCtx,
    async close() {
      await app.close();
      await db.close();
    },
    runInActorContext,
  };
}
