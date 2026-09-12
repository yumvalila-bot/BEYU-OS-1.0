import { eq, sql } from "drizzle-orm";
import { adminDb } from "@/db/admin";
import { roles, tenants } from "@/db/schema";
import { fixedId, ID_PREFIX } from "@/lib/ids";
import { ROLES } from "@/lib/constants";

/**
 * The smallest constitutional data foundation required by the production
 * first-administrator preparation ceremony.
 *
 * This is deliberately not the application seed. It creates only the
 * enterprise tenant and the PLATFORM_ADMIN role that are referenced by the
 * canonical preparation script's foreign-key chain. It creates no user,
 * password, MFA material, sector tenant, demo data, or unrelated reference
 * data.
 */
export const CANONICAL_BOOTSTRAP_TENANT = {
  id: fixedId(ID_PREFIX.tenant, "BEYU_GROUP"),
  code: "BEYU-GROUP",
  name: "BEYU Group (Enterprise)",
  type: "ENTERPRISE" as const,
  parentTenantId: null,
  countryCode: null,
  isolationTier: "DEDICATED",
  status: "ACTIVE" as const,
  classification: "RESTRICTED" as const,
};

const platformAdminRole = ROLES.PLATFORM_ADMIN;

export const CANONICAL_PLATFORM_ADMIN_ROLE = {
  id: fixedId(ID_PREFIX.role, "PLATFORM_ADMIN"),
  code: "PLATFORM_ADMIN",
  name: platformAdminRole.name,
  description: platformAdminRole.description,
  scopeLevel: platformAdminRole.scope,
  privileged: platformAdminRole.privileged,
  separationGroup: "OPERATIONS",
};

/** The narrow database surface needed by this foundation operation. */
export type ConstitutionalFoundationDatabase = Pick<typeof adminDb, "execute" | "select" | "insert">;

export type ConstitutionalFoundationResult = {
  tenantCreated: boolean;
  roleCreated: boolean;
};

function tenantMatches(row: typeof tenants.$inferSelect): boolean {
  return (
    row.id === CANONICAL_BOOTSTRAP_TENANT.id &&
    row.code === CANONICAL_BOOTSTRAP_TENANT.code &&
    row.name === CANONICAL_BOOTSTRAP_TENANT.name &&
    row.type === CANONICAL_BOOTSTRAP_TENANT.type &&
    row.parentTenantId === CANONICAL_BOOTSTRAP_TENANT.parentTenantId &&
    row.countryCode === CANONICAL_BOOTSTRAP_TENANT.countryCode &&
    row.isolationTier === CANONICAL_BOOTSTRAP_TENANT.isolationTier &&
    row.status === CANONICAL_BOOTSTRAP_TENANT.status &&
    row.classification === CANONICAL_BOOTSTRAP_TENANT.classification
  );
}

function roleMatches(row: typeof roles.$inferSelect): boolean {
  return (
    row.id === CANONICAL_PLATFORM_ADMIN_ROLE.id &&
    row.code === CANONICAL_PLATFORM_ADMIN_ROLE.code &&
    row.name === CANONICAL_PLATFORM_ADMIN_ROLE.name &&
    row.description === CANONICAL_PLATFORM_ADMIN_ROLE.description &&
    row.scopeLevel === CANONICAL_PLATFORM_ADMIN_ROLE.scopeLevel &&
    row.privileged === CANONICAL_PLATFORM_ADMIN_ROLE.privileged &&
    row.separationGroup === CANONICAL_PLATFORM_ADMIN_ROLE.separationGroup
  );
}

/**
 * Verify the immutable canonical prerequisites without changing anything.
 * Used by prepare-admin-bootstrap immediately before it creates the admin.
 */
