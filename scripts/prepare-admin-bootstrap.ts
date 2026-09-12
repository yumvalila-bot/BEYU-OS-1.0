/**
 * BEYU OS — production preparation for the secure first-administrator bootstrap.
 *
 * PURPOSE
 *   Prepare the canonical PLATFORM_ADMIN identity for the existing one-time
 *   enrollment ceremony without creating any usable credential. The minimal
 *   constitutional foundation is a separate, auditable operation:
 *
 *     npm run prepare:constitutional-foundation
 *
 *   This script remains the ONLY operation that prepares the first administrator
 *   identity. It provisions ONLY:
 *     1. the canonical PLATFORM_ADMIN party + user, in an ENROLLABLE-ONLY state
 *        (unusable random password hash, no MFA);
 *     2. the governed PLATFORM_ADMIN role assignment;
 *     3. the singleton admin_bootstrap_state row in status AVAILABLE.
 *
 *   It NEVER sets a password the owner did not choose and NEVER prints secrets.
 *
 * PREREQUISITES (owner-controlled, entered into the local process environment):
 *   - BEYU_ADMIN_DATABASE_URL  (or DATABASE_URL) — admin/migration DSN
 *   - BEYU_ADMIN_EMAIL          — the email the owner will sign in with
 *   - BEYU_BOOTSTRAP_SECRET     — required later by the enrollment endpoint
 *                                 (not read here)
 *   - AUTH_SECRET / MFA_ENCRYPTION_KEY — required by the runtime for MFA at rest
 *
 * IDEMPOTENT & SAFE: re-running recognizes the same enrollable-only records,
 * refuses conflicting records, never overwrites existing credentials, and refuses
 * to run once the bootstrap is SEALED or an enrollment is already IN_PROGRESS.
 *
 * USAGE
 *   BEYU_ADMIN_DATABASE_URL=... BEYU_ADMIN_EMAIL=... \
 *     npx tsx scripts/prepare-admin-bootstrap.ts
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { and, eq, isNull, sql } from "drizzle-orm";
import { adminDb, adminPool } from "../src/db/admin";
import * as s from "../src/db/schema";
import { recordAuditTx, type Tx } from "../src/lib/audit";
import {
  assertCanonicalConstitutionalFoundation,
  CANONICAL_BOOTSTRAP_TENANT,
  CANONICAL_PLATFORM_ADMIN_ROLE,
} from "../src/lib/bootstrap/foundation";
import { fixedId, ID_PREFIX, newId } from "../src/lib/ids";
import { randomBytes } from "node:crypto";

const ADMIN_KEY = "PLATFORM_ADMIN";
const ADMIN_ROLE = "PLATFORM_ADMIN";
const ADMIN_USER_ID = fixedId(ID_PREFIX.user, ADMIN_KEY);
const ADMIN_PARTY_ID = fixedId(ID_PREFIX.party, ADMIN_KEY);
const ADMIN_ROLE_ASSIGNMENT_ID = fixedId(ID_PREFIX.roleAssignment, `${ADMIN_KEY}_${ADMIN_ROLE}`);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

/**
 * An unusable password hash. It is a well-formed scrypt record whose digest is
 * random and never derived from any known password, so verifyPassword() can
 * never succeed against it. The account is therefore login-DISABLED until the
 * owner sets their own password through enrollment.
 */
function unusablePasswordHash(): string {
  const salt = randomBytes(16).toString("hex");
  const impossible = randomBytes(64).toString("hex");
  return `scrypt$${salt}$${impossible}`;
}

function normalizedEmail(value: string): string {
  return value.toLowerCase().trim();
}

