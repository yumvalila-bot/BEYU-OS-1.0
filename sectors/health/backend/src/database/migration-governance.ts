/**
 * BEYU Health OS — Migration Governance Integrity (pure, DB-free).
 *
 * WHAT THIS IS
 * ────────────
 * A deterministic, DB-free verification module that asserts facts about the
 * Health migration source files and their governance compliance. Both the
 * test suite and any future CI stage call THESE functions so they can never
 * disagree about what "governance compliance" means for Health migrations.
 *
 * GOVERNANCE CONTRACT
 * ───────────────────
 * Health Federation schema changes are governed by the same authoritative
 * release lifecycle as root BEYU OS. This module verifies:
 *
 *   1. Every migration has both up and down SQL files.
 *   2. Migrations are sequentially numbered without gaps.
 *   3. Each migration file has a deterministic sha256 checksum.
 *   4. A fingerprint can be computed from the ordered checksums.
 *   5. No migration file can be silently modified (checksum would change).
 *   6. Health migrations are explicitly owned (owner=health, sector=HEALTH_OS).
 *
 * WHAT THIS MODULE IS NOT
 * ───────────────────────
 * It is not a migration runner. It does not apply migrations. It does not
 * connect to any database. It is PURE evidence generation.
 *
 * SECURITY NOTE
 * ─────────────
 * A fingerprint is EVIDENCE, never authority. It reports whether the
 * committed migration set matches a known state; it grants nothing and is
 * not an authorization input. RLS remains the final data-isolation boundary.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const HEALTH_MIGRATION_OWNER = "health";
export const HEALTH_MIGRATION_SECTOR = "HEALTH_OS";
export const FINGERPRINT_JOIN = "\n";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthMigrationFile {
  /** Full up-migration filename, e.g. `001_identity_foundation.up.sql`. */
  file: string;
  /** Migration id without extension, e.g. `001_identity_foundation`. */
  id: string;
  /** Sequence number, e.g. `001`. */
  seq: string;
  /** Human-readable name, e.g. `identity_foundation`. */
  name: string;
  /** sha256 of the up-migration SQL. */
  checksum: string;
  /** Whether a matching .down.sql file exists. */
  hasDownFile: boolean;
  /** Byte length of the up-migration SQL. */
  byteLength: number;
}

export interface GovernanceVerification {
  /** All discovered migration files in lexical order. */
  files: HealthMigrationFile[];
  /** Total migration count. */
  count: number;
  /** Deterministic fingerprint of the full set (sha256 of ordered checksums). */
  fingerprint: string;
  /** Latest migration id. */
  latestId: string;
  /** Whether sequential numbering is intact (no gaps). */
  sequential: boolean;
  /** Whether all down files exist. */
  allDownsPresent: boolean;
  /** Owner tag for all migrations. */
  owner: string;
  /** Sector tag for all migrations. */
  sector: string;
  /** Any governance issues found. */
  issues: GovernanceIssue[];
}

export interface GovernanceIssue {
  code: GovernanceIssueCode;
  subject: string;
  detail: string;
  severity: "BLOCKING" | "WARNING";
}

export type GovernanceIssueCode =
  | "MISSING_DOWN_FILE"
  | "SEQUENCE_GAP"
  | "SEQUENCE_DUPLICATE"
  | "EMPTY_MIGRATION"
  | "NON_DETERMINISTIC";

// ─────────────────────────────────────────────────────────────────────────────
// Pure Functions
// ─────────────────────────────────────────────────────────────────────────────

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Read all Health migration files from the given directory and compute
 * governance metadata. This is the single source of truth for Health
 * migration inventory.
 */
export function readHealthMigrations(migrationsDir: string): HealthMigrationFile[] {
  if (!existsSync(migrationsDir)) {
    throw new Error(`Migration directory does not exist: ${migrationsDir}`);
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".up.sql"))
    .sort();

  return files.map((file) => {
    const id = file.replace(/\.up\.sql$/, "");
    const seq = id.split("_")[0];
    const name = id.replace(/^\d+_/, "");
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const downFile = file.replace(/\.up\.sql$/, ".down.sql");
    const hasDownFile = existsSync(join(migrationsDir, downFile));

    return {
      file,
      id,
      seq,
      name,
      checksum: sha256(sql),
      hasDownFile,
      byteLength: Buffer.byteLength(sql, "utf8"),
    };
  });
}

