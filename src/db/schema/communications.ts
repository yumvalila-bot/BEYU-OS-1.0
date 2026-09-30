/**
 * BEYU OS — Shared Communications Capability
 *
 * ONE shared BEYU OS capability, NOT an OS: the governed communication layer
 * through which BEYU communicates with people, organizations, customers,
 * employees, families, tenants, entities and authorized external parties.
 *
 * Preserves:
 * - GlobalUserID as canonical identity
 * - RBAC / ABAC / RLS / tenant / entity / country / classification
 * - Existing audit_log + enterprise_events (hash-chained, tamper-evident)
 * - Existing idempotency_records (durable, scoped)
 * - Existing documents (canonical storage, never duplicated)
 * - Existing workflow, approvals, Noelia/HIVE
 *
 * Architecture:
 * BEYU EVENT → COMMUNICATION INTENT → POLICY → AUTHORIZATION → CONSENT →
 * RECIPIENT RESOLUTION → ROUTING → TEMPLATE → PROVIDER → DELIVERY → AUDIT
 */

import {
  bigint,
  boolean,
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
import { classificationEnum } from "./enums";
import { countries, legalEntities, tenants } from "./core";
import { users } from "./identity";
import { documents } from "./platform";
import { tsvector } from "./search";

// ---------------------------------------------------------------------------
// Channel Registry — WHAT channel can BEYU use?
// ---------------------------------------------------------------------------

export const communicationChannels = pgTable(
  "communication_channels",
  {
    code: text("code").primaryKey(), // WHATSAPP | SMS | EMAIL | IN_APP | INTERNAL
    name: text("name").notNull(),
    description: text("description").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    // Future extensibility: push, voice, telegram, etc.
    supportsInbound: boolean("supports_inbound").notNull().default(false),
    supportsOutbound: boolean("supports_outbound").notNull().default(true),
    supportsMedia: boolean("supports_media").notNull().default(false),
    supportsTemplates: boolean("supports_templates").notNull().default(false),
    maxBodyLength: integer("max_body_length"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

// ---------------------------------------------------------------------------
// Provider Registry — WHO delivers it? Adapter pattern, never hard-coded.
// ---------------------------------------------------------------------------

export const communicationProviders = pgTable(
  "communication_providers",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    channelCode: text("channel_code")
      .notNull()
      .references(() => communicationChannels.code),
    providerType: text("provider_type").notNull(), // META_WHATSAPP | TWILIO_SMS | SENDGRID_EMAIL | BEYU_IN_APP | BEYU_INTERNAL
    name: text("name").notNull(),
    description: text("description"),
    // Status: CONFIGURED | CONNECTED | VERIFIED | DEGRADED | FAILED | NOT_CONNECTED | SIMULATED
    status: text("status").notNull().default("NOT_CONNECTED"),
    // Secret reference only — never the secret itself (0036/0071 precedent)
    secretRef: text("secret_ref"),
    signingSecretRef: text("signing_secret_ref"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    countryCode: text("country_code").references(() => countries.code),
    tenantId: text("tenant_id").references(() => tenants.id), // null = global
    isDefault: boolean("is_default").notNull().default(false),
    priority: integer("priority").notNull().default(100),
    rateLimitPerMinute: integer("rate_limit_per_minute"),
    rateLimitPerHour: integer("rate_limit_per_hour"),
    rateLimitPerDay: integer("rate_limit_per_day"),
    webhookUrl: text("webhook_url"),
    healthStatus: text("health_status").notNull().default("UNKNOWN"), // HEALTHY | DEGRADED | DOWN | UNKNOWN
    lastHealthCheckAt: timestamp("last_health_check_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
    failureCount: integer("failure_count").notNull().default(0),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_providers_code_uidx").on(t.code),
    index("communication_providers_channel_idx").on(t.channelCode),
    index("communication_providers_tenant_idx").on(t.tenantId),
    index("communication_providers_country_idx").on(t.countryCode),
    index("communication_providers_status_idx").on(t.status),
  ],
);

// ---------------------------------------------------------------------------
// Contact / Recipient 360° — WHO is BEYU communicating with?
// ---------------------------------------------------------------------------

export const communicationContacts = pgTable(
  "communication_contacts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Canonical identity linking — explicit, auditable, never automatic
    globalUserId: text("global_user_id").references(() => users.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    displayName: text("display_name").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    organizationName: text("organization_name"),
    // Primary endpoints for quick resolution (canonical methods in child table)
    primaryPhone: text("primary_phone"),
    primaryEmail: text("primary_email"),
    primaryWhatsapp: text("primary_whatsapp"),
    // Preferences
    preferredChannel: text("preferred_channel"),
    preferredLanguage: text("preferred_language").notNull().default("en"),
    timezone: text("timezone").notNull().default("UTC"),
    // Classification & governance
    classification: classificationEnum("classification").notNull().default("CONFIDENTIAL"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | INACTIVE | BLOCKED | ARCHIVED
    relationshipType: text("relationship_type"), // CUSTOMER | SUPPLIER | EMPLOYEE | FAMILY | etc.
    // Verification
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verifiedBy: text("verified_by"),
    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Shared Search
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    index("communication_contacts_tenant_idx").on(t.tenantId),
    index("communication_contacts_global_user_idx").on(t.globalUserId),
    index("communication_contacts_entity_idx").on(t.legalEntityId),
    index("communication_contacts_country_idx").on(t.countryCode),
    index("communication_contacts_status_idx").on(t.status),
    index("communication_contacts_phone_idx").on(t.primaryPhone),
    index("communication_contacts_email_idx").on(t.primaryEmail),
    index("communication_contacts_search_tsv_idx").on(t.searchTsv),
  ],
);

// Verified contact methods — phone, WhatsApp, email, in-app, internal
export const communicationContactMethods = pgTable(
  "communication_contact_methods",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => communicationContacts.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    methodType: text("method_type").notNull(), // PHONE | WHATSAPP | EMAIL | IN_APP | INTERNAL
    value: text("value").notNull(), // phone number, email address, internal endpoint
    normalizedValue: text("normalized_value"), // E.164 phone, lowercased email
    label: text("label"), // HOME | WORK | PERSONAL | etc.
    isPrimary: boolean("is_primary").notNull().default(false),
    verified: boolean("verified").notNull().default(false),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationSource: text("verification_source"),
    verificationEvidenceId: text("verification_evidence_id"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_contact_methods_unique").on(t.contactId, t.methodType, t.value),
    index("communication_contact_methods_contact_idx").on(t.contactId),
    index("communication_contact_methods_tenant_idx").on(t.tenantId),
    index("communication_contact_methods_type_idx").on(t.methodType),
    index("communication_contact_methods_normalized_idx").on(t.normalizedValue),
  ],
);

// ---------------------------------------------------------------------------
// Consent & Preferences — is BEYU allowed to communicate?
// ---------------------------------------------------------------------------

export const communicationConsents = pgTable(
  "communication_consents",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => communicationContacts.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    purpose: text("purpose").notNull(), // TRANSACTIONAL | OPERATIONAL | SECURITY | MARKETING | RESEARCH
    channel: text("channel").notNull(), // WHATSAPP | SMS | EMAIL | IN_APP | INTERNAL | ALL
    status: text("status").notNull().default("OPT_IN"), // OPT_IN | OPT_OUT | REVOKED
    source: text("source").notNull(), // REGISTRATION | IMPORT | API | WEBHOOK | MANUAL
    evidenceRef: text("evidence_ref"),
    evidenceDocumentId: text("evidence_document_id").references(() => documents.id),
    consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_consents_contact_idx").on(t.contactId),
    index("communication_consents_tenant_idx").on(t.tenantId),
    index("communication_consents_purpose_idx").on(t.purpose),
    index("communication_consents_channel_idx").on(t.channel),
    index("communication_consents_status_idx").on(t.status),
    uniqueIndex("communication_consents_unique").on(t.contactId, t.purpose, t.channel),
  ],
);

export const communicationPreferences = pgTable(
  "communication_preferences",
  {
    id: text("id").primaryKey(),
    contactId: text("contact_id")
      .notNull()
      .references(() => communicationContacts.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    channel: text("channel").notNull(), // WHATSAPP | SMS | EMAIL | IN_APP | INTERNAL | REPORTS | INVOICES | ALERTS | MARKETING
    enabled: boolean("enabled").notNull().default(true),
    priority: integer("priority").notNull().default(100),
    language: text("language").notNull().default("en"),
    timezone: text("timezone"),
    frequency: text("frequency").notNull().default("IMMEDIATE"), // IMMEDIATE | DAILY | WEEKLY | NEVER
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_preferences_contact_idx").on(t.contactId),
    index("communication_preferences_tenant_idx").on(t.tenantId),
    uniqueIndex("communication_preferences_unique").on(t.contactId, t.channel),
  ],
);

// ---------------------------------------------------------------------------
// Template Engine — versioned, localized, approved, classified
// ---------------------------------------------------------------------------

export const communicationTemplates = pgTable(
  "communication_templates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id), // null = global template
    code: text("code").notNull(),
    version: text("version").notNull().default("1.0.0"),
    channel: text("channel").notNull(), // WHATSAPP | SMS | EMAIL | IN_APP | INTERNAL | ALL
    category: text("category").notNull(), // TRANSACTIONAL | OPERATIONAL | MARKETING | ALERT | INVOICE | REPORT | etc.
    name: text("name").notNull(),
    description: text("description"),
    subjectTemplate: text("subject_template"),
    bodyTemplate: text("body_template").notNull(),
    htmlTemplate: text("html_template"),
    structuredPayloadTemplate: jsonb("structured_payload_template").$type<Record<string, unknown>>(),
    variables: jsonb("variables").$type<string[]>().notNull().default([]),
    requiredVariables: jsonb("required_variables").$type<string[]>().notNull().default([]),
    language: text("language").notNull().default("en"),
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    status: text("status").notNull().default("DRAFT"), // DRAFT | PENDING_APPROVAL | APPROVED | REJECTED | ARCHIVED
    approvalRef: text("approval_ref"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Provider-specific requirements (WhatsApp template approval, etc.)
    providerTemplateId: text("provider_template_id"),
    providerStatus: text("provider_status"),
    providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_templates_code_version_uidx").on(t.code, t.version),
    index("communication_templates_tenant_idx").on(t.tenantId),
    index("communication_templates_channel_idx").on(t.channel),
    index("communication_templates_category_idx").on(t.category),
    index("communication_templates_status_idx").on(t.status),
    index("communication_templates_language_idx").on(t.language),
    index("communication_templates_country_idx").on(t.countryCode),
  ],
);

// ---------------------------------------------------------------------------
// Conversation Engine — unified, governed, omnichannel
// ---------------------------------------------------------------------------

export const communicationConversations = pgTable(
  "communication_conversations",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    countryCode: text("country_code").references(() => countries.code),
    contactId: text("contact_id").references(() => communicationContacts.id),
    globalUserId: text("global_user_id").references(() => users.id),
    // Conversation metadata
    channel: text("channel").notNull(), // initial channel
    subject: text("subject"),
    // Status: OPEN | BOT_ACTIVE | HUMAN_REQUIRED | HUMAN_ACTIVE | WAITING_CUSTOMER | WAITING_INTERNAL | BOT_RESUMED | RESOLVED | CLOSED
    status: text("status").notNull().default("OPEN"),
    priority: text("priority").notNull().default("NORMAL"), // LOW | NORMAL | HIGH | CRITICAL
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    // Assignment
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    assignedToRole: text("assigned_to_role"),
    // Correlation for loop prevention & tracing
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    // SLA
    slaPolicyId: text("sla_policy_id"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    // Metadata
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    // Timestamps
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Search
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    index("communication_conversations_tenant_idx").on(t.tenantId),
    index("communication_conversations_contact_idx").on(t.contactId),
    index("communication_conversations_global_user_idx").on(t.globalUserId),
    index("communication_conversations_status_idx").on(t.status),
    index("communication_conversations_channel_idx").on(t.channel),
    index("communication_conversations_priority_idx").on(t.priority),
    index("communication_conversations_assigned_idx").on(t.assignedToUserId),
    index("communication_conversations_correlation_idx").on(t.correlationId),
    index("communication_conversations_search_tsv_idx").on(t.searchTsv),
  ],
);

// ---------------------------------------------------------------------------
// Message Engine — canonical message model
// ---------------------------------------------------------------------------

export const communicationMessages = pgTable(
  "communication_messages",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    contactId: text("contact_id").references(() => communicationContacts.id),
    // Channel & provider
    channel: text("channel").notNull(), // WHATSAPP | SMS | EMAIL | IN_APP | INTERNAL
    providerId: text("provider_id").references(() => communicationProviders.id),
    // Direction & type
    direction: text("direction").notNull(), // INBOUND | OUTBOUND
    messageType: text("message_type").notNull().default("TEXT"), // TEXT | TEMPLATE | MEDIA | DOCUMENT | INVOICE | REPORT | etc.
    // Content
    sender: text("sender").notNull(),
    recipient: text("recipient").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    htmlBody: text("html_body"),
    structuredPayload: jsonb("structured_payload").$type<Record<string, unknown>>(),
    // Template
    templateId: text("template_id").references(() => communicationTemplates.id),
    templateVariables: jsonb("template_variables").$type<Record<string, unknown>>(),
    // Governance
    priority: text("priority").notNull().default("NORMAL"), // LOW | NORMAL | HIGH | CRITICAL
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    // Status: QUEUED | SENDING | SENT | DELIVERED | READ | FAILED | BOUNCED | REJECTED | CANCELLED
    status: text("status").notNull().default("QUEUED"),
    deliveryStatus: text("delivery_status").notNull().default("QUEUED"),
    failureReason: text("failure_reason"),
    failureCode: text("failure_code"), // TRANSIENT | PERMANENT | AUTHENTICATION | RATE_LIMIT | INVALID_RECIPIENT | PROVIDER_OUTAGE | POLICY_REJECTION
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    // Correlation & idempotency & loop prevention
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    traceId: text("trace_id").notNull(),
    // Provider tracking
    providerMessageId: text("provider_message_id"),
    providerThreadId: text("provider_thread_id"),
    // Cost intelligence (NOT accounting)
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 6 }),
    actualCost: numeric("actual_cost", { precision: 12, scale: 6 }),
    costCurrency: text("cost_currency").notNull().default("USD"),
    // AI assistance
    aiDrafted: boolean("ai_drafted").notNull().default(false),
    aiModel: text("ai_model"),
    aiConfidence: numeric("ai_confidence", { precision: 5, scale: 4 }),
    requiresHumanApproval: boolean("requires_human_approval").notNull().default(false),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    // Timestamps
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Search
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    uniqueIndex("communication_messages_idempotency_uidx").on(t.tenantId, t.idempotencyKey),
    index("communication_messages_tenant_idx").on(t.tenantId),
    index("communication_messages_conversation_idx").on(t.conversationId),
    index("communication_messages_contact_idx").on(t.contactId),
    index("communication_messages_channel_idx").on(t.channel),
    index("communication_messages_provider_idx").on(t.providerId),
    index("communication_messages_status_idx").on(t.status),
    index("communication_messages_direction_idx").on(t.direction),
    index("communication_messages_correlation_idx").on(t.correlationId),
    index("communication_messages_provider_message_idx").on(t.providerMessageId),
    index("communication_messages_search_tsv_idx").on(t.searchTsv),
  ],
);

// Delivery tracking — provider delivery events
export const communicationDeliveryEvents = pgTable(
  "communication_delivery_events",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => communicationMessages.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    eventType: text("event_type").notNull(), // QUEUED | SENDING | SENT | DELIVERED | READ | FAILED | BOUNCED | REJECTED
    providerEventId: text("provider_event_id"),
    providerStatus: text("provider_status"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    failureReason: text("failure_reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_delivery_events_message_idx").on(t.messageId),
    index("communication_delivery_events_tenant_idx").on(t.tenantId),
    index("communication_delivery_events_type_idx").on(t.eventType),
  ],
);

// Webhook inbox — durable, idempotent, signature-verified (payments pattern)
export const communicationWebhookEvents = pgTable(
  "communication_webhook_events",
  {
    id: text("id").primaryKey(),
    providerId: text("provider_id").references(() => communicationProviders.id),
    providerCode: text("provider_code").notNull(),
    channel: text("channel").notNull(),
    tenantId: text("tenant_id").references(() => tenants.id), // resolved from provider, never from payload
    eventType: text("event_type").notNull(),
    rawPayload: text("raw_payload").notNull(),
    parsedPayload: jsonb("parsed_payload").$type<Record<string, unknown>>(),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    verificationStatus: text("verification_status").notNull().default("PENDING"), // PENDING | VERIFIED | FAILED | SKIPPED
    // Idempotency: provider + provider account + provider event/message ID
    idempotencyKey: text("idempotency_key").notNull(),
    providerEventId: text("provider_event_id"),
    status: text("status").notNull().default("RECEIVED"), // RECEIVED | PROCESSING | PROCESSED | FAILED | REJECTED
    failureReason: text("failure_reason"),
    correlationId: text("correlation_id"),
    traceId: text("trace_id").notNull(),
    sourceIp: text("source_ip"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_webhook_events_idempotency_uidx").on(t.providerCode, t.idempotencyKey),
    index("communication_webhook_events_provider_idx").on(t.providerId),
    index("communication_webhook_events_tenant_idx").on(t.tenantId),
    index("communication_webhook_events_status_idx").on(t.status),
    index("communication_webhook_events_channel_idx").on(t.channel),
  ],
);

// Attachments — governed delivery of documents (never duplicate storage)
export const communicationAttachments = pgTable(
  "communication_attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id")
      .notNull()
      .references(() => communicationMessages.id),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    fileName: text("file_name").notNull(),
    fileType: text("file_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    // Access control
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }),
    downloadCount: integer("download_count").notNull().default(0),
    lastDownloadedAt: timestamp("last_downloaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_attachments_message_idx").on(t.messageId),
    index("communication_attachments_document_idx").on(t.documentId),
    index("communication_attachments_tenant_idx").on(t.tenantId),
  ],
);

// ---------------------------------------------------------------------------
// Routing Engine — governed channel selection & routing
// ---------------------------------------------------------------------------

export const communicationRoutingRules = pgTable(
  "communication_routing_rules",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id), // null = global
    name: text("name").notNull(),
    description: text("description"),
    channel: text("channel"), // target channel, null = any
    messageType: text("message_type"), // message type this rule applies to
    priority: integer("priority").notNull().default(100),
    conditions: jsonb("conditions").$type<Record<string, unknown>>().notNull().default({}),
    action: jsonb("action").$type<Record<string, unknown>>().notNull().default({}),
    // ABAC dimensions
    countryCode: text("country_code").references(() => countries.code),
    classification: classificationEnum("classification"),
    // Governance
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_routing_rules_tenant_idx").on(t.tenantId),
    index("communication_routing_rules_channel_idx").on(t.channel),
    index("communication_routing_rules_priority_idx").on(t.priority),
  ],
);

