# BEYU CONNECT — Social Account Integration Design

**Status:** Architecture gate / implementation contract  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Base:** `main` at `dc8f848226ed8860ef293f817fe10394360abb1d`  
**Scope:** BEYU-owned business accounts only; WhatsApp Business, Facebook Pages, Instagram Professional accounts, and X business accounts.  
**Publishing policy:** Human approval required before every external publish/send action.  
**Safety:** No merge, deployment, production configuration change, live account connection, or secret provisioning in this change.

## 1. Architectural placement

BEYU CONNECT is a shared capability within BEYU OS. It extends the existing shared Communications capability and must not create a new Sector OS, identity plane, workflow engine, consent registry, audit ledger, document store, or accounting ledger.

Reuse the existing canonical systems:

- GlobalUserID and the existing principal/session boundary.
- RBAC/ABAC, tenant/entity/country/classification isolation and PostgreSQL RLS.
- Communications contacts, consent, conversations, templates, messages, broadcasts, approvals and analytics.
- Existing workflow/approval services, audit_log, enterprise_events and durable idempotency.
- NOELIA_AI as one governed assistant identity; NOELIA may draft, summarize, classify and recommend, but cannot approve or publish.
- CAP_POSTING remains LOCKED. Social integrations have no Finance posting capability.

The BEYU CONNECT user experience should be an extension of the existing `/os/communications` capability, not a separate OS or an alternate sign-in surface.

## 2. Platform coverage and honest status

| Platform | Official integration | Scope |
|---|---|---|
| WhatsApp Business | Meta WhatsApp Cloud API | Business messaging, approved templates, inbound webhooks, delivery receipts |
| Facebook | Meta Graph API | Authorized Pages, publishing, Page comments/inbox where granted, insights |
| Instagram | Instagram Graph API | Authorized Professional accounts, media publishing, comments/inbox where granted, insights |
| X | Official X API | Publish posts/media, read authorized mentions/replies and analytics where the granted API tier permits |

Only official APIs and documented OAuth flows are allowed. No WhatsApp Web automation, browser scraping, password collection, session-cookie reuse, or unofficial posting endpoints.

Account/provider states must be truthful and evidence-backed: `NOT_CONNECTED`, `CONFIGURED`, `CONNECTED`, `VERIFIED`, `DEGRADED`, `FAILED`, and `SIMULATED`. A saved configuration or OAuth callback alone must not claim that publishing is verified. Simulation must never make network calls.

## 3. Domain model to add (migration required)

Introduce a separate social-account and publishing domain that references, but does not duplicate, the Communications domain:

- `social_platform_accounts`: tenant/entity/country scope, platform, external account/page ID, display name, granted scopes, connection status, token secret reference, token expiry, verification evidence, connected-by and timestamps. No raw access or refresh tokens in database columns, logs, events, fixtures or API responses.
- `social_account_permissions`: normalized capabilities/scopes actually granted by the platform, with least-privilege checks before each operation.
- `social_content`: draft text, media document references, platform-specific rendering/options, classification, creator, status, correlation/idempotency identifiers and timestamps.
- `social_publications`: per-account publication attempt, approval reference, provider post ID, delivery state, safe provider response metadata and failure category.
- `social_webhook_events`: verified, idempotent platform event inbox; account/tenant scope resolved from the registered account, never from untrusted payload fields.
- `social_content_approvals`: use the canonical approval system or a narrowly scoped reference to it; do not create a parallel authority system.

Every operational table must have tenant/entity scope, appropriate indexes, closed status/platform constraints, FORCE RLS and explicit policies tested under the actual non-owner runtime role. Account tokens belong in the existing approved secret-management boundary; database rows store references only.

## 4. OAuth and credential boundary

- Use server-side OAuth authorization-code flows with state, nonce where applicable, PKCE where supported, strict redirect URI allowlists, one-time state consumption and CSRF protection.
- Request the minimum platform scopes for the selected features. Display granted scopes and disable unavailable capabilities rather than assuming permissions.
- Bind the OAuth transaction to the authenticated BEYU principal, tenant and legal entity on the server. Never accept client-supplied tenant, entity, actor or approval identifiers as authority.
- Encrypt and store credentials through the existing approved secret-management integration. Never put token values in browser storage, database JSON, logs, audit payloads, URLs or error messages.
- Disconnect/revocation must disable the account, invalidate local credentials through the secret manager, preserve an audit event and stop queued publication.
- Refresh-token rotation, expiry, revocation and platform app-review requirements must be explicitly handled. A credential check is not equivalent to a successful publish test.

No real account may be connected until the app registrations, callback URLs, scopes, platform review requirements, secret-manager integration and operator approval are configured.

## 5. Human approval publishing lifecycle

All public content is approval-gated, including posts, replies, comments, Reels/media publication, broadcasts and NOELIA-generated drafts:

