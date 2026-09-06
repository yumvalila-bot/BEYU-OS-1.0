/**
 * BEYU Noelia AI platform schema (Phase 1–6 provider-independent layer).
 *
 * Canonical rules:
 *  - Noelia identity is SEPARATE from human GlobalUserID.
 *  - A provider is BEYU-owned infrastructure, never an external vendor mandate.
 *  - A model is an intelligence implementation, never an authority.
 *  - Every tenant-scoped row is RLS-protected through the canonical
 *    beyu_tenant_ids()/beyu_global_scope() helpers (migration 0023).
 *  - Nothing here grants any runtime authority; all new capabilities are
 *    default-deny until an accountable human registers/approves them.
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { classificationEnum } from "./enums";
import { countries, legalEntities, tenants } from "./core";
import { modelRegistry } from "./platform";

/**
 * Canonical AI identity registry.
 *
 * `NOELIA` is the enterprise AI identity. It is NOT a user row and has no role
 * grants of its own: effective authority is always the intersection of the
 * requesting human's authority and the AI identity's governed grants.
 */
export const noeliaAiIdentity = pgTable(
  "noelia_ai_identity",
  {
    id: text("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    identityType: text("identity_type").notNull().default("ENTERPRISE_AI"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | SUSPENDED | RETIRED
    version: text("version").notNull(),
    ownerOrganization: text("owner_organization").notNull(),
    description: text("description"),
    riskLevel: text("risk_level").notNull().default("LOW"),
    governingRole: text("governing_role"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("noelia_ai_identity_canonical_name_uidx").on(t.canonicalName)],
);

/**
 * Provider registry (BEYU-owned / self-hosted / open-weight / external).
 *
 * External providers are OPTIONAL. A provider row does not authorise use by
 * itself; the model registry + router must also approve it for the context.
 */
export const noeliaProviders = pgTable(
  "noelia_providers",
  {
    id: text("id").primaryKey(),
    providerName: text("provider_name").notNull(),
    providerType: text("provider_type").notNull(), // BEYU_OWNED | SELF_HOSTED | OPEN_WEIGHT | EXTERNAL
    ownership: text("ownership").notNull().default("BEYU"),
    endpoint: text("endpoint"),
    region: text("region"),
    dataResidency: text("data_residency").notNull().default("BEYU_CONTROLLED"),
    authenticationMethod: text("authentication_method").notNull().default("NONE"),
    securityStatus: text("security_status").notNull().default("NOT_ASSESSED"),
    complianceStatus: text("compliance_status").notNull().default("NOT_ASSESSED"),
    lifecycleStatus: text("lifecycle_status").notNull().default("REGISTERED"),
    active: boolean("active").notNull().default(false),
    description: text("description"),
    assessment: jsonb("assessment").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("noelia_providers_name_uidx").on(t.providerName)],
);

/**
 * Model lifecycle events (Phase 3, prompt sections 11/34).
 *
 * A model reaches ACTIVE only through a recorded chain from REGISTERED →
 * PROVENANCE VERIFY → SECURITY REVIEW → EVALUATE → RISK ASSESS → APPROVE →
 * CANARY → ACTIVE. This is append-only governance evidence; a lifecycle row
 * never grants authority by itself.
 */
export const noeliaModelLifecycleEvents = pgTable(
  "noelia_model_lifecycle_events",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => modelRegistry.id),
    modelVersion: text("model_version").notNull(),
    providerId: text("provider_id").references(() => noeliaProviders.id),
    lifecycleState: text("lifecycle_state").notNull(),
    previousState: text("previous_state"),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    requestId: text("request_id"),
    traceId: text("trace_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("noelia_model_lifecycle_model_idx").on(t.modelId, t.modelVersion),
    index("noelia_model_lifecycle_state_idx").on(t.lifecycleState),
    index("noelia_model_lifecycle_request_idx").on(t.requestId),
  ],
);

/**
 * Model provenance (Phase 3, prompt sections 12/13).
 *
 * Records origin, publisher, artifact identity, checksum, license, source,
 * deployment, transformation and adapter lineage. BEYU ownership is never
 * claimed without an explicit `origin`/`publisher` value.
 */
export const noeliaModelProvenance = pgTable(
  "noelia_model_provenance",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => modelRegistry.id),
    modelVersion: text("model_version").notNull(),
    providerId: text("provider_id").references(() => noeliaProviders.id),
    origin: text("origin").notNull(),
    publisher: text("publisher").notNull(),
    family: text("family"),
    artifactIdentity: text("artifact_identity"),
    checksum: text("checksum"),
    license: text("license"),
    sourceUri: text("source_uri"),
    deployment: text("deployment").notNull().default("SELF_HOSTED"),
    transformation: text("transformation").notNull().default("NONE"),
    baseModelId: text("base_model_id"),
    baseModelVersion: text("base_model_version"),
    fineTune: text("fine_tune"),
    quantization: text("quantization"),
    adapterLineage: jsonb("adapter_lineage").$type<Record<string, unknown>>().notNull().default({}),
    verificationStatus: text("verification_status").notNull().default("NOT_VERIFIED"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifier: text("verifier"),
    supplyChainNotes: text("supply_chain_notes"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_model_provenance_model_version_uidx").on(t.modelId, t.modelVersion),
    index("noelia_model_provenance_verification_idx").on(t.verificationStatus),
  ],
);

/**
 * Model artifacts (Phase 3, prompt sections 12/13).
 *
 * Each non-secret artifact identity is recorded with its checksum. Artifact
 * URIs are governance metadata; credentials and private keys are never stored.
 */
export const noeliaModelArtifacts = pgTable(
  "noelia_model_artifacts",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => modelRegistry.id),
    modelVersion: text("model_version").notNull(),
    kind: text("kind").notNull().default("WEIGHTS"),
    uri: text("uri").notNull(),
    checksum: text("checksum").notNull(),
    sizeBytes: integer("size_bytes"),
    license: text("license"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("noelia_model_artifacts_model_version_checksum_uidx").on(t.modelId, t.modelVersion, t.checksum),
    index("noelia_model_artifacts_model_idx").on(t.modelId, t.modelVersion),
  ],
);

