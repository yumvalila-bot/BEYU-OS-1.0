/*
 * BEYU OS — ADMINISTRATIVE USER & TENANT GOVERNANCE (additive; 1 governed table).
 * X10THINK master implementation — governed administrative capability.
 *
 * ============================== WHAT THIS MIGRATION ADDS =====================
 *
 * admin_authority_delegations — the delegation instruments for bounded
 * administrative authority: delegator, delegatee, a closed permission set,
 * explicit tenant/entity/country scope, an effective window, a mandatory
 * reason, and revocation fields. Active delegations are loaded by
 * resolvePrincipal() on EVERY request (exactly like emergency grants) and are
 * evaluated by the SAME `can()` primitive — RBAC ∪ emergency ∪ delegation →
 * ABAC. This table stores instruments; it holds no authority of its own.
 *
 * The catalogue mirror rows for the eight new fine-grained permissions
 * (identity:user.register / user.suspend / user.remove / membership.manage /
 * delegation.manage, organization:tenant.register / tenant.manage /
 * tenant.remove) and the TENANT_MEMBER membership-marker role are inserted so
 * the role_permissions parity mirror (`assertPermissionCatalogParity`) stays
 * truthful on EXISTING databases; fresh installs receive the same rows from
 * the canonical seed, which derives them from src/lib/constants.ts.
 *
 * ============================== BOUNDARIES PRESERVED =========================
 *
 *   - NO SECOND AUTHORIZATION MODEL. The permission catalogue, ROLES, `can()`,
 *     `guarded()`, `requireAccess()`, the audit ledger and the RLS context are
 *     untouched. Delegated permissions enter through the existing Principal
 *     resolution, so every existing capability-, tenant-, entity- and
 *     classification check applies to delegated administrators unchanged.
 *   - role_assignments remains F-01 protected: the runtime role keeps
 *     SELECT-only on it. Governed role/membership writes go through the
 *     existing admin-DSN boundary (src/db/admin.ts) under `identity:role.grant`
 *     / `identity:membership.manage`, MFA step-up and atomic audit appends.
 *   - WHY NO RLS POLICY ON THIS TABLE (deliberate): it joins the control-plane
 *     authorization tables (users, parties, tenants, roles, role_assignments,
 *     sessions, emergency_access_grants, delegations) that are non-RLS by
 *     architecture — resolvePrincipal() must resolve authority BEFORE a
 *     request's tenant context exists. Tenant scoping is enforced by the
 *     service layer at creation (scope ⊆ delegator's resolved tenant subtree)
 *     and at exercise (delegation-scope intersection), and pinned by tests.
 *   - NO DESTRUCTIVE OPERATIONS. Users and tenants are never hard-deleted by
 *     the governed lifecycle; removal is a terminal status change that retains
 *     every row for audit, legal and historical attribution.
 *   - NO SECRETS, no credentials, no TLS changes, no RLS weakening.
 *
 * META NOTE: no drizzle-kit meta snapshot is added — the snapshot chain has
 * been stale since 0039 (see 0042's note); scripts/migrate.ts is the only
 * canonical runner and does not read meta.
 */
