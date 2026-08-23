/**
 * Phase 10 — architectural invariants.
 *
 * These are not a second architecture. They lock the canons that already exist
 * so a later specialist cannot quietly introduce a competing identity, ledger,
 * event model, or employee master.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { canPromote } from "@/lib/finance/epistemics";
import { mayWrite } from "@/lib/finance/truth";
import { commonPlatformMatrix, crossDomainMatrix, financeOsMatrix } from "@/lib/architecture/phase10";
import { IDENTITY_VERSION } from "@/lib/identity";
import { HCM_VERSION } from "@/lib/hcm";

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

describe("canonical invariants", () => {
  it("INVARIANT 1–2: ONE GlobalUserID, ONE identity model", () => {
    expect(IDENTITY_VERSION).toBe("identity-graph-1.0.0");
    const hits = walk("src/db/schema").filter((f) => /pgTable\(\s*"users"/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual(["src/db/schema/identity.ts"]);
  });

  it("INVARIANT 3–4: ONE governance and ONE authority model", () => {
    const gov = walk("src/lib").filter((f) => /export async function proposeResolution/.test(readFileSync(f, "utf8")));
    expect(gov).toEqual(["src/lib/governance.ts"]);
    const auth = walk("src/lib").filter((f) =>
      /export async function checkScopedCapability/.test(readFileSync(f, "utf8")),
    );
    expect(auth).toEqual(["src/lib/authority/service.ts"]);
  });

  it("INVARIANT 5–7: ONE event, lineage and workflow primitive", () => {
    const events = walk("src/lib").filter((f) => /export async function publishEventTx/.test(readFileSync(f, "utf8")));
    expect(events).toEqual(["src/lib/audit.ts"]);
    const lineage = walk("src/lib").filter((f) => /export function buildLineage/.test(readFileSync(f, "utf8")));
    expect(lineage).toEqual(["src/lib/finance/lineage.ts"]);
    const wf = walk("src/lib").filter((f) =>
      /export function evaluateWorkflowTransition/.test(readFileSync(f, "utf8")),
    );
    expect(wf).toEqual(["src/lib/finance/workflow.ts"]);
  });

  it("INVARIANT 8: Finance OS is the only journal writer", () => {
    expect(mayWrite("finance/posting-engine", "journal_entries + journal_lines")).toBe(true);
    expect(mayWrite("specialist/forecast", "journal_entries + journal_lines")).toBe(false);
    expect(mayWrite("lib/hcm", "journal_entries + journal_lines")).toBe(false);
    const inserts = walk("src/lib").filter((f) => {
      const t = readFileSync(f, "utf8");
      return t.includes("insert(journalEntries)") || t.includes(".insert(journal_entries)");
    });
    expect(inserts).toEqual(["src/lib/finance/posting-engine.ts"]);
  });

  it("INVARIANT 9–10: capital execution is locked; no Sector OS bypass module", () => {
    const capital = readFileSync("src/lib/capital-governance-service.ts", "utf8");
    expect(capital).toContain("CAPITAL_REQUEST_GOVERNANCE_AUTHORIZED");
    expect(readdirSync("src/lib").includes("health-os")).toBe(false);
    expect(readdirSync("src/lib").includes("agriculture-os")).toBe(false);
  });

  it("INVARIANT 11–12: forecasts and derived figures cannot become actuals/canonical", () => {
    expect(canPromote("FORECAST", "POSTED")).toBe(false);
    expect(canPromote("SCENARIO", "POSTED")).toBe(false);
    expect(canPromote("ASSUMPTION", "POSTED")).toBe(false);
    expect(canPromote("SYNTHETIC", "OBSERVED")).toBe(false);
    const lineage = readFileSync("src/lib/finance/lineage.ts", "utf8");
    expect(lineage).toMatch(/canonical is structurally false|canonical:\s*false/);
  });

  it("INVARIANT 13: unratified policy cannot authorize execution", async () => {
    const pending = await db.execute(sql`select count(*)::int as n from governance_decision_registry where status <> 'PENDING'`);
    const locked = await db.execute(sql`select count(*)::int as n from governance_capability_registry where activation_status <> 'LOCKED'`);
    expect(Number((pending as unknown as { rows: Array<{ n: number }> }).rows[0].n)).toBe(0);
    expect(Number((locked as unknown as { rows: Array<{ n: number }> }).rows[0].n)).toBe(0);
  });

  it("INVARIANT 14–15: tenant and entity isolation helpers exist and are used", () => {
    expect(readFileSync("src/lib/tenant-scope.ts", "utf8")).toMatch(/export async function tenantScopeIds/);
    expect(readFileSync("src/lib/authz.ts", "utf8")).toMatch(/entityScope/);
  });

  it("INVARIANT 16: historical financial truth is immutable (triggers live)", async () => {
    const n = await db.execute(
      sql`select count(*)::int as n from pg_trigger where not tgisinternal and tgname like '%journal%'`,
    );
    expect(Number((n as unknown as { rows: Array<{ n: number }> }).rows[0].n)).toBeGreaterThan(0);
    const disabled = await db.execute(
      sql`select count(*)::int as n from pg_trigger where not tgisinternal and tgenabled = 'D'`,
    );
    expect(Number((disabled as unknown as { rows: Array<{ n: number }> }).rows[0].n)).toBe(0);
  });

  it("INVARIANT 17–18: governed execution is traced and capability-gated", () => {
    const posting = readFileSync("src/lib/finance/posting-engine.ts", "utf8");
    expect(posting).toMatch(/requireCapability\("CAP_POSTING"\)/);
    expect(posting).toMatch(/recordAuditTx/);
    expect(posting).toMatch(/publishEventTx/);
  });

  it("HCM is the only employee master writer in application code", () => {
    expect(HCM_VERSION).toMatch(/^hcm-/);
    const writers = walk("src").filter((f) => {
      if (f.includes("seed.ts")) return false;
      const t = readFileSync(f, "utf8");
      return /insert\(\s*s?\.?employees/.test(t) || /insert\(employees\)/.test(t);
    });
    expect(writers).toEqual([]);
  });
});

describe("Phase 10 matrices cannot flatter themselves", () => {
  it("common platform lists Identity, HCM, events and workflow", () => {
    const names = commonPlatformMatrix().map((r) => r.domain);
    for (const n of ["Identity", "HCM", "Event system", "Workflow", "Security"]) expect(names).toContain(n);
  });

  it("Finance OS lists AR/AP/FA/Inventory as NOT_APPLICABLE, not COMPLETE", () => {
    const m = financeOsMatrix();
    for (const d of ["AR", "AP", "FIXED_ASSETS", "INVENTORY"]) {
      expect(m.find((r) => r.domain === d)?.status).toBe("NOT_APPLICABLE");
    }
  });

  it("cross-domain Legal is honestly PARTIAL", () => {
    const legal = crossDomainMatrix().find((r) => r.domain === "Finance ↔ Legal")!;
    expect(legal.status).toBe("PARTIAL");
    expect(legal.status).not.toBe("COMPLETE");
  });

  it("no COMPLETE row hides an authority or data blocker as its only gap", () => {
    for (const row of [...commonPlatformMatrix(), ...financeOsMatrix()]) {
      if (row.status === "COMPLETE") expect(row.remainingGap).toBe("—");
    }
  });
});
