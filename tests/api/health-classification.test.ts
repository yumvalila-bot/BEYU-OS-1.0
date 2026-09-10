/**
 * /api/health diagnostic hardening — deterministic classification tests.
 *
 * The production readiness probe must reduce every database failure to a
 * fixed, sanitized classification token and never leak connection detail
 * into the HTTP response or the log drain. These tests drive the REAL route
 * handler (`GET /api/health`) with a mocked pool boundary so each failure
 * class is exercised deterministically, without network access:
 *
 *   1. database healthy            -> 200, database UP, exactly one `select 1`
 *   2. missing DATABASE_URL        -> 503 DATABASE_CONFIG_MISSING
 *   3. malformed connection value  -> 503 DATABASE_CONFIG_MISSING
 *   4. authentication failure      -> 503 DATABASE_AUTH_FAILURE
 *   5. connection timeout          -> 503 DATABASE_CONNECTION_TIMEOUT
 *   6. DNS / refused / TLS / query / unknown -> matching 503 classifications
 *   7. /api/health/live stays 200 with no database configured
 *   8. secrets never appear in the response body
 *   9. secrets never appear in logged output
 *  10. the admin DSN never enters the request path (static import audit)
 *
 * Real-PostgreSQL coverage (genuine `select 1` through a live pool) lives in
 * `tests/api/health-integration.test.ts`, which runs wherever DATABASE_URL is
 * provisioned (CI service container, embedded pg16, production-shaped envs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { connectMock, queryMock, releaseMock } = vi.hoisted(() => ({
  connectMock: vi.fn(),
  queryMock: vi.fn(),
  releaseMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  pool: { connect: connectMock },
}));

import { GET as healthGet } from "@/app/api/health/route";
import { GET as liveGet } from "@/app/api/health/live/route";
import {
  DATABASE_HEALTH_CLASSIFICATIONS,
  buildDatabaseHealthLogEvent,
  classifyConnectionError,
  safeDriverCode,
  type DatabaseHealthClassification,
} from "@/lib/db-health";

const SENTINEL_RUNTIME = "SENTINEL-RUNTIME-NOT-A-SECRET-0001";
const SENTINEL_ADMIN = "SENTINEL-ADMIN-NOT-A-SECRET-0002";
const SENTINEL_AUTH = "SENTINEL-AUTH-NOT-A-SECRET-0003";
const SENTINEL_MFA = "SENTINEL-MFA-NOT-A-SECRET-0004";
const SENTINEL_BOOTSTRAP = "SENTINEL-BOOTSTRAP-NOT-A-SECRET-0005";
const SENTINEL_HOST = "SENTINEL-HOST-0006.invalid";
const SENTINEL_REF = "SENTINELREF0007";
const ALL_SENTINELS = [SENTINEL_RUNTIME, SENTINEL_ADMIN, SENTINEL_AUTH, SENTINEL_MFA, SENTINEL_BOOTSTRAP, SENTINEL_HOST, SENTINEL_REF];

function driverError(message: string, code?: string): Error {
  const e = new Error(message) as Error & { code?: string };
  if (code !== undefined) e.code = code;
  return e;
}

function healthyClient() {
  queryMock.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  releaseMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
let savedEnv: Record<string, string | undefined>;

function loggedText(): string {
  return consoleErrorSpy.mock.calls.map((c) => String(c[0])).join("\n");
}

function expectNoSentinels(text: string): void {
  for (const s of ALL_SENTINELS) expect(text).not.toContain(s);
}

beforeEach(() => {
  savedEnv = {
    DATABASE_URL: process.env.DATABASE_URL,
    BEYU_ADMIN_DATABASE_URL: process.env.BEYU_ADMIN_DATABASE_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    MFA_ENCRYPTION_KEY: process.env.MFA_ENCRYPTION_KEY,
    BEYU_BOOTSTRAP_SECRET: process.env.BEYU_BOOTSTRAP_SECRET,
  };
  connectMock.mockReset();
  queryMock.mockReset().mockResolvedValue({ rows: [{ "?column?": 1 }] });
  releaseMock.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  consoleErrorSpy.mockRestore();
  vi.restoreAllMocks();
});

describe("/api/health classification", () => {
  it("database healthy -> 200 with database UP", async () => {
    healthyClient();
    const res = await healthGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; checks: { database: string } };
    expect(body.ok).toBe(true);
    expect(body.checks.database).toBe("UP");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("probe issues exactly one table-less SELECT 1 and releases the client", async () => {
    healthyClient();
    await healthGet();
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock).toHaveBeenCalledWith("select 1");
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["missing DATABASE_URL", driverError("DATABASE_URL is required"), "DATABASE_CONFIG_MISSING"],
    ["malformed connection value", driverError("Invalid URL", "ERR_INVALID_URL"), "DATABASE_CONFIG_MISSING"],
    ["unknown database name", driverError('database "nosuchdb" does not exist', "3D000"), "DATABASE_CONFIG_MISSING"],
    ["DNS failure", driverError(`getaddrinfo ENOTFOUND ${SENTINEL_HOST}`, "ENOTFOUND"), "DATABASE_DNS_FAILURE"],
    ["connection refused", driverError("connect ECONNREFUSED 10.0.0.1:6543", "ECONNREFUSED"), "DATABASE_CONNECTION_REFUSED"],
    ["bare refused code", driverError("", "ECONNREFUSED"), "DATABASE_CONNECTION_REFUSED"],
    ["connection timeout", driverError("Connection terminated due to connection timeout", "ETIMEDOUT"), "DATABASE_CONNECTION_TIMEOUT"],
    ["TLS failure", driverError("self-signed certificate in certificate chain"), "DATABASE_TLS_FAILURE"],
    [
      "password rejection",
      driverError(`password authentication failed for user "beyu_runtime.${SENTINEL_REF}"`, "28P01"),
      "DATABASE_AUTH_FAILURE",
    ],
    ["pooler unknown user", driverError("Tenant or user not found"), "DATABASE_AUTH_FAILURE"],
    ["unknown role", driverError('role "beyu_runtime" does not exist', "28000"), "DATABASE_AUTH_FAILURE"],
    ["unmodelled failure", driverError("something entirely unmodelled happened"), "DATABASE_UNKNOWN_FAILURE"],
  ] as Array<[string, Error, DatabaseHealthClassification]>)("%s -> 503 %s", async (_label, error, classification) => {
    connectMock.mockRejectedValue(error);
    const res = await healthGet();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { ok: boolean; checks: { database: string }; reason: string };
    expect(body.ok).toBe(false);
    expect(body.checks.database).toBe("DOWN");
    expect(body.reason).toBe(classification);
    expect(DATABASE_HEALTH_CLASSIFICATIONS).toContain(body.reason);
  });

  it("query failure after connect -> 503 DATABASE_QUERY_FAILURE", async () => {
    queryMock.mockRejectedValue(driverError("SENTINEL-QUERY-FAILURE-0008"));
    releaseMock.mockReset();
    connectMock.mockResolvedValue({ query: queryMock, release: releaseMock });
    const res = await healthGet();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toBe("DATABASE_QUERY_FAILURE");
    expect(releaseMock).toHaveBeenCalledTimes(1);
    expectNoSentinels(JSON.stringify(body));
    expect(loggedText()).not.toContain("SENTINEL-QUERY-FAILURE-0008");
  });

  it("failure responses never contain secrets or connection detail", async () => {
    process.env.DATABASE_URL = `postgresql://beyu_runtime:${SENTINEL_RUNTIME}@${SENTINEL_HOST}:6543/postgres?sslmode=require`;
    process.env.BEYU_ADMIN_DATABASE_URL = `postgresql://postgres:${SENTINEL_ADMIN}@db.invalid:5432/postgres`;
    process.env.AUTH_SECRET = SENTINEL_AUTH;
    process.env.MFA_ENCRYPTION_KEY = SENTINEL_MFA;
    process.env.BEYU_BOOTSTRAP_SECRET = SENTINEL_BOOTSTRAP;
    // Worst case: the driver echoes configuration fragments back in its message.
    connectMock.mockRejectedValue(
      driverError(
        `getaddrinfo ENOTFOUND ${SENTINEL_HOST} for user "beyu_runtime.${SENTINEL_REF}" with ${SENTINEL_RUNTIME}`,
        "ENOTFOUND",
      ),
    );
    const res = await healthGet();
    expect(res.status).toBe(503);
    expectNoSentinels(JSON.stringify(await res.json()));
  });

  it("logged diagnostic event carries only the fixed safe field set", async () => {
    process.env.DATABASE_URL = `postgresql://beyu_runtime:${SENTINEL_RUNTIME}@${SENTINEL_HOST}:6543/postgres`;
    process.env.BEYU_ADMIN_DATABASE_URL = `postgresql://postgres:${SENTINEL_ADMIN}@db.invalid:5432/postgres`;
    connectMock.mockRejectedValue(driverError(`getaddrinfo ENOTFOUND ${SENTINEL_HOST}`, "ENOTFOUND"));
    await healthGet();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const raw = String(consoleErrorSpy.mock.calls[0][0]);
    expectNoSentinels(raw);
    const event = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(event).sort()).toEqual(
      ["classification", "code", "elapsedMs", "environment", "event", "timestamp", "traceId"].sort(),
    );
    expect(event.event).toBe("db_health_probe");
    expect(event.classification).toBe("DATABASE_DNS_FAILURE");
    expect(event.code).toBe("ENOTFOUND");
    expect(typeof event.elapsedMs).toBe("number");
    expect(typeof event.environment).toBe("string");
    expect(String(event.traceId)).toMatch(/^EVT_/);
    expect(Number.isNaN(Date.parse(String(event.timestamp)))).toBe(false);
  });

  it("log builder is pure and shape-stable", () => {
    const event = buildDatabaseHealthLogEvent({
      traceId: "EVT_TEST",
      environment: "test",
      classification: "DATABASE_AUTH_FAILURE",
      code: "28P01",
      elapsedMs: 12,
    });
    expect(event).toMatchObject({
      event: "db_health_probe",
      traceId: "EVT_TEST",
      environment: "test",
      classification: "DATABASE_AUTH_FAILURE",
      code: "28P01",
      elapsedMs: 12,
    });
  });
});

describe("classifier edge cases", () => {
  it("SQLSTATE 28xxx always means authentication failure, whatever the message", () => {
    expect(classifyConnectionError(driverError("some odd pooler message", "28P01"))).toBe("DATABASE_AUTH_FAILURE");
  });

  it("HBA rejection maps by TLS hint", () => {
    expect(classifyConnectionError(driverError("no pg_hba.conf entry for host, no encryption"))).toBe("DATABASE_TLS_FAILURE");
    expect(classifyConnectionError(driverError("no pg_hba.conf entry for host"))).toBe("DATABASE_AUTH_FAILURE");
  });

  it("privilege errors mean the connection worked and the statement did not", () => {
    expect(classifyConnectionError(driverError("permission denied for table t", "42501"))).toBe("DATABASE_QUERY_FAILURE");
  });

  it("safeDriverCode passes SQLSTATE and allowlisted errnos, drops everything else", () => {
    expect(safeDriverCode(driverError("x", "28P01"))).toBe("28P01");
    expect(safeDriverCode(driverError("x", "ENOTFOUND"))).toBe("ENOTFOUND");
    expect(safeDriverCode(driverError("x", "SENTINEL-CODE-0009"))).toBeUndefined();
    expect(safeDriverCode(driverError("x"))).toBeUndefined();
    expect(safeDriverCode("plain string")).toBeUndefined();
    expect(safeDriverCode(null)).toBeUndefined();
  });
});

/**
 * TLS classification hardening.
 *
 * Regression cover for the production incident in which `/api/health` reported
 * `DATABASE_TLS_FAILURE` with `"code": null` in the log drain: the one field
 * that identifies the exception was being dropped, and the classification was a
 * bare case-insensitive `/SSL|TLS|certificate/` substring test over the whole
 * driver message — so any error that merely *mentioned* SSL was reported as a
 * certificate failure.
 */
