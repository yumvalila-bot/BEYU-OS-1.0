/**
 * NOELIA APPEARANCE & PERSONALIZATION — canonical model.
 *
 * Presentation ONLY.
 *
 * This module defines the single canonical shape of Noelia's appearance
 * preferences, their defaults, their parsing/sanitization rules and the
 * governed-state vocabulary shown by every Noelia surface.
 *
 * Hard boundaries (mirrors docs/noelia/NOELIA_SECURITY_MODEL.md):
 *   • Appearance preferences NEVER become an authorization input. No function
 *     in this module reads a Principal, calls `can()`, queries the database or
 *     influences RBAC, ABAC, RLS, tenant isolation, classification ceilings,
 *     approval requirements, audit requirements or human-review requirements.
 *   • Appearance preferences NEVER contain or accept secrets. Parsing strips
 *     every field outside the fixed presentation whitelist, so a forged or
 *     tampered preference payload cannot smuggle credentials, tokens or
 *     authorization claims into storage or rendering.
 *   • Persistence is a browser-LOCAL fallback (the existing BEYU
 *     DevicePreferences mechanism, key `beyu.noelia.appearance`). Preferences
 *     are NOT server persisted, NOT tenant scoped and NOT synced across
 *     devices. The OS-level colour mode is deliberately shared with the
 *     existing BEYU device theme setting rather than duplicated.
 *
 * Noelia's identity is fixed by NOELIA_DISPLAY_IDENTITY and the canonical
 * asset registry (`src/components/brand-assets.ts`); appearance preferences
 * change how that identity is presented, never who/what it is.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Fixed display identity — canonical, never user-editable.            */
/* ------------------------------------------------------------------ */

export const NOELIA_DISPLAY_IDENTITY = {
  /** Name as presented. Fixed by the canonical identity contract. */
  name: "NOELIA",
  /** Subtitle under the name. Fixed by the canonical identity contract. */
  subtitle: "Governed BEYU AI",
  /** Motto. Fixed by the canonical identity contract. */
  motto: "Intelligence • Governance • Care.",
} as const;

/* ------------------------------------------------------------------ */
/* Appearance preference model (presentation-only whitelist).          */
/* ------------------------------------------------------------------ */

export type NoeliaAvatarMode = "full" | "compact" | "icon";
export type NoeliaPresenceMode = "full" | "avatar-status" | "minimal";
export type NoeliaVisualMode = "standard" | "compact-density";
export type NoeliaGreetingStyle = "professional" | "warm" | "concise";
export type NoeliaChatPosition = "right-panel" | "contextual";
export type NoeliaNotificationPreference = "important-only" | "all-permitted" | "off";
export type NoeliaThemeMode = "system" | "light" | "dark";

export interface NoeliaAppearancePreferences {
  /** Portrait treatment: full portrait, compact portrait, or identity mark. */
  avatarMode: NoeliaAvatarMode;
  /** How much of Noelia's presence the shell entry shows. */
  presenceMode: NoeliaPresenceMode;
  /** Panel visual density. */
  visualMode: NoeliaVisualMode;
  /** Non-essential Noelia animation on this device. */
  motionEnabled: boolean;
  /** Stricter reduced-motion override for Noelia surfaces. */
  reducedMotion: boolean;
  /** Greeting register inside the assistant panel. */
  greetingStyle: NoeliaGreetingStyle;
  /** Where the assistant panel docks. */
  chatPosition: NoeliaChatPosition;
  /** Which Noelia-originated notices are surfaced. Presentation filtering
     only — the governed notification stream itself is unchanged. */
  notificationPreference: NoeliaNotificationPreference;
  /** Show the local "read aloud" affordance (device speech synthesis only). */
  voiceUiEnabled: boolean;
  /** OS colour mode — shared with the existing BEYU device theme setting;
     never a second theme system. */
  themeMode: NoeliaThemeMode;
}

export const NOELIA_APPEARANCE_DEFAULTS: NoeliaAppearancePreferences = {
  avatarMode: "full",
  presenceMode: "full",
  visualMode: "standard",
  motionEnabled: true,
  reducedMotion: false,
  greetingStyle: "professional",
  chatPosition: "right-panel",
  notificationPreference: "important-only",
  voiceUiEnabled: false,
  themeMode: "system",
};