// ---------------------------------------------------------------------------
// SLA & Escalation — governed response & resolution times
// ---------------------------------------------------------------------------

export const communicationSlaPolicies = pgTable(
  "communication_sla_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    channel: text("channel"),
    priority: text("priority").notNull().default("NORMAL"),
    messageType: text("message_type"),
    // SLA timers (minutes)
    responseTimeMinutes: integer("response_time_minutes").notNull(),
    resolutionTimeMinutes: integer("resolution_time_minutes").notNull(),
    // Business hours & calendar
    businessHours: jsonb("business_hours").$type<Record<string, unknown>>().notNull().default({}),
    holidays: jsonb("holidays").$type<string[]>().notNull().default([]),
    timezone: text("timezone").notNull().default("UTC"),
    // Escalation
    escalationRules: jsonb("escalation_rules").$type<Record<string, unknown>>().notNull().default({}),
    enabled: boolean("enabled").notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_sla_policies_tenant_idx").on(t.tenantId),
    index("communication_sla_policies_channel_idx").on(t.channel),
    index("communication_sla_policies_priority_idx").on(t.priority),
  ],
);

// ---------------------------------------------------------------------------
// Case / Ticket Bridge — minimal governed bridge, integrates with existing
// ---------------------------------------------------------------------------

export const communicationCases = pgTable(
  "communication_cases",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    contactId: text("contact_id").references(() => communicationContacts.id),
    legalEntityId: text("legal_entity_id").references(() => legalEntities.id),
    // Case metadata
    type: text("type").notNull().default("SUPPORT"), // COMPLAINT | SUPPORT | FEEDBACK | INQUIRY | etc.
    subject: text("subject").notNull(),
    description: text("description"),
    status: text("status").notNull().default("OPEN"), // OPEN | ASSIGNED | IN_PROGRESS | WAITING_CUSTOMER | RESOLVED | CLOSED
    priority: text("priority").notNull().default("NORMAL"),
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    // Assignment & SLA
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    assignedToRole: text("assigned_to_role"),
    slaPolicyId: text("sla_policy_id").references(() => communicationSlaPolicies.id),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    slaBreachedAt: timestamp("sla_breached_at", { withTimezone: true }),
    // Correlation
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    // Timestamps
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Search
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    index("communication_cases_tenant_idx").on(t.tenantId),
    index("communication_cases_conversation_idx").on(t.conversationId),
    index("communication_cases_contact_idx").on(t.contactId),
    index("communication_cases_status_idx").on(t.status),
    index("communication_cases_assigned_idx").on(t.assignedToUserId),
    index("communication_cases_correlation_idx").on(t.correlationId),
    index("communication_cases_search_tsv_idx").on(t.searchTsv),
  ],
);

