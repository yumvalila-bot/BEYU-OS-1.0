# BEYU Federation & Trust — Architecture

One **shared BEYU OS capability** (migration `0071`), not an OS, not a subsystem per
sector. Tanzania is the first jurisdiction profile; the core is jurisdiction-generic.

## 1. Identity: one system, two planes

BEYU has exactly ONE identity/tenant/governance/audit system. The federation capability
extends the existing Government Integration Fabric with a second plane; the two planes
share no state:

| Plane | Surface | Questions answered |
|---|---|---|
| Capability / trust | `/api/v1/federation/*`, `/os/federation` | What authorities exist, what is registered/verified, what it may cost, what is the legal basis |
| Submission / filing | `/api/v1/government/*`, `/os/government-integrations` | What was filed, with what external reference, what the external system said |

The 0036 `government_agencies` registry (submission plane) is cross-linked to
0071 `federation_authorities` (capability plane) via `legacy_agency_code` — one
identity, two planes, no duplicate registry.

## 2. The core invariant: status is never connectivity

`federation_authorities` stores **independent state dimensions**, each changed only by
its own governed evidence:

- `lifecycle_status` — the 20-state integration lifecycle (see §4)
- `verification_status` — REGISTERED / VERIFIED / SANDBOX / LIVE / LIVE_VERIFIED
- `api_status` — UNVERIFIED / PUBLIC / AUTHORIZED / PAID / NONE_PUBLISHED / UNKNOWN
- `govesb_status` — the GovESB requirement ladder (see GovESB doc)
- `access_cost_status` — the cost/access ladder (see §5)
- `reconciliation_state` — MATCH / NEW / MISSING / DUPLICATE / RENAMED / MERGED /
  DISSOLVED / UNCERTAIN / MANUAL_REVIEW / PENDING_RECONCILIATION

**No dimension is derived from another.** A VERIFIED authority with `api_status
UNVERIFIED` and `access_cost_status UNKNOWN_COST` is the honest default; the system
never infers CONNECTED, FREE, or GOVESB-compliant from any other fact. The CHECK
constraints in 0071 (`federation_authorities_production_gate`,
`federation_authorities_free_gate`) make the two strongest claims — production
promotion and FREE_CONFIRMED — impossible without linked evidence rows.

## 3. Data model (20 tables)

- **Reference/global (read-only for the runtime role):** `federation_jurisdictions`,
  `federation_domains`, `federation_legal_bases`, `federation_authorities`,
  `federation_services`, `federation_datasets`, `federation_schemas`,
  `federation_credentials`, `federation_connectors`, `federation_evidence`,
  `federation_verifications`, `federation_capabilities`,
  `federation_reconciliation_runs`, `federation_reconciliation_results`.
- **Operational (tenant-scoped, RLS-isolated):** `federation_agreements`,
  `federation_consents`, `federation_access_requests`, `federation_approvals`,
  `federation_incidents`, `federation_transitions`.

IDs are canonical BEYU IDs (`src/lib/ids.ts`, `fixedId` for deterministic seed rows,
`newId` for runtime rows) with `FD*` prefixes: FDA authority, FDS service, FDD
dataset, FDX schema, FDCR credential, FDAG agreement, FDLB legal basis, FDCN consent,
FDEV evidence, FDVRF verification, FDI incident, FDAR access request, FDAP approval,
FDTR transition, FDRN reconciliation run, FDRR reconciliation result.

**External identifiers never replace GlobalUserID.** A NIDA identifier (or any external
party id) enters only through `ExternalIdentityLink`; consent/access subjects reference
BEYU party/tenant/entity rows, never raw external ids.

## 4. Lifecycle

```
DISCOVERED → CLASSIFIED → AUTHORITY_CONFIRMED → LEGAL_BASIS_CONFIRMED
→ AGREEMENT_REQUIRED → AGREEMENT_CONFIRMED → ACCESS_REQUESTED
→ CREDENTIALS_PROVISIONED → SANDBOX → SECURITY_TEST → INTEROPERABILITY_TEST
→ DATA_VALIDATION → AUTHORITY_ACCEPTANCE → PRODUCTION_APPROVAL
→ LIVE → LIVE_VERIFIED → MONITORED
```

Exceptional states: `SUSPENDED` (resume only to MONITORED — re-verify before LIVE),
`DEGRADED`, `FAILED_VERIFICATION` (must restart at SANDBOX), `EXPIRED` (→ REVOKED),
`REVOKED` (terminal).