/**
 * Fields owned by the Noelia appearance store. `themeMode` is intentionally
 * NOT in this set: it is read through and written through to the existing
 * BEYU device theme preference (`beyu.device.theme`), so BEYU OS has exactly
 * one colour-mode mechanism.
 */
export const NOELIA_PERSISTED_KEYS = [
  "avatarMode",
  "presenceMode",
  "visualMode",
  "motionEnabled",
  "reducedMotion",
  "greetingStyle",
  "chatPosition",
  "notificationPreference",
  "voiceUiEnabled",
] as const;

export type NoeliaPersistedPreferences = Pick<
  NoeliaAppearancePreferences,
  (typeof NOELIA_PERSISTED_KEYS)[number]
>;

const avatarModeSchema = z.enum(["full", "compact", "icon"]);
const presenceModeSchema = z.enum(["full", "avatar-status", "minimal"]);
const visualModeSchema = z.enum(["standard", "compact-density"]);
const greetingStyleSchema = z.enum(["professional", "warm", "concise"]);
const chatPositionSchema = z.enum(["right-panel", "contextual"]);
const notificationPreferenceSchema = z.enum(["important-only", "all-permitted", "off"]);
const themeModeSchema = z.enum(["system", "light", "dark"]);

const persistedSchema = z
  .object({
    avatarMode: avatarModeSchema,
    presenceMode: presenceModeSchema,
    visualMode: visualModeSchema,
    motionEnabled: z.boolean(),
    reducedMotion: z.boolean(),
    greetingStyle: greetingStyleSchema,
    chatPosition: chatPositionSchema,
    notificationPreference: notificationPreferenceSchema,
    voiceUiEnabled: z.boolean(),
  })
  .strict();

const fullSchema = persistedSchema.extend({ themeMode: themeModeSchema }).strict();

export type NoeliaAppearanceParseResult =
  | { ok: true; value: NoeliaAppearancePreferences; changed: boolean }
  | { ok: false; reason: string };

/**
 * Parse and sanitize an untrusted appearance payload (e.g. from browser
 * storage) into the canonical model.
 *
 * Fail-closed, per the personalization doctrine ("never invent preferences"):
 * any unknown field, wrong type or out-of-whitelist value makes the parse
 * fail and the caller falls back to defaults. Unknown fields are never
 * echoed back, so secrets or authorization-looking keys can never persist.
 */
export function parseNoeliaAppearance(input: unknown): NoeliaAppearanceParseResult {
  const full = fullSchema.safeParse(
    input && typeof input === "object" ? { ...NOELIA_APPEARANCE_DEFAULTS, ...(input as object) } : input,
  );
  if (full.success) return { ok: true, value: full.data, changed: false };

  const persisted = persistedSchema.safeParse(
    input && typeof input === "object"
      ? Object.fromEntries(
          Object.entries(input as Record<string, unknown>).filter(([key]) =>
            NOELIA_PERSISTED_KEYS.includes(key as (typeof NOELIA_PERSISTED_KEYS)[number]),
          ),
        )
      : input,
  );
  if (persisted.success) {
    const value: NoeliaAppearancePreferences = { ...NOELIA_APPEARANCE_DEFAULTS, ...persisted.data };
    return { ok: true, value, changed: true };
  }

  return { ok: false, reason: "appearance payload rejected: fixed presentation defaults used" };
}

/** Canonical JSON serialization of the persisted (Noelia-owned) subset. */
export function serializeNoeliaAppearance(
  prefs: NoeliaAppearancePreferences,
): Record<(typeof NOELIA_PERSISTED_KEYS)[number], string | boolean> {
  return {
    avatarMode: prefs.avatarMode,
    presenceMode: prefs.presenceMode,
    visualMode: prefs.visualMode,
    motionEnabled: prefs.motionEnabled,
    reducedMotion: prefs.reducedMotion,
    greetingStyle: prefs.greetingStyle,
    chatPosition: prefs.chatPosition,
    notificationPreference: prefs.notificationPreference,
    voiceUiEnabled: prefs.voiceUiEnabled,
  };
}

