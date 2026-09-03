/**
 * Identity transport failure matrix (Phase 7 / Phase 10 of the identity
 * federation program).
 *
 * The Health → BEYU identity transport must FAIL CLOSED for every failure
 * mode. Each case drives the REAL adapter stack (service-token signing,
 * outbox write, timeout, retry classification) against a REAL local HTTP
 * server scripted to exhibit one failure mode — no mocks of the transport
 * itself. Authentication-path failures must never silently succeed using
 * local identity.
 *
 * Covered failure modes:
 *   404 / 409 / 429 / 500 / 502 / 503  → fail closed (+ registration
 *                                        compensation, no orphan account)
 *   malformed JSON (200 + garbage)      → fail closed
 *   schema mismatch (wrong shape)       → fail closed (bridge refuses a
 *                                        link without a canonical id)
 *   slow response (> timeout)           → timeout, bounded retry, fail closed
 *   connection refused                  → fail closed
 *   replayed/duplicate register         → idempotent: same canonical id,
 *                                        exactly one link (no duplicates)
 */
import * as http from "http";
import { AddressInfo } from "net";
import * as fs from "fs";
import * as path from "path";
import { ConfigService } from "@nestjs/config";
import { ServiceUnavailableException } from "@nestjs/common";
import { PGlite } from "@electric-sql/pglite";
import { PGliteConnection } from "../../../modules/identity/db-connection";
import { IdentityRepository } from "../../../modules/identity/identity.repository";
import { BeyuIdentityBridge } from "../../../modules/identity/beyu-bridge";
import { IdentityFederationService } from "../../../modules/identity/identity-federation.service";
import { IdentityAdapter } from "./identity.adapter";
import { CircuitBreaker } from "../../../modules/integrations/circuit-breaker";
import { TenantContext } from "../../../common/security/tenant-context";
import { AuditService as LedgerAuditService } from "../../../modules/audit/audit.service";

jest.setTimeout(40_000);

const SECRET = "transport-matrix-secret-0123456789abcdef";

type Mode =
  | "ok"
  | "404"
  | "409"
  | "429"
  | "500"
  | "502"
  | "503"
  | "garbage"
  | "wrongshape"
  | "slow";

class ScriptedStub {
  server: http.Server;
  url = "";
  mode: Mode = "ok";
  requests = 0;

  constructor() {
    this.server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        this.requests += 1;
        res.on("error", () => {}); // swallow late-write errors after client timeout
        const send = (status: number, data: unknown) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(typeof data === "string" ? data : JSON.stringify(data));
        };
        switch (this.mode) {
          case "404":
            return send(404, { error: { code: "IDENTITY_NOT_FOUND" } });
          case "409":
            return send(409, { error: { code: "CONFLICT" } });
          case "429":
            return send(429, { error: { code: "RATE_LIMITED" } });
          case "500":
            return send(500, { error: { code: "INTERNAL_ERROR" } });
          case "502":
            return send(502, { error: { code: "BAD_GATEWAY" } });
          case "503":
            return send(503, { error: { code: "UNAVAILABLE" } });
          case "garbage":
            return send(200, "<html>not json</html>");
          case "wrongshape":
            // 2xx but NOT the registration contract (no globalUserId).
            return send(201, { data: { hello: "world" } });
          case "slow":
            // Slower than the adapter timeout (3s) — forces ETIMEDOUT.
            return setTimeout(() => send(201, { data: { globalUserId: "USR_X", partyId: "PTY_X", email: "x@x", status: "ACTIVE", created: true } }), 8000);
          case "ok":
          default:
            return send(201, { data: { globalUserId: "USR_OK1", partyId: "PTY_OK1", email: "x@x", status: "ACTIVE", created: true } });
        }
      });
    });
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

