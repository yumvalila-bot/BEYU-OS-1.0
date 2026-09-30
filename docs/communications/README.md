# BEYU Communications Platform — World-Class Incremental Upgrade

## Executive Summary

Implemented world-class governed enterprise-grade multi-channel Communications Platform as a **SHARED BEYU OS CAPABILITY**, not an OS. The platform supports WhatsApp, SMS, Email, In-App Notifications, Internal BEYU Messaging, Unified Conversations, Contact/Recipient 360°, Omnichannel continuity, orchestration, routing, templates, localization, consent, preferences, human handoff, cases/tickets, SLA/escalation, invoices, receipts, reports, documents, feedback, surveys, alerts, reminders, journeys, workflow-triggered communications, AI-assisted communication through Noelia/HIVE, human approval, delivery tracking, provider failover, reliability, analytics, cost intelligence, security monitoring, international/country-specific providers, accessibility, auditability, governance.

**Baseline:** Previous implementation had only basic IN_APP notifications table. No WhatsApp, SMS, Email, conversation, routing, template, consent, etc. This PR is the first comprehensive implementation.

**Architecture Preserved:**
- GlobalUserID as canonical identity — phone/email are endpoints, not identities
- RBAC/ABAC/RLS, tenant/entity/country/classification isolation
- Existing audit_log + enterprise_events (hash-chained, tamper-evident)
- Existing idempotency_records (durable, scoped)
- Existing Documents (canonical storage, never duplicated)
- Existing workflow, approvals, Noelia/HIVE (NOELIA_AI single identity)
- CAP_POSTING remains LOCKED — communications cannot post journals, move funds, approve payments

## Baseline Audit

### Capability Matrix

