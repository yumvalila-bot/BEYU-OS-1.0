/**
 * BEYU OS — Secure first-administrator bootstrap state.
 *
 * These two tables carry the DURABLE state of the one-time administrator
 * enrollment path. They are NOT a second identity model: the administrator is
 * still the canonical `parties`/`users` record with a governed PLATFORM_ADMIN
 * `role_assignments` grant. These tables only govern the *credential
 * establishment ceremony* — who may open it, how far it has progressed, and the
 * permanent seal that closes it forever.
 *
 * SEPARATION OF CONCERNS (constitutional):
 *   AUTHORIZATION (which role the initial admin holds) is a governed appointment
 *     recorded in `role_assignments` at bootstrap preparation (admin handle).
 *   AUTHENTICATION (the admin's own password + own TOTP) is established here by
 *     the legitimate owner through the enrollment flow, using only the runtime
 *     role. The runtime role can write `users` (F-01 leaves it writable for the
 *     auth path) and these bootstrap tables, but never `role_assignments`.
 *
 * INVARIANT: exactly one canonical bootstrap can succeed, after which the state
 * is SEALED. A database trigger (migration 0033) makes SEALED terminal, so even
 * a compromised runtime role cannot re-open it.
 */
import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./identity";

/**
 * Single-row control record. `id` is pinned to 'SINGLETON' by a CHECK
 * constraint (migration 0033) so there can only ever be one bootstrap state.
 *
 * status: AVAILABLE   — prepared, awaiting the owner's enrollment
 *         IN_PROGRESS — an enrollment ceremony is live
 *         SEALED      — an administrator was activated; permanently closed
 */
export const adminBootstrapState = pgTable("admin_bootstrap_state", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("AVAILABLE"),
  adminUserId: text("admin_user_id").references(() => users.id),
  enrollmentStartedAt: timestamp("enrollment_started_at", { withTimezone: true }),
  sealedAt: timestamp("sealed_at", { withTimezone: true }),
  sealedByUserId: text("sealed_by_user_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A short-lived, single-use enrollment ceremony.
 *
 * The raw enrollment token is delivered ONLY as an httpOnly cookie to the
 * operator's browser; the database stores only its SHA-256 hash. The MFA secret
 * and recovery-code hashes are STAGED here (encrypted at rest) until the ceremony
 * completes, so an abandoned or replayed ceremony never leaves a half-enrolled,
 * loginable administrator behind.
 */
export const adminEnrollmentSessions = pgTable(
  "admin_enrollment_sessions",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull(),
    adminUserId: text("admin_user_id")
      .notNull()
      .references(() => users.id),
    email: text("email").notNull(),
    // MFA_PENDING → MFA_VERIFIED → CONSUMED
    step: text("step").notNull().default("MFA_PENDING"),
    // ACTIVE | CONSUMED | EXPIRED
    status: text("status").notNull().default("ACTIVE"),
    // The chosen password, hashed with the canonical algorithm, staged until the
    // ceremony is completed atomically. NEVER a plaintext password.
    passwordHash: text("password_hash").notNull(),
    passwordAlgo: text("password_algo").notNull().default("scrypt"),
    mfaSecretEncrypted: text("mfa_secret_encrypted").notNull(),
    mfaRecoveryCodesHash: jsonb("mfa_recovery_codes_hash").$type<string[]>().notNull().default([]),
    mfaLastAcceptedStep: integer("mfa_last_accepted_step"),
    mfaFailedAttempts: integer("mfa_failed_attempts").notNull().default(0),
    mfaLockedUntil: timestamp("mfa_locked_until", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("admin_enrollment_sessions_token_uidx").on(t.tokenHash)],
);
