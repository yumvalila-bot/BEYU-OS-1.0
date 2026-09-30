/**
 * BEYU Communications — Canonical Types
 *
 * Shared BEYU OS capability, NOT an OS. Preserves GlobalUserID, RBAC/ABAC/RLS,
 * classification, tenant/entity/country isolation, audit, events, idempotency.
 */

export const COMMUNICATION_CHANNELS = [
  "WHATSAPP",
  "SMS",
  "EMAIL",
  "IN_APP",
  "INTERNAL",
  "PUSH",
  "VOICE",
] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

export const PROVIDER_STATUSES = [
  "CONFIGURED",
  "CONNECTED",
  "VERIFIED",
  "DEGRADED",
  "FAILED",
  "NOT_CONNECTED",
  "SIMULATED",
] as const;
export type ProviderStatus = (typeof PROVIDER_STATUSES)[number];

export const PROVIDER_HEALTH = ["HEALTHY", "DEGRADED", "DOWN", "UNKNOWN"] as const;
export type ProviderHealth = (typeof PROVIDER_HEALTH)[number];

export const CONTACT_METHOD_TYPES = ["PHONE", "WHATSAPP", "EMAIL", "IN_APP", "INTERNAL"] as const;
export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number];

export const CONSENT_PURPOSES = [
  "TRANSACTIONAL",
  "OPERATIONAL",
  "SECURITY",
  "MARKETING",
  "RESEARCH",
  "FEEDBACK",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const CONSENT_STATUSES = ["OPT_IN", "OPT_OUT", "REVOKED"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const MESSAGE_DIRECTIONS = ["INBOUND", "OUTBOUND"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

export const MESSAGE_TYPES = [
  "TEXT",
  "TEMPLATE",
  "MEDIA",
  "DOCUMENT",
  "INVOICE",
  "RECEIPT",
  "REPORT",
  "STATEMENT",
  "ALERT",
  "REMINDER",
  "FEEDBACK_REQUEST",
  "SURVEY",
  "NOTIFICATION",
  "SECURITY",
  "APPROVAL",
  "CASE",
  "JOURNEY",
  "BROADCAST",
] as const;
export type MessageType = (typeof MESSAGE_TYPES)[number];

export const MESSAGE_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
export type MessagePriority = (typeof MESSAGE_PRIORITIES)[number];

export const DELIVERY_STATUSES = [
  "QUEUED",
  "SENDING",
  "SENT",
  "DELIVERED",
  "READ",
  "FAILED",
  "BOUNCED",
  "REJECTED",
  "CANCELLED",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const FAILURE_CODES = [
  "TRANSIENT",
  "PERMANENT",
  "AUTHENTICATION",
  "RATE_LIMIT",
  "INVALID_RECIPIENT",
  "PROVIDER_OUTAGE",
  "POLICY_REJECTION",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export const CONVERSATION_STATUSES = [
  "OPEN",
  "BOT_ACTIVE",
  "HUMAN_REQUIRED",
  "HUMAN_ACTIVE",
  "WAITING_CUSTOMER",
  "WAITING_INTERNAL",
  "BOT_RESUMED",
  "RESOLVED",
  "CLOSED",
] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export const TEMPLATE_CATEGORIES = [
  "TRANSACTIONAL",
  "OPERATIONAL",
  "MARKETING",
  "ALERT",
  "INVOICE",
  "RECEIPT",
  "REPORT",
  "REMINDER",
  "FEEDBACK",
  "SURVEY",
  "WELCOME",
  "NOTIFICATION",
  "SECURITY",
  "APPROVAL",
  "CASE",
  "JOURNEY",
  "BROADCAST",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export const TEMPLATE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "ARCHIVED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const CASE_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const FEEDBACK_TYPES = ["FEEDBACK", "SURVEY", "RATING", "COMPLAINT", "SUGGESTION", "REVIEW"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = [
  "SUBMITTED",
  "CLASSIFIED",
  "ROUTED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const JOURNEY_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

export const JOURNEY_RUN_STATUSES = ["RUNNING", "COMPLETED", "FAILED", "CANCELLED", "PAUSED"] as const;
export type JourneyRunStatus = (typeof JOURNEY_RUN_STATUSES)[number];

export const BROADCAST_STATUSES = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "SCHEDULED",
  "SENDING",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const WEBHOOK_EVENT_STATUSES = ["RECEIVED", "PROCESSING", "PROCESSED", "FAILED", "REJECTED"] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const VERIFICATION_STATUSES = ["PENDING", "VERIFIED", "FAILED", "SKIPPED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const SECURITY_EVENT_TYPES = [
  "FAILED_WEBHOOK_SIGNATURE",
  "ABNORMAL_VOLUME",
  "REPEATED_RETRIES",
  "SUSPICIOUS_RECIPIENT",
  "PROVIDER_FAILURE",
  "CONFIGURATION_CHANGE",
  "UNAUTHORIZED_ACCESS",
  "AUTOMATION_ANOMALY",
  "MESSAGE_LOOP",
  "RATE_LIMIT_EXCEEDED",
  "SPAM_DETECTED",
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

// Communication Intent — canonical orchestration input
export type CommunicationIntent = {
  tenantId: string;
  legalEntityId?: string | null;
  countryCode?: string | null;
  contactId?: string;
  globalUserId?: string | null;
  recipient: string; // phone, email, or internal endpoint
  channel?: CommunicationChannel;
  messageType: MessageType;
  priority: MessagePriority;
  classification: string;
  purpose: ConsentPurpose;
  templateCode?: string;
  templateVariables?: Record<string, unknown>;
  subject?: string;
  body?: string;
  htmlBody?: string;
  structuredPayload?: Record<string, unknown>;
  correlationId: string;
  causationId?: string | null;
  idempotencyKey: string;
  traceId: string;
  scheduledFor?: Date | null;
  requiresHumanApproval?: boolean;
  metadata?: Record<string, unknown>;
};

// Channel selection recommendation (Noelia may recommend, governance decides)
export type ChannelRecommendation = {
  channel: CommunicationChannel;
  reason: string;
  confidence: number;
  model?: string;
};

// Delivery result — normalized provider state
export type DeliveryResult = {
  messageId: string;
  status: DeliveryStatus;
  providerMessageId?: string;
  providerStatus?: string;
  failureCode?: FailureCode;
  failureReason?: string;
  costEstimate?: number;
  actualCost?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
};

// Provider adapter interface
export type ProviderAdapter = {
  providerId: string;
  channel: CommunicationChannel;
  send: (message: {
    to: string;
    from?: string;
    subject?: string;
    body: string;
    htmlBody?: string;
    templateId?: string;
    templateVariables?: Record<string, unknown>;
    mediaUrl?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<DeliveryResult>;
  verifySignature?: (rawBody: string, headers: Record<string, string>) => Promise<boolean>;
  parseInbound?: (payload: unknown) => Promise<{
    from: string;
    to: string;
    body: string;
    mediaUrls?: string[];
    providerMessageId: string;
    providerEventId?: string;
    metadata?: Record<string, unknown>;
  }>;
};
