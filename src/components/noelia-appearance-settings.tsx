"use client";

/**
 * Noelia Appearance & Personalization — settings surface.
 *
 * Presentation controls ONLY. Every option here changes how the canonical
 * Noelia identity is displayed on this device; none of them is an
 * authorization input, none is server persisted, and none can change RBAC,
 * ABAC, RLS, tenant isolation, classification ceilings, approval or audit
 * requirements. The storage contract is documented in
 * `src/components/noelia-appearance-store.ts` and enforced (fail-closed,
 * fixed whitelist) by `parseNoeliaAppearance` in `src/lib/noelia/appearance.ts`.
 */

import { useState } from "react";
import type { NoeliaAppearancePreferences } from "@/lib/noelia/appearance";
import { NOELIA_DISPLAY_IDENTITY } from "@/lib/noelia/appearance";
import { useNoeliaAppearance } from "./noelia-appearance-store";

type Option<T extends string> = { value: T; label: string; description?: string };

function RadioGroup<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
}: {
  legend: string;
  name: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="border-0 p-0">
      <legend className="beyu-kicker mb-1.5 text-[#8a6d10] dark:text-[#efd98f]">{legend}</legend>
      <div className="space-y-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex cursor-pointer items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-[12px] transition hover:border-[color:var(--beyu-line)] has-[:checked]:border-[#d4a017]/50 has-[:checked]:bg-[#d4a017]/5"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="h-3.5 w-3.5 accent-[#0b1f4d]"
            />
            <span className="font-medium">{option.label}</span>
            {option.description && (
              <span className="ml-auto hidden text-right text-[10.5px] beyu-muted sm:block">
                {option.description}
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  legend,
  checked,
  onChange,
  description,
}: {
  legend: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  description?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-1.5 transition hover:border-[color:var(--beyu-line)]">
      <span>
        <span className="block text-[12px] font-medium">{legend}</span>
        {description && <span className="mt-0.5 block text-[10.5px] beyu-muted">{description}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${legend}: ${checked ? "on" : "off"}`}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37] ${
          checked ? "border-[#0b1f4d] bg-[#0b1f4d]" : "border-[color:var(--beyu-line)] bg-[color:var(--beyu-card)]"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute h-3.5 w-3.5 rounded-full transition ${
            checked ? "left-[18px] bg-[#d4af37]" : "left-[3px] bg-[color:var(--beyu-line)]"
          }`}
        />
        <span className="sr-only">{checked ? "on" : "off"}</span>
      </button>
    </div>
  );
}

/**
 * The Noelia Appearance section. Renders the canonical identity header, the
 * presentation options and the reset control, with a polite live region for
 * every change so assistive technology is informed without colour cues.
 */
export function NoeliaAppearanceSettings() {
  const { prefs, update, reset } = useNoeliaAppearance();
  const [announcement, setAnnouncement] = useState("");
  const [storageWarning, setStorageWarning] = useState(false);

  function apply(patch: Partial<NoeliaAppearancePreferences>, message: string) {
    const saved = update(patch);
    setStorageWarning(!saved);
    setAnnouncement(saved ? message : "Change could not be saved in this browser; the previous setting remains active.");
  }

  return (
    <div className="noelia-settings space-y-4">
      <header className="rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2.5">
        <div className="text-[12.5px] font-semibold tracking-[0.18em] text-[#8a6d10] dark:text-[#efd98f]">
          {NOELIA_DISPLAY_IDENTITY.name}
        </div>
        <div className="mt-0.5 text-[11px] beyu-muted">
          {NOELIA_DISPLAY_IDENTITY.subtitle} · {NOELIA_DISPLAY_IDENTITY.motto}
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <RadioGroup
          legend="Avatar"
          name="noelia-avatar-mode"
          value={prefs.avatarMode}
          onChange={(value) => apply({ avatarMode: value }, `Avatar set to ${value}.`)}
          options={[
            { value: "full", label: "Full" },
            { value: "compact", label: "Compact" },
            { value: "icon", label: "Icon" },
          ]}
        />
        <RadioGroup
          legend="Presence"
          name="noelia-presence-mode"
          value={prefs.presenceMode}
          onChange={(value) => apply({ presenceMode: value }, `Presence set to ${value}.`)}
          options={[
            { value: "full", label: "Full presence" },
            { value: "avatar-status", label: "Avatar + status" },
            { value: "minimal", label: "Minimal" },
          ]}
        />
      </div>

      <div className="space-y-1 rounded-lg border border-[color:var(--beyu-line)] p-1">
        <Toggle
          legend="Motion"
          description="Non-essential Noelia animation on this device."
          checked={prefs.motionEnabled}
          onChange={(value) => apply({ motionEnabled: value }, `Motion ${value ? "on" : "off"}.`)}
        />
        <Toggle
          legend="Reduced motion"
          description="Stricter override: also suppresses state-indicator animation."
          checked={prefs.reducedMotion}
          onChange={(value) => apply({ reducedMotion: value }, `Reduced motion ${value ? "on" : "off"}.`)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <RadioGroup
          legend="Greeting"
          name="noelia-greeting-style"
          value={prefs.greetingStyle}
          onChange={(value) => apply({ greetingStyle: value }, `Greeting set to ${value}.`)}
          options={[
            { value: "professional", label: "Professional" },
            { value: "warm", label: "Warm" },
            { value: "concise", label: "Concise" },
          ]}
        />
        <RadioGroup
          legend="Position"
          name="noelia-chat-position"
          value={prefs.chatPosition}
          onChange={(value) => apply({ chatPosition: value }, `Panel position set to ${value}.`)}
          options={[
            { value: "right-panel", label: "Right panel" },
            { value: "contextual", label: "Contextual panel" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <RadioGroup
          legend="Notifications"
          name="noelia-notification-preference"
          value={prefs.notificationPreference}
          onChange={(value) => apply({ notificationPreference: value }, `Notifications set to ${value}.`)}
          options={[
            { value: "important-only", label: "Important only", description: "Reviews, denials, errors" },
            { value: "all-permitted", label: "All permitted" },
            { value: "off", label: "Off" },
          ]}
        />
        <RadioGroup
          legend="Colour mode (BEYU OS shared setting)"
          name="noelia-theme-mode"
          value={prefs.themeMode}
          onChange={(value) => apply({ themeMode: value }, `Colour mode set to ${value}.`)}
          options={[
            { value: "system", label: "Use device setting" },
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <RadioGroup
          legend="Layout density"
          name="noelia-visual-mode"
          value={prefs.visualMode}
          onChange={(value) => apply({ visualMode: value }, `Density set to ${value}.`)}
          options={[
            { value: "standard", label: "Standard" },
            { value: "compact-density", label: "Compact" },
          ]}
        />
        <div className="rounded-lg border border-[color:var(--beyu-line)] p-1">
          <Toggle
            legend="Voice UI"
            description="Show the local “read aloud” control (this device only)."
            checked={prefs.voiceUiEnabled}
            onChange={(value) => apply({ voiceUiEnabled: value }, `Voice UI ${value ? "on" : "off"}.`)}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => {
            const saved = reset();
            setStorageWarning(!saved);
            setAnnouncement(
              saved
                ? "Noelia appearance restored to defaults."
                : "Defaults could not be restored because browser storage is unavailable.",
            );
          }}
          className="rounded-lg border border-[#d4a017]/60 px-3.5 py-2 text-[11.5px] font-semibold transition hover:bg-[#d4a017]/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
        >
          Restore Noelia Defaults
        </button>
        {storageWarning && (
          <span className="text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
            Browser storage unavailable — changes are not persisted.
          </span>
        )}
      </div>

      <p className="text-[10.5px] leading-relaxed beyu-muted">
        Appearance choices are stored only in this browser (local fallback). They are presentation
        only: they are not server persisted, not tenant scoped, and are never used for
        authorization, audit or governance decisions.
      </p>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