/**
 * Provider lifecycle events (Phase 3, prompt section 55).
 *
 * External providers are suppliers. Their onboarding chain is append-only and
 * must be: REGISTER → IDENTIFY → SECURITY REVIEW → PRIVACY REVIEW → DATA REVIEW
 * → RESIDENCY REVIEW → CONTRACT REVIEW → RISK ASSESS → EVALUATION → APPROVAL →
 * ACTIVATION. No automatic approval.
 */
export const noeliaProviderLifecycleEvents = pgTable(
  "noelia_provider_lifecycle_events",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id")
      .notNull()
      .references(() => noeliaProviders.id),
    lifecycleState: text("lifecycle_state").notNull(),
    previousState: text("previous_state"),
    reason: text("reason").notNull(),
    actor: text("actor").notNull(),
    requestId: text("request_id"),
    traceId: text("trace_id"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index("noelia_provider_lifecycle_provider_idx").on(t.providerId),
    index("noelia_provider_lifecycle_state_idx").on(t.lifecycleState),
    index("noelia_provider_lifecycle_request_idx").on(t.requestId),
  ],
);

/**
 * Governed model evaluation registry.
 *
 * Evaluation evidence is not a pass/fail certificate. A model is production
 * eligible only when its router-relevant evaluations are APPROVED for the
 * requested context.
 */
