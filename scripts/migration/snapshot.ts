/**
 * BEYU OS — DRIZZLE METADATA SNAPSHOT GENERATOR.
 *
 *   usage: npx tsx scripts/migration/snapshot.ts --seq=0074 --tag=0074_enterprise_intelligence_expansion [--emit-sql] [--write]
 *          npx tsx scripts/migration/snapshot.ts --seq=0075 --tag=0075_noelia_authority_execution_hardening --from-head [--emit-sql] [--write]
 *
 * WHY THIS EXISTS
 * ───────────────
 * `drizzle/meta` had silently fallen behind the SQL (see `src/lib/migration/integrity.ts`): snapshot
 * files stop at 0062, `drizzle-kit generate` aborts on the historical 0038/0039 parent collision, and
 * the metadata is authored by nothing but a developer's memory. That is tolerable while nobody consumes
 * the metadata — but it makes the NEXT migration's snapshot impossible to produce honestly, and the
 * metadata-debt register is not a place to keep adding rows.
 *
 * This tool produces the missing snapshot the honest way: it derives the schema from
 * `src/db/schema/*.ts` using drizzle-kit's own snapshot serializer, chains it from the highest existing
 * snapshot, and (optionally) emits the exact SQL diff between the previous schema and the new one.
 *
 * It is DELIBERATELY NOT a migration runner. `scripts/migrate.ts` remains the only way SQL is applied,
 * and this tool never touches a database, a ledger, or an existing .sql file. It writes exactly one
 * new `drizzle/meta/<seq>_snapshot.json` and one journal entry, both additive.
 *
 * The generated SQL is a STARTING POINT, never a finished migration: row-level security policies,
 * runtime-role grants and the repository's verification blocks are hand-written, because a generated
 * `CREATE TABLE` contains no tenancy model and a snapshot contains no security.
 *
 * Import note: each domain module is imported DIRECTLY rather than through the `schema.ts` barrel.
 * A namespace import of the barrel is not enumerable under tsx's ESM loader, and drizzle-kit's
 * serializer needs a plain record of table objects.
 */
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";

type SchemaModule = Record<string, unknown>;

const schemaDir = join(process.cwd(), "src", "db", "schema");
const metaDir = join(process.cwd(), "drizzle", "meta");

function arg(name: string, fallback?: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  if (process.argv.includes(`--${name}`)) return "true";
  if (fallback !== undefined) return fallback;
  throw new Error(`missing --${name}`);
}

/**
 * Build the schema record from every domain module.
 *
 * `exclude` is how the diff base is produced: the base is the repository's schema WITHOUT the modules
 * the new migration introduces, so the emitted SQL contains only new objects rather than a replay of
 * every table added since the last recorded snapshot.
 */
async function loadSchema(exclude: readonly string[] = []): Promise<SchemaModule> {
  const files = readdirSync(schemaDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort();
  const record: SchemaModule = {};
  for (const file of files) {
    if (exclude.includes(file)) continue;
    const mod = (await import(join("..", "..", "src", "db", "schema", file))) as SchemaModule;
    for (const [key, value] of Object.entries(mod)) {
      if (value && typeof value === "object") record[key] = value;
    }
  }
  return record;
}

interface SnapshotRecord {
  id: string;
  prevId: string;
  tables: Record<string, unknown>;
  _meta?: { columns?: Record<string, unknown>; schemas?: Record<string, unknown>; tables?: Record<string, unknown> };
  [k: string]: unknown;
}

function snapshots(): { seq: string; snapshot: SnapshotRecord }[] {
  return readdirSync(metaDir)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()
    .map((f) => ({ seq: f.replace("_snapshot.json", ""), snapshot: JSON.parse(readFileSync(join(metaDir, f), "utf8")) as SnapshotRecord }));
}

async function main(): Promise<void> {
  const seq = arg("seq");
  const tag = arg("tag");
  const exclude = (arg("exclude", "") === "" ? [] : arg("exclude").split(",")).map((s) => s.trim());
  const emitSql = process.argv.includes("--emit-sql");
  const write = process.argv.includes("--write");
  const fromHead = process.argv.includes("--from-head");

  if (!/^\d{4}$/.test(seq)) throw new Error("--seq must be a 4-digit sequence");
  if (fromHead && exclude.length > 0) throw new Error("--from-head and --exclude are mutually exclusive");
  const chain = snapshots();
  const head = chain[chain.length - 1];
  if (head.snapshot.id === undefined || head.snapshot.id === "") throw new Error(`snapshot ${head.seq} has no id`);
  if (chain.some((s) => s.seq === seq)) throw new Error(`snapshot ${seq} already exists — refusing to overwrite`);

  const fullSchema = await loadSchema();
  // New-table expansions can derive a synthetic base by excluding only their
  // newly introduced modules. For a migration that changes existing tables,
  // the only honest base is the checked-in predecessor snapshot itself.
  const base = fromHead
    ? head.snapshot
    : (await generateDrizzleJson(await loadSchema(exclude), head.snapshot.id)) as unknown as SnapshotRecord;
  const next = (await generateDrizzleJson(fullSchema, base.id ?? head.snapshot.id)) as unknown as SnapshotRecord;
  next.id = randomUUID();
  next.prevId = head.snapshot.id;

  const newTables = Object.keys(next.tables).filter((t) => !(t in base.tables));
  const statements = await generateMigration(base as never, next as never);
  if (statements.length === 0) throw new Error("no schema changes found — refusing to write an empty snapshot");
  const sql = statements.join("\n--> statement-breakpoint\n");

  if (emitSql) process.stdout.write(sql + "\n");

  if (write) {
    const target = join(metaDir, `${seq}_snapshot.json`);
    writeFileSync(target, JSON.stringify(next, null, 2) + "\n");
    const journalPath = join(metaDir, "_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
      version: string;
      dialect: string;
      entries: { idx: number; version: string; when: number; tag: string; breakpoints: boolean }[];
    };
    if (!journal.entries.some((e) => e.tag === tag)) {
      journal.entries.push({
        idx: journal.entries.length,
        version: journal.entries[journal.entries.length - 1]?.version ?? "7",
        when: Date.now(),
        tag,
        breakpoints: true,
      });
      writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
    }
    process.stderr.write(
      `wrote ${target} (chain ${head.seq} → ${seq}, ${newTables.length} new tables, sha256 ${createHash("sha256").update(JSON.stringify(next.tables)).digest("hex").slice(0, 12)})\n`,
    );
  }

  process.stderr.write(
    `schema changes: ${statements.length} generated statements; new tables (${newTables.length}): ${newTables.join(", ")}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(`::error::SNAPSHOT GENERATION FAILED — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