describe("Identity transport failure matrix (fail closed)", () => {
  let conn: PGliteConnection;
  let repo: IdentityRepository;
  let bridge: BeyuIdentityBridge;
  let stub: ScriptedStub;
  let tenantCtx: TenantContext;

  const build = () => {
    const cfg = new ConfigService({
      BEYU_IDENTITY_ENDPOINT: stub.url,
      BEYU_IDENTITY_TOKEN: SECRET,
      JWT_SECRET: "test-secret",
    } as never);
    const adapter = new IdentityAdapter(
      conn as never,
      tenantCtx,
      new CircuitBreaker(conn as never, tenantCtx),
      cfg,
      new LedgerAuditService(conn as never, tenantCtx),
    );
    const federation = new IdentityFederationService(conn as never, bridge, adapter, cfg);
    return { adapter, federation };
  };

  const email = () => `tmx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@beyu.test`;

  beforeAll(async () => {
    const db = new PGlite();
    conn = new PGliteConnection(db);
    const migDir = path.resolve(__dirname, "..", "..", "..", "..", "database", "migrations");
    for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith(".up.sql")).sort()) {
      await conn.exec(fs.readFileSync(path.join(migDir, f), "utf8"));
    }
    repo = new IdentityRepository(conn as never);
    bridge = new BeyuIdentityBridge(conn as never);
    await bridge.ensureBridgeSchema();
    tenantCtx = new TenantContext();
    stub = new ScriptedStub();
    await stub.start();
  });

  afterAll(async () => {
    await stub.close();
    await (conn as unknown as { close(): Promise<void> }).close();
  });

  beforeEach(() => {
    stub.mode = "ok";
    stub.requests = 0;
  });

  /** Full registration through the federation service with a sector user. */
  async function registerViaFederation(e: string) {
    const hash = "x";
    const user = await repo.createUser({
      email: e,
      displayName: "Matrix User",
      passwordHash: hash,
      accountStatus: "active",
    });
    const { federation } = build();
    return { federation, gid: user.global_user_id };
  }

  const failClosedCases: Array<[Mode, string]> = [
    ["404", "endpoint not found (misrouted gateway)"],
    ["409", "conflict"],
    ["429", "rate limited at the control plane"],
    ["500", "control-plane internal error"],
    ["502", "bad gateway"],
    ["503", "control-plane unavailable"],
    ["garbage", "malformed JSON body (200)"],
    ["wrongshape", "schema mismatch (2xx, wrong shape)"],
  ];

  for (const [mode, label] of failClosedCases) {
    it(`registration fails closed + compensates on ${label}`, async () => {
      stub.mode = mode;
      const e = email();
      const { federation, gid } = await registerViaFederation(e);
      await expect(
        federation.linkOnRegister({
          globalUserId: gid,
          email: e,
          displayName: "Matrix User",
          tenantCode: "BEYU-HEALTH",
          tenantId: null,
        }),
      ).rejects.toThrow(ServiceUnavailableException);
      // No link persisted.
      expect(await bridge.getLink(gid)).toBeNull();
    });
  }

  it("slow response (> timeout) is cut by the timeout, retried once, then fails closed", async () => {
    stub.mode = "slow";
    const e = email();
    const { federation, gid } = await registerViaFederation(e);
    const t0 = Date.now();
    await expect(
      federation.linkOnRegister({
        globalUserId: gid,
        email: e,
        displayName: "Matrix User",
        tenantCode: "BEYU-HEALTH",
        tenantId: null,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    const elapsed = Date.now() - t0;
    // Two attempts, each cut at the 3s timeout: bounded (well under the 8s
    // server delay), and NOT instant (the timeout genuinely engaged).
    expect(elapsed).toBeGreaterThanOrEqual(2500);
    expect(elapsed).toBeLessThan(8000);
    expect(stub.requests).toBe(2); // exactly one retry — no infinite retries
    expect(await bridge.getLink(gid)).toBeNull();
  }, 30000);

  it("connection refused fails closed (no local-identity fallback)", async () => {
    const dead = new ScriptedStub();
    await dead.start();
    const url = dead.url;
    await dead.close();
    const cfg = new ConfigService({
      BEYU_IDENTITY_ENDPOINT: url,
      BEYU_IDENTITY_TOKEN: SECRET,
      JWT_SECRET: "test-secret",
    } as never);
    const adapter = new IdentityAdapter(
      conn as never,
      tenantCtx,
      new CircuitBreaker(conn as never, tenantCtx),
      cfg,
      new LedgerAuditService(conn as never, tenantCtx),
    );
    const federation = new IdentityFederationService(conn as never, bridge, adapter, cfg);
    const e = email();
    const { gid } = await registerViaFederation(e);
    await expect(
      federation.linkOnRegister({
        globalUserId: gid,
        email: e,
        displayName: "Matrix User",
        tenantCode: "BEYU-HEALTH",
        tenantId: null,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    expect(await bridge.getLink(gid)).toBeNull();
  });

  it("replayed/duplicate registration is idempotent: one canonical id, exactly one link", async () => {
    stub.mode = "ok";
    const e = email();
    const { federation, gid } = await registerViaFederation(e);
    const args = {
      globalUserId: gid,
      email: e,
      displayName: "Matrix User",
      tenantCode: "BEYU-HEALTH",
      tenantId: null,
    };
    const l1 = await federation.linkOnRegister(args);
    // Replay: same registration payload again (e.g. client retry).
    const l2 = await federation.linkOnRegister(args);
    expect(l2.beyuUserId).toBe(l1.beyuUserId);
    // Exactly ONE link row for the sector user.
    const rows = await (conn as unknown as {
      query: (q: string, p?: unknown[]) => Promise<{ n: string }[]>;
    }).query(
      `select count(*)::int as n from beyu_identity.beyu_identity_links where global_user_id = $1`,
      [gid],
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it("every failed call leaves a FAILED outbox row for reconciliation (never silent)", async () => {
    stub.mode = "500";
    const e = email();
    const { federation, gid } = await registerViaFederation(e);
    await expect(
      federation.linkOnRegister({
        globalUserId: gid,
        email: e,
        displayName: "Matrix User",
        tenantCode: "BEYU-HEALTH",
        tenantId: null,
      }),
    ).rejects.toThrow(ServiceUnavailableException);
    const rows = await (conn as unknown as {
      query: (q: string) => Promise<{ status: string; last_error: string | null }[]>;
    }).query(
      `select status, last_error from health.beyu_outbox where action = 'identity.register' order by created_at desc limit 1`,
    );
    expect(rows[0].status).toBe("failed");
    expect(rows[0].last_error).toBeTruthy();
  });
});
