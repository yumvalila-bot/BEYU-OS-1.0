/**
 * BEYU OS — Governance, policy and workflow execution.
 * Authoritative for: the Constitution, policy hierarchy, governance bodies,
 * resolutions, votes, approvals, workflows and tasks.
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
import {
  approvalDecisionEnum,
  classificationEnum,
  decisionActivationStateEnum,
  decisionStatusEnum,
  policyLevelEnum,
  versionStatusEnum,
} from "./enums";
import { legalEntities, tenants } from "./core";
import { parties, users } from "./identity";

/** Constitutional articles — highest authority in the hierarchy. */
export const constitutionArticles = pgTable(
  "constitution_articles",
  {
    id: text("id").primaryKey(),
    articleNo: integer("article_no").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    body: text("body").notNull(),
    authorityStatement: text("authority_statement").notNull(),
    version: text("version").notNull().default("1.0.0"),
    status: versionStatusEnum("status").notNull().default("ACTIVE"),
    effectiveFrom: date("effective_from").notNull(),
    amendmentProcedure: text("amendment_procedure").notNull(),
  },
  (t) => [uniqueIndex("constitution_article_no_uidx").on(t.articleNo)],
);

export const policies = pgTable(
  "policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    code: text("code").notNull(),
    title: text("title").notNull(),
    level: policyLevelEnum("level").notNull(),
    parentPolicyId: text("parent_policy_id"),
    constitutionArticleId: text("constitution_article_id").references(() => constitutionArticles.id),
    domain: text("domain").notNull(),
    jurisdictionCode: text("jurisdiction_code"),
    entityScope: text("entity_scope"),
    roleScope: text("role_scope"),
    version: text("version").notNull().default("1.0.0"),
    status: versionStatusEnum("status").notNull().default("ACTIVE"),
    effectiveFrom: date("effective_from").notNull(),
    effectiveTo: date("effective_to"),
    body: text("body").notNull(),
    /** Machine-readable rules evaluated by the policy engine. */
    rules: jsonb("rules").$type<PolicyRule[]>().notNull().default([]),
    ownerRole: text("owner_role").notNull(),
    approvedByResolutionId: text("approved_by_resolution_id"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("policies_code_version_uidx").on(t.code, t.version)],
);

export type PolicyRule = {
  id: string;
  effect: "ALLOW" | "DENY" | "REQUIRE_APPROVAL" | "REQUIRE_HUMAN_REVIEW";
  action: string;
  /** ABAC conditions evaluated against the request context. */
  when?: {
    classificationAtOrAbove?: string;
    amountAtOrAbove?: number;
    jurisdictionIn?: string[];
    roleIn?: string[];
    aiInitiated?: boolean;
    riskAtOrAbove?: number;
  };
  approverRole?: string;
  message: string;
};

export const governanceBodies = pgTable(
  "governance_bodies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    bodyType: text("body_type").notNull(), // BOARD | COMMITTEE | FAMILY_COUNCIL | TRUSTEES | SHAREHOLDERS | EXECUTIVE
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    quorumMinimum: integer("quorum_minimum").notNull().default(3),
    majorityRule: text("majority_rule").notNull().default("SIMPLE"), // SIMPLE | TWO_THIRDS | UNANIMOUS
    reservedMatters: jsonb("reserved_matters").$type<string[]>().notNull().default([]),
    charterDocumentId: text("charter_document_id"),
    status: versionStatusEnum("status").notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("governance_bodies_code_uidx").on(t.code)],
);

export const governanceMembers = pgTable("governance_members", {
  id: text("id").primaryKey(),
  bodyId: text("body_id")
    .notNull()
    .references(() => governanceBodies.id),
  partyId: text("party_id")
    .notNull()
    .references(() => parties.id),
  seatRole: text("seat_role").notNull(), // CHAIR | MEMBER | SECRETARY | OBSERVER
  votingRights: boolean("voting_rights").notNull().default(true),
  appointedOn: date("appointed_on").notNull(),
  retiredOn: date("retired_on"),
});

