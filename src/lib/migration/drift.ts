/**
 * BEYU OS — P2 schema drift comparison.
 *
 * THE PROBLEM THIS REPLACES
 * ─────────────────────────
 * The historical drift gate was:
 *
 *     before=$(ls drizzle/*.sql | wc -l)
 *     npx drizzle-kit generate --name=ci_drift_check
 *     after=$(ls drizzle/*.sql | wc -l)
 *     [ "$before" != "$after" ] && fail
 *
 * `drizzle-kit generate` on this repository prints
 *
 *     Error: [drizzle/meta/0038_snapshot.json, drizzle/meta/0039_snapshot.json]
 *     are pointing to a parent snapshot: … which is a collision.
 *
 * …and then EXITS 0 having generated nothing. The file count is unchanged, so
 * the gate prints "No schema drift." It never compared anything. That is failure
 * mode B (reports an error but exits successfully) compounded by D (depends on
 * metadata that is invalid), and it is why a real, live drift went undetected:
 * `payment_webhook_events_tenant_idx` is declared in `src/db/schema/payments.ts`
 * and appears in `drizzle/meta/0028_snapshot.json`, but no migration ever
 * creates it and it does not exist in any database.
 *
 * THE REPLACEMENT
 * ───────────────
 * Compare two measured snapshots, neither of which depends on the historical
 * `drizzle/meta` chain:
 *
 *   • `drizzle-kit pull`     → the schema the MIGRATIONS actually produce,
 *                              introspected from a real PostgreSQL that has had
 *                              every `drizzle/ *.sql` applied.
 *   • `drizzle-kit generate` → the schema `src/db/schema.ts` DECLARES, rendered
 *                              into the same snapshot format.
 *
 * Both are written to throwaway directories under `os.tmpdir()`. Nothing in the
 * repository — and specifically nothing in `drizzle/` — is read or written by
 * the comparison, so the gate cannot be satisfied by editing metadata.
 *
 * COMPARISON SURFACE (deliberate, not accidental)
 * ────────────────────────────────────────────────
 * Symmetric — both directions are drift:
 *   tables, columns (name/type/notNull), enums, unique constraints,
 *   composite primary keys.
 *
 * Asymmetric — "declared in schema.ts but absent from the database" is drift,
 * because that is the direction in which the application assumes something that
 * does not exist. The reverse is reported as informational: BEYU's hand-authored
 * integrity migrations legitimately add database-side objects the ORM does not
 * model (append-only hash-chain unique indexes such as
 * `audit_log_prev_hash_uidx`, `journal_entries_idempotency_uidx`). Treating
 * those as failures would bury the gate in permanent noise.
 *   indexes (by name + definition), foreign keys (matched by content, never by
 *   the auto-generated constraint name) and check constraints (matched by name —
 *   PostgreSQL rewrites their expressions, so expression text is not comparable).
 *
 * Excluded, with reasons — these are NOT gaps in enforcement:
 *   • RLS enablement and policies: applied by migration SQL, never declared in
 *     `src/db/schema.ts`. Row Level Security is verified directly against a real
 *     database by the tenant/entity/country isolation and RLS suites; asserting
 *     it here would only assert that the ORM does not model it.
 *   • Foreign-key NAMES: synthesised differently by introspection and by
 *     generation, so the name is ignored and the constraint is matched on its
 *     content (from-columns → to-table/columns) instead.
 *   • Check-constraint EXPRESSIONS: rewritten by PostgreSQL, as noted above.
 */

/** A drizzle snapshot's per-table shape, restricted to what this gate compares. */
interface SnapshotTable {
  name: string;
  columns?: Record<string, { name: string; type: string; notNull?: boolean }>;
  indexes?: Record<string, { name?: string; columns?: string[]; isUnique?: boolean }>;
  foreignKeys?: Record<
    string,
    { tableFrom?: string; tableTo?: string; columnsFrom?: string[]; columnsTo?: string[] }
  >;
  compositePrimaryKeys?: Record<string, unknown>;
  uniqueConstraints?: Record<string, unknown>;
  checkConstraints?: Record<string, { name?: string; value?: string }>;
}

export interface DrizzleSnapshot {
  tables?: Record<string, SnapshotTable>;
  enums?: Record<string, unknown>;
}

export type DriftDirection = "DECLARED_NOT_IN_DB" | "IN_DB_NOT_DECLARED";

