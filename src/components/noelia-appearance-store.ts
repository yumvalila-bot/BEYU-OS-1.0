"use client";

/**
 * Noelia appearance — browser-local preference store.
 *
 * Follows the existing BEYU DevicePreferences mechanism (device-preferences.ts)
 * exactly:
 *   • non-sensitive, presentation-only values in localStorage;
 *   • sanitized on every read and write via the canonical parser
 *     (`src/lib/noelia/appearance.ts` — fixed whitelist, strict schema);
 *   • never identity, role, tenant or administrative state;
 *   • never an authorization input (the server re-decides everything);
 *   • hydration-safe: the server and the first client render both use the
 *     fixed defaults, the stored value is applied after mount.
 *
 * Persistence scope (documented per Phase 2): browser-LOCAL fallback.
 * NOT server persisted, NOT tenant scoped, NOT user-synced. The colour mode
 * is shared with the existing BEYU device theme key so there is exactly one
 * theme mechanism in BEYU OS.
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  NOELIA_APPEARANCE_DEFAULTS,
  NOELIA_PERSISTED_KEYS,
  mergeNoeliaAppearance,
  parseNoeliaAppearance,
  serializeNoeliaAppearance,
  type NoeliaAppearancePreferences,
} from "@/lib/noelia/appearance";

export const NOELIA_APPEARANCE_KEY = "beyu.noelia.appearance";

/** Existing BEYU OS colour-mode key — shared, never duplicated. */
export const BEYU_DEVICE_THEME_KEY = "beyu.device.theme";
export const BEYU_DEVICE_THEME_CHANGE_EVENT = "beyu:device-preferences-changed";
export const NOELIA_APPEARANCE_CHANGE_EVENT = "beyu:noelia-appearance-changed";

function deviceThemeFromStorage(): NoeliaAppearancePreferences["themeMode"] {
  try {
    const value = window.localStorage.getItem(BEYU_DEVICE_THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

/**
 * Read the full appearance view: sanitized Noelia-owned fields merged with
 * the shared BEYU device theme. Corrupt or unknown content resolves to the
 * fixed defaults (fail-closed, never fabricated).
 */
export function readNoeliaAppearanceView(): NoeliaAppearancePreferences {
  if (typeof window === "undefined") return NOELIA_APPEARANCE_DEFAULTS;
  let saved: NoeliaAppearancePreferences = NOELIA_APPEARANCE_DEFAULTS;
  try {
    const raw = window.localStorage.getItem(NOELIA_APPEARANCE_KEY);
    if (raw) {
      const parsed = parseNoeliaAppearance(JSON.parse(raw));
      if (parsed.ok) saved = parsed.value;
    }
  } catch {
    saved = NOELIA_APPEARANCE_DEFAULTS;
  }
  return { ...saved, themeMode: deviceThemeFromStorage() };
}

function snapshotNoStore(): NoeliaAppearancePreferences {
  return NOELIA_APPEARANCE_DEFAULTS;
}

let cache: NoeliaAppearancePreferences | null = null;

function subscribeAppearance(onChange: () => void): () => void {
  cache = null;
  const onAppearanceChange = () => {
    cache = null;
    onChange();
  };
  const onThemeChange = (event: StorageEvent) => {
    if (event.key === BEYU_DEVICE_THEME_KEY || event.key === NOELIA_APPEARANCE_KEY) {
      cache = null;
      onChange();
    }
  };
  window.addEventListener(NOELIA_APPEARANCE_CHANGE_EVENT, onAppearanceChange);
  window.addEventListener(BEYU_DEVICE_THEME_CHANGE_EVENT, onAppearanceChange);
  window.addEventListener("storage", onThemeChange);
  return () => {
    window.removeEventListener(NOELIA_APPEARANCE_CHANGE_EVENT, onAppearanceChange);
    window.removeEventListener(BEYU_DEVICE_THEME_CHANGE_EVENT, onAppearanceChange);
    window.removeEventListener("storage", onThemeChange);
  };
}

function readSnapshot(): NoeliaAppearancePreferences {
  if (cache) return cache;
  cache = readNoeliaAppearanceView();
  return cache;
}

/**
 * React hook for Noelia appearance preferences.
 *
 * Hydration-safe: SSR and the hydration render both use the fixed defaults
 * (server snapshot); after hydration React switches to the sanitized stored
 * view and re-renders once. Updates propagate live across tabs via the
 * standard storage / custom change events.
 */
export function useNoeliaAppearance(): {
  prefs: NoeliaAppearancePreferences;
  update: (patch: Partial<NoeliaAppearancePreferences>) => boolean;
  reset: () => boolean;
} {
  const prefs = useSyncExternalStore(subscribeAppearance, readSnapshot, snapshotNoStore);

  const update = useCallback((patch: Partial<NoeliaAppearancePreferences>): boolean => {
    const next = mergeNoeliaAppearance(readNoeliaAppearanceView(), patch);
    try {
      window.localStorage.setItem(NOELIA_APPEARANCE_KEY, JSON.stringify(serializeNoeliaAppearance(next)));
      if (next.themeMode !== deviceThemeFromStorage()) {
        window.localStorage.setItem(BEYU_DEVICE_THEME_KEY, next.themeMode);
        window.dispatchEvent(new Event(BEYU_DEVICE_THEME_CHANGE_EVENT));
      }
      window.dispatchEvent(new Event(NOELIA_APPEARANCE_CHANGE_EVENT));
      return true;
    } catch {
      // Storage locked down: report failure to the caller instead of
      // claiming the preference was persisted (same contract as DevicePreferences).
      return false;
    }
  }, []);

  const reset = useCallback((): boolean => {
    try {
      window.localStorage.removeItem(NOELIA_APPEARANCE_KEY);
      window.localStorage.removeItem(BEYU_DEVICE_THEME_KEY);
      window.dispatchEvent(new Event(BEYU_DEVICE_THEME_CHANGE_EVENT));
      window.dispatchEvent(new Event(NOELIA_APPEARANCE_CHANGE_EVENT));
      return true;
    } catch {
      return false;
    }
  }, []);

  return { prefs, update, reset };
}
