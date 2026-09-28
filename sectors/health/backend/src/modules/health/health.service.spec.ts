import { HealthService, HEALTH_MIGRATIONS_DIR } from "./health.service";
import { readHealthMigrations } from "../../database/migration-governance";

const COMMITTED = readHealthMigrations(HEALTH_MIGRATIONS_DIR);
const HEALTH_LEDGER_COLUMNS = [
  "applied_at",
  "checksum",
  "id",
  "mode",
  "owner",
  "provenance",
  "sector",
];
/** A ledger exactly as migration-runner.ts leaves it after `up`. */
const COMPLETE_LEDGER = COMMITTED.map((m) => ({
  id: m.id,
  checksum: m.checksum,
}));

function svc(
  overrides: {
    dbFail?: boolean;
    /** Columns of the visible `beyu_migrations` table ([] = absent). */
    ledgerColumns?: string[];
    ledgerRows?: { id: string; checksum: string | null }[];
    env?: Record<string, any>;
    adapters?: any[];
    outbox?: any;
  } = {},
) {
  const db = {
    query: async (q: string) => {
      if (overrides.dbFail) throw new Error("connection refused");
      if (/information_schema\.columns/.test(q))
        return (overrides.ledgerColumns ?? HEALTH_LEDGER_COLUMNS).map(
          (column_name) => ({ column_name }),
        );
      if (/FROM beyu_migrations/.test(q))
        return overrides.ledgerRows ?? COMPLETE_LEDGER;
      return [{ ok: 1 }];
    },
  } as any;
  const cfg = { get: (k: string) => overrides.env?.[k] ?? undefined } as any;
  const reg = { probeAll: async () => overrides.adapters ?? [] } as any;
  const metrics = {
    readiness: async () => overrides.outbox ?? { status: "up", detail: {} },
    snapshot: async () => ({
      governed_events: {},
      sync_adapters: {},
      dispatcher: {},
      timestamp: "",
    }),
  } as any;
  return new HealthService(db, cfg, reg, metrics);
}

describe("HealthService readiness", () => {
  it("liveness always returns alive", async () => {
    const s = svc({ dbFail: true });
    await expect(s.checkLiveness()).resolves.toMatchObject({ status: "alive" });
  });

  it("readiness throws when DB is down", async () => {
    const s = svc({ dbFail: true });
    await expect(s.checkReadiness()).rejects.toThrow();
  });

  it("readiness returns ready when DB up and config ok", async () => {
    const s = svc();
    const r = await s.checkReadiness();
    expect(r.status).toBe("ready");
    expect(r.checks.database.status).toBe("up");
  });

  it("production with default JWT_SECRET reports NOT_READY (critical config)", async () => {
    const s = svc({
      env: { NODE_ENV: "production", JWT_SECRET: "dev-only-change-me" },
    });
    await expect(s.checkReadiness()).rejects.toThrow();
  });

  it("readiness reports the verified ledger fingerprint when fully migrated", async () => {
    const r = await svc().checkReadiness();
    const m = r.checks.migrations as any;
    expect(m.status).toBe("up");
    expect(m.committed).toBe(COMMITTED.length);
    expect(m.latest).toBe(COMMITTED[COMMITTED.length - 1].id);
    expect(m.expected_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(m.ledger_fingerprint).toBe(m.expected_fingerprint);
  });

  it("no governed ledger → NOT_READY (LEDGER_ABSENT)", async () => {
    const s = svc({ ledgerColumns: [] });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: { migrations: { status: "down", reasons: ["LEDGER_ABSENT"] } },
      },
    });
  });

  it("pending migration → NOT_READY (MIGRATIONS_PENDING)", async () => {
    const s = svc({ ledgerRows: COMPLETE_LEDGER.slice(0, -1) });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: {
          migrations: {
            status: "down",
            reasons: ["MIGRATIONS_PENDING"],
            pending_sample: [COMMITTED[COMMITTED.length - 1].id],
          },
        },
      },
    });
  });

  it("checksum drift (tampered applied migration) → NOT_READY", async () => {
    const rows = COMPLETE_LEDGER.map((r, i) =>
      i === 3 ? { ...r, checksum: "0".repeat(64) } : r,
    );
    const s = svc({ ledgerRows: rows });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: { migrations: { status: "down", reasons: ["CHECKSUM_DRIFT"] } },
      },
    });
  });

  it("unrecorded checksum → NOT_READY (CHECKSUM_MISSING), no fingerprint claimed", async () => {
    const rows = COMPLETE_LEDGER.map((r, i) =>
      i === 0 ? { ...r, checksum: null } : r,
    );
    const s = svc({ ledgerRows: rows });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: {
          migrations: {
            status: "down",
            reasons: ["CHECKSUM_MISSING"],
            ledger_fingerprint: null,
          },
        },
      },
    });
  });

  it("ledger ahead of the shipped source → NOT_READY (LEDGER_AHEAD_OF_SOURCE)", async () => {
    const s = svc({
      ledgerRows: [
        ...COMPLETE_LEDGER,
        { id: "999_future", checksum: "f".repeat(64) },
      ],
    });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: {
          migrations: { status: "down", reasons: ["LEDGER_AHEAD_OF_SOURCE"] },
        },
      },
    });
  });

  it("root BEYU OS ledger shape (version, no id) is never read as Health evidence", async () => {
    const s = svc({
      ledgerColumns: [
        "applied_at",
        "checksum",
        "description",
        "mode",
        "version",
      ],
    });
    await expect(s.checkReadiness()).rejects.toMatchObject({
      response: {
        checks: {
          migrations: {
            status: "down",
            ledger: "FOREIGN",
            reasons: ["LEDGER_FOREIGN"],
          },
        },
      },
    });
  });

  it("the legacy nonexistent health.schema_migrations table is no longer consulted", async () => {
    const seen: string[] = [];
    const s = svc();
    const db = (s as any).db;
    const orig = db.query;
    db.query = async (q: string, p?: unknown[]) => {
      seen.push(q);
      return orig(q, p);
    };
    await s.checkReadiness();
    expect(seen.some((q) => /schema_migrations/.test(q))).toBe(false);
  });
});