// ---------------------------------------------------------------------------
// Journey Automation — governed communication journeys
// ---------------------------------------------------------------------------

export const communicationJourneys = pgTable(
  "communication_journeys",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    triggerEventType: text("trigger_event_type").notNull(),
    triggerConditions: jsonb("trigger_conditions").$type<Record<string, unknown>>().notNull().default({}),
    steps: jsonb("steps").$type<Record<string, unknown>[]>().notNull().default([]),
    status: text("status").notNull().default("DRAFT"), // DRAFT | ACTIVE | PAUSED | ARCHIVED
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_journeys_code_uidx").on(t.code),
    index("communication_journeys_tenant_idx").on(t.tenantId),
    index("communication_journeys_status_idx").on(t.status),
    index("communication_journeys_trigger_idx").on(t.triggerEventType),
  ],
);

export const communicationJourneyRuns = pgTable(
  "communication_journey_runs",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => communicationJourneys.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => communicationContacts.id),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    status: text("status").notNull().default("RUNNING"), // RUNNING | COMPLETED | FAILED | CANCELLED | PAUSED
    currentStep: integer("current_step").notNull().default(0),
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_journey_runs_journey_idx").on(t.journeyId),
    index("communication_journey_runs_tenant_idx").on(t.tenantId),
    index("communication_journey_runs_contact_idx").on(t.contactId),
    index("communication_journey_runs_status_idx").on(t.status),
    index("communication_journey_runs_correlation_idx").on(t.correlationId),
  ],
);