The transition table is a single source of truth
(`LIFECYCLE_TRANSITIONS`, `src/lib/federation/catalog.ts`). `assertLifecycleMove`
enforces it at the engine layer; 0071 CHECK constraints re-enforce the evidence gates
at the database layer. **PRODUCTION_APPROVAL, LIVE and LIVE_VERIFIED are
evidence-gated**: they require a production-grade evidence row
(`PRODUCTION_TEST` / `SIGNED_AUTHORITY_CONFIRMATION` / `OFFICIAL_CERTIFICATE`) that is
VALID, unexpired, and linked (`subject_type`/`subject_id`) to the exact record being
promoted — plus a named approver and an approval reference.

## 5. Cost and access ladders (separate from connectivity)

`access_cost_status`: `PUBLIC_INFORMATION`, `PUBLIC_API`, `AUTHORIZED_API`, `PAID_ACCESS`,
`AGREEMENT_REQUIRED`, `FREE_CONFIRMED`, `UNKNOWN_COST`, `NO_PUBLIC_API`, `NOT_CONNECTED`.

- **PUBLIC_INFORMATION ≠ protected data** — it describes what the authority publishes
  publicly, not what BEYU may read.
- **FREE_CONFIRMED is evidence-gated** (`federation_authorities_free_gate`): a public
  website is never evidence of no fee.
- Service-level `access_level` (NOT_CONNECTED/REQUESTED/GRANTED/REVOKED/EXPIRED) plus
  `data_classification` (the EXTERNAL_DATA_CLASSIFICATION ladder) drive the access
  decision engine (`decideServiceAccess`), which fails closed on any missing governance
  row: approved tenant/entity-scoped access request, CONFIRMED legal basis, GRANTED
  unexpired consent where required, ACTIVE agreement where required, ISSUED credential
  where required, and a clearance ceiling that covers the data class.

## 6. Capability negotiation & jurisdiction transitions

`negotiateCapabilities` plans a move from origin to destination jurisdiction using ONLY
the destination jurisdiction profile. Origin capabilities **never carry over**: a
capability not recorded for the destination is `NOT_IMPLEMENTED`, with an explicit
blocker. `REQUIRES_CONSENT` / `REQUIRES_AGREEMENT` / `REQUIRES_LOCAL_ENTITY` /
`REQUIRES_GOVERNMENT_CONNECTION` produce named blockers (a recorded local entity clears
the local-entity blocker). Data-localization rules in the destination profile produce
residency requirements. Plans persist as `federation_transitions` with status
PROPOSED/BLOCKED; a BLOCKED plan is stored as such — never silently relaxed.

## 7. Reconciliation (repeatable discovery engine)

`reconcile()` is source-agnostic and deterministic: candidates (with provenance) vs
registry rows → MATCH / NEW / MISSING / DUPLICATE / RENAMED / MERGED / DISSOLVED /
UNCERTAIN / MANUAL_REVIEW. Runs and results persist in
`federation_reconciliation_runs` / `federation_reconciliation_results`.

Live ingestion of the official directory happens only where connectivity and
authorization exist. Until then, runs are recorded against the documented baseline
(325 MDA / 26 regions / 126 LGAs, `TZ_DIRECTORY_BASELINE`) with
`liveVerified: false`, and count-level deltas land as MANUAL_REVIEW — the engine never
upgrades a documented baseline to MATCH.

`scripts/federation/tanzania-coverage-audit.ts` is the repeatable audit: seed
consistency (name-level, shared engine), documented-baseline reconciliation
(count-level), coverage audit, and the public-access report.

## 8. Governance, monitoring, self-repair

- Access requests are APPROVED/DENIED by a separate governed approver
  (segregation of duties: requester ≠ approver, enforced in the decision route); the
  approval row in `federation_approvals` is INSERT/SELECT only — a recorded decision is
  final.
- Production activation/revocation are HIGH_RISK human acts (MFA step-up) that require
  a recorded approval reference + production evidence. No AI or service actor can
  activate production federation integrations.
- Noelia/HIVE monitoring (`buildFederationMonitoringReport`) is read-only observation:
  it can flag overdue reviews, failed verifications, connector degradation, expired
  agreements/credentials — and it can recommend actions, but it cannot grant
  authorization, approve access, rotate credentials, or activate anything. Recommended
  actions execute only through the human approval path.
- Self-repair operates within the incident workflow: an opened incident (safe,
  non-authorizing) is triaged and remediated by governed human decisions. The system
  never self-authorizes.

## 9. Sector consumption

HEALTH/FINANCE/AGRICULTURE/UJENZI sector OSs **consume** this capability (registry
reads, consent/access decisions, evidence). They do not implement their own federation
cores. Foundation, Family Office and HCM remain shared surfaces/capabilities with the
same rule: one canonical implementation each.
