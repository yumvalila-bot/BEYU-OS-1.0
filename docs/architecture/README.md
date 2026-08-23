# BEYU OS — Architecture

BEYU OS is the **global enterprise control plane** of the BEYU ecosystem. It is not an ERP, CRM,
dashboard or chatbot: it is the constitutional, governance, identity, organisational, ownership,
capital, risk, compliance, intelligence, data, workflow, integration, audit and orchestration layer
that governs every Sector OS.

```
BEYU ECOSYSTEM
      │
      ▼
  BEYU OS  ── CONTROL PLANE ──────────────────────────────────────┐
      │                                                            │
 ┌────┴──────────────────┐                ┌────────────────────┐  │
 ▼                       ▼                ▼                    │  │
SHARED ENTERPRISE   DOMAIN / SECTOR OSs   AI INTELLIGENCE ──────┘  │
CAPABILITIES        Health · Finance ·    HIVE runtime → Noelia    │
Identity            Agriculture ·                                  │
Organization        Foundation                                     │
Corporate structure                                                │
Ownership · HCM · Governance · Risk · Compliance · Capital ·       │
Legal · Audit · Security · Documents · Data ──────────────────────┘
```

## Canonical laws implemented in code

| Law | Where it is enforced |
| --- | --- |
| ONE identity model | `src/db/schema/identity.ts`, `src/lib/session.ts`, `src/lib/authz.ts` |
| ONE organisation / ownership model | `src/db/schema/core.ts` |
| ONE governance model | `src/db/schema/governance.ts` |
| ONE security model | `src/lib/authz.ts` (RBAC + ABAC + tenancy + step-up) |
| ONE audit model | `src/lib/audit.ts` (hash-chained, append-only) |
| ONE policy model | `src/lib/policy.ts` (8-level hierarchy, DENY is final) |
| ONE enterprise event model | `platform.enterprise_events` (CloudEvents-aligned) |
| ONE data governance model | `platform.data_assets`, `platform.retention_policies` |
| ONE AI identity | Noelia (`src/lib/noelia.ts`) on the HIVE runtime |
| Non-duplication | `core.source_of_truth`, `core.os_registry` |

## Layers

1. **Constitution** (`governance.constitution_articles`) — supreme authority, amendment procedure.
2. **Policy engine** (`governance.policies`) — machine-readable rules, effective-dated, versioned.
3. **Identity & access** — parties (MDM) → users → sessions → roles → permissions → grants.
4. **Enterprise domains** — organisation, ownership, HCM, governance, risk, compliance, legal,
   capital, treasury, waterfall, tax intelligence, family office, documents, knowledge.
5. **Sector OSs** — Health, Finance, Agriculture, Foundation; registered charters with declared
   authority, dependencies, APIs, events and compliance frameworks.
6. **AI layer** — HIVE runtime executing the single Noelia identity, fully audited.

## Request lifecycle

```
HTTP request
  → resolvePrincipal()           identity, tenant, roles, clearance, scope, MFA, session risk
  → rateLimit()                  per principal + capability
  → can(permission, context)     RBAC ∧ ABAC ∧ tenancy ∧ classification ∧ step-up
  → evaluatePolicy()             constitution → … → transaction control; DENY is final
  → domain engine                deterministic, explainable (waterfall / tax / risk)
  → recordAudit() + publishEventTx()  hash-chained, tamper evident, contract-correlated
  → structured response envelope (no secrets, no internals, trace/correlation metadata attached)
```

## Technology

Next.js (App Router) + React + TypeScript + Tailwind on the frontend and route handlers;
PostgreSQL via Drizzle ORM as the authoritative transactional store. The domain engines
(`src/lib/*.ts`) are pure and portable: they carry no framework dependency and can be lifted into
NestJS services, workers or Lambda handlers without change, preserving cloud portability.

See `docs/adr/` for the recorded architectural decisions and `docs/domain-model/README.md` for the
entity model. Phase completion records: `PHASE_9_CANONICAL_ARCHITECTURE.md`,
`PHASE_10_CANONICAL_RECONCILIATION.md`, `PHASE_11_PRODUCTION_READINESS.md`,
`PHASE_12_HCM_COMPLETENESS.md`, `PHASE_HCM_1_PRODUCTION.md`,
`PHASE_14_INTEROPERABILITY_CONNECTIVITY_CONTINUITY_ONENESS.md`.
The machine-readable Phase 14 matrix is `phase14-interoperability-matrix.json`.
