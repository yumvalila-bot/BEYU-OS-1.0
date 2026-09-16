# BEYU OS frontend capability matrix

**Audit date:** 2026-09-16

**Repository baseline:** `833c837017985293a10e10853026b1e8a9b4fb29` (`main`)

**Scope searched:** `src/`, `sectors/`, `drizzle/`, `docs/`, `public/`, `scripts/`, `tests/`

## Constitutional topology

BEYU OS is the single global constitutional control plane. The only Sector OSs beneath it are:

1. Finance OS
2. Health OS
3. Agriculture OS
4. Foundation OS

Family Office, contracting, blockchain evidence, government integration, HCM, documents, Noelia/HIVE and all other entries below are shared or focused capabilities, not additional operating systems. The trust → holding → country holding → sector company → Sector OS hierarchy remains canonical.

## Repository baseline inventory

| Artifact | Audited count | Source of truth |
|---|---:|---|
| Canonical permissions | 170 | `src/lib/constants.ts` |
| Canonical roles | 20 | `src/lib/constants.ts` |
| Database schema modules | 23 | `src/db/schema/` |
| Ordered SQL migrations | 43 | `drizzle/0000`–`0042` |
| API route handlers | 237 | `src/app/api/**/route.ts` |
| BEYU `/os` page routes | 52 | `src/app/os/**/page.tsx` |
| All application page routes | 56 | `src/app/**/page.tsx` |
| Test files | 191 | `tests/` |
| Canonical BEYU brand assets | 10 | `public/brand/` |

The frontend catalogue is `src/app/os/capabilities.ts`; operating-system launch truth is `src/lib/operating-systems.ts`. Route visibility is presentation only. Every destination resolves the principal and rechecks server-side authorization.

## Capability exposure matrix

