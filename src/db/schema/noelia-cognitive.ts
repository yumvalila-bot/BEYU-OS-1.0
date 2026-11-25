/**
 * BEYU OS — NOELIA COGNITIVE CORE schema (additive, migration 0084).
 *
 * Declares the five tables the unified NOELIA cognitive core adds on top of
 * the existing NOELIA persistence (which is untouched):
 *
 *   noelia_kg_edges          — institutional knowledge-graph edges
 *   noelia_decision_records  — institutional decision memory
 *   noelia_council_sessions  — Intelligence Council deliberations
 *   noelia_council_findings  — per-brain bounded findings
 *   noelia_simulations       — strategic scenario runs (SIMULATION only)
 *   noelia_golden_cases      — immutable evaluation benchmarks
 *   noelia_learning_records  — measurements, proposals and corrections
 *
 * Nothing here duplicates `knowledge_sources`, `enterprise_memory`,
 * `ai_decisions`, `noelia_workflows` or the model/provider registry.
 */
import { sql } from "drizzle-orm";
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
import { classificationEnum } from "./enums";
import { countries, legalEntities, tenants } from "./core";
import { users } from "./identity";

/* --------------------------------------------- institutional knowledge graph */

export const noeliaKgEdges = pgTable(
  "noelia_kg_edges",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),

    fromType: text("from_type").notNull(),
    fromRef: text("from_ref").notNull(),
    relation: text("relation").notNull(),
    toType: text("to_type").notNull(),
    toRef: text("to_ref").notNull(),

    provenance: text("provenance").notNull(),
    sourceRef: text("source_ref"),
    /** OBSERVED | DERIVED | SIMULATED */
    origin: text("origin").notNull().default("OBSERVED"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_kg_edges_uidx")
      .on(t.tenantId, t.fromType, t.fromRef, t.relation, t.toType, t.toRef)
      .where(sql`effective_to is null`),
    index("noelia_kg_edges_from_idx").on(t.tenantId, t.fromType, t.fromRef),
    index("noelia_kg_edges_to_idx").on(t.tenantId, t.toType, t.toRef),
    index("noelia_kg_edges_relation_idx").on(t.tenantId, t.relation),
  ],
);

/* ------------------------------------------------ institutional decision memory */

export const noeliaDecisionRecords = pgTable(
  "noelia_decision_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),

    decisionCode: text("decision_code").notNull(),
    title: text("title").notNull(),
    question: text("question").notNull(),
    decision: text("decision").notNull(),
    rationale: text("rationale").notNull(),
    alternativesConsidered: jsonb("alternatives_considered").$type<string[]>().notNull().default([]),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),

    /** EFFECTIVE | SUPERSEDED | RESCINDED | DRAFT */
    status: text("status").notNull().default("EFFECTIVE"),
    decidedOn: date("decided_on").notNull(),
    decidedBy: text("decided_by").references(() => users.id),
    decidedByRole: text("decided_by_role").notNull(),
    approvingBody: text("approving_body"),
    approvalReference: text("approval_reference"),

    supersedesId: text("supersedes_id"),
    provenance: text("provenance").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by").references(() => users.id),
  },
  (t) => [
    uniqueIndex("noelia_decision_records_code_uidx").on(t.tenantId, t.decisionCode),
    index("noelia_decision_records_date_idx").on(t.tenantId, t.decidedOn),
    index("noelia_decision_records_entity_idx").on(t.tenantId, t.legalEntityId),
  ],
);

/* ------------------------------------------------------- intelligence council */

export const noeliaCouncilSessions = pgTable(
  "noelia_council_sessions",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),

    question: text("question").notNull(),
    objective: text("objective").notNull(),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    /** PLANNED | RUNNING | SYNTHESISED | FAILED | CANCELLED */
    status: text("status").notNull().default("PLANNED"),
    synthesis: jsonb("synthesis").$type<Record<string, unknown>>(),
    consensus: jsonb("consensus").$type<string[]>().notNull().default([]),
    dissent: jsonb("dissent").$type<string[]>().notNull().default([]),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    humanDecisionRequired: boolean("human_decision_required").notNull().default(true),
    requestingUserId: text("requesting_user_id").references(() => users.id),
    traceId: text("trace_id").notNull(),

    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("noelia_council_sessions_tenant_idx").on(t.tenantId, t.startedAt)],
);

export const noeliaCouncilFindings = pgTable(
  "noelia_council_findings",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => noeliaCouncilSessions.id, { onDelete: "cascade" }),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),

    brain: text("brain").notNull(),
    capability: text("capability"),
    task: text("task").notNull(),
    statement: text("statement").notNull(),
    evidenceRefs: jsonb("evidence_refs").$type<string[]>().notNull().default([]),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    claimKind: text("claim_kind").notNull().default("INFERENCE"),
    /** SUPPORTING | DISSENTING | NEUTRAL | INSUFFICIENT_EVIDENCE */
    position: text("position").notNull().default("SUPPORTING"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("noelia_council_findings_session_idx").on(t.sessionId, t.brain)],
);