export async function prepareAdminBootstrap(email: string, database: typeof adminDb = adminDb): Promise<void> {
  await database.transaction(async (rawTx) => {
    const tx = rawTx as unknown as Tx;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('BEYU_OS_ADMIN_BOOTSTRAP_PREPARATION'))`);

    const [state] = await rawTx
      .select()
      .from(s.adminBootstrapState)
      .where(eq(s.adminBootstrapState.id, "SINGLETON"))
      .for("update")
      .limit(1);

    if (state?.status === "SEALED") {
      throw new Error("Bootstrap already SEALED; preparation cannot reopen it.");
    }
    if (state?.status === "IN_PROGRESS") {
      throw new Error("Bootstrap is already IN_PROGRESS; preparation will not alter the active enrollment.");
    }
    if (state && state.status !== "AVAILABLE") {
      throw new Error(`Bootstrap state ${state.status} is not a valid preparation state.`);
    }
    if (state?.adminUserId && state.adminUserId !== ADMIN_USER_ID) {
      throw new Error("The singleton bootstrap is bound to a different administrator identity.");
    }

    // Migrations create tables and constraints; they do not create constitutional
    // data. This is intentionally a read-only prerequisite check here.
    await assertCanonicalConstitutionalFoundation(rawTx);
    const tenantId = CANONICAL_BOOTSTRAP_TENANT.id;

    const [existingParty] = await rawTx
      .select()
      .from(s.parties)
      .where(eq(s.parties.id, ADMIN_PARTY_ID))
      .limit(1);
    if (
      existingParty &&
      (existingParty.type !== "PERSON" ||
        existingParty.displayName !== "Platform Administrator" ||
        existingParty.givenName !== "Platform" ||
        normalizedEmail(existingParty.email ?? "") !== email ||
        existingParty.status !== "ACTIVE")
    ) {
      throw new Error("The canonical PLATFORM_ADMIN party conflicts with the requested administrator identity.");
    }

    let partyCreated = false;
    if (!existingParty) {
      await rawTx.insert(s.parties).values({
        id: ADMIN_PARTY_ID,
        type: "PERSON",
        displayName: "Platform Administrator",
        givenName: "Platform",
        familyName: "Administrator",
        email,
        countryCode: "TZ",
        classification: "CONFIDENTIAL",
        status: "ACTIVE",
      });
      partyCreated = true;
    }

    const [existingUser] = await rawTx
      .select()
      .from(s.users)
      .where(eq(s.users.id, ADMIN_USER_ID))
      .limit(1);
    const [userByParty] = await rawTx
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.partyId, ADMIN_PARTY_ID))
      .limit(1);
    const [userByEmail] = await rawTx
      .select({ id: s.users.id })
      .from(s.users)
      .where(eq(s.users.email, email))
      .limit(1);
    if (userByParty && userByParty.id !== ADMIN_USER_ID) {
      throw new Error("The canonical PLATFORM_ADMIN party is already bound to a different user.");
    }
    if (userByEmail && userByEmail.id !== ADMIN_USER_ID) {
      throw new Error("The requested administrator email is already bound to a different user.");
    }
    if (
      existingUser &&
      (existingUser.partyId !== ADMIN_PARTY_ID ||
        normalizedEmail(existingUser.email) !== email ||
        existingUser.primaryTenantId !== tenantId ||
        existingUser.status !== "ACTIVE")
    ) {
      throw new Error("The canonical PLATFORM_ADMIN user conflicts with the requested administrator identity.");
    }
    if (existingUser && (!existingUser.passwordMustChange || existingUser.mfaEnrolled)) {
      throw new Error("The canonical PLATFORM_ADMIN user already has activation material; refusing to overwrite it.");
    }

    let userCreated = false;
    if (!existingUser) {
      await rawTx.insert(s.users).values({
        id: ADMIN_USER_ID,
        partyId: ADMIN_PARTY_ID,
        email,
        passwordHash: unusablePasswordHash(),
        passwordAlgo: "scrypt",
        passwordMustChange: true,
        mfaEnrolled: false,
        primaryTenantId: tenantId,
        status: "ACTIVE",
      });
      userCreated = true;
    }

    const [existingAssignment] = await rawTx
      .select()
      .from(s.roleAssignments)
      .where(eq(s.roleAssignments.id, ADMIN_ROLE_ASSIGNMENT_ID))
      .limit(1);
    if (
      existingAssignment &&
      (existingAssignment.userId !== ADMIN_USER_ID ||
        existingAssignment.roleId !== CANONICAL_PLATFORM_ADMIN_ROLE.id ||
        existingAssignment.tenantId !== tenantId ||
        existingAssignment.grantedBy !== "OWNER_BOOTSTRAP_PREPARATION")
    ) {
      throw new Error("The canonical PLATFORM_ADMIN role assignment conflicts with the required grant.");
    }

    const [sameGrantDifferentId] = await rawTx
      .select({ id: s.roleAssignments.id })
      .from(s.roleAssignments)
      .where(
        and(
          eq(s.roleAssignments.userId, ADMIN_USER_ID),
          eq(s.roleAssignments.roleId, CANONICAL_PLATFORM_ADMIN_ROLE.id),
          eq(s.roleAssignments.tenantId, tenantId),
        ),
      )
      .limit(1);
    if (sameGrantDifferentId && sameGrantDifferentId.id !== ADMIN_ROLE_ASSIGNMENT_ID) {
      throw new Error("A conflicting PLATFORM_ADMIN role assignment already exists for the canonical identity.");
    }

    let assignmentCreated = false;
    if (!existingAssignment) {
      await rawTx.insert(s.roleAssignments).values({
        id: ADMIN_ROLE_ASSIGNMENT_ID,
        userId: ADMIN_USER_ID,
        roleId: CANONICAL_PLATFORM_ADMIN_ROLE.id,
        tenantId,
        effectiveFrom: new Date().toISOString().slice(0, 10),
        grantedBy: "OWNER_BOOTSTRAP_PREPARATION",
        justification: "Initial administrator authorization prepared for one-time secure enrollment.",
      });
      assignmentCreated = true;
    }

    if (!state) {
      await rawTx.insert(s.adminBootstrapState).values({
        id: "SINGLETON",
        status: "AVAILABLE",
        adminUserId: ADMIN_USER_ID,
      });
    } else if (!state.adminUserId) {
      await rawTx
        .update(s.adminBootstrapState)
        .set({ adminUserId: ADMIN_USER_ID, updatedAt: new Date() })
        .where(
          and(
            eq(s.adminBootstrapState.id, "SINGLETON"),
            eq(s.adminBootstrapState.status, "AVAILABLE"),
            isNull(s.adminBootstrapState.adminUserId),
          ),
        );
    }

    await recordAuditTx(tx, {
      tenantId,
      actorType: "SERVICE",
      action: "bootstrap.preparation.completed",
      objectType: "BOOTSTRAP",
      objectId: "SINGLETON",
      outcome: "SUCCESS",
      reason: "Canonical first-administrator identity prepared as enrollable-only",
      authority: "OWNER_BOOTSTRAP_PREPARATION",
      newValue: {
        status: "AVAILABLE",
        partyCreated,
        userCreated,
        assignmentCreated,
      },
      traceId: newId(ID_PREFIX.event),
    });
  });
}

async function main(): Promise<void> {
  const email = normalizedEmail(requireEnv("BEYU_ADMIN_EMAIL"));
  if (!email) throw new Error("BEYU_ADMIN_EMAIL must not be empty.");
  await prepareAdminBootstrap(email);

  console.log(
    [
      "Administrator bootstrap prepared (ENROLLABLE-ONLY).",
      "  - Canonical PLATFORM_ADMIN identity provisioned or safely recognized.",
      "  - PLATFORM_ADMIN authorization grant recorded or safely recognized.",
      "  - admin_bootstrap_state = AVAILABLE.",
      "",
      "Owner next steps:",
      "  1. Ensure BEYU_BOOTSTRAP_SECRET is set in the production environment.",
      "  2. Open /enroll on the deployment and complete the one-time enrollment.",
      "  3. Store the recovery codes securely (shown once).",
      "No credential was created or printed by this script.",
    ].join("\n"),
  );
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  main()
    .catch((error) => {
      console.error(String(error instanceof Error ? error.message : error));
      process.exit(1);
    })
    .finally(() => adminPool.end());
}