describe("TLS classification is driven by the failure, not by the word SSL", () => {
  const TLS_CODES = [
    "DEPTH_ZERO_SELF_SIGNED_CERT",
    "SELF_SIGNED_CERT_IN_CHAIN",
    "UNABLE_TO_GET_ISSUER_CERT",
    "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
    "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    "CERT_HAS_EXPIRED",
    "CERT_NOT_YET_VALID",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "ERR_TLS_HANDSHAKE_TIMEOUT",
    "ERR_SSL_WRONG_VERSION_NUMBER",
    "ERR_SSL_UNSUPPORTED_PROTOCOL",
  ];

  it.each(TLS_CODES)("genuine TLS code %s classifies as TLS and is safe to log", (code) => {
    const e = driverError("handshake failed", code);
    expect(classifyConnectionError(e)).toBe("DATABASE_TLS_FAILURE");
    // The whole point: the log drain must carry the code that identifies the
    // exception, instead of `code: null`.
    expect(safeDriverCode(e)).toBe(code);
  });

  it("pg's own SSL-negotiation errors classify as TLS even though they carry no code", () => {
    for (const message of [
      "The server does not support SSL connections",
      "There was an error establishing an SSL connection",
      "self-signed certificate in certificate chain",
      "unable to get local issuer certificate",
      "Hostname/IP does not match certificate's altnames",
    ]) {
      expect(classifyConnectionError(driverError(message))).toBe("DATABASE_TLS_FAILURE");
    }
  });

  it("a peer that is not a TLS listener is reported as TLS (peer-protocol failure)", () => {
    const e = driverError("write EPROTO 1:error:1408F10B:SSL routines:ssl3_get_record:wrong version number", "EPROTO");
    expect(classifyConnectionError(e)).toBe("DATABASE_TLS_FAILURE");
    expect(safeDriverCode(e)).toBe("EPROTO");
  });

  it("an error that only MENTIONS SSL is not reported as a TLS failure", () => {
    // The old bare `/SSL|TLS|certificate/` test classified both of these as
    // DATABASE_TLS_FAILURE and sent the operator to the certificate.
    const configShaped = driverError("the pooler requires SSL for this tenant", "55000");
    expect(classifyConnectionError(configShaped)).not.toBe("DATABASE_TLS_FAILURE");

    const genericShaped = driverError("TLS configuration rejected by the pooler");
    expect(classifyConnectionError(genericShaped)).not.toBe("DATABASE_TLS_FAILURE");
  });

  it("a reset before the handshake completes stays a connection failure, not a TLS failure", () => {
    const e = driverError("Client network socket disconnected before secure TLS connection was established", "ECONNRESET");
    expect(classifyConnectionError(e)).toBe("DATABASE_CONNECTION_REFUSED");
  });
});

