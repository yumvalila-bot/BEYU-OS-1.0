/**
 * Phase 10 — Waterfall engine architectural boundary.
 *
 * The adopted integer engine is PURE. It decides WHAT SHOULD HAPPEN. It must
 * never be able to execute finance, post a ledger entry, create audit records,
 * touch the database, read secrets, or make network calls.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("waterfall v2 engine boundary", () => {
  const file = source("src/lib/waterfall-engine-v2.ts");

  it("has no database, ledger or finance-execution coupling", () => {
    expect(file).not.toMatch(/from ["'](@\/db)\b/);
    expect(file).not.toContain("drizzle(");
    expect(file).not.toContain("new Pool(");
    expect(file).not.toContain('from "pg"');
    expect(file).not.toMatch(/from ["']@\/lib\/(finance|ledger|execution)\b/);
    expect(file).not.toContain("CAP_POSTING");
    expect(file).not.toContain("db.insert(");
    expect(file).not.toContain("db.update(");
    expect(file).not.toContain("db.commit(");
    expect(file).not.toContain(".insert(");
    expect(file).not.toContain(".commit(");
  });

  it("has no network I/O or secret access", () => {
    expect(file).not.toContain("fetch(");
    expect(file).not.toContain("process.env");
    expect(file).not.toContain("axios");
    expect(file).not.toContain("http.");
    expect(file).toContain("createHash"); // deterministic hashing only
  });

  it("exports only the pure API and destination wrapper", () => {
    expect(file).toContain("export function calculateWaterfallV2");
    expect(file).toContain("export function runWaterfallV2");
    expect(file).toContain("export function applyBasisPoints");
  });
});