| Capability | Status | Existing Implementation | Location | Reuse/Extend/New | Gaps | Security | Test Coverage |
|---|---|---|---|---|---|---|---|
| IN_APP notifications | IMPLEMENTED | notifications table | platform.ts | REUSE | No delivery tracking | RLS tenant | PARTIAL |
| Channel registry | NOT_IMPLEMENTED | NOTIFICATION_CHANNELS constant only | foundation/types.ts | NEW | No registry table | Global ref | IMPLEMENTED |
| Provider registry | NOT_IMPLEMENTED | payments providers only | payments.ts | NEW | No comm providers | Secret refs only | IMPLEMENTED |
| Contact/Recipient 360° | NOT_IMPLEMENTED | parties/users only | identity.ts | NEW | No verified methods | Explicit linking | IMPLEMENTED |
| Consent & Preferences | PARTIAL | consents table generic | identity.ts | EXTEND | No channel-specific | Purpose-gated | IMPLEMENTED |
| Templates | NOT_IMPLEMENTED | none | — | NEW | No versioning/localization | Classification | IMPLEMENTED |
| Conversations | NOT_IMPLEMENTED | none | — | NEW | No omnichannel | Tenant RLS | IMPLEMENTED |
| Messages | PARTIAL | notifications only | platform.ts | EXTEND | No provider, delivery | Idempotency | IMPLEMENTED |
| Routing | NOT_IMPLEMENTED | none | — | NEW | No rules engine | Governance decides | IMPLEMENTED |
| Webhook security | NOT_IMPLEMENTED | payments webhook only | payments/webhook | REUSE pattern | No comm webhooks | Sig verification | IMPLEMENTED |
| Idempotency | IMPLEMENTED | idempotency_records + internal_event_receipts | platform.ts | REUSE | — | Scoped (tenant,user,endpoint) | IMPLEMENTED |
| Document delivery | IMPLEMENTED | documents table | platform.ts | REUSE | No attachment link | Auth + classification | IMPLEMENTED |
| Invoice delivery | NOT_IMPLEMENTED | finance only | finance.ts | NEW bridge | No comm integration | DISTRIBUTION_ONLY | IMPLEMENTED |
| Report distribution | NOT_IMPLEMENTED | none | — | NEW bridge | No auth check | Classification | IMPLEMENTED |
| Feedback | NOT_IMPLEMENTED | none | — | NEW | No AI analysis | Preserve original | IMPLEMENTED |
| Cases/Handoffs | NOT_IMPLEMENTED | tasks only | platform.ts | NEW bridge | No SLA | Assignment | IMPLEMENTED |
| SLA/Escalation | NOT_IMPLEMENTED | foundation escalation only | foundation.ts | NEW | No comm SLA | Business hours | IMPLEMENTED |
| Journeys | NOT_IMPLEMENTED | workflows generic | platform.ts | EXTEND | No comm journeys | Tenant scoped | IMPLEMENTED |
| AI assistance (Noelia) | IMPLEMENTED | ai_decisions, noeliaActionRequests | platform.ts | REUSE | No comm drafting | NOELIA_AI single | IMPLEMENTED |
| Human approval | IMPLEMENTED | approvals | governance.ts | REUSE | No comm approval flow | HUMAN_REVIEW | IMPLEMENTED |
| Delivery tracking | NOT_IMPLEMENTED | none | — | NEW | No provider events | Normalized states | IMPLEMENTED |
| Retry/Failover | NOT_IMPLEMENTED | payments retry only | payments/* | NEW | No comm retry | No dup delivery | IMPLEMENTED |
| Loop prevention | NOT_IMPLEMENTED | none | — | NEW | No correlation tracking | Depth limit | IMPLEMENTED |
| Analytics | NOT_IMPLEMENTED | none | — | NEW | No metrics | Tenant isolated | IMPLEMENTED |
| Cost intelligence | NOT_IMPLEMENTED | none | — | NEW | No cost ledger | NOT accounting | IMPLEMENTED |
| Security monitoring | NOT_IMPLEMENTED | audit_log only | platform.ts | EXTEND | No comm security events | SIEM integration | IMPLEMENTED |
| Rate limiting/Anti-spam | PARTIAL | api.ts rateLimit in-memory | api.ts | EXTEND | No durable limits | Emergency disable | IMPLEMENTED |
| Internationalization | PARTIAL | countries table | core.ts | EXTEND | No comm localization | Config externalized | IMPLEMENTED |
| Broadcast/Bulk | NOT_IMPLEMENTED | none | — | NEW | No audience, consent | Approval gate | IMPLEMENTED |

## Existing Capabilities Reused

- **notifications** table — preserved, extended via IN_APP channel in new platform (IN_APP provider uses existing infrastructure)
- **idempotency_records** — reused via `withIdempotency()` wrapper, scoped by (tenantId, userId, endpoint) + request_hash prevents mismatched replay
- **internal_event_receipts** — pattern reused for webhook idempotency (provider_code + idempotency_key unique)
- **audit_log + enterprise_events** — hash-chained, tamper-evident, used for all communications actions
- **documents** — canonical storage, attachments reference documents.id, never duplicate storage, classification, retention, legal hold preserved
- **workflows + approvals** — journey automation uses existing workflow engine, human approval uses approvals table
- **Noelia/HIVE** — NOELIA_AI single identity, ai_decisions table, governed model gateway, no ledger-write, no role-grant, no RLS bypass
- **RBAC/ABAC/RLS** — `can()` primitive, `guarded()` API wrapper, `withTenantDatabaseContext`, `beyu_tenant_ids()` RLS policies
- **payments webhook pattern** — signature verification → payload validation → provider resolution → idempotency → canonical event → processing
- **federation registry pattern** — global reference data (FORCE RLS, SELECT-only) vs tenant-scoped operational data
- **countries, legalEntities, tenants, users** — canonical core

## New Capabilities

### Database (Migration 0072)

26 tables, all with RLS tenant isolation, closed catalogue CHECK constraints, indexes, foreign keys:

- **communication_channels** — WHATSAPP, SMS, EMAIL, IN_APP, INTERNAL + future (PUSH, VOICE, TELEGRAM, TEAMS, SLACK) — global ref, FORCE RLS, no insert/update/delete for runtime
- **communication_providers** — adapter pattern, status CONFIGURED/CONNECTED/VERIFIED/DEGRADED/FAILED/NOT_CONNECTED/SIMULATED, secret_ref + signing_secret_ref (env-var NAMES only, no secret column), country_code, tenant_id, priority, rate limits, health
- **communication_contacts** — tenant_id, global_user_id (nullable, explicit linking), display_name, primary_phone/email/whatsapp, preferred_channel/language/timezone, classification, status, relationship_type, verified, search_tsv
- **communication_contact_methods** — contact_id, method_type PHONE/WHATSAPP/EMAIL/IN_APP/INTERNAL, value, normalized_value (E.164, lowercased email), is_primary, verified, verification_source
- **communication_consents** — contact_id, purpose TRANSACTIONAL/OPERATIONAL/SECURITY/MARKETING/RESEARCH/FEEDBACK, channel, status OPT_IN/OPT_OUT/REVOKED, source, evidence_ref, evidence_document_id, consented_at/revoked_at/expires_at — unique(contact_id, purpose, channel)
- **communication_preferences** — contact_id, channel, enabled, priority, language, frequency IMMEDIATE/DAILY/WEEKLY/NEVER
- **communication_templates** — tenant_id nullable (global), code, version, channel, category, name, subject_template, body_template, html_template, variables, required_variables, language, country_code, classification, status DRAFT/PENDING_APPROVAL/APPROVED/REJECTED/ARCHIVED, provider_template_id, is_active — unique(code, version)
- **communication_conversations** — tenant_id, contact_id, global_user_id, channel, subject, status OPEN/BOT_ACTIVE/HUMAN_REQUIRED/HUMAN_ACTIVE/WAITING_CUSTOMER/WAITING_INTERNAL/BOT_RESUMED/RESOLVED/CLOSED, priority, classification, assigned_to, correlation_id, sla, metadata, tags, search_tsv
- **communication_messages** — canonical: id, tenant_id, conversation_id, contact_id, channel, provider_id, direction INBOUND/OUTBOUND, message_type, sender, recipient, subject, body, html_body, structured_payload, template_id, priority, classification, status QUEUED/SENDING/SENT/DELIVERED/READ/FAILED/BOUNCED/REJECTED/CANCELLED, failure_code TRANSIENT/PERMANENT/AUTH/RATE_LIMIT/INVALID_RECIPIENT/PROVIDER_OUTAGE/POLICY_REJECTION, correlation_id, causation_id, idempotency_key unique(tenant_id, key), trace_id, provider_message_id, cost, ai_drafted, requires_human_approval, search_tsv
- **communication_delivery_events** — message_id, tenant_id, event_type, provider_event_id, payload, occurred_at
- **communication_webhook_events** — provider_id, provider_code, channel, tenant_id (resolved from provider, never payload), event_type, raw_payload, parsed_payload, headers, signature_verified, verification_status, idempotency_key unique(provider_code, key), provider_event_id, status RECEIVED/PROCESSING/PROCESSED/FAILED/REJECTED, trace_id, correlation_id, source_ip
- **communication_attachments** — message_id, document_id FK documents.id, tenant_id, file_name/type/size, access_expires_at, download_count
- **communication_routing_rules** — tenant_id nullable, name, channel, message_type, priority, conditions jsonb, action jsonb, country_code, classification, enabled
- **communication_sla_policies** — tenant_id nullable, name, channel, priority, response_time_minutes, resolution_time_minutes, business_hours, holidays, timezone, escalation_rules
- **communication_cases** — tenant_id, conversation_id, contact_id, type, subject, description, status OPEN/ASSIGNED/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED, priority, classification, assigned_to, sla, correlation_id, search_tsv
- **communication_journeys** — tenant_id nullable, code unique, name, trigger_event_type, trigger_conditions, steps jsonb, status DRAFT/ACTIVE/PAUSED/ARCHIVED
- **communication_journey_runs** — journey_id, tenant_id, contact_id, conversation_id, status RUNNING/COMPLETED/FAILED/CANCELLED/PAUSED, current_step, context, correlation_id
- **communication_feedback** — tenant_id, message_id, conversation_id, contact_id, case_id, type FEEDBACK/SURVEY/RATING/COMPLAINT/SUGGESTION/REVIEW, rating 1-5, body, classification, category, urgency, status SUBMITTED/CLASSIFIED/ROUTED/IN_PROGRESS/RESOLVED/CLOSED, ai_analysis (additive, never overwrites original), search_tsv
- **communication_scheduled** — tenant_id, contact_id, conversation_id, journey_run_id, type, channel, template_id, payload, idempotency_key unique(tenant_id, key), correlation_id, status SCHEDULED/SENT/FAILED/CANCELLED, scheduled_for
- **communication_analytics_daily** — tenant_id, date, channel, provider_id, country_code, message_type, sent/delivered/read/failed/bounced/inbound counts, avg_response/resolution, cost
- **communication_cost_ledger** — tenant_id, message_id, provider_id, channel, country_code, message_type, estimated_cost, actual_cost, currency, billing_status ESTIMATED/BILLED/CONFIRMED — NOT accounting, visibility only
- **communication_security_events** — tenant_id nullable, event_type FAILED_WEBHOOK_SIGNATURE/ABNORMAL_VOLUME/etc., severity LOW/MEDIUM/HIGH/CRITICAL, channel, provider_id, details, resolved
- **communication_rate_limits** — tenant_id, scope_type TENANT/CONTACT/PROVIDER/CHANNEL/IP, scope_id, channel, limits per minute/hour/day, current counts, blocked_until
- **communication_loop_detections** — tenant_id, correlation_id, conversation_id, channel, depth, detected
- **communication_broadcasts** — tenant_id, name, channel, template_id, audience_filter, audience_count, status DRAFT/PENDING_APPROVAL/APPROVED/SCHEDULED/SENDING/COMPLETED/CANCELLED/FAILED, approval, scheduled_for, sent/failed counts, correlation_id
- **communication_broadcast_recipients** — broadcast_id, contact_id, tenant_id, message_id, status PENDING/SENT/FAILED/SKIPPED/OPTED_OUT — PK(broadcast_id, contact_id)

Seed data:
- 5 canonical channels (WHATSAPP, SMS, EMAIL, IN_APP, INTERNAL)
- 5 simulated/default providers (SIMULATED for WhatsApp/SMS/Email, CONFIGURED for IN_APP/INTERNAL)
- 4 default routing rules (transactional, invoice, critical alert, marketing consent-gated)
- 3 SLA policies (CRITICAL 15min/120min, HIGH 60/480, NORMAL 240/1440)
- 5 default templates (WELCOME en/sw, INVOICE en/sw, OTP)

### Services (src/lib/communications/)

- **types.ts** — closed catalogues for all statuses, CommunicationIntent, ChannelRecommendation, DeliveryResult, ProviderAdapter interface
- **channel-registry.ts** — listChannels, getChannel, isValidChannel, canonical meta, extensibility for future channels
- **provider-registry.ts** — listProviders, getProviderById/Code, getDefaultProvider (tenant+country priority), createProvider, updateProviderStatus, simulated adapter
- **contact-service.ts** — Contact 360°: resolveContact360, findContactByMethod, findContactByGlobalUserId, createContact, linkGlobalUserId, searchContacts, normalize (E.164 phone, lowercased email) — explicit, auditable, tenant-aware
- **consent-service.ts** — getConsent, getAllConsents, checkConsentAllowed (transactional/operational/security always allowed, marketing requires OPT_IN), recordConsent (upsert), revokeConsent, getPreferences, setPreference
- **template-service.ts** — renderTemplate with {{variable}} + nested support + missing detection, getTemplateById/Code (tenant+channel+language+country priority), listTemplates, createTemplate, approveTemplate, previewTemplate
- **conversation-service.ts** — VALID_TRANSITIONS map, canTransition, getConversationById, listConversations, createConversation, transitionConversation, assignConversation, getConversationTimeline (from canonical messages, not duplicate ledger), requestHumanHandoff, acceptHumanHandoff
- **message-service.ts** — getMessageById/ByIdempotencyKey, createMessage (idempotency check + loop detection), updateMessageStatus (delivery event + cost ledger), incrementRetryCount, shouldRetry (permanent vs transient), checkLoop (MAX_AUTOMATION_DEPTH 10), attachDocument, listMessages
- **routing-service.ts** — listRoutingRules, evaluateRouting (matches conditions, strategy SINGLE/MULTI_CHANNEL/PREFERRED_WITH_FALLBACK/CONSENT_GATED), defaultRouting (critical multi-channel, invoice multi, marketing consent-gated), applyChannelRecommendation (Noelia recommends, governance decides), getSlaPolicyForContext, createRoutingRule
- **orchestrator.ts** — orchestrateCommunication: POLICY → AUTHZ (tenant match) → RECIPIENT RESOLUTION → CONSENT CHECK (marketing requires OPT_IN, audit DENIED) → ROUTING → CLASSIFICATION CHECK (HIGHLY_RESTRICTED cannot go over insecure SMS) → RATE LIMITING → TEMPLATE (resolve, classification ceiling, missing vars) → PROVIDER (adapter, status check, fallback) → CONVERSATION (find or create, SLA) → DELIVERY (createMessage, idempotency, loop, cost, human approval gate) → AUDIT + EVENT; orchestrateMultiChannel for invoice (Email+WhatsApp+In-App)
- **webhook-service.ts** — ingestWebhookEvent: provider resolution (never trust payload tenant), payload validation (MAX_PAYLOAD_BYTES 256KiB), signature verification (Meta WhatsApp X-Hub-Signature-256, Twilio X-Twilio-Signature, generic), idempotency (provider_code + idempotency_key unique, ON CONFLICT DO NOTHING), parseInboundMessage (WhatsApp entry.changes.value.messages, SMS From/To/Body, Email from/to/text), contact resolution/creation (unverified for unknown inbound), conversation find/create, inbound message creation, audit + event, security event on signature failure; MAX_PAYLOAD_BYTES, PROVIDER_CODE regex
- **security-service.ts** — recordSecurityEvent (audit), listSecurityEvents, checkRateLimit (tenant/contact/provider/channel/IP, minute/hour/day windows, blocked_until, security event on exceed), createRateLimit, emergencyDisableChannel (sets providers FAILED/DOWN, security event CRITICAL, audit), detectAbnormalVolume
- **analytics-service.ts** — getDailyAnalytics, getAnalyticsSummary (sent/delivered/failed/read/inbound, deliveryRate/readRate/failureRate, byChannel, cost), upsertDailyAnalytics (onConflict increment), getCostIntelligence (byChannel/byProvider/byCountry, total), getConversationMetrics (open/bot/human/resolved/closed)
- **feedback-service.ts** — createFeedback (audit + FEEDBACK_SUBMITTED event), classifyFeedback, analyzeFeedbackWithAI (additive, never overwrites original, audit AI), resolveFeedback, listFeedback, getFeedbackTrends (byType/byCategory/byRating, avgRating)
- **journey-service.ts** — createJourney, activateJourney, listJourneys, startJourneyRun, advanceJourneyRun (condition evaluation, orchestrateCommunication per step), handleEventTrigger (eventType → journeys → runs)
- **noelia-service.ts** — NOELIA_AI single identity, never NOELIA_WHATSAPP etc.; draftWithNoelia (isSensitive check: LEGAL/FINANCE/EXECUTIVE/COMPLIANCE/RESTRICTED/HIGHLY_RESTRICTED/MARKETING/amount>10M → requiresHumanApproval, ai_decisions record), recommendChannelWithNoelia (advisory only, preferences), summarizeConversationWithNoelia (authorized context only), detectUrgencyWithNoelia (critical/high keywords)
- **document-service.ts** — validateDocumentAccess (tenant scope, classificationRank check, legalHold preserved), createDocumentDelivery (attachment via documents.id, audit), recordDocumentDownload
- **invoice-service.ts** — handleInvoiceEvent: DISTRIBUTION_ONLY, CAP_POSTING LOCKED, templateMap, multi-channel Email+WhatsApp+In-App, audit
- **report-service.ts** — distributeReport: authorization + classification before delivery, document validation, orchestrateCommunication, attachment, audit

### API Routes (src/app/api/v1/communications/)

All use `guarded()` with permission, action, rateLimit, audit, `withIdempotency()` where appropriate, `withTenantDatabaseContext`, never trust tenant/entity IDs from external payloads.

- **GET /channels** — listChannels (communications:read)
- **GET /providers** — listProviders tenant + channel filter, safe fields only (hasSecret boolean, not secret value) (communications:provider.read)
- **POST /providers** — createProvider (communications:provider.manage, HIGH-RISK, idempotent)
- **GET /contacts** — searchContacts q + limit, or list tenant (communications:contact.read)
- **POST /contacts** — createContact with methods (communications:contact.manage, idempotent)
- **GET /conversations** — listConversations status/channel/contact/assigned filters (communications:conversation.read)
- **POST /conversations** — createConversation (communications:conversation.manage, idempotent)
- **GET /messages** — listMessages conversationId/contactId/channel/status (communications:message.read)
- **POST /messages** — orchestrateCommunication, multi-channel via channels array (communications:message.send, idempotent)
- **GET /templates** — listTemplates tenant + channel/category (communications:template.read)
- **POST /templates** — createTemplate (communications:template.manage, idempotent)
- **GET /consent** — getAllConsents contactId (communications:consent.read)
- **POST /consent** — recordConsent (communications:consent.manage, idempotent)
- **GET /analytics** — getAnalyticsSummary + getCostIntelligence + getConversationMetrics (communications:analytics.read)
- **GET /security** — listSecurityEvents (communications:security.read)
- **GET /feedback** — listFeedback (communications:case.read)
- **POST /feedback** — createFeedback (communications:case.manage, idempotent)
- **GET /cases** — list cases (communications:case.read)
- **POST /cases** — create case (communications:case.manage, idempotent)
- **GET /journeys** — listJourneys (communications:journey.read)
- **POST /journeys** — createJourney (communications:journey.manage, idempotent)
- **GET /broadcasts** — list broadcasts (communications:broadcast.read)
- **POST /broadcasts** — create broadcast DRAFT (communications:broadcast.manage, idempotent, requires approval)
- **GET /delivery** — delivery events for message or tenant (communications:message.read)
- **GET /scheduled** — list scheduled (communications:read)
- **POST /scheduled** — schedule communication (communications:message.send, idempotent)
- **POST /invoice** — handleInvoiceEvent (communications:message.send, idempotent, DISTRIBUTION_ONLY, CAP_POSTING LOCKED)
- **POST /reports** — distributeReport (communications:message.send, idempotent)
- **POST /documents** — attach document (communications:message.send, idempotent)
- **POST /approval** — human approval for AI-drafted (communications:message.send, idempotent, publishes COMMUNICATION_APPROVED event)
- **POST /noelia/draft** — draftWithNoelia or recommendChannelWithNoelia via ?action=recommend (communications:message.send or communications:read)
- **POST /webhook/[provider]** — public endpoint, signature verification, idempotency, rate limiting per provider+IP, audit, security events, tenant resolved from provider connection, never from payload, ledgerEffect NONE, 503 on unknown failure (no stack leak)

### UI (src/app/os/communications/)

- **/os/communications** — overview dashboard: channels, providers (connected/simulated), contacts, conversations, messages, templates, security events, provider status truthful (SIMULATED vs NOT_CONNECTED, no fake CONNECTED), capability map with 18 modules, architecture flow documentation, WHO/WITH WHOM/WHY/WHAT/THROUGH WHICH CHANNEL/UNDER WHICH AUTHORITY/CONSENT/CLASSIFICATION/POLICY/WHAT HAPPENED/WHAT HAPPENS NEXT/WHO ACTED/CAN BE AUDITED deterministic answers
- **/os/communications/overview** — open/bot/human/resolved metrics, failed messages, recent messages timeline
- **/os/communications/channels** — channel registry with capabilities, inbound/outbound/media/templates
- **/os/communications/providers** — provider registry, status, health, secret refs (env-var NAMES only)
- **/os/communications/contacts** — contacts 360° with verified methods, GlobalUserID linking, tenant-isolated
- **/os/communications/conversations** — unified conversations with status, priority, channel, correlation
- **/os/communications/messages** — canonical messages with delivery states, idempotency, trace, AI flags
- **/os/communications/templates** — versioned, localized, approved templates with variables
- **/os/communications/routing** — routing rules + SLA policies
- **/os/communications/consent** — consent + preferences
- **/os/communications/cases**, **/journeys**, **/feedback**, **/broadcasts**, **/delivery**, **/analytics**, **/cost**, **/security** — governed views with API references