// ---------------------------------------------------------------------------
// Feedback Platform — governed feedback, surveys, ratings
// ---------------------------------------------------------------------------

export const communicationFeedback = pgTable(
  "communication_feedback",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: text("message_id").references(() => communicationMessages.id),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    contactId: text("contact_id").references(() => communicationContacts.id),
    caseId: text("case_id").references(() => communicationCases.id),
    // Feedback content
    type: text("type").notNull().default("FEEDBACK"), // FEEDBACK | SURVEY | RATING | COMPLAINT | SUGGESTION | REVIEW
    rating: integer("rating"), // 1-5
    subject: text("subject"),
    body: text("body").notNull(),
    // Classification & routing
    classification: classificationEnum("classification").notNull().default("INTERNAL"),
    category: text("category"),
    urgency: text("urgency").notNull().default("NORMAL"),
    status: text("status").notNull().default("SUBMITTED"), // SUBMITTED | CLASSIFIED | ROUTED | IN_PROGRESS | RESOLVED | CLOSED
    assignedToUserId: text("assigned_to_user_id").references(() => users.id),
    assignedToRole: text("assigned_to_role"),
    // AI analysis (attributable, auditable, never overwrites original)
    aiAnalysis: jsonb("ai_analysis").$type<Record<string, unknown>>(),
    aiModel: text("ai_model"),
    aiAnalyzedAt: timestamp("ai_analyzed_at", { withTimezone: true }),
    // Correlation
    correlationId: text("correlation_id").notNull(),
    causationId: text("causation_id"),
    // Timestamps
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Search
    searchTsv: tsvector("search_tsv"),
  },
  (t) => [
    index("communication_feedback_tenant_idx").on(t.tenantId),
    index("communication_feedback_contact_idx").on(t.contactId),
    index("communication_feedback_conversation_idx").on(t.conversationId),
    index("communication_feedback_case_idx").on(t.caseId),
    index("communication_feedback_type_idx").on(t.type),
    index("communication_feedback_status_idx").on(t.status),
    index("communication_feedback_correlation_idx").on(t.correlationId),
    index("communication_feedback_search_tsv_idx").on(t.searchTsv),
  ],
);

