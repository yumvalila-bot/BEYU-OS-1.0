/**
 * BEYU Health OS — governed deterministic migration runner.
 *
 * GOVERNANCE CONTRACT
 * ───────────────────
 * Health Federation schema changes are governed by the SAME authoritative
 * release lifecycle as the root BEYU OS. This runner enforces:
 *
 *   1. DETERMINISTIC ORDERING — migrations applied in strict lexical order.
 *   2. CHECKSUM INTEGRITY — sha256 of each SQL file is recorded on apply and
 *      verified on every subsequent run. A mismatch means the migration file
 *      has been altered after application; the runner FAILS CLOSED.
 *   3. EXPLICIT OWNERSHIP — every ledger row records `owner = 'health'` and
 *      `sector = 'HEALTH_OS'` so no Health migration can be mistaken for a
 *      root BEYU migration or vice versa.
 *   4. AUDITABLE EXECUTION — mode is recorded (APPLIED / ALREADY_APPLIED /
 *      BASELINED) with provenance metadata.
 *   5. NO DUPLICATE AUTHORITY — the runner never creates a migration outside
 *      the governed ledger. There is no silent auto-migration.
 *   6. FAIL CLOSED ON AMBIGUITY — checksum mismatch → abort, missing down
 *      file → abort, non-sequential numbering → abort.
 *
 * This runner MUST NOT be invoked outside the governed release process in
 * production. The release approval gate is responsible for authorizing
 * migration application.
 *
 * SECURITY NOTE
 * ─────────────
 * Migration state never grants authorization. This runner records facts about
 * applied DDL; it confers no capability. RLS remains the final data-isolation
 * boundary regardless of anything recorded here.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx ts-node src/database/migration-runner.ts up
 *   DATABASE_URL=postgres://... npx ts-node src/database/migration-runner.ts down [N]
 *   DATABASE_URL=postgres://... npx ts-node src/database/migration-runner.ts status
 */
import * as fs from "fs";
import * as path from "path";
import { createHash } from "node:crypto";
import { PgConnection } from "../modules/identity/db-connection";

/**
 * Health OS migration owner tag. Every ledger row written by this runner
 * carries this provenance so it is always distinguishable from root BEYU OS
 * migrations.
 */
export const HEALTH_MIGRATION_OWNER = "health";
export const HEALTH_MIGRATION_SECTOR = "HEALTH_OS";

/**
 * Separator used for fingerprint computation (matches root convention).
 */
export const FINGERPRINT_JOIN = "\n";