--> statement-breakpoint
CREATE TABLE "admin_authority_delegations" (
	"id" text PRIMARY KEY,
	"tenant_id" text NOT NULL,
	"delegator_user_id" text NOT NULL,
	"delegatee_user_id" text NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_tenant_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_legal_entity_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scope_country_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"audit_ref" text,
	"revoked_at" timestamp with time zone,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_delegator_fk" FOREIGN KEY ("delegator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_delegatee_fk" FOREIGN KEY ("delegatee_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_revoked_by_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
/* Governed-instrument invariants. An empty permission set or an empty tenant
   scope would be an unbounded or useless instrument; a self-delegation would
   create authority from nothing; a REVOKED row without revocation evidence
   (or vice versa) would break the audit story. */
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_permissions_nonempty" CHECK (jsonb_array_length("permissions") > 0);
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_scope_nonempty" CHECK (jsonb_array_length("scope_tenant_ids") > 0);
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_no_self" CHECK ("delegator_user_id" <> "delegatee_user_id");
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_window" CHECK ("effective_to" > "effective_from");
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_status" CHECK ("status" IN ('ACTIVE', 'REVOKED'));
--> statement-breakpoint
ALTER TABLE "admin_authority_delegations" ADD CONSTRAINT "admin_delegations_revocation_evidence" CHECK (("status" = 'REVOKED') = ("revoked_at" IS NOT NULL));
--> statement-breakpoint
/* One LIVE instrument per (delegator, delegatee); history is unlimited. */
CREATE UNIQUE INDEX "admin_delegations_live_uidx" ON "admin_authority_delegations" ("delegator_user_id", "delegatee_user_id") WHERE "status" = 'ACTIVE';
--> statement-breakpoint
CREATE INDEX "admin_delegations_delegatee_idx" ON "admin_authority_delegations" ("delegatee_user_id");
--> statement-breakpoint
CREATE INDEX "admin_delegations_tenant_idx" ON "admin_authority_delegations" ("tenant_id");
--> statement-breakpoint
COMMENT ON TABLE "admin_authority_delegations" IS 'Administrative authority delegation instruments (X10THINK): bounded, time-limited, revocable; resolved per request through the canonical can() primitive';
--> statement-breakpoint
/* ---- Canonical permission catalogue mirror (fresh rows for existing DBs;
   fresh installs get the identical rows from the seed). ---- */
INSERT INTO "permissions" ("code", "domain", "action", "description", "classification_ceiling", "requires_mfa", "high_risk")
VALUES
  ('identity:user.register', 'identity', 'user.register', 'Register (create) a user identity through the governed administrative flow', 'CONFIDENTIAL', false, false),
  ('identity:user.suspend', 'identity', 'user.suspend', 'Suspend, deactivate or reactivate an existing user identity', 'CONFIDENTIAL', false, false),
  ('identity:user.remove', 'identity', 'user.remove', 'Remove a user identity (irreversible governed act; anonymizes PII and retains attribution)', 'CONFIDENTIAL', true, true),
  ('identity:membership.manage', 'identity', 'membership.manage', 'Assign or remove a user''s membership of a tenant', 'CONFIDENTIAL', false, false),
  ('identity:delegation.manage', 'identity', 'delegation.manage', 'Delegate bounded administrative authority to another administrator, and revoke it', 'CONFIDENTIAL', true, true),
  ('organization:tenant.register', 'organization', 'tenant.register', 'Register a tenant in the canonical organization model', 'CONFIDENTIAL', false, false),
  ('organization:tenant.manage', 'organization', 'tenant.manage', 'Transition tenant lifecycle status (activate, suspend, deactivate, reactivate, archive)', 'CONFIDENTIAL', false, false),
  ('organization:tenant.remove', 'organization', 'tenant.remove', 'Remove a tenant from active operation (dependency-checked; retains legal, financial and audit history)', 'CONFIDENTIAL', true, true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "roles" ("id", "code", "name", "description", "scope_level", "privileged", "separation_group")
VALUES ('ROL_TENANT_MEMBER', 'TENANT_MEMBER', 'Tenant Member', 'Membership of one tenant with no capability. Presence, not authority.', 'TENANT', false, 'OPERATIONS')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
/*
 * The role-permission mirror is written with INSERT … SELECT guarded on the
 * role's existence, NOT a bare VALUES insert: on a FRESH install the runner
 * executes migrations BEFORE the constitutional seed creates the roles, so a
 * bare insert would violate the roles foreign key. Fresh installs therefore
 * skip these rows entirely and receive the IDENTICAL rows from the seed
 * (identical fixed ids, onConflictDoNothing); EXISTING databases — where the
 * roles pre-date this migration — receive the mirror here so the parity
 * check (assertPermissionCatalogParity) stays truthful without a re-seed.
 */
INSERT INTO "role_permissions" ("id", "role_id", "permission_code")
SELECT 'RPM_PLATFORM_ADMIN_IDENTITY_USER_REGISTER', r.id, 'identity:user.register' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_IDENTITY_USER_SUSPEND', r.id, 'identity:user.suspend' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_IDENTITY_USER_REMOVE', r.id, 'identity:user.remove' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_IDENTITY_MEMBERSHIP_MANAGE', r.id, 'identity:membership.manage' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_IDENTITY_DELEGATION_MANAGE', r.id, 'identity:delegation.manage' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANT_REGISTER', r.id, 'organization:tenant.register' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANT_MANAGE', r.id, 'organization:tenant.manage' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_PLATFORM_ADMIN_ORGANIZATION_TENANT_REMOVE', r.id, 'organization:tenant.remove' FROM roles r WHERE r.code = 'PLATFORM_ADMIN'
UNION ALL SELECT 'RPM_GROUP_CEO_IDENTITY_USER_REGISTER', r.id, 'identity:user.register' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_IDENTITY_USER_SUSPEND', r.id, 'identity:user.suspend' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_IDENTITY_MEMBERSHIP_MANAGE', r.id, 'identity:membership.manage' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANT_REGISTER', r.id, 'organization:tenant.register' FROM roles r WHERE r.code = 'GROUP_CEO'
UNION ALL SELECT 'RPM_GROUP_CEO_ORGANIZATION_TENANT_MANAGE', r.id, 'organization:tenant.manage' FROM roles r WHERE r.code = 'GROUP_CEO'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
/* Runtime DML grant, mirroring 0035-0042. No DDL is ever granted to the runtime
   role. role_assignments stays F-01 SELECT-only; this table is runtime-writable
   because the governed delegation service creates and revokes instruments at
   runtime through the canonical API boundary. */
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname = 'beyu_runtime'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO %I', 'admin_authority_delegations', r.rolname);
    RAISE NOTICE 'granted administrative governance DML to %', r.rolname;
  END LOOP;
END
$$;
--> statement-breakpoint
/*
 * Verification. The migration FAILS if the governed instrument table is missing
 * its invariants or its live-instrument uniqueness, or if the catalogue mirror
 * rows are absent, so a half-applied migration cannot leave an unprotected or
 * unmirrored delegation model behind (0035-0042 parity).
 */
DO $$
DECLARE
  constraint_count int;
  catalogue_count int;
BEGIN
  SELECT count(*) INTO constraint_count
  FROM pg_constraint
  WHERE conrelid = 'public.admin_authority_delegations'::regclass
    AND conname IN (
      'admin_delegations_permissions_nonempty',
      'admin_delegations_scope_nonempty',
      'admin_delegations_no_self',
      'admin_delegations_window',
      'admin_delegations_status',
      'admin_delegations_revocation_evidence'
    );
  IF constraint_count <> 6 THEN
    RAISE EXCEPTION 'Migration 0043 verification failed: admin_authority_delegations is missing its governed-instrument CHECK constraints (found %)', constraint_count;
  END IF;

  SELECT count(*) INTO catalogue_count
  FROM "permissions"
  WHERE code IN (
    'identity:user.register', 'identity:user.suspend', 'identity:user.remove',
    'identity:membership.manage', 'identity:delegation.manage',
    'organization:tenant.register', 'organization:tenant.manage', 'organization:tenant.remove'
  );
  IF catalogue_count <> 8 THEN
    RAISE EXCEPTION 'Migration 0043 verification failed: %/8 administrative permissions present in the catalogue mirror', catalogue_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'beyu_runtime')
     OR has_table_privilege('beyu_runtime', 'public.admin_authority_delegations', 'INSERT') THEN
    RAISE NOTICE 'Migration 0043 verification passed.';
  ELSE
    RAISE EXCEPTION 'Migration 0043 verification failed: beyu_runtime lacks DML on admin_authority_delegations';
  END IF;
END
$$;
