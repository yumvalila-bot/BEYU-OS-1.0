/**
 * BEYU OS — Family Office NEUTRAL mechanism tables (policy/ratification registry).
 *
 * STATUS: DESIGNED, NOT MATERIALIZED.
 *
 * This module is intentionally NOT exported from the schema barrel
 * (src/db/schema.ts) and NO migration exists for it. It is database-READY:
 * when the first ratification is registered by the authorized governance
 * process, materialization = add the barrel export + generate the migration.
 *
 * These three tables are policy-NEUTRAL: they store the ratification
 * mechanism itself (references, statuses, periods, and the ratified values
 * that arrive with the authoritative act). They encode no family policy —
 * no membership rule, no threshold, no eligibility, no financial state.
 *
 * Invariant (app-enforced in src/lib/family/office/policy.ts and tested):
 * a version whose status is UNRESOLVED or PROPOSED carries NO parameters.
 */

import { index, integer, jsonb, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./core";

export const familyPolicyDefinitions = pgTable(
  "family_policy_definitions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    /** Stable namespaced key, e.g. "governance.quorum". */
    policyKey: text("policy_key").notNull(),
    domain: text("domain").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Explicit scope: null = tenant-wide (a choice, not a default). */
    scopeEntityId: text("scope_entity_id"),
    scopeJurisdictionRef: text("scope_jurisdiction_ref"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("family_policy_definitions_key_uidx").on(t.tenantId, t.policyKey)],
);

export const familyPolicyVersions = pgTable(
  "family_policy_versions",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull().references(() => familyPolicyDefinitions.id),
    version: integer("version").notNull(),
    /** UNRESOLVED | PROPOSED | RATIFIED | ACTIVE | SUPERSEDED | REVOKED (app-enforced state machine). */
    status: text("status").notNull(),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    // Self-reference and versions↔ratifications reference: kept as plain
    // columns here because drizzle table inference cannot follow a two-way
    // FK cycle; the constraints are added in the materialization migration
    // (which is itself gated on the first registered ratification).
    supersedesVersionId: text("supersedes_version_id"),
    ratificationId: text("ratification_id"),
    /**
     * The ratified parameter set. INVARIANT: NULL unless status is
     * RATIFIED/ACTIVE/SUPERSEDED/REVOKED — unratified versions carry no
     * values. (Enforced in the policy engine; a SQL CHECK is added at
     * materialization.)
     */
    parametersJson: jsonb("parameters_json"),
    auditRef: text("audit_ref").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("family_policy_versions_version_uidx").on(t.policyId, t.version),
    index("family_policy_versions_status_idx").on(t.status),
  ],
);

export const familyPolicyRatifications = pgTable(
  "family_policy_ratifications",
  {
    id: text("id").primaryKey(),
    /** Stable decision ID of the authoritative act. */
    decisionId: text("decision_id").notNull(),
    // (versions↔ratifications cycle — see familyPolicyVersions note.)
    policyVersionId: text("policy_version_id").notNull(),
    /** RESOLUTION | DELEGATION (the §26.4 authority-proof model). */
    authorityRefKind: text("authority_ref_kind").notNull(),
    authorityRefId: text("authority_ref_id").notNull(),
    instrumentRef: text("instrument_ref").notNull(),
    evidenceDocumentId: text("evidence_document_id").notNull(),
    evidenceDocumentChecksum: text("evidence_document_checksum").notNull(),
    jurisdictionRef: text("jurisdiction_ref"),
    effectiveFrom: text("effective_from").notNull(),
    effectiveTo: text("effective_to"),
    // Self-reference: plain column (see cycle note above); constraint lands
    // in the materialization migration.
    supersedesRatificationId: text("supersedes_ratification_id"),
    /** PROPOSED | RATIFIED | SUPERSEDED | REVOKED. */
    status: text("status").notNull(),
    version: integer("version").notNull(),
    /** The accountable human who ratified (never an AI actor). */
    decisionMaker: text("decision_maker").notNull(),
    auditRef: text("audit_ref").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("family_policy_ratifications_decision_uidx").on(t.decisionId)],
);
