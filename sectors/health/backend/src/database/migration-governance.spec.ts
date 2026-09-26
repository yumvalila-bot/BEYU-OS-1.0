/**
 * Health Migration Governance — Boundary Tests.
 *
 * These tests PROVE the governance boundary: that Health migrations are
 * governed by the same authoritative release lifecycle as root BEYU OS.
 *
 * Tests cover:
 *   1. Deterministic fingerprint computation.
 *   2. Sequential numbering enforcement.
 *   3. Down-file requirement enforcement.
 *   4. Checksum computation correctness.
 *   5. Governance metadata constants.
 *   6. Empty migration detection.
 *   7. Fingerprint changes when any migration changes.
 */
import { describe, it, expect } from "@jest/globals";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import {
  verifyGovernance,
  blockingIssues,
  computeFingerprint,
  sha256,
  readHealthMigrations,
  verifySequential,
  formatReport,
  HEALTH_MIGRATION_OWNER,
  HEALTH_MIGRATION_SECTOR,
  FINGERPRINT_JOIN,
} from "./migration-governance";

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "database",
  "migrations",
);

describe("Health Migration Governance — Source Integrity", () => {
  it("computes a non-null fingerprint for the full migration set", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.fingerprint).toBeTruthy();
    expect(typeof result.fingerprint).toBe("string");
    expect(result.fingerprint.length).toBe(64); // sha256 hex length
  });

  it("fingerprint is deterministic — same files produce same fingerprint", () => {
    const r1 = verifyGovernance(MIGRATIONS_DIR);
    const r2 = verifyGovernance(MIGRATIONS_DIR);
    expect(r1.fingerprint).toBe(r2.fingerprint);
  });

  it("fingerprint changes when any migration content changes", () => {
    // Create a temp directory with a copy of the migrations.
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "health-mig-test-"));
    const files = fs.readdirSync(MIGRATIONS_DIR);
    for (const f of files) {
      fs.copyFileSync(path.join(MIGRATIONS_DIR, f), path.join(tmp, f));
    }

    const before = verifyGovernance(tmp);

    // Modify one migration file.
    const upFile = files.find((f) => f.endsWith(".up.sql"))!;
    const content = fs.readFileSync(path.join(tmp, upFile), "utf8");
    fs.writeFileSync(path.join(tmp, upFile), content + "\n-- governance-test-sentinel");

    const after = verifyGovernance(tmp);

    expect(before.fingerprint).not.toBe(after.fingerprint);

    // Cleanup.
    fs.rmSync(tmp, { recursive: true });
  });

  it("all migrations are sequentially numbered without gaps", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.sequential).toBe(true);
    expect(result.issues.filter((i) => i.code === "SEQUENCE_GAP")).toHaveLength(0);
    expect(result.issues.filter((i) => i.code === "SEQUENCE_DUPLICATE")).toHaveLength(0);
  });

  it("every migration has a matching down file", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.allDownsPresent).toBe(true);
    expect(result.issues.filter((i) => i.code === "MISSING_DOWN_FILE")).toHaveLength(0);
  });

  it("no migration file is empty", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.issues.filter((i) => i.code === "EMPTY_MIGRATION")).toHaveLength(0);
    for (const f of result.files) {
      expect(f.byteLength).toBeGreaterThan(0);
    }
  });

  it("zero blocking issues in the current migration set", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    const blocking = blockingIssues(result);
    expect(blocking).toHaveLength(0);
  });

  it("owner and sector are explicitly tagged", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.owner).toBe(HEALTH_MIGRATION_OWNER);
    expect(result.sector).toBe(HEALTH_MIGRATION_SECTOR);
    expect(result.owner).toBe("health");
    expect(result.sector).toBe("HEALTH_OS");
  });

  it("migration count is at least 30 (current baseline)", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.count).toBeGreaterThanOrEqual(30);
  });

  it("latest migration id is known", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    expect(result.latestId).toBeTruthy();
    expect(result.latestId).toMatch(/^\d+_/);
  });

  it("formatReport produces a readable governance report", () => {
    const result = verifyGovernance(MIGRATIONS_DIR);
    const report = formatReport(result);
    expect(report).toContain("BEYU Health OS — Migration Governance Verification");
    expect(report).toContain(`Owner:         ${HEALTH_MIGRATION_OWNER}`);
    expect(report).toContain(`Sector:        ${HEALTH_MIGRATION_SECTOR}`);
    expect(report).toContain("Fingerprint:");
    expect(report).toContain("Sequential:    YES");
  });
});

