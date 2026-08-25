/**
 * BEYU OS — Platform services: documents, enterprise events, immutable audit,
 * AI governance, knowledge, notifications, integrations, configuration.
 */
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { aiOutputClassEnum, authorityStatusEnum, classificationEnum } from "./enums";
import { countries, legalEntities, tenants } from "./core";
import { users } from "./identity";
import { approvals } from "./governance";

/**
 * Serialized append head for tamper-evident ledgers. Writers must lock the
 * relevant row SELECT ... FOR UPDATE inside the same transaction that inserts
 * the ledger entry, then update current_hash. This prevents concurrent forks.
 */
export const auditChainHeads = pgTable("audit_chain_heads", {
  chainName: text("chain_name").primaryKey(), // AUDIT_LOG | ENTERPRISE_EVENTS
  currentHash: text("current_hash"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documents = pgTable(
  "documents",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    version: text("version").notNull().default("1.0.0"),
    source: text("source").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    effectiveDate: date("effective_date"),
    entityScope: text("entity_scope"),
    jurisdictionCode: text("jurisdiction_code"),
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    authorityStatus: authorityStatusEnum("authority_status").notNull().default("UNDER_REVIEW"),
    supersedesId: text("supersedes_id"),
    supersededById: text("superseded_by_id"),
    checksum: text("checksum").notNull(),
    storageUri: text("storage_uri").notNull(),
    accessPolicyId: text("access_policy_id"),
    retentionCode: text("retention_code").notNull(),
    legalHold: boolean("legal_hold").notNull().default(false),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [index("documents_tenant_idx").on(t.tenantId), index("documents_category_idx").on(t.category)],
);

export const retentionPolicies = pgTable(
  "retention_policies",
  {
    code: text("code").primaryKey(),
    recordType: text("record_type").notNull(),
    jurisdictionCode: text("jurisdiction_code").notNull(),
    retentionYears: integer("retention_years").notNull(),
    legalBasis: text("legal_basis").notNull(),
    disposalAction: text("disposal_action").notNull().default("SECURE_DELETE"),
    litigationHoldOverrides: boolean("litigation_hold_overrides").notNull().default(true),
  },
);

/** CloudEvents-aligned immutable enterprise event log with hash chaining. */
export const enterpriseEvents = pgTable(
  "enterprise_events",
  {
    id: text("id").primaryKey(),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    type: text("type").notNull(),
    specVersion: text("spec_version").notNull().default("1.0"),
    eventVersion: text("event_version"),
    schemaVersion: text("schema_version").notNull().default("1"),
    /** Interoperability contract fields. Nullable for historical events; new app writes require them. */
    domain: text("domain"),
    operation: text("operation"),
    destinationDomain: text("destination_domain"),
    source: text("source").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id"),
    subjectType: text("subject_type").notNull(),
    subjectId: text("subject_id").notNull(),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull().default("HUMAN"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    traceId: text("trace_id").notNull(),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    authorityContext: jsonb("authority_context").$type<Record<string, string | null> | null>(),
    policyVersion: text("policy_version"),
    hashVersion: text("hash_version"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: text("prev_hash"),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("events_type_idx").on(t.type),
    index("events_tenant_idx").on(t.tenantId),
    index("events_correlation_idx").on(t.correlationId),
    index("events_causation_idx").on(t.causationId),
  ],
);

/** Tamper-evident audit ledger. Append only — never updated or deleted. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    tenantId: text("tenant_id"),
    actorUserId: text("actor_user_id"),
    actorType: text("actor_type").notNull().default("HUMAN"), // HUMAN | SERVICE | AI
    action: text("action").notNull(),
    objectType: text("object_type").notNull(),
    objectId: text("object_id").notNull(),
    outcome: text("outcome").notNull().default("SUCCESS"),
    reason: text("reason"),
    authority: text("authority"),
    approvalRef: text("approval_ref"),
    policyVersion: text("policy_version"),
    systemVersion: text("system_version").notNull(),
    aiVersion: text("ai_version"),
    oldValue: jsonb("old_value").$type<Record<string, unknown> | null>(),
    newValue: jsonb("new_value").$type<Record<string, unknown> | null>(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    traceId: text("trace_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    prevHash: text("prev_hash"),
    hashVersion: text("hash_version"),
    hash: text("hash").notNull(),
  },
  (t) => [
    index("audit_object_idx").on(t.objectType, t.objectId),
    index("audit_actor_idx").on(t.actorUserId),
    index("audit_tenant_idx").on(t.tenantId),
  ],
);

/** Every material AI interaction is recorded — Noelia is fully auditable. */
export const aiDecisions = pgTable(
  "ai_decisions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    userId: text("user_id").references(() => users.id),
    agent: text("agent").notNull().default("NOELIA"),
    runtime: text("runtime").notNull().default("HIVE"),
    engine: text("engine").notNull(), // FINANCIAL | RISK | COMPLIANCE | GOVERNANCE | TAX | WORKFORCE | KNOWLEDGE
    model: text("model").notNull(),
    modelVersion: text("model_version").notNull(),
    promptVersion: text("prompt_version").notNull(),
    requestType: text("request_type").notNull(),
    question: text("question").notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    retrievedSources: jsonb("retrieved_sources").$type<AiSource[]>().notNull().default([]),
    toolsUsed: jsonb("tools_used").$type<string[]>().notNull().default([]),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default({}),
    outputClass: aiOutputClassEnum("output_class").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }).notNull(),
    policyDecision: text("policy_decision").notNull(),
    deniedScopes: jsonb("denied_scopes").$type<string[]>().notNull().default([]),
    humanReviewRequired: boolean("human_review_required").notNull().default(false),
    reviewedBy: text("reviewed_by"),
    reviewDecision: text("review_decision"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    finalAction: text("final_action"),
    latencyMs: integer("latency_ms").notNull().default(0),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_decisions_tenant_idx").on(t.tenantId)],
);

export type AiSource = {
  kind: string;
  ref: string;
  label: string;
  authority: string;
};

/**
 * Durable intent envelope for actions prepared by Noelia.
 *
 * The requesting human, executing AI identity and approving human are separate
 * columns by design. A request is evidence, not authority: domain execution may
 * only follow an explicit HUMAN approval and remains subject to the tool gate.
 */
export const noeliaActionRequests = pgTable(
  "noelia_action_requests",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    requestingHumanId: text("requesting_human_id")
      .notNull()
      .references(() => users.id),
    executingAi: text("executing_ai").notNull().default("NOELIA"),
    approvingHumanId: text("approving_human_id").references(() => users.id),
    approvalId: text("approval_id").references(() => approvals.id),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    // Requested target is evidence, not a resolved FK: retaining an unknown or
    // out-of-scope identifier must not create an existence oracle or roll back
    // denial evidence. Tool authorization resolves it independently.
    targetTenantId: text("target_tenant_id").notNull(),
    legalEntityId: text("legal_entity_id"),
    countryCode: text("country_code"),
    risk: text("risk").notNull(), // LOW | HIGH
    status: text("status").notNull(), // DENIED | PENDING_APPROVAL | APPROVED | COMPLETED | FAILED
    denialCode: text("denial_code"),
    reason: text("reason").notNull(),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("noelia_action_tenant_idx").on(t.tenantId),
    index("noelia_action_status_idx").on(t.status),
    index("noelia_action_approval_idx").on(t.approvalId),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull(),
    sourceUri: text("source_uri"),
    ownerRole: text("owner_role").notNull(),
    jurisdictionCode: text("jurisdiction_code"),
    /** GLOBAL | ENTERPRISE | TENANT | ENTITY | COUNTRY (unknown values fail closed). */
    scopeType: text("scope_type").notNull().default("GLOBAL"),
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    version: text("version").notNull().default("1.0.0"),
    authorityStatus: authorityStatusEnum("authority_status").notNull().default("AUTHORITATIVE"),
    provenance: text("provenance").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    effectiveFrom: date("effective_from").notNull(),
    reviewDate: date("review_date").notNull(),
    expiresAt: date("expires_at"),
    /** Supersession: when a newer authoritative source replaces this one. */
    supersedesCode: text("supersedes_code"),
    content: text("content").notNull(),
    keywords: jsonb("keywords").$type<string[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("knowledge_sources_code_uidx").on(t.code),
    index("knowledge_sources_scope_idx").on(t.scopeType, t.tenantId),
    index("knowledge_sources_entity_idx").on(t.legalEntityId),
    index("knowledge_sources_country_idx").on(t.countryCode),
  ],
);

export const notifications = pgTable("notifications", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: text("user_id").references(() => users.id),
  role: text("role"),
  channel: text("channel").notNull().default("IN_APP"), // IN_APP | EMAIL | SMS | PUSH | SYSTEM_ALERT
  urgency: text("urgency").notNull().default("NORMAL"),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  classification: classificationEnum("classification").notNull().default("INTERNAL"),
  linkHref: text("link_href"),
  status: text("status").notNull().default("QUEUED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const integrations = pgTable(
  "integrations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    category: text("category").notNull(), // BANK | TAX_AUTHORITY | REGULATOR | HEALTH | IDP | AI_PROVIDER | PAYROLL
    direction: text("direction").notNull().default("BIDIRECTIONAL"),
    protocol: text("protocol").notNull().default("REST"),
    standard: text("standard"), // FHIR | HL7 | DHIS2 | ISO20022 | OAUTH2 | OIDC
    authType: text("auth_type").notNull().default("OAUTH2"),
    secretRef: text("secret_ref"), // reference only — never the secret itself
    version: text("version").notNull().default("v1"),
    status: text("status").notNull().default("ACTIVE"),
    ownerRole: text("owner_role").notNull(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    slaUptimePct: numeric("sla_uptime_pct", { precision: 5, scale: 2 }),
  },
  (t) => [uniqueIndex("integrations_code_uidx").on(t.code)],
);

export const featureFlags = pgTable(
  "feature_flags",
  {
    key: text("key").primaryKey(),
    description: text("description").notNull(),
    scope: text("scope").notNull().default("ENTERPRISE"),
    enabled: boolean("enabled").notNull().default(false),
    rolloutRule: jsonb("rollout_rule").$type<Record<string, unknown>>().notNull().default({}),
    ownerRole: text("owner_role").notNull(),
    updatedBy: text("updated_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const metricDefinitions = pgTable(
  "metric_definitions",
  {
    code: text("code").primaryKey(),
    name: text("name").notNull(),
    definition: text("definition").notNull(),
    domain: text("domain").notNull(),
    sourceOfTruth: text("source_of_truth").notNull(),
    ownerRole: text("owner_role").notNull(),
    calculation: text("calculation").notNull(),
    period: text("period").notNull(),
    unit: text("unit").notNull(),
    version: text("version").notNull().default("1.0.0"),
    authorityStatus: authorityStatusEnum("authority_status").notNull().default("AUTHORITATIVE"),
  },
);

/** Data governance: every critical data element has an owner and lifecycle. */
export const dataAssets = pgTable(
  "data_assets",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    systemOfRecord: text("system_of_record").notNull(),
    ownerRole: text("owner_role").notNull(),
    stewardRole: text("steward_role").notNull(),
    classification: classificationEnum("classification").notNull(),
    containsPersonalData: boolean("contains_personal_data").notNull().default(false),
    lawfulBasis: text("lawful_basis"),
    retentionCode: text("retention_code").notNull(),
    lineageUpstream: jsonb("lineage_upstream").$type<string[]>().notNull().default([]),
    lineageDownstream: jsonb("lineage_downstream").$type<string[]>().notNull().default([]),
    qualityRules: jsonb("quality_rules").$type<string[]>().notNull().default([]),
    accessPolicyId: text("access_policy_id"),
  },
  (t) => [uniqueIndex("data_assets_code_uidx").on(t.code)],
);

/** Architecture Decision Records — mandatory for canonical change control. */
export const architectureDecisions = pgTable(
  "architecture_decisions",
  {
    id: text("id").primaryKey(),
    adrNumber: integer("adr_number").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("ACCEPTED"),
    context: text("context").notNull(),
    decision: text("decision").notNull(),
    consequences: text("consequences").notNull(),
    alternatives: text("alternatives").notNull(),
    securityAnalysis: text("security_analysis").notNull(),
    complianceAnalysis: text("compliance_analysis").notNull(),
    rollbackPlan: text("rollback_plan").notNull(),
    decidedBy: text("decided_by").notNull(),
    decidedOn: date("decided_on").notNull(),
  },
  (t) => [uniqueIndex("adr_number_uidx").on(t.adrNumber)],
);

/**
 * Idempotency ledger for governed mutations.
 *
 * Replaces the in-process Map, which was global, unscoped and lost on restart.
 * The primary key is (scope, idempotency_key) where scope binds the record to the
 * acting principal and tenant, so one actor can never read back another actor's
 * response by reusing a guessable key.
 *
 * request_hash pins the key to the exact payload: replaying the SAME body returns
 * the stored response, while a DIFFERENT body under the same key is a conflict
 * rather than a silently wrong answer.
 *
 * state = IN_FLIGHT is claimed inside the caller's transaction before the domain
 * write, so concurrent requests with the same key serialise on the primary key
 * instead of both committing.
 */
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    /** `${tenantId}:${userId}:${endpoint}` — never client-supplied. */
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    state: text("state").notNull().default("IN_FLIGHT"), // IN_FLIGHT | COMPLETED
    statusCode: integer("status_code"),
    responseBody: jsonb("response_body").$type<Record<string, unknown> | null>(),
    tenantId: text("tenant_id"),
    actorUserId: text("actor_user_id"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.scope, t.idempotencyKey] }),
    index("idempotency_expiry_idx").on(t.expiresAt),
  ],
);

/** Regulatory change watch — external law never becomes policy automatically. */
export const regulatoryChanges = pgTable("regulatory_changes", {
  id: text("id").primaryKey(),
  jurisdictionCode: text("jurisdiction_code").notNull(),
  reference: text("reference").notNull(),
  title: text("title").notNull(),
  changeType: text("change_type").notNull(),
  summary: text("summary").notNull(),
  publishedOn: date("published_on").notNull(),
  effectiveFrom: date("effective_from"),
  impactedDomains: jsonb("impacted_domains").$type<string[]>().notNull().default([]),
  assessmentStatus: text("assessment_status").notNull().default("DETECTED"),
  adoptionResolutionId: text("adoption_resolution_id"),
  ownerRole: text("owner_role").notNull(),
});

/**
 * Noelia — governed long-term enterprise memory (section 14).
 *
 * Memory is NOT authority. Current authoritative data always supersedes stale
 * memory; memory cannot override current policy. Every persistent memory
 * object carries owner, tenant, entity, country, classification, provenance,
 * confidence, retention, expiry, supersession, deletion policy, legal hold,
 * access control and auditability.
 */
export const enterpriseMemory = pgTable(
  "enterprise_memory",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ownerUserId: text("owner_user_id").references(() => users.id),
    memoryClass: text("memory_class").notNull(),
    content: text("content").notNull(),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    scopeType: text("scope_type").notNull().default("TENANT"), // GLOBAL | ENTERPRISE | TENANT | ENTITY | COUNTRY
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    provenance: text("provenance").notNull(),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    retentionCode: text("retention_code").notNull().default("STANDARD"),
    legalHold: boolean("legal_hold").notNull().default(false),
    effectiveFrom: date("effective_from").notNull(),
    expiresAt: date("expires_at"),
    supersedesId: text("supersedes_id"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUPERSEDED | EXPIRED | DELETED
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("enterprise_memory_tenant_idx").on(t.tenantId),
    index("enterprise_memory_class_idx").on(t.memoryClass),
    index("enterprise_memory_scope_idx").on(t.scopeType, t.tenantId),
  ],
);

/**
 * Governed Model Gateway registry (section 19).
 *
 * No external model provider may be invoked unless it is registered here,
 * approved by an accountable human, within its data-classification limits and
 * jurisdiction restrictions. Until such a provider is registered and
 * activated, execution remains deterministic/internal (the HIVE analyst).
 */
export const modelRegistry = pgTable(
  "model_registry",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    version: text("version").notNull(),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | RETIRED
    capabilityMetadata: jsonb("capability_metadata").$type<Record<string, unknown>>().notNull().default({}),
    maxClassification: classificationEnum("max_classification").notNull().default("INTERNAL"),
    jurisdictionRestrictions: jsonb("jurisdiction_restrictions").$type<string[]>().notNull().default([]),
    timeoutMs: integer("timeout_ms").notNull().default(30000),
    retryPolicy: jsonb("retry_policy").$type<Record<string, unknown> | null>(),
    circuitBreaker: jsonb("circuit_breaker").$type<Record<string, unknown> | null>(),
    costPerToken: jsonb("cost_per_token").$type<Record<string, unknown>>().notNull().default({}),
    approvedBy: text("approved_by").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("model_registry_provider_model_version_uidx").on(t.provider, t.model, t.version)],
);

/**
 * Noelia governed schedule registry (section 23).
 *
 * Scheduled executive intelligence runs under a SERVICE identity with its own
 * authority, tenant scope, policy evaluation, idempotency, audit, events,
 * retry and failure handling. Schedules are never executed by unsafe
 * in-process timers or cron endpoints: a governed worker claims due runs.
 */
export const noeliaSchedules = pgTable(
  "noelia_schedules",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    cadence: text("cadence").notNull(), // DAILY | WEEKLY | MONTHLY | QUARTERLY | ANNUAL | HORIZON
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    horizon: text("horizon").notNull().default("HORIZON_2_NEAR_TERM"),
    briefingFocus: text("briefing_focus").notNull().default("STANDARD"),
    classification: classificationEnum("classification").notNull().default("RESTRICTED"),
    enabled: boolean("enabled").notNull().default(true),
    ownerRole: text("owner_role").notNull(),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    runCount: integer("run_count").notNull().default(0),
    failureCount: integer("failure_count").notNull().default(0),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | CANCELLED
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_schedules_code_uidx").on(t.code),
    index("noelia_schedules_next_run_idx").on(t.nextRunAt),
  ],
);

