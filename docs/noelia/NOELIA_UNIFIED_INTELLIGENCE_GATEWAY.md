# NOELIA Unified Intelligence Gateway

**Status:** Architecture baseline / implementation gate  
**Canonical owner:** NOELIA AI (Queen Bee)  
**Repository:** `yumvalila-bot/BEYU-OS-1.0`  
**Initial implementation branch:** `feature/noelia-unified-intelligence-gateway`

## 1. Constitutional architecture

NOELIA is BEYU's single, central, governed intelligence orchestrator. It is not subordinate to ChatGPT, Claude, Ollama or Hermes, and it is not a second operating system.

- **NOELIA owns intelligence orchestration:** provider selection, model routing, context assembly, evaluation, provenance, governed memory and agent delegation.
- **BEYU OS owns institutional authority:** identity, tenant/entity/country scope, RBAC/ABAC, classification, policy, approvals, audit and the execution of business capabilities.
- **AI providers and agent runtimes own neither BEYU identity nor institutional authority.** Their output is untrusted data until validated by NOELIA and BEYU policy.
- **The existing `NoeliaToolRegistry` remains the only capability dispatch boundary.** MCP must not create a parallel tool registry or call sector databases directly.

Canonical rule: **NOELIA owns the intelligence. External engines provide intelligence capabilities. BEYU OS owns institutional authority.**

## 2. Integration roles

| Component | Role in the architecture | Authority |
| --- | --- | --- |
| NOELIA | Central orchestrator, model gateway, HIVE runtime, context and policy coordination | No independent institutional approval or execution authority |
| Ollama | Local/self-hosted inference provider through the existing `AIModelProvider` adapter | Model text only |
| OpenAI models | Optional inference provider adapter; separate from the ChatGPT application as an MCP client | Model text only |
| Claude models | Optional Anthropic inference provider adapter | Model text only |
| Hermes Agent | Separate agent runtime for bounded delegation; never treated as an ordinary model provider | No BEYU tool authority in the current restricted runtime |
| ChatGPT, Claude clients, Hermes and other MCP clients | External clients that may call NOELIA's approved MCP surface | Only the tools and scopes granted to the authenticated human |

The distinction between **OpenAI API inference** and **ChatGPT application connectivity** is important. An OpenAI API key is not supplied by a ChatGPT subscription and may incur separate usage charges. NOELIA must not silently activate paid cloud inference.

## 3. Verified repository baseline

The current `main` baseline already contains:

- `src/lib/noelia/model-provider.ts`: provider-neutral inference contract and provider status vocabulary.
- `src/lib/noelia/model-gateway.ts`: governed model gateway; deterministic analyst is always mounted and Ollama is mounted only by explicit server configuration.
- `src/lib/noelia/ollama-provider.ts` and `ollama-config.ts`: local-first Ollama adapter and fail-closed endpoint validation.
- `src/lib/noelia/hermes-runtime.ts` and `hermes-config.ts`: a separate restricted Hermes agent runtime. Toolsets are unconditionally disabled; output is untrusted prose and cannot represent an action receipt.
- `src/lib/noelia/runtime.ts`: HIVE/NOELIA orchestration and governed model execution.
- `src/lib/noelia/tool-registry.ts`: the governed capability registry.
- `src/lib/session.ts` and `src/lib/authz.ts`: canonical human session resolution and BEYU RBAC/ABAC authority.
- `docs/noelia/NOELIA_TOOL_GOVERNANCE.md`: registration, validation, authorization, context, confirmation, execution, output validation and audit pipeline.

The baseline does **not** yet contain a NOELIA MCP server or a dedicated MCP OAuth authorization server. No public MCP endpoint is active. A future hostname such as `mcp.beyu.co.tz` is a proposal only and must not be presented as deployed.

## 4. Target topology