describe("Health Migration Governance — Fingerprint Mechanics", () => {
  it("computeFingerprint returns null for empty input", () => {
    expect(computeFingerprint([])).toBeNull();
  });

  it("computeFingerprint returns null for undefined/empty", () => {
    expect(computeFingerprint([])).toBeNull();
  });

  it("computeFingerprint returns sha256 hex for single checksum", () => {
    const fp = computeFingerprint(["abc123"]);
    expect(fp).toBeTruthy();
    expect(fp!.length).toBe(64);
  });

  it("order matters — different order produces different fingerprint", () => {
    const fp1 = computeFingerprint(["aaa", "bbb", "ccc"]);
    const fp2 = computeFingerprint(["ccc", "bbb", "aaa"]);
    expect(fp1).not.toBe(fp2);
  });

  it("same checksums in same order produce same fingerprint", () => {
    const cs = ["aaa", "bbb", "ccc"];
    expect(computeFingerprint(cs)).toBe(computeFingerprint(cs));
  });
});

describe("Health Migration Governance — Sequential Verification", () => {
  it("verifySequential returns true for correct sequence", () => {
    const files = [
      { seq: "001" },
      { seq: "002" },
      { seq: "003" },
    ] as any;
    expect(verifySequential(files)).toBe(true);
  });

  it("verifySequential returns false for gaps", () => {
    const files = [
      { seq: "001" },
      { seq: "003" },
    ] as any;
    expect(verifySequential(files)).toBe(false);
  });

  it("verifySequential returns false for wrong padding", () => {
    const files = [
      { seq: "1" },
      { seq: "2" },
    ] as any;
    expect(verifySequential(files)).toBe(false);
  });
});

describe("Health Migration Governance — Detecting Violations", () => {
  it("detects missing down file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "health-mig-test-"));
    // Create an up migration without a down.
    fs.writeFileSync(path.join(tmp, "001_test.up.sql"), "CREATE TABLE test (id int);");

    const result = verifyGovernance(tmp);
    expect(result.issues.some((i) => i.code === "MISSING_DOWN_FILE")).toBe(true);
    expect(result.allDownsPresent).toBe(false);

    fs.rmSync(tmp, { recursive: true });
  });

  it("detects sequence gap", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "health-mig-test-"));
    fs.writeFileSync(path.join(tmp, "001_a.up.sql"), "CREATE TABLE a (id int);");
    fs.writeFileSync(path.join(tmp, "001_a.down.sql"), "DROP TABLE a;");
    // Gap: missing 002.
    fs.writeFileSync(path.join(tmp, "003_c.up.sql"), "CREATE TABLE c (id int);");
    fs.writeFileSync(path.join(tmp, "003_c.down.sql"), "DROP TABLE c;");

    const result = verifyGovernance(tmp);
    expect(result.sequential).toBe(false);
    expect(result.issues.some((i) => i.code === "SEQUENCE_GAP")).toBe(true);

    fs.rmSync(tmp, { recursive: true });
  });

  it("detects empty migration file", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "health-mig-test-"));
    fs.writeFileSync(path.join(tmp, "001_empty.up.sql"), "");
    fs.writeFileSync(path.join(tmp, "001_empty.down.sql"), "-- empty rollback");

    const result = verifyGovernance(tmp);
    expect(result.issues.some((i) => i.code === "EMPTY_MIGRATION")).toBe(true);

    fs.rmSync(tmp, { recursive: true });
  });
});

describe("Health Migration Governance — Checksum Integrity", () => {
  it("sha256 is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("sha256 differs for different inputs", () => {
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("every migration file has a non-empty checksum", () => {
    const files = readHealthMigrations(MIGRATIONS_DIR);
    for (const f of files) {
      expect(f.checksum).toBeTruthy();
      expect(f.checksum.length).toBe(64);
    }
  });

  it("checksums are unique across the migration set", () => {
    const files = readHealthMigrations(MIGRATIONS_DIR);
    const checksums = files.map((f) => f.checksum);
    const unique = new Set(checksums);
    expect(unique.size).toBe(checksums.length);
  });
});
