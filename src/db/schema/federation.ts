/**
 * BEYU OS — Federation & Trust (SHARED BEYU OS CAPABILITY — NOT an OS).
 *
 * ONE canonical federation plane for external authorities, jurisdictions,
 * interoperability and trust. Tanzania is the first JURISDICTION PROFILE;
 * every future country is another profile — the core is jurisdiction-generic.
 *
 * RELATIONSHIP TO THE EXISTING FABRIC (migration 0036):
 *   - `government_agencies` / `government_submissions` remain the canonical
 *     OUTBOUND SUBMISSION PLANE (governed gateway, digest-only payloads).
 *   - THIS module is the TRUST & DISCOVERY PLANE: the comprehensive authority
 *     inventory, services, datasets, connectors, evidence, verifications,
 *     cost/access classification, legal basis, consent, agreements,
 *     capability negotiation and jurisdiction transitions.
 *   - Cross-link: `federation_authorities.legacy_agency_code` (unique, FK to
 *     government_agencies.code) — one identity, two planes. Never duplicated.
 *
 * FAIL-CLOSED BY INVARIANT (0071 CHECK constraints mirror src/lib/federation):
 *   - LIVE / LIVE_VERIFIED / PRODUCTION_APPROVAL ⇒ production evidence FK +
 *     named approver + approval reference.
 *   - FREE_CONFIRMED ⇒ cost evidence FK (never inferred).
 *   - VERIFIED+ verification levels ⇒ evidence FK.
 *   - APPROVED access request ⇒ approval row FK.
 *
 * CREDENTIALS: env-var NAMES only (credential refs), never secret values —
 * the fabric precedent (0036) holds.
 *
 * RLS: registry tables are global reference data, runtime SELECT-only
 * (FORCE RLS, mirroring 0036 government_agencies / payment_providers);
 * operational tables (consents, access requests, approvals, agreements,
 * transitions) are tenant + entity scoped via beyu_tenant_ids().
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { governmentAgencies } from "./government";
import { users } from "./identity";

/* ------------------------------------------------------------------ */
/* Jurisdictions (program §13, §77)                                    */
/* ------------------------------------------------------------------ */

