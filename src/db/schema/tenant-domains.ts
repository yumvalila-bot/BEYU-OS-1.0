/**
 * GOVERNED TENANT-DOMAIN REGISTRY — the ONE source of truth for
 * hostname → tenant mapping.
 *
 * WHAT THIS IS
 *   A domain row records that ONE hostname belongs to ONE canonical tenant (and,
 *   optionally, one legal entity and country code) for ONE operating system.
 *   The request path resolves a hostname THROUGH this registry and then applies
 *   the EXISTING authorization chain (session → federation/OS authorization →
 *   tenant/entity/country scope → RBAC/ABAC/policy → RLS).
 *
 * WHAT THIS IS NOT
 *   • Not authorization. A hostname confers nothing: every request re-runs the
 *     existing gates server-side, and a domain row can only ever RESTRICT which
 *     tenant context a request is evaluated in — never grant one.
 *   • Not a second OS registry. `os` references a code from the canonical OS
 *     registry (`src/lib/operating-system-catalog.ts` / `core.os_registry`); it
 *     creates no operating system.
 *   • Not a tenant registry. `tenant_id` references `tenants`; a domain can never
 *     create, resurrect or activate a tenant. Registration is refused unless the
 *     tenant already exists and is operational.
 *   • Not a deployment. DNS records, wildcard certificates and Vercel domain
 *     configuration are platform/DNS facts (human-controlled, documented in
 *     `docs/architecture/TENANT_DOMAIN_ARCHITECTURE.md`); this table only records
 *     what the application will recognise.
 *
 * LIFECYCLE (canonical, governed, audited)
 *   CREATED ──verify──▶ VERIFIED status stays CREATED until an administrator
 *   activates it: CREATED/VERIFIED → ACTIVE → SUSPENDED → ACTIVE … →
 *   DEACTIVATED (retired, never deleted). Only ACTIVE + VERIFIED (for tenant
 *   names) rows resolve; everything else fails closed.
 */
import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  classificationEnum,
  domainTypeEnum,
  lifecycleStatusEnum,
  verificationStatusEnum,
} from "./enums";
import { countries, legalEntities, tenants } from "./core";

/** Verification methods actually implemented. Nothing else is accepted. */
export const DOMAIN_VERIFICATION_METHODS = {
  /** Live DNS TXT challenge check performed by the application (real lookup). */
  DNS_TXT: "DNS_TXT",
  /**
   * Platform deployment configuration: the OS base domain is configured in the
   * deployment platform/DNS by a human operator. Recorded honestly as
   * deployment configuration — never labelled as runtime-verified DNS.
   */
  PLATFORM_DEPLOYMENT_CONFIG: "PLATFORM_DEPLOYMENT_CONFIG",
} as const;

export const tenantDomains = pgTable(
  "tenant_domains",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    /** Canonical OS registry code (e.g. HEALTH_OS). Never a new OS. */
    os: text("os").notNull(),
    /** Optional legal-entity binding; must belong to `tenant_id` when present. */
    entityId: text("entity_id").references(() => legalEntities.id),
    /** Optional country binding from the canonical country registry. */
    countryCode: text("country_code").references(() => countries.code),
    /**
     * Normalised hostname: lowercase, no port, no trailing dot, no wildcard and
     * no scheme. Uniqueness is GLOBAL: one hostname maps to exactly one tenant,
     * so cross-OS collisions and tenant-slug collisions are impossible.
     */
    hostname: text("hostname").notNull(),
    domainType: domainTypeEnum("domain_type").notNull(),
    status: lifecycleStatusEnum("status").notNull().default("CREATED"),
    verificationState: verificationStatusEnum("verification_state")
      .notNull()
      .default("UNVERIFIED"),
    verificationMethod: text("verification_method")
      .notNull()
      .default(DOMAIN_VERIFICATION_METHODS.DNS_TXT),
    /**
     * SHA-256 of the DNS TXT challenge value. The plaintext challenge is
     * disclosed ONCE, at registration, and is cleared by verification — the
     * stored value proves the observed DNS record without being replayable.
     * Never selected by the hostname-resolution function.
     */
    verificationTokenHash: text("verification_token_hash"),
    /** Non-secret provenance of the verification (e.g. the record that was read). */
    verificationEvidence: text("verification_evidence"),
    /** GlobalUserID of the operator, or a bootstrap marker for seeded rows. */
    registeredBy: text("registered_by").notNull(),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenant_domains_hostname_uidx").on(t.hostname),
    index("tenant_domains_tenant_idx").on(t.tenantId),
    index("tenant_domains_os_idx").on(t.os),
    index("tenant_domains_type_status_idx").on(t.domainType, t.status),
    check(
      "tenant_domains_hostname_ck",
      sql`${t.hostname} = lower(${t.hostname}) AND length(${t.hostname}) BETWEEN 4 AND 253 AND ${t.hostname} ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'`,
    ),
    check("tenant_domains_os_ck", sql`${t.os} ~ '^[A-Z][A-Z0-9_]*$'`),
    check(
      "tenant_domains_verified_ck",
      sql`(${t.verificationState} = 'VERIFIED') = (${t.verifiedAt} IS NOT NULL)`,
    ),
    check(
      "tenant_domains_token_ck",
      sql`${t.verificationState} <> 'VERIFIED' OR ${t.verificationTokenHash} IS NULL`,
    ),
  ],
);
