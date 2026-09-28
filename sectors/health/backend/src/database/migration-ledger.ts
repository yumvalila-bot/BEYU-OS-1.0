/**
 * BEYU Health OS — migration ledger inspection (shared by the governed runner
 * and the readiness probe).
 *
 * WHY THIS EXISTS
 * ───────────────
 * 1. Readiness (DEP-3). `/health/ready` used to query `health.schema_migrations`,
 *    a table that no migration and no runner has ever created. The canonical
 *    ledger is the one `migration-runner.ts` writes: `beyu_migrations` in the
 *    connection's current schema. Readiness was therefore permanently 503 on a
 *    correctly migrated database. It now reads the real ledger and verifies it
 *    against the committed migration source (count, order, checksums,
 *    fingerprint).
 *
 * 2. Ledger collision guard (T-2). The ROOT BEYU OS migrator
 *    (`scripts/migrate.ts`) also keeps a ledger named `beyu_migrations` in
 *    `public`, with an incompatible shape (`version`, `checksum NOT NULL`,
 *    `mode NOT NULL`, `description`). If the Health runner were pointed at the
 *    canonical BEYU database it would `ALTER` the ROOT ledger (adding
 *    owner/sector/provenance) before failing on the missing `id` column —
 *    mutating BEYU's governed migration evidence. `assertNotForeignLedger`
 *    refuses that BEFORE any statement is issued. Where the Health ledger
 *    should live in a shared-database topology is an architectural decision
 *    for humans; this guard only guarantees the runner fails closed until then.
 *
 * SECURITY NOTE
 * ─────────────
 * Ledger state is EVIDENCE, never authority. Nothing here grants access; it
 * reports facts and refuses unsafe execution.
 */
import { existsSync } from "node:fs";
import type { DbConnection } from "../modules/identity/db-connection";
import {
  computeFingerprint,
  readHealthMigrations,
} from "./migration-governance";

export const HEALTH_LEDGER_TABLE = "beyu_migrations";

export type LedgerKind = "ABSENT" | "HEALTH" | "FOREIGN";

export interface LedgerInspection {
  kind: LedgerKind;
  columns: string[];
}

type ColumnRow = { column_name: string };
type LedgerEntry = { id: string; checksum: string | null };

/**
 * Classify the `beyu_migrations` table visible in the connection's current
 * schema. A table without an `id` column cannot be the Health ledger (the
 * legacy Health shape is `id, applied_at`); a table with `version` and no `id`
 * is the root BEYU OS ledger.
 */
export async function inspectLedger(
  conn: DbConnection,
): Promise<LedgerInspection> {
  const rows = await conn.query<ColumnRow>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = $1`,
    [HEALTH_LEDGER_TABLE],
  );
  const columns = rows.map((r) => r.column_name).sort();
  if (columns.length === 0) return { kind: "ABSENT", columns };
  if (!columns.includes("id")) return { kind: "FOREIGN", columns };
  return { kind: "HEALTH", columns };
}

export class ForeignLedgerError extends Error {
  constructor(columns: string[]) {
    super(
      `GOVERNANCE VIOLATION: the "${HEALTH_LEDGER_TABLE}" table in the current schema is NOT a Health OS ledger ` +
        `(columns: ${columns.join(", ")}). It matches the root BEYU OS migration ledger. ` +
        `Refusing to run: the Health runner must never alter or write another authority's ledger. ` +
        `Resolve the Health database topology / ledger location before applying Health migrations.`,
    );
    this.name = "ForeignLedgerError";
  }
}

/** Fail closed if the visible ledger belongs to another migration authority. */
export async function assertNotForeignLedger(
  conn: DbConnection,
): Promise<LedgerInspection> {
  const inspection = await inspectLedger(conn);
  if (inspection.kind === "FOREIGN")
    throw new ForeignLedgerError(inspection.columns);
  return inspection;
}

