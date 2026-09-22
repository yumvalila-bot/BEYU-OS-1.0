# BEYU OS — Canonical architecture invariants (P1 contract)

**Status:** normative. Machines derive their status from registry
evidence (`src/lib/architecture/completeness.ts`, `src/lib/finance/domains.ts`,
`src/lib/interoperability/domains.ts`, `src/lib/governance/maturity.ts`); this
document pins the **invariants** those registries exist to protect, and the
programme phases (P2+) exist to verify.

**Ownership:** these invariants are enforced by the security constitution, the
schema (`0000`→`0044`), the authorization chain and the existing registries.
Nothing here creates a registry or an enforcement path.

---

## A. Architecture

```
ONE BEYU OS          (constitutional control plane)
+ SIX CANONICAL OSs  (BEYU OS, Finance OS, Health OS, Agriculture OS, Ujenzi OS, Foundation OS)
+ SHARED GOVERNED CAPABILITIES
```

- The canonical enumeration lives in `src/lib/operating-systems.ts` and the
  `os_registry` seed (`BEYU_OS`, `FINANCE_OS`, `HEALTH_OS`, `AGRICULTURE_OS`,
  `FOUNDATION_OS`, `UJENZI_OS`).
- Capabilities such as HCM, Family Office, Governance, Risk, Compliance,
  Security, Audit, Events, Workflow, Noelia/HIVE, PVG, Blue-Green, Canary and
  Load Balancing are **capabilities, services, controls or engineering
  patterns** — they must never be registered as an OS and never receive a
  sector control plane.
- Ujenzi OS is a Sector OS. Foundation OS is a Sector OS (nonprofit sister
  operating environment governed by BEYU OS).
- One registry of record for OSs; one for capabilities; one authorization
  chain; one event ledger. No duplicate systems, no duplicate taxonomies.

### A.1 Canonical Sector OS route contract

One registry is the single source of route → OS identity
(`src/lib/operating-system-catalog.ts`, consumed by `src/lib/operating-systems.ts`,
the launcher, the capability map, the sidebar and the OS brand). A route is
resolved from that registry; it is never inferred from URL text.

| Route | Registry code | Operating system |
| --- | --- | --- |
| `/os` | `BEYU_OS` | BEYU OS — constitutional control plane |
| `/os/health` | `HEALTH_OS` | Health OS |
| `/os/finance` | `FINANCE_OS` | Finance OS |
| `/os/agriculture` | `AGRICULTURE_OS` | Agriculture OS |
| `/os/ujenzi` | `UJENZI_OS` | Ujenzi OS |
| `/os/foundation` | `FOUNDATION_OS` | Foundation OS |

- **A route confers nothing.** Each canonical route re-runs its own server-side
  gate (session → OS/federation authorization → tenant → entity → country →
  role → permission → policy → RLS) on every request; the URL is never
  authorization.
- **One Health OS mount.** The single governed handler
  (`src/app/os/health/mount.ts`) serves `/os/health` (canonical) and `/health/os`
  (pre-existing alias); `/health` remains the truthful denial/availability
  surface. There is no second mount, shell, session system or authorization
  check.
- **No catch-all under `/os`.** An unknown OS route uses the existing 404 and
  never resolves to an unrelated Sector OS.
- **Noelia context is presentation only.** The active OS context for the
  existing contextual appearance engine is resolved from this registry
  (`src/lib/os-context.ts`) and can never grant, widen or imply access.
- **Capabilities are not OSs.** Ujenzi capabilities (BIM, BOQ, HSE,
  commissioning, CRS, digital-twin identity graph) and shared capabilities
  (HCM, Family Office, Visualization, Noelia/HIVE) receive no route of their
  own under this contract.

## B. Security (unchanged by any programme phase)

```
GlobalUserID → RBAC + ABAC → OS authorization → Tenant → Entity → Country
  → Policy → Application use case → Domain rules → Repository → PostgreSQL RLS
```

- URL/deep links are **never** authorization. Every deep link re-checks OS,
  tenant, entity, country, role and permission server-side. PostgreSQL RLS
  (`FORCE ROW LEVEL SECURITY`, `beyu_tenant_ids()`) is the final data isolation
  boundary and is never weakened, bypassed, disabled or replaced.
- No hidden authorization routes may be introduced by any phase.

## C. Deployment

```
DEPLOYED ≠ VERIFIED ≠ PROMOTED
```

A hosting platform reporting "Ready" proves deployment only. Verification (PVG)
and promotion (a governed decision) are distinct, evidenced transitions. Rollback
must preserve the prior stable release until the next is proven.

## D. Database evolution

```
EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT
```

The currently deployed release must remain compatible with the expanded schema
until that release is retired. No destructive schema change may land in the same
release that first requires the new shape. Cataloguing a migration type
(ADDITIVE vs CONTRACTING) is P2; the existing enforcement (checksummed,
ordered, deterministic `scripts/migrate.ts`; `db-release.yml` preflight/verify/
drift; destructive-operation scan; `drizzle-kit push` prohibited on managed
databases) is authoritative already.

## E. Events

```
Domain Event → Existing Event Registry → Governance/policy → Existing Event
Infrastructure → Authorized Consumers → Audit
```

Events are versioned, schema-governed (the one interoperability envelope), traceable,
auditable, tenant-aware, replay-safe/idempotent where required. **Events do not
grant authorization** — an authorized consumer still enforces the full §B chain
before acting. No second event bus or taxonomy is introduced.

## F. Finance

`CAP_POSTING` remains **LOCKED and fail-closed**. The posting path
(`POST /api/v1/finance/journal` → `postJournal` → `requireCapability("CAP_POSTING")`)
stays blocked pending accounting governance ratification. No deployment,
routing, PVG, migration, rollback, Noelia/HIVE or event mechanism may bypass
financial controls.

## G. Noelia / HIVE

Noelia is the single governed BEYU AI identity; HIVE is the governed
tool/workflow runtime. They may never self-authorize or bypass: RBAC, ABAC,
policy, tenant isolation, entity isolation, country isolation, RLS, audit,
approval controls, OS boundaries, or `CAP_POSTING`.

## H. Load balancing / routing

Load balancing is **traffic infrastructure**, never an authorization mechanism.
The routing decision chooses *where* traffic goes; BEYU authorization (server)
decides *whether* the request is permitted. No route may be introduced that
conflicts with existing application behavior.
