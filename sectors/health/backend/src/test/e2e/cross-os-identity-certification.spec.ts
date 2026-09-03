/**
 * CROSS-OS IDENTITY CERTIFICATION (Phase 18)
 * ===========================================
 *
 * The ONLY test in the Health OS suite that boots BOTH operating systems:
 *
 *   * the REAL BEYU OS root control plane (Next.js server, real PostgreSQL
 *     `beyu_os` database, RLS-guarded audit ledger, internal service-token
 *     authentication) — provided by the environment, never mocked; and
 *   * the REAL Health OS backend (full Nest AppModule, real PostgreSQL
 *     scratch database via TEST_DATABASE_URL, migrations 001–021 applied,
 *     LIVE identity federation mode — no test-harness flag).
 *
 * Everything crosses a real HTTP boundary. The scenarios certify, end to
 * end across both OSes:
 *
 *   A. registration provisions a CANONICAL identity at the root OS
 *      (rows asserted directly in the root database) and links it to the
 *      sector account (row asserted in the sector database);
 *   B. the register response never leaks canonical identifiers;
 *   C. login works through LIVE federation; the sector JWT subject is the
 *      SECTOR user id (the root never mints sector tokens);
 *   D. /auth/me passes request-path canonical revalidation (cache-miss and
 *      TTL cache-hit paths);
 *   E. sector RBAC holds on the real stack (patient may read, may NOT write);
 *   F. a cross-OS SERVICE token cannot impersonate a human Bearer;
 *   G. the suspended migration-021 service principal cannot log in;
 *   H. canonical revocation propagates to the sector within the status TTL
 *      (still allowed inside the TTL, denied after it — and re-login denied
 *      by the fresh auth-moment lookup);
 *   I. sector security_version bump rejects the stale token IMMEDIATELY;
 *   J. the root's immutable audit ledger recorded the service calls
 *      (register + lookups, actor SERVICE, written through the RLS context);
 *   K. restore → re-login → access resumes (no sticky denial).
 *
 * Environment contract (all three REQUIRED — the suite SKIPS with an
 * explicit message when ANY is absent, and FAILS when partially provided):
 *
 *   BEYU_OS_BASE_URL             root control plane, e.g. http://127.0.0.1:3100
 *   BEYU_INTERNAL_SERVICE_TOKEN  shared HS256 secret both OSes verify
 *   TEST_DATABASE_URL            PostgreSQL the scratch sector DB is created in
 *
 * Optional: BEYU_OS_ADMIN_DATABASE_URL (defaults to the same server with
 * database `beyu_os`) — the certification uses it as the BEYU operator's
 * privileged connection to assert canonical rows and to revoke/restore.
 */
import "reflect-metadata";
import * as fs from "fs";
import * as path from "path";
import { AddressInfo } from "net";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Client } from "pg";
import { AppModule } from "../../app.module";
import { DB_CONNECTION } from "../../modules/identity/db-connection";
import { createTestDbConnection } from "../../modules/identity/test-connection";
import { signServiceToken } from "../../integrations/beyu/shared/service-token";

const MIG_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "database",
  "migrations",
);

const ROOT_URL = process.env.BEYU_OS_BASE_URL ?? "";
const SERVICE_SECRET = process.env.BEYU_INTERNAL_SERVICE_TOKEN ?? "";
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? "";

function deriveRootDbUrl(): string {
  if (process.env.BEYU_OS_ADMIN_DATABASE_URL) {
    return process.env.BEYU_OS_ADMIN_DATABASE_URL;
  }
  // Same PostgreSQL server, root OS database.
  const u = new URL(TEST_DATABASE_URL);
  u.pathname = "/beyu_os";
  return u.toString();
}

const ENV_COMPLETE = Boolean(ROOT_URL && SERVICE_SECRET && TEST_DATABASE_URL);
const ENV_PARTIAL =
  !ENV_COMPLETE && Boolean(ROOT_URL || SERVICE_SECRET || TEST_DATABASE_URL);

// When the environment is only PARTIALLY provided we must not silently
// skip: someone asked for the certification but the wiring is broken.
if (ENV_PARTIAL) {
  throw new Error(
    "Cross-OS certification environment is PARTIALLY configured: " +
      "BEYU_OS_BASE_URL, BEYU_INTERNAL_SERVICE_TOKEN and TEST_DATABASE_URL " +
      "must be provided TOGETHER (or all left unset to skip).",
  );
}

