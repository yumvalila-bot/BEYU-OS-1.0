"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "./icons";

const THEME_KEY = "beyu.device.theme";
const MOTION_KEY = "beyu.device.motion";
const CHANGE_EVENT = "beyu:device-preferences-changed";

export type DeviceTheme = "system" | "light" | "dark";
export type DeviceMotion = "system" | "reduce";

function storedTheme(): DeviceTheme {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function storedMotion(): DeviceMotion {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "reduce"
      ? "reduce"
      : "system";
  } catch {
    return "system";
  }
}

function applyDevicePreferences() {
  const theme = storedTheme();
  const useDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", useDark);
  document.documentElement.classList.toggle(
    "beyu-reduce-motion",
    storedMotion() === "reduce",
  );
  document.documentElement.dataset.beyuTheme = theme;
  document.documentElement.style.colorScheme = useDark ? "dark" : "light";
}

/**
 * Applies non-sensitive, browser-local appearance and motion preferences on
 * every frontend route. No identity, role, tenant or administrative state is
 * stored here and these preferences never become authorization inputs.
 */
export function DevicePreferenceInitializer() {
  useEffect(() => {
    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemThemeChange = () => {
      if (storedTheme() === "system") applyDevicePreferences();
    };
    const onStoredPreferenceChange = (event: StorageEvent) => {
      if (event.key === THEME_KEY || event.key === MOTION_KEY)
        applyDevicePreferences();
    };

    applyDevicePreferences();
    colorScheme.addEventListener("change", onSystemThemeChange);
    window.addEventListener("storage", onStoredPreferenceChange);
    window.addEventListener(CHANGE_EVENT, applyDevicePreferences);
    return () => {
      colorScheme.removeEventListener("change", onSystemThemeChange);
      window.removeEventListener("storage", onStoredPreferenceChange);
      window.removeEventListener(CHANGE_EVENT, applyDevicePreferences);
    };
  }, []);

  return null;
}

function savePreference(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    return true;
  } catch {
    // A locked-down browser can reject storage. The caller reports that
    // outcome instead of claiming the preference was persisted.
    return false;
  }
}

function subscribePreferences(onStoreChange: () => void) {
  const onPreferenceChange = () => onStoreChange();
  const onStorageChange = (event: StorageEvent) => {
    if (event.key === THEME_KEY || event.key === MOTION_KEY) onStoreChange();
  };
  window.addEventListener(CHANGE_EVENT, onPreferenceChange);
  window.addEventListener("storage", onStorageChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onPreferenceChange);
    window.removeEventListener("storage", onStorageChange);
  };
}

const themeOptions: Array<{
  value: DeviceTheme;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "Use device setting",
    description: "Follow the operating system colour preference.",
  },
  {
    value: "light",
    label: "Light",
    description: "Use light enterprise surfaces on this browser.",
  },
  {
    value: "dark",
    label: "Dark",
    description: "Use the existing BEYU dark-surface tokens.",
  },
];

const motionOptions: Array<{
  value: DeviceMotion;
  label: string;
  description: string;
}> = [
  {
    value: "system",
    label: "Use device setting",
    description: "Respect the browser's reduced-motion preference.",
  },
  {
    value: "reduce",
    label: "Reduce motion",
    description:
      "Suppress non-essential animation and transitions on this browser.",
  },
];

/** Real device-local settings; intentionally not an account/admin control. */
export function DevicePreferences() {
  const theme = useSyncExternalStore(
    subscribePreferences,
    storedTheme,
    () => "system",
  );
  const motion = useSyncExternalStore(
    subscribePreferences,
    storedMotion,
    () => "system",
  );
  const [announcement, setAnnouncement] = useState("");

  function updateTheme(value: DeviceTheme) {
    const saved = savePreference(THEME_KEY, value);
    setAnnouncement(
      saved
        ? `Appearance set to ${themeOptions.find((option) => option.value === value)?.label}.`
        : "Appearance could not be stored in this browser; the existing setting remains active.",
    );
  }

  function updateMotion(value: DeviceMotion) {
    const saved = savePreference(MOTION_KEY, value);
    setAnnouncement(
      saved
        ? `Motion preference set to ${motionOptions.find((option) => option.value === value)?.label}.`
        : "Motion preference could not be stored in this browser; the existing setting remains active.",
    );
  }

  function reset() {
    try {
      window.localStorage.removeItem(THEME_KEY);
      window.localStorage.removeItem(MOTION_KEY);
      window.dispatchEvent(new Event(CHANGE_EVENT));
      setAnnouncement(
        "Device appearance and motion preferences reset to system settings.",
      );
    } catch {
      setAnnouncement(
        "Device preferences could not be reset because browser storage is unavailable.",
      );
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section
        id="appearance"
        aria-labelledby="appearance-heading"
        className="beyu-panel scroll-mt-24 p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d4a017]/35 bg-[#d4a017]/10 text-[#8a6d10] dark:text-[#efd98f]">
            <Icon name="command" className="h-5 w-5" />
          </span>
          <div>
            <div className="beyu-kicker text-[#b08d1c]">Appearance</div>
            <h2
              id="appearance-heading"
              className="mt-1 text-[15px] font-semibold"
            >
              Colour mode
            </h2>
            <p className="mt-1 text-[11.5px] beyu-muted">
              Uses the existing BEYU theme tokens; it never recolours the
              canonical logo.
            </p>
          </div>
        </div>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Choose colour mode</legend>
          {themeOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-3 has-[:checked]:border-[#d4a017]/70 has-[:checked]:bg-[#d4a017]/5"
            >
              <input
                type="radio"
                name="beyu-device-theme"
                value={option.value}
                checked={theme === option.value}
                onChange={() => updateTheme(option.value)}
                className="mt-0.5 accent-[#0b1f4d]"
              />
              <span>
                <span className="block text-[12.5px] font-semibold">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] beyu-muted">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      </section>

      <section
        id="accessibility"
        aria-labelledby="accessibility-heading"
        className="beyu-panel scroll-mt-24 p-5"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#d4a017]/35 bg-[#d4a017]/10 text-[#8a6d10] dark:text-[#efd98f]">
            <Icon name="accessibility" className="h-5 w-5" />
          </span>
          <div>
            <div className="beyu-kicker text-[#b08d1c]">Accessibility</div>
            <h2
              id="accessibility-heading"
              className="mt-1 text-[15px] font-semibold"
            >
              Motion preference
            </h2>
            <p className="mt-1 text-[11.5px] beyu-muted">
              This device-only preference changes presentation, never
              permissions or governed data.
            </p>
          </div>
        </div>
        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Choose motion preference</legend>
          {motionOptions.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-3 has-[:checked]:border-[#d4a017]/70 has-[:checked]:bg-[#d4a017]/5"
            >
              <input
                type="radio"
                name="beyu-device-motion"
                value={option.value}
                checked={motion === option.value}
                onChange={() => updateMotion(option.value)}
                className="mt-0.5 accent-[#0b1f4d]"
              />
              <span>
                <span className="block text-[12.5px] font-semibold">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] beyu-muted">
                  {option.description}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px] font-semibold transition hover:border-[#d4a017]/60 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset device preferences
        </button>
      </section>

      <p className="xl:col-span-2 text-[11px] beyu-muted">
        Appearance and accessibility choices are stored only in this browser.
        They are not account, tenant or administrative settings and are never
        used for authorization.
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