describe("pg_hba rejections are classified by what the server objected to", () => {
  it("PostgreSQL 16 'no encryption' rejection is a TLS fault, not an auth fault", () => {
    // PostgreSQL 16 reworded this message; the old classifier matched only the
    // pre-16 wording AND let the SQLSTATE 28000 win first, so a client that
    // connected in plaintext to an SSL-enforcing server was reported as
    // DATABASE_AUTH_FAILURE.
    const e = driverError('pg_hba.conf rejects connection for host "h", user "u", database "d", no encryption', "28000");
    expect(classifyConnectionError(e)).toBe("DATABASE_TLS_FAILURE");
  });

  it("an hba rejection without an encryption hint stays an auth fault", () => {
    expect(
      classifyConnectionError(driverError('no pg_hba.conf entry for host "h", user "u", database "d"', "28000")),
    ).toBe("DATABASE_AUTH_FAILURE");
  });
});

describe("wrapped failures are classified by their root cause", () => {
  function wrapped(message: string, cause: Error): Error {
    return new Error(message, { cause }) as Error;
  }

  it("an uninformative wrapper resolves through the cause chain", () => {
    const e = wrapped("Connection terminated unexpectedly", driverError("handshake failed", "CERT_HAS_EXPIRED"));
    expect(classifyConnectionError(e)).toBe("DATABASE_TLS_FAILURE");
    expect(safeDriverCode(e)).toBe("CERT_HAS_EXPIRED");
  });

  it("an informative top-level class is not overwritten by the cause", () => {
    // pg-pool wraps the real error when the acquisition budget expires; the
    // timeout is the actionable signal, so it must win.
    const e = wrapped("Connection terminated due to connection timeout", driverError("Connection terminated unexpectedly"));
    expect(classifyConnectionError(e)).toBe("DATABASE_CONNECTION_TIMEOUT");
  });

  it("a cyclic cause graph terminates", () => {
    const a = driverError("outer") as Error & { cause?: unknown };
    const b = driverError("inner") as Error & { cause?: unknown };
    a.cause = b;
    b.cause = a;
    expect(classifyConnectionError(a)).toBe("DATABASE_UNKNOWN_FAILURE");
    expect(safeDriverCode(a)).toBeUndefined();
  });
});

describe("request-path secret boundaries", () => {
  it("the admin DSN never enters the health request path", () => {
    const routeSrc = readFileSync(join(__dirname, "..", "..", "src", "app", "api", "health", "route.ts"), "utf8");
    const probeSrc = readFileSync(join(__dirname, "..", "..", "src", "lib", "db-health.ts"), "utf8");
    for (const src of [routeSrc, probeSrc]) {
      expect(src).not.toContain("BEYU_ADMIN_DATABASE_URL");
      expect(src).not.toContain("db/admin");
      expect(src).not.toContain("adminDb");
      expect(src).not.toContain("adminPool");
    }
  });

  it("/api/health/live stays 200 with no database configured", async () => {
    delete process.env.DATABASE_URL;
    const res = await liveGet();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; checks: { process: string } };
    expect(body.ok).toBe(true);
    expect(body.checks.process).toBe("ALIVE");
    expect(connectMock).not.toHaveBeenCalled();
  });
});
