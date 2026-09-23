# NOELIA AI CONTEXTUAL APPEARANCE & PROFESSIONAL MANIFESTATIONS

## 1. Canonical Identity Invariant

There is exactly ONE Noelia AI identity:

**`NOELIA_AI`**

This identity is invariant across every BEYU OS context.

"Contextual appearance changes Noelia's visual manifestation without creating a new Noelia identity."

Noelia's canonical identity (`NOELIA_CANONICAL_ID.canonical_id === "NOELIA_AI"`) is preserved across:
- Control Plane (`BEYU_OS`)
- Sector OSs (`HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS`)
- Professional manifestations within `UJENZI_OS` (Architectural, Engineering, Construction, Site, HSE, BIM, BOQ/Cost, Quality/NCR, Commissioning)

Context changes manifestation. Context does NOT create another identity.

## 2. Canonical Sector OS Catalogue

"UJENZI_OS is a Sector OS."

The canonical BEYU Sector OS catalogue contains:
1. `HEALTH_OS`
2. `FINANCE_OS`
3. `AGRICULTURE_OS`
4. `UJENZI_OS`

UJENZI_OS is a FIRST-CLASS CANONICAL SECTOR OS. It is not a feature, capability, submodule, or derivative OS.

"Architectural and Engineering manifestations are governed contexts inside UJENZI_OS, not separate operating systems."

The system strictly prohibits and does not contain:
- Engineering OS
- Architecture OS
- BIM OS
- GIS OS
- Twin OS
- Construction OS
- Construction AI OS
- Noelia OS

## 3. Governed Professional Manifestations in Ujenzi OS

Within `UJENZI_OS`, Noelia adapts her presentation and vocabulary to the active professional context:

```
                         NOELIA_AI
                            │
                            ▼
                         UJENZI_OS
                            │
             ┌──────────────┴──────────────┐
             ▼                             ▼
      ARCHITECTURAL                   ENGINEERING
       MANIFESTATION                  MANIFESTATION
             │                             │
             ├─ Design                     ├─ Structural
             ├─ Architecture              ├─ Civil
             ├─ Planning                  ├─ MEP
             ├─ BIM                       ├─ Geotechnical
             ├─ Documentation             ├─ Infrastructure
             └─ Spatial coordination       └─ Site engineering
```

Supported Ujenzi professional manifestations:
- `ARCHITECTURAL`: Design coordination, architectural planning, BIM and spatial coordination, documentation standards.
- `ENGINEERING`: Structural engineering, civil works, MEP systems, geotechnical, infrastructure, site engineering.
- `CONSTRUCTION`: General construction execution, site supervision, contractor coordination.
- `SITE`: Site operations, daily logs, equipment logistics.
- `HSE`: Health, safety, environment, hazard identification, incident prevention.
- `BIM`: Building Information Modeling and digital twin spatial alignment.
- `BOQ_COST`: Bills of quantities, cost tracking, payment certificates.
- `QUALITY_NCR`: Quality assurance, inspection test plans (ITP), NCR resolution, snagging.
- `COMMISSIONING`: Handover verification, punch item clearance.

## 4. Asset Discovery and Fallback Status

**CANONICAL APPEARANCE RULE: Noelia's canonical visual appearance is `/NOELIA.png`.**

Every OS context — BEYU_OS, FINANCE_OS, HEALTH_OS, AGRICULTURE_OS, UJENZI_OS —
resolves to the SAME single canonical asset. There are no per-sector Noelia
images and no fallback hierarchy: context changes labels, capabilities, tools
and vocabulary, never the appearance asset.

Per canonical asset rules:
- No synthetic raster images were created, redrawn, recolored, cropped, or AI-generated.
- The single canonical portrait (`/NOELIA.png`, logical ID `noelia-canonical`,
  SHA-256 `643b375a9abc074a5e4b53d581b09c20fddbfca6701f0d71f3a13c3d5754c990`) is
  served for every context.
- Alternate Noelia avatar assets must not be introduced without an explicit
  architecture decision.

The five historical source PNGs at the repository root remain byte-exact and preserved for provenance (not application-served):
1. `Noelia AI .png` — `12542aef08ef5bb087a9ad15e2a8631a`
2. `Noelia BEYU OS.png` — `4f61c9187398e80e32746b0f8540b513`
3. `Noelia Finance os.png` — `2eb029f1739e9fbf54041dccfae27093`
4. `Noelia Health os.png` — `6a63d1037bd0bb68d4811ebd1516b1e3`
5. `Noeloa Agriculture OS.png` — `14ea902f3a8b88e685cc183a83fb1699`

## 5. Security Ordering & Authorization Isolation

The architecture enforces the strict security sequence:

```
requested context
  → authoritative principal scope
    → authorization validation
      → validated context
        → contextual appearance resolution
```

Client-supplied context is NEVER authorization. Appearance is presentation-only.

Professional context MUST NOT bypass authorization:
- `UJENZI_OS` + `ARCHITECTURAL` does not grant architectural write permissions.
- `UJENZI_OS` + `ENGINEERING` does not grant engineering write permissions.
- RBAC, ABAC, RLS, tenant isolation, and classification ceilings remain the authoritative boundaries.
- Unauthorized contexts fail closed with blank visual manifestations (`""`) and empty capability lists (`[]`).

## 6. Relationship to PR #78

PR #78 established the browser-local appearance and personalization foundation in the BEYU OS shell.
This enhancement builds directly upon PR #78:
- Existing appearance preferences (`avatarMode`, `presenceMode`, `visualMode`, `motionEnabled`, `reducedMotion`, `greetingStyle`, `chatPosition`, `notificationPreference`, `voiceUiEnabled`, `themeMode`) are 100% preserved.
- The existing context resolver (`src/lib/noelia/context-resolver.ts`) and `resolveNoeliaOSContext()` are reused and extended.
- The existing shell component (`src/components/noelia-shell.tsx`) is extended to consume server-resolved contextual appearance without creating a second shell.
- The audit event `NOELIA_CONTEXT_CHANGED` is reused.

## 7. Audit Policy

Context switches emit the canonical `NOELIA_CONTEXT_CHANGED` audit event:
- Action: `NOELIA_CONTEXT_CHANGED`
- Object Type: `NOELIA_CONTEXT`
- Object ID: `NOELIA_AI`
- Outcome: `SUCCESS` or `DENIED`
- Metadata: Minimum necessary facts (`activeOS`, `professionalContext`, `logicalAssetId`, `status`), with no secrets.
