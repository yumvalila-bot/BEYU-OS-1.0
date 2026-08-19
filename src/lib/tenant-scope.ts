import { inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
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

export async function setDatabaseTenantContext(principal: Principal): Promise<void> {
  const ids = await tenantScopeIds(principal);
  await db.execute(sql`select set_config('beyu.current_tenant_ids', ${ids.join(",")}, false)`);
  await db.execute(sql`select set_config('beyu.global_scope', ${hasGlobalGovernanceScope(principal) ? "on" : "off"}, false)`);
}

export function assertSameTenant(principal: Principal, tenantId: string): void {
  if (tenantId !== principal.tenantId && !hasGlobalGovernanceScope(principal)) {
    throw new Error("Tenant isolation: requested resource is outside principal scope");
  }
}
