# BEYU Brand Identity System

Central registry for the BEYU visual identity and the Noelia AI personalization
layer. This is the single source of truth for **how brand assets are stored,
referenced and replaced** — and the rules that keep the identity honest.

## 1. The hierarchy (never invert it)

```
BEYU            Institution / platform identity
 └─ BEYU OS     Operating and governance environment
     └─ HIVE    Governed AI runtime
         └─ NOELIA AI   Unified governed AI identity & interface
```

- The BEYU mark is the anchor of every surface (shell, sign-in, Noelia panel
  header, footers).
- Noelia is always presented **inside** BEYU OS context (mark + "BEYU OS"
  kicker + "HIVE · governed AI runtime" + governed-assistant indicator).
- Noelia never appears above BEYU, as BEYU itself, or as governance authority.
  The Noelia UI states the accountability boundary in plain language.

## 2. BEYU logo assets — `/public/brand/`

| File | Use |
| --- | --- |
| `beyu-logo.svg` | Primary lockup — light/neutral surfaces (default) |
| `beyu-logo-dark.svg` | Primary lockup, dark wordmark — light surfaces |
| `beyu-logo-light.svg` | Reversed lockup — **dark surfaces** (OS shell, sign-in) |
| `beyu-logo-mark.svg` | Canonical mark only (gold ring · navy "B" · sage tree) |
| `favicon.svg` | Browser tab / app tile (self-contained navy tile) |
| `beyu-app-icon.svg` / `-192.png` / `-512.png` | PWA / OS app icon |

**Replacing an asset:** overwrite the file in place (keep the path and the
`viewBox`). Every surface updates without a code change — components resolve
paths through `src/components/brand-assets.ts` and never embed the mark.

**Never** inline or re-copy the mark SVG in application code. The mark geometry
exists only in `/public/brand/*` (enforced by
`tests/frontend/brand-identity.test.ts`).

### `<BeyuLogo />`

```tsx
import { BeyuLogo } from "@/components/beyu-logo";

<BeyuLogo variant="full"  size={40} href="/os" />   // primary lockup, light surfaces
<BeyuLogo variant="light" size={40} href="/os" />   // reversed, dark surfaces (shell)
<BeyuLogo variant="dark"  size={40} />              // dark wordmark variant
<BeyuLogo variant="mark"  size={26} ariaLabel="BEYU" />
<BeyuLogo variant="mark"  size={18} decorative />   // alt="" — purely decorative
```

Props: `variant` (`full | mark | light | dark`), `size` (height in px),
`className`, `href` (wraps in a link), `ariaLabel` (defaults to "BEYU OS" /
"BEYU"), `decorative` (renders `alt=""`).

## 3. Noelia AI identity assets — `/public/noelia/`

| File | Use |
| --- | --- |
| `noelia-avatar.svg` | Canonical portrait — the single face, all sizes |
| `noelia-avatar.png` / `.webp` | Raster exports (1024px), rendered from the SVG |
| `noelia-icon.svg` | Identity mark for ≤ 32px (recognizable, never distorted) |
| `noelia-placeholder.svg` | Neutral fallback if the portrait cannot load |

### Noelia's fixed design system

Identity cues are fixed in `noelia-avatar.svg` and **never change per
state**: calm attentive gaze · warm composed smile · espresso hair, centre
part, low bun · warm medium skin · BEYU-navy blazer over ivory · gold studs
and lapel pin · ivory field with a thin gold ring. Only the **status
indicator** changes (see below). Do not re-draw her face for any state,
screen or season.

Palette (also `--noelia-*` tokens in `src/app/globals.css`):

| State | Color | Motion (motion-safe) |
| --- | --- | --- |
| `idle` | sage `#4c6f4e` | static |
| `thinking` | gold `#d4af37` | slow pulse |
| `processing` | gold `#d4af37` | fast pulse |
| `speaking` | sky `#0ea5e9` | sonar ring |
| `success` | emerald `#059669` | static + ✓ |
| `warning` | amber `#f59e0b` | static + ! |
| `error` | rose `#e11d48` | static + ✕ |
| `offline` | slate `#94a3b8` | static, face desaturated |

### `<NoeliaAvatar />`

```tsx
import { NoeliaAvatar } from "@/components/noelia-avatar";

<NoeliaAvatar size="sm" state="thinking" />
<NoeliaAvatar size="hero" state="idle" ariaLabel="Noelia AI" />
<NoeliaAvatar size="xs" state="idle" decorative />   // alt=""
```

- `size`: `xs sm md lg xl hero` (20–168px). `xs`/`sm` render the identity
  **mark**; `md`+ render the canonical portrait.
- `state`: the eight states above. The face never changes; the indicator dot
  does (color + motion + badge).
- Accessibility: default `alt="Noelia AI"`; `decorative` → `alt=""`; state is
  announced via a `role="status"` live region; animations are
  `motion-safe:` guarded (`prefers-reduced-motion` → static).

### `<NoeliaPanel />` and `<NoeliaStatus />`

`NoeliaPanel` is the identity presentation card: BEYU mark + "BEYU OS" anchor
(top-left), Noelia labelled as **governed assistant** of the HIVE runtime
(top-right), the face, greeting, capability chips, and the "Ask Noelia" CTA —
a plain link whose authority is decided by the existing `ai:noelia.query`
guard. The footer states: advisory only; material decisions require human
accountability.

## 4. Rules

1. **One mark, one face.** Logo SVG geometry lives only in `/public/brand/*`;
   the Noelia portrait only in `/public/noelia/*`. (Test-enforced.)
2. **No dark/light hard-coding.** Themed surfaces use the `--beyu-*` CSS
   variables; fixed-surface logos use the appropriate `light`/`dark` asset
   variant. Dark mode must keep every asset legible.
3. **Authorization is not identity.** Seeing or querying Noelia is decided by
   RBAC/ABAC/tenant scope and HIVE policy (`requireAccess("ai:noelia.query")`,
   `guarded(...)`). UI components grant nothing; they present.
4. **Small sizes use the mark.** Never scale the portrait below `md` (48px) —
   use `noelia-icon.svg` instead.
5. **No visual authority.** Noelia is never rendered as BEYU's constitutional
   or governance authority, and never above BEYU in the visual hierarchy.