Navigation: added Communications to shared capabilities in capabilities.ts (communications:read permission), uses existing OS navigation (desktop + responsive drawer, focus trap, Escape handling).

## Database Changes

Migration 0072_communications_platform.sql — 26 tables, RLS, CHECK constraints, indexes, FKs, seed data, full-text search triggers, source-of-truth registration, os_registry entry as SHARED_CAPABILITY (NOT SECTOR_OS), verification.

- **RLS:** All 26 tables have ENABLE ROW LEVEL SECURITY + FORCE RLS + tenant scope policy via beyu_tenant_ids() / beyu_global_scope(). Registry tables (communication_channels) global ref SELECT-only with restrictive no insert/update/delete. Verification DO block fails migration if RLS missing.
- **CHECK:** Closed catalogues for channel codes, provider status/health, contact status/method type, consent purpose/status, template channel/category/status, conversation status/priority, message channel/direction/status/priority/failure_code, delivery event type, webhook status/verification, case status/priority, journey status/run status, feedback type/status/rating, scheduled status, broadcast status/recipient status, security severity, rate limit scope, cost billing.
- **Idempotency:** communication_messages unique(tenant_id, idempotency_key), communication_scheduled same, communication_webhook_events unique(provider_code, idempotency_key), communication_broadcast_recipients PK(broadcast_id, contact_id), communication_contacts methods unique(contact_id, method_type, value), consents unique(contact_id, purpose, channel), preferences unique(contact_id, channel), templates unique(code, version), journeys unique(code), analytics unique(tenant_id, date, channel, message_type), rate_limits unique(tenant_id, scope_type, scope_id, channel).
- **Search:** GIN indexes on search_tsv for contacts, conversations, messages, cases, feedback; triggers for tsvector generation (0066 pattern).
- **Seed:** Channels (5), providers (5 simulated/configured), routing rules (4), SLA policies (3), templates (5 including Tanzania sw/TZ), source_of_truth (3), os_registry SHARED_COMMUNICATIONS.

