# NOELIA APPEARANCE & PERSONALIZATION (frontend)

Status: implemented (presentation layer). Supersedes nothing; complements
`NOELIA_VISUAL_SYSTEM.md` (identity + canonical assets) and
`NOELIA_PERSONALIZATION.md` (server-side, permission-aware personalization).

## What it is

A browser-local, presentation-only configuration for how the ONE canonical
Noelia identity is displayed inside the authenticated BEYU OS shell:

- shell entry (header on desktop, floating compact entry on mobile),
- Noelia assistant panel (right-docked or contextual; full-screen sheet on
  mobile),
- the Appearance section inside that panel.

Noelia remains the single governed BEYU AI identity:
**NOELIA · Governed BEYU AI · Intelligence • Governance • Care.**

## Canonical model

`src/lib/noelia/appearance.ts` — the single source of truth:

| Field | Values | Default |
|---|---|---|
| `avatarMode` | `full` · `compact` · `icon` | `full` |
| `presenceMode` | `full` · `avatar-status` · `minimal` | `full` |
| `visualMode` | `standard` · `compact-density` | `standard` |
| `motionEnabled` | boolean | `true` |
| `reducedMotion` | boolean (stricter override) | `false` |
| `greetingStyle` | `professional` · `warm` · `concise` | `professional` |
| `chatPosition` | `right-panel` · `contextual` | `right-panel` |
| `notificationPreference` | `important-only` · `all-permitted` · `off` | `important-only` |
| `voiceUiEnabled` | boolean (local read-aloud affordance) | `false` |
| `themeMode` | `system` · `light` · `dark` | `system` |

Parsing (`parseNoeliaAppearance`) is fail-closed with a fixed whitelist:
unknown fields — including credential-looking or authorization-looking keys —
are dropped, and any invalid value falls back to the canonical defaults
(never fabricated). `themeMode` is deliberately read through / written
through to the existing BEYU device theme preference (`beyu.device.theme`):
BEYU OS has exactly one colour-mode mechanism.

## Persistence — scope (Phase 2 documentation requirement)

- **Server persisted?** No.
- **Tenant scoped?** No.
- **User scoped?** Yes — scoped to the individual's browser profile only.
- **Local fallback?** Yes. This is the documented persistence mode: the
  browser-local fallback pattern established by the existing BEYU
  `DevicePreferences` mechanism, under the key `beyu.noelia.appearance`.

No database table was created. No secrets are ever stored: the serialized
payload is the fixed presentation whitelist only, sanitized on every read
and write (asserted by `tests/frontend/noelia-appearance.test.ts`).

## What appearance can and cannot change (Phase 5)

Allowed (presentation only): avatar display, layout/density, greeting
register, motion, notification presentation filtering, compact/full entry,
panel dock position, shared colour mode, local voice affordance.

Not allowed — and structurally impossible in this implementation:

- no changes to permissions, RBAC, ABAC, RLS, tenant isolation,
  classification ceilings, approval requirements, audit requirements or
  human-review requirements;
- the client shell (`src/components/noelia-shell.tsx`) imports no
  authorization code and no database handle — it only displays
  server-resolved facts (`canQuery`, `mfaSatisfied`, `providerMode`);
- every action still travels through the existing governed API boundary
  (`guarded()` → auth → RBAC/ABAC → tenant scope → policy → audit);
- appearance fields are rejected by the strict API schemas (422) and can
  never be smuggled into a governed request (covered by tests).

## Contextual Appearance Engine & Governed Professional Manifestations

Extending the presentation layer established in PR #78, Noelia dynamically resolves
contextual appearance based on the authoritative OS and professional context:

- **Single Identity Invariant:**
  `Contextual appearance changes Noelia's visual manifestation without creating a new Noelia identity.`
  The identity remains strictly `NOELIA_AI` across every OS and manifestation.
- **Canonical Sector OS:**
  `UJENZI_OS is a Sector OS.` It is a first-class Sector OS alongside Health OS, Finance OS, and Agriculture OS.
- **Governed Manifestations in Ujenzi:**
  `Architectural and Engineering manifestations are governed contexts inside UJENZI_OS, not separate operating systems.`
- **Asset Status & Fallback:**
  `UJENZI_OS contextual asset unavailable; canonical Noelia fallback active.`
  The canonical Noelia fallback portrait (`noelia-ai`) is displayed. No synthetic raster assets are generated.
- **Authorization Isolation:**
  Contextual appearance and professional manifestation selection are presentation-only.
  Selecting Architectural or Engineering manifestation inside Ujenzi OS never grants tool
  permissions, bypasses RBAC/ABAC/RLS, or elevates authority.

## Governed state indicator (Phase 7)

`resolveNoeliaGovernedState` (pure, server-driven inputs):

| State | Meaning |
|---|---|
| READY | available within the principal's authorization |
| RESTRICTED | can explain, cannot execute under current grants |
| REVIEW REQUIRED | human approval required for the output |
| AUTHORIZATION REQUIRED | additional permission / step-up required |
| UNAVAILABLE | underlying AI runtime unavailable |

Precedence: UNAVAILABLE > RESTRICTED > AUTHORIZATION_REQUIRED >
REVIEW_REQUIRED > READY. The client may only downgrade honesty (runtime
error → UNAVAILABLE), never upgrade it.

Honest provider capability: the repository ships the governed **deterministic
HIVE analyst** (`beyu-hive-deterministic-analyst`). A generative provider is
reported only when `NOELIA_GENERATIVE_ENDPOINT` **and**
`NOELIA_GENERATIVE_CREDENTIAL_REF` are configured — the same source of truth
as the Phase 5 status block, so the UI never presents Noelia as a live
generative provider when she is not.

## Assets (Phase 1)

Only the canonical registry is used (`src/components/brand-assets.ts`):
the canonical portrait (`/NOELIA.png`), the identity mark
(`/noelia/noelia-icon.svg`) for icon mode, and the SHA-256-pinned canonical
PNG set for the cross-OS surfaces. No asset was redrawn, regenerated,
recoloured, cropped destructively or replaced. Where a component needs a
treatment (e.g. offline desaturation), it is a non-destructive CSS wrapper.

## Accessibility (Phase 10)

Keyboard-operable entry and panel (Escape closes, focus trapped and
restored), ARIA dialog + tabs + live regions, accessible avatar alternative
text, visible focus states, radio groups in labelled fieldsets, switch
controls announcing on/off text (never colour alone), and reduced-motion
support both via `prefers-reduced-motion` (OS-wide, existing) and the
scoped `.noelia-motion-off` Noelia preference.

## Tests

- `tests/frontend/noelia-appearance.test.ts` — pure: canonical identity,
  fail-closed parsing, presentation resolution, governed-state vocabulary,
  honest provider labels, reset, architecture invariants (no authority in
  the shell, no secrets in the store, no duplicate OS, canonical assets).
- `tests/frontend/noelia-shell-http.test.ts` — HTTP/E2E against the running
  server: entry rendering per principal, RESTRICTED honesty, no additional
  OS, appearance cannot alter authorization, forged-tenant fail-closed.