export function mergeNoeliaAppearance(
  current: NoeliaAppearancePreferences,
  patch: Partial<NoeliaAppearancePreferences>,
): NoeliaAppearancePreferences {
  return { ...current, ...patch };
}

/* ------------------------------------------------------------------ */
/* Governed state vocabulary (Phase 7 — honest AI state indicator).    */
/* ------------------------------------------------------------------ */

export type NoeliaGovernedState =
  | "READY"
  | "RESTRICTED"
  | "REVIEW_REQUIRED"
  | "AUTHORIZATION_REQUIRED"
  | "UNAVAILABLE";

export const NOELIA_STATE_PRESENTATION: Record<
  NoeliaGovernedState,
  { label: string; description: string; tone: "sage" | "amber" | "gold" | "sky" | "slate" }
> = {
  READY: {
    label: "READY",
    description: "Noelia is available within your current authorization.",
    tone: "sage",
  },
  RESTRICTED: {
    label: "RESTRICTED",
    description:
      "Noelia can explain, but cannot execute the requested operation under your current grants.",
    tone: "amber",
  },
  REVIEW_REQUIRED: {
    label: "REVIEW REQUIRED",
    description: "Human approval is required before this output may be relied upon.",
    tone: "gold",
  },
  AUTHORIZATION_REQUIRED: {
    label: "AUTHORIZATION REQUIRED",
    description: "Additional permission or step-up authentication is required.",
    tone: "sky",
  },
  UNAVAILABLE: {
    label: "UNAVAILABLE",
    description: "The underlying AI runtime is unavailable.",
    tone: "slate",
  },
};

export interface NoeliaStateInput {
  /** ai:noelia.query resolved server-side for THIS principal. */
  canQuery: boolean;
  /** Session MFA posture, resolved server-side. */
  mfaSatisfied: boolean;
  /** Governed HIVE runtime reachable (server-resolved). */
  runtimeAvailable: boolean;
  /** The runtime just produced an output requiring human review. */
  reviewRequired?: boolean;
}

/**
 * Pure, server-driven resolution of the governed state shown by Noelia
 * surfaces. The frontend may only DISPLAY the result; it can never set it.
 *
 * Precedence: UNAVAILABLE > RESTRICTED > AUTHORIZATION_REQUIRED >
 * REVIEW_REQUIRED > READY. A missing grant always wins over a step-up
 * question — the user must not be asked for MFA for an operation they are
 * not entitled to attempt.
 */
export function resolveNoeliaGovernedState(input: NoeliaStateInput): NoeliaGovernedState {
  if (!input.runtimeAvailable) return "UNAVAILABLE";
  if (!input.canQuery) return "RESTRICTED";
  if (!input.mfaSatisfied) return "AUTHORIZATION_REQUIRED";
  if (input.reviewRequired) return "REVIEW_REQUIRED";
  return "READY";
}

/* ------------------------------------------------------------------ */
/* Honest provider capability (Phase 7).                               */
/* ------------------------------------------------------------------ */

export type NoeliaProviderMode = "DETERMINISTIC_ANALYST" | "GENERATIVE_CONFIGURED";

/**
 * The repository ships the governed deterministic HIVE analyst. A real
 * generative runtime only exists if `NOELIA_GENERATIVE_ENDPOINT` (and its
 * credential ref) are configured — the same source of truth as the Phase 5
 * status block, so the UI can never present Noelia as a live generative
 * provider when she is not.
 */
/** Structural env view (accepts `process.env` and test literals). */
export type NoeliaEnvView = {
  [key: string]: string | undefined;
  NOELIA_GENERATIVE_ENDPOINT?: string | undefined;
  NOELIA_GENERATIVE_CREDENTIAL_REF?: string | undefined;
};

export function noeliaProviderModeFromEnvironment(env: NoeliaEnvView = process.env): NoeliaProviderMode {
  return env.NOELIA_GENERATIVE_ENDPOINT && env.NOELIA_GENERATIVE_CREDENTIAL_REF
    ? "GENERATIVE_CONFIGURED"
    : "DETERMINISTIC_ANALYST";
}

