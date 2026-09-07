/**
 * ONE GOVERNED CONFIGURATION WRITE PATH — program §4, §19, §31, §46, §63J, §71.
 *
 * The rule under test is structural: exactly one module may change payment
 * configuration, the CLI is its command surface, and the demo reaches the
 * database only through that CLI. If the demo could write configuration itself,
 * every control attached to the write path — approval reference, evidence,
 * privilege check, audit append — would have a bypass, and the bypass would be
 * invisible in normal operation because the demo is trusted code.
 *
 * These are source-scanning tests on purpose. They assert the shape of the system
 * rather than any one behaviour, so a future "quick fix" that drops a stray
 * `update public.payment_policies` into a script fails here rather than in a
 * reconciliation report eighteen months later.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FINANCIAL_TRUTH, mayWrite, soleWriterOf } from "@/lib/finance/truth";
import { permittedTablesForThisModule } from "@/lib/payments/config-write";

const ROOT = path.resolve(__dirname, "..", "..");
const CONFIG_TABLES = ["payment_providers", "payment_provider_connections", "payment_accounts", "payment_account_mappings", "payment_policies"] as const;
const CONFIG_MODELS = ["paymentProviders", "paymentProviderConnections", "paymentAccounts", "paymentAccountMappings", "paymentPolicies"] as const;
const GOVERNED_WRITER = "src/lib/payments/config-write.ts";

function filesIn(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const full = path.join(abs, entry);
    if (statSync(full).isDirectory()) out.push(...filesIn(path.relative(ROOT, full)));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path.relative(ROOT, full));
  }
  return out;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function source(rel: string): string {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

/** Comment-free source, so a doc line saying "never parseFloat" is not evidence. */
function code(rel: string): string {
  return stripComments(source(rel));
}

/** A write statement aimed at one of the configuration tables. */
function directWriteHits(text: string): string[] {
  const hits: string[] = [];
  for (const table of CONFIG_TABLES) {
    const patterns = [
      new RegExp(`insert\\s+into\\s+(public\\.)?"?${table}"?`, "i"),
      new RegExp(`update\\s+(public\\.)?"?${table}"?\\s+set`, "i"),
      new RegExp(`delete\\s+from\\s+(public\\.)?"?${table}"?`, "i"),
      new RegExp(`truncate\\s+.*${table}`, "i"),
    ];
    for (const re of patterns) if (re.test(text)) hits.push(`${table}: ${re.source}`);
  }
  for (const model of CONFIG_MODELS) {
    for (const re of [new RegExp(`\\.insert\\(\\s*${model}\\b`), new RegExp(`\\.update\\(\\s*${model}\\b`), new RegExp(`\\.delete\\(\\s*${model}\\b`)]) {
      if (re.test(text)) hits.push(`${model}: ${re.source}`);
    }
  }
  return hits;
}