/**
 * Governed consumer watermark for the enterprise-event OUTBOX (section 17/12).
 *
 * The canonical event store is append-only and never replayed from zero: each
 * governed consumer records its own last-consumed sequence here, so old
 * events cannot crowd out new ones and reprocessing is bounded. Offsets are
 * tenant-scoped and RLS-protected like every other tenant row.
 */
export const noeliaSchedulerOffsets = pgTable(
  "noelia_scheduler_offsets",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    consumer: text("consumer").notNull(), // e.g. "noelia-schedule-runner"
    lastSequence: bigint("last_sequence", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_scheduler_offsets_consumer_uidx").on(t.tenantId, t.consumer),
  ],
);

/** One governed schedule run: service identity, idempotency, audit, retry. */
export const noeliaScheduleRuns = pgTable(
  "noelia_schedule_runs",
  {
    id: text("id").primaryKey(),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => noeliaSchedules.id),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: text("status").notNull(), // SUCCESS | FAILED | SKIPPED | CANCELLED
    decisionId: text("decision_id"),
    errorCode: text("error_code"),
    errorDetail: text("error_detail"),
    traceId: text("trace_id").notNull(),
    executedBy: text("executed_by").notNull().default("NOELIA_SCHEDULER"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("noelia_schedule_runs_once_uidx").on(t.scheduleId, t.scheduledFor),
    index("noelia_schedule_runs_status_idx").on(t.status),
  ],
);