export const resolutions = pgTable(
  "resolutions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    bodyId: text("body_id")
      .notNull()
      .references(() => governanceBodies.id),
    reference: text("reference").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(), // RESERVED_MATTER | CAPITAL | POLICY | APPOINTMENT | TAX | RISK | OTHER
    summary: text("summary").notNull(),
    rationale: text("rationale").notNull(),
    dataBasis: text("data_basis").notNull(),
    authorityPolicyId: text("authority_policy_id").references(() => policies.id),
    consequences: text("consequences").notNull(),
    linkedObjectType: text("linked_object_type"),
    linkedObjectId: text("linked_object_id"),
    proposedBy: text("proposed_by").notNull(),
    status: decisionStatusEnum("status").notNull().default("DRAFT"),
    requiredMajority: text("required_majority").notNull().default("SIMPLE"),
    quorumMet: boolean("quorum_met").notNull().default(false),
    votesFor: integer("votes_for").notNull().default(0),
    votesAgainst: integer("votes_against").notNull().default(0),
    votesAbstain: integer("votes_abstain").notNull().default(0),
    /**
     * Server-enforced voting window, set when the resolution is TABLED.
     *
     * No equivalent existed in the schema, so these are the smallest addition that
     * makes the window deterministic. Boundary semantics are half-open:
     *   votingOpensAt <= now < votingClosesAt
     * A vote at exactly votingOpensAt is accepted; a vote at exactly
     * votingClosesAt is rejected. The server clock is authoritative; the client
     * clock is never consulted.
     */
    votingOpensAt: timestamp("voting_opens_at", { withTimezone: true }),
    votingClosesAt: timestamp("voting_closes_at", { withTimezone: true }),
    /** Governance member id of the presiding officer who tabled the resolution. */
    tabledByMemberId: text("tabled_by_member_id"),
    tabledAt: timestamp("tabled_at", { withTimezone: true }),
    /**
     * Governance member id of the decision authority who closed the resolution.
     *
     * Mirrors `tabled_by_member_id`. `decision_date` already records WHEN a
     * resolution was decided but nothing recorded WHO decided it, so a decision
     * could not be attributed from the domain row alone. Provenance must not
     * depend on reading the audit ledger.
     */
    decidedByMemberId: text("decided_by_member_id"),
    decisionDate: timestamp("decision_date", { withTimezone: true }),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("resolutions_reference_uidx").on(t.reference),
    index("resolutions_tenant_idx").on(t.tenantId),
  ],
);

export const resolutionVotes = pgTable(
  "resolution_votes",
  {
    id: text("id").primaryKey(),
    resolutionId: text("resolution_id")
      .notNull()
      .references(() => resolutions.id),
    memberId: text("member_id")
      .notNull()
      .references(() => governanceMembers.id),
    vote: text("vote").notNull(), // FOR | AGAINST | ABSTAIN | RECUSED
    conflictDeclared: boolean("conflict_declared").notNull().default(false),
    comment: text("comment"),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("resolution_votes_uidx").on(t.resolutionId, t.memberId)],
);

/** Generic maker/checker approval chain used by every domain. */
export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    step: integer("step").notNull().default(1),
    approverRole: text("approver_role").notNull(),
    approverUserId: text("approver_user_id").references(() => users.id),
    decision: approvalDecisionEnum("decision").notNull().default("PENDING"),
    policyId: text("policy_id").references(() => policies.id),
    requestedBy: text("requested_by").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    /**
     * Decision validity window: once `validUntil` passes, an APPROVED
     * approval is no longer sufficient authority for execution. NULL means
     * the decision never expires (conservative default: no invented
     * policy threshold).
     */
    validUntil: timestamp("valid_until", { withTimezone: true }),
    /**
     * Quorum: how many distinct approvers must APPROVE this object before
     * it is executable. NULL means a single approval suffices. The value is
     * request metadata, never a derived authority threshold.
     */
    quorum: integer("quorum"),
    /** Delegation: this approval was cast on behalf of another accountable human. */
    delegatedFrom: text("delegated_from"),
    comment: text("comment"),
  },
  (t) => [index("approvals_object_idx").on(t.objectType, t.objectId)],
);

export const workflows = pgTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    version: text("version").notNull().default("1.0.0"),
    definition: jsonb("definition").$type<WorkflowStep[]>().notNull().default([]),
    policyId: text("policy_id").references(() => policies.id),
    status: versionStatusEnum("status").notNull().default("ACTIVE"),
  },
  (t) => [uniqueIndex("workflows_code_version_uidx").on(t.code, t.version)],
);

export type WorkflowStep = {
  step: number;
  name: string;
  type: "TASK" | "APPROVAL" | "AUTOMATION" | "HUMAN_REVIEW";
  role: string;
  slaHours: number;
  escalateToRole?: string;
};

export const workflowInstances = pgTable("workflow_instances", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  workflowId: text("workflow_id")
    .notNull()
    .references(() => workflows.id),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  currentStep: integer("current_step").notNull().default(1),
  state: text("state").notNull().default("RUNNING"), // RUNNING | WAITING | COMPLETED | FAILED | COMPENSATED
  startedBy: text("started_by").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
});

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    instanceId: text("instance_id").references(() => workflowInstances.id),
    title: text("title").notNull(),
    description: text("description"),
    assigneeUserId: text("assignee_user_id").references(() => users.id),
    assigneeRole: text("assignee_role"),
    priority: text("priority").notNull().default("NORMAL"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("OPEN"), // OPEN | IN_PROGRESS | DONE | ESCALATED | CANCELLED
    escalationLevel: integer("escalation_level").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeUserId)],
);