| Capability | Existing implementation / database / API | Prior frontend exposure | Final protected frontend route | Navigation / icon | Server boundary |
|---|---|---|---|---|---|
| Executive control centre | Executive queries, governance registry, Finance/HCM/risk data | `/os`, but several combined reads were over-broad | `/os` | Command icon | Permission-partitioned SQL; tenant/entity/classification filters |
| OS & source-of-truth registry | OS, capability, data-asset, integration and decision registries | `/os/registry` | Reused `/os/registry` | Registry icon | `platform:registry.read`; global-register safeguards |
| Identity & access | GlobalUserID, parties, users, roles, assignments, sessions, emergency grants | `/os/identity` | Reused `/os/identity` | Identity icon | `identity:user.read`; entity/user/session containment |
| Organisation | Tenants, legal entities, jurisdictions | `/os/organization` | Reused `/os/organization` | Organisation icon | `organization:entity.read`; tenant/entity/classification SQL predicates |
| Ownership | Ownership records plus instrument-level Equity domain | Split and easy to miss | `/os/organization-ownership`, `/os/ownership` | Hierarchy / ownership icons | Independent ownership and Equity grants; aggregate classification preflight |
| Governance | Bodies, resolutions, votes, policy and authority | Multiple focused routes | `/os/governance`, `/os/constitution` | Governance / constitution icons | Permission partition; body/entity/classification containment; human decisions |
| Risk, compliance & assurance | Risks, controls, obligations, evidence, remediation | Separate risk/compliance routes only | `/os/assurance`, `/os/risk`, `/os/compliance` | Assurance / risk / compliance icons | Independent risk and compliance permissions; no cross-domain over-read |
| Legal & liability | Legal matters and obligations | `/os/legal` | Reused `/os/legal` | Legal icon | `legal:matter.read`; tenant scope |
| Business continuity / security posture | Sessions, MFA, lockouts, service principals, security state | Fragmented | `/os/security` and protected Settings links | Security icon | Identity permission; sensitive token/IP payloads omitted |
| HCM | Employee master, org units and workforce lifecycle APIs | `/os/hcm` | Reused `/os/hcm` | HCM icon | `hcm:employee.read`; entity-scoped employee and org-unit filters; salary minimisation |
| Documents & knowledge | Documents, retention, evidence, legal hold, knowledge sources | `/os/documents` | Reused `/os/documents` | Documents icon | Tenant/entity/country/classification scope; malformed scope arrays fail closed |
| Audit & events | Append-only audit chain and immutable event stream | Separate `/os/audit` and `/os/events` | Added aggregate `/os/audit-events`; focused routes retained | Audit / event icons | Separate `audit:log.read` and `audit:event.read`; clearance filters |
| Registry directory | Existing specialist registries | No unified discovery | Added `/os/registries` | Registry icon per card | Authorization-filtered server directory; each target rechecks access |
| Workflow & approvals | Workflow definitions, instances, approvals and Noelia workflows | `/os/workflow` | Reused `/os/workflow` | Workflow icon | Requester/enterprise partition; HIVE and entity-scope refusal where unkeyed |
| Notifications | Tenant/user/role delivery records | `/os/notifications` | Reused `/os/notifications` | Bell icon | Recipient predicates and classification filter in shell and full stream |
| Governed contracting | Contract lifecycle, parties, obligations, disputes, authority and anchors; four APIs | Backend/API only | Added `/os/contracts` | Contracts icon | `contracts:read`; tenant/entity/classification SQL containment; mutations remain governed |
| Government Integration Fabric | Agency registry, adapters, submissions and gateway; two APIs | Backend/API only | Added `/os/government-integrations` | Government icon | Read/manage split, MFA on submission, entity/tenant/jurisdiction verification, digests only |
| Blockchain registry & evidence | Smart-contract registry, anchors, events, oracle and reconciliation; six APIs | Backend/API only | Added `/os/blockchain` | Blockchain icon | `blockchain:read`; tenant/classification filters; entity-scoped aggregate refused; never authority |
| Noelia / HIVE console | Governed query, brief, workflows, schedules and memory | `/os/noelia` | Reused `/os/noelia` | HIVE icon | Principal-derived scope, policy, citations, classification and audit |
| AI governance & assurance | AI identity, models, providers, evaluations, risk, incidents, kill switches, compliance and Phase 5 telemetry | Backend/API/documents only | Added `/os/noelia/governance` | HIVE icon | Dataset-by-dataset AI permissions; tenant-only incident/kill-switch reads refused for entity grants |
| Family registry | Family members, beneficiaries, vault and governance links | `/os/family` | Reused `/os/family` | Family icon | Highly restricted permissions; class filters; unkeyed member/vault reads refused for entity grants |
| Family capital & wealth | Investments, obligations, property, cash flow, liquidity, committees, journal and plans | `/os/family/capital` | Reused `/os/family/capital` | Capital icon | HIGHLY_RESTRICTED aggregate preflight; entity-scoped aggregate refused; Finance remains authoritative |
| Family protection & insurance | Policies, beneficiaries, premiums, assignments, claims, reviews and assessments | `/os/family/protection` | Reused route and policy detail | Protection icon | HIGHLY_RESTRICTED preflight; governed claim/beneficiary actions; no posting authority |
| Finance ledger & reporting | Accounts, periods, journals, reports and reconciliation | `/os/finance` | Reused `/os/finance` | Finance icon | `finance:ledger.read`; entity and classification containment; no silent adjustments |
| Capital & treasury | Capital requests, treasury positions and governance authorization | `/os/capital` | Reused `/os/capital` | Capital icon | Restricted preflight; entity scope; governance authorization is not execution |
| Waterfall | Configurations, tiers, runs and deterministic simulation | `/os/waterfall` | Reused `/os/waterfall` | Waterfall icon | Restricted/entity checks; simulation is audited and cannot commit cash |
| Tax governance | Global strategies, entity-scoped assessments and legal evidence | `/os/tax` | Reused `/os/tax` | Tax icon | Restricted, jurisdiction/entity/classification checks; human tax review required |
| Payments & settlements | Providers, transactions, matching, exceptions, settlements and accounting handoff | Backend/API only | Added `/os/finance/payments` | Payments icon | Separate read/ingest/review/authorize/configure duties; entity-scoped aggregate refused; no payment creation on page |
| Health OS | Separate frontend/backend, identity federation design, clinical controls | `/health`; no verified production federation target | Reused `/health` truthful federation state | Health icon | Canonical identity link plus Health reauthorization; fails closed when unavailable |
| Agriculture OS core | Farms, crops, harvests, livestock, work, hazards, capital handoff and exports | Large `/os/agriculture` dashboard | Reused `/os/agriculture` | Agriculture icon | Tenant/classification SQL filters; entity-scoped aggregate refused; CAP_POSTING locked |
| Agriculture full domain surface | 90 governed API routes across land, crops, livestock, aqua, environment, IoT, work, assets, inventory, quality, projects, insurance, commerce, traceability, exports, documents and offline sync | Most endpoints had no discoverable frontend route | Added `/os/agriculture/capabilities`; all 90 endpoints inventoried | Semantic icon per domain group | `agriculture:data.read/manage`; generic list classification filtering; scoped aggregate refusal |
| Foundation OS registry / formation / structure | Foundation lifecycle, formation and scenario services | Nested pages existed | Reused nested routes | Registry / workflow / hierarchy icons | Granular permissions and classification preflight |
| Foundation governance / tax / compliance | Meetings, conflicts, tax, obligations, deadlines, evidence and escalation | Nested pages existed | Reused nested routes | Governance / tax / compliance icons | Dataset permissions, restricted/confidential preflight and tenant scope |
| Foundation donors / funds / grants | Donors, donations, funds, allocations, grantees and disbursements | Nested pages existed | Reused nested routes | Identity / capital / documents icons | Independent donor/fund/grant grants; no landing-page cross-read |
| Foundation programs / impact | Programs, projects and impact measurements | One page over-read impact under program permission | Reused `/os/foundation/programs` | Foundation icon | Program/project and impact datasets independently authorized |
| Foundation beneficiaries | Minimised beneficiary and service records | API only | Added `/os/foundation/beneficiaries` | Identity icon | `foundation:beneficiary.read`, RESTRICTED, minimised columns |
| Foundation operations | Procurement, assets, investments and workforce assignments | One page read all four under procurement permission | Reused `/os/foundation/operations` | Organisation icon | Four independent grants and conditional panels |
| Foundation safeguarding | Highly restricted casework | Nested page existed but lacked class preflight | Reused `/os/foundation/safeguarding` | Security icon | `foundation:safeguarding.read`, HIGHLY_RESTRICTED |
| Settings | Session/account/security destinations and browser-local preferences | No complete protected route | Added `/os/settings` | Settings icon | Authenticated; admin destinations permission-filtered; no client-side authority controls |

