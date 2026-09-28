/**
 * DEP-2 regression — ONE database connection contract.
 *
 * Pins: DATABASE_URL is canonical; production never falls back to DB_* (and
 * never to the localhost superuser default); production verifies TLS for
 * non-local hosts and refuses a DSN that disables it; the identity module no
 * longer builds a second pool.
 */
import * as fs from "fs";
import * as path from "path";
import { buildPgPoolConfig, DatabaseConfigError } from "./pg-connection-config";

const env =
  (vars: Record<string, string | undefined>) =>
  (key: string): string | undefined =>
    vars[key];

describe("buildPgPoolConfig — single Health DB connection contract", () => {
  it("uses DATABASE_URL when present and ignores DB_* entirely", () => {
    const cfg = buildPgPoolConfig(
      env({
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://app@127.0.0.1:5432/beyu_health",
        DB_HOST: "other-host",
        DB_USERNAME: "postgres",
        DB_PASSWORD: "password",
      }),
    );
    expect(cfg.connectionString).toBe(
      "postgresql://app@127.0.0.1:5432/beyu_health",
    );
    expect(cfg.host).toBeUndefined();
    expect(cfg.user).toBeUndefined();
    expect(cfg.password).toBeUndefined();
  });

  it("production without DATABASE_URL is refused — no DB_* / superuser fallback", () => {
    expect(() =>
      buildPgPoolConfig(
        env({
          NODE_ENV: "production",
          DB_HOST: "db.internal",
          DB_USERNAME: "postgres",
        }),
      ),
    ).toThrow(DatabaseConfigError);
  });

  it("production verifies TLS for a non-local host", () => {
    const cfg = buildPgPoolConfig(
      env({
        NODE_ENV: "production",
        DATABASE_URL:
          "postgresql://beyu_health_runtime@db.example.net:5432/beyu",
      }),
    );
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true });
    expect(cfg.max).toBe(20);
  });

  it.each(["sslmode=disable", "ssl=false", "ssl=0", "sslmode=DISABLE"])(
    "production refuses a DSN that disables TLS for a non-local host (%s)",
    (q) => {
      expect(() =>
        buildPgPoolConfig(
          env({
            NODE_ENV: "production",
            DATABASE_URL: `postgresql://r@db.example.net:5432/beyu?${q}`,
          }),
        ),
      ).toThrow(/disables TLS/);
    },
  );

  it("production allows a local host without forcing TLS (sidecar / socket)", () => {
    const cfg = buildPgPoolConfig(
      env({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://r@localhost:5432/beyu?sslmode=disable",
      }),
    );
    expect(cfg.ssl).toBeUndefined();
  });

  it("rejects a non-PostgreSQL / unparseable DSN without echoing it", () => {
    const secretish = "mysql://root:hunter2@db/x";
    try {
      buildPgPoolConfig(
        env({ NODE_ENV: "development", DATABASE_URL: secretish }),
      );
      throw new Error("expected refusal");
    } catch (e) {
      expect(e).toBeInstanceOf(DatabaseConfigError);
      expect(String((e as Error).message)).not.toContain("hunter2");
    }
  });

  it("development without DATABASE_URL keeps the docker-compose DB_* fallback", () => {
    const cfg = buildPgPoolConfig(
      env({
        NODE_ENV: "development",
        DB_HOST: "postgres",
        DB_PORT: "5433",
        DB_USERNAME: "dev",
        DB_PASSWORD: "devpw",
        DB_DATABASE: "beyu_health",
      }),
    );
    expect(cfg).toMatchObject({
      host: "postgres",
      port: 5433,
      user: "dev",
      database: "beyu_health",
    });
    expect(cfg.connectionString).toBeUndefined();
  });
});

describe("DB_CONNECTION wiring — exactly one provider", () => {
  const src = path.resolve(__dirname, "..", "..");
  const read = (rel: string) => fs.readFileSync(path.join(src, rel), "utf8");

  it("the identity module does not provide or export its own DB_CONNECTION", () => {
    const identity = read("modules/identity/identity.module.ts");
    expect(identity).not.toMatch(/provide:\s*DB_CONNECTION/);
    expect(identity).not.toMatch(/new PgConnection/);
  });

  it("DbModule builds its pool only through buildPgPoolConfig", () => {
    const db = read("common/db/db.module.ts");
    expect(db).toMatch(/buildPgPoolConfig\(/);
    expect(db).not.toMatch(/DB_HOST|DB_USERNAME|DB_PASSWORD/);
  });

  it("no other production module constructs a PgConnection pool", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (
          e.name.endsWith(".ts") &&
          !e.name.endsWith(".spec.ts") &&
          !p.includes(`${path.sep}testing${path.sep}`) &&
          !p.includes(`${path.sep}test${path.sep}`) &&
          /new PgConnection\(/.test(fs.readFileSync(p, "utf8"))
        ) {
          offenders.push(path.relative(src, p));
        }
      }
    };
    walk(src);
    // db.module.ts is the runtime pool; migration-runner.ts is the separate
    // governed CLI (privileged migration channel); test-connection.ts is the
    // test harness.
    expect(offenders.sort()).toEqual(
      [
        path.join("common", "db", "db.module.ts"),
        path.join("database", "migration-runner.ts"),
        path.join("modules", "identity", "test-connection.ts"),
      ].sort(),
    );
  });
});