export async function assertCanonicalConstitutionalFoundation(
  database: Pick<ConstitutionalFoundationDatabase, "select">,
): Promise<void> {
  const [tenantById] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.id, CANONICAL_BOOTSTRAP_TENANT.id))
    .limit(1);
  const [tenantByCode] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.code, CANONICAL_BOOTSTRAP_TENANT.code))
    .limit(1);

  if (tenantByCode && tenantByCode.id !== CANONICAL_BOOTSTRAP_TENANT.id) {
    throw new Error("Canonical enterprise tenant code BEYU-GROUP is already assigned to a different tenant.");
  }
  if (!tenantById) {
    throw new Error(
      "Canonical enterprise tenant BEYU_GROUP is missing. Run the governed constitutional foundation (npm run prepare:constitutional-foundation) first.",
    );
  }
  if (!tenantMatches(tenantById)) {
    throw new Error("Canonical enterprise tenant BEYU_GROUP conflicts with the required constitutional record.");
  }

  const [roleById] = await database
    .select()
    .from(roles)
    .where(eq(roles.id, CANONICAL_PLATFORM_ADMIN_ROLE.id))
    .limit(1);
  const [roleByCode] = await database
    .select()
    .from(roles)
    .where(eq(roles.code, CANONICAL_PLATFORM_ADMIN_ROLE.code))
    .limit(1);

  if (roleByCode && roleByCode.id !== CANONICAL_PLATFORM_ADMIN_ROLE.id) {
    throw new Error("PLATFORM_ADMIN role code is already assigned to a different role.");
  }
  if (!roleById) {
    throw new Error(
      "Canonical PLATFORM_ADMIN role is missing. Run the governed constitutional foundation (npm run prepare:constitutional-foundation) first.",
    );
  }
  if (!roleMatches(roleById)) {
    throw new Error("Canonical PLATFORM_ADMIN role conflicts with the required constitutional record.");
  }
}

/**
 * Ensure the minimal foundation inside a caller-owned transaction.
 *
 * The transaction-scoped advisory lock serializes concurrent foundation runs.
 * Existing canonical rows are accepted unchanged; any identity or unique-code
 * conflict fails closed before the caller can prepare an administrator.
 */
export async function ensureConstitutionalFoundation(
  database: ConstitutionalFoundationDatabase,
): Promise<ConstitutionalFoundationResult> {
  await database.execute(sql`select pg_advisory_xact_lock(hashtext('BEYU_OS_CONSTITUTIONAL_FOUNDATION'))`);

  const [tenantById] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.id, CANONICAL_BOOTSTRAP_TENANT.id))
    .limit(1);
  const [tenantByCode] = await database
    .select()
    .from(tenants)
    .where(eq(tenants.code, CANONICAL_BOOTSTRAP_TENANT.code))
    .limit(1);

  if (tenantByCode && tenantByCode.id !== CANONICAL_BOOTSTRAP_TENANT.id) {
    throw new Error("Canonical enterprise tenant code BEYU-GROUP is already assigned to a different tenant.");
  }
  if (tenantById && !tenantMatches(tenantById)) {
    throw new Error("Canonical enterprise tenant BEYU_GROUP conflicts with the required constitutional record.");
  }

  let tenantCreated = false;
  if (!tenantById) {
    await database.insert(tenants).values(CANONICAL_BOOTSTRAP_TENANT);
    tenantCreated = true;
  }

  const [roleById] = await database
    .select()
    .from(roles)
    .where(eq(roles.id, CANONICAL_PLATFORM_ADMIN_ROLE.id))
    .limit(1);
  const [roleByCode] = await database
    .select()
    .from(roles)
    .where(eq(roles.code, CANONICAL_PLATFORM_ADMIN_ROLE.code))
    .limit(1);

  if (roleByCode && roleByCode.id !== CANONICAL_PLATFORM_ADMIN_ROLE.id) {
    throw new Error("PLATFORM_ADMIN role code is already assigned to a different role.");
  }
  if (roleById && !roleMatches(roleById)) {
    throw new Error("Canonical PLATFORM_ADMIN role conflicts with the required constitutional record.");
  }

  let roleCreated = false;
  if (!roleById) {
    await database.insert(roles).values(CANONICAL_PLATFORM_ADMIN_ROLE);
    roleCreated = true;
  }

  return { tenantCreated, roleCreated };
}