export const noeliaEvaluations = pgTable(
  "noelia_evaluations",
  {
    id: text("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => modelRegistry.id),
    modelVersion: text("model_version").notNull(),
    dataset: text("dataset").notNull(),
    testSuite: text("test_suite").notNull(),
    metric: text("metric").notNull(),
    score: text("score").notNull(),
    threshold: text("threshold"),
    evaluatedAt: date("evaluated_at").notNull(),
    evaluator: text("evaluator").notNull(),
    status: text("status").notNull().default("RECORDED"), // RECORDED | APPROVED | FAILED | PENDING_REVIEW
    evidenceRef: text("evidence_ref"),
    note: text("note"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_evaluations_model_idx").on(t.modelId, t.modelVersion),
    index("noelia_evaluations_status_idx").on(t.status),
  ],
);

/**
 * AI risk register (governance record, not a security bypass).
 */
export const noeliaRiskRegister = pgTable(
  "noelia_risk_register",
  {
    id: text("id").primaryKey(),
    riskCode: text("risk_code").notNull(),
    title: text("title").notNull(),
    category: text("category").notNull(),
    description: text("description").notNull(),
    inherentLikelihood: text("inherent_likelihood").notNull().default("UNKNOWN"),
    inherentImpact: text("inherent_impact").notNull().default("UNKNOWN"),
    residualLikelihood: text("residual_likelihood").notNull().default("UNKNOWN"),
    residualImpact: text("residual_impact").notNull().default("UNKNOWN"),
    status: text("status").notNull().default("OPEN"), // OPEN | MITIGATED | ACCEPTED | CLOSED
    ownerRole: text("owner_role"),
    mitigation: text("mitigation"),
    controlMapping: text("control_mapping"),
    nistRmfMapping: text("nist_rmf_mapping"),
    testimonial: text("testimonial"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("noelia_risk_register_code_uidx").on(t.riskCode)],
);

/**
 * AI incident record.
 *
 * Incident handling must never delete audit history; containment is recorded
 * as state + suspension, not deletion.
 */
export const noeliaIncidents = pgTable(
  "noelia_incidents",
  {
    id: text("id").primaryKey(),
    incidentCode: text("incident_code").notNull(),
    classification: text("classification").notNull(), // HALLUCINATION | PRIVACY | TENANT_LEAK | PROMPT_INJECTION | TOOL_ABUSE | MODEL_FAILURE | PROVIDER_FAILURE | OTHER
    severity: text("severity").notNull().default("LOW"), // LOW | MEDIUM | HIGH | CRITICAL
    status: text("status").notNull().default("OPEN"), // OPEN | CONTAINED | RESOLVED | CLOSED
    tenantId: text("tenant_id").references(() => tenants.id),
    modelId: text("model_id").references(() => modelRegistry.id),
    providerId: text("provider_id").references(() => noeliaProviders.id),
    toolName: text("tool_name"),
    traceId: text("trace_id").notNull(),
    description: text("description").notNull(),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    containedAt: timestamp("contained_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    resolution: text("resolution"),
  },
  (t) => [
    index("noelia_incidents_tenant_idx").on(t.tenantId),
    index("noelia_incidents_status_idx").on(t.status),
    index("noelia_incidents_trace_idx").on(t.traceId),
  ],
);

/**
 * Noelia kill switch.
 *
 * A kill switch stops capability, never mutates or deletes evidence.
 * target_type = ALL | MODEL | PROVIDER | TOOL | OS | TENANT | CAPABILITY | AI_IDENTITY
 */
export const noeliaKillSwitch = pgTable(
  "noelia_kill_switch",
  {
    id: text("id").primaryKey(),
    targetType: text("target_type").notNull(),
    targetRef: text("target_ref").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    reason: text("reason").notNull(),
    activatedBy: text("activated_by").notNull(),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    deactivatedBy: text("deactivated_by"),
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (t) => [
    uniqueIndex("noelia_kill_switch_target_uidx").on(t.targetType, t.targetRef),
    index("noelia_kill_switch_enabled_idx").on(t.enabled),
  ],
);

/**
 * Noelia model routing decision ledger (non-sensitive routing metadata).
 *
 * Sensitive prompt/output content is deliberately NOT stored here; that
 * belongs to the existing ai_decisions/audit evidence only when authorised.
 */
export const noeliaRoutingDecisions = pgTable(
  "noelia_routing_decisions",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull(),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    osId: text("os_id"),
    task: text("task").notNull(),
    capability: text("capability").notNull(),
    classification: classificationEnum("classification").notNull(),
    riskLevel: text("risk_level").notNull().default("LOW"),
    selectedModelId: text("selected_model_id").references(() => modelRegistry.id),
    selectedProviderId: text("selected_provider_id").references(() => noeliaProviders.id),
    decision: text("decision").notNull(), // SELECTED | DENIED | FAIL_CLOSED
    denialReasons: jsonb("denial_reasons").$type<string[]>().notNull().default([]),
    policyVersion: text("policy_version"),
    createdBy: text("created_by").notNull().default("NOELIA"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("noelia_routing_tenant_idx").on(t.tenantId),
    index("noelia_routing_request_idx").on(t.requestId),
    index("noelia_routing_model_idx").on(t.selectedModelId),
  ],
);

/**
 * Model registry is the canonical deployment/approval control. This type
 * re-exports the live table and the additional router-relevant metadata.
 */
export { modelRegistry };
