/**
 * BEYU OS — production preparation for the secure first-administrator bootstrap.
 *
 * PURPOSE
 *   Make a production deployment READY for the legitimate owner to enroll the
 *   first administrator through the one-time ceremony — WITHOUT creating any
 *   usable credential that Arena, the repository, Noelia, HIVE or any AI system
 *   knows. It provisions ONLY:
 *     1. the canonical PLATFORM_ADMIN party + user, in an ENROLLABLE-ONLY state
 *        (unusable random password hash, no MFA) so it cannot be logged into
 *        until the owner completes enrollment;
 *     2. the governed PLATFORM_ADMIN role assignment (AUTHORIZATION), written
 *        with the admin/migration DSN because the runtime role is forbidden from
 *        writing role_assignments (control F-01);
 *     3. the singleton admin_bootstrap_state row in status AVAILABLE.
 *
 *   It NEVER sets a password the owner did not choose and NEVER prints secrets.
 *
 * PREREQUISITES (owner-controlled, entered into the deployment platform):
 *   - BEYU_ADMIN_DATABASE_URL  (or DATABASE_URL) — admin/migration DSN
 *   - BEYU_ADMIN_EMAIL          — the email the owner will sign in with
 *   - BEYU_BOOTSTRAP_SECRET     — required by the enrollment endpoint at runtime
 *                                 (not read here; documented so the owner sets it)
 *   - AUTH_SECRET / MFA_ENCRYPTION_KEY — required by the runtime for MFA at rest
 *
 * IDEMPOTENT & SAFE: re-running never overwrites an existing enrolled admin and
 * refuses to run once the bootstrap is SEALED.
 *
 * USAGE
 *   BEYU_ADMIN_DATABASE_URL=... BEYU_ADMIN_EMAIL=owner@example.com \
 *     BEYU_ENV=production BEYU_ALLOW_PRODUCTION_SEED=I_UNDERSTAND_THIS_IS_A_ONE_TIME_GOVERNED_BOOTSTRAP \
 *     npx tsx scripts/prepare-admin-bootstrap.ts
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { adminDb, adminPool } from "../src/db/admin";
import * as s from "../src/db/schema";
import { fixedId, ID_PREFIX } from "../src/lib/ids";

const ADMIN_KEY = "PLATFORM_ADMIN";
const ADMIN_ROLE = "PLATFORM_ADMIN";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required.`);
  return v;
}

/**
 * An unusable password hash. It is a well-formed scrypt record whose digest is
 * random and never derived from any known password, so verifyPassword() can
 * never succeed against it. The account is therefore login-DISABLED until the
 * owner sets their own password through enrollment.
 */
function unusablePasswordHash(): string {
  const salt = randomBytes(16).toString("hex");
  const impossible = randomBytes(64).toString("hex"); // 64 bytes -> 128 hex chars, matching scrypt keylen
  return `scrypt$${salt}$${impossible}`;
}

async function main(): Promise<void> {
  const email = requireEnv("BEYU_ADMIN_EMAIL").toLowerCase().trim();
  const tenantId = fixedId(ID_PREFIX.tenant, "BEYU_GROUP");
  const userId = fixedId(ID_PREFIX.user, ADMIN_KEY);
  const partyId = fixedId(ID_PREFIX.party, ADMIN_KEY);

  // Refuse to run if already sealed.
  const [state] = await adminDb
    .select()
    .from(s.adminBootstrapState)
    .where(eq(s.adminBootstrapState.id, "SINGLETON"))
    .limit(1);
  if (state?.status === "SEALED") {
    console.log("Bootstrap already SEALED; nothing to prepare. An administrator exists.");
    return;
  }

  // Verify the enterprise tenant exists (the constitutional seed must run first).
  const [tenant] = await adminDb.select().from(s.tenants).where(eq(s.tenants.id, tenantId)).limit(1);
  if (!tenant) {
    throw new Error(
      "Enterprise tenant BEYU_GROUP not found. Run the constitutional bootstrap (npm run seed / migrations) first.",
    );
  }

  await adminDb
    .insert(s.parties)
    .values({
      id: partyId,
      type: "PERSON",
      displayName: "Platform Administrator",
      givenName: "Platform",
      familyName: "Administrator",
      email,
      countryCode: "TZ",
      classification: "CONFIDENTIAL",
      status: "ACTIVE",
    })
    .onConflictDoNothing();

  // Create the user ENROLLABLE-ONLY: unusable password, no MFA. If it already
  // exists we DO NOT touch its credentials (never clobber a real admin).
  await adminDb
    .insert(s.users)
    .values({
      id: userId,
      partyId,
      email,
      passwordHash: unusablePasswordHash(),
      passwordAlgo: "scrypt",
      passwordMustChange: true,
      mfaEnrolled: false,
      primaryTenantId: tenantId,
      status: "ACTIVE",
    })
    .onConflictDoNothing();

  // Governed AUTHORIZATION grant (admin DSN only; runtime role is forbidden).
  await adminDb
    .insert(s.roleAssignments)
    .values({
      id: fixedId(ID_PREFIX.roleAssignment, `${ADMIN_KEY}_${ADMIN_ROLE}`),
      userId,
      roleId: fixedId(ID_PREFIX.role, ADMIN_ROLE),
      tenantId,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      grantedBy: "OWNER_BOOTSTRAP_PREPARATION",
      justification: "Initial administrator authorization prepared for one-time secure enrollment.",
    })
    .onConflictDoNothing();

  // Prepare the singleton bootstrap-state row pointing at the canonical admin.
  await adminDb
    .insert(s.adminBootstrapState)
    .values({ id: "SINGLETON", status: "AVAILABLE", adminUserId: userId })
    .onConflictDoNothing();

  // If a state row existed but had no admin bound (e.g. earlier partial run),
  // bind it now — but only while still AVAILABLE.
  await adminDb
    .update(s.adminBootstrapState)
    .set({ adminUserId: userId, updatedAt: new Date() })
    .where(and(eq(s.adminBootstrapState.id, "SINGLETON"), isNull(s.adminBootstrapState.adminUserId)));

  console.log(
    [
      "Administrator bootstrap prepared (ENROLLABLE-ONLY).",
      "  - Canonical PLATFORM_ADMIN identity provisioned with an UNUSABLE credential.",
      "  - PLATFORM_ADMIN authorization grant recorded (governed).",
      "  - admin_bootstrap_state = AVAILABLE.",
      "",
      "Owner next steps:",
      "  1. Ensure BEYU_BOOTSTRAP_SECRET (high-entropy) is set in the production environment.",
      "  2. Open /enroll on the deployment and complete the one-time enrollment.",
      "  3. Store the recovery codes securely (shown once).",
      "No credential was created or printed by this script.",
    ].join("\n"),
  );
}

main()
  .catch((e) => {
    console.error(String(e instanceof Error ? e.message : e));
    process.exit(1);
  })
  .finally(() => adminPool.end());