// ---------------------------------------------------------------------------
// Scheduled / Reminder Communications
// ---------------------------------------------------------------------------

export const communicationScheduled = pgTable(
  "communication_scheduled",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    contactId: text("contact_id").references(() => communicationContacts.id),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    journeyRunId: text("journey_run_id").references(() => communicationJourneyRuns.id),
    // Scheduling
    type: text("type").notNull(), // REMINDER | FOLLOW_UP | SCHEDULED_REPORT | INVOICE_REMINDER | etc.
    channel: text("channel").notNull(),
    templateId: text("template_id").references(() => communicationTemplates.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    // Idempotency
    idempotencyKey: text("idempotency_key").notNull(),
    correlationId: text("correlation_id").notNull(),
    // Status
    status: text("status").notNull().default("SCHEDULED"), // SCHEDULED | SENT | FAILED | CANCELLED
    failureReason: text("failure_reason"),
    // Timing
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_scheduled_idempotency_uidx").on(t.tenantId, t.idempotencyKey),
    index("communication_scheduled_tenant_idx").on(t.tenantId),
    index("communication_scheduled_contact_idx").on(t.contactId),
    index("communication_scheduled_status_idx").on(t.status),
    index("communication_scheduled_scheduled_for_idx").on(t.scheduledFor),
  ],
);

