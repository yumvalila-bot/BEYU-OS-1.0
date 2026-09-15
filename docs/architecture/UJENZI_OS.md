# BEYU Ujenzi OS

BEYU Ujenzi OS is **one construction-sector operating system** inside BEYU OS.

All listed domains are **capabilities** inside Ujenzi OS and are **not** separate operating systems:

brief, architectural design, engineering, analysis, BIM, BOQ/QS, cost tracking, contracts, variations, claims, procurement, suppliers, contractors, workforce/labour pool, materials, equipment, site operations, HSE, QA/QC, schedule/progress, interior, FF&E, technology/IoT/CV/drones/robotics orchestration, Tanzania-configurable compliance, government integration **tracking**, Vision 2050 alignment, handover, and governed project learning.

## Canonical architecture

BEYU OS (constitutional control plane)
→ shared capabilities (Identity, HCM, Finance, Documents, Audit, Noelia/HIVE, Government gateway)
→ **BEYU Ujenzi OS** (one Sector OS)
→ many governed construction capabilities

## Boundaries that must not be crossed

- **Finance OS** is the only journal. Ujenzi cost trackers and payment certificates are **not** a general ledger. `CAP_POSTING` remains **LOCKED**.
- **HCM** remains workforce identity truth. Ujenzi labour pool records may link `GlobalUserID` / `hcmEmployeeId`; they do not create a competing employee master.
- **Noelia** is one AI identity. There is no “Ujenzi AI”. Learning never grants authority.
- **Engineering calculations** are decision support (`NOT_CERTIFIED`) until a human professional reviews them.
- **Soil / geotechnical** records never invent field or laboratory results. Missing data is `DATA_REQUIRED` / `NOT_AVAILABLE`. Assumed parameters are labelled `ASSUMED`.
- **Government** remains authoritative. Connection status defaults to `NOT_CONNECTED`. Official status defaults to `USER_ENTERED`. No fabricated permits or APIs.
- **Vision 2050** alignment is measurable evidence. The system does not claim government endorsement.
- Tanzania is the initial **country configuration**, not a hard-coded global core.

## Permissions

- `ujenzi:data.read`
- `ujenzi:data.manage` — bound to tenant `BEYU-UJENZI`

## APIs

- `GET/POST /api/v1/ujenzi/projects`
- `GET /api/v1/ujenzi/dashboard`
- `POST /api/v1/ujenzi/sync` (offline envelopes; never a permission bypass)
- `POST /api/v1/ujenzi/calculations` (always `NOT_CERTIFIED`)
- `POST /api/v1/ujenzi/soil` (`DATA_REQUIRED` when parameters are missing)
- `POST /api/v1/ujenzi/progress` (`journalsPosted: false`)

## Implementation report (A–AB)

| | Status |
|---|---|
| A One Sector OS (no inner OS products) | Implemented: registry `UJENZI_OS` ACTIVE; domain `DOM-UJENZI` PARTIAL |
| B Reuse identity/HCM/Finance/Documents/Audit/Noelia | Implemented: no competing masters |
| C Finance SoR; CAP_POSTING LOCKED | Implemented: events `journalsPosted: false`; tests |
| D No fabricated soil / gov / engineering certification | Implemented: soil DATA_REQUIRED; calc NOT_CERTIFIED; gov NOT_CONNECTED |
| E Tanzania-first config | Seed country TZ; not a hard-coded global core |
| F Lifecycle tables (brief→handover) | Schema 32 tables covering the lifecycle |
| G RLS fail-closed | Migration 0042 FORCE RLS |
| H Permissions named grants | `ujenzi:data.read` / `manage`; manage tenant-bound `BEYU-UJENZI` |
| I Command centre UI | `/os/ujenzi` |
| J APIs | projects, dashboard, sync, calculations, soil, progress |
| K Noelia observe | `ujenzi.operations.observe`; cross-OS enum includes UJENZI |
| L Tests | `tests/ujenzi/os.test.ts` (16 passing against Postgres) |
| M Docs | this file + `sectors/README.md` |
| N Not implemented as live government APIs | Honest `NOT_CONNECTED` / USER_ENTERED |
| O Not a professional stamp | Explicit `NOT_CERTIFIED` |
| P BIM/BOQ/HSE/QAQC tables exist | Schema yes; dedicated HTTP routes only for core mutations |
| Q Offline sync | Idempotent envelopes |
| R Cost tracker is not a ledger | Documented + tests |
| S Labour pool does not replace HCM | Schema links HCM ids only |
| T Vision 2050 scorecards | Tables exist; no endorsement claims |
| U Seed tenant/entity | `BEYU-UJENZI` / `BEYU-UJZ` CONSTRUCTION |
| V Connectivity | UJENZI → FINANCE EVENT |
| W Issuer | `UJENZI_OS` internal service issuer |
| X Learning never grants authority | `authorityGranted: false` |
| Y Health identity cannot bind construction entity | Tested |
| Z Inner OSs refused | Architecture copy + registry kind SECTOR_OS once |
| AA Remaining work | Full CRUD for every capability table; GIS/BIM viewers; live MDA adapters |
| AB Evidence | `drizzle/0042_ujenzi_os.sql`, `src/lib/ujenzi`, `tests/ujenzi/os.test.ts` |
