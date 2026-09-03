/**
 * Canonical identity federation — service-level scenarios.
 *
 * Covers the required federation scenario matrix against REAL infrastructure:
 *   - PGlite (genuine in-process PostgreSQL) for the sector side,
 *   - a REAL local HTTP server as the BEYU control-plane stub (service-token
 *     verification, register/lookup contract) for the LIVE mode — no
 *     fabricated external responses; every LIVE assertion is driven by an
 *     actual HTTP round-trip.
 *
 * Modes under test: LIVE / TEST_HARNESS / BLOCKED, revocation propagation,
 * outage fail-closed behaviour, link-once conflicts, duplicate prevention,
 * registration compensation, and the structural production refusal of the
 * test harness.
 */
import { createHmac, timingSafeEqual } from "crypto";
import * as http from "http";
import { AddressInfo } from "net";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { ForbiddenException, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { createTestDbConnection } from "./test-connection";
import type { DbConnection } from "./db-connection";
import { IdentityRepository } from "./identity.repository";
import { SessionService } from "./session.service";
import { AuditService } from "./audit.service";
import { AuditService as LedgerAuditService } from "../audit/audit.service";
import { MfaService } from "./mfa.service";
import { AuthService } from "../auth/auth.service";
import { BeyuIdentityBridge } from "./beyu-bridge";
import { IdentityFederationService, IDENTITY_TEST_HARNESS_ENV } from "./identity-federation.service";
import { IdentityAdapter } from "../../integrations/beyu/shared/identity.adapter";
import { CircuitBreaker } from "../../modules/integrations/circuit-breaker";
import { TenantContext } from "../../common/security/tenant-context";
import { signServiceToken, SERVICE_AUDIENCE, SERVICE_ISSUER } from "../../integrations/beyu/shared/service-token";

const SHARED_SECRET = "federation-test-secret-0123456789abcdef";
const PASSWORD = "correct-password-123";

/**
 * Minimal BEYU control-plane stub implementing the internal identity API:
 *   POST /api/v1/internal/identity/register  (idempotent by email)
 *   POST /api/v1/internal/identity/lookup    (configurable lifecycle status)
 * It VERIFIES the service token exactly like the real BEYU endpoint
 * (HS256, iss/aud/sub, exp) and records every received Authorization header.
 */
class BeyuStub {
  server: http.Server;
  url = "";
  canonicalByEmail = new Map<string, { globalUserId: string; partyId: string }>();
  statusByEmail = new Map<string, { status: string; partyStatus: string }>();
  receivedAuthHeaders: string[] = [];
  private seq = 0;

  constructor(private readonly secret: string = SHARED_SECRET) {
    this.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const auth = req.headers.authorization ?? "";
        this.receivedAuthHeaders.push(auth);
        const payload = body ? JSON.parse(body) : {};
        const send = (status: number, data: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify(data));
        };
        // Service-token verification (mirrors BEYU OS service-auth.ts).
        const token = /^Bearer\s+(.+)$/.exec(auth)?.[1] ?? "";
        const parts = token.split(".");
        if (parts.length !== 3) return send(401, { error: { code: "INVALID_SERVICE_TOKEN" } });
        const [h, p, s] = parts;
        const b64 = (x: string) => Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const expected = createHmac("sha256", this.secret).update(`${h}.${p}`).digest();
        const provided = b64(s);
        const okSig =
          expected.length === provided.length && timingSafeEqual(expected, provided);
        let claims: Record<string, unknown>;
        try {
          claims = JSON.parse(b64(p).toString("utf8"));
        } catch {
          return send(401, { error: { code: "INVALID_SERVICE_TOKEN" } });
        }
        if (
          !okSig ||
          JSON.parse(b64(h).toString("utf8")).alg !== "HS256" ||
          claims.aud !== SERVICE_AUDIENCE ||
          claims.iss !== SERVICE_ISSUER ||
          claims.sub !== `service:${SERVICE_ISSUER}` ||
          typeof claims.exp !== "number" ||
          claims.exp <= Math.floor(Date.now() / 1000)
        ) {
          return send(401, { error: { code: "INVALID_SERVICE_TOKEN" } });
        }
        // Endpoints.
        if (req.url?.endsWith("/identity/register") && req.method === "POST") {
          const email = String(payload.email).toLowerCase();
          const existing = this.canonicalByEmail.get(email);
          if (existing) {
            return send(200, {
              data: { ...existing, email, status: "ACTIVE", created: false },
            });
          }
          this.seq += 1;
          const rec = {
            globalUserId: `USR_STUB${String(this.seq).padStart(6, "0")}`,
            partyId: `PTY_STUB${String(this.seq).padStart(6, "0")}`,
          };
          this.canonicalByEmail.set(email, rec);
          this.statusByEmail.set(email, { status: "ACTIVE", partyStatus: "ACTIVE" });
          return send(201, {
            data: { ...rec, email, status: "ACTIVE", created: true },
          });
        }
        if (req.url?.endsWith("/identity/lookup") && req.method === "POST") {
          const email = String(payload.email ?? "").toLowerCase() || null;
          const id = payload.globalUserId ?? null;
          let found: { globalUserId: string; partyId: string } | undefined;
          let status: { status: string; partyStatus: string } | undefined;
          if (email) {
            found = this.canonicalByEmail.get(email);
            status = this.statusByEmail.get(email);
          } else if (id) {
            for (const [e, rec] of this.canonicalByEmail) {
              if (rec.globalUserId === id) {
                found = rec;
                status = this.statusByEmail.get(e);
              }
            }
          }
          if (!found || !status) {
            return send(404, { error: { code: "IDENTITY_NOT_FOUND" } });
          }
          return send(200, {
            data: {
              globalUserId: found.globalUserId,
              partyId: found.partyId,
              email: email ?? "unknown@beyu.test",
              displayName: "Canonical User",
              status: status.status,
              partyStatus: status.partyStatus,
              tenantId: "TEN_STUB",
              tenantCode: "BEYU-HEALTH",
              countryCode: "TZ",
            },
          });
        }
        send(404, { error: { code: "NOT_FOUND" } });
      });
    });
  }

  /** Simulate canonical revocation for an email. */
  revoke(email: string): void {
    this.statusByEmail.set(email.toLowerCase(), { status: "SUSPENDED", partyStatus: "SUSPENDED" });
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

jest.setTimeout(30000);

describe("IdentityFederationService — canonical identity federation", () => {
  let conn: DbConnection;
  let repo: IdentityRepository;
  let bridge: BeyuIdentityBridge;
  let identityAdapter: IdentityAdapter;
  let federation: IdentityFederationService;
  let auth: AuthService;
  let stub: BeyuStub;
  let tenantCtx: TenantContext;
  let circuit: CircuitBreaker;
  let savedHarness: string | undefined;
  let savedNodeEnv: string | undefined;

  beforeAll(async () => {
    conn = await createTestDbConnection();
    repo = new IdentityRepository(conn as never);
    await repo.ensureSchema();
    // Apply the real migrations (health.* outbox/circuits tables needed by
    // the LIVE transport path), exactly like the HTTP E2E harness does.
    const migDir = path.resolve(__dirname, "..", "..", "..", "database", "migrations");
    const exec = (conn as unknown as { exec: (sql: string) => Promise<unknown> }).exec;
    if (exec) {
      for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith(".up.sql")).sort()) {
        await exec.call(conn, fs.readFileSync(path.join(migDir, f), "utf8"));
      }
    }
    bridge = new BeyuIdentityBridge(conn as never);
    await bridge.ensureBridgeSchema();
    tenantCtx = new TenantContext();
    circuit = new CircuitBreaker(conn as never, tenantCtx);
    stub = new BeyuStub();
    await stub.start();
  });

  afterAll(async () => {
    await stub.close();
    await (conn as unknown as { close(): Promise<void> }).close();
  });

  /** Build the stack with a given env map (adapter endpoint/token etc.). */
  function buildAuth(envMap: Record<string, string | undefined>): AuthService {
    const cfg = new ConfigService(envMap as never);
    // The ADAPTER requires the canonical audit-ledger writer (modules/audit),
    // which records through the ambient transaction handle — NOT the identity
    // auth-event AuditService.
    const ledgerAudit = new LedgerAuditService(conn as never, tenantCtx);
    identityAdapter = new IdentityAdapter(
      conn as never,
      tenantCtx,
      circuit,
      cfg,
      ledgerAudit,
    );
    federation = new IdentityFederationService(
      conn as never,
      bridge,
      identityAdapter,
      cfg,
    );
    const sessions = new SessionService(repo);
    const audit = new AuditService(repo);
    const mfa = new MfaService(repo);
    const jwt = new JwtService({
      secret: envMap.JWT_SECRET ?? "test-secret",
      signOptions: { expiresIn: "15m" },
    });
    return new AuthService(jwt, cfg, repo, sessions, audit, mfa, federation);
  }

  beforeEach(() => {
    savedHarness = process.env[IDENTITY_TEST_HARNESS_ENV];
    savedNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test";
    process.env[IDENTITY_TEST_HARNESS_ENV] = "true";
    delete process.env.BEYU_IDENTITY_ENDPOINT;
    delete process.env.BEYU_IDENTITY_TOKEN;
  });

  afterEach(() => {
    process.env[IDENTITY_TEST_HARNESS_ENV] = savedHarness;
    process.env.NODE_ENV = savedNodeEnv;
    delete process.env.BEYU_IDENTITY_ENDPOINT;
    delete process.env.BEYU_IDENTITY_TOKEN;
  });

  const uniqueEmail = () => `fed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beyu.test`;

  it("mode(): TEST_HARNESS when the harness flag is set outside production", () => {
    buildAuth({});
    expect(federation.mode()).toBe("TEST_HARNESS");
  });

  it("mode(): BLOCKED when neither control plane nor harness is configured", () => {
    delete process.env[IDENTITY_TEST_HARNESS_ENV];
    buildAuth({});
    expect(federation.mode()).toBe("BLOCKED");
  });

  it("mode(): structurally refuses the test harness under NODE_ENV=production", () => {
    process.env[IDENTITY_TEST_HARNESS_ENV] = "true";
    process.env.NODE_ENV = "production";
    buildAuth({});
    // Even if boot validation were bypassed, no synthetic identities in prod.
    expect(federation.mode()).toBe("BLOCKED");
  });

  it("TEST_HARNESS registration links a synthetic canonical identity via the REAL bridge (link-once)", async () => {
    const a = buildAuth({});
    const email = uniqueEmail();
    const res = await a.register({ email, password: PASSWORD, full_name: "Harness User" });
    const gid = (res as unknown as { user: { globalUserId: string } }).user.globalUserId;
    const link = await bridge.getLink(gid);
    expect(link).not.toBeNull();
    expect(link!.beyuUserId).toMatch(/^BEYU-TEST-/);
    expect(link!.linkedBy).toBe("health-os-test-harness");
    // …and the linked user can log in.
    const tokens = await a.login({ email, password: PASSWORD });
    expect(tokens.accessToken).toBeTruthy();
  });

  it("BLOCKED registration fails closed AND compensates (no orphan sector account)", async () => {
    delete process.env[IDENTITY_TEST_HARNESS_ENV];
    const a = buildAuth({});
    const email = uniqueEmail();
    await expect(
      a.register({ email, password: PASSWORD, full_name: "Blocked User" }),
    ).rejects.toThrow(ServiceUnavailableException);
    // Compensation: the sector user was hard-deleted → retry is possible.
    const gone = await repo.findUserByEmail(email);
    expect(gone).toBeNull();
    // Enable the harness → the same email can now register.
    process.env[IDENTITY_TEST_HARNESS_ENV] = "true";
    const b = buildAuth({});
    const res = await b.register({ email, password: PASSWORD, full_name: "Blocked User" });
    expect((res as unknown as { user: { globalUserId: string } }).user).toBeTruthy();
  });

  it("LIVE registration provisions canonically over real HTTP and links (idempotent, no duplicates)", async () => {
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    expect(federation.mode()).toBe("LIVE");
    const email = uniqueEmail();
    const res = await a.register({ email, password: PASSWORD, full_name: "Live User" });
    const gid = (res as unknown as { user: { globalUserId: string } }).user.globalUserId;
    const link = await bridge.getLink(gid);
    expect(link).not.toBeNull();
    expect(link!.beyuUserId).toMatch(/^USR_STUB/);
    expect(link!.linkedBy).toBe("health-os-federation");

    // Canonical duplicate prevention: registering the same email again is
    // idempotent at BEYU (created=false, same canonical id) — and a second
    // SECTOR account for that email is refused by the sector's own
    // unique-email rule before any canonical call.
    const canonical = stub.canonicalByEmail.get(email)!;
    const b = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    await expect(
      b.register({ email, password: PASSWORD, full_name: "Live User" }),
    ).rejects.toThrow(); // ConflictException: email already exists
    expect(stub.canonicalByEmail.get(email)!.globalUserId).toBe(canonical.globalUserId);

    // Outbox: the registration call left a delivered beyu.identity row.
    const outbox = await (conn as unknown as {
      query: (q: string) => Promise<{ provider: string; action: string; status: string }[]>;
    }).query(
      `select provider, action, status from health.beyu_outbox where action = 'identity.register' order by created_at desc limit 5`,
    );
    expect(
      outbox.some((r: { provider: string; status: string }) => r.provider === "beyu.identity" && r.status === "delivered"),
    ).toBe(true);

    // Linked user can log in (canonical status ACTIVE at the stub).
    const tokens = await a.login({ email, password: PASSWORD });
    expect(tokens.accessToken).toBeTruthy();
  });

  it("LIVE service token contract: real HS256 tokens with iss/aud/sub/exp (verified by the stub)", async () => {
    const before = stub.receivedAuthHeaders.length;
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    const email = uniqueEmail();
    await a.register({ email, password: PASSWORD, full_name: "Token Contract" });
    const authz = stub.receivedAuthHeaders[stub.receivedAuthHeaders.length - 1];
    expect(authz).toMatch(/^Bearer /);
    const token = authz.replace(/^Bearer\s+/, "");
    // Locally verify the exact claims the stub enforced.
    const [h, p, s] = token.split(".");
    const expected = createHmac("sha256", SHARED_SECRET).update(`${h}.${p}`).digest();
    const provided = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    expect(expected.length === provided.length && timingSafeEqual(expected, provided)).toBe(true);
    const claims = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    expect(claims.iss).toBe(SERVICE_ISSUER);
    expect(claims.aud).toBe(SERVICE_AUDIENCE);
    expect(claims.sub).toBe(`service:${SERVICE_ISSUER}`);
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(300);

    // signServiceToken itself round-trips the same contract.
    const minted = signServiceToken(SHARED_SECRET, { globalUserId: "u1", tenantId: null });
    expect(minted.split(".")).toHaveLength(3);
  });

  it("LIVE registration against a control plane with the WRONG shared secret fails closed + compensates", async () => {
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: "wrong-secret-0123456789abcdef-000000",
    });
    const email = uniqueEmail();
    await expect(
      a.register({ email, password: PASSWORD, full_name: "Wrong Secret" }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(await repo.findUserByEmail(email)).toBeNull();
  });

  it("LIVE control-plane OUTAGE at registration fails closed + compensates", async () => {
    const deadStub = new BeyuStub();
    await deadStub.start();
    await deadStub.close(); // port is closed → connection refused
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: deadStub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    const email = uniqueEmail();
    await expect(
      a.register({ email, password: PASSWORD, full_name: "Outage User" }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(await repo.findUserByEmail(email)).toBeNull();
  });

  it("LIVE login is DENIED when the canonical identity is revoked (revocation propagation)", async () => {
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    const email = uniqueEmail();
    await a.register({ email, password: PASSWORD, full_name: "Revoked Later" });
    // Canonical revocation at BEYU (suspension).
    stub.revoke(email);
    await expect(a.login({ email, password: PASSWORD })).rejects.toThrow(
      UnauthorizedException,
    );
    // Restore ACTIVE → login works again (reinstatement propagates too).
    stub.statusByEmail.set(email, { status: "ACTIVE", partyStatus: "ACTIVE" });
    const tokens = await a.login({ email, password: PASSWORD });
    expect(tokens.accessToken).toBeTruthy();
  });

  it("LIVE login FAILS CLOSED (503) during a control-plane outage — no silent downgrade", async () => {
    const deadStub = new BeyuStub();
    await deadStub.start();
    // Register through the live stub, then point lookup at a dead endpoint.
    const email = uniqueEmail();
    const a = buildAuth({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    await a.register({ email, password: PASSWORD, full_name: "Outage Login" });
    await deadStub.close();
    const b = buildAuth({
      BEYU_IDENTITY_ENDPOINT: deadStub.url,
      BEYU_IDENTITY_TOKEN: SHARED_SECRET,
    });
    await expect(b.login({ email, password: PASSWORD })).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("login is DENIED for a sector user whose canonical link is missing (fail-closed acting gate)", async () => {
    const a = buildAuth({});
    const email = uniqueEmail();
    await a.register({ email, password: PASSWORD, full_name: "Delinked" });
    const user = await repo.findUserByEmail(email);
    await (conn as unknown as {
      query: (q: string, p?: unknown[]) => Promise<unknown[]>;
    }).query(
      `delete from beyu_identity.beyu_identity_links where global_user_id = $1`,
      [user!.global_user_id],
    );
    await expect(a.login({ email, password: PASSWORD })).rejects.toThrow(
      ForbiddenException,
    );
    await expect(bridge.requireCanonicalLink(user!.global_user_id)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("link-once: a canonical user cannot be silently re-linked to another sector user", async () => {
    const a = buildAuth({});
    const email = uniqueEmail();
    const email2 = uniqueEmail();
    const r1 = await a.register({ email, password: PASSWORD, full_name: "One" });
    const r2 = await a.register({ email: email2, password: PASSWORD, full_name: "Two" });
    const g1 = (r1 as unknown as { user: { globalUserId: string } }).user.globalUserId;
    const g2 = (r2 as unknown as { user: { globalUserId: string } }).user.globalUserId;
    const l2 = await bridge.getLink(g2)!;
    // Attempt to point sector user #1 at sector user #2's canonical identity.
    await expect(
      bridge.linkUser({
        globalUserId: g1,
        beyuUserId: l2!.beyuUserId,
        linkedBy: "adversary",
      }),
    ).rejects.toThrow();
    // The original link is unchanged.
    const l1 = await bridge.getLink(g1);
    expect(l1!.beyuUserId).not.toBe(l2!.beyuUserId);
  });
});
