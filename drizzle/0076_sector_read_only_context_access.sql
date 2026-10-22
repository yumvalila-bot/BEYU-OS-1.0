/*
 * BEYU OS — SECTOR READ-ONLY CATALOGUE (additive, data-only).
 *
 * Purpose: mirror the reviewed SECTOR_READ_ONLY catalogue entry on an existing
 * database without re-running the constitutional seed. The role reuses two
 * existing permission codes and carries no assignment, tenant, identity or
 * global-scope fact. Migration 0076 therefore grants access to NOBODY.
 *
 * Authority boundary:
 *   - agriculture:data.read and ujenzi:data.read already exist; no permission
 *     is invented and no manage/approval/Finance/Family/AI/CAP_POSTING grant is
 *     added.
 *   - role_assignments remains governed by identity:role.grant + MFA + a
 *     separately authorized human grantor. There is deliberately no INSERT
 *     into role_assignments, users, tenants or sessions here.
 *   - direct sector context selection still requires an ACTIVE tenant, a
 *     direct effective assignment and the canonical RBAC/ABAC/RLS checks.
 *
 * Fresh installs run migrations before the constitutional seed. The role row
 * is safe to create now; role-permission rows are inserted only when the
 * referenced permission already exists. The seed later mirrors the identical
 * constants.ts entries with the same deterministic ids and ON CONFLICT NO-OP.
 * Existing databases already have both permission rows and receive the full
 * mirror here.
 *
 * META: this data-only migration does not change the Drizzle schema. Its 0076
 * snapshot carries the 0075 schema forward with a new snapshot id/prevId chain;
 * no schema DDL or metadata-debt exception is introduced.
 */
INSERT INTO "roles" ("id", "code", "name", "description", "scope_level", "privileged", "separation_group")
VALUES (
  'ROL_SECTOR_READ_ONLY',
  'SECTOR_READ_ONLY',
  'Sector OS Read Only',
  'Read-only Agriculture and Ujenzi visibility inside separately authorized sector tenant contexts. No operational writes or shared-capability authority.',
  'SECTOR',
  false,
  'OPERATIONS'
)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission_code")
SELECT 'RPM_SECTOR_READ_ONLY_AGRICULTURE_DATA_READ', r.id, p.code
FROM roles r
JOIN permissions p ON p.code = 'agriculture:data.read'
WHERE r.code = 'SECTOR_READ_ONLY'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permissions" ("id", "role_id", "permission_code")
SELECT 'RPM_SECTOR_READ_ONLY_UJENZI_DATA_READ', r.id, p.code
FROM roles r
JOIN permissions p ON p.code = 'ujenzi:data.read'
WHERE r.code = 'SECTOR_READ_ONLY'
ON CONFLICT ("id") DO NOTHING;