export interface DriftDifference {
  kind: "table" | "column" | "index" | "foreignKey" | "checkConstraint" | "enum" | "uniqueConstraint" | "compositePrimaryKey";
  direction: DriftDirection;
  table: string;
  subject: string;
  detail: string;
}

export interface DriftComparison {
  dbTableCount: number;
  declaredTableCount: number;
  differences: DriftDifference[];
  /** Differences that fail the gate. */
  blocking: DriftDifference[];
  /** Database-side objects the ORM legitimately does not model. */
  informational: DriftDifference[];
}

/**
 * Tables that exist in the database but are intentionally absent from
 * `src/db/schema.ts`.
 *
 * `beyu_migrations` is the ledger `scripts/migrate.ts` creates and owns itself.
 * It is deliberately outside the Drizzle schema: the runner is the only writer,
 * and modelling it in the ORM would invite application code to write migration
 * state directly. This list is asserted verbatim by
 * `tests/migration/schema-drift.test.ts`, so an entry cannot be added without a
 * deliberate, reviewable change.
 */
export const DB_ONLY_TABLE_ALLOWLIST = ["beyu_migrations"] as const;

const norm = (key: string) => key.replace(/^public\./, "");

function indexSignature(v: { columns?: string[]; isUnique?: boolean }): string {
  return `${(v.columns ?? []).join(",")}|unique=${v.isUnique === true}`;
}

function fkSignature(v: { tableFrom?: string; tableTo?: string; columnsFrom?: string[]; columnsTo?: string[] }): string {
  return `${v.tableFrom ?? ""}[${(v.columnsFrom ?? []).join(",")}]→${v.tableTo ?? ""}[${(v.columnsTo ?? []).join(",")}]`;
}

function uniqueConstraintSignature(v: { name?: string; columns?: string[]; nullsNotDistinct?: boolean }): string {
  const name = v.name ?? "";
  const cols = (v.columns ?? []).join(",");
  const nulls = v.nullsNotDistinct === true ? "true" : "false";
  return `${name}|${cols}|nullsNotDistinct=${nulls}`;
}

/**
 * Compare the introspected database snapshot against the declared-schema
 * snapshot. Pure: no I/O, no database, no child process.
 */