export function noeliaProviderCapabilityLabel(mode: NoeliaProviderMode): string {
  return mode === "GENERATIVE_CONFIGURED"
    ? "HIVE runtime · configured generative provider"
    : "HIVE runtime · deterministic governed analyst (no generative provider configured)";
}

/* ------------------------------------------------------------------ */
/* Presentation resolution — the only thing preferences influence.     */
/* ------------------------------------------------------------------ */

export interface NoeliaPresentation {
  /** Avatar pixel diameter for the shell entry. */
  entryAvatarPx: number;
  /** Use the identity mark instead of the portrait at entry size. */
  entryUsesMark: boolean;
  /** Whether the entry shows the "Noelia / Governed AI" text block. */
  entryShowsText: boolean;
  /** Whether the entry shows the governed-state chip. */
  entryShowsState: boolean;
  /** Panel density class hook. */
  panelDensity: "standard" | "compact";
  /** CSS class hook for Noelia motion (see globals.css). */
  motionClass: "noelia-motion-on" | "noelia-motion-off";
  /** Greeting line for the assistant panel. */
  greeting: (principalName?: string | null) => string;
  /** Dock position of the assistant panel. */
  panelPosition: "right-panel" | "contextual";
  /** Whether the local read-aloud affordance is shown. */
  voiceAffordance: boolean;
  /** Which Noelia-originated notices are surfaced (presentation filter). */
  notificationFilter: "important-only" | "all-permitted" | "off";
}

const GREETING_TEMPLATES: Record<NoeliaGreetingStyle, (name?: string | null) => string> = {
  professional: (name) =>
    name ? `Good day, ${name}. I am Noelia — how may I assist within your authorization?` : "Good day. I am Noelia — how may I assist within your authorization?",
  warm: (name) =>
    name ? `Hello, ${name}. I'm Noelia, here to help within your authorization. What would you like to look at?` : "Hello. I'm Noelia, here to help within your authorization. What would you like to look at?",
  concise: (name) =>
    name ? `Hi ${name}. Ask me anything inside your grants.` : "Hi. Ask me anything inside your grants.",
};

/**
 * Resolve the concrete presentation for a set of appearance preferences.
 * Deterministic and pure: the same preferences always produce the same
 * presentation, and only presentation values (sizing, labels, motion,
 * layout) are returned — never authorization state.
 */
export function resolveNoeliaPresentation(
  prefs: NoeliaAppearancePreferences,
  opts?: { prefersReducedMotion?: boolean },
): NoeliaPresentation {
  const motionOff =
    prefs.reducedMotion || !prefs.motionEnabled || Boolean(opts?.prefersReducedMotion);

  return {
    entryAvatarPx: prefs.avatarMode === "icon" ? 20 : prefs.avatarMode === "compact" ? 26 : 32,
    entryUsesMark: prefs.avatarMode === "icon",
    // full → avatar + name + "Governed AI" + state; avatar-status → avatar +
    // state dot only; minimal → the face alone, quiet by design.
    entryShowsText: prefs.presenceMode === "full",
    entryShowsState: prefs.presenceMode === "full" || prefs.presenceMode === "avatar-status",
    panelDensity: prefs.visualMode === "compact-density" ? "compact" : "standard",
    motionClass: motionOff ? "noelia-motion-off" : "noelia-motion-on",
    greeting: GREETING_TEMPLATES[prefs.greetingStyle],
    panelPosition: prefs.chatPosition,
    voiceAffordance: prefs.voiceUiEnabled,
    notificationFilter: prefs.notificationPreference,
  };
}

/* ------------------------------------------------------------------ */
/* Safety assertions used by tests and code review.                     */
/* ------------------------------------------------------------------ */

/**
 * The complete set of keys that may ever appear in a persisted Noelia
 * appearance payload. Anything else — including credential-looking names —
 * is rejected by `parseNoeliaAppearance` and dropped here.
 */
export function noeliaAppearanceStorageKeys(): readonly string[] {
  return [...NOELIA_PERSISTED_KEYS, "themeMode"];
}