```text
                 Human / approved client
      ChatGPT | Claude | Hermes | internal BEYU UI
                           |
                    OAuth 2.1 + PKCE
                           |
                 NOELIA MCP Gateway
                   /mcp (HTTPS)
                           |
              NOELIA identity/context adapter
                           |
            resolve authenticated BEYU principal
                           |
             RBAC + ABAC + classification checks
                           |
                 NOELIA HIVE runtime
                    /             \
          Model Gateway          Tool Registry
          /    |     \                 |
      Ollama OpenAI Claude       BEYU service adapters
                                  /   |    |    \
                              HEALTH FINANCE AGRICULTURE UJENZI
                                  shared Family Office / Foundation
```

MCP is an external interface to NOELIA, not an alternative execution kernel. Every invocation must be reduced to a canonical authenticated BEYU principal and a server-derived scope before it can discover or invoke a tool.

## 5. MCP transport and authentication contract

### 5.1 Transport

- Use the official Model Context Protocol Streamable HTTP transport over HTTPS.
- Canonical future endpoint: `https://mcp.beyu.co.tz/mcp` (not active until separately approved and deployed).
- Support protocol initialization, capability discovery and tool invocation only for the approved MCP protocol version.
- Bound request size, response size, execution time, concurrency and per-principal rate.
- Reject malformed JSON-RPC, unsupported methods, unknown tool names and unrecognized protocol versions.
- Do not expose raw database access, arbitrary SQL, filesystem access, shell access, generic HTTP fetch, arbitrary URL tools or unrestricted proxy tools.

### 5.2 OAuth 2.1

Remote clients must authenticate through OAuth 2.1 Authorization Code with PKCE (S256). A static shared bearer token, query-string credential, client-supplied user ID or caller-supplied tenant/entity is not an acceptable identity mechanism.

The planned authorization-server surface is:

- Protected-resource metadata for the MCP resource.
- Authorization-server metadata and issuer discovery.
- Authorization endpoint backed by the canonical BEYU human login and consent/approval UX.
- Token endpoint with authorization-code exchange, PKCE verification, short-lived access tokens and rotating refresh tokens where supported.
- Revocation and logout handling.
- Client registration only through an explicit reviewed client-registration policy; do not enable unrestricted dynamic client registration by default.

Token records must be stored hashed, revocable and auditable. Tokens must be bound to the approved client, human principal, tenant, approved scope, expiry and relevant session/consent state. Refresh-token reuse must revoke the affected token family. Logout, session revocation, user suspension, grant revocation and kill-switch activation must invalidate access at the earliest enforceable point.

### 5.3 Scope mapping

OAuth scopes are an external representation, not new authority. Each exposed scope must map to an existing BEYU permission and the canonical `can()` decision. Unknown scopes fail closed. The MCP gateway must never widen scope because a client requests it.

Tool discovery must be principal-aware: return only registered tools that the current principal can invoke in the current server-derived context. Tool invocation must re-check authorization; discovery is not a grant.

## 6. Tool exposure policy

The first MCP release is **read-only**.

1. Expose a deliberately small allowlist of existing, registered, read-only NOELIA capabilities.
2. Require `metadata.sideEffects === "NONE"`; reject `AUDIT_ONLY` and `DOMAIN_WRITE` tools from the initial allowlist unless a separate design review authorizes their exposure.
3. Validate every input with the registered Zod schema and enforce strict output schemas and bounded serialization.
4. Resolve target tenant, legal entity, country, classification and data scope on the server; ignore or reject caller attempts to assert authority dimensions.
5. Call the existing `NoeliaToolRegistry` and preserve its authorization, approval, kill-switch, context and audit controls.
6. Do not expose payment, posting, journal, transfer, capital allocation, clinical/medication, deletion, account, permission, legal submission or external-communication actions in the initial MCP release.
7. No agent or model output may satisfy a human approval requirement.

Write-capable MCP tools require a later explicit security review, a human confirmation protocol, idempotency, dual-control where applicable, durable audit and domain-specific approval. They are out of scope for the first release.

## 7. Provider routing and cost controls