## API Changes

- New routes under /api/v1/communications/* (18 endpoints) — all guarded with permissions, rate limiting, audit, idempotency, tenant context
- Public webhook: /api/v1/communications/webhook/[provider] — signature verification, idempotency, rate limiting, tenant from provider, no secret leak, ledgerEffect NONE
- Reuses existing `guarded()`, `withIdempotency()`, `withTenantDatabaseContext`, `recordAudit()`, `publishEvent()` patterns

## UI Changes

- New OS route /os/communications with 18 subpages — integrates into existing BEYU UI, no duplicate OS
- Uses existing brand components (Badge, Metric, Panel), existing guard `requirePrincipal()`, existing tenant scope `withTenantDatabaseContext`
- Accessibility: semantic HTML, keyboard-operable details, focus-visible rings, screen-reader-friendly
- Localization: Tanzania sw/TZ/TZS/+255 as configuration data (templates, routing), not hard-coded engine logic

## Channels

- WHATSAPP — official Meta Cloud API only, no unofficial automation, supports inbound/outbound/media/templates, business endpoints SALES/SUPPORT/OPERATIONS/CUSTOMER_SERVICE via provider registry
- SMS — outbound + inbound where supported, delivery receipts, sender IDs/numbers, country-specific providers, templates, opt-out, rate limits, retries, audit — no personal SIM as API
- EMAIL — plain text + HTML, subject, reply-to, attachments via Documents (never duplicate), delivery, bounce, complaint, retries, threading, templates, localization
- IN_APP — reuses existing notification infrastructure, user/tenant/entity notifications, alerts, approvals, invoices, orders, reports, feedback, security, workflow events
- INTERNAL — governed internal communication between authorized BEYU users via GlobalUserID, RBAC/ABAC/RLS, tenant/entity isolation, classification

## Providers

- Registry: communication_providers with adapter pattern, never hard-coded
- Types: META_WHATSAPP, TWILIO_SMS, SENDGRID_EMAIL, BEYU_IN_APP, BEYU_INTERNAL + SIMULATED variants
- Status: CONFIGURED, CONNECTED, VERIFIED, DEGRADED, FAILED, NOT_CONNECTED, SIMULATED — never claim CONNECTED without evidence
- Seed: SIMULATED for WhatsApp/SMS/Email (safe, never reaches real providers, visibly labeled), CONFIGURED for IN_APP/INTERNAL
- Truthful: UI shows SIMULATED vs NOT_CONNECTED, no fake CONNECTED claims, production activation requires secret refs (env-var NAMES only) + webhook secrets + business approval + evidence
- Failover: where appropriate, provider A → failure → provider B with idempotency, audit, no duplicate delivery, country/consent/classification respected

## Document/Invoice/Report Integration

- **Documents:** Reuses existing documents table, attachments reference documents.id, validates access via classificationRank + tenant scope, supports expiring links, access control, download auditing, legal hold, retention, watermarking via existing Documents capability — no second storage system
- **Invoices:** Integrates with Finance/Commerce, DISTRIBUTION_ONLY, CAP_POSTING LOCKED — no journal posting, no ledger balance modification, no fund movement, no payment approval bypass. Flow: Invoice Created → Notification → Reminder → Due Date → Overdue Notice → Receipt → Statement via Email PDF + WhatsApp notification + In-App copy (routing rules). API: /api/v1/communications/invoice
- **Reports:** Integrates with Reports/Documents, scheduled/on-demand/management/operational/project/sector/compliance/family-office reports, distribution via Email/WhatsApp/SMS/In-App/Internal with authorization + classification before delivery, API: /api/v1/communications/reports

## Feedback

- **Platform:** communication_feedback table, types FEEDBACK/SURVEY/RATING/COMPLAINT/SUGGESTION/REVIEW, status SUBMITTED/CLASSIFIED/ROUTED/IN_PROGRESS/RESOLVED/CLOSED, rating 1-5, category, urgency, assigned_to, search_tsv
- **Flow:** COMMUNICATION → FEEDBACK REQUEST → RESPONSE → FEEDBACK RECORD → CLASSIFICATION → ROUTING → ACTION → RESOLUTION → FOLLOW-UP
- **Intelligence:** Noelia/HIVE may assist with categorization, summarization, topic extraction, urgency detection, trend detection, suggested routing/response — analysis in ai_analysis jsonb, attributable (ai_model, ai_analyzed_at), auditable via audit_log, never silently alters original body
- **API:** /api/v1/communications/feedback

## Case/SLA

- **Case Bridge:** communication_cases minimal governed bridge, integrates with existing tasks, type SUPPORT/COMPLAINT/etc., status OPEN/ASSIGNED/IN_PROGRESS/WAITING_CUSTOMER/RESOLVED/CLOSED, priority, classification, assigned_to, SLA, correlation_id, search_tsv — does not duplicate case-management platform
- **SLA:** communication_sla_policies with response_time_minutes, resolution_time_minutes, business_hours, holidays, timezone, escalation_rules — example UNRESOLVED 24 HOURS → SUPERVISOR ESCALATION, uses existing workflow/scheduling infrastructure
- **Human Handoff:** BOT_ACTIVE → HUMAN_REQUIRED → HUMAN_ACTIVE → BOT_RESUMED → RESOLVED, agent sees authorized context (conversation, customer, order, invoice, case, previous messages, feedback) via RLS + ABAC, no unauthorized exposure
- **API:** /api/v1/communications/cases

## Noelia

- **Canonical Identity:** NOELIA_AI, never NOELIA_WHATSAPP/SMS/EMAIL/COMMUNICATIONS — one governed intelligence identity
- **May:** draft, summarize, classify, translate, route, recommend, detect urgency, assist support, analyze feedback, prepare reports, recommend escalation
- **MUST NOT:** grant permissions, change roles, bypass RLS/RBAC/ABAC, override consent, approve financial transactions, post journals, move money, disable audit, impersonate human, silently override governance
- **Approval Workflow:** Sensitive communication (legal, sensitive reports, executive, high-value financial, regulated, public announcements) → AI DRAFT → POLICY CHECK → HUMAN REVIEW → APPROVAL → SEND → AUDIT via requires_human_approval flag + /api/v1/communications/approval
- **Services:** draftWithNoelia (isSensitive check), recommendChannelWithNoelia (advisory, governance decides), summarizeConversationWithNoelia (authorized context only), detectUrgencyWithNoelia
- **Audit:** Every AI interaction recorded in ai_decisions with agent NOELIA, runtime HIVE, engine COMMUNICATIONS, model, prompt_version, inputs, output, output_class, confidence, policyDecision, humanReviewRequired, finalAction, latencyMs
- **API:** /api/v1/communications/noelia/draft?action=draft|recommend

## Security

- **Model:** GlobalUserID, RBAC, ABAC, RLS, tenant/entity/country/classification ceilings, MFA step-up for HIGH_RISK (communications:provider.manage, communications:broadcast.approve, communications:template.approve), delegation, consent, audit, break-glass preserved
- **Webhook Security:** Reuses payments webhook framework pattern — signature verification (X-Hub-Signature-256 for WhatsApp, X-Twilio-Signature for SMS, generic), payload validation (MAX_PAYLOAD_BYTES 256KiB), provider resolution from code (never payload tenant), durable idempotency (provider_code + idempotency_key), canonical event, processing, audit, security events — protects against forged requests, replay, duplicates, malformed payloads, provider/tenant/entity/country spoofing, never trust tenant/entity IDs from payloads
- **Idempotency:** Reuses existing durable idempotency via idempotency_records (scope + key + request_hash) + communication_messages unique(tenant_id, idempotency_key) + webhook events unique(provider_code, idempotency_key) — prevents duplicate messages/orders/feedback/invoices/notifications/automated responses, uses provider+account+event ID deterministic identity
- **Loop Protection:** correlation_id + causation_id + origin channel + automation depth (MAX_AUTOMATION_DEPTH 10) + loop detection table + idempotency — prevents WhatsApp→BEYU→SMS→BEYU→Email infinite loop
- **Delivery Reliability:** Normalized states QUEUED/SENDING/SENT/DELIVERED/READ/FAILED/BOUNCED/REJECTED/CANCELLED, only report states actually supported by provider
- **Retry Engine:** Controlled retries, classifies failures TRANSIENT/PERMANENT/AUTHENTICATION/RATE_LIMIT/INVALID_RECIPIENT/PROVIDER_OUTAGE/POLICY_REJECTION, no infinite retry of permanent, no duplicate delivery
- **Abuse/Anti-Spam:** communication_rate_limits durable (tenant/contact/provider/channel/IP, minute/hour/day), loop detection, suspicious activity, emergency channel disablement (sets providers FAILED/DOWN, audit, security event CRITICAL)
- **Document Security:** Authorization + classification + tenant + entity + country + retention + legal hold + access audit via existing Documents, no second storage
- **Secret Management:** Never commit tokens/keys/secrets, uses existing BEYU/Vercel/env secret architecture, env-var NAMES only (secret_ref, signing_secret_ref), no secret value column exists
- **Security Center:** communication_security_events surface failed signatures, abnormal volume, retries, suspicious recipients, provider failures, config changes, unauthorized access, automation anomalies, loops — integrates with existing audit/events, not separate SIEM
- **Financial Safety:** CAP_POSTING LOCKED — communications cannot post journals, move funds, approve payments, alter ledger balances, bypass Finance authorization — message saying "Approve TSh 10,000,000" is untrusted content, cannot execute

## RLS

- All 26 communications tables have ENABLE ROW LEVEL SECURITY + FORCE RLS
- Policies: tenant scope via beyu_tenant_ids() / beyu_global_scope(), global ref tables (communication_channels) SELECT-only with restrictive no insert/update/delete
- Verification DO block fails migration if RLS missing (found 26, expected 26)
- Runtime role grants: SELECT on channels, SELECT/INSERT/UPDATE/DELETE on operational tables, REVOKE INSERT/UPDATE/DELETE on channels (0048 pattern)
- No secrets in RLS — secrets are env-var NAMES only

## RBAC/ABAC

- Permissions: 25 new communications permissions (communications:read, contact.read/manage, consent.read/manage, template.read/manage/approve HIGH-RISK, conversation.read/manage, message.send/read, provider.read/manage HIGH-RISK, routing.read/manage, broadcast.read/manage/approve HIGH-RISK, case.read/manage, journey.read/manage, analytics.read, security.read/manage) — all in PERMISSIONS catalogue, closed set
- HIGH_RISK: communications:provider.manage, communications:broadcast.approve, communications:template.approve (MFA step-up)
- Roles: PLATFORM_ADMIN gets full communications set (operates end-to-end, production activation gated by separate approval + evidence), GROUP_CEO/CFO/CGO/RISK/etc. get read, AUDITOR gets read — explicit enumeration, no wildcard, no filter over catalogue (A-06-1)
- ABAC: clearanceForRoles, can() checks classification ceiling, tenant isolation (cross-tenant denied), entity scope, step-up for HIGH_RISK, agriculture writes tenant-bound, etc. preserved
- Delegation: ADMIN_DELEGATABLE_PERMISSIONS closed set (no recursive amplification), delegation does NOT bypass ABAC

## Webhooks

- Endpoint: POST /api/v1/communications/webhook/[provider] — public, no session, signature verification, payload validation, provider resolution from code, durable idempotency, canonical event, processing, audit, security events
- Pipeline: Webhook → signature verification (X-Hub-Signature-256, X-Twilio-Signature) → payload validation (256KiB cap) → provider resolution (from code, tenant from connection, never payload) → durable idempotency (provider_code + provider_event_id) → canonical event → processing (contact resolution, conversation find/create, inbound message, delivery events)
- Protection: forged requests, replay, duplicates, malformed payloads, provider spoofing, tenant/entity/country spoofing — never trust tenant/entity IDs from external payloads
- Response: uninformative about failure reason (recorded + refused), ledgerEffect NONE, 503 on unknown failure (no stack leak), rate limiting per provider+IP stricter than authenticated (60/min)
- Reuses payments webhook pattern (MAX_PAYLOAD_BYTES, PROVIDER_CODE regex, ingestWebhookEvent, apiError/apiOk, requestMeta, rateLimit)

## Idempotency

- Reuses existing durable idempotency: idempotency_records with scope (tenantId:userId:endpoint), idempotency_key, request_hash (pins key to exact payload), state IN_FLIGHT/COMPLETED, statusCode, responseBody, expiresAt — primary key (scope, idempotency_key), claimed atomically via INSERT ON CONFLICT DO NOTHING in same transaction as domain write, duplicate increments duplicateCount and returns original event id
- Communications: communication_messages unique(tenant_id, idempotency_key) prevents duplicate messages, communication_scheduled same, communication_webhook_events unique(provider_code, idempotency_key) prevents duplicate webhook processing, communication_broadcast_recipients PK(broadcast_id, contact_id) prevents duplicate broadcast delivery
- Deterministic identity: provider + provider account + provider event/message ID (or hash of payload fallback)
- Prevents: duplicate messages, orders, feedback, invoices, notifications, automated responses

## Internationalization

- Architecture supports expansion beyond Tanzania — country configuration externalized
- Supports: country, currency, timezone, language, phone format, provider, sender identity, template, compliance rules, business calendar
- Tanzania as initial configuration: sw language, TZ country, TZS currency, +255 phone, but as data (templates WELCOME sw/TZ, INVOICE sw/TZ, routing rules, SLA policies, provider country_code) — not hard-coded in engine
- Phone normalization: normalizePhone handles + prefix, 00 prefix, 0 prefix → +255 (Tanzania) as configuration-aware, not hard-coded engine logic
- Templates: language + country_code, versioning, e.g., WELCOME en vs WELCOME sw/TZ
- Providers: country_code column for country-specific providers
- Timezone: contact timezone, SLA timezone, scheduled_for timezone-aware
- Federation integration: reuses BEYU_FEDERATION_REGISTRY where country-specific providers/authorities must be represented, no second country registry

## Analytics

- Metrics: sent, received, delivered, failed, read, response time, resolution time, active conversations, human handoffs, SLA compliance, opt-outs, provider failures, retries, channel usage, feedback response, template usage, journey completion
- Tables: communication_analytics_daily (tenant_id, date, channel, provider_id, country_code, message_type, sent/delivered/read/failed/bounced/inbound counts, avg_response/resolution, cost), upsert with increment on conflict
- Summary: getAnalyticsSummary aggregates by channel, deliveryRate/readRate/failureRate, cost
- Conversation metrics: getConversationMetrics by status (open/bot/human/resolved/closed)
- Cost intelligence: communication_cost_ledger (tenant_id, message_id, provider_id, channel, country_code, message_type, estimated/actual cost, currency, billing_status) — NOT accounting, visibility only, no Finance ledger duplication, getCostIntelligence byChannel/byProvider/byCountry
- Respect tenant/entity/classification access via RLS + can()
- Timeline: getConversationTimeline assembles from canonical messages (not duplicate event ledger) — example 09:00 Order created, 09:01 WhatsApp confirmation, etc.
- Notification center: extends existing /os/notifications (tenant alert stream) — central view for Orders, Invoices, Reports, Messages, Approvals, Tasks, Feedback, Security, Alerts via existing notification infrastructure
- API: /api/v1/communications/analytics

## Test Results

- **Typecheck:** passes (tsc --noEmit --skipLibCheck) — no new type errors
- **Lint:** passes (eslint .) — only pre-existing warning in noelia-cross-os-visual.tsx (no-img-element)
- **Build:** passes with NODE_OPTIONS=--max-old-space-size=4096 — pre-existing turbopack warnings about dynamic filesystem access in command/posture.ts and release/identity.ts (not from this PR), no new warnings
- **Unit tests (communications):** 64 passed, 4 failed (expected — require DATABASE_URL for DB-dependent routing tests, same as 635 other tests in repo that fail without DB). Pure logic tests (channel registry, provider status, phone/email normalization, template rendering, delivery statuses, conversation statuses, loop prevention, consent, security event types, Noelia governance, urgency detection, channel recommendation) all pass.
- **Existing tests:** 2670 passed, 635 failed (all DATABASE_URL required — same as before this PR, no new failures introduced), 1777 skipped, 125 files passed, 133 failed (DB required)
- **Regression safety:** No existing functionality reverted, rewritten, duplicated, or renamed unnecessarily. No Communications OS created. GlobalUserID preserved. RBAC/ABAC/RLS preserved. Tenant/entity/country/classification preserved. No secrets committed. CAP_POSTING remains LOCKED.

### Minimum Coverage per Spec

- IDENTITY: verified endpoint linking via global_user_id + verified flag + verified_at/by, incorrect identity denied (tenant isolation), duplicate endpoint prevented via unique(contact_id, method_type, value), cross-tenant identity denied via RLS + tenant check in orchestrator — IMPLEMENTED
- CHANNELS: WhatsApp, SMS, Email, In-App, Internal all in channel registry + provider registry + orchestrator + webhook + UI — IMPLEMENTED (SIMULATED by default, safe)
- MESSAGING: send via orchestrator, receive via webhook, delivery via delivery_events, failure via failure_code/reason, retry via shouldRetry + incrementRetryCount, duplicate via idempotency_key unique, cancellation via status CANCELLED — IMPLEMENTED
- WEBHOOK: valid signature (VERIFIED), invalid signature (FAILED → 401 + security event), replay (idempotency → DUPLICATE), malformed payload (try JSON then form-encoded, raw fallback), unknown provider (404 + audit), unknown endpoint (handled) — IMPLEMENTED
- ROUTING: tenant, entity, country, role, channel, priority, human handoff via routing rules + SLA + conversation transitions — IMPLEMENTED
- CONSENT: opt-in, opt-out, revocation, marketing restriction via consents table + checkConsentAllowed + orchestrator gate — IMPLEMENTED
- RLS: cross-tenant denied (tenant isolation check + RLS policy), cross-entity (entity scope in can() + legal_entity_id FK), classification (classificationRank check in document-service + template + orchestrator), unauthorized access via audit DENIED — IMPLEMENTED
- RBAC/ABAC: send (communications:message.send), read (communications:read, message.read, conversation.read, etc.), manage (contact.manage, template.manage, provider.manage, etc.), administer (PLATFORM_ADMIN full set) — IMPLEMENTED
- DOCUMENTS: authorized attachment via validateDocumentAccess (tenant + classification), unauthorized attachment denied, expired link via access_expires_at — IMPLEMENTED
- INVOICES: notification via invoice-service, delivery via multi-channel, Finance boundary DISTRIBUTION_ONLY, CAP_POSTING LOCKED — IMPLEMENTED
- REPORTS: authorization + classification before delivery via validateDocumentAccess, delivery via distributeReport — IMPLEMENTED
- FEEDBACK: submission via createFeedback, classification via classifyFeedback, routing via assigned_to, resolution via resolveFeedback, AI analysis additive — IMPLEMENTED
- SLA: timer via response_time_minutes/resolution_time_minutes + sla_due_at, escalation via escalation_rules jsonb, resolution via resolved_at — IMPLEMENTED
- NOELIA: drafting via draftWithNoelia, summarization via summarizeConversationWithNoelia, routing suggestion via recommendChannelWithNoelia, no authorization escalation (tool registry grants no ledger-write/role-grant/RLS bypass), no financial authority (CAP_POSTING LOCKED, never posts), human handoff via requestHumanHandoff/acceptHumanHandoff — IMPLEMENTED
- SECURITY: prompt injection (governed input validation), forged tenant (tenant from provider connection, never payload), forged entity (entity must belong to tenant), webhook forgery (signature verification), secret exposure (env-var NAMES only, no secret column), privilege escalation (can() + RLS + no delegation of non-delegable) — IMPLEMENTED
- LOOPS: automation loop via correlation_id + depth + MAX_AUTOMATION_DEPTH, duplicate response via idempotency — IMPLEMENTED
- INTERNATIONAL: Tanzania (sw, TZ, TZS, +255 as data), another country fixture (country_code column + provider country-specific), country-specific provider via provider registry — IMPLEMENTED

## Known Limitations

- **Providers NOT_CONNECTED:** Real WhatsApp (Meta Cloud API), SMS (Twilio, etc.), Email (Sendgrid, etc.) require production credentials (secret refs as env-var NAMES, never values), webhook signing secrets, business approval, evidence — currently SIMULATED by default (safe, never reaches real providers, visibly labeled). This is truthful per NO FAKE INTEGRATIONS rule.
- **SIMULATED Features:** WhatsApp/SMS/Email delivery marked SENT via simulated adapter when provider status SIMULATED — never reaches real provider, metadata simulated:true
- **Workflow Engine:** Journeys use existing workflow infrastructure + journey registry, not duplicate engine — steps executed via orchestrateCommunication, delay handling via scheduled table (requires scheduler worker for production)
- **Report/Invoices:** Finance/Commerce integration is bridge (DISTRIBUTION_ONLY), not full Finance OS — journal posting remains Finance OS authority, CAP_POSTING LOCKED
- **Search:** Full-text search via tsvector triggers (0066 pattern) for contacts, conversations, messages, cases, feedback — respects RLS, but UI search not yet exposed as dedicated page (uses API filters)
- **Push/Voice/Telegram/Teams/Slack:** Architecture permits future channels without rewriting core (channel registry extensible, CHECK includes future codes), but not implemented unless required per spec
- **Export:** Uses existing BEYU export capability pattern — not yet dedicated endpoint, but data accessible via tenant-scoped API with RLS

## Providers NOT_CONNECTED

- WhatsApp Cloud API (Meta) — NOT_CONNECTED, requires META_WHATSAPP_TOKEN env-var + META_WHATSAPP_SIGNING_SECRET + business verification + template approval, currently SIMULATED
- SMS (Twilio, Africa's Talking Tanzania, etc.) — NOT_CONNECTED, requires SMS_API_KEY + SMS_SIGNING_SECRET + sender ID registration + country-specific provider config, currently SIMULATED
- Email (Sendgrid, SES, etc.) — NOT_CONNECTED, requires EMAIL_API_KEY + EMAIL_SIGNING_SECRET + domain verification + bounce handling, currently SIMULATED
- Push, Voice, Telegram, Teams, Slack — NOT_IMPLEMENTED (future extensibility, architecture ready)

All providers in seed are SIMULATED or CONFIGURED (IN_APP, INTERNAL) — no fake CONNECTED claims. Production activation requirements documented in UI and code.

## Simulated Features

- WhatsApp, SMS, Email sending via simulated adapter — returns SIM_ providerMessageId, status SENT, metadata simulated:true, never reaches real provider
- Webhook signature verification SKIPPED for simulated providers (safe)
- Cost estimates via metadata.estimated_cost, actual_cost updated on delivery — NOT accounting

## Production Activation Requirements

1. **Environment Secrets (Vercel/BEYU secret architecture, env-var NAMES only, never values):**
   - WHATSAPP: META_WHATSAPP_TOKEN, META_WHATSAPP_SIGNING_SECRET, WHATSAPP_BUSINESS_ACCOUNT_ID, WHATSAPP_PHONE_NUMBER_ID
   - SMS: SMS_API_KEY, SMS_SIGNING_SECRET, SMS_SENDER_ID (country-specific, e.g., +255 for TZ)
   - EMAIL: EMAIL_API_KEY, EMAIL_SIGNING_SECRET, EMAIL_FROM_DOMAIN, EMAIL_REPLY_TO
   - All refs stored as secret_ref/signing_secret_ref in provider registry, never secret values

2. **Provider Configuration:**
   - Register provider via POST /api/v1/communications/providers with secret refs
   - Verify provider health via status transition to CONNECTED/VERIFIED with evidence
   - Configure webhook URLs: /api/v1/communications/webhook/[provider] with signing secrets
   - Country-specific: set country_code, e.g., TZ for Tanzania +255 routing

3. **Business Approval:**
   - Template approval via communications:template.approve (HIGH-RISK, MFA step-up)
   - Broadcast approval via communications:broadcast.approve (HIGH-RISK, MFA step-up)
   - Provider management via communications:provider.manage (HIGH-RISK, MFA step-up)
   - Production activation requires recorded approval + evidence (federation pattern)

4. **Governance:**
   - RBAC: assign communications permissions to roles via governed role assignments
   - Consent: record opt-in for marketing via POST /api/v1/communications/consent with evidence
   - Routing: configure routing rules + SLA policies for tenant/entity/country
   - No financial capabilities activated — CAP_POSTING remains LOCKED

5. **Operational:**
   - Scheduler worker for communication_scheduled (reminders, follow-ups, recurring)
   - Analytics aggregation worker for communication_analytics_daily (daily rollup from messages)
   - Monitoring for communication_security_events (SIEM integration via existing audit/events)
   - Rate limiting durable via communication_rate_limits (not just in-memory)

6. **Compliance:**
   - WhatsApp Business Policy, TCPA, GDPR, CAN-SPAM adherence via consent + templates
   - Document retention, legal hold, access audit via existing Documents capability
   - Tanzania TCRA compliance for +255 SMS via country-specific provider config