function connectionString(): string {
  return (
    process.env.DATABASE_URL ||
    `postgres://${process.env.DB_USERNAME ?? "postgres"}:${
      process.env.DB_PASSWORD ?? ""
    }@${process.env.DB_HOST ?? "localhost"}:${process.env.DB_PORT ?? 5432}/${
      process.env.DB_DATABASE ?? "beyu_health"
    }`
  );
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface MigrationFile {
  /** Full filename, e.g. `001_identity_foundation.up.sql`. */
  file: string;
  /** Migration id without extension, e.g. `001_identity_foundation`. */
  id: string;
  /** Human-readable name, e.g. `identity_foundation`. */
  name: string;
  /** Path to the up migration SQL file. */
  upPath: string;
  /** Path to the down migration SQL file. */
  downPath: string;
  /** sha256 checksum of the up migration SQL. */
  checksum: string;
  /** Raw SQL of the up migration. */
  sql: string;
}

export interface LedgerRow {
  id: string;
  checksum: string;
  owner: string;
  sector: string;
  mode: string;
  applied_at: Date;
  provenance?: string;
}

function readMigrations(): MigrationFile[] {
  const dir = path.resolve(__dirname, "..", "..", "database", "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  const migs: MigrationFile[] = [];
  for (const up of files) {
    const id = up.replace(/\.up\.sql$/, "");
    const down = up.replace(/\.up\.sql$/, ".down.sql");
    const downPath = path.join(dir, down);
    if (!fs.existsSync(downPath)) {
      throw new Error(
        `GOVERNANCE VIOLATION: Migration ${id} has no matching ${down}. ` +
          `Every migration MUST have both up and down files.`,
      );
    }
    const sql = fs.readFileSync(path.join(dir, up), "utf8");
    migs.push({
      file: up,
      id,
      name: id.replace(/^\d+_/, ""),
      upPath: path.join(dir, up),
      downPath,
      checksum: sha256(sql),
      sql,
    });
  }

  // Verify sequential numbering — gaps or duplicates are governance violations.
  const expectedSeqs = migs.map((_, i) => String(i + 1).padStart(3, "0"));
  for (let i = 0; i < migs.length; i++) {
    const actual = migs[i].id.split("_")[0];
    if (actual !== expectedSeqs[i]) {
      throw new Error(
        `GOVERNANCE VIOLATION: Migration sequence gap at position ${i}. ` +
          `Expected ${expectedSeqs[i]}, found ${actual}. ` +
          `Health migrations must be sequentially numbered without gaps.`,
      );
    }
  }

  return migs;
}

/**
 * Compute the deterministic migration fingerprint for the given set of
 * checksums in order. This is the evidence artifact that PVG uses to verify
 * the Health migration ledger matches the committed source.
 */
export function computeFingerprint(
  orderedChecksums: readonly string[],
): string | null {
  if (!orderedChecksums || orderedChecksums.length === 0) return null;
  const joined = orderedChecksums.join(FINGERPRINT_JOIN);
  return createHash("sha256").update(joined).digest("hex");
}

/**
 * Ensure the governed ledger table exists with all required columns.
 * Upgrades legacy ledger schema if checksum/owner/sector columns are missing.
 */
async function ensureLedger(conn: PgConnection): Promise<void> {
  await conn.exec(`
    CREATE TABLE IF NOT EXISTS beyu_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  // Check if the ledger already has the governance columns.
  const cols = await conn.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'beyu_migrations' AND column_name IN ('checksum', 'owner', 'sector', 'mode', 'provenance')`,
  );
  const colNames = new Set(cols.map((r) => r.column_name));

  if (!colNames.has("checksum")) {
    await conn.exec(`ALTER TABLE beyu_migrations ADD COLUMN IF NOT EXISTS checksum text`);
  }
  if (!colNames.has("owner")) {
    await conn.exec(`ALTER TABLE beyu_migrations ADD COLUMN IF NOT EXISTS owner text`);
  }
  if (!colNames.has("sector")) {
    await conn.exec(`ALTER TABLE beyu_migrations ADD COLUMN IF NOT EXISTS sector text`);
  }
  if (!colNames.has("mode")) {
    await conn.exec(`ALTER TABLE beyu_migrations ADD COLUMN IF NOT EXISTS mode text`);
  }
  if (!colNames.has("provenance")) {
    await conn.exec(`ALTER TABLE beyu_migrations ADD COLUMN IF NOT EXISTS provenance text`);
  }
}

async function up(conn: PgConnection): Promise<void> {
  await ensureLedger(conn);
  const migs = readMigrations();
  const provenance = process.env.BEYU_RELEASE_PROVENANCE || "manual";

  for (const m of migs) {
    const existing = await conn.query<{ id: string; checksum: string | null }>(
      `SELECT id, checksum FROM beyu_migrations WHERE id = $1`,
      [m.id],
    );

    if (existing.length > 0) {
      const recorded = existing[0];
      // CHECKSUM VERIFICATION — fail closed on mismatch.
      if (recorded.checksum && recorded.checksum !== m.checksum) {
        throw new Error(
          `GOVERNANCE VIOLATION: Checksum mismatch for migration ${m.id}. ` +
            `Recorded: ${recorded.checksum.slice(0, 16)}… ` +
            `Current file: ${m.checksum.slice(0, 16)}… ` +
            `Applied migrations MUST NOT be modified. ` +
            `This may indicate unauthorized tampering.`,
        );
      }
      // Backfill governance columns for legacy migrations that lack them.
      if (!recorded.checksum) {
        await conn.exec(`
          UPDATE beyu_migrations
          SET checksum = '${m.checksum}',
              owner = '${HEALTH_MIGRATION_OWNER}',
              sector = '${HEALTH_MIGRATION_SECTOR}',
              mode = 'BASELINED_LEGACY',
              provenance = 'checksum_backfilled_${provenance}'
          WHERE id = '${m.id}' AND checksum IS NULL;
        `);
        console.log(`⚠  ${m.id} — legacy record backfilled with checksum and governance metadata`);
      }
      console.log(`⏭  ${m.id} already applied`);
      continue;
    }

    await conn.transaction(async (tx) => {
      await tx.exec(m.sql);
      await tx.query(
        `INSERT INTO beyu_migrations (id, checksum, owner, sector, mode, provenance)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.id, m.checksum, HEALTH_MIGRATION_OWNER, HEALTH_MIGRATION_SECTOR, "APPLIED", provenance],
      );
    });
    console.log(`✓  ${m.id} applied (checksum: ${m.checksum.slice(0, 16)}…)`);
  }
}

async function down(conn: PgConnection, steps = 1): Promise<void> {
  const migs = readMigrations().reverse();
  const applied = await conn.query<{ id: string; applied_at: Date }>(
    `SELECT id, applied_at FROM beyu_migrations ORDER BY applied_at DESC`,
  );
  const appliedSet = new Set(applied.map((r) => r.id));
  let done = 0;
  for (const m of migs) {
    if (done >= steps) break;
    if (!appliedSet.has(m.id)) continue;
    const sql = fs.readFileSync(m.downPath, "utf8");
    await conn.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`DELETE FROM beyu_migrations WHERE id = $1`, [m.id]);
    });
    console.log(`↓  ${m.id} rolled back`);
    done++;
  }
  if (done === 0) console.log("No migrations to roll back.");
}

async function status(conn: PgConnection): Promise<void> {
  await ensureLedger(conn);
  const migs = readMigrations();
  const applied = await conn.query<LedgerRow>(
    `SELECT id, checksum, owner, sector, mode, applied_at, provenance
     FROM beyu_migrations ORDER BY id`,
  );
  const appliedMap = new Map(applied.map((r) => [r.id, r]));

  console.log("BEYU Health OS — Migration Status\n");
  console.log(
    "ID".padEnd(45) + "STATUS".padEnd(12) + "CHECKSUM OK".padEnd(12) + "OWNER".padEnd(10) + "MODE",
  );
  console.log("─".repeat(90));

  for (const m of migs) {
    const record = appliedMap.get(m.id);
    if (!record) {
      console.log(m.id.padEnd(45) + "PENDING".padEnd(12) + "n/a".padEnd(12) + "n/a".padEnd(10) + "n/a");
    } else {
      const checksumOk =
        record.checksum && record.checksum === m.checksum
          ? "OK"
          : record.checksum
            ? "DRIFT"
            : "MISSING";
      console.log(
        m.id.padEnd(45) +
          "APPLIED".padEnd(12) +
          checksumOk.padEnd(12) +
          (record.owner || "unknown").padEnd(10) +
          (record.mode || "unknown"),
      );
    }
  }

  // Compute and display the fingerprint.
  const appliedChecksums = migs
    .filter((m) => appliedMap.has(m.id))
    .map((m) => {
      const record = appliedMap.get(m.id)!;
      return record.checksum || m.checksum;
    });
  const fingerprint = computeFingerprint(appliedChecksums);
  console.log(`\nMigration fingerprint: ${fingerprint || "n/a"}`);
  console.log(`Total migrations: ${migs.length}`);
  console.log(`Applied: ${applied.length}`);
  console.log(`Pending: ${migs.length - applied.length}`);
}

async function run(direction: "up" | "down" | "status", steps: number): Promise<void> {
  const conn = new PgConnection({ connectionString: connectionString() });
  try {
    if (direction === "up") await up(conn);
    else if (direction === "down") await down(conn, steps);
    else await status(conn);
  } finally {
    await conn.close();
  }
}

const args = process.argv.slice(2);
const direction = (args[0] as "up" | "down" | "status") ?? "up";
const steps = args[1] ? parseInt(args[1], 10) : 1;
run(direction, steps)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