export type MigrationStateReason =
  | "MIGRATION_SOURCE_UNAVAILABLE"
  | "LEDGER_ABSENT"
  | "LEDGER_FOREIGN"
  | "MIGRATIONS_PENDING"
  | "CHECKSUM_DRIFT"
  | "CHECKSUM_MISSING"
  | "LEDGER_AHEAD_OF_SOURCE";

export interface MigrationState {
  status: "up" | "down";
  reasons: MigrationStateReason[];
  ledger: LedgerKind | "UNKNOWN";
  committed: number;
  applied: number;
  latest: string | null;
  expectedFingerprint: string | null;
  ledgerFingerprint: string | null;
  /** First few ids only — never unbounded output. */
  pending: string[];
  drift: string[];
  unknown: string[];
}

const SAMPLE = 5;

/**
 * Compare the governed ledger against the committed migration source. `up`
 * only when every committed migration is applied, in the ledger, with a
 * matching recorded checksum, and the ledger contains nothing the source does
 * not know about.
 */
export async function readMigrationState(
  conn: DbConnection,
  migrationsDir: string,
): Promise<MigrationState> {
  const base: MigrationState = {
    status: "down",
    reasons: [],
    ledger: "UNKNOWN",
    committed: 0,
    applied: 0,
    latest: null,
    expectedFingerprint: null,
    ledgerFingerprint: null,
    pending: [],
    drift: [],
    unknown: [],
  };

  if (!existsSync(migrationsDir)) {
    return { ...base, reasons: ["MIGRATION_SOURCE_UNAVAILABLE"] };
  }
  const committed = readHealthMigrations(migrationsDir);
  const expectedFingerprint = computeFingerprint(
    committed.map((m) => m.checksum),
  );
  const state: MigrationState = {
    ...base,
    committed: committed.length,
    expectedFingerprint,
  };

  const inspection = await inspectLedger(conn);
  state.ledger = inspection.kind;
  if (inspection.kind === "ABSENT")
    return { ...state, reasons: ["LEDGER_ABSENT"] };
  if (inspection.kind === "FOREIGN")
    return { ...state, reasons: ["LEDGER_FOREIGN"] };

  const hasChecksum = inspection.columns.includes("checksum");
  const entries = await conn.query<LedgerEntry>(
    hasChecksum
      ? `SELECT id, checksum FROM ${HEALTH_LEDGER_TABLE}`
      : `SELECT id, NULL::text AS checksum FROM ${HEALTH_LEDGER_TABLE}`,
  );
  const byId = new Map(entries.map((e) => [e.id, e.checksum]));
  const known = new Set(committed.map((m) => m.id));

  const pending: string[] = [];
  const drift: string[] = [];
  const missing: string[] = [];
  const ledgerChecksums: string[] = [];
  for (const m of committed) {
    if (!byId.has(m.id)) {
      pending.push(m.id);
      continue;
    }
    const recorded = byId.get(m.id);
    if (!recorded) missing.push(m.id);
    else if (recorded !== m.checksum) drift.push(m.id);
    ledgerChecksums.push(recorded ?? "");
  }
  const unknown = entries
    .map((e) => e.id)
    .filter((id) => !known.has(id))
    .sort();

  const reasons: MigrationStateReason[] = [];
  if (pending.length) reasons.push("MIGRATIONS_PENDING");
  if (drift.length) reasons.push("CHECKSUM_DRIFT");
  if (missing.length) reasons.push("CHECKSUM_MISSING");
  if (unknown.length) reasons.push("LEDGER_AHEAD_OF_SOURCE");

  const appliedKnown = committed.filter((m) => byId.has(m.id));
  return {
    ...state,
    status: reasons.length === 0 ? "up" : "down",
    reasons,
    applied: entries.length,
    latest: appliedKnown.length
      ? appliedKnown[appliedKnown.length - 1].id
      : null,
    ledgerFingerprint:
      missing.length === 0 ? computeFingerprint(ledgerChecksums) : null,
    pending: pending.slice(0, SAMPLE),
    drift: drift.slice(0, SAMPLE),
    unknown: unknown.slice(0, SAMPLE),
  };
}