// ---------------------------------------------------------------------------
// Analytics — governed metrics, tenant/entity isolated
// ---------------------------------------------------------------------------

export const communicationAnalyticsDaily = pgTable(
  "communication_analytics_daily",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    date: text("date").notNull(), // YYYY-MM-DD
    channel: text("channel").notNull(),
    providerId: text("provider_id").references(() => communicationProviders.id),
    countryCode: text("country_code").references(() => countries.code),
    messageType: text("message_type"),
    // Counts
    sentCount: integer("sent_count").notNull().default(0),
    deliveredCount: integer("delivered_count").notNull().default(0),
    readCount: integer("read_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    bouncedCount: integer("bounced_count").notNull().default(0),
    inboundCount: integer("inbound_count").notNull().default(0),
    // Timing
    avgResponseTimeSeconds: numeric("avg_response_time_seconds", { precision: 12, scale: 2 }),
    avgResolutionTimeSeconds: numeric("avg_resolution_time_seconds", { precision: 12, scale: 2 }),
    // Costs
    totalEstimatedCost: numeric("total_estimated_cost", { precision: 12, scale: 6 }).notNull().default("0"),
    totalActualCost: numeric("total_actual_cost", { precision: 12, scale: 6 }).notNull().default("0"),
    costCurrency: text("cost_currency").notNull().default("USD"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_analytics_daily_uidx").on(t.tenantId, t.date, t.channel, t.messageType),
    index("communication_analytics_daily_tenant_idx").on(t.tenantId),
    index("communication_analytics_daily_date_idx").on(t.date),
    index("communication_analytics_daily_channel_idx").on(t.channel),
  ],
);

// ---------------------------------------------------------------------------
// Cost Intelligence — NOT accounting, cost visibility only
// ---------------------------------------------------------------------------

export const communicationCostLedger = pgTable(
  "communication_cost_ledger",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: text("message_id")
      .notNull()
      .references(() => communicationMessages.id),
    providerId: text("provider_id").references(() => communicationProviders.id),
    channel: text("channel").notNull(),
    countryCode: text("country_code").references(() => countries.code),
    messageType: text("message_type"),
    estimatedCost: numeric("estimated_cost", { precision: 12, scale: 6 }),
    actualCost: numeric("actual_cost", { precision: 12, scale: 6 }),
    currency: text("currency").notNull().default("USD"),
    billingStatus: text("billing_status").notNull().default("ESTIMATED"), // ESTIMATED | BILLED | CONFIRMED
    billedAt: timestamp("billed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_cost_ledger_tenant_idx").on(t.tenantId),
    index("communication_cost_ledger_message_idx").on(t.messageId),
    index("communication_cost_ledger_provider_idx").on(t.providerId),
    index("communication_cost_ledger_channel_idx").on(t.channel),
  ],
);

