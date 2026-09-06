/**
 * BEYU Noelia AI — Phase 5 production runtime, RAG fabric, observability,
 * evaluation, red-team and continuous assurance schema (migration 0027).
 *
 * Rules:
 *  - No credentials, secret values, raw prompts, raw model outputs or raw
 *    retrieved document content are stored in telemetry/tracing tables.
 *  - Tenant-scoped rows are RLS-protected through the canonical
 *    beyu_tenant_ids()/beyu_global_scope() helpers.
 *  - `BLOCKED`, `ENVIRONMENT_LIMITED`, `FAIL_CLOSED` and `NOT_CONFIGURED` are
 *    first-class honest states; nothing converts them to PASS.
 */
import { index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { countries, legalEntities, tenants } from "./core";
import { modelRegistry } from "./platform";
import { noeliaProviders } from "./ai";

/** Noelia AI request telemetry (non-sensitive metadata only; no prompts/outputs). */
export const noeliaAiTelemetry = pgTable(
  "noelia_ai_telemetry",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    traceId: text("trace_id").notNull(),
    spanId: text("span_id"),
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    osId: text("os_id"),
    userId: text("user_id").notNull(),
    task: text("task").notNull(),
    capability: text("capability").notNull(),
    modelId: text("model_id").references(() => modelRegistry.id),
    modelVersion: text("model_version"),
    providerId: text("provider_id").references(() => noeliaProviders.id),
    status: text("status").notNull(), // SUCCESS | DENIED | FAIL_CLOSED | BLOCKED | ERROR | NOT_SUPPORTED
    latencyMs: integer("latency_ms"),
    timeToFirstTokenMs: integer("time_to_first_token_ms"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    estimatedCostMicroUsd: numeric("estimated_cost_micro_usd", { precision: 20, scale: 4 }),
    safetyBlocked: integer("safety_blocked").notNull().default(0),
    safetyReasons: jsonb("safety_reasons").$type<string[]>().notNull().default([]),
    policyDecision: text("policy_decision"),
    humanApproval: text("human_approval"), // NO_APPROVAL | OPTIONAL_REVIEW | REQUIRED_REVIEW | DUAL_CONTROL | PROHIBITED
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_ai_telemetry_request_idx").on(t.requestId),
    index("noelia_ai_telemetry_trace_idx").on(t.traceId),
    index("noelia_ai_telemetry_tenant_idx").on(t.tenantId),
    index("noelia_ai_telemetry_status_idx").on(t.status),
  ],
);

/** Distributed tracing spans (metadata only, never secret credential material). */
export const noeliaAiSpans = pgTable(
  "noelia_ai_spans",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    traceId: text("trace_id").notNull(),
    parentSpanId: text("parent_span_id"),
    spanId: text("span_id").notNull(),
    operation: text("operation").notNull(),
    service: text("service").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    status: text("status").notNull().default("OK"), // OK | ERROR | BLOCKED | FAIL_CLOSED | DENIED
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_ai_spans_trace_idx").on(t.traceId),
    index("noelia_ai_spans_span_idx").on(t.spanId),
    index("noelia_ai_spans_tenant_idx").on(t.tenantId),
  ],
);

/** Continuous evaluation runs (phase 5, prompt section 34/35). */
export const noeliaAiEvaluationRuns = pgTable(
  "noelia_ai_evaluation_runs",
  {
    id: text("id").primaryKey(),
    runCode: text("run_code").notNull(),
    task: text("task").notNull(),
    modelId: text("model_id").references(() => modelRegistry.id),
    modelVersion: text("model_version"),
    providerId: text("provider_id").references(() => noeliaProviders.id),
    dataset: text("dataset").notNull(),
    testSuite: text("test_suite").notNull(),
    metric: text("metric").notNull(),
    score: text("score").notNull(),
    threshold: text("threshold"),
    status: text("status").notNull().default("RECORDED"), // RECORDED | PASS | FAIL | BLOCKED | ENVIRONMENT_LIMITED | PENDING_REVIEW
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evaluator: text("evaluator").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_eval_run_code_uidx").on(t.runCode),
    index("noelia_eval_run_model_idx").on(t.modelId, t.modelVersion),
    index("noelia_eval_run_status_idx").on(t.status),
    index("noelia_eval_run_tenant_idx").on(t.tenantId),
  ],
);

/** Repeatable red-team/adversarial case results. */
export const noeliaAiRedTeamResults = pgTable(
  "noelia_ai_red_team_results",
  {
    id: text("id").primaryKey(),
    resultCode: text("result_code").notNull(),
    caseId: text("case_id").notNull(),
    category: text("category").notNull(), // INJECTION | ISOLATION | AUTHORIZATION | SUPPLY_CHAIN | RESILIENCE | GOVERNANCE | PRIVACY | OTHER
    attackType: text("attack_type").notNull(),
    scenario: text("scenario").notNull(),
    target: text("target").notNull(), // RUNTIME | ROUTER | RAG | TOOL | GATEWAY | COMPLIANCE | LIFECYCLE
    severity: text("severity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
    outcome: text("outcome").notNull().default("NOT_APPLICABLE"), // BLOCKED | DETECTED | MISSED | PARTIALLY_DETECTED | NOT_APPLICABLE | ENVIRONMENT_LIMITED | BLOCKED_BY_ENVIRONMENT
    evidenceRef: text("evidence_ref"),
    testedAt: timestamp("tested_at", { withTimezone: true }).notNull().defaultNow(),
    testedBy: text("tested_by").notNull(),
    ownerRole: text("owner_role").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    notes: text("notes"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_red_team_result_code_uidx").on(t.resultCode),
    index("noelia_red_team_case_idx").on(t.caseId),
    index("noelia_red_team_outcome_idx").on(t.outcome),
    index("noelia_red_team_tenant_idx").on(t.tenantId),
  ],
);

/** RAG retrieval audit — authorization decisions and hash references only. */
export const noeliaRagRetrievalEvents = pgTable(
  "noelia_rag_retrieval_events",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    traceId: text("trace_id").notNull(),
    knowledgeId: text("knowledge_id"),
    sourceCode: text("source_code").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    osId: text("os_id"),
    authorizationDecision: text("authorization_decision").notNull(), // ALLOWED | DENIED_CLASSIFICATION | DENIED_SCOPE | DENIED_WINDOW | DENIED_AUTHORITY
    excerptHash: text("excerpt_hash"),
    retrievalRank: integer("retrieval_rank"),
    retrievalTimestamp: timestamp("retrieval_timestamp", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_rag_event_request_idx").on(t.requestId),
    index("noelia_rag_event_source_idx").on(t.sourceCode),
    index("noelia_rag_event_tenant_idx").on(t.tenantId),
  ],
);
