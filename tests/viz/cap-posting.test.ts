/**
 * CAP_POSTING LOCK — visualization can never become a posting path.
 *
 * Static import-graph proof: no module under src/lib/viz imports the Finance
 * posting engine, the waterfall engine, treasury/payments/capital governance
 * or any journal writer. The ONLY Finance surface the visualization layer may
 * touch is the READ-governed reporting engine (trialBalance). Backed by a
 * live check: building a FINANCE manifest posts zero journals.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";
import { validateDimensionExtension } from "@/lib/viz/dimensions";
import { buildGovernedManifest } from "@/lib/viz/service";
import { seededPrincipal } from "../noelia/db-fixtures";

const VIZ_ROOT = join(process.cwd(), "src", "lib", "viz");

function vizFiles(dir: string = VIZ_ROOT): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? vizFiles(full) : full.endsWith(".ts") ? [full] : [];
  });
}

/** Import targets that would give visualization a money-mutation path. */
const FORBIDDEN_IMPORT = [
  /from\s+["'][^"']*finance\/posting-engine["']/,
  /from\s+["'][^"']*finance\/workflow["']/,
  /from\s+["'][^"']*finance\/intercompany["']/,
  /from\s+["'][^"']*waterfall["']/,
  /from\s+["'][^"']*treasury["']/,
  /from\s+["'][^"']*payments["']/,
  /from\s+["'][^"']*capital-governance-service["']/,
  /from\s+["'][^"']*equity\/service["']/,
];

describe("static import graph — no posting path exists", () => {
  it("no viz module imports a journal/posting/treasury/payments engine", () => {
    for (const file of vizFiles()) {
      const source = readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_IMPORT) {
        expect(pattern.test(source), `${file} must not match ${pattern}`).toBe(false);
      }
    }
  });

  it("the ONLY aliased finance import in the whole viz layer is the read-governed reporting engine", () => {
    const financeImports: string[] = [];
    for (const file of vizFiles()) {
      const source = readFileSync(file, "utf8");
      // Module-graph imports ("@/lib/finance/…"). Relative imports inside the
      // viz layer (e.g. adapters/index.ts → "./finance") are the adapter
      // registry wiring itself and are covered by the forbidden-pattern scan.
      for (const match of source.matchAll(/from\s+["'](@\/[^"']*finance[^"']*)["']/g)) {
        financeImports.push(match[1]);
      }
    }
    expect(financeImports.length).toBeGreaterThan(0);
    for (const target of financeImports) {
      expect(target).toBe("@/lib/finance/reporting");
    }
  });

  it("no viz module writes journal_entries (insert/update/delete)", () => {
    for (const file of vizFiles()) {
      const source = readFileSync(file, "utf8");
      expect(/journalEntries\s*\)?\s*\.\s*(insert|update|delete)/.test(source), `${file} must not mutate journalEntries`).toBe(false);
      expect(/insert\(s\.journalEntries\)/.test(source)).toBe(false);
    }
  });

  it("the finance adapter source declares the READ-GOVERNED boundary and reuses trialBalance", () => {
    const source = readFileSync(join(VIZ_ROOT, "adapters", "finance.ts"), "utf8");
    expect(source).toContain("trialBalance");
    expect(source).toMatch(/READ-GOVERNED/);
    expect(source).toMatch(/CAP_POSTING/);
  });
});

describe("governed extension validation — no smuggled posting authority", () => {
  it.each(["finance:ledger.post", "finance:payments.authorize", "finance:settlement.manage"])(
    "a dimension extension can never require %s",
    (permission) => {
      const result = validateDimensionExtension({
        code: "9D",
        name: "Money dimension",
        description: "Attempts to attach posting authority to a visualization dimension",
        lifecycleState: "PLANNED",
        requiredPermissions: [permission as never],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/CAP_POSTING remains LOCKED/);
    },
  );
});

describe("live check — a FINANCE visualization posts zero journals", () => {
  it("buildGovernedManifest(FINANCE) leaves journal_entries untouched", async () => {
    const cfo = await seededPrincipal("cfo@beyu.os");
    const [before] = await db.select({ n: sql<number>`count(*)::int` }).from(journalEntries);
    const manifest = await buildGovernedManifest(cfo, { sector: "FINANCE", dimensions: ["1D", "4D", "5D"] });
    const [after] = await db.select({ n: sql<number>`count(*)::int` }).from(journalEntries);
    expect(Number(after?.n)).toBe(Number(before?.n));
    // Honest manifest: either governed finance objects or a declared
    // NOT_AVAILABLE reason — never a silent empty "OK" pretending completeness.
    expect(manifest.sector).toBe("FINANCE");
    expect(manifest.accessibleTable.columns.length).toBeGreaterThan(0);
  });

  it("no scene for a FINANCE subject can reference a posting permission", async () => {
    // The registry floor: every resolved dimension carries viz permissions
    // only — a scene activation set can never name finance:ledger.post.
    const cfo = await seededPrincipal("cfo@beyu.os");
    const manifest = await buildGovernedManifest(cfo, { sector: "FINANCE", dimensions: ["5D"] });
    const serialized = JSON.stringify(manifest);
    // No posting permission can ever ride along in a visualization payload.
    expect(serialized).not.toContain("finance:ledger.post");
    expect(serialized).not.toContain("finance:payments.authorize");
    // The provenance NAMES the read-governed reporting engine honestly — that
    // is metadata about where numbers came from, not a posting path.
    expect(manifest.provenance.systemOfRecord).toMatch(/reporting engine/i);
  });
});