// ---------------------------------------------------------------------------
// Security Monitoring — governed security events for communications
// ---------------------------------------------------------------------------

export const communicationSecurityEvents = pgTable(
  "communication_security_events",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").references(() => tenants.id),
    eventType: text("event_type").notNull(), // FAILED_WEBHOOK_SIGNATURE | ABNORMAL_VOLUME | SUSPICIOUS_RECIPIENT | etc.
    severity: text("severity").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH | CRITICAL
    channel: text("channel"),
    providerId: text("provider_id").references(() => communicationProviders.id),
    contactId: text("contact_id").references(() => communicationContacts.id),
    messageId: text("message_id").references(() => communicationMessages.id),
    webhookEventId: text("webhook_event_id").references(() => communicationWebhookEvents.id),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedBy: text("resolved_by"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_security_events_tenant_idx").on(t.tenantId),
    index("communication_security_events_type_idx").on(t.eventType),
    index("communication_security_events_severity_idx").on(t.severity),
    index("communication_security_events_channel_idx").on(t.channel),
    index("communication_security_events_created_at_idx").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Abuse / Anti-Spam — rate limiting & loop prevention
// ---------------------------------------------------------------------------

export const communicationRateLimits = pgTable(
  "communication_rate_limits",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    scopeType: text("scope_type").notNull(), // TENANT | CONTACT | PROVIDER | CHANNEL | IP
    scopeId: text("scope_id").notNull(),
    channel: text("channel"),
    limitPerMinute: integer("limit_per_minute").notNull().default(60),
    limitPerHour: integer("limit_per_hour").notNull().default(1000),
    limitPerDay: integer("limit_per_day").notNull().default(10000),
    currentCountMinute: integer("current_count_minute").notNull().default(0),
    currentCountHour: integer("current_count_hour").notNull().default(0),
    currentCountDay: integer("current_count_day").notNull().default(0),
    windowStartMinute: timestamp("window_start_minute", { withTimezone: true }).notNull().defaultNow(),
    windowStartHour: timestamp("window_start_hour", { withTimezone: true }).notNull().defaultNow(),
    windowStartDay: timestamp("window_start_day", { withTimezone: true }).notNull().defaultNow(),
    blockedUntil: timestamp("blocked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("communication_rate_limits_scope_uidx").on(t.tenantId, t.scopeType, t.scopeId, t.channel),
    index("communication_rate_limits_tenant_idx").on(t.tenantId),
  ],
);

// Loop detection ledger
export const communicationLoopDetections = pgTable(
  "communication_loop_detections",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    correlationId: text("correlation_id").notNull(),
    conversationId: text("conversation_id").references(() => communicationConversations.id),
    channel: text("channel").notNull(),
    depth: integer("depth").notNull().default(0),
    detected: boolean("detected").notNull().default(false),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_loop_detections_tenant_idx").on(t.tenantId),
    index("communication_loop_detections_correlation_idx").on(t.correlationId),
    index("communication_loop_detections_conversation_idx").on(t.conversationId),
  ],
);

// ---------------------------------------------------------------------------
// Broadcast / Bulk — governed bulk messaging
// ---------------------------------------------------------------------------

export const communicationBroadcasts = pgTable(
  "communication_broadcasts",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name").notNull(),
    description: text("description"),
    channel: text("channel").notNull(),
    templateId: text("template_id").references(() => communicationTemplates.id),
    audienceFilter: jsonb("audience_filter").$type<Record<string, unknown>>().notNull().default({}),
    audienceCount: integer("audience_count").notNull().default(0),
    status: text("status").notNull().default("DRAFT"), // DRAFT | PENDING_APPROVAL | APPROVED | SCHEDULED | SENDING | COMPLETED | CANCELLED | FAILED
    approvalRef: text("approval_ref"),
    approvedBy: text("approved_by"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sentCount: integer("sent_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    correlationId: text("correlation_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("communication_broadcasts_tenant_idx").on(t.tenantId),
    index("communication_broadcasts_status_idx").on(t.status),
    index("communication_broadcasts_channel_idx").on(t.channel),
    index("communication_broadcasts_correlation_idx").on(t.correlationId),
  ],
);

export const communicationBroadcastRecipients = pgTable(
  "communication_broadcast_recipients",
  {
    broadcastId: text("broadcast_id")
      .notNull()
      .references(() => communicationBroadcasts.id),
    contactId: text("contact_id")
      .notNull()
      .references(() => communicationContacts.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    messageId: text("message_id").references(() => communicationMessages.id),
    status: text("status").notNull().default("PENDING"), // PENDING | SENT | FAILED | SKIPPED | OPTED_OUT
    failureReason: text("failure_reason"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.broadcastId, t.contactId] }),
    index("communication_broadcast_recipients_tenant_idx").on(t.tenantId),
    index("communication_broadcast_recipients_status_idx").on(t.status),
  ],
);