export function compareSnapshots(dbSnapshot: DrizzleSnapshot, declaredSnapshot: DrizzleSnapshot): DriftComparison {
  const dbTables = Object.fromEntries(Object.entries(dbSnapshot.tables ?? {}).map(([k, v]) => [norm(k), v]));
  const declaredTables = Object.fromEntries(
    Object.entries(declaredSnapshot.tables ?? {}).map(([k, v]) => [norm(k), v]),
  );

  const differences: DriftDifference[] = [];
  const add = (d: DriftDifference) => differences.push(d);

  const allow = new Set<string>(DB_ONLY_TABLE_ALLOWLIST);

  // ── tables ────────────────────────────────────────────────────────────────
  for (const t of Object.keys(declaredTables)) {
    if (!dbTables[t])
      add({
        kind: "table",
        direction: "DECLARED_NOT_IN_DB",
        table: t,
        subject: t,
        detail: "src/db/schema declares this table but applying the migrations does not create it",
      });
  }
  for (const t of Object.keys(dbTables)) {
    if (!declaredTables[t] && !allow.has(t))
      add({
        kind: "table",
        direction: "IN_DB_NOT_DECLARED",
        table: t,
        subject: t,
        detail: "present in the migrated database but not declared in src/db/schema and not allowlisted",
      });
  }

  const shared = Object.keys(declaredTables).filter((t) => dbTables[t]);

  for (const t of shared) {
    const dbT = dbTables[t];
    const decT = declaredTables[t];

    // ── columns: symmetric ──────────────────────────────────────────────────
    const dbCols = Object.values(dbT.columns ?? {});
    const decCols = Object.values(decT.columns ?? {});
    const dbColByName = new Map(dbCols.map((c) => [c.name, c]));
    const decColByName = new Map(decCols.map((c) => [c.name, c]));

    for (const c of decCols) {
      const other = dbColByName.get(c.name);
      if (!other) {
        add({ kind: "column", direction: "DECLARED_NOT_IN_DB", table: t, subject: c.name, detail: "declared in src/db/schema, absent from the migrated database" });
        continue;
      }
      if (other.type !== c.type)
        add({ kind: "column", direction: "DECLARED_NOT_IN_DB", table: t, subject: c.name, detail: `type mismatch — database ${other.type}, declared ${c.type}` });
      if (Boolean(other.notNull) !== Boolean(c.notNull))
        add({
          kind: "column",
          direction: "DECLARED_NOT_IN_DB",
          table: t,
          subject: c.name,
          detail: `nullability mismatch — database notNull=${Boolean(other.notNull)}, declared notNull=${Boolean(c.notNull)}`,
        });
    }
    for (const c of dbCols) {
      if (!decColByName.has(c.name))
        add({ kind: "column", direction: "IN_DB_NOT_DECLARED", table: t, subject: c.name, detail: "present in the migrated database but not declared in src/db/schema" });
    }

    // ── indexes: declared-but-missing is drift ──────────────────────────────
    const dbIdx = new Map(Object.values(dbT.indexes ?? {}).map((v) => [v.name ?? "", v]));
    for (const v of Object.values(decT.indexes ?? {})) {
      const name = v.name ?? "";
      const other = dbIdx.get(name);
      if (!other)
        add({ kind: "index", direction: "DECLARED_NOT_IN_DB", table: t, subject: name, detail: "declared in src/db/schema but no migration creates it" });
      else if (indexSignature(other) !== indexSignature(v))
        add({
          kind: "index",
          direction: "DECLARED_NOT_IN_DB",
          table: t,
          subject: name,
          detail: `definition mismatch — database ${indexSignature(other)}, declared ${indexSignature(v)}`,
        });
    }
    for (const v of Object.values(dbT.indexes ?? {})) {
      const name = v.name ?? "";
      if (!Object.values(decT.indexes ?? {}).some((x) => (x.name ?? "") === name))
        add({ kind: "index", direction: "IN_DB_NOT_DECLARED", table: t, subject: name, detail: "created by migration SQL but not modelled in src/db/schema" });
    }

    // ── foreign keys: matched by content, never by synthesised name ─────────
    const dbFk = new Set(Object.values(dbT.foreignKeys ?? {}).map(fkSignature));
    for (const fk of Object.values(decT.foreignKeys ?? {})) {
      const sig = fkSignature(fk);
      if (!dbFk.has(sig))
        add({
          kind: "foreignKey",
          direction: "DECLARED_NOT_IN_DB",
          table: t,
          subject: sig,
          detail: "declared in src/db/schema but no migration creates an equivalent constraint",
        });
    }

    // ── check constraints: matched by NAME ──────────────────────────────────
    // BEYU names every check constraint explicitly in src/db/schema
    // (`check("ujenzi_projects_status_ck", sql`…`)`), so the name is the
    // meaningful identity. The EXPRESSION is not comparable: PostgreSQL rewrites
    // `status IN ('A','B')` into
    // `status = ANY (ARRAY['A'::text, 'B'::text])`, so an expression comparison
    // reports 17 phantom drifts against migrations that are in fact correct.
    const dbChecks = new Set(Object.values(dbT.checkConstraints ?? {}).map((c) => c.name ?? ""));
    for (const c of Object.values(decT.checkConstraints ?? {})) {
      if (!dbChecks.has(c.name ?? ""))
        add({
          kind: "checkConstraint",
          direction: "DECLARED_NOT_IN_DB",
          table: t,
          subject: c.name ?? "(unnamed)",
          detail: "declared in src/db/schema but no migration creates a constraint of that name",
        });
    }
    for (const c of Object.values(dbT.checkConstraints ?? {})) {
      if (!Object.values(decT.checkConstraints ?? {}).some((x) => (x.name ?? "") === (c.name ?? "")))
        add({
          kind: "checkConstraint",
          direction: "IN_DB_NOT_DECLARED",
          table: t,
          subject: c.name ?? "(unnamed)",
          detail: "created by migration SQL but not modelled in src/db/schema",
        });
    }

    // ── symmetric key/constraint sets ───────────────────────────────────────
    const dbPk = JSON.stringify(Object.keys(dbT.compositePrimaryKeys ?? {}).sort());
    const decPk = JSON.stringify(Object.keys(decT.compositePrimaryKeys ?? {}).sort());
    if (dbPk !== decPk)
      add({ kind: "compositePrimaryKey", direction: "DECLARED_NOT_IN_DB", table: t, subject: "composite PK", detail: `database ${dbPk}, declared ${decPk}` });

    // Unique constraints: compare by content signature ignoring JSON key order
    // drizzle-kit pull vs generate produce same constraint but with different key order
    // (e.g. {"columns":[...],"name":...} vs {"name":...,"columns":[...]}) — JSON.stringify would report false drift
    const dbUqSigs = new Set(Object.values(dbT.uniqueConstraints ?? {}).map((v: any) => uniqueConstraintSignature(v as any)));
    const decUqSigs = new Set(Object.values(decT.uniqueConstraints ?? {}).map((v: any) => uniqueConstraintSignature(v as any)));
    const dbUqSorted = [...dbUqSigs].sort().join(";");
    const decUqSorted = [...decUqSigs].sort().join(";");
    if (dbUqSorted !== decUqSorted) {
      const dbUqRaw = JSON.stringify(Object.values(dbT.uniqueConstraints ?? {}).sort());
      const decUqRaw = JSON.stringify(Object.values(decT.uniqueConstraints ?? {}).sort());
      add({ kind: "uniqueConstraint", direction: "DECLARED_NOT_IN_DB", table: t, subject: "unique constraints", detail: `database ${dbUqRaw}, declared ${decUqRaw} (normalized: ${dbUqSorted} vs ${decUqSorted})` });
    }
  }

  // ── enums: symmetric ────────────────────────────────────────────────────────
  const dbEnums = new Set(Object.keys(dbSnapshot.enums ?? {}));
  const decEnums = new Set(Object.keys(declaredSnapshot.enums ?? {}));
  for (const e of decEnums) if (!dbEnums.has(e)) add({ kind: "enum", direction: "DECLARED_NOT_IN_DB", table: "-", subject: e, detail: "declared in src/db/schema, absent from the migrated database" });
  for (const e of dbEnums) if (!decEnums.has(e)) add({ kind: "enum", direction: "IN_DB_NOT_DECLARED", table: "-", subject: e, detail: "present in the migrated database, not declared in src/db/schema" });

  // Database-side objects the ORM legitimately does not model are informational.
  const informationalKinds = new Set(["index", "foreignKey", "checkConstraint"]);
  const informational = differences.filter((d) => d.direction === "IN_DB_NOT_DECLARED" && informationalKinds.has(d.kind));
  const informationalSet = new Set(informational);
  const blocking = differences.filter((d) => !informationalSet.has(d));

  return {
    dbTableCount: Object.keys(dbTables).length,
    declaredTableCount: Object.keys(declaredTables).length,
    differences,
    blocking,
    informational,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Trusting a child process
// ─────────────────────────────────────────────────────────────────────────────

/** ANSI SGR sequences, so signatures can be matched against plain text. */
export const stripAnsi = (s: string): string => s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");

/**
 * Output signatures that mean the tool did NOT do what it was asked.
 *
 * The first entry is the entire reason P2 exists. `drizzle-kit generate` on this
 * repository prints `Error: … which is a collision.` and then EXITS 0 having
 * written nothing. A gate that trusts the exit code alone — or that merely
 * counts files before and after — reads that as success. Exit status is
 * therefore never trusted on its own.
 */
export const TOOL_FAILURE_SIGNATURES: ReadonlyArray<{ re: RegExp; why: string }> = [
  { re: /^\s*error\b/im, why: "the tool reported an error" },
  { re: /\bcollision\b/i, why: "snapshot parent collision" },
  { re: /\[✗\]/, why: "the tool marked a step as failed" },
  { re: /please provide required params/i, why: "tool configuration incomplete" },
  { re: /\bECONNREFUSED\b/, why: "could not reach the database" },
];

export interface ToolOutcome {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether an invocation succeeded from BOTH its exit code and its output,
 * and require the artifact it was supposed to produce.
 *
 * This is the fail-closed rule: an ambiguous or unverifiable result is a
 * failure, never a pass.
 */
export function assessToolOutcome(exitCode: number, output: string, producedArtifact: boolean): ToolOutcome {
  const text = stripAnsi(output);
  // Report EVERY matching signature, not just the first. The generic "an error
  // was printed" and the specific "snapshot parent collision" are both true of
  // the real output, and the specific one is what tells an operator what to fix.
  const hits = TOOL_FAILURE_SIGNATURES.filter((s) => s.re.test(text)).map((s) => s.why);
  if (hits.length > 0) return { ok: false, reason: `${hits.join("; ")} (exit code ${exitCode} — exit code alone is not trusted)` };
  if (exitCode !== 0) return { ok: false, reason: `exited with code ${exitCode}` };
  if (!producedArtifact) return { ok: false, reason: `exited 0 but produced no snapshot artifact` };
  return { ok: true };
}
