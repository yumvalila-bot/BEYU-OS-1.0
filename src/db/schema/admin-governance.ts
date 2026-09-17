/**
 * BEYU OS — Administrative authority delegation (governed administrative
 * program).
 *
 * ONE shared capability inside BEYU OS — not an Admin OS, not a second
 * authorization engine. This table stores the DELEGATION INSTRUMENTS: bounded,
 * time-limited, revocable grants of fine-grained administrative capabilities
 * from one authorized administrator to another. The authority itself is
 * resolved through the canonical authorization path: `resolvePrincipal()`
 * loads active delegations on every request (exactly like emergency grants)
 * and `can()` evaluates them through the same RBAC ∪ emergency ∪ delegation →
 * ABAC chain. Nothing else reads this table for authorization decisions.
 *
 * WHY THIS IS A SECOND DELEGATION TABLE (and not the existing `delegations`):
 * `delegations` is the MONETARY authority instrument of the governance engine
 * (`src/lib/governance/delegation.ts` — issuer limits, reserved matters,
 * monetary amounts). Administrative capability delegation is a different
 * constitutional object: it delegates PERMISSIONS with tenant/entity/country
 * scope, has immediate revocation semantics on the authorization path, and is
 * evaluated per request rather than per transaction. Merging the two would
 * overload the monetary engine's contract; the master implementation mandate
 * explicitly permits a minimal canonical delegation model where one is absent.
 *
 * WHY THERE IS NO RLS POLICY ON THIS TABLE (deliberate, mirrors its siblings):
 * the control-plane authorization tables — `users`, `parties`, `tenants`,
 * `roles`, `role_assignments`, `sessions`, `emergency_access_grants`,
 * `delegations` — are non-RLS by architecture: `resolvePrincipal()` must
 * resolve identity and authority BEFORE a request's tenant context exists, so
 * these tables cannot be tenant-row-filtered at the database layer. Tenant
 * scoping of delegations is enforced by the service layer (scope ⊆ delegator's
 * resolved tenant scope at creation; delegation-scope intersection at
 * exercise) and is pinned by tests. Runtime DML is granted to `beyu_runtime`
 * exactly like every other governed table.
 */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants } from "./core";
import { users } from "./identity";

export const adminAuthorityDelegations = pgTable(
  "admin_authority_delegations",
  {
    id: text("id").primaryKey(),
    /** Tenant context in which the delegation was issued (delegator's tenant). */
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** The administrator whose authority is being bounded and shared. */
    delegatorUserId: text("delegator_user_id")
      .notNull()
      .references(() => users.id),
    /** The administrator receiving ONLY the delegated capability and scope. */
    delegateeUserId: text("delegatee_user_id")
      .notNull()
      .references(() => users.id),
    /** Delegated permission codes — closed set, validated by the service. */
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    /** Explicit, non-empty tenant scope of the delegated authority. */
    scopeTenantIds: jsonb("scope_tenant_ids").$type<string[]>().notNull().default([]),
    /** Optional legal-entity scope (empty = every entity in the tenant scope). */
    scopeLegalEntityIds: jsonb("scope_legal_entity_ids").$type<string[]>().notNull().default([]),
    /** Optional country scope (empty = every country in the tenant scope). */
    scopeCountryCodes: jsonb("scope_country_codes").$type<string[]>().notNull().default([]),
    /** ACTIVE while valid; REVOKED is terminal. */
    status: text("status").notNull().default("ACTIVE"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }).notNull(),
    /** Governed reason for the delegation (mandatory, audited). */
    reason: text("reason").notNull(),
    /** Audit reference of the ADMIN_DELEGATED event. */
    auditRef: text("audit_ref"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: text("revoked_by").references(() => users.id),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One LIVE instrument per (delegator, delegatee): a further delegation to
    // the same administrator requires revoking (or letting expire) the current
    // one first. Partial unique index — history (REVOKED rows) is unlimited.
    uniqueIndex("admin_delegations_live_uidx")
      .on(t.delegatorUserId, t.delegateeUserId)
      .where(sql`status = 'ACTIVE'`),
    index("admin_delegations_delegatee_idx").on(t.delegateeUserId),
    index("admin_delegations_tenant_idx").on(t.tenantId),
  ],
);