describe("the governed configuration write path is the only write path", () => {
  it("only the governed writer module issues configuration writes in src/ and scripts/", () => {
    const offenders: string[] = [];
    for (const rel of [...filesIn("src/lib/payments"), ...filesIn("scripts")]) {
      if (rel === GOVERNED_WRITER) continue;
      const hits = directWriteHits(code(rel));
      if (hits.length > 0) offenders.push(`${rel} -> ${hits.join(" | ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("the demo performs no configuration write of any kind, and delegates to the CLI", () => {
    const demo = source("scripts/payments-demo.ts");
    expect(directWriteHits(demo)).toEqual([]);
    // Read-only inspection is allowed and expected; a statement that could change
    // a row is not.
    expect(demo).not.toMatch(/\binsert\s+into\b/i);
    expect(demo).not.toMatch(/\bupdate\s+public\./i);
    expect(demo).not.toMatch(/\bdelete\s+from\s+public\./i);
    // The one and only route to configuration is the canonical CLI process.
    expect(demo).toMatch(/scripts\/payment-config\.ts/);
    expect(demo).toMatch(/sandbox-demo/);
    expect(demo).toMatch(/execFileSync/);
    // And it does not import the writers directly, which would let it skip the CLI.
    expect(demo).not.toMatch(/from "@\/lib\/payments\/config-write"/);
  });

  it("the CLI is a command surface over the governed writer, not a second implementation", () => {
    const cli = source("scripts/payment-config.ts");
    expect(cli).toMatch(/from "@\/lib\/payments\/config-write"/);
    for (const fn of ["upsertProvider", "upsertConnection", "upsertAccount", "upsertAccountMapping", "upsertPolicy", "removeSandboxDemoFixture"]) {
      expect(cli, fn).toContain(fn);
    }
    expect(directWriteHits(cli)).toEqual([]);
  });

  it("no module outside the accounting bridge can reach the posting engine", () => {
    const paymentFiles = [...filesIn("src/lib/payments"), ...filesIn("src/app/api/v1/payments")];
    const importers = paymentFiles.filter((rel) => /finance\/posting-engine/.test(source(rel)));
    expect(importers).toEqual(["src/lib/payments/accounting.ts"]);
    const bridge = source("src/lib/payments/accounting.ts");
    // The bridge posts only with a caller-supplied principal, and says so.
    expect(bridge).toMatch(/principal: Principal/);
    expect(bridge).toMatch(/allowPost/);
  });

  it("the public webhook endpoint is not wired to the ledger at all", () => {
    const route = source("src/app/api/v1/payments/webhook/[provider]/route.ts");
    expect(route).not.toMatch(/posting-engine|postJournal|accounting/);
    expect(route).toMatch(/rateLimit\(/);
    // Unauthenticated by design, so it must not pretend to be an authorised route.
    expect(route).not.toMatch(/guarded\(/);
  });

  it("money is never handled in floating point in the payment domain", () => {
    const allowFloat = ["src/lib/payments/providers/hmac.ts", "src/lib/payments/resolve.ts", "src/lib/payments/risk.ts"];
    for (const rel of filesIn("src/lib/payments")) {
      const text = code(rel);
      if (!allowFloat.includes(rel)) {
        expect(text, rel).not.toMatch(/parseFloat\s*\(/);
        expect(text, rel).not.toMatch(/\.toFixed\s*\(/);
        expect(text, rel).not.toMatch(/Math\.round\s*\(/);
      }
      expect(text, rel).not.toMatch(/Math\.pow\s*\(/);
    }
    // Sums and scaling happen on integers; the exponent table is the only scaling
    // factor and it is integer by construction.
    expect(source("src/lib/payments/money.ts")).toMatch(/10 \*\* currencyExponent/);
  });

  it("configuration reads use bound parameters and quoted identifiers, never string interpolation", () => {
    for (const rel of filesIn("src/lib/payments")) {
      expect(code(rel), rel).not.toMatch(/sql\.raw\s*\(/);
    }
    expect(code(GOVERNED_WRITER)).toMatch(/\$1/);
    expect(code(GOVERNED_WRITER)).not.toMatch(/public\.\$\{/);
    expect(code("src/lib/payments/selftest.ts")).toMatch(/sql\.identifier/);
  });

  it("the finance truth registry names modules that exist, and the payment tables are registered", () => {
    const paymentsRows = FINANCIAL_TRUTH.filter((r) => r.domain === "PAYMENTS");
    // One record per table: a compound `canonicalTable` is unreadable by
    // soleWriterOf()/mayWrite(), which is the enforcement path in
    // src/lib/finance/contract.ts, so grouping five tables into one string would
    // silently switch the registry off for exactly the tables that most need it.
    expect(paymentsRows.length).toBe(11);
    const tables = paymentsRows.map((r) => r.canonicalTable);
    expect(new Set(tables).size).toBe(tables.length);
    for (const row of paymentsRows) {
      expect(row.soleWriter, String(row.canonicalTable)).toBeTruthy();
      const target = path.join(ROOT, "src", "lib", `${row.soleWriter!}.ts`);
      expect(existsSync(target), `${row.canonicalTable} soleWriter ${row.soleWriter}`).toBe(true);
      expect(soleWriterOf(row.canonicalTable!)).toBe(row.soleWriter);
    }
    expect(tables).toContain("payment_matches");
    for (const table of CONFIG_TABLES) {
      expect(soleWriterOf(table), table).toBe("payments/config-write");
      expect(mayWrite("payments/config-write", table), table).toBe(true);
      // The ingest path — the one reachable from outside — may not write them.
      expect(mayWrite("payments/ingest", table), table).toBe(false);
      expect(mayWrite("payments/review", table), table).toBe(false);
    }
    expect(mayWrite("payments/ingest", "payment_transactions")).toBe(true);
    expect(mayWrite("payments/config-write", "payment_transactions")).toBe(false);
  });

  it("the append-only and observation tables are recorded as observation, not writable reference data", () => {
    const byTable = new Map(FINANCIAL_TRUTH.filter((r) => r.domain === "PAYMENTS").map((r) => [r.canonicalTable, r]));
    expect(byTable.get("payment_transaction_states")!.producesClass).toBe("OBSERVED");
    expect(byTable.get("payment_transactions")!.producesClass).toBe("OBSERVED");
    expect(byTable.get("payment_matches")!.producesClass).toBe("DERIVED");
    expect(byTable.get("payment_providers")!.producesClass).toBe("REFERENCE_DATA");
    expect(byTable.get("payment_policies")!.producesClass).toBe("REFERENCE_DATA");
    // And the governed writer agrees with the registry about its own scope: it
    // derives the list from mayWrite() rather than restating it, so a registry
    // record that stops resolving to a real table shrinks this list and fails here.
    expect(permittedTablesForThisModule().sort()).toEqual([...CONFIG_TABLES].sort());
  });
});
