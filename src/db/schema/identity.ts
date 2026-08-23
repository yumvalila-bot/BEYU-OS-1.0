/**
 * BEYU OS — ONE identity model for the whole ecosystem.
 * Authoritative for: parties (MDM), users, sessions, roles, permissions,
 * grants, delegation, emergency access and consent.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  classificationEnum,
  lifecycleStatusEnum,
  partyTypeEnum,
  verificationStatusEnum,
} from "./enums";
import { legalEntities, tenants } from "./core";

/** Master party record — every human, org, service, AI agent or device. */
export const parties = pgTable(
  "parties",
  {
    id: text("id").primaryKey(),
    type: partyTypeEnum("type").notNull(),
    displayName: text("display_name").notNull(),
    legalName: text("legal_name"),
    givenName: text("given_name"),
    familyName: text("family_name"),
    birthDate: date("birth_date"),
    nationality: text("nationality"),
    countryCode: text("country_code"),
    email: text("email"),
    phone: text("phone"),
    kycStatus: verificationStatusEnum("kyc_status").notNull().default("UNVERIFIED"),
    kycMethod: text("kyc_method"),
    biometricConsent: boolean("biometric_consent").notNull().default(false),
    duplicateOfPartyId: text("duplicate_of_party_id"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("parties_name_idx").on(t.displayName)],
);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordAlgo: text("password_algo").notNull().default("scrypt"),
    passwordMustChange: boolean("password_must_change").notNull().default(false),
    mfaEnrolled: boolean("mfa_enrolled").notNull().default(false),
    mfaMethod: text("mfa_method"),
    mfaSecretEncrypted: text("mfa_secret_encrypted"),
    mfaRecoveryCodesHash: jsonb("mfa_recovery_codes_hash").$type<string[]>().notNull().default([]),
    mfaLastAcceptedStep: integer("mfa_last_accepted_step"),
    mfaFailedAttempts: integer("mfa_failed_attempts").notNull().default(0),
    mfaLockedUntil: timestamp("mfa_locked_until", { withTimezone: true }),
    primaryTenantId: text("primary_tenant_id")
      .notNull()
      .references(() => tenants.id),
    isServiceAccount: boolean("is_service_account").notNull().default(false),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_uidx").on(t.email),
    // ONE GlobalUserID per canonical party. Existing duplicate detection in
    // lib/identity.ts remains useful for pre-migration diagnostics, but durable
    // identity uniqueness must not rely on consumers noticing a conflict.
    uniqueIndex("users_party_uidx").on(t.partyId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    deviceTrust: text("device_trust").notNull().default("UNKNOWN"),
    riskScore: integer("risk_score").notNull().default(0),
    mfaSatisfied: boolean("mfa_satisfied").notNull().default(false),
    mfaSatisfiedAt: timestamp("mfa_satisfied_at", { withTimezone: true }),
    mfaExpiresAt: timestamp("mfa_expires_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("sessions_token_uidx").on(t.tokenHash), index("sessions_user_idx").on(t.userId)],
);

export const roles = pgTable(
  "roles",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    scopeLevel: text("scope_level").notNull(), // ENTERPRISE | COUNTRY | ENTITY | TENANT | SECTOR
    privileged: boolean("privileged").notNull().default(false),
    separationGroup: text("separation_group"),
  },
  (t) => [uniqueIndex("roles_code_uidx").on(t.code)],
);

export const permissions = pgTable(
  "permissions",
  {
    code: text("code").primaryKey(), // domain:action e.g. governance:resolution.approve
    domain: text("domain").notNull(),
    action: text("action").notNull(),
    description: text("description").notNull(),
    classificationCeiling: classificationEnum("classification_ceiling").notNull().default("CONFIDENTIAL"),
    requiresMfa: boolean("requires_mfa").notNull().default(false),
    highRisk: boolean("high_risk").notNull().default(false),
  },
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: text("id").primaryKey(),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    permissionCode: text("permission_code")
      .notNull()
      .references(() => permissions.code),
  },
  (t) => [uniqueIndex("role_permissions_uidx").on(t.roleId, t.permissionCode)],
);

export const roleAssignments = pgTable(
  "role_assignments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    grantedBy: text("granted_by").notNull(),
    justification: text("justification").notNull(),
  },
  (t) => [index("role_assignments_user_idx").on(t.userId)],
);

/** Emergency ("break-glass") access — time limited, logged, reviewed. */
export const emergencyAccessGrants = pgTable("emergency_access_grants", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  permissionCodes: jsonb("permission_codes").$type<string[]>().notNull().default([]),
  reason: text("reason").notNull(),
  approvedBy: text("approved_by").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokedBy: text("revoked_by"),
  revokeReason: text("revoke_reason"),
  postReviewBy: text("post_review_by"),
  postReviewAt: timestamp("post_review_at", { withTimezone: true }),
  postReviewOutcome: text("post_review_outcome"),
});

/** Delegation of authority (human → human, human → AI is prohibited for material acts). */
export const delegations = pgTable("delegations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  fromUserId: text("from_user_id")
    .notNull()
    .references(() => users.id),
  toUserId: text("to_user_id")
    .notNull()
    .references(() => users.id),
  scope: text("scope").notNull(),
  monetaryLimit: text("monetary_limit"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to").notNull(),
  authorizedBy: text("authorized_by").notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const consents = pgTable("consents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id),
  purpose: text("purpose").notNull(),
  lawfulBasis: text("lawful_basis").notNull(),
  jurisdictionCode: text("jurisdiction_code").notNull(),
  granted: boolean("granted").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  evidenceDocumentId: text("evidence_document_id"),
});
