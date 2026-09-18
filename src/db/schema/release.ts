/**
 * BEYU OS — P3 Release Governance Schema (canonical)
 *
 * Additive, expand-only. No destructive changes.
 * Tables are platform governance, not tenant-scoped — enforced via RBAC in API layer.
 * Uses same audit pattern as existing tables (hash-chained audit_log remains canonical).
 */

import { pgTable, text, timestamp, jsonb, integer, boolean, index } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// release_records — immutable release identity (one per release)
// ─────────────────────────────────────────────────────────────────────────────

export const releaseRecords = pgTable(
  "release_records",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id").notNull().unique(),
    gitSha: text("git_sha").notNull(),
    repository: text("repository").notNull(),
    buildId: text("build_id").notNull(),
    deploymentId: text("deployment_id").notNull(),
    environment: text("environment").notNull(),
    applicationVersion: text("application_version").notNull(),
    runtimeVersion: text("runtime_version").notNull(),
    migrationFingerprint: text("migration_fingerprint"),
    latestMigration: text("latest_migration"),
    migrationCount: integer("migration_count"),
    schemaFingerprint: text("schema_fingerprint"),
    releaseTimestamp: timestamp("release_timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("release_records_release_id_idx").on(t.releaseId),
    index("release_records_git_sha_idx").on(t.gitSha),
    index("release_records_environment_idx").on(t.environment),
    index("release_records_created_at_idx").on(t.createdAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// release_transitions — append-only ledger of state transitions
// ─────────────────────────────────────────────────────────────────────────────

export const releaseTransitions = pgTable(
  "release_transitions",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releaseRecords.releaseId, { onDelete: "cascade" }),
    sourceCommit: text("source_commit").notNull(),
    artifactBuildId: text("artifact_build_id").notNull(),
    environment: text("environment").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(), // HUMAN | SERVICE | AI | SYSTEM
    previousState: text("previous_state"),
    nextState: text("next_state").notNull(),
    reason: text("reason").notNull(),
    verificationEvidence: jsonb("verification_evidence"),
    correlationId: text("correlation_id"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("release_transitions_release_id_idx").on(t.releaseId),
    index("release_transitions_next_state_idx").on(t.nextState),
    index("release_transitions_environment_idx").on(t.environment),
    index("release_transitions_timestamp_idx").on(t.timestamp),
    index("release_transitions_correlation_id_idx").on(t.correlationId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// pvg_runs — PVG verification runs
// ─────────────────────────────────────────────────────────────────────────────

export const pvgRuns = pgTable(
  "pvg_runs",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releaseRecords.releaseId, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    status: text("status").notNull(), // PASS | FAIL
    commitSha: text("commit_sha").notNull(),
    deploymentId: text("deployment_id"),
    buildId: text("build_id"),
    database: jsonb("database").notNull(),
    schema: jsonb("schema").notNull(),
    security: jsonb("security").notNull(),
    events: jsonb("events").notNull(),
    runtime: jsonb("runtime").notNull(),
    checks: jsonb("checks").notNull(),
    blockingFailures: jsonb("blocking_failures").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
    correlationId: text("correlation_id"),
    traceId: text("trace_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("pvg_runs_release_id_idx").on(t.releaseId),
    index("pvg_runs_status_idx").on(t.status),
    index("pvg_runs_environment_idx").on(t.environment),
    index("pvg_runs_verified_at_idx").on(t.verifiedAt),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// canary_deployments — canary governance
// ─────────────────────────────────────────────────────────────────────────────

export const canaryDeployments = pgTable(
  "canary_deployments",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id")
      .notNull()
      .references(() => releaseRecords.releaseId, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    state: text("state").notNull(),
    trafficPercentage: integer("traffic_percentage").notNull().default(0),
    previousPercentage: integer("previous_percentage"),
    verificationEvidence: jsonb("verification_evidence"),
    pvgResult: jsonb("pvg_result"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id").notNull(),
    correlationId: text("correlation_id"),
  },
  (t) => [
    index("canary_deployments_release_id_idx").on(t.releaseId),
    index("canary_deployments_environment_idx").on(t.environment),
    index("canary_deployments_state_idx").on(t.state),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// blue_green_deployments — blue/green governance
// ─────────────────────────────────────────────────────────────────────────────

export const blueGreenDeployments = pgTable(
  "blue_green_deployments",
  {
    id: text("id").primaryKey(),
    environment: text("environment").notNull(),
    blueReleaseId: text("blue_release_id").notNull(),
    greenReleaseId: text("green_release_id").notNull(),
    state: text("state").notNull(),
    trafficState: jsonb("traffic_state").notNull(),
    verificationEvidence: jsonb("verification_evidence"),
    pvgEvidence: jsonb("pvg_evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    actorId: text("actor_id").notNull(),
    correlationId: text("correlation_id"),
  },
  (t) => [
    index("blue_green_deployments_environment_idx").on(t.environment),
    index("blue_green_deployments_state_idx").on(t.state),
    index("blue_green_deployments_blue_release_id_idx").on(t.blueReleaseId),
    index("blue_green_deployments_green_release_id_idx").on(t.greenReleaseId),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// rollback_requests — governed rollback
// ─────────────────────────────────────────────────────────────────────────────

export const rollbackRequests = pgTable(
  "rollback_requests",
  {
    id: text("id").primaryKey(),
    releaseId: text("release_id").notNull(),
    targetReleaseId: text("target_release_id").notNull(),
    type: text("type").notNull(), // APPLICATION | DATABASE | TRAFFIC
    reason: text("reason").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: text("actor_type").notNull(),
    compatibilityChecked: boolean("compatibility_checked").notNull().default(false),
    authorized: boolean("authorized").notNull().default(false),
    evidence: jsonb("evidence"),
    correlationId: text("correlation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rollback_requests_release_id_idx").on(t.releaseId),
    index("rollback_requests_target_release_id_idx").on(t.targetReleaseId),
    index("rollback_requests_type_idx").on(t.type),
  ],
);
