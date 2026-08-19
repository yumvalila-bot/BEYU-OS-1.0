/**
 * BEYU OS — HCM (single source of truth for workforce) and
 * Family Office (first-class BEYU OS capability, never a separate OS).
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classificationEnum, eligibilityEnum, lifecycleStatusEnum, verificationStatusEnum } from "./enums";
import { legalEntities, orgUnits, tenants } from "./core";
import { parties } from "./identity";

export const positions = pgTable(
  "positions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    orgUnitId: text("org_unit_id").references(() => orgUnits.id),
    grade: text("grade").notNull(),
    jobFamily: text("job_family"),
    headcountBudget: integer("headcount_budget").notNull().default(1),
    reportsToPositionId: text("reports_to_position_id"),
    status: lifecycleStatusEnum("status").notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("positions_code_uidx").on(t.code)],
);

/** ONE employee master record for the whole ecosystem. */
export const employees = pgTable(
  "employees",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeNo: text("employee_no").notNull(),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    legalEntityId: text("legal_entity_id")
      .notNull()
      .references(() => legalEntities.id),
    positionId: text("position_id").references(() => positions.id),
    managerEmployeeId: text("manager_employee_id"),
    workEmail: text("work_email"),
    countryCode: text("country_code").notNull(),
    employmentType: text("employment_type").notNull().default("PERMANENT"),
    contractRef: text("contract_ref"),
    hireDate: date("hire_date").notNull(),
    endDate: date("end_date"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | ON_LEAVE | SUSPENDED | TERMINATED
    baseSalary: numeric("base_salary", { precision: 18, scale: 2 }),
    salaryCurrency: text("salary_currency"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("employees_no_uidx").on(t.employeeNo),
    uniqueIndex("employees_party_uidx").on(t.partyId),
    index("employees_entity_idx").on(t.legalEntityId),
  ],
);

export const employmentEvents = pgTable("employment_events", {
  id: text("id").primaryKey(),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id),
  eventType: text("event_type").notNull(), // HIRE | PROMOTION | TRANSFER | SUSPENSION | LEAVE | TERMINATION
  effectiveFrom: date("effective_from").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  approvedBy: text("approved_by"),
  recordedBy: text("recorded_by").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workforceRequests = pgTable("workforce_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: text("employee_id")
    .notNull()
    .references(() => employees.id),
  requestType: text("request_type").notNull(), // LEAVE | TRAINING | EQUIPMENT | GRIEVANCE
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  days: numeric("days", { precision: 6, scale: 2 }),
  reason: text("reason"),
  status: text("status").notNull().default("SUBMITTED"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
});

/* ------------------------------------------------------------------ */
/* Family Office                                                       */
/* ------------------------------------------------------------------ */

export const familyMembers = pgTable(
  "family_members",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    partyId: text("party_id")
      .notNull()
      .references(() => parties.id),
    familyLine: text("family_line").notNull(),
    branch: text("branch").notNull(),
    generation: integer("generation").notNull(),
    parentMemberId: text("parent_member_id"),
    relationshipToParent: text("relationship_to_parent").notNull().default("CHILD"),
    directDescendant: boolean("direct_descendant").notNull().default(false),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("UNVERIFIED"),
    verificationMethod: text("verification_method"),
    verifiedBy: text("verified_by"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    deceasedOn: date("deceased_on"),
    classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  },
  (t) => [
    uniqueIndex("family_members_party_uidx").on(t.partyId),
    index("family_members_branch_idx").on(t.branch),
  ],
);

export const beneficiaries = pgTable("beneficiaries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  familyMemberId: text("family_member_id")
    .notNull()
    .references(() => familyMembers.id),
  trustEntityId: text("trust_entity_id")
    .notNull()
    .references(() => legalEntities.id),
  beneficiaryClass: text("beneficiary_class").notNull(), // PRIMARY | CONTINGENT | DISCRETIONARY | CHARITABLE
  eligibility: eligibilityEnum("eligibility").notNull().default("UNDER_REVIEW"),
  eligibilityRationale: text("eligibility_rationale").notNull(),
  entitlementPct: numeric("entitlement_pct", { precision: 9, scale: 6 }),
  conditions: jsonb("conditions").$type<string[]>().notNull().default([]),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  verifiedBy: text("verified_by"),
  approvedByResolutionId: text("approved_by_resolution_id"),
  classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
});

export const familyVaultItems = pgTable("family_vault_items", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  vaultType: text("vault_type").notNull(), // FAMILY | MEMBER | TRUST | EMERGENCY | CREDENTIAL | LEGACY
  title: text("title").notNull(),
  description: text("description"),
  documentId: text("document_id"),
  ownerMemberId: text("owner_member_id").references(() => familyMembers.id),
  custodianRole: text("custodian_role").notNull(),
  accessPolicyId: text("access_policy_id"),
  sealedUntil: date("sealed_until"),
  successionInstruction: text("succession_instruction"),
  classification: classificationEnum("classification").notNull().default("HIGHLY_RESTRICTED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Foundation OS (Sector OS) — nonprofit operations                    */
/* ------------------------------------------------------------------ */

export const foundationPrograms = pgTable("foundation_programs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  theme: text("theme").notNull(),
  countryCode: text("country_code").notNull(),
  budget: numeric("budget", { precision: 18, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  spendToDate: numeric("spend_to_date", { precision: 18, scale: 2 }).notNull().default("0"),
  beneficiariesReached: integer("beneficiaries_reached").notNull().default(0),
  impactMetric: text("impact_metric"),
  impactValue: numeric("impact_value", { precision: 18, scale: 2 }),
  status: text("status").notNull().default("ACTIVE"),
  fundingResolutionId: text("funding_resolution_id"),
});

/* ------------------------------------------------------------------ */
/* Sector OS operational snapshots (governed, non-authoritative KPIs)  */
/* ------------------------------------------------------------------ */

export const sectorMetrics = pgTable("sector_metrics", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  sectorCode: text("sector_code").notNull(),
  metricCode: text("metric_code").notNull(),
  period: text("period").notNull(),
  value: numeric("value", { precision: 18, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  sourceSystem: text("source_system").notNull(),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
});
