# BEYU OS — Holograph & Family Office Reality Audit (Phase 1)

**Audit date:** 2026-09-23
**Baseline:** `main` @ `7b76767` (Merge pull request #83)
**Branch:** `arena/01a0cfae-beyu-os-1-0`

This audit establishes what current main ACTUALLY contains before the Holograph
and Family Office capability work begins. Code is treated as authoritative over
documentation. Status vocabulary follows the repository:
`IMPLEMENTED` / `PARTIALLY_IMPLEMENTED` / `NOT_IMPLEMENTED` / `PLANNED`.

---

## A. Current BEYU OS architecture

- **Stack:** Next.js 16 (App Router, server components + route handlers),
  PostgreSQL 16, Drizzle ORM (hand-authored SQL migrations + TS schema),
  Tailwind 4, Vitest, Playwright.
- **Canonical model (preserved as-is):** BEYU OS = Constitutional Control
  Plane + Enterprise Operating Kernel + Governed Intelligence Layer, sitting
  under BEYU Holding Company and the BEYU Family Trust.
- **Single codebase, one control plane.** Sector OSs are NOT separate
  deployments from the root app: Finance / Agriculture / Foundation / Ujenzi
  live as governed lib+API+UI modules under `src/lib/<domain>`,
  `src/app/api/v1/<domain>`, `src/app/os/<domain>`. Health OS is the
  exception by design: a federated sector SPA under `sectors/health` mounted
  at `/os/health` behind a separately re-verified Health authorization
  boundary (federation identity bridge, fail-closed).

## B. Current OS registry

- `src/lib/operating-system-catalog.ts` is the canonical, closed catalogue:
  `BEYU_CONTROL_PLANE` (level `CONTROL_PLANE`) + `SECTOR_OPERATING_SYSTEMS`
  = exactly **Finance OS, Health OS, Agriculture OS, Foundation OS, Ujenzi
  OS**. The catalogue's own comment states: *"Shared capabilities never
  belong in this list."*
- The `os_registry` DB table (platform registry UI at `/os/registry`) records
  registered OS rows + source-of-truth bindings; seeded from the canonical
  catalogue.
- **No Holograph/Family Office OS entries exist — correct.** Neither must be
  added as OS entries.

## C. Current shared capability registry

- `src/app/os/capabilities.ts` (`CAPABILITY_IA`) is the single frontend
  information architecture. Its "Shared capabilities" group already lists:
  - **`/os/viz` — "Dimensional Graphics & Twins"**: *"The Universal
    Dimensional Graphics, Visualization, Simulation, Digital Twin & Future XR
    Foundation — ONE shared capability … Never an OS; never a second copy of
    sector truth."* Gated by `viz:scene.read` / `viz:registry.read`.
  - **`/os/family` — "Family Office"**: *"Family governance, lineage,
    beneficiaries, wealth and protection inside BEYU OS under highly
    restricted grants."* Gated by `family:member.read`; domain pages by
    `familyoffice:capital.read` / `familyoffice:protection.read`.
- So the repository ALREADY implements the mission's canonical shape: both
  Holograph (under the name "viz / Universal Dimensional Graphics") and
  Family Office are shared capabilities, not OSs. This work EXTENDS them; it
  does not create new OSs or new registries.

## D. Family Office implementation status

Substantially IMPLEMENTED as a shared capability (governed rails + persisted
domains), all below the BEYU OS control plane:

- **Governance rails** (`src/lib/family/office/*`): bodies, mandates,
  memberships, voting/quorum mechanics, approvals (human-only), delegation,
  workflow, policy registry + ratification, events, persistence, identity,
  documents, constitution, beneficiaries, trust instruments/trustee chains
  (including `TRUSTEE_SUCCESSION` clause type), capital, loan (NO lending
  authority — obligation mechanics only), wealth, business, lifestyle,
  philanthropy, education, validation.
- **Persistence** (`src/db/schema/family-trust.ts`, `family-office.ts`,
  `family-office-capital.ts`, `family-office-protection.ts`): trust
  instruments/provisions/decisions/distributions; capital, investments,
  theses, valuations, obligations, properties, scenarios, generational
  planning; protection & insurance policies/beneficiaries/premiums/claims.
  All tenant-owned, classified, RLS-enforced.
- **API** (`/api/v1/family-office/*`): dashboard, capital-requests, cash-flow,
  debt, decision-journal, generational-wealth, intelligence,
  investment-committee, investment-theses, investments, liquidity,
  obligations, post-mortems, real-estate, scenarios, trust, noelia, and a full
  `protection/*` surface. All behind `guarded()` with `familyoffice:*`
  permissions.
- **UI** (`/os/family`, `/os/family/capital`, `/os/family/protection`):
  permission-gated pages under the shared navigation.
- **Noelia integration:** `src/lib/family/office/noelia-service.ts`,
  `noelia-tools.ts` — advisory only.
- **Reserved matters** vocabulary exists in the governance/family
  constitution layer (`src/lib/family/constitution.ts`,
  `src/db/schema/admin-governance.ts`, constants) — reserved matters are
  governance-domain facts; Family Office references them, never executes
  them.
- **Captured gaps for this mission:**
  - No spatial (Holograph) projection of the family-enterprise structure.
  - No governed "reserved matters" VISUAL surface (the governance engine
    holds the authority; a governed read projection is missing).
  - Succession planning exists as trustee-succession clauses + generational
    wealth planning (IMPLEMENTED as rails); no standalone succession view is
    claimed beyond what exists.

## E. Holograph / 3D / visualization implementation status

The **`src/lib/viz`** capability (migration `0062_universal_dimensional_visualization.sql`)
is the existing shared spatial-visualization foundation. This is the codebase
implementation the mission's "Holograph" canon names. Inventory:

- **Scene model** (`scene-model.ts`): governed `SceneManifest` with a strict
  client allowlist (leak prevention by construction), accessible-text
  fallback, per-object classification.
- **Dimension registry** (`dimensions.ts` + `viz_dimension_extensions`):
  canonical 1D–8D + XD in code; governed 9D+ extensions as tenant rows.
- **Digital twins** (`digital-twin.ts` + `viz_digital_twins`): identity
  bindings ONLY; state is re-derived LIVE from sector adapters per request
  (never cached sector truth).
- **Sector adapters** (`adapters/*`): BEYU / HEALTH / FINANCE / AGRICULTURE /
  UJENZI / FOUNDATION, each with an honest descriptor matrix.
- **Engines:** 4D time, 5D quantity (READ-ONLY; CAP_POSTING LOCKED), 6D
  performance, 7D lifecycle, 8D risk/compliance.
- **Renderers** (`renderers.ts`): abstraction + capability matrix (SVG/table/
  2D projection IMPLEMENTED; **WebGL 3D PLANNED — no dependency bundled**).
- **XR foundation** (`xr.ts`): adapter contract + NULL adapter that fails
  closed (`UNAVAILABLE`, 2D fallback). **No XR runtime exists.**
- **Exports** (`exports.ts` + `viz_exports`): JSON/CSV server-side ledgered
  exports with content hashes; SVG/PNG client-side; PDF/IFC NOT_IMPLEMENTED.
- **Noelia tools** (`noelia-tools.ts`): read-only, no side effects.
- **API:** `/api/v1/viz/{registry,scenes,scenes/[id],twins,twins/[id],manifest,exports}`.
- **UI:** `/os/viz` page + `workspace.tsx` (keyboard contract, inspection,
  2D rendering, accessible tables).
- **Gaps for this mission:**
  - No governed **asset registry** (GLTF/GLB/IFC/CAD/medical/geospatial
    asset records with provenance + integrity + classification).
  - No governed **device registry** (WEB/DESKTOP/MOBILE/AR/VR/
    SPATIAL_DISPLAY/VOLUMETRIC_DISPLAY/FUTURE_HOLOGRAPHIC_DEVICE lifecycle).
  - No governed **render-profile** registry (renderer × device-class × LOD).
  - No governed **interaction ledger** (the UI has a keyboard contract, but
    interaction requests — including workflow/approval delegations and
    denials — are not server-recorded).
  - No **family-office spatial view** (structure/ownership projection).
  - Canonical **Holograph** name not established in code/docs.

## F. Ujenzi digital-twin / BIM implementation

- Ujenzi OS (Sector OS) is IMPLEMENTED: projects, sites, phases, milestones,
  BOQ, cost records, procurement, materials, equipment, HSE, quality,
  variations, claims, payment certificates, handover (`src/lib/ujenzi`,
  `/api/v1/ujenzi/*`, `/os/ujenzi/*`).
- The **viz Ujenzi adapter** (`adapters/ujenzi.ts`, 331 lines) projects
  projects/sites/BOQ/HSE/ITP/NCR/work-packages into governed scene manifests;
  BIM status and certification state are surfaced as honest descriptor
  metadata.
- **BIM/IFC geometry parsing: NOT_IMPLEMENTED** (declared in the adapter
  descriptor; no parser bundled). CRS/offline handling remains in Ujenzi OS.
- This work reuses that adapter; it does not touch Ujenzi OS data authority.

## G. Noelia appearance / contextual manifestation architecture

- `src/lib/noelia/canonical-identity.ts`, `appearance.ts`,
  `hive-runtime.ts`, `runtime.ts`, `context-resolver.ts`, `3d-architecture.ts`
  (provider/model-independent 3D contracts — GLTF/WebGL/fallback, no
  fabricated finished model), `canonical NOELIA.png` at repo root.
- Noelia tools are registered through `NoeliaToolRegistry` with per-tool
  permission + classification + risk + audit metadata; the viz tools are
  read-only with `sideEffects: NONE`.
- **Holograph relation (to be codified):** Noelia = governed BEYU AI
  identity; HIVE = runtime; Holograph = one possible spatial
  manifestation. No new AI authority, no competing avatar.

## H. Authorization architecture

- Single primitive `can()` (`src/lib/authz.ts`): RBAC (role grants with
  EXPLICIT permission enumeration — Finding A-06-1), classification ceilings
  (`PUBLIC → HIGHLY_RESTRICTED`), tenant isolation, entity scope
  (fail-closed refusal for aggregate surfaces), MFA step-up on high-risk
  permissions, delegation, break-glass (`EMG`), service principals.
- Route boundary: `guarded()` (`src/lib/api.ts`) — authentication →
  RBAC/ABAC → classification → entity-scope fail-closed → rate limit →
  audit (denied outcomes audited).
- Sector OS resolution: `assertSectorAccess()` in `src/lib/viz/authorization.ts`
  reuses the CANONICAL sector resolvers (ujenzi/agriculture/foundation
  tenant-scope conjunctions, Finance read paths, Health federation bridge) —
  the viz boundary cannot diverge from the sector's own boundary.

## I. Audit architecture

- Append-only `audit_log` with hash chaining + `audit_chain_heads` lock
  (serialized appends, v2 canonical payload incl. outcome
  SUCCESS/DENIED/FAILURE, reason, authority, trace, IP/UA).
- `withAuditTransaction(tx, audit, event)` commits domain row + audit +
  enterprise event atomically — the canonical chain every governed viz
  mutation already uses.

## J. Event architecture

- `enterprise_events`: CloudEvents-aligned envelope (type, source, domain,
  operation, tenant, legal entity, subject, actor, classification, payload,
  trace/correlation, versions), hash-chained.
- Viz emits a CLOSED vocabulary `VIZ_EVENT_TYPES` (dimension registered,
  scene created/archived, twin registered, export created) under source
  `BEYU_OS` / domain `VISUALIZATION`, plus a verified `REFRESH_TRIGGERS`
  staleness-hint map from sector events.

## K. Database / migration state

- 67 migrations (`0000`–`0066`) + meta. Runner: `scripts/migrate.ts` only
  (records version + sha256 in `beyu_migrations` ledger, drift fingerprint
  before/after). `drizzle-kit push` is forbidden.
- Gates: migration integrity (inventory reconciliation, contiguous sequence,
  checksums, destructive-op classification, pinned `KNOWN_METADATA_DEBT`
  register), expand/contract safety, drift-gate self-test, schema-drift
  (DB introspection vs `src/db/schema` render), DR drill.
- RLS pattern: every tenant table `ENABLE + FORCE ROW LEVEL SECURITY` with a
  `beyu_tenant_ids()` policy; runtime role `beyu_runtime` is
  NOSUPERUSER NOBYPASSRLS NOCREATEROLE NOCREATEDB; migration role is
  superuser and never reaches the client.
- New work must be additive migration `0067` + TS schema + journal entry +
  explicit debt-register entry (the 0063–0066 pattern).

## L. Frontend architecture

- App Router under `/os` (layout + nav derived from `CAPABILITY_IA`),
  server components fetch inside `withTenantDatabaseContext` (RLS active),
  `requireAccess()` page gates, brand design system (`@/components/brand`),
  light enterprise UI, canonical BEYU logo, Noelia shell.
- `/os/viz` is the canonical visualization surface; `/os/family` the Family
  Office surface. No separate frontend exists or will be created.

## M. Deployment constraints

- CI (`.github/workflows/ci.yml`): committed-secret scan; root gate =
  migration integrity → typecheck → lint → migrate (+idempotency re-run,
  ledger reconciliation, expand/contract, drift self-test, schema-drift,
  DR drill) → runtime-role provisioning + assertion → seed → production
  build (also without runtime secrets) → `next start` → full vitest suite
  (HTTP/E2E included, skip-count tolerance) → Playwright browser gate →
  Health OS jobs. PostgreSQL 16 canonical version.
- Vercel: `next build` must succeed WITHOUT runtime secrets (deployment
  parity). No Vercel project config in-repo beyond that parity requirement.

## N. Test architecture

- Vitest (`tests/**`), `fileParallelism: false` (shared audit hash chain),
  dotenv central setup; `BEYU_TEST_DATABASE_URL` (privileged) for
  governed-mutation suites; adversarial RLS suites connect as the
  `beyu_runtime` role via `BEYU_RUNTIME_DATABASE_URL` to prove database-layer
  isolation. HTTP/E2E suites drive a real `next start` server.
- `tests/viz/*` already contains: authorization, cap-posting boundary,
  dimensions, HTTP, leak-prevention, noelia-tools, RLS isolation,
  scene-model, service, ujenzi-regression. `tests/family/*` covers
  capital/loan, constitution, decision-alignment, eligibility, institution,
  lineage, office, phase3.

## O. Contradictions, duplicates, unsafe boundaries

- **No duplicate OS, duplicate registry, or unsafe boundary found.**
- The one naming gap: the mission's canonical name **"Holograph"** does not
  appear anywhere in current main; the capability is named "viz / Universal
  Dimensional Graphics" in code. **Resolution (smallest consistent decision):**
  keep the existing `viz` code namespace, table namespace (`viz_*`),
  permission namespace (`viz:*`) and route (`/api/v1/viz`, `/os/viz`) — all of
  which are canonical, tested and RLS-bound — and establish **Holograph as
  the canonical CAPABILITY NAME** (docs, canon module, UI labels, registry
  descriptions). Renaming namespaces would rewrite tested security boundaries
  for no security benefit and violates "preserve the existing canon".
- **No new event bus, authorization model, identity system, or database
  authority** is created; every new surface reuses `can()`, `guarded()`,
  `withAuditTransaction`, `enterprise_events`, RLS and the existing
  sector adapters.
- **Finance boundary preserved:** no new table carries journal/treasury/
  posting state; no new code path imports the posting engine; CAP_POSTING
  remains LOCKED; the new interaction surface cannot post (tested).
- **Lending:** none introduced (existing family loan mechanics are
  obligation rails only, unchanged).

## Conclusion

Current main already implements ~70% of the mission's architectural intent.
The safe, canon-preserving extension is:

1. Codify the **Holograph canon** (definition, boundaries, what it is NOT)
   in code + docs under the existing `viz` namespace.
2. Extend the capability with the four missing governed registries:
   **assets, devices, render profiles, interactions** (one additive
   migration `0067`, RLS + audit + events on every surface).
3. Add the **Family Office spatial view** (structure/ownership/trust
   projection over existing canonical tables, familyoffice-gated).
4. Wire the existing **Noelia** read-only tool surface to the canon.
5. Extend tests (unit, RLS, security, Finance boundary) and docs with the
   truthful status matrix.
