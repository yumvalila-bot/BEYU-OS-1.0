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

## Canonical Image Registry

The five authoritative PNG assets (supplied by the BEYU Family Trust) are
preserved exactly — never redrawn, regenerated, recolored, cropped
destructively, distorted, or overwritten.

| Logical ID | Canonical Filename (repo root) | Context Mapping | SHA-256 | Status | Notes |
|---|---|---|---|---|---|
| `noelia-ai` | `Noelia AI .png` | `NOELIA_AI` (general) | `12542aef...` | PRESERVED | Canonical portrait. Never modified. |
| `noelia-beyu-os` | `Noelia BEYU OS.png` | `BEYU_OS` | `4f61c918...` | PRESERVED | Control-plane manifestation. Never modified. |
| `noelia-finance-os` | `Noelia Finance os.png` | `FINANCE_OS` | `2eb029f1...` | PRESERVED | Finance OS manifestation. Never modified. |
| `noelia-health-os` | `Noelia Health os.png` | `HEALTH_OS` | `6a63d103...` | PRESERVED | Health OS manifestation. Never modified. |
| `noelia-agriculture` | `Noeloa Agriculture OS.png` | `AGRICULTURE_OS` | `14ea902f...` | PRESERVED | Agriculture OS manifestation. Original filename preserved exactly (`Noeloa`). Never renamed, deleted, or regenerated. |

Public presentation copies (non-destructive derived assets):

```
public/noelia/canonical/
  noelia-ai-canonical.png
  noelia-beyu-os-canonical.png
  noelia-finance-os-canonical.png
  noelia-health-os-canonical.png
  noelia-agriculture-os-canonical.png
```

## Component System

Components resolve through the central registry (`src/components/brand-assets.ts`)
— never hard-coding asset URLs.

### `<NoeliaAvatar />`
- Renders the canonical identity face at all sizes.
- Size `xs`/`sm` → identity mark (`noelia-icon.svg`); `md`+ → canonical portrait (`noelia-avatar.svg` or canonical PNG).
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
- `NOELIA_AI` / default → `/public/noelia/canonical/noelia-ai-canonical.png`

The original files (`Noelia AI .png`, etc.) remain intact at repo root. The
public copies are non-destructive presentation assets (same bytes, verified
by SHA-256). No source PNG was modified, recolored, cropped, or regenerated.