export const federationJurisdictions = pgTable("federation_jurisdictions", {
  code: text("code").primaryKey().notNull(), // e.g. TZ, KE, EAC
  name: text("name").notNull(),
  kind: text("kind").notNull().default("COUNTRY"), // COUNTRY | REGIONAL_BLOC | INTERNATIONAL | PRIVATE_INSTITUTION
  status: text("status").notNull().default("PROPOSED"), // PROPOSED | ACTIVE | INACTIVE
  countryCode: text("country_code").references(() => countries.code), // null for blocs
  governmentStructure: text("government_structure"),
  authorityDirectorySource: text("authority_directory_source"),
  /** Legal framework, data protection, identity, trust services — references, not re-derivations. */
  legalFrameworkReferences: jsonb("legal_framework_references").$type<string[]>().notNull().default([]),
  dataProtectionFramework: text("data_protection_framework"),
  identityFramework: text("identity_framework"),
  /**
   * GovESB-style integration regime as REQUIREMENTS TO VERIFY (program §12):
   * system registration, security assessment, sandbox, DR site, DSA, network
   * requirements… A profile stating requirements is NOT a compliance claim.
   */
  integrationRegime: jsonb("integration_regime").$type<Record<string, unknown>>().notNull().default({}),
  networkRequirements: jsonb("network_requirements").$type<string[]>().notNull().default([]),
  trustServices: jsonb("trust_services").$type<string[]>().notNull().default([]),
  dataResidency: jsonb("data_residency").$type<Record<string, unknown>>().notNull().default({}),
  crossBorderInterfaces: jsonb("cross_border_interfaces").$type<string[]>().notNull().default([]),
  profileVersion: text("profile_version").notNull().default("1.0.0"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Domain taxonomy (program §14) — per jurisdiction, not hard-coded    */
/* ------------------------------------------------------------------ */

export const federationDomains = pgTable(
  "federation_domains",
  {
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    code: text("code").notNull(), // e.g. TAX, HEALTH, UJENZI
    displayName: text("display_name").notNull(),
    parentCode: text("parent_code"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("federation_domains_uidx").on(t.jurisdictionCode, t.code), index("federation_domains_jur_idx").on(t.jurisdictionCode)],
);

/* ------------------------------------------------------------------ */
/* Evidence / provenance (program §53) — every claim is evidence-backed */
/* ------------------------------------------------------------------ */

export const federationEvidence = pgTable(
  "federation_evidence",
  {
    id: text("id").primaryKey().notNull(),
    type: text("type").notNull(), // EVIDENCE_TYPES
    subjectType: text("subject_type").notNull(), // EVIDENCE_SUBJECT_TYPES
    subjectId: text("subject_id").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    quote: text("quote"),
    /** SHA-256 of the captured artifact (or of the reference document). */
    artifactHash: text("artifact_hash"),
    artifactRef: text("artifact_ref"),
    sourceName: text("source_name").notNull(),
    sourceVersion: text("source_version"),
    capturedBy: text("captured_by").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
    /** Evidence ages: revalidation deadline for time-bound facts. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("VALID"), // VALID | EXPIRED | INVALIDATED
    notes: text("notes"),
  },
  (t) => [
    index("federation_evidence_subject_idx").on(t.subjectType, t.subjectId),
    index("federation_evidence_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Legal basis (program §78) — never invented                          */
/* ------------------------------------------------------------------ */

export const federationLegalBases = pgTable(
  "federation_legal_bases",
  {
    id: text("id").primaryKey().notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    code: text("code").notNull(),
    basisType: text("basis_type").notNull(), // LEGAL_BASIS_TYPES
    legalSource: text("legal_source").notNull(),
    legalReference: text("legal_reference"),
    purpose: text("purpose").notNull(),
    scope: text("scope"),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    reviewedBy: text("reviewed_by"),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    status: text("status").notNull().default("DRAFT"), // DRAFT | CONFIRMED | EXPIRED | REVOKED
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("federation_legal_bases_uidx").on(t.jurisdictionCode, t.code), index("federation_legal_bases_jur_idx").on(t.jurisdictionCode)],
);

/* ------------------------------------------------------------------ */
/* Agreements (program §80) — tenant-scoped                            */
/* ------------------------------------------------------------------ */

export const federationAgreements = pgTable(
  "federation_agreements",
  {
    id: text("id").primaryKey().notNull(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    code: text("code").notNull(),
    type: text("type").notNull(), // AGREEMENT_TYPES
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    counterparty: text("counterparty").notNull(),
    parties: jsonb("parties").$type<string[]>().notNull().default([]),
    scope: text("scope"),
    services: jsonb("services").$type<string[]>().notNull().default([]),
    datasets: jsonb("datasets").$type<string[]>().notNull().default([]),
    legalBasisId: text("legal_basis_id").references(() => federationLegalBases.id),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    renewalRequired: text("renewal_required").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    restrictions: jsonb("restrictions").$type<string[]>().notNull().default([]),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    approvedBy: text("approved_by"),
    approvalReference: text("approval_reference"),
    status: text("status").notNull().default("PROPOSED"), // AGREEMENT_STATUS
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_agreements_uidx").on(t.tenantId, t.code),
    index("federation_agreements_tenant_idx").on(t.tenantId),
    index("federation_agreements_authority_idx").on(t.authorityId),
    index("federation_agreements_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Authorities (program §6, §7, §15) — comprehensive inventory         */
/* ------------------------------------------------------------------ */

export const federationAuthorities = pgTable(
  "federation_authorities",
  {
    id: text("id").primaryKey().notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    /** Stable per-jurisdiction code, e.g. NIDA, TRA, TZ_REGION_DAR. */
    code: text("code").notNull(),
    domainCode: text("domain_code").notNull(), // federation_domains.code within the jurisdiction
    officialName: text("official_name").notNull(),
    shortName: text("short_name"),
    authorityType: text("authority_type").notNull().default("AGENCY"), // AUTHORITY_TYPES
    parentAuthorityCode: text("parent_authority_code"),
    legalMandate: text("legal_mandate"),
    officialWebsite: text("official_website"),
    officialContact: text("official_contact"),
    /** The authoritative directory/registry the record was discovered in. */
    directorySource: text("directory_source"),
    jurisdictionScope: text("jurisdiction_scope"), // NATIONAL | REGIONAL | LOCAL | INTERNATIONAL | UNION
    geographicScope: text("geographic_scope"),
    sectorDomains: jsonb("sector_domains").$type<string[]>().notNull().default([]),
    dataOwner: text("data_owner"),
    dataCustodian: text("data_custodian"),
    serviceProvider: text("service_provider").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    serviceConsumer: text("service_consumer").notNull().default("UNKNOWN"),
    dataCategories: jsonb("data_categories").$type<string[]>().notNull().default([]),
    permittedPurposes: jsonb("permitted_purposes").$type<string[]>().notNull().default([]),
    consentRequired: text("consent_required").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    authenticationMethod: text("authentication_method"),
    authorizationRequirement: text("authorization_requirement"),
    agreementRequired: text("agreement_required").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    securityRequirement: text("security_requirement"),
    integrationChannel: text("integration_channel"), // DIRECT | GOVESB | PORTAL | MANUAL | UNKNOWN
    apiStatus: text("api_status").notNull().default("UNVERIFIED"), // API_STATUS
    govesbStatus: text("govesb_status").notNull().default("GOVESB_UNKNOWN"), // GOVESB_STATUS
    /** Separate verified facts — never collapsed into one "integrated" flag. */
    verificationStatus: text("verification_status").notNull().default("REGISTERED"), // VERIFICATION_LEVELS
    accessCostStatus: text("access_cost_status").notNull().default("UNKNOWN_COST"), // ACCESS_COST_STATUS
    feeAmount: text("fee_amount"),
    currency: text("currency"),
    feeUnit: text("fee_unit"),
    recurringFee: text("recurring_fee"),
    transactionFee: text("transaction_fee"),
    subscriptionFee: text("subscription_fee"),
    setupFee: text("setup_fee"),
    securityCost: text("security_cost"),
    infrastructureCost: text("infrastructure_cost"),
    certificateCost: text("certificate_cost"),
    agreementCost: text("agreement_cost"),
    costEvidenceId: text("cost_evidence_id").references(() => federationEvidence.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    evidenceReference: text("evidence_reference"),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    /** Production evidence gate (LIVE-family states). */
    productionEvidenceId: text("production_evidence_id").references(() => federationEvidence.id),
    approvedBy: text("approved_by"),
    approvalReference: text("approval_reference"),
    sourceVersion: text("source_version"),
    recordStatus: text("record_status").notNull().default("REGISTERED"), // AUTHORITY_RECORD_STATUS
    lifecycleStatus: text("lifecycle_status").notNull().default("DISCOVERED"), // FEDERATION_LIFECYCLE
    /** Reconciliation against the authoritative directory. */
    reconciliationState: text("reconciliation_state").notNull().default("PENDING_RECONCILIATION"),
    /** Cross-link to the 0036 submission-plane registry (one identity, two planes). */
    legacyAgencyCode: text("legacy_agency_code").references(() => governmentAgencies.code),
    notes: text("notes"),
    createdBy: text("created_by").notNull().default("SEED/FEDERATION_BOOTSTRAP"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_authorities_uidx").on(t.jurisdictionCode, t.code),
    index("federation_authorities_jur_idx").on(t.jurisdictionCode),
    index("federation_authorities_domain_idx").on(t.jurisdictionCode, t.domainCode),
    index("federation_authorities_type_idx").on(t.authorityType),
    index("federation_authorities_lifecycle_idx").on(t.lifecycleStatus),
    index("federation_authorities_recon_idx").on(t.jurisdictionCode, t.reconciliationState),
  ],
);

/* ------------------------------------------------------------------ */
/* Services (program §50) — each service has INDEPENDENT status        */
/* ------------------------------------------------------------------ */

export const federationServices = pgTable(
  "federation_services",
  {
    id: text("id").primaryKey().notNull(),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    code: text("code").notNull(), // unique per authority, e.g. NIN_VERIFICATION
    name: text("name").notNull(),
    description: text("description"),
    /** External-authority data classification (program §11). */
    dataClassification: text("data_classification").notNull().default("UNVERIFIED"), // EXTERNAL_DATA_CLASSIFICATION | UNVERIFIED
    purpose: text("purpose"),
    legalBasisId: text("legal_basis_id").references(() => federationLegalBases.id),
    consentRequired: text("consent_required").notNull().default("UNKNOWN"),
    agreementRequired: text("agreement_required").notNull().default("UNKNOWN"),
    agreementId: text("agreement_id").references(() => federationAgreements.id),
    accessCostStatus: text("access_cost_status").notNull().default("UNKNOWN_COST"),
    feeDetails: jsonb("fee_details").$type<Record<string, unknown>>().notNull().default({}),
    costEvidenceId: text("cost_evidence_id").references(() => federationEvidence.id),
    credentialRequired: text("credential_required").notNull().default("UNKNOWN"),
    /** FK in migration 0071. Type-level reference omitted: services ↔ connectors form a circular FK pair; the reverse edge (connectors.serviceId) carries the type link. */
    connectorId: text("connector_id"),
    /** FK in migration 0071. Type-level reference omitted: services ↔ schemas form a circular FK pair; the reverse edge (schemas.serviceId) carries the type link. */
    schemaId: text("schema_id"),
    apiStatus: text("api_status").notNull().default("UNVERIFIED"),
    govesbStatus: text("govesb_status").notNull().default("GOVESB_UNKNOWN"),
    verificationStatus: text("verification_status").notNull().default("REGISTERED"),
    productionEvidenceId: text("production_evidence_id").references(() => federationEvidence.id),
    approvedBy: text("approved_by"),
    approvalReference: text("approval_reference"),
    accessLevel: text("access_level").notNull().default("NOT_CONNECTED"), // NOT_CONNECTED | REQUESTED | GRANTED | REVOKED | EXPIRED
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_services_uidx").on(t.authorityId, t.code),
    index("federation_services_authority_idx").on(t.authorityId),
    index("federation_services_cost_idx").on(t.accessCostStatus),
  ],
);

/* ------------------------------------------------------------------ */
/* Datasets (program §51)                                              */
/* ------------------------------------------------------------------ */

export const federationDatasets = pgTable(
  "federation_datasets",
  {
    id: text("id").primaryKey().notNull(),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    owner: text("owner"),
    custodian: text("custodian"),
    classification: text("classification").notNull().default("UNVERIFIED"), // EXTERNAL_DATA_CLASSIFICATION | UNVERIFIED
    fields: jsonb("fields").$type<Record<string, unknown>>().notNull().default({}),
    schemaId: text("schema_id").references(() => federationSchemas.id),
    purpose: text("purpose"),
    legalBasisId: text("legal_basis_id").references(() => federationLegalBases.id),
    consentRequired: text("consent_required").notNull().default("UNKNOWN"),
    retention: text("retention"),
    source: text("source"),
    updateFrequency: text("update_frequency"),
    permittedConsumers: jsonb("permitted_consumers").$type<string[]>().notNull().default([]),
    restrictions: jsonb("restrictions").$type<string[]>().notNull().default([]),
    costStatus: text("cost_status").notNull().default("UNKNOWN_COST"),
    verificationStatus: text("verification_status").notNull().default("REGISTERED"),
    version: text("version").notNull().default("1.0.0"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_datasets_uidx").on(t.authorityId, t.code),
    index("federation_datasets_authority_idx").on(t.authorityId),
    index("federation_datasets_classification_idx").on(t.classification),
  ],
);

/* ------------------------------------------------------------------ */
/* Schemas (program §52) — versioned, never silently changed           */
/* ------------------------------------------------------------------ */

export const federationSchemas = pgTable(
  "federation_schemas",
  {
    id: text("id").primaryKey().notNull(),
    code: text("code").notNull(),
    version: integer("version").notNull().default(1),
    authorityId: text("authority_id").references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    name: text("name").notNull(),
    format: text("format").notNull().default("UNKNOWN"), // JSON | XML | FHIR | ISO20022 | CSV | PROPR | UNKNOWN
    definitionRef: text("definition_ref"), // governed document reference — never inline secrets
    fieldMap: jsonb("field_map").$type<Record<string, unknown>>().notNull().default({}),
    compatibility: text("compatibility").notNull().default("COMPATIBLE"), // ADDITIVE | BREAKING | COMPATIBLE
    status: text("status").notNull().default("PROPOSED"), // SCHEMA_STATUS
    supersedesId: text("supersedes_id"),
    createdBy: text("created_by"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_schemas_uidx").on(t.code, t.version),
    index("federation_schemas_authority_idx").on(t.authorityId),
    index("federation_schemas_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Credentials (program §65) — env-var NAMES only, never values        */
/* ------------------------------------------------------------------ */

export const federationCredentials = pgTable(
  "federation_credentials",
  {
    id: text("id").primaryKey().notNull(),
    code: text("code").notNull(),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    /** FK in migration 0071. Type-level reference omitted: credentials ↔ connectors form a circular FK pair; the reverse edge (connectors.credentialId) carries the type link. */
    connectorId: text("connector_id"),
    credentialClass: text("credential_class").notNull().default("SANDBOX"), // CREDENTIAL_CLASS
    /** Env-var NAMES the connector reads at call time. NEVER secret values. */
    envVarRefs: jsonb("env_var_refs").$type<string[]>().notNull().default([]),
    issuedBy: text("issued_by"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rotationRequired: text("rotation_required").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    status: text("status").notNull().default("NOT_ISSUED"), // CREDENTIAL_STATUS
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_credentials_uidx").on(t.code),
    index("federation_credentials_authority_idx").on(t.authorityId),
    index("federation_credentials_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Connectors (program §49, §81) — the framework, not live government  */
/* traffic. Live traffic routes through the existing government        */
/* gateway (0036) where evidence + credentials legitimately exist.     */
/* ------------------------------------------------------------------ */

export const federationConnectors = pgTable(
  "federation_connectors",
  {
    id: text("id").primaryKey().notNull(),
    code: text("code").notNull(),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    connectorType: text("connector_type").notNull().default("MANUAL_PORTAL"), // CONNECTOR_TYPES
    endpointRef: text("endpoint_ref"), // non-secret reference (doc/env name), never a live credential
    authModel: text("auth_model"),
    credentialId: text("credential_id").references(() => federationCredentials.id),
    govesbStatus: text("govesb_status").notNull().default("GOVESB_UNKNOWN"),
    status: text("status").notNull().default("PROPOSED"), // CONNECTOR_STATUS
    isMock: text("is_mock").notNull().default("FALSE"), // TRUE | FALSE
    /** Health metrics (program §81) — recorded facts, updated by the connector worker. */
    health: text("health").notNull().default("UNKNOWN"), // CONNECTOR_HEALTH
    availabilityPct: text("availability_pct"),
    latencyMs: integer("latency_ms"),
    errorRatePct: text("error_rate_pct"),
    authFailures: integer("auth_failures").notNull().default(0),
    schemaFailures: integer("schema_failures").notNull().default(0),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_connectors_uidx").on(t.code),
    index("federation_connectors_authority_idx").on(t.authorityId),
    index("federation_connectors_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Consents (program §79) — tenant-scoped                              */
/* ------------------------------------------------------------------ */

export const federationConsents = pgTable(
  "federation_consents",
  {
    id: text("id").primaryKey().notNull(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    authorityId: text("authority_id").references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    datasetId: text("dataset_id").references(() => federationDatasets.id),
    /** Consent subject — canonical BEYU party (GlobalUserID carrier), never an external id. */
    subjectPartyId: text("subject_party_id").notNull(),
    purpose: text("purpose").notNull(),
    jurisdictionCode: text("jurisdiction_code").references(() => federationJurisdictions.code),
    method: text("method"),
    status: text("status").notNull().default("REQUESTED"), // CONSENT_STATUS
    grantedAt: timestamp("granted_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    supersededById: text("superseded_by_id"),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("federation_consents_tenant_idx").on(t.tenantId),
    index("federation_consents_subject_idx").on(t.subjectPartyId),
    index("federation_consents_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* Access requests + approvals (program §64) — tenant-scoped           */
/* ------------------------------------------------------------------ */

export const federationAccessRequests = pgTable(
  "federation_access_requests",
  {
    id: text("id").primaryKey().notNull(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").notNull().references(() => legalEntities.id),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    purpose: text("purpose").notNull(),
    classification: text("classification").notNull().default("UNVERIFIED"),
    legalBasisId: text("legal_basis_id").references(() => federationLegalBases.id),
    consentId: text("consent_id").references(() => federationConsents.id),
    agreementId: text("agreement_id").references(() => federationAgreements.id),
    credentialClass: text("credential_class").notNull().default("SANDBOX"),
    justification: text("justification"),
    requestedBy: text("requested_by").references(() => users.id),
    approvalId: text("approval_id"), // set only when a distinct approver row exists
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull().default("DRAFT"), // ACCESS_REQUEST_STATUS
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("federation_access_requests_tenant_idx").on(t.tenantId),
    index("federation_access_requests_authority_idx").on(t.authorityId),
    index("federation_access_requests_status_idx").on(t.status),
  ],
);

export const federationApprovals = pgTable(
  "federation_approvals",
  {
    id: text("id").primaryKey().notNull(),
    accessRequestId: text("access_request_id").notNull().references(() => federationAccessRequests.id),
    approverUserId: text("approver_user_id").notNull().references(() => users.id),
    decision: text("decision").notNull(), // APPROVED | DENIED
    reason: text("reason"),
    approvalReference: text("approval_reference"),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_approvals_uidx").on(t.accessRequestId, t.approverUserId, t.decision),
    index("federation_approvals_request_idx").on(t.accessRequestId),
  ],
);

/* ------------------------------------------------------------------ */
/* Verifications (program §9)                                          */
/* ------------------------------------------------------------------ */

export const federationVerifications = pgTable(
  "federation_verifications",
  {
    id: text("id").primaryKey().notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    authorityId: text("authority_id").notNull().references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    level: text("level").notNull().default("REGISTERED"), // VERIFICATION_LEVELS
    verifiedBy: text("verified_by").notNull(),
    endpointService: text("endpoint_service"),
    testPerformed: text("test_performed"),
    result: text("result").notNull(),
    environment: text("environment").notNull().default("PRODUCTION"), // SANDBOX | PRODUCTION
    credentialClass: text("credential_class").notNull().default("MOCK"), // CREDENTIAL_CLASS
    schemaVersion: text("schema_version"),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    revalidateBy: timestamp("revalidate_by", { withTimezone: true }),
    notes: text("notes"),
  },
  (t) => [
    index("federation_verifications_authority_idx").on(t.authorityId),
    index("federation_verifications_level_idx").on(t.level),
  ],
);

/* ------------------------------------------------------------------ */
/* Incidents (program §82) — federation-plane incident workflow        */
/* ------------------------------------------------------------------ */

export const federationIncidents = pgTable(
  "federation_incidents",
  {
    id: text("id").primaryKey().notNull(),
    /** NULL = federation-plane/global incident (e.g. authority outage). */
    tenantId: text("tenant_id").references(() => tenants.id),
    authorityId: text("authority_id").references(() => federationAuthorities.id),
    serviceId: text("service_id").references(() => federationServices.id),
    connectorId: text("connector_id").references(() => federationConnectors.id),
    category: text("category").notNull(), // INCIDENT_CATEGORIES
    severity: text("severity").notNull().default("LOW"), // CRITICAL | HIGH | MEDIUM | LOW
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("DETECTED"), // INCIDENT_STATUS
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    containedAt: timestamp("contained_at", { withTimezone: true }),
    remediatedAt: timestamp("remediated_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    affectedServices: jsonb("affected_services").$type<string[]>().notNull().default([]),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("federation_incidents_status_idx").on(t.status),
    index("federation_incidents_authority_idx").on(t.authorityId),
    index("federation_incidents_category_idx").on(t.category),
  ],
);

/* ------------------------------------------------------------------ */
/* Jurisdiction transitions (program §62–63) — tenant-scoped           */
/* ------------------------------------------------------------------ */

export const federationTransitions = pgTable(
  "federation_transitions",
  {
    id: text("id").primaryKey().notNull(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    code: text("code").notNull(),
    originJurisdiction: text("origin_jurisdiction").notNull().references(() => federationJurisdictions.code),
    destinationJurisdiction: text("destination_jurisdiction").notNull().references(() => federationJurisdictions.code),
    subjectType: text("subject_type").notNull(), // TRANSITION_SUBJECT_TYPES
    subjectRef: text("subject_ref").notNull(),
    organizationId: text("organization_id").references(() => legalEntities.id),
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    legalRequirements: jsonb("legal_requirements").$type<string[]>().notNull().default([]),
    identityMapping: jsonb("identity_mapping").$type<Record<string, unknown>>().notNull().default({}),
    dataTransferRequirements: jsonb("data_transfer_requirements").$type<string[]>().notNull().default([]),
    residencyRequirements: jsonb("residency_requirements").$type<string[]>().notNull().default([]),
    taxRequirements: jsonb("tax_requirements").$type<string[]>().notNull().default([]),
    licensingRequirements: jsonb("licensing_requirements").$type<string[]>().notNull().default([]),
    serviceAvailability: jsonb("service_availability").$type<Record<string, unknown>>().notNull().default({}),
    consentRequired: text("consent_required").notNull().default("UNKNOWN"),
    agreementRequired: text("agreement_required").notNull().default("UNKNOWN"),
    evidenceId: text("evidence_id").references(() => federationEvidence.id),
    approvalReference: text("approval_reference"),
    status: text("status").notNull().default("PROPOSED"), // TRANSITION_STATUS
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("federation_transitions_uidx").on(t.tenantId, t.code),
    index("federation_transitions_tenant_idx").on(t.tenantId),
    index("federation_transitions_route_idx").on(t.originJurisdiction, t.destinationJurisdiction),
  ],
);

/* ------------------------------------------------------------------ */
/* Capability negotiation (program §61) — per jurisdiction × capability */
/* ------------------------------------------------------------------ */

export const federationCapabilities = pgTable(
  "federation_capabilities",
  {
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    capabilityCode: text("capability_code").notNull(), // e.g. IDENTITY_VERIFICATION, TAX_FILING
    availability: text("availability").notNull().default("NOT_IMPLEMENTED"), // CAPABILITY_AVAILABILITY
    legalBasisRef: text("legal_basis_ref"),
    connectorRef: text("connector_ref"),
    dataResidency: text("data_residency"),
    costStatus: text("cost_status").notNull().default("UNKNOWN_COST"),
    requiresHumanApproval: text("requires_human_approval").notNull().default("UNKNOWN"), // TRUE | FALSE | UNKNOWN
    notes: text("notes"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Matches 0071 DDL: PRIMARY KEY (jurisdiction_code, capability_code) — the
    // capability is defined per jurisdiction profile (one row per capability per
    // jurisdiction), so the composite key IS the identity, not a single column.
    // The name is pinned to the constraint 0071 actually created so the
    // schema-drift gate compares like-for-like.
    primaryKey({ columns: [t.jurisdictionCode, t.capabilityCode], name: "federation_capabilities_pkey" }),
    uniqueIndex("federation_capabilities_uidx").on(t.jurisdictionCode, t.capabilityCode),
  ],
);

/* ------------------------------------------------------------------ */
/* Reconciliation (program §55, §95) — repeatable, never a one-off     */
/* ------------------------------------------------------------------ */

export const federationReconciliationRuns = pgTable(
  "federation_reconciliation_runs",
  {
    id: text("id").primaryKey().notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull().references(() => federationJurisdictions.code),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url"),
    sourceVersion: text("source_version"),
    executedBy: text("executed_by").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }).notNull().defaultNow(),
    totals: jsonb("totals").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").notNull().default("COMPLETED"), // COMPLETED | PARTIAL | FAILED
    notes: text("notes"),
  },
  (t) => [index("federation_reconciliation_runs_jur_idx").on(t.jurisdictionCode, t.executedAt)],
);

export const federationReconciliationResults = pgTable(
  "federation_reconciliation_results",
  {
    id: text("id").primaryKey().notNull(),
    runId: text("run_id").notNull().references(() => federationReconciliationRuns.id),
    candidateCode: text("candidate_code").notNull(),
    candidateName: text("candidate_name").notNull(),
    state: text("state").notNull(), // RECONCILIATION_STATES
    matchedAuthorityId: text("matched_authority_id").references(() => federationAuthorities.id),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    resolution: text("resolution"),
  },
  (t) => [
    index("federation_reconciliation_results_run_idx").on(t.runId),
    index("federation_reconciliation_results_state_idx").on(t.state),
  ],
);