/** Strategy management: vision → objective → initiative → KPI. */
export const strategicObjectives = pgTable("strategic_objectives", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  code: text("code").notNull(),
  horizon: text("horizon").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  ownerRole: text("owner_role").notNull(),
  parentObjectiveId: text("parent_objective_id"),
  targetValue: numeric("target_value", { precision: 18, scale: 4 }),
  currentValue: numeric("current_value", { precision: 18, scale: 4 }),
  unit: text("unit"),
  status: text("status").notNull().default("ON_TRACK"),
  reviewCadence: text("review_cadence").notNull().default("QUARTERLY"),
});

/**
 * Pre-ratification decision registry (Phase 6C).
 *
 * Represents the EXISTENCE of a governance decision that BEYU OS is waiting on, without
 * representing its CONTENT. A row here says "P1 recognition basis is pending, and here is who
 * must decide it and what would have to be true for it to become executable". It never says what
 * the recognition basis is.
 *
 * Policy-dependent columns are deliberately nullable and are expected to stay NULL until a real
 * authority supplies them. Nothing in the seed populates them.
 *
 * `resolutionId` carries a foreign key to `resolutions` with ON DELETE RESTRICT, matching the
 * precedent set by migrations 0007 and 0009: a decision may only cite governance evidence that
 * actually exists, and that evidence cannot then be deleted out from under it.
 */
export const governanceDecisionRegistry = pgTable(
  "governance_decision_registry",
  {
    decisionId: text("decision_id").primaryKey(), // P1..P11, C1..C5
    title: text("title").notNull(),
    description: text("description").notNull(),

    /** Authority state. PENDING until a real authority moves it. */
    status: decisionActivationStateEnum("status").notNull().default("PENDING"),

    /** Who must decide. Descriptive requirement, not a grant of authority. */
    requiredAuthority: text("required_authority").notNull(),

    // --- Supplied only by a genuine ratification. NULL until then. ---
    approvingBody: text("approving_body"),
    decisionMaker: text("decision_maker"),
    resolutionId: text("resolution_id").references(() => resolutions.id, { onDelete: "restrict" }),
    /** GOVERNED | REFERENCE_DATA | NONE — mirrors getGovernanceDecisionAuthorization(). */
    provenance: text("provenance"),
    approvalDate: timestamp("approval_date", { withTimezone: true }),
    effectiveFrom: date("effective_from"),
    effectiveTo: date("effective_to"),
    scope: jsonb("scope").$type<Record<string, unknown>>(),
    conditions: text("conditions"),
    evidence: text("evidence"),
    supersedes: text("supersedes"),
    auditReference: text("audit_reference"),

    // --- Engineering-side metadata. Policy-neutral. ---
    /** Other decision_ids that must be ACTIVATED first. */
    dependencies: jsonb("dependencies").$type<string[]>().notNull().default([]),
    /** How a ratified decision will be proven implemented. Never states the decision itself. */
    acceptanceCriteria: text("acceptance_criteria").notNull(),
    /** NOT_IMPLEMENTED | INTERFACE_PREPARED | IMPLEMENTED */
    implementationStatus: text("implementation_status").notNull().default("NOT_IMPLEMENTED"),
    /** LOCKED | ACTIVATION_READY | ACTIVATED — the execution switch. Never LOCKED->ACTIVATED implicitly. */
    activationStatus: text("activation_status").notNull().default("LOCKED"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("governance_decision_registry_status_idx").on(t.status),
    index("governance_decision_registry_activation_idx").on(t.activationStatus),
  ],
);

/**
 * Capability registry (Phase 6C).
 *
 * Maps a future engineering capability to the decision(s) that must be ratified before it may
 * execute. Supports PARTIAL activation: if P1 is ratified and P6 is not, the recognition
 * capability may become ready while the chart-of-accounts capability stays LOCKED.
 *
 * A row here grants nothing. It records a dependency, so the activation gate can compute whether
 * a capability is executable and deny by default when it is not.
 */
export const governanceCapabilityRegistry = pgTable(
  "governance_capability_registry",
  {
    capabilityCode: text("capability_code").primaryKey(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** decision_ids from governance_decision_registry that must ALL be ACTIVATED. */
    requiredDecisions: jsonb("required_decisions").$type<string[]>().notNull().default([]),
    /** LOCKED | ACTIVATION_READY | ACTIVATED. Fail-closed default. */
    activationStatus: text("activation_status").notNull().default("LOCKED"),
    /**
     * Permission that would gate execution once activated. Recording the NAME here does not
     * create the permission and does not grant it; permissions remain defined solely in
     * src/lib/constants.ts.
     */
    executionPermission: text("execution_permission"),
    implementationStatus: text("implementation_status").notNull().default("NOT_IMPLEMENTED"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("governance_capability_registry_activation_idx").on(t.activationStatus)],
);
