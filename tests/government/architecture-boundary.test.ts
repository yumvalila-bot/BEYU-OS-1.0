/**
 * Government Integration Fabric — architecture boundary.
 *
 * Locks the constitutional shape of the module:
 *   1. ONE gateway: no code outside src/lib/government constructs or imports
 *      an adapter class directly (sector code must go through the fabric).
 *   2. NOT an OS: the fabric never appears in the OS registry vocabulary.
 *   3. NO scraping: no adapter references unofficial community endpoints.
 *   4. NO secrets: adapters reference env-var NAMES only; no credential
 *      literal patterns exist in the module.
 *   5. Statuses are the closed catalogue shared with the database CHECKs.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  GOVERNMENT_INTEGRATION_STATUS,
  GOVERNMENT_SUBMISSION_STATUS,
} from "@/lib/government/adapter";

const ROOT = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (["node_modules", ".git", ".next", "pgdata"].includes(entry)) continue;
      walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(p);
    }
  }
  return out;
}

describe("one canonical gateway", () => {
  it("no source outside src/lib/government imports a government adapter implementation directly", () => {
    const files = walk(join(ROOT, "src"));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes(join("src", "lib", "government"))) continue;
      const text = readFileSync(file, "utf8");
      if (/from\s+["'][^"']*\/government\/adapters\//.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("sector code reaches government systems only through @/lib/government (no direct agency URLs)", () => {
    const files = walk(join(ROOT, "src"));
    const offenders: string[] = [];
    for (const file of files) {
      if (file.includes(join("src", "lib", "government"))) continue;
      // seed.ts records official documentation URLs as registry METADATA
      // (officialDocsUrl); it dials nothing. Everything else is a dial risk.
      if (file.endsWith(join("src", "db", "seed.ts"))) continue;
      const text = readFileSync(file, "utf8");
      // Live agency hosts must never be dialed from outside the fabric.
      if (/(virtual\.tra\.go\.tz|verification\.nhif\.or\.tz|ors\.brela\.go\.tz|nida\.go\.tz\/api)/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no scraping / no unofficial endpoints", () => {
  it("adapters never reference the unofficial BRELA NIDA passthrough or community mirrors", () => {
    const files = walk(join(ROOT, "src", "lib", "government"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text.includes("load_nida"), file).toBe(false);
      expect(/um\/load\//.test(text), file).toBe(false);
    }
  });

  it("adapters carry env-var NAMES only — no inline credential value patterns", () => {
    const files = walk(join(ROOT, "src", "lib", "government"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(/(password|secret|token)\s*[:=]\s*["'][^"']{8,}["']/i.test(text), file).toBe(false);
    }
  });
});

describe("closed status catalogues (shared with the database CHECKs)", () => {
  it("integration statuses match migration 0036 exactly", () => {
    const sql = readFileSync(join(ROOT, "drizzle", "0036_government_integration_fabric.sql"), "utf8");
    for (const status of GOVERNMENT_INTEGRATION_STATUS) {
      expect(sql.includes(`'${status}'`), status).toBe(true);
    }
  });

  it("submission statuses match migration 0036 exactly", () => {
    const sql = readFileSync(join(ROOT, "drizzle", "0036_government_integration_fabric.sql"), "utf8");
    for (const status of GOVERNMENT_SUBMISSION_STATUS) {
      expect(sql.includes(`'${status}'`), status).toBe(true);
    }
  });
});

describe("not an OS", () => {
  it("the fabric presents itself as a shared module, never as a Government OS", () => {
    const files = walk(join(ROOT, "src", "lib", "government"));
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(/Government OS/i.test(text) && !/NOT a (separate|Government) OS/i.test(text), file).toBe(false);
    }
  });
});