- Keep the deterministic BEYU analyst as the safe default.
- Keep Ollama/local inference as the preferred generative path when the backend host has a verified local model runtime.
- Never assume that a developer's desktop Ollama process is reachable from a Vercel or other remote backend.
- Do not automatically fall back from local Ollama to a paid cloud provider.
- OpenAI and Anthropic adapters remain disabled unless a human operator explicitly configures credentials, an approved model registry entry, cost limits, data-classification/residency rules and a governance activation.
- Record provider/model attribution, routing decision, usage and cost evidence where available.
- Hermes remains a distinct agent runtime, not an inference provider. Its current restricted mode disables all toolsets. Do not relax that boundary as part of MCP server work.

## 8. Implementation phases and acceptance gates

### Phase 0 — Baseline and threat model
- Confirm current branch, commit and all in-flight NOELIA changes before coding.
- Reuse the existing runtime, registry, identity and policy modules.
- Document data flows, trust boundaries, OAuth actors, token lifecycle, abuse cases and incident/kill-switch behaviour.
- No production changes.

### Phase 1 — MCP read-only server
- Implement a small server adapter around the existing NOELIA registry.
- Add protocol conformance tests, authenticated/unauthenticated tests, scope tests, tenant/entity/country isolation tests, classification tests, tool-discovery filtering, input/output validation and denial-path audit tests.
- Prove that unregistered, write-capable and unknown tools are not exposed.
- Keep the endpoint disabled by default.

### Phase 2 — OAuth 2.1 and consent
- Implement metadata discovery, Authorization Code + PKCE S256, client registration policy, short-lived access tokens, refresh rotation, revocation, logout and consent.
- Store only token hashes; bind grants to the authenticated human and server-resolved tenant.
- Test PKCE downgrade, redirect URI manipulation, CSRF/state, code replay, refresh reuse, token theft/revocation, scope escalation and cross-tenant replay.

### Phase 3 — Client compatibility
- Validate Hermes remote MCP OAuth connection.
- Validate Claude MCP connector compatibility.
- Validate ChatGPT custom MCP compatibility on a supported plan and web client.
- Publish client-specific setup instructions only after real end-to-end tests.
- Provide local stdio development mode only if it can reuse the same authorization boundary; never bypass policy for convenience.

### Phase 4 — Provider expansion
- Add optional OpenAI and Anthropic `AIModelProvider` adapters behind the existing model gateway.
- Add contract, routing, provider-status, timeout, cost, classification, residency, failover and no-cloud-fallback tests.
- Keep all cloud adapters disabled by default and require explicit activation.

### Phase 5 — Release readiness
- Run the full repository verification and security suites.
- Produce an evidence-based report with tests, unresolved risks, migration requirements, provider status and client test outcomes.
- Open a draft PR only after the implementation is coherent and tested.
- Stop at the human review/merge gate. Production domain, secrets, OAuth registration and deployment require separate approval.

## 9. ChatGPT client compatibility caveat

ChatGPT custom MCP availability depends on the ChatGPT plan and client surface. Current OpenAI documentation describes full custom MCP support for Business and Enterprise/Edu on web, while Pro is limited to read/fetch and custom MCP is not available in the mobile app. Therefore, a ChatGPT MCP connection must not be promised for a Free Android account. Hermes and other MCP clients can be integrated independently once NOELIA's endpoint and OAuth server exist.

## 10. Explicit non-goals

- No new repository, fork, second NOELIA, or BEYU OS 2.0.
- No independent AI authority or provider-owned BEYU identity.
- No direct sector database access from MCP or model adapters.
- No paid API activation, automatic cloud fallback or unapproved subscription.
- No write-capable MCP tools in the first release.
- No production deployment, DNS, OAuth secret, Vercel environment or live database changes in this workstream.

## 11. Definition of done

The gateway is not complete merely because `/mcp` responds. Completion requires authenticated end-to-end client interoperability, principal-bound tool discovery, per-invocation BEYU authorization, negative isolation tests, durable audit evidence, token lifecycle/revocation tests, provider cost controls and a human-reviewed release decision.