/* ------------------------------------------------------- strategic simulation */

export const noeliaSimulations = pgTable(
  "noelia_simulations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),

    objective: text("objective").notNull(),
    scenarioKind: text("scenario_kind").notNull(),
    /** OPTIMISTIC | BASELINE | ADVERSE */
    scenarioLabel: text("scenario_label").notNull(),

    baseline: jsonb("baseline").$type<Record<string, unknown>>().notNull().default({}),
    assumptions: jsonb("assumptions").$type<string[]>().notNull().default([]),
    variables: jsonb("variables").$type<Array<Record<string, unknown>>>().notNull().default([]),
    constraints: jsonb("constraints").$type<string[]>().notNull().default([]),
    calculationMethod: text("calculation_method").notNull(),
    outputs: jsonb("outputs").$type<Record<string, unknown>>().notNull().default({}),
    sensitivity: jsonb("sensitivity").$type<Array<Record<string, unknown>>>().notNull().default([]),
    limitations: jsonb("limitations").$type<string[]>().notNull().default([]),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),

    /** Structurally forced to SIMULATION: never mistakable for a record. */
    resultClass: text("result_class").notNull().default("SIMULATION"),
    createdBy: text("created_by").references(() => users.id),
    traceId: text("trace_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("noelia_simulations_tenant_idx").on(t.tenantId, t.createdAt)],
);

/* ------------------------------------------------------- controlled learning */

export const noeliaGoldenCases = pgTable(
  "noelia_golden_cases",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    brain: text("brain").notNull(),
    capability: text("capability"),
    question: text("question").notNull(),
    expectedOutputClass: text("expected_output_class").notNull(),
    requiredEvidence: jsonb("required_evidence").$type<string[]>().notNull().default([]),
    forbiddenClaims: jsonb("forbidden_claims").$type<string[]>().notNull().default([]),
    tolerance: numeric("tolerance", { precision: 5, scale: 4 }).notNull().default("0.9"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("noelia_golden_cases_code_uidx").on(t.code)],
);

export const noeliaLearningRecords = pgTable(
  "noelia_learning_records",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    /** MEASUREMENT | PROPOSAL | CORRECTION */
    recordKind: text("record_kind").notNull(),
    goldenCaseCode: text("golden_case_code"),
    brain: text("brain"),
    capability: text("capability"),

    observed: jsonb("observed").$type<Record<string, unknown>>().notNull().default({}),
    expected: jsonb("expected").$type<Record<string, unknown>>().notNull().default({}),
    passed: boolean("passed"),
    baselineScore: numeric("baseline_score", { precision: 5, scale: 4 }),
    observedScore: numeric("observed_score", { precision: 5, scale: 4 }),
    regression: boolean("regression").notNull().default(false),

    /** RECORDED | PENDING_APPROVAL | APPROVED | REJECTED | APPLIED */
    status: text("status").notNull().default("RECORDED"),
    proposedChange: text("proposed_change"),
    requiresHumanApproval: boolean("requires_human_approval").notNull().default(true),
    approvedBy: text("approved_by").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),

    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_learning_records_case_idx").on(t.goldenCaseCode, t.createdAt),
    index("noelia_learning_records_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Chunk-level embedding store (migration 0086).
 *
 * One row per (source, chunk, model). `tenant_id` is denormalized from the
 * parent `knowledge_sources` row deliberately: the RLS policy is then a direct
 * tenant comparison rather than a subquery against another table, which keeps
 * policy evaluation cheap and keeps scope logic in one place per row.
 *
 * `vector` is normalized text rather than a pgvector column because this
 * PostgreSQL build has no pgvector available. See `src/lib/noelia/embeddings.ts`
 * for the encoding and `knowledge-retrieval.ts` for exact scoring.
 */
export const noeliaKnowledgeEmbeddings = pgTable(
  "noelia_knowledge_embeddings",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    sourceId: text("source_id").notNull(),
    sourceCode: text("source_code").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    chunkText: text("chunk_text").notNull(),
    /** sha256 of chunkText; a mismatch against the source means STALE. */
    contentDigest: text("content_digest").notNull(),
    embeddingModelId: text("embedding_model_id").notNull(),
    embeddingDimensions: integer("embedding_dimensions").notNull(),
    /** Comma-separated normalized floats. Not a pgvector column by design. */
    vector: text("vector").notNull(),
    /** EMBEDDED | STALE | FAILED */
    status: text("status").notNull().default("EMBEDDED"),
    indexedAt: timestamp("indexed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_knowledge_embeddings_chunk_model_uq").on(t.sourceId, t.chunkIndex, t.embeddingModelId),
    index("noelia_knowledge_embeddings_tenant_idx").on(t.tenantId),
    index("noelia_knowledge_embeddings_source_idx").on(t.sourceId),
  ],
);
