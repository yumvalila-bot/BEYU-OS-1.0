# HEALTH OS DOMAIN OWNERSHIP MATRIX

Constitutional hierarchy is NON-NEGOTIABLE:

```
BEYU OS GOVERNS (Constitutional Control Plane + Enterprise Operating Kernel + Governed Intelligence Layer)
   ↓
SECTOR OSs EXECUTE (BEYU HEALTH OS)
   ↓
Clinical / operational workflows
```

## Canonical ownership

| Domain | Canonical owner | Health OS role | State |
|---|---|---|---|
| Constitutional governance (policy, segregation of duties, delegated authority, AI approval) | BEYU Governance | Consume decisions; never override DENY; never treat connectivity loss as APPROVED | ENGINEERING_READY (contracts + fail-closed local-conservative); EXTERNAL-BLOCKED (live) |
| Canonical identity (GlobalUserID) | BEYU Identity | Trust JWT sub; resolve via IdentityAdapter when available | PARTIALLY_IMPLEMENTED (local fallback JWT trust; live lookup EXTERNAL-BLOCKED) |
| Tenant/Entity/Country isolation | BEYU OS + Health OS RLS | Enforce per-table RLS + GUC; never leak across | ENGINEERING_READY (61/61 tables + RLS tests) |
| RBAC/ABAC/permissions | BEYU OS (canonical) + Health OS (sector) | Sector-scoped permissions enforced by PermissionsGuard; global roles come from JWT | PARTIALLY_IMPLEMENTED (sector RBAC ready; BEYU-side ABAC EXTERNAL-BLOCKED) |
| Workforce / HCM / practitioner master | BEYU HCM | Consume records; cache operational references; never invent licences | EXTERNAL-BLOCKED (contracts + fail-closed conservative gate in place) |
| Financial truth / ledger / GL / invoices / payments / settlement | BEYU Finance OS | Emit financial events; do NOT create local ledger; do NOT mark settled without Finance ack | EXTERNAL-BLOCKED (event outbox contracts present; no fabricated success) |
| Tax determination / tax policy / TRA | BEYU Tax Engine | Request determination; never hard-code production rates; never claim TRA submission without verified ack | EXTERNAL-BLOCKED (contracts present) |
| Governed AI identity / runtime | Noelia (identity) + HIVE (runtime) | Invoke capabilities; classified outputs; never self-authorize; never fabricate responses | EXTERNAL-BLOCKED (contracts + output classification present) |
| Audit chain (constitutional anchoring) | BEYU OS | Append-only sector audit; final hash-chain anchoring to BEYU constitutional chain | ARCHITECTURE-BLOCKED (sector chain present; cross-chain anchor requires BEYU governance) |
| Notifications / documents / workflow / approvals / risk engine | BEYU OS shared services | Consume via contracts; do not duplicate | EXTERNAL-BLOCKED (contracts not yet wired per service) |
| Legal hold / retention execution framework | Health OS (sector) + Governance (policy) | Execute; consult Governance for policy decisions | ENGINEERING_READY (sector logic + fail-closed tests); Governance policy EXTERNAL-BLOCKED |
| Consent | Health OS (non-boolean, sector) + Governance (policy) | Sector logic; policy decisions from Governance | ENGINEERING_READY (sector); Governance policy EXTERNAL-BLOCKED |

## Health OS — owned (executes, does not canonically rule)

- Patient care / registration / MRN
- Appointments / check-in / queueing
- Encounters (SOAP / history / progress notes)
- Vitals / observations / problems / allergies
- Prescriptions / medication orders
- Pharmacy dispensing (with governance + HCM gate on controlled substances)
- Laboratory orders / specimens / results
- Radiology orders / imaging reports
- Ophthalmology / optical
- Dialysis sessions
- Ambulance / EMS
- Telehealth sessions
- Public-health workflows (MTUHA reporting preparation)
- Health-sector reporting / MTUHA submission preparation
- Health-specific compliance execution (prepare, not canonical)
- Sector-level audit events (append-only)
- Health facility operational references (cache)

Health OS does NOT own: constitutional governance, canonical identity, canonical accounting ledger, tax policy, workforce master, BEYU-wide AI identity, or constitutional audit chain.

## Violation guards (engineering)

1. `GovernanceAuthorizationGuard` calls `GovernanceAdapter.decideOrFailClosed()` — DENY on error; Health OS never overrides.
2. `HcmAuthorizationGuard` fails closed for high-risk actions when licence is unverified/expired/blocked/external_verification_required.
3. `FinanceAdapter.emitEvent()` returns `{ accepted: false, status: "blocked", financeEventId: null }` when Finance OS is not configured; no caller may mark transactions "settled" without `accepted=true`.
4. `TaxAdapter.determine()` returns `{ determined: false, status: "blocked", totalTax: null, lines: [] }` when Tax Engine is not configured.
5. `NoeliaAdapter.invoke()` returns `{ blocked: true, outputClass: "blocked", outputRef: null }` when HIVE is not configured.
6. RLS: 61/61 health.\* tables have RLS; runtime role is NOSUPERUSER/NOBYPASSRLS.
7. No fabricated URLs/API keys/credentials/licences/facility identifiers/practitioner identifiers/TRA/Government codes. Adapters initialize as NOT_CONFIGURED when env vars are absent.

States use eight-state vocabulary:
IMPLEMENTED / PARTIALLY_IMPLEMENTED / MISSING / MOCKED / EXTERNAL-BLOCKED / SECURITY-BLOCKED / ARCHITECTURE-BLOCKED / REQUIRES-HUMAN-APPROVAL.

No silent "COMPLETE" claims where a live dependency is required.
