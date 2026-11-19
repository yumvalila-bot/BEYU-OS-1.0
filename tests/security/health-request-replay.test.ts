import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import { consumeHealthRequestOnce } from "../../sectors/health/backend/src/modules/identity/health-request-replay";

const id = "ABCDEFGHIJKLMNOPQRSTUV";

describe("Health replay consumption primitive", () => {
  it("fails closed for bad input without calling the database", async () => {
    const pool = { query: async () => { throw new Error("must not be called"); } };
    expect(await consumeHealthRequestOnce(pool, "", id, 123)).toBe("UNAVAILABLE");
    expect(await consumeHealthRequestOnce(pool, "issuer", "short", 123)).toBe("UNAVAILABLE");
    expect(await consumeHealthRequestOnce(pool, "issuer", id, Number.NaN)).toBe("UNAVAILABLE");
  });

  it("returns unavailable on database failure without leaking error details", async () => {
    const pool = { query: async () => { throw new Error("sensitive database information"); } };
    expect(await consumeHealthRequestOnce(pool, "issuer", id, 123)).toBe("UNAVAILABLE");
  });
});

// Explicit opt-in: create and drop only a randomly named scratch database on
// loopback PostgreSQL. The test NEVER accepts a remote host or a fixed DB name.
const adminUrl = process.env.BEYU_HEALTH_REPLAY_TEST_ADMIN_URL;
describe.skipIf(!adminUrl)("replay uniqueness against isolated PostgreSQL", () => {
  let admin: Client;
  let pool: Pool;
  const databaseName = `health_replay_test_${randomBytes(8).toString("hex")}`;

  beforeAll(async () => {
    const url = new URL(adminUrl!);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
      throw new Error("Scratch database test requires a loopback PostgreSQL server");
    }
    admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    url.pathname = `/${databaseName}`;
    pool = new Pool({ connectionString: url.toString(), max: 12 });
    await pool.query("CREATE SCHEMA beyu_identity");
    await pool.query(`CREATE TABLE beyu_identity.health_request_replay (
      issuer text NOT NULL, jti text NOT NULL, retain_until timestamptz NOT NULL,
      PRIMARY KEY (issuer, jti)
    )`);
  });

  afterAll(async () => {
    if (pool) await pool.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  });

  it("atomically permits exactly one winner across concurrent pool connections", async () => {
    const expiry = Math.floor(Date.now() / 1000) + 20;
    const outcomes = await Promise.all(Array.from({ length: 20 }, () =>
      consumeHealthRequestOnce(pool, "test-issuer", id, expiry),
    ));
    expect(outcomes.filter((r) => r === "CONSUMED")).toHaveLength(1);
    expect(outcomes.filter((r) => r === "REPLAY")).toHaveLength(19);
    const rows = await pool.query("SELECT extract(epoch from retain_until)::bigint AS until FROM beyu_identity.health_request_replay");
    expect(Number(rows.rows[0].until)).toBe(expiry + 65);
  });

  it("fails closed after the replay store becomes unavailable", async () => {
    await pool.query("DROP TABLE beyu_identity.health_request_replay");
    expect(await consumeHealthRequestOnce(pool, "test-issuer", "zyxwvutsrqponmlkjihgfe", Math.floor(Date.now() / 1000) + 20)).toBe("UNAVAILABLE");
  });
});