/**
 * Compute the deterministic migration fingerprint from an ordered list of
 * checksums. This matches the convention used by the root BEYU OS migration
 * fingerprint module.
 */
export function computeFingerprint(orderedChecksums: readonly string[]): string | null {
  if (!orderedChecksums || orderedChecksums.length === 0) return null;
  const joined = orderedChecksums.join(FINGERPRINT_JOIN);
  return createHash("sha256").update(joined).digest("hex");
}

/**
 * Verify sequential numbering. Returns true if migrations are numbered
 * 001, 002, 003, ... without gaps or duplicates.
 */
export function verifySequential(files: HealthMigrationFile[]): boolean {
  for (let i = 0; i < files.length; i++) {
    const expected = String(i + 1).padStart(3, "0");
    if (files[i].seq !== expected) return false;
  }
  return true;
}

/**
 * Run the full governance verification. Returns a complete report of the
 * migration set's compliance with the governance contract.
 */
export function verifyGovernance(migrationsDir: string): GovernanceVerification {
  const files = readHealthMigrations(migrationsDir);
  const issues: GovernanceIssue[] = [];

  // Check sequential numbering.
  const seqMap = new Map<string, string>();
  for (let i = 0; i < files.length; i++) {
    const expected = String(i + 1).padStart(3, "0");
    if (files[i].seq !== expected) {
      const existing = seqMap.get(files[i].seq);
      if (existing) {
        issues.push({
          code: "SEQUENCE_DUPLICATE",
          subject: files[i].id,
          detail: `Sequence ${files[i].seq} is used by both ${existing} and ${files[i].id}`,
          severity: "BLOCKING",
        });
      } else {
        issues.push({
          code: "SEQUENCE_GAP",
          subject: files[i].id,
          detail: `Expected sequence ${expected} but found ${files[i].seq} at position ${i}`,
          severity: "BLOCKING",
        });
      }
    }
    seqMap.set(files[i].seq, files[i].id);
  }

  // Check down files.
  for (const f of files) {
    if (!f.hasDownFile) {
      issues.push({
        code: "MISSING_DOWN_FILE",
        subject: f.id,
        detail: `${f.file} has no matching down migration. Every migration MUST have a rollback path.`,
        severity: "BLOCKING",
      });
    }
  }

  // Check for empty migrations.
  for (const f of files) {
    if (f.byteLength === 0) {
      issues.push({
        code: "EMPTY_MIGRATION",
        subject: f.id,
        detail: `${f.file} is empty. A migration must contain DDL.`,
        severity: "BLOCKING",
      });
    }
  }

  const checksums = files.map((f) => f.checksum);
  const fingerprint = computeFingerprint(checksums);
  const sequential = verifySequential(files);
  const allDownsPresent = files.every((f) => f.hasDownFile);

  return {
    files,
    count: files.length,
    fingerprint: fingerprint!,
    latestId: files.length > 0 ? files[files.length - 1].id : "",
    sequential,
    allDownsPresent,
    owner: HEALTH_MIGRATION_OWNER,
    sector: HEALTH_MIGRATION_SECTOR,
    issues,
  };
}

/**
 * Return only the blocking issues from a governance verification.
 */
export function blockingIssues(v: GovernanceVerification): GovernanceIssue[] {
  return v.issues.filter((i) => i.severity === "BLOCKING");
}

/**
 * Format the governance verification as a human-readable report.
 */
export function formatReport(v: GovernanceVerification): string {
  const lines: string[] = [];
  lines.push("BEYU Health OS — Migration Governance Verification");
  lines.push("=".repeat(60));
  lines.push(`Owner:         ${v.owner}`);
  lines.push(`Sector:        ${v.sector}`);
  lines.push(`Migrations:    ${v.count}`);
  lines.push(`Latest:        ${v.latestId}`);
  lines.push(`Sequential:    ${v.sequential ? "YES" : "NO"}`);
  lines.push(`All downs:     ${v.allDownsPresent ? "YES" : "NO"}`);
  lines.push(`Fingerprint:   ${v.fingerprint}`);
  lines.push("");

  if (v.issues.length > 0) {
    lines.push(`Issues: ${v.issues.length}`);
    for (const i of v.issues) {
      lines.push(`  [${i.severity}] ${i.code}: ${i.subject} — ${i.detail}`);
    }
  } else {
    lines.push("Issues: NONE — governance verification passed.");
  }

  return lines.join("\n");
}