/**
 * Noelia agentic workflow (section 15).
 *
 * PLAN → VALIDATE → AUTHORIZE → EXECUTE TOOL → OBSERVE RESULT → REASSESS →
 * CONTINUE/ESCALATE/STOP → AUDIT. Every step carries trace/correlation/
 * causation ids, actor, capability, policy decision, scope, classifications
 * and audit evidence. Loops are bounded by maxSteps, timeout and budget;
 * unknown tools/capabilities and unauthorized transitions DENY.
 */
export const noeliaWorkflows = pgTable(
  "noelia_workflows",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    goal: text("goal").notNull(),
    status: text("status").notNull(), // PLANNED | VALIDATED | AUTHORIZED | RUNNING | COMPLETED | ESCALATED | STOPPED | FAILED | CANCELLED | TIMED_OUT
    plan: jsonb("plan").$type<Array<{ step: number; toolName: string; input: Record<string, unknown> }>>().notNull().default([]),
    maxSteps: integer("max_steps").notNull().default(8),
    currentStep: integer("current_step").notNull().default(0),
    timeoutMs: integer("timeout_ms").notNull().default(60000),
    budget: jsonb("budget").$type<Record<string, unknown> | null>(),
    retryPolicy: jsonb("retry_policy").$type<Record<string, unknown> | null>(),
    failureState: jsonb("failure_state").$type<Record<string, unknown> | null>(),
    cancellationRequested: boolean("cancellation_requested").notNull().default(false),
    requestedBy: text("requested_by").notNull(),
    executingAi: text("executing_ai").notNull().default("NOELIA"),
    approvingHumanId: text("approving_human_id").references(() => users.id),
    approvalId: text("approval_id").references(() => approvals.id),
    traceId: text("trace_id").notNull(),
    correlationId: text("correlation_id"),
    causationId: text("causation_id"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_workflows_tenant_idx").on(t.tenantId),
    index("noelia_workflows_status_idx").on(t.status),
  ],
);

/** One governed workflow step with full audit evidence. */
export const noeliaWorkflowSteps = pgTable(
  "noelia_workflow_steps",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => noeliaWorkflows.id),
    stepIndex: integer("step_index").notNull(),
    toolName: text("tool_name").notNull(),
    capability: text("capability").notNull(),
    policyDecision: text("policy_decision").notNull(),
    scope: jsonb("scope").$type<Record<string, unknown>>().notNull().default({}),
    inputClassification: classificationEnum("input_classification").notNull().default("INTERNAL"),
    outputClassification: classificationEnum("output_classification").notNull().default("INTERNAL"),
    status: text("status").notNull(), // PENDING | ALLOWED | DENIED | COMPLETED | FAILED | SKIPPED
    denialCode: text("denial_code"),
    output: jsonb("output").$type<Record<string, unknown> | null>(),
    observations: jsonb("observations").$type<Record<string, unknown> | null>(),
    traceId: text("trace_id").notNull(),
    auditRef: text("audit_ref"),
    durationMs: integer("duration_ms"),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (t) => [
    index("noelia_workflow_steps_workflow_idx").on(t.workflowId),
    uniqueIndex("noelia_workflow_steps_index_uidx").on(t.workflowId, t.stepIndex),
  ],
);
