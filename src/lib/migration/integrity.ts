/**
 * BEYU OS — P2 migration integrity (canonical, DB-free).
 *
 * WHY THIS EXISTS
 * ───────────────
 * P2 forensics established three things from the repository itself:
 *
 *   1. At the P2 baseline (ae09d53) `drizzle/` held 45 hand-numbered SQL
 *      migrations (0000–0044), while `drizzle/meta/_journal.json` stopped at
 *      0039 and 8 of them had no snapshot at all. P2 added 0045; the metadata
 *      gap is unchanged and is registered in KNOWN_METADATA_DEBT below.
 *   2. `drizzle/meta/0038_snapshot.json` and `0039_snapshot.json` are
 *      BYTE-IDENTICAL (same sha256, same `id`, same `prevId`). drizzle-kit
 *      reports that as a snapshot-parent collision and then ABORTS before it
 *      computes any diff — while still exiting 0.
 *   3. The historical CI drift gate only compared `ls drizzle/*.sql | wc -l`
 *      before and after `drizzle-kit generate`. An aborted, error-printing,
 *      exit-0 run therefore read as "no schema drift".
 *
 * So the metadata is authoring-only scaffolding that has silently fallen behind
 * the SQL, and the gate that was supposed to catch it never ran a comparison.
 *
 * WHAT THIS MODULE IS
 * ───────────────────
 * A single deterministic source of truth for the migration inventory and its
 * reconciliation. It is pure and DB-free: it reads files and returns data. Both
 * the CI stage (`scripts/migration/integrity.ts`) and the regression suite
 * (`tests/migration/*.test.ts`) call THESE functions, so the test suite and the
 * pipeline can never disagree about what "integrity" means.
 *
 * WHAT THIS MODULE IS NOT
 * ───────────────────────
 * It is not a migration engine and not a runner. `scripts/migrate.ts` remains
 * the only supported way to APPLY migrations, and it is untouched by this
 * module: the runner reads `drizzle/ *.sql` directly and records progress in
 * the `beyu_migrations` ledger. Nothing here — and nothing in this repository —
 * consumes `drizzle/meta` at runtime.
 *
 * SECURITY NOTE
 * ─────────────
 * Migration state never grants authorization. This module asserts facts about
 * files; it confers no capability, and RLS remains the final data-isolation
 * boundary regardless of anything recorded here.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface MigrationFile {
  /** Full filename, e.g. `0044_admin_user_tenant_governance.sql`. */
  file: string;
  /** Version key used in the `beyu_migrations` ledger (filename minus `.sql`). */
  version: string;
  /** Zero-padded sequence token, e.g. `0044`. */
  seq: string;
  /** sha256 of the file bytes — the same checksum `scripts/migrate.ts` records. */
  checksum: string;
  /** Raw SQL, exactly as committed. */
  sql: string;
  byteLength: number;
}

export interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

export interface SnapshotRecord {
  /** Zero-padded sequence token matching the migration it claims to describe. */
  seq: string;
  file: string;
  id: string;
  prevId: string;
  tableCount: number;
  checksum: string;
}

export interface ReconciliationRow {
  seq: string;
  version: string;
  hasSql: boolean;
  inJournal: boolean;
  hasSnapshot: boolean;
  /** `null` when there is no ledger to compare against. */
  ledgerChecksumMatches: boolean | null;
  destructive: string[];
  classification: MigrationClassification;
}

export interface ReconciliationResult {
  rows: ReconciliationRow[];
  sqlCount: number;
  journalCount: number;
  snapshotCount: number;
  ledgerCount: number | null;
  /** Every discrepancy found, each machine-readable and human-legible. */
  issues: IntegrityIssue[];
}

export interface IntegrityIssue {
  code: IntegrityIssueCode;
  subject: string;
  detail: string;
  /**
   * `true` when the condition is already recorded in KNOWN_METADATA_DEBT.
   * Acknowledged issues are reported but do not fail the gate; unacknowledged
   * ones do. This is what stops the debt from growing silently.
   */
  acknowledged: boolean;
}

