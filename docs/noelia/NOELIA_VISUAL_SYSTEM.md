# NOELIA VISUAL SYSTEM

## Hierarchy (never invert)

```
BEYU FAMILY TRUST   → Parent institutional / fiduciary identity
 └─ BEYU            → Institution / platform identity
     └─ BEYU OS     → Operating and governance environment (control plane)
         ├─ SECTOR OSs (Health · Finance · Agriculture · future)
         └─ HIVE      → Governed AI runtime
             └─ NOELIA AI → Unified governed AI identity & interface
```

Noelia never appears above BEYU. Noelia never appears as BEYU's constitutional
or governance authority. The Noelia UI states the accountability boundary in
plain language.

## Canonical Appearance Contract

**Noelia's canonical visual appearance is `/NOELIA.png`.**

- It is the SINGLE canonical visual reference across BEYU OS and the Vercel
  application. Every surface that shows Noelia's appearance (control plane,
  Sector OS contexts, organization page, shell, panels) resolves to this ONE
  asset.
- Sector/contextual experiences must reuse it. Context may change wording,
  tools, permissions, workflows and operational capabilities — never the
  appearance asset.
- Alternate Noelia avatar assets must NOT be introduced without an explicit
  architecture decision.
- Appearance confers no authorization or capability. Noelia's image is never
  proof of identity, authority, role, approval, or permission.

| Logical ID | Canonical Filename | Serving Path | SHA-256 | Status |
|---|---|---|---|---|
| `noelia-canonical` | `NOELIA.png` (repo root, tracked) | `/NOELIA.png` | `643b375a9abc074a5e4b53d581b09c20fddbfca6701f0d71f3a13c3d5754c990` | AUTHORITATIVE |

`public/NOELIA.png` is a byte-exact deployment copy of the tracked root asset
(Next.js only serves `public/`); byte-equality is pinned by
`tests/noelia/contextual-appearance.test.ts`. Neither file may be modified,
recompressed, recolored, cropped, or regenerated.

## Historical Image Register (provenance only)

The five original PNG assets remain preserved byte-exact at the repository
root for provenance. They are HISTORICAL — no application surface serves them
as an appearance, and no per-OS presentation copies exist.

| Logical ID | Historical Filename (repo root) | MD5 | Status |
|---|---|---|---|
| `noelia-ai` | `Noelia AI .png` | `12542aef...` | HISTORICAL_PRESERVED |
| `noelia-beyu-os` | `Noelia BEYU OS.png` | `4f61c918...` | HISTORICAL_PRESERVED |
| `noelia-finance-os` | `Noelia Finance os.png` | `2eb029f1...` | HISTORICAL_PRESERVED |
| `noelia-health-os` | `Noelia Health os.png` | `6a63d103...` | HISTORICAL_PRESERVED |
| `noelia-agriculture` | `Noeloa Agriculture OS.png` | `14ea902f...` | HISTORICAL_PRESERVED (original filename `Noeloa` preserved exactly) |

## Component System

Components resolve through the central registry (`src/components/brand-assets.ts`)
— never hard-coding asset URLs.

### `<NoeliaAvatar />`
- Renders the canonical identity face at all sizes.
- Size `xs`/`sm` → identity mark (`noelia-icon.svg`); `md`+ → the canonical portrait (`/NOELIA.png`).
- State indicator: `idle` · `thinking` · `processing` · `speaking` · `success` · `warning` · `error` · `offline`.
- Face never changes per state. Only status indicator (dot/badge) changes.
- Accessibility: `alt` default `"Noelia AI"`; `decorative` → `alt=""`; state announced via `role="status"` live region; animations `motion-safe:` guarded (`prefers-reduced-motion` → static).

### `<NoeliaPanel />`
- Identity presentation card: BEYU mark + "BEYU OS" anchor (top-left), Noelia labelled as governed assistant of the HIVE runtime (top-right), face, greeting, capability chips, "Ask Noelia" CTA.
- Footer states: advisory only; material decisions require human accountability.

### `<NoeliaStatus />`
- Compact status line: state dot + kicker label.
- Used in headers where avatar sits beside text (console, panels).

## State System

| State | Dot Color | Badge | Animation (motion-safe) | Description |
|---|---|---|---|---|
| `idle` | Sage `#4c6f4e` | — | Static | Available |
| `thinking` | Gold `#d4af37` | — | Slow pulse | Reasoning |
| `processing` | Gold `#d4af37` | — | Fast pulse | Working |
| `speaking` | Sky `#0ea5e9` | — | Sonar ring | Responding |
| `success` | Emerald `#059669` | ✓ | Static | Completed successfully |
| `warning` | Amber `#f59e0b` | ! | Static | Requires attention |
| `error` | Rose `#e11d48` | ✕ | Static | Encountered error |
| `offline` | Slate `#94a3b8` | — | Static, face desaturated | Offline |

## Cross-OS Visual Resolution

The context resolver (`src/lib/noelia/context-resolver.ts`) maps:

- `BEYU_OS` → `/public/noelia/canonical/noelia-beyu-os-canonical.png`
- `FINANCE_OS` → `/public/noelia/canonical/noelia-finance-os-canonical.png`
- `HEALTH_OS` → `/public/noelia/canonical/noelia-health-os-canonical.png`
- `AGRICULTURE_OS` → `/public/noelia/canonical/noelia-agriculture-os-canonical.png`
- `UJENZI_OS` → `/public/noelia/canonical/noelia-ai-canonical.png` (canonical fallback)
- `NOELIA_AI` / default → `/public/noelia/canonical/noelia-ai-canonical.png`

## Ujenzi OS and Professional Manifestation Asset Policy

- `UJENZI_OS is a Sector OS.`
- `Architectural and Engineering manifestations are governed contexts inside UJENZI_OS, not separate operating systems.`
- `Contextual appearance changes Noelia's visual manifestation without creating a new Noelia identity.`
- Authoritative Ujenzi-specific raster asset status:
  `UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.`
- The engine reuses the canonical Noelia fallback portrait (`noelia-ai`) without generating, recoloring, cropping, or synthesizing placeholder images.
- Architectural and Engineering manifestations are expressed through contextual metadata, labels, and specialized terminology alongside the canonical fallback portrait.

The original files (`Noelia AI .png`, etc.) remain intact at repo root. The
public copies are non-destructive presentation assets (same bytes, verified
by SHA-256). No source PNG was modified, recolored, cropped, or regenerated.

## Appearance & Personalization (browser-local)

How the canonical identity is *displayed* (avatar treatment, presence,
motion, greeting register, panel dock, notification presentation) is
configurable per browser in the Noelia assistant panel of the authenticated
BEYU OS shell. See `docs/noelia/NOELIA_APPEARANCE.md` for the canonical
model, persistence scope (browser-local fallback, never server persisted,
never tenant scoped) and the hard presentation-only boundary. Appearance
preferences are never an authorization input and never change the identity
itself.