`DRAFT → VALIDATED → PENDING_APPROVAL → APPROVED → QUEUED → PUBLISHING → PUBLISHED`

Alternative terminal states: `REJECTED`, `CANCELLED`, `FAILED`, `EXPIRED`.

- The author/requestor cannot approve their own publication (maker/checker).
- Approval is bound to an immutable content hash, target accounts, media document versions, scheduled time and platform-specific payload. Any edit invalidates the prior approval.
- Execution re-checks authorization, approval validity, account status, granted scopes, consent/policy, classification, rate limits, idempotency and platform constraints immediately before calling the provider.
- No scheduled job, webhook, NOELIA action or retry may bypass the approval gate.
- Retry only transient failures; use a stable idempotency key and provider reconciliation to prevent duplicate posts. Do not blindly retry an ambiguous timeout.
- A publish response is recorded as `PUBLISHED` only when the provider returns a verifiable external post ID. Otherwise retain an honest pending/unknown/failed state.

## 6. NOELIA_AI boundary

NOELIA may draft and adapt approved brand content, translate, summarize engagement, recommend publishing times and prepare performance reports using only authorized, classification-safe data. NOELIA cannot connect accounts, request credentials, grant scopes, approve its own content, publish, reply, delete, or alter consent. Human approval is an independent human action and is revalidated at execution.

## 7. Privacy and sector boundaries

- This is for BEYU-owned business accounts, not personal accounts.
- Health-sector publishing must use approved public-facing content only. Patient data, clinical records, diagnoses, appointment details, employee records and other sensitive information must never enter social content, analytics, prompts, webhooks or platform metadata.
- Sector OSs may consume the shared capability only through their own authorized server-side permissions and data adapters. A social account connection does not grant access to any sector data.
- Apply data minimization, retention limits, deletion/revocation handling, consent and applicable platform and Tanzanian legal requirements. Legal compliance must be reviewed by qualified counsel; do not claim certification.

## 8. API and UI contract

Expected server-side routes (exact route names to follow repository conventions after implementation review):

- Account lifecycle: list, initiate OAuth, callback, verify, refresh, disconnect.
- Content lifecycle: create/update draft, preview/render, validate, submit for approval, approve/reject, schedule, cancel.
- Publication: controlled worker execution, provider reconciliation, status and history.
- Webhooks: provider-specific verification and durable idempotent event ingestion.
- Analytics: tenant-scoped summaries from authorized platform insights.

UI sections under existing Communications navigation:

1. Connected Accounts — status, scopes, expiry, verification, disconnect.
2. Unified Publishing — draft editor, target account selection, preview and validation.
3. Approval Queue — immutable diff/hash, maker/checker identity, approve/reject.
4. Content Calendar — only approved scheduled content.
5. Engagement — authorized comments/messages with human response approval.
6. Analytics — source-attributed metrics and explicit unavailable/permission-denied states.

## 9. Required implementation and verification gates

The code implementation must include:

- Provider adapters isolated from business logic, with typed request/response contracts and timeouts.
- OAuth state/PKCE/replay/redirect-URI tests and secret-redaction tests.
- Provider signature verification, replay, malformed payload, tenant spoofing and duplicate webhook tests.
- RLS tests using the actual non-owner `beyu_runtime` database role, including cross-tenant and cross-entity denial.
- Maker/checker, stale approval, edited-content hash, unauthorized target account, insufficient scopes, expired token, disconnect race and approval-bypass regression tests.
- Idempotency and ambiguous-timeout reconciliation tests proving duplicate publication is not silently retried.
- Typecheck, lint, focused unit/integration tests, MCP/security tests, and production build.
- CI evidence attached to the draft PR; unresolved failures must be reported, not waived or represented as passes.

## 10. Current repository findings and remaining implementation

The existing Communications platform (migration 0072) already provides WhatsApp as a channel, simulated WhatsApp provider records, Meta webhook signature verification, contacts/consent/messages/broadcasts, and a human-approval route. However:

- The existing orchestrator does not invoke a live outbound provider adapter; non-simulated messages are only marked `SENDING` for a worker.
- The WhatsApp provider is seeded as simulated. No evidence of a live business account connection exists.
- Facebook, Instagram and X account OAuth, account registry, publishing adapters, publication lifecycle and insights are not implemented in the inspected Communications tree.
- Existing message approval is not yet sufficient evidence of a complete immutable, maker/checker social publication approval lifecycle.
- The current repository connector provides GitHub API access, but this environment does not expose a checked-out working tree or local test/build execution. Do not claim code verification until CI or a supported execution environment supplies it.

This document is the architecture and acceptance contract for the implementation. It does not connect accounts, provision secrets, call external social APIs, enable live publishing, or claim the feature is implemented.