## Navigation, branding and responsive status

- The sidebar, mobile drawer, capability map and launcher derive from canonical catalogues rather than competing menus.
- Desktop navigation is persistent, tablet navigation collapses, and mobile uses a labelled modal drawer with Escape handling and no hover-only reachability.
- Every catalogue item has a semantic icon, visible label, truthful description and real route.
- Search/discovery is authorization-filtered before results are rendered.
- The authoritative files under `public/brand/` are reused through the existing brand presenters. No alternate logo markup or tenant override was created.
- Navy `#0B1F4D`, gold `#D4A017`, and “Bridging Care. Building Trust.” remain canonical.

## Authorization and isolation findings closed

1. Unknown clearances now fail closed both in `can()` and SQL allow-list generation.
2. Documents reject malformed entity/country scope arrays rather than treating them as broad scope.
3. Foundation landing, Programs and Operations no longer borrow one permission for adjacent datasets.
4. Foundation and Agriculture APIs refuse entity-scoped access where relational rows cannot prove complete entity containment.
5. Generic Agriculture list handlers filter known classification values at or below principal clearance.
6. Contract reads now constrain tenant, entity and classification before loading contract children.
7. Government submissions validate legal entity tenant, entity scope, clearance and agency jurisdiction before any adapter call.
8. Tax and Waterfall mutation boundaries recheck legal-entity and classification scope.
9. Capital governance ancestry and governing-body queries are tenant-contained and fail closed when the body is absent.
10. Family capital-request joins now constrain referenced Finance requests to allocation tenant scope.
11. Foundation role clearances are explicit so safeguarding grants do not silently inherit the generic INTERNAL fallback.

## Genuine gaps and human-controlled actions

| Gap / action | Status | Human authority required |
|---|---|---|
| Verified Health OS production federation URL and identity-link deployment | Not present in repository/runtime evidence; UI fails closed | Deployment owner and Health security owner |
| External payment-provider credentials, contracts, UAT and production approval | Explicitly blocked / non-live unless evidence exists | Finance, security, provider and approvers |
| Government credentials, sandbox/UAT evidence and production authorization | Registry-driven; unavailable integrations remain blocked | Government-integration owner and designated approvers |
| Blockchain deployment keys, multisig signers, timelocks and legal enforceability | Deliberately not held or created by this frontend | Governance, security, legal and key custodians |
| CAP_POSTING activation | Remains locked; no unlock UI or bypass added | Existing constitutional Finance/governance process only |
| Legal, tax, safeguarding, beneficiary, investment, claim and governance decisions | Software records or simulates; it does not approve on behalf of humans | Authorized accountable roles, MFA and required resolutions |
| AI provider activation, model approval, certification and kill-switch disposition | Registry/evidence surfaces only; Noelia cannot self-authorize | AI governance, risk, security and external assessors where required |
| Repository dependency advisories | `npm audit` currently reports 6 moderate and 1 high advisory; no breaking forced upgrade was applied | Maintainer-approved dependency upgrade and regression cycle |

## Validation record for this patch

- `npm run typecheck`: passed.
- `npm run lint`: passed with one pre-existing `@next/next/no-img-element` warning in `src/components/noelia-cross-os-visual.tsx`.
- `npm run build`: passed; 123 static-generation entries and all new routes compiled. The existing dynamic-filesystem tracing warning in `src/lib/command/posture.ts` remains.
- Frontend capability/brand/control-plane source gates: 88/88 passed in the latest focused run.
- Earlier PostgreSQL-backed fresh-database baseline on this branch: 185 passed files / 5 skipped; 3,620 passed tests / 28 skipped. A final database-backed CI run remains the authoritative post-commit gate because the current local sandbox no longer has PostgreSQL available.

No deployment, external credential activation, approval, merge, or production claim is implied by this matrix.
