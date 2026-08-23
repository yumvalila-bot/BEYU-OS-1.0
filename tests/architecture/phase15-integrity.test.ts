/**
 * Phase 15 static contract checks.
 *
 * PostgreSQL is not available in this checkout, so these checks do not claim to
 * prove live RLS behaviour. They protect the source-level invariants that the
 * live connection-pinned tests must exercise when infrastructure is provisioned.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const db = readFileSync("src/db/index.ts", "utf8");
const tenantScope = readFileSync("src/lib/tenant-scope.ts", "utf8");
const audit = readFileSync("src/lib/audit.ts", "utf8");
const api = readFileSync("src/lib/api.ts", "utf8");
const session = readFileSync("src/lib/session.ts", "utf8");
const migration = readFileSync("scripts/migrate.ts", "utf8");

function idempotencyRoutes() {
  return [
    "src/app/api/v1/finance/capital/[id]/governance-authorization/route.ts",
    "src/app/api/v1/finance/waterfall/simulate/route.ts",
    "src/app/api/v1/governance/resolutions/route.ts",
    "src/app/api/v1/governance/resolutions/[id]/decision/route.ts",
    "src/app/api/v1/governance/resolutions/[id]/table/route.ts",
    "src/app/api/v1/governance/resolutions/[id]/votes/route.ts",
  ].map((path) => ({ path, source: readFileSync(path, "utf8") }));
}

describe("Phase 15 source-level integrity contracts", () => {
  it("uses one async transaction context and transaction-local GUCs", () => {
    expect(db).toContain('AsyncLocalStorage');
    expect(db).toContain("withDatabaseTransactionContext");
    expect(tenantScope).toContain("withTenantDatabaseContext");
    expect(tenantScope).toContain("set_config('beyu.current_tenant_ids'");
    expect(tenantScope).toContain(", true)");
    expect(tenantScope).not.toMatch(/set_config\([^\n]+, false\)/);
  });

  it("does not put idempotency claims inside a request transaction", () => {
    expect(db).toContain("withIndependentDatabase");
    expect(api).toContain("withIdempotency must run outside an active request transaction");
    for (const route of idempotencyRoutes()) expect(route.source).toContain('databaseContext: "handler"');
  });

  it("versions audit hashes and covers the complete v2 metadata envelope", () => {
    expect(audit).toContain('const hashVersion = "2"');
    expect(audit).toContain("canonicalAuditPayloadV2");
    for (const field of ["reason", "authority", "approvalRef", "policyVersion", "aiVersion", "ipAddress", "userAgent", "traceId"]) {
      expect(audit).toContain(`input.${field}`);
    }
    expect(migration).toContain("DESTRUCTIVE_EXISTING_SCHEMA_MIGRATIONS");
  });

  it("fails closed when proxy trust is not explicitly configured", () => {
    expect(session).toContain('process.env.BEYU_TRUST_PROXY !== "true"');
    expect(session).toContain("return null");
  });

  it("routes authenticated page database work through the common context", () => {
    const pages = [
      "src/app/os/page.tsx",
      "src/app/os/layout.tsx",
      ...[
        "assurance",
        "audit",
        "capital",
        "constitution",
        "documents",
        "family",
        "foundation",
        "governance",
        "hcm",
        "noelia",
        "organization",
        "registry",
        "tax",
        "waterfall",
      ].map((name) => `src/app/os/${name}/page.tsx`),
    ];
    for (const path of pages) expect(readFileSync(path, "utf8")).toContain("withTenantDatabaseContext");
  });
});