export type IntegrityIssueCode =
  | "SQL_NOT_IN_JOURNAL"
  | "SQL_WITHOUT_SNAPSHOT"
  | "JOURNAL_WITHOUT_SQL"
  | "SNAPSHOT_CHAIN_COLLISION"
  | "SNAPSHOT_ID_NOT_UNIQUE"
  | "JOURNAL_IDX_NOT_CONTIGUOUS"
  | "JOURNAL_TAG_ORDER_MISMATCH"
  | "LEDGER_MISSING_MIGRATION"
  | "LEDGER_CHECKSUM_MISMATCH"
  | "LEDGER_UNEXPECTED_MIGRATION";

// ─────────────────────────────────────────────────────────────────────────────
// The canonical drift model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * BEYU OS recognises exactly FOUR kinds of drift. Naming them matters, because
 * conflating them is what let the old gate be simultaneously green and useless.
 *
 *   A. MIGRATION SOURCE DRIFT
 *      The repository's migration files do not match the canonical inventory —
 *      a gap or duplicate in the sequence, a renamed file, a checksum that no
 *      longer matches what was recorded. Detected by `reconcile()` without a
 *      database. ALWAYS blocking: the source is the production authority.
 *
 *   B. DATABASE MIGRATION DRIFT
 *      The `beyu_migrations` ledger disagrees with the SQL source — a migration
 *      never applied, a recorded checksum that differs from the file, or a
 *      version recorded that the repository does not contain. Detected by
 *      `reconcile(dir, ledger)`. ALWAYS blocking.
 *
 *   C. SCHEMA DRIFT
 *      The database schema differs from the schema the canonical migrations are
 *      supposed to produce — an object `src/db/schema.ts` declares that no
 *      migration creates, or an unallowlisted object present only in the
 *      database. Detected by comparing two measured snapshots in
 *      `scripts/migration/schema-drift.ts`. ALWAYS blocking.
 *
 *   D. METADATA DRIFT
 *      `drizzle/meta` (the journal and snapshots) disagrees with migration and
 *      schema reality. **This is NOT production drift.** The metadata is
 *      design-time scaffolding for `drizzle-kit generate`; nothing at runtime
 *      consumes it. It is reported, registered in KNOWN_METADATA_DEBT, and
 *      blocked from growing — but it must never be allowed to redden a gate
 *      that is asserting production truth, and it must never be "repaired" by
 *      inventing content.
 *
 * AUTHORITY
 *   PRODUCTION MIGRATION AUTHORITY is `drizzle/ *.sql` + `beyu_migrations`.
 *   `drizzle/meta` is design-time metadata and is NOT authoritative merely
 *   because it exists. The 2026-09-07 commit 6e9f30b ("Rebuilt drizzle/meta with
 *   chained snapshots … 'drizzle-kit generate' now reports 'No schema changes'")
 *   is the documented precedent for hand-writing this metadata to satisfy a
 *   gate — precisely the failure mode this model separates out.
 */
export const DRIFT_MODEL = {
  A_MIGRATION_SOURCE: "repository migration files do not match the canonical inventory",
  B_DATABASE_MIGRATION: "beyu_migrations ledger disagrees with the SQL source",
  C_SCHEMA: "database schema differs from the schema the canonical migrations produce",
  D_METADATA: "drizzle/meta disagrees with migration/schema reality (design-time only, NOT production drift)",
} as const;

export type DriftClass = keyof typeof DRIFT_MODEL;

/** Which drift class each issue code belongs to. D-class issues are the only
 *  ones that may be acknowledged; A, B and C never are. */
export const ISSUE_DRIFT_CLASS: Record<IntegrityIssueCode, DriftClass> = {
  SQL_NOT_IN_JOURNAL: "D_METADATA",
  SQL_WITHOUT_SNAPSHOT: "D_METADATA",
  JOURNAL_WITHOUT_SQL: "D_METADATA",
  SNAPSHOT_CHAIN_COLLISION: "D_METADATA",
  SNAPSHOT_ID_NOT_UNIQUE: "D_METADATA",
  JOURNAL_IDX_NOT_CONTIGUOUS: "A_MIGRATION_SOURCE",
  JOURNAL_TAG_ORDER_MISMATCH: "A_MIGRATION_SOURCE",
  LEDGER_MISSING_MIGRATION: "B_DATABASE_MIGRATION",
  LEDGER_CHECKSUM_MISMATCH: "B_DATABASE_MIGRATION",
  LEDGER_UNEXPECTED_MIGRATION: "B_DATABASE_MIGRATION",
};



// ─────────────────────────────────────────────────────────────────────────────
// Known debt register
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The historical metadata debt, pinned from P2 forensics on
 * ae09d538e4acd5bba4769bfa8bb36f636a350094.
 *
 * These entries are ACKNOWLEDGED, not fixed, and the distinction matters:
 *
 *   • `drizzle/meta` is authoring metadata. Nothing in the repository consumes
 *     it at runtime — `scripts/migrate.ts` reads `drizzle/ *.sql` directly and
 *     keeps its own `beyu_migrations` ledger, and there is no
 *     `drizzle-orm/…/migrator` import anywhere. So this debt has no production
 *     data consequence.
 *   • It nonetheless cannot be "repaired" automatically and honestly. The
 *     snapshots for the migrations listed below were never generated at the
 *     time; synthesising them now would assert a schema state that was never
 *     captured. That is fabricated migration metadata, which P2 forbids.
 *   • The 0038/0039 pair proves the failure mode: someone already copied a
 *     snapshot forward to make the file count look right, and that copy is
 *     exactly what breaks `drizzle-kit generate` today.
 *
 * Enforcement model: the gate compares the ACTUAL discrepancy set against this
 * register. Anything in the register is reported as acknowledged debt; anything
 * NOT in it fails the build. A new migration therefore cannot quietly extend
 * the debt — adding one requires a deliberate, reviewable edit here.
 *
 * Safe remediation options are documented in
 * `docs/migration/P2_MIGRATION_INTEGRITY.md`; choosing between them is a
 * release-governance decision, not something this code should make silently.
 */
export const KNOWN_METADATA_DEBT = {
  /** Journaled migrations whose snapshot was never generated. */
  missingSnapshot: [
    "0018",
    "0021",
    "0029",
    "0040",
    "0041",
    "0042",
    "0043",
    "0044",
    // 0045 is registered here deliberately and visibly: it is a P2 corrective
    // migration, and P2 explicitly refuses to synthesise metadata that was never
    // generated. Adding it to this list is the reviewable act that says "this
    // gap is known and accepted", which is the difference between a pinned debt
    // register and silent rot.
    "0045",
    // 0046 is P3 release governance — additive, expand-only. P3 also refuses to
    // synthesise metadata that was never generated at authoring time. The gap
    // is acknowledged explicitly here, not hidden.
    "0046",
    // 0047 is P4 release approvals — additive, expand-only, same policy as 0046.
    "0047",
    // 0063 is the governed tenant-domain registry (Health OS tenant domains) —
    // additive, expand-only. It is registered here deliberately and visibly for
    // the same reason as 0045/0046/0047: the metadata gap is acknowledged and
    // reviewable rather than hidden, and no snapshot is fabricated. The journal
    // entry IS present, so only the snapshot is outstanding.
    "0063",
    // 0064 appends the CAPABILITY_BASE label to beyu_domain_type and 0065 records
    // the Family Office capability base domain on the governed registry. Both are
    // additive and expand-only; both are registered here for the same documented
    // reason as 0063 (journal entries present, no snapshot fabricated).
    "0064",
    "0065",
    // 0066 is the shared BEYU OS Search capability — native PostgreSQL full-text
    // search (trigger-maintained tsvector columns + GIN indexes on ten
    // already-RLS-protected tables). Additive and expand-only; registered here
    // for the same documented reason as 0063/0064/0065 (journal entry present,
    // no snapshot fabricated).
    "0066",
    // 0067 is the Holograph spatial capability registries (viz_assets,
    // viz_devices, viz_render_profiles, viz_interactions) — additive,
    // expand-only, RLS-bound, no destructive statement. Registered here for the
    // same documented reason as 0063/0064/0065/0066 (journal entry present, no
    // snapshot fabricated).
    "0067",
    // 0068 grants the constrained runtime role (beyu_runtime) the same DML
    // privileges 0062 granted on the original visualization tables, extended
    // to the four Holograph registries. Pure GRANT + verification — no DDL on
    // data, no RLS weakening; the 0067 tenant-isolation policies remain the
    // boundary.
    "0068",
    // 0069 closes the Foundation OS Row Level Security gap on
    // `foundation_programs` — the one Foundation substrate created by the 0000
    // kernel baseline and therefore missed by 0035's RLS block, which
    // enumerated only the 39 tables it created. It is a single
    // ENABLE ROW LEVEL SECURITY + the canonical beyu_tenant_ids() policy + a
    // supporting tenant index + a runtime-role grant assertion. It is additive
    // and expand-only, creates no table and alters no column, so it produces no
    // table-level schema state for a snapshot to capture. Registered here for
    // the same documented reason as 0063–0068: the journal entry IS present and
    // the gap is acknowledged and reviewable, not hidden.
    "0069",
    // 0070 inserts the UJENZI_OS service-principal registry row (one
    // idempotent INSERT, no DDL, no RLS change). It creates no table and
    // alters no column, so it produces no table-level schema state for a
    // snapshot to capture. Registered here for the same documented reason as
    // 0063–0069: the journal entry IS present and the gap is acknowledged and
    // reviewable, not hidden; no snapshot is fabricated.
    "0070",
  ] as string[],
  /** Journal inventory reconciled through 0048 on 2026-09-20.
   * Historical snapshots remain absent; no fabricated backdated snapshots. */
  missingJournal: [] as string[],
  /** Snapshots that are byte-identical copies of their predecessor. */
  chainCollision: ["0039"] as string[],
} as const;

/**
 * Migration 0001 is the ONLY genuinely destructive migration in the
 * repository's history. Verified by scanning every committed `drizzle/ *.sql`
 * file: it issues `TRUNCATE TABLE audit_log` and
 * `TRUNCATE TABLE enterprise_events` to discard pre-hardening candidate forks.
 *
 * It is registered here — not rewritten — because `scripts/migrate.ts` already
 * refuses to run it against a non-empty schema, and that guard must stay.
 * Classification is forward-looking enforcement; history is left intact.
 */
export const HISTORICAL_DESTRUCTIVE_MIGRATIONS = ["0001_kernel_gate1_hardening"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SQL normalisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remove what is not executable DDL before pattern matching.
 *
 * Two classes of false positive motivated this, both real and both found in the
 * committed migrations:
 *
 *   • `drizzle/0008_…sql` contains the WORD "TRUNCATE" inside a doc comment and
 *     inside `CREATE TRIGGER … BEFORE TRUNCATE …`, whose entire purpose is to
 *     PREVENT truncation. A naive `/\btruncate\b/i` scan — which is what
 *     `scripts/db-release.ts` shipped with — flags it as destructive.
 *   • `drizzle/0043_ujenzi_os.sql` contains
 *     `EXECUTE format('DROP POLICY IF EXISTS %I ON %I', …)` inside a PL/pgSQL
 *     function body. That is a parameterised identifier, not a named policy, so
 *     it can never be paired with a `CREATE POLICY` and must not be read as a
 *     contraction of a specific policy.
 *
 * Comments and dollar-quoted function bodies are therefore stripped for
 * STRUCTURAL analysis (pairing, classification). Destructive scanning keeps the
 * full text minus comments, so a guard clause cannot hide a real TRUNCATE.
 */
export function stripSqlComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");
}

/** Additionally remove `$$ … $$` bodies: function/trigger definitions, not DDL. */
export function stripSqlForStructure(sql: string): string {
  return stripSqlComments(sql).replace(/\$\$[\s\S]*?\$\$/g, " ");
}

/**
 * Remove single-quoted string literals (Postgres doubles an embedded quote).
 *
 * Needed because BEYU's guard functions legitimately NAME destructive operations
 * in their error text. `drizzle/0008_…sql` raises
 * `'… ledgers are append-only: TRUNCATE is not allowed on %'` — a migration whose
 * entire purpose is to make truncation impossible reads as a TRUNCATE to a
 * scanner that matches anywhere in the file.
 *
 * Documented limitation: a destructive keyword hidden inside a dynamic-SQL string
 * (`EXECUTE 'TRUNCATE x'`) is not inspected. That trade is deliberate — the
 * alternative flags real protective migrations, which trains reviewers to reach
 * for `--allow-destructive` and defeats the gate. No committed migration uses
 * dynamic destructive SQL; `tests/migration/expand-contract.test.ts` pins the
 * closest real case (0043's parameterised `DROP POLICY`) as a non-match.
 */
export function stripSqlStrings(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/** Matches a possibly double-quoted Postgres identifier. */
const IDENT = '"?[A-Za-z0-9_]+"?';
const unquote = (s: string) => s.replace(/"/g, "");

// ─────────────────────────────────────────────────────────────────────────────
// Destructive-operation scanning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Operations that destroy or irreversibly transform state.
 *
 * `TRUNCATE` deliberately uses a negative lookahead rather than a bare word
 * match so that `BEFORE TRUNCATE ON …` trigger *events* (a protection) are not
 * reported as destruction, while `TRUNCATE TABLE audit_log` still is.
 */
export const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ re: RegExp; label: string }> = [
  { re: /\bdrop\s+database\b/i, label: "DROP DATABASE" },
  { re: /\bdrop\s+schema\b/i, label: "DROP SCHEMA" },
  { re: /\bdrop\s+table\b/i, label: "DROP TABLE" },
  { re: /\bdrop\s+column\b/i, label: "DROP COLUMN" },
  { re: /\btruncate\b(?!\s+on\b)/i, label: "TRUNCATE" },
  { re: /\bdrop\s+owned\b/i, label: "DROP OWNED" },
  { re: /\bgrant\s+[^;]*\bsuperuser\b/i, label: "GRANT SUPERUSER" },
  { re: /\bgrant\s+[^;]*\bbypassrls\b/i, label: "GRANT BYPASSRLS" },
  // `ALTER ROLE … SUPERUSER|BYPASSRLS` escalates exactly as effectively as a
  // GRANT, and the pre-P2 scanner matched only the GRANT spelling — so a
  // migration could have switched off RLS enforcement for the runtime role
  // without tripping any gate. `\bsuperuser\b` deliberately does NOT match
  // `NOSUPERUSER`/`NOBYPASSRLS` (no word boundary inside those tokens), so the
  // legitimate hardening direction stays quiet.
  { re: /\balter\s+(?:role|user)\b[^;]*\bsuperuser\b/i, label: "ALTER ROLE SUPERUSER" },
  { re: /\balter\s+(?:role|user)\b[^;]*\bbypassrls\b/i, label: "ALTER ROLE BYPASSRLS" },
  { re: /\balter\s+system\b/i, label: "ALTER SYSTEM" },
];

/** Returns the destructive labels present in `sql`, or `[]` when there are none. */
export function scanDestructive(sql: string): string[] {
  const body = stripSqlStrings(stripSqlComments(sql));
  return DESTRUCTIVE_PATTERNS.filter((p) => p.re.test(body)).map((p) => p.label);
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand / Contract classification
// ─────────────────────────────────────────────────────────────────────────────

export type ContractReason =
  | "DROP_TABLE"
  | "DROP_COLUMN"
  | "TRUNCATE"
  | "RENAME_COLUMN"
  | "RENAME_TABLE"
  | "SET_NOT_NULL"
  | "ALTER_COLUMN_TYPE"
  | "DROP_CONSTRAINT_NOT_REPLACED"
  | "DROP_POLICY_NOT_REPLACED"
  | "DROP_DATABASE"
  | "DROP_SCHEMA";

export type ExpandReason = "CREATE_TABLE" | "ADD_COLUMN" | "CREATE_INDEX" | "ADD_CONSTRAINT" | "CREATE_POLICY" | "ENABLE_RLS";

export interface MigrationClassification {
  /**
   * `EXPAND`  — safe to apply while the currently deployed release is running.
   * `CONTRACT` — removes or narrows something an older release may still use.
   */
  verdict: "EXPAND" | "CONTRACT";
  expand: ExpandReason[];
  contract: ContractReason[];
}

/**
 * Classify a migration against the BEYU Expand/Contract invariant:
 *
 *   the new schema must stay compatible with the CURRENT release and the NEXT
 *   release for the whole expansion window.
 *
 * Two patterns recur throughout the real history and are explicitly NOT
 * contraction, because treating them as such would make the gate useless noise:
 *
 *   • `DROP POLICY IF EXISTS x; CREATE POLICY x …` — the idempotent RLS
 *     re-declaration used by nearly every BEYU migration. The policy is
 *     restored in the same migration, so no reader loses its isolation rule.
 *     Only a DROP with no matching CREATE is a contraction.
 *   • `ALTER TABLE t DROP CONSTRAINT c; ALTER TABLE t ADD CONSTRAINT c …` —
 *     constraint re-declaration/tightening (0005, 0017). Same reasoning.
 *
 * Both are matched on the identifier, and identifiers are matched quoted or
 * unquoted: drizzle-generated migrations quote them (`DROP POLICY IF EXISTS
 * "x"`), hand-authored ones do not (`DROP POLICY IF EXISTS x`). A scanner that
 * only handled one style silently mis-parsed the other.
 */
export function classifyMigration(sql: string): MigrationClassification {
  const body = stripSqlStrings(stripSqlForStructure(sql));
  const expand: ExpandReason[] = [];
  const contract: ContractReason[] = [];
  const has = (re: RegExp) => re.test(body);

  if (has(/\bcreate\s+table\b/i)) expand.push("CREATE_TABLE");
  if (has(/\badd\s+column\b/i)) expand.push("ADD_COLUMN");
  if (has(/\bcreate\s+(?:unique\s+)?index\b/i)) expand.push("CREATE_INDEX");
  if (has(/\badd\s+constraint\b/i)) expand.push("ADD_CONSTRAINT");
  if (has(/\bcreate\s+policy\b/i)) expand.push("CREATE_POLICY");
  if (has(/\benable\s+row\s+level\s+security\b/i)) expand.push("ENABLE_RLS");

  if (has(/\bdrop\s+table\b/i)) contract.push("DROP_TABLE");
  if (has(/\bdrop\s+column\b/i)) contract.push("DROP_COLUMN");
  if (has(/\btruncate\b(?!\s+on\b)/i)) contract.push("TRUNCATE");
  if (has(/\brename\s+column\b/i)) contract.push("RENAME_COLUMN");
  if (has(/\brename\s+to\b/i)) contract.push("RENAME_TABLE");
  if (has(/\bset\s+not\s+null\b/i)) contract.push("SET_NOT_NULL");
  if (has(/\balter\s+column\b[\s\S]{0,120}?\btype\s+/i)) contract.push("ALTER_COLUMN_TYPE");
  if (has(/\bdrop\s+database\b/i)) contract.push("DROP_DATABASE");
  if (has(/\bdrop\s+schema\b/i)) contract.push("DROP_SCHEMA");

  const createdPolicies = new Set(
    [...body.matchAll(new RegExp(`create\\s+policy\\s+(${IDENT})`, "gi"))].map((m) => unquote(m[1])),
  );
  const droppedPolicies = [...body.matchAll(new RegExp(`drop\\s+policy\\s+(?:if\\s+exists\\s+)?(${IDENT})`, "gi"))].map((m) =>
    unquote(m[1]),
  );
  if (droppedPolicies.some((p) => !createdPolicies.has(p))) contract.push("DROP_POLICY_NOT_REPLACED");

  const createdConstraints = new Set(
    [...body.matchAll(new RegExp(`add\\s+constraint\\s+(${IDENT})`, "gi"))].map((m) => unquote(m[1])),
  );
  const droppedConstraints = [...body.matchAll(new RegExp(`drop\\s+constraint\\s+(?:if\\s+exists\\s+)?(${IDENT})`, "gi"))].map((m) =>
    unquote(m[1]),
  );
  if (droppedConstraints.some((c) => !createdConstraints.has(c))) contract.push("DROP_CONSTRAINT_NOT_REPLACED");

  return { verdict: contract.length > 0 ? "CONTRACT" : "EXPAND", expand, contract };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory readers
// ─────────────────────────────────────────────────────────────────────────────

const MIGRATION_FILE_RE = /^\d+_.*\.sql$/;

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function seqOf(name: string): string {
  return name.split("_")[0];
}

/** Every canonical SQL migration, in the exact order `scripts/migrate.ts` applies them. */
export function readMigrationFiles(drizzleDir: string): MigrationFile[] {
  return readdirSync(drizzleDir)
    .filter((f) => MIGRATION_FILE_RE.test(f))
    .sort()
    .map((file) => {
      const sql = readFileSync(join(drizzleDir, file), "utf8");
      return {
        file,
        version: file.replace(/\.sql$/, ""),
        seq: seqOf(file),
        checksum: sha256(sql),
        sql,
        byteLength: Buffer.byteLength(sql, "utf8"),
      };
    });
}

export function readJournal(drizzleDir: string): JournalEntry[] {
  const p = join(drizzleDir, "meta", "_journal.json");
  if (!existsSync(p)) return [];
  const raw = JSON.parse(readFileSync(p, "utf8")) as { entries?: Array<Record<string, unknown>> };
  return (raw.entries ?? []).map((e) => ({
    idx: Number(e.idx),
    version: String(e.version),
    when: Number(e.when),
    tag: String(e.tag),
    breakpoints: Boolean(e.breakpoints),
  }));
}

export function readSnapshots(drizzleDir: string): SnapshotRecord[] {
  const metaDir = join(drizzleDir, "meta");
  if (!existsSync(metaDir)) return [];
  return readdirSync(metaDir)
    .filter((f) => /^\d+_snapshot\.json$/.test(f))
    .sort()
    .map((file) => {
      const text = readFileSync(join(metaDir, file), "utf8");
      const j = JSON.parse(text) as { id?: string; prevId?: string; tables?: Record<string, unknown> };
      return {
        seq: file.replace("_snapshot.json", ""),
        file,
        id: String(j.id ?? ""),
        prevId: String(j.prevId ?? ""),
        tableCount: Object.keys(j.tables ?? {}).length,
        checksum: sha256(text),
      };
    });
}

export interface LedgerRow {
  version: string;
  checksum: string;
  mode: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation
// ─────────────────────────────────────────────────────────────────────────────

function isAcknowledged(code: IntegrityIssueCode, subject: string): boolean {
  // Only D-class (metadata) drift may ever be acknowledged. A, B and C are
  // assertions about the production authority — the SQL source, the ledger and
  // the resulting schema — and no register entry can make them optional.
  if (ISSUE_DRIFT_CLASS[code] !== "D_METADATA") return false;
  switch (code) {
    case "SQL_WITHOUT_SNAPSHOT":
      return KNOWN_METADATA_DEBT.missingSnapshot.includes(seqOf(subject));
    case "SQL_NOT_IN_JOURNAL":
      return KNOWN_METADATA_DEBT.missingJournal.includes(subject);
    case "SNAPSHOT_CHAIN_COLLISION":
    case "SNAPSHOT_ID_NOT_UNIQUE":
      return KNOWN_METADATA_DEBT.chainCollision.includes(seqOf(subject));
    default:
      return false;
  }
}

/**
 * Build the deterministic reconciliation matrix: SQL vs journal vs snapshots vs
 * (optionally) the `beyu_migrations` ledger.
 *
 * `ledger` is optional so the same reconciliation runs DB-free in unit tests and
 * against a real database in the pipeline.
 */
export function reconcile(drizzleDir: string, ledger?: LedgerRow[]): ReconciliationResult {
  const files = readMigrationFiles(drizzleDir);
  const journal = readJournal(drizzleDir);
  const snapshots = readSnapshots(drizzleDir);

  const journalByTag = new Map(journal.map((e) => [e.tag, e]));
  const snapshotBySeq = new Map(snapshots.map((s) => [s.seq, s]));
  const ledgerByVersion = new Map((ledger ?? []).map((r) => [r.version, r]));

  const issues: IntegrityIssue[] = [];
  const push = (code: IntegrityIssueCode, subject: string, detail: string) =>
    issues.push({ code, subject, detail, acknowledged: isAcknowledged(code, subject) });

  const rows: ReconciliationRow[] = files.map((m) => {
    const inJournal = journalByTag.has(m.version);
    const hasSnapshot = snapshotBySeq.has(m.seq);
    const ledgerRow = ledger ? ledgerByVersion.get(m.version) : undefined;

    if (!inJournal) push("SQL_NOT_IN_JOURNAL", m.version, `${m.file} has no _journal.json entry`);
    if (!hasSnapshot) push("SQL_WITHOUT_SNAPSHOT", m.seq, `${m.file} has no meta/${m.seq}_snapshot.json`);
    if (ledger && !ledgerRow) push("LEDGER_MISSING_MIGRATION", m.version, `${m.version} is not recorded in beyu_migrations`);
    if (ledger && ledgerRow && ledgerRow.checksum !== m.checksum)
      push(
        "LEDGER_CHECKSUM_MISMATCH",
        m.version,
        `recorded checksum ${ledgerRow.checksum.slice(0, 12)}… != file checksum ${m.checksum.slice(0, 12)}…`,
      );

    return {
      seq: m.seq,
      version: m.version,
      hasSql: true,
      inJournal,
      hasSnapshot,
      ledgerChecksumMatches: ledger ? (ledgerRow ? ledgerRow.checksum === m.checksum : null) : null,
      destructive: scanDestructive(m.sql),
      classification: classifyMigration(m.sql),
    };
  });

  // Journal entries pointing at SQL that does not exist would make the runner
  // and the metadata describe different histories.
  for (const e of journal) {
    if (!files.some((m) => m.version === e.tag))
      push("JOURNAL_WITHOUT_SQL", e.tag, `_journal.json idx ${e.idx} references ${e.tag}.sql, which is absent`);
  }

  // The journal must be contiguous from 0 and must agree with the file order,
  // otherwise "ordered history" is an assumption rather than a property.
  journal.forEach((e, i) => {
    if (e.idx !== i)
      push("JOURNAL_IDX_NOT_CONTIGUOUS", e.tag, `journal idx ${e.idx} appears at position ${i}`);
    if (files[i] && files[i].version !== e.tag)
      push("JOURNAL_TAG_ORDER_MISMATCH", e.tag, `journal position ${i} is ${e.tag} but the ${i}th SQL file is ${files[i].version}`);
  });

  // Snapshot chain integrity. A duplicated id, or two snapshots claiming the
  // same parent, is precisely what makes `drizzle-kit generate` abort.
  const seenIds = new Map<string, string>();
  snapshots.forEach((s, i) => {
    if (seenIds.has(s.id))
      push("SNAPSHOT_ID_NOT_UNIQUE", s.seq, `${s.file} reuses snapshot id ${s.id} already used by ${seenIds.get(s.id)}`);
    else seenIds.set(s.id, s.file);

    const prev = i > 0 ? snapshots[i - 1] : undefined;
    if (prev && s.prevId !== prev.id)
      push(
        "SNAPSHOT_CHAIN_COLLISION",
        s.seq,
        `${s.file} prevId ${s.prevId.slice(0, 12)}… does not chain from ${prev.file} id ${prev.id.slice(0, 12)}…`,
      );
    if (prev && s.checksum === prev.checksum)
      push(
        "SNAPSHOT_CHAIN_COLLISION",
        s.seq,
        `${s.file} is byte-identical to ${prev.file} — a copied snapshot, not a generated one`,
      );
  });

  if (ledger) {
    const fileVersions = new Set(files.map((m) => m.version));
    for (const r of ledger)
      if (!fileVersions.has(r.version))
        push("LEDGER_UNEXPECTED_MIGRATION", r.version, `${r.version} is recorded in beyu_migrations but has no SQL file`);
  }

  return {
    rows,
    sqlCount: files.length,
    journalCount: journal.length,
    snapshotCount: snapshots.length,
    ledgerCount: ledger ? ledger.length : null,
    issues,
  };
}

/** Issues that are not covered by KNOWN_METADATA_DEBT — i.e. what fails the build. */
export function blockingIssues(result: ReconciliationResult): IntegrityIssue[] {
  return result.issues.filter((i) => !i.acknowledged);
}

/** Render the reconciliation matrix for logs and CI annotations. */
export function formatMatrix(result: ReconciliationResult): string {
  const head = ["seq", "sql", "journal", "snap", "ledger", "checksum", "class", "destructive"];
  const lines = [head.join(" | ")];
  for (const r of result.rows) {
    lines.push(
      [
        r.seq,
        r.hasSql ? "Y" : "-",
        r.inJournal ? "Y" : "-",
        r.hasSnapshot ? "Y" : "-",
        r.ledgerChecksumMatches === null ? "n/a" : "Y",
        r.ledgerChecksumMatches === null ? "n/a" : r.ledgerChecksumMatches ? "ok" : "DRIFT",
        r.classification.verdict,
        r.destructive.join("+") || "-",
      ].join(" | "),
    );
  }
  return lines.join("\n");
}