const describeOrSkip = ENV_COMPLETE ? describe : describe.skip;

/** A unique canonical email per run — the root DB accumulates history. */
const CERT_EMAIL = `cert-${Date.now()}-${process.pid}@beyu-cert.test`;
const CERT_PASSWORD = "Cert!Passw0rd-Î";
const CERT_TENANT_CODE = "CERT";
const CERT_TENANT_ID = "99999999-9999-9999-9999-99999999999c";

// Revalidation window for this suite (env is read by the service under test).
const STATUS_TTL_MS = 1000;

interface HttpResult {
  status: number;
  body: any;
}

describeOrSkip(
  "Cross-OS identity certification (real BEYU OS + real Health OS)",
  () => {
    let app: INestApplication;
    let sectorConn: Awaited<ReturnType<typeof createTestDbConnection>>;
    let rootDb: Client;
    let baseUrl: string;
    let sectorUserId: string;
    let canonicalId: string;
    let accessToken: string;
    let staleToken: string;

    // ── Boot both operating systems ────────────────────────────────────────
    beforeAll(async () => {
      // LIVE federation mode: real control plane, NO harness bypasses.
      process.env.NODE_ENV = "test";
      process.env.JWT_SECRET = process.env.JWT_SECRET ?? "cert-jwt-secret";
      process.env.JWT_ISSUER =
        process.env.JWT_ISSUER ?? "https://beyu.health/cert";
      process.env.JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? "beyu-health-os";
      process.env.REFRESH_TOKEN_SECRET =
        process.env.REFRESH_TOKEN_SECRET ?? "cert-refresh-secret";
      process.env.CSRF_SECRET = process.env.CSRF_SECRET ?? "cert-csrf-secret";
      process.env.BEYU_IDENTITY_ENDPOINT = ROOT_URL;
      process.env.BEYU_IDENTITY_TOKEN = SERVICE_SECRET;
      process.env.BEYU_IDENTITY_STATUS_TTL_MS = String(STATUS_TTL_MS);
      process.env.BEYU_IDENTITY_STATUS_MAX_STALE_MS = "5000";
      delete process.env.BEYU_IDENTITY_TEST_HARNESS;
      delete process.env.BEYU_HCM_BYPASS_FOR_TEST;

      // Sector OS: fresh scratch PostgreSQL + all migrations (001–021).
      sectorConn = await createTestDbConnection();
      const migs = fs
        .readdirSync(MIG_DIR)
        .filter((f) => f.endsWith(".up.sql"))
        .sort();
      for (const f of migs) {
        await sectorConn.exec(fs.readFileSync(path.join(MIG_DIR, f), "utf8"));
      }
      await sectorConn.exec(
        `INSERT INTO beyu_identity.tenants (tenant_id, tenant_code, name, country_code, entity_code)
         VALUES ('${CERT_TENANT_ID}','${CERT_TENANT_CODE}','Cert Tenant','TZ','CERT-1')
         ON CONFLICT DO NOTHING;`,
      );

      // Full Nest stack over the scratch DB.
      const moduleFixture = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(DB_CONNECTION)
        .useValue(sectorConn)
        .compile();
      app = moduleFixture.createNestApplication();
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      app.use(require("cookie-parser")());
      await app.listen(0, "127.0.0.1");
      const addr = app.getHttpServer().address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;

      // Root OS operator connection (privileged).
      rootDb = new Client({ connectionString: deriveRootDbUrl() });
      await rootDb.connect();

      // Precondition: the control plane must actually be alive.
      const probe = await call("POST", "/auth/login", {
        body: { email: CERT_EMAIL, password: "x" },
      });
      expect([401, 400]).toContain(probe.status);
    }, 120_000);

    afterAll(async () => {
      if (app) await app.close();
      if (sectorConn) await sectorConn.close(); // drops the scratch database
      if (rootDb) await rootDb.end();
    });

    function call(
      method: string,
      urlPath: string,
      opts: { token?: string; body?: unknown } = {},
    ): Promise<HttpResult> {
      return fetch(`${baseUrl}${urlPath}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      }).then(async (r) => {
        let body: any = null;
        try {
          body = await r.json();
        } catch {
          body = null;
        }
        return { status: r.status, body };
      });
    }

    function decodeJwt(token: string): Record<string, unknown> {
      const payload = token.split(".")[1];
      return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    }

    // ── A + B: canonical provisioning on registration ──────────────────────
    it("A: registration provisions a canonical identity at the root OS and links the sector account", async () => {
      const res = await call("POST", "/auth/register", {
        body: {
          email: CERT_EMAIL,
          password: CERT_PASSWORD,
          full_name: "Cross OS Cert",
          tenantCode: CERT_TENANT_CODE,
        },
      });
      expect(res.status).toBe(201);
      sectorUserId = res.body.user.globalUserId as string;

      // Sector-side link row exists and points at the root canonical id.
      const links = await sectorConn.query<{
        beyu_user_id: string;
      }>(
        `SELECT beyu_user_id FROM beyu_identity.beyu_identity_links
          WHERE global_user_id = $1`,
        [sectorUserId],
      );
      expect(links).toHaveLength(1);
      canonicalId = links[0].beyu_user_id;

      // Root-side canonical rows (asserted directly in the root database).
      const canon = await rootDb.query<{
        id: string;
        email: string;
        status: string;
        is_service_account: boolean;
        party_status: string;
        tenant_code: string;
      }>(
        `SELECT u.id, u.email, u.status, u.is_service_account,
                p.status AS party_status, t.code AS tenant_code
           FROM users u
           JOIN parties p ON p.id = u.party_id
           JOIN tenants t ON t.id = u.primary_tenant_id
          WHERE u.email = $1`,
        [CERT_EMAIL],
      );
      expect(canon.rows).toHaveLength(1);
      expect(canon.rows[0].id).toBe(canonicalId);
      expect(canon.rows[0].status).toBe("ACTIVE");
      expect(canon.rows[0].party_status).toBe("ACTIVE");
      expect(canon.rows[0].is_service_account).toBe(false);
      // Canonical provisioning always targets the canonical sector tenant —
      // the SECTOR tenant code (CERT) must never leak into the root.
      expect(canon.rows[0].tenant_code).toBe("BEYU-HEALTH");

      // B: no canonical identifier in the register response.
      const flat = JSON.stringify(res.body);
      expect(flat).not.toContain(canonicalId);
      expect(flat).not.toContain("beyuUserId");
    });

    // ── C + D: login, JWT subject, request-path revalidation ───────────────
    it("C: login succeeds through LIVE federation; the JWT subject is the SECTOR user", async () => {
      const res = await call("POST", "/auth/login", {
        body: {
          email: CERT_EMAIL,
          password: CERT_PASSWORD,
          tenantCode: CERT_TENANT_CODE,
        },
      });
      expect(res.status).toBe(200);
      accessToken = res.body.accessToken as string;
      expect(res.body.user.globalUserId).toBe(sectorUserId);

      const claims = decodeJwt(accessToken);
      expect(claims.sub).toBe(sectorUserId);
      expect(claims.sub).not.toBe(canonicalId);
      expect(claims.role).toBe("patient");
      expect(claims.tenantId).toBe(CERT_TENANT_ID);
    });

    it("D: /auth/me passes request-path canonical revalidation (cache miss AND TTL cache hit)", async () => {
      // Cache miss → real remote lookup over HTTP.
      const first = await call("GET", "/auth/me", { token: accessToken });
      expect(first.status).toBe(200);
      // Immediately again → served within the TTL (cache hit path).
      const second = await call("GET", "/auth/me", { token: accessToken });
      expect(second.status).toBe(200);
      expect(second.body.email).toBe(CERT_EMAIL);
    });

    // ── E: sector RBAC on the real stack ───────────────────────────────────
    it("E: patient role may read patients but may NOT register them", async () => {
      const read = await call("GET", "/api/patients", { token: accessToken });
      expect(read.status).toBe(200);

      const write = await call("POST", "/api/patients", {
        token: accessToken,
        body: {
          full_name: "Should Not Pass",
          date_of_birth: "1990-01-01",
          sex: "F",
        },
      });
      expect(write.status).toBe(403);
    });

    // ── F + G: service-principal isolation ─────────────────────────────────
    it("F: a cross-OS SERVICE token cannot impersonate a human Bearer", async () => {
      const serviceToken = signServiceToken(SERVICE_SECRET);
      const res = await call("GET", "/auth/me", { token: serviceToken });
      expect(res.status).toBe(401);
    });

    it("G: the suspended migration-021 service principal cannot log in interactively", async () => {
      const res = await call("POST", "/auth/login", {
        body: {
          email: "service@health-os.internal",
          password: "anything-at-all",
          tenantCode: "HEALTH-OS-SERVICE",
        },
      });
      expect(res.status).toBe(401);
    });

    // ── H: canonical revocation propagation ────────────────────────────────
    it("H: canonical revocation propagates within the status TTL (allowed inside, denied after)", async () => {
      // Operator revokes at the ROOT OS.
      await rootDb.query(
        `UPDATE users SET status = 'SUSPENDED' WHERE id = $1`,
        [canonicalId],
      );

      // Inside the TTL the cached ACTIVE status still passes — this is the
      // documented bounded window, not a bug.
      const inside = await call("GET", "/auth/me", { token: accessToken });
      expect(inside.status).toBe(200);

      // After the TTL the remote revalidation sees SUSPENDED → 401.
      await new Promise((r) => setTimeout(r, STATUS_TTL_MS + 250));
      const after = await call("GET", "/auth/me", { token: accessToken });
      expect(after.status).toBe(401);

      // A fresh authentication is denied IMMEDIATELY (auth-moment lookup is
      // never cached).
      const relogin = await call("POST", "/auth/login", {
        body: {
          email: CERT_EMAIL,
          password: CERT_PASSWORD,
          tenantCode: CERT_TENANT_CODE,
        },
      });
      expect(relogin.status).toBe(401);
    });

    // ── K(1): restore ──────────────────────────────────────────────────────
    it("K: restore → re-login → access resumes (no sticky denial)", async () => {
      await rootDb.query(`UPDATE users SET status = 'ACTIVE' WHERE id = $1`, [
        canonicalId,
      ]);
      const res = await call("POST", "/auth/login", {
        body: {
          email: CERT_EMAIL,
          password: CERT_PASSWORD,
          tenantCode: CERT_TENANT_CODE,
        },
      });
      expect(res.status).toBe(200);
      accessToken = res.body.accessToken as string;

      // The successful auth-moment lookup primes the status cache
      // (write-through) — the very next request must pass without racing
      // the TTL.
      const me = await call("GET", "/auth/me", { token: accessToken });
      expect(me.status).toBe(200);
    });

    // ── I: sector security_version bump (instant propagation) ──────────────
    it("I: a sector security_version bump rejects the stale token IMMEDIATELY", async () => {
      staleToken = accessToken;
      await sectorConn.exec(
        `UPDATE beyu_identity.users
          SET security_version = security_version + 1
        WHERE global_user_id = '${sectorUserId}'`,
      );
      const res = await call("GET", "/auth/me", { token: staleToken });
      expect(res.status).toBe(401);

      // Re-login after the bump mints a token with the new version.
      const fresh = await call("POST", "/auth/login", {
        body: {
          email: CERT_EMAIL,
          password: CERT_PASSWORD,
          tenantCode: CERT_TENANT_CODE,
        },
      });
      expect(fresh.status).toBe(200);
      expect(fresh.body.accessToken).not.toBe(staleToken);
      accessToken = fresh.body.accessToken as string;
      const me = await call("GET", "/auth/me", { token: accessToken });
      expect(me.status).toBe(200);
    });

    // ── J: the root OS audit ledger recorded the service calls ─────────────
    it("J: the root's immutable audit ledger recorded the cross-OS service calls", async () => {
      const audit = await rootDb.query<{
        action: string;
        outcome: string;
        actor_type: string;
        prev_hash: string;
        hash: string;
      }>(
        `SELECT action, outcome, actor_type, prev_hash, hash
         FROM audit_log
        WHERE object_id = $1
        ORDER BY sequence`,
        [canonicalId],
      );
      const actions = audit.rows.map((r) => `${r.action}:${r.outcome}`);
      expect(audit.rows.length).toBeGreaterThanOrEqual(2);
      expect(actions).toContain("internal.identity.register:SUCCESS");
      expect(actions).toContain("internal.identity.lookup:SUCCESS");
      // Service actor, never a human session.
      expect(audit.rows.every((r) => r.actor_type === "SERVICE")).toBe(true);
      // Hash chain present on every row (written through the RLS context —
      // a runtime-role insert outside a tenant context is structurally
      // rejected by row-level security).
      expect(audit.rows.every((r) => r.hash && r.prev_hash)).toBe(true);
    });
  },
);
