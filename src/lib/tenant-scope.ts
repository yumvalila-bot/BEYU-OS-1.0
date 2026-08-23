import { inArray, sql, type SQL } from "drizzle-orm";
import { db, withDatabaseTransactionContext } from "@/db";
import { tenants } from "@/db/schema";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Principal } from "./authz";

/**
 * Canonical tenant-scoping abstraction.
 * Tenant-scoped query builders must obtain predicates from this module instead
 * of hand-writing tenant filters. Global reference data remains explicit.
 */

export const GLOBAL_GOVERNANCE_ROLES = new Set([
  "GROUP_CEO",
  "GROUP_CFO",
  "CHIEF_GOVERNANCE_OFFICER",
  "CHIEF_RISK_COMPLIANCE",
  "FAMILY_OFFICE_PRINCIPAL",
  "HCM_DIRECTOR",
  "PLATFORM_ADMIN",
  "AUDITOR",
]);

export function hasGlobalGovernanceScope(principal: Principal): boolean {
  return principal.roles.some((r) => GLOBAL_GOVERNANCE_ROLES.has(r)) && principal.tenantType === "ENTERPRISE";
}

export async function tenantScopeIds(principal: Principal): Promise<string[]> {
  if (!hasGlobalGovernanceScope(principal)) return [principal.tenantId];
  const rows = await db.select({ id: tenants.id, parent: tenants.parentTenantId }).from(tenants);
  const allowed = new Set<string>([principal.tenantId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parent && allowed.has(row.parent) && !allowed.has(row.id)) {
        allowed.add(row.id);
        changed = true;
      }
    }
  }
  return [...allowed];
}

export async function tenantPredicate<T extends PgColumn>(principal: Principal, column: T): Promise<SQL> {
  const ids = await tenantScopeIds(principal);
  return inArray(column, ids);
}

/**
 * Lower-level trusted context primitive for pre-auth/system flows that do not
 * have a fully resolved Principal yet. The caller supplies an explicit finite
 * tenant set; it is never inferred from client input.
 */
export async function withDatabaseRlsContext<T>(
  tenantIds: string[],
  globalScope: boolean,
  operation: () => Promise<T>,
): Promise<T> {
  if (tenantIds.length === 0 && !globalScope) throw new Error("RLS context requires an explicit tenant scope");
  return withDatabaseTransactionContext(async (tx) => {
    await tx.execute(sql`select set_config('beyu.current_tenant_ids', ${tenantIds.join(",")}, true)`);
    await tx.execute(sql`select set_config('beyu.global_scope', ${globalScope ? "on" : "off"}, true)`);
    return operation();
  });
}

/**
 * Run one request on a connection-pinned transaction with transaction-local RLS
 * context. `SET LOCAL` state is cleared by PostgreSQL on both commit and
 * rollback; no tenant or global-scope value can survive pool release.
 */
export async function withTenantDatabaseContext<T>(
  principal: Principal,
  operation: () => Promise<T>,
): Promise<T> {
  const ids = await tenantScopeIds(principal);
  return withDatabaseRlsContext(ids, hasGlobalGovernanceScope(principal), operation);
}

/**
 * Tenant-isolation assertion for the write path.
 *
 * Query-level scoping (`tenantScopeIds` / `tenantPredicate`) is the primary
 * control; this is the last-line invariant asserted immediately before a domain
 * mutation persists a tenant-owned row. It exists so that a future refactor which
 * accidentally drops a WHERE clause fails loudly instead of writing across a
 * tenant boundary.
 *
 * Throws `TenantIsolationError` so callers can map it to a 403 rather than a 500.
 */
export class TenantIsolationError extends Error {
  constructor(readonly attemptedTenantId: string, readonly principalTenantId: string) {
    super("Tenant isolation: requested resource is outside principal scope");
    this.name = "TenantIsolationError";
  }
}

export function assertSameTenant(principal: Principal, tenantId: string): void {
  if (tenantId !== principal.tenantId && !hasGlobalGovernanceScope(principal)) {
    throw new TenantIsolationError(tenantId, principal.tenantId);
  }
}

/**
 * Assert a tenant lies inside the principal's *resolved* scope.
 *
 * Stricter than `assertSameTenant`: a global-governance principal is still
 * constrained to its actual tenant subtree rather than being waved through.
 */
export async function assertWithinScope(principal: Principal, tenantId: string): Promise<void> {
  const scope = await tenantScopeIds(principal);
  if (!scope.includes(tenantId)) {
    throw new TenantIsolationError(tenantId, principal.tenantId);
  }
}
