import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
    const migration = readFileSync("sectors/health/backend/database/migrations/046_beyu_authorization_assertion_replay.up.sql", "utf8");
    await pool.query(migration);
    await pool.query(migration); // forward migration remains idempotent
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

  it("supports a least-privilege runtime grant without delete or update", async () => {
    const role = `health_replay_role_${randomBytes(8).toString("hex")}`;
    const client = await pool.connect();
    try {
      await client.query(`CREATE ROLE "${role}" NOLOGIN`);
      await client.query(`GRANT USAGE ON SCHEMA beyu_identity TO "${role}"`);
      await client.query(`GRANT INSERT (issuer, jti, retain_until), SELECT (issuer, jti) ON beyu_identity.health_request_replay TO "${role}"`);
      await client.query(`SET ROLE "${role}"`);
      const db = { query: (sql: string, params: unknown[]) => client.query(sql, params) };
      const expiry = Math.floor(Date.now() / 1000) + 20;
      expect(await consumeHealthRequestOnce(db, "least-privilege", "abcdefghijklmnoPQRSTUV", expiry)).toBe("CONSUMED");
      expect(await consumeHealthRequestOnce(db, "least-privilege", "abcdefghijklmnoPQRSTUV", expiry)).toBe("REPLAY");
      await expect(client.query("DELETE FROM beyu_identity.health_request_replay")).rejects.toThrow(/permission denied/);
      await expect(client.query("UPDATE beyu_identity.health_request_replay SET retain_until = now()")).rejects.toThrow(/permission denied/);
    } finally {
      await client.query("RESET ROLE");
      await client.query(`DROP OWNED BY "${role}"`);
      await client.query(`DROP ROLE "${role}"`);
      client.release();
    }
  });

  it("fails closed after the replay store becomes unavailable", async () => {
    await pool.query("DROP TABLE beyu_identity.health_request_replay");
    expect(await consumeHealthRequestOnce(pool, "test-issuer", "zyxwvutsrqponmlkjihgfe", Math.floor(Date.now() / 1000) + 20)).toBe("UNAVAILABLE");
  });
});
