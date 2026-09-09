/**
 * BEYU OS — Government Integration Fabric (shared module, NOT a separate OS).
 *
 * ONE canonical Government Integration Gateway inside BEYU OS. Sector systems
 * (Health, Finance, Agriculture, HCM) reach government systems ONLY through
 * this boundary — never through sector-local adapters and never directly.
 *
 * DESIGN PRECEDENT: this module deliberately mirrors the payment shared module
 * (schema/payments.ts). The registry row is the only place that may speak
 * about external reality, statuses are a record of separate verified facts
 * (never a single `integrated` boolean), and fabricated acceptance is
 * unrepresentable: a submission cannot be ACCEPTED without an external
 * reference returned by the actual government system (CHECK constraint in
 * migration 0036).
 *
 * CREDENTIALS: rows carry env-var NAMES (credential references) only.
 * Secret values never enter the database, source control or logs.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { users } from "./identity";

/**
 * Canonical registry of government systems (agencies/authorities). GLOBAL
 * reference data — configuration is governed: the runtime role holds SELECT
 * only; every change arrives through the governed admin path
 * (BEYU_ADMIN_DATABASE_URL), exactly like payment_providers.
 *
 * `integration_status` is the ONLY field that speaks about external reality:
 *   NOT_STARTED | DISCOVERY | CONTRACT_PENDING | CONTRACT_VERIFIED |
 *   IMPLEMENTING | IMPLEMENTED | SANDBOX_READY | UAT_VERIFIED |
 *   PRODUCTION_AUTHORIZATION_PENDING | PRODUCTION_READY | LIVE |
 *   DEGRADED | EXTERNAL_BLOCKED | SUSPENDED
 * LIVE / PRODUCTION_READY require recorded human approval (CHECK, 0036).
 */
export const governmentAgencies = pgTable(
  "government_agencies",
  {
    code: text("code").primaryKey(), // e.g. TRA_VFD, NHIF, NIDA, BRELA, DHIS2, TMDA, NSSF, WCF, OSHA, PSSSF
    name: text("name").notNull(),
    countryCode: text("country_code").notNull().references(() => countries.code),
    category: text("category").notNull(), // TAX_AUTHORITY | HEALTH_INSURER | IDENTITY_AUTHORITY | COMPANY_REGISTRY | HEALTH_REPORTING | REGULATOR | SOCIAL_SECURITY | SAFETY_AUTHORITY | OTHER_MDA
    /** Which BEYU consumers this agency serves (informational). */
    consumers: jsonb("consumers").$type<string[]>().notNull().default([]),
    integrationStatus: text("integration_status").notNull().default("NOT_STARTED"),
    /** Official interface reality — never invented. */
    interfaceKind: text("interface_kind").notNull().default("UNVERIFIED"), // UNVERIFIED | REST_JSON | HTTP_XML | SOAP | PORTAL_ONLY | FILE_EXCHANGE | NONE_PUBLISHED
    officialDocsUrl: text("official_docs_url"),
    authModel: text("auth_model").notNull().default("UNVERIFIED"), // UNVERIFIED | TOKEN_BEARER | BASIC_THEN_TOKEN | MTLS_CERT | SIGNED_XML | OAUTH2 | PAT | NONE
    credentialStatus: text("credential_status").notNull().default("NOT_ISSUED"), // NOT_ISSUED | SANDBOX_ISSUED | PRODUCTION_ISSUED | ROTATION_REQUIRED | REFUSED
    /** Env-var NAMES the adapter reads at call time. Never secret values. */
    credentialRefs: jsonb("credential_refs").$type<string[]>().notNull().default([]),
    sandboxEvidence: text("sandbox_evidence"),
    uatEvidence: text("uat_evidence"),
    productionEvidence: text("production_evidence"),
    blockedReason: text("blocked_reason"),
    /** Governance of the row itself: who authorized activation, on what basis. */
    enabledBy: text("enabled_by"),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    approvalReference: text("approval_reference"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("government_agencies_country_idx").on(t.countryCode), index("government_agencies_category_idx").on(t.category)],
);

/**
 * Governed government submissions — every outbound material government
 * operation (fiscal receipt, claim, verification request, report) is a row
 * here BEFORE any external call, and its terminal state records what the
 * government system actually said.
 *
 * FAIL-CLOSED STATE MODEL (§16.9): a submission is never represented as
 * accepted unless the actual government system returned verified acceptance.
 *   DRAFT | PENDING_EXTERNAL | SUBMITTED | ACCEPTED | REJECTED | FAILED |
 *   RETRY_REQUIRED | RECONCILIATION_REQUIRED | EXTERNAL_UNAVAILABLE |
 *   EXTERNAL_BLOCKED
 * DB invariant (0036): status='ACCEPTED' requires external_reference NOT NULL.
 *
 * PRIVACY: the row stores payload/response DIGESTS and a storage reference,
 * never raw government or personal data, so cross-tenant leakage through this
 * table cannot expose PII even if RLS were misconfigured (defence in depth).
 */
export const governmentSubmissions = pgTable(
  "government_submissions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    agencyCode: text("agency_code").notNull().references(() => governmentAgencies.code),
    submissionType: text("submission_type").notNull(), // e.g. TRA_FISCAL_RECEIPT | TRA_Z_REPORT | NHIF_CLAIM_FOLIO | NHIF_ELIGIBILITY | DHIS2_AGGREGATE_REPORT | VERIFICATION
    status: text("status").notNull().default("DRAFT"),
    /** SHA-256 of the canonical outbound payload. Raw payload lives in governed storage, referenced only. */
    payloadDigest: text("payload_digest").notNull(),
    payloadRef: text("payload_ref"),
    responseDigest: text("response_digest"),
    /** The government system's own reference for verified acceptance. */
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastErrorCode: text("last_error_code"),
    submittedByUserId: text("submitted_by_user_id").references(() => users.id),
    policyVersion: text("policy_version"),
    approvalReference: text("approval_reference"),
    auditId: text("audit_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("government_submissions_idem_uidx").on(t.tenantId, t.agencyCode, t.idempotencyKey),
    index("government_submissions_tenant_idx").on(t.tenantId),
    index("government_submissions_agency_idx").on(t.agencyCode),
    index("government_submissions_status_idx").on(t.status),
  ],
);
