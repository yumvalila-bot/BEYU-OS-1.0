/**
 * BEYU OS — Core control-plane structures.
 * Source of truth for: tenants, countries, jurisdictions, corporate structure,
 * organization units, ownership and the Sector/Future OS registry.
 */
import {
  boolean,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  classificationEnum,
  entityTypeEnum,
  lifecycleStatusEnum,
  ownershipTypeEnum,
  tenantTypeEnum,
  versionStatusEnum,
} from "./enums";

export const countries = pgTable("countries", {
  code: text("code").primaryKey(), // ISO 3166-1 alpha-2
  name: text("name").notNull(),
  region: text("region").notNull(),
  currencyCode: text("currency_code").notNull(),
  timezone: text("timezone").notNull(),
  locale: text("locale").notNull().default("en-US"),
  active: boolean("active").notNull().default(true),
});

export const jurisdictions = pgTable(
  "jurisdictions",
  {
    id: text("id").primaryKey(),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    level: text("level").notNull(), // NATIONAL | STATE | MUNICIPAL | REGULATOR
    code: text("code").notNull(),
    name: text("name").notNull(),
    regulator: text("regulator"),
    legalSystem: text("legal_system"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
  },
  (t) => [uniqueIndex("jurisdictions_code_uidx").on(t.code)],
);

export const tenants = pgTable(
  "tenants",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: tenantTypeEnum("type").notNull(),
    parentTenantId: text("parent_tenant_id"),
    countryCode: text("country_code").references(() => countries.code),
    isolationTier: text("isolation_tier").notNull().default("LOGICAL"),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tenants_code_uidx").on(t.code)],
);

export const legalEntities = pgTable(
  "legal_entities",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    legalName: text("legal_name").notNull(),
    tradingName: text("trading_name"),
    entityType: entityTypeEnum("entity_type").notNull(),
    parentEntityId: text("parent_entity_id"),
    countryCode: text("country_code")
      .notNull()
      .references(() => countries.code),
    jurisdictionId: text("jurisdiction_id").references(() => jurisdictions.id),
    registrationNumber: text("registration_number"),
    taxIdentifier: text("tax_identifier"),
    incorporationDate: date("incorporation_date"),
    functionalCurrency: text("functional_currency").notNull().default("USD"),
    accountingStandard: text("accounting_standard").notNull().default("IFRS"),
    sectorCode: text("sector_code"),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("legal_entities_code_uidx").on(t.code),
    index("legal_entities_tenant_idx").on(t.tenantId),
  ],
);

export const orgUnits = pgTable(
  "org_units",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    unitType: text("unit_type").notNull(), // DIVISION | DEPARTMENT | BRANCH | TEAM
    parentUnitId: text("parent_unit_id"),
    costCentre: text("cost_centre"),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("org_units_code_uidx").on(t.code)],
);

/**
 * Ownership registry — authoritative for economic rights, voting rights,
 * control and beneficial ownership. Effective-dated, never destructively updated.
 */
export const ownershipRecords = pgTable(
  "ownership_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ownedEntityId: text("owned_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    ownerEntityId: text("owner_entity_id").references(() => legalEntities.id),
    ownerPartyId: text("owner_party_id"),
    ownershipType: ownershipTypeEnum("ownership_type").notNull(),
    instrument: text("instrument").notNull().default("ORDINARY_SHARES"),
    economicPct: numeric("economic_pct", { precision: 9, scale: 6 }).notNull(),
    votingPct: numeric("voting_pct", { precision: 9, scale: 6 }).notNull(),
    controlRights: text("control_rights"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    provenance: text("provenance").notNull(),
    supportingDocumentId: text("supporting_document_id"),
    recordedBy: text("recorded_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ownership_owned_idx").on(t.ownedEntityId),
    index("ownership_tenant_idx").on(t.tenantId),
  ],
);

/** Officers, directors, trustees — governance-relevant appointments. */
export const entityAppointments = pgTable("entity_appointments", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  legalEntityId: text("legal_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  partyId: text("party_id").notNull(),
  role: text("role").notNull(), // DIRECTOR | OFFICER | TRUSTEE | SECRETARY | PROTECTOR
  appointedOn: date("appointed_on").notNull(),
  resignedOn: date("resigned_on"),
  authorityLimit: numeric("authority_limit", { precision: 18, scale: 2 }),
  resolutionRef: text("resolution_ref"),
});

/**
 * Sector / Future OS registry — no OS may exist in the ecosystem without a
 * registered constitutional charter here.
 */
export const osRegistry = pgTable(
  "os_registry",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // CONTROL_PLANE | SHARED_CAPABILITY | SECTOR_OS | AI_RUNTIME
    purpose: text("purpose").notNull(),
    ownerRole: text("owner_role").notNull(),
    authorityScope: text("authority_scope").notNull(),
    dataAuthority: jsonb("data_authority").$type<string[]>().notNull().default([]),
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
    apis: jsonb("apis").$type<string[]>().notNull().default([]),
    events: jsonb("events").$type<string[]>().notNull().default([]),
    complianceFrameworks: jsonb("compliance_frameworks").$type<string[]>().notNull().default([]),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    lifecycle: versionStatusEnum("lifecycle").notNull().default("ACTIVE"),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("os_registry_code_uidx").on(t.code)],
);

/** Explicit Source-of-Truth matrix — machine readable, enforced by review. */
export const sourceOfTruth = pgTable(
  "source_of_truth",
  {
    id: text("id").primaryKey(),
    capability: text("capability").notNull(),
    authoritativeOs: text("authoritative_os").notNull(),
    authoritativeStore: text("authoritative_store").notNull(),
    consumers: jsonb("consumers").$type<string[]>().notNull().default([]),
    duplicationAllowed: boolean("duplication_allowed").notNull().default(false),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("source_of_truth_capability_uidx").on(t.capability)],
);
