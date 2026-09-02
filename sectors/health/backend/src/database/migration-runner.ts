/**
 * BEYU Health OS — deterministic migration runner.
 *
 * Applies numbered SQL migrations from `backend/database/migrations/` in
 * lexical order, recording each migration id in a `beyu_migrations` ledger.
 * Each pair <NNN_name>.up.sql / <NNN_name>.down.sql is applied transactionally.
 *
 * Usage:
 *   DATABASE_URL=postgres://... npx ts-node src/database/migration-runner.ts up
 *   DATABASE_URL=postgres://... npx ts-node src/database/migration-runner.ts down [N]
 */
import * as fs from "fs";
import * as path from "path";
import { PgConnection } from "../modules/identity/db-connection";

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

interface MigrationFile {
  id: string;
  name: string;
  upPath: string;
  downPath: string;
}

function readMigrations(): MigrationFile[] {
  // __dirname is <backend>/src/database, so the migrations live two levels up at
  // <backend>/database/migrations. Resolving one level up produced
  // <backend>/src/database/migrations, which does not exist, so readdirSync threw
  // ENOENT before any migration could be read. This matches the resolution used by
  // src/common/testing/test-bed.ts, which walks up to the backend root the same way.
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
      throw new Error(`Migration ${id} missing ${down}`);
    }
    migs.push({
      id,
      name: id.replace(/^\d+_/, ""),
      upPath: path.join(dir, up),
      downPath,
    });
  }
  return migs;
}

async function up(conn: PgConnection): Promise<void> {
  await conn.exec(
    `CREATE TABLE IF NOT EXISTS beyu_migrations (
       id text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     );`,
  );
  const migs = readMigrations();
  for (const m of migs) {
    const existing = await conn.query<{ id: string }>(
      `SELECT id FROM beyu_migrations WHERE id = $1`,
      [m.id],
    );
    if (existing.length > 0) {
      console.log(`⏭  ${m.id} already applied`);
      continue;
    }
    const sql = fs.readFileSync(m.upPath, "utf8");
    await conn.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query(`INSERT INTO beyu_migrations (id) VALUES ($1)`, [m.id]);
    });
    console.log(`✓  ${m.id} applied`);
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

async function run(direction: "up" | "down", steps: number): Promise<void> {
  const conn = new PgConnection({ connectionString: connectionString() });
  try {
    if (direction === "up") await up(conn);
    else await down(conn, steps);
  } finally {
    await conn.close();
  }
}

const args = process.argv.slice(2);
const direction = (args[0] as "up" | "down") ?? "up";
const steps = args[1] ? parseInt(args[1], 10) : 1;
run(direction, steps)
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  });
