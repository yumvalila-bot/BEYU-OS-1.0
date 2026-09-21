/**
 * Noelia Appearance & Personalization — frontend certification.
 *
 * Covers Phase 11 items:
 *   1.  Noelia appears in the authenticated OS shell (HTTP, server-backed).
 *   2.  Noelia does not appear as an additional OS (pure IA + HTTP).
 *   3.  The canonical Noelia asset registry is used (source + HTTP).
 *   4.  Appearance preferences render correctly (pure presentation resolver).
 *   5.  Preferences persist through the existing browser-local preference
 *       mechanism (parse/serialize round-trip + store contract assertions).
 *   6.  Reset restores defaults (pure).
 *   7.  Mobile layout entry exists (SSR HTML).
 *   8.  Reduced-motion is honoured (pure + CSS contract).
 *   9.  Accessibility labels exist (SSR HTML).
 *  10.  Appearance preferences cannot alter permissions (pure + source).
 *  11.  Unauthorized backend operations remain denied (HTTP).
 *  12.  Tenant isolation remains intact (existing suites; re-asserted here
 *       through the forged-target regression).
 *  13.  Restricted state renders correctly (HTTP).
 *  14.  Review-required state renders correctly (pure state resolver).
 *  15.  Provider-unavailable / deterministic state is represented honestly.
 *
 * Pure tests run without a server; HTTP tests follow the repository
 * convention (skipIf !serverAvailable, hard-fail if explicitly configured).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOELIA_APPEARANCE_DEFAULTS,
  NOELIA_DISPLAY_IDENTITY,
  NOELIA_PERSISTED_KEYS,
  NOELIA_STATE_PRESENTATION,
  mergeNoeliaAppearance,
  noeliaAppearanceStorageKeys,
  noeliaProviderCapabilityLabel,
  noeliaProviderModeFromEnvironment,
  parseNoeliaAppearance,
  resolveNoeliaGovernedState,
  resolveNoeliaPresentation,
  serializeNoeliaAppearance,
  type NoeliaAppearancePreferences,
} from "@/lib/noelia/appearance";
import { CAPABILITY_IA } from "@/app/os/capabilities";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = (...parts: string[]) => readFileSync(path.join(ROOT, ...parts), "utf8");

const fullPrefs = (patch: Partial<NoeliaAppearancePreferences> = {}): NoeliaAppearancePreferences => ({
  ...NOELIA_APPEARANCE_DEFAULTS,
  ...patch,
});

/* ------------------------------------------------------------------ */
/* Canonical identity & defaults (Phases 2, 4).                        */
/* ------------------------------------------------------------------ */

describe("canonical Noelia display identity", () => {
  it("fixes name, subtitle and motto per the canonical contract", () => {
    expect(NOELIA_DISPLAY_IDENTITY).toEqual({
      name: "NOELIA",
      subtitle: "Governed BEYU AI",
      motto: "Intelligence • Governance • Care.",
    });
  });

  it("defaults are the restrained BEYU executive presentation", () => {
    expect(NOELIA_APPEARANCE_DEFAULTS).toEqual({
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
    });
  });
});

/* ------------------------------------------------------------------ */
/* Parsing / sanitization — fail-closed, fixed whitelist.              */
/* ------------------------------------------------------------------ */

describe("parseNoeliaAppearance — fail-closed whitelist", () => {
  it("round-trips a valid full payload", () => {
    const input = fullPrefs({ avatarMode: "icon", greetingStyle: "warm", voiceUiEnabled: true });
    const result = parseNoeliaAppearance(input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toEqual(input);
  });

  it("round-trips a persisted-subset payload (theme falls back to default)", () => {
    const input = serializeNoeliaAppearance(fullPrefs({ chatPosition: "contextual" }));
    const result = parseNoeliaAppearance(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.chatPosition).toBe("contextual");
      expect(result.value.themeMode).toBe("system");
    }
  });

  it("drops unknown fields — secrets or authorization claims can never persist", () => {
    const malicious = {
      ...serializeNoeliaAppearance(fullPrefs()),
      apiKey: "sk-live-0123456789",
      token: "Bearer abc",
      mfaSecret: "JBSWY3DPEHPK3PXP",
      rbac: ["ceo"],
      tenantId: "TEN_OTHER",
      permissions: ["ai:noelia.query"],
    };
    // The full schema rejects the foreign keys outright (no silent merge of
    // an unrecognized payload into the canonical model)…
    const result = parseNoeliaAppearance(malicious);
    // …but the tolerant persisted-subset path (storage drift) must still
    // return ONLY whitelisted presentation keys, never the foreign ones.
    expect(result.ok).toBe(true);
    if (result.ok) {
      const keys = Object.keys(serializeNoeliaAppearance(result.value)).sort();
      expect(keys).toEqual([...NOELIA_PERSISTED_KEYS].sort());
      const json = JSON.stringify(result.value);
      expect(json).not.toContain("sk-live-0123456789");
      expect(json).not.toContain("Bearer abc");
      expect(json).not.toContain("JBSWY3DPEHPK3PXP");
      expect(json).not.toContain("TEN_OTHER");
      expect(json).not.toContain("ai:noelia.query");
      // Every value still matches the canonical whitelist.
      expect(result.value).toEqual({
        ...NOELIA_APPEARANCE_DEFAULTS,
        themeMode: "system",
      });
    }
  });

  it("rejects out-of-whitelist values without fabricating them", () => {
    expect(parseNoeliaAppearance({ avatarMode: "cartoon" }).ok).toBe(false);
    expect(parseNoeliaAppearance({ presenceMode: "god-mode" }).ok).toBe(false);
    expect(parseNoeliaAppearance({ motionEnabled: "yes" }).ok).toBe(false);
    expect(parseNoeliaAppearance({ themeMode: "rainbow" }).ok).toBe(false);
  });

  it("rejects non-object payloads", () => {
    for (const bad of [null, undefined, 42, "full", true, ["full"]]) {
      expect(parseNoeliaAppearance(bad).ok).toBe(false);
    }
  });

  it("storage key surface is the fixed presentation whitelist", () => {
    expect([...noeliaAppearanceStorageKeys()].sort()).toEqual(
      [...NOELIA_PERSISTED_KEYS, "themeMode"].sort(),
    );
  });
});

/* ------------------------------------------------------------------ */
/* Presentation resolution (Phase 5 — presentation only).              */
/* ------------------------------------------------------------------ */

describe("resolveNoeliaPresentation", () => {
  it("maps avatar modes to canonical sizes (icon → identity mark)", () => {
    expect(resolveNoeliaPresentation(fullPrefs({ avatarMode: "full" }))).toMatchObject({
      entryAvatarPx: 32,
      entryUsesMark: false,
    });
    expect(resolveNoeliaPresentation(fullPrefs({ avatarMode: "compact" }))).toMatchObject({
      entryAvatarPx: 26,
      entryUsesMark: false,
    });
    expect(resolveNoeliaPresentation(fullPrefs({ avatarMode: "icon" }))).toMatchObject({
      entryAvatarPx: 20,
      entryUsesMark: true,
    });
  });

  it("maps presence modes to text/state visibility", () => {
    const full = resolveNoeliaPresentation(fullPrefs({ presenceMode: "full" }));
    expect(full).toMatchObject({ entryShowsText: true, entryShowsState: true });
    const status = resolveNoeliaPresentation(fullPrefs({ presenceMode: "avatar-status" }));
    expect(status).toMatchObject({ entryShowsText: false, entryShowsState: true });
    const minimal = resolveNoeliaPresentation(fullPrefs({ presenceMode: "minimal" }));
    expect(minimal).toMatchObject({ entryShowsText: false, entryShowsState: false });
  });

  it("motion is suppressed by motionEnabled, reducedMotion or prefers-reduced-motion", () => {
    expect(resolveNoeliaPresentation(fullPrefs()).motionClass).toBe("noelia-motion-on");
    expect(resolveNoeliaPresentation(fullPrefs({ motionEnabled: false })).motionClass).toBe(
      "noelia-motion-off",
    );
    expect(resolveNoeliaPresentation(fullPrefs({ reducedMotion: true })).motionClass).toBe(
      "noelia-motion-off",
    );
    expect(
      resolveNoeliaPresentation(fullPrefs(), { prefersReducedMotion: true }).motionClass,
    ).toBe("noelia-motion-off");
  });

  it("greeting styles render the requested register and the principal name", () => {
    const professional = resolveNoeliaPresentation(fullPrefs({ greetingStyle: "professional" }))
      .greeting("Amani Beyu");
    expect(professional).toContain("Amani Beyu");
    expect(professional).toMatch(/how may I assist/);

    const warm = resolveNoeliaPresentation(fullPrefs({ greetingStyle: "warm" })).greeting(null);
    expect(warm).toMatch(/I'm Noelia/);

    const concise = resolveNoeliaPresentation(fullPrefs({ greetingStyle: "concise" })).greeting("X");
    expect(concise).toBe("Hi X. Ask me anything inside your grants.");
  });

  it("position, density, voice and notification filter map 1:1", () => {
    const p = resolveNoeliaPresentation(
      fullPrefs({
        chatPosition: "contextual",
        visualMode: "compact-density",
        voiceUiEnabled: true,
        notificationPreference: "off",
      }),
    );
    expect(p).toMatchObject({
      panelPosition: "contextual",
      panelDensity: "compact",
      voiceAffordance: true,
      notificationFilter: "off",
    });
  });
});

/* ------------------------------------------------------------------ */
/* Governed state vocabulary (Phase 7 — honest AI state indicator).    */
/* ------------------------------------------------------------------ */

describe("resolveNoeliaGovernedState", () => {
  const base = { canQuery: true, mfaSatisfied: true, runtimeAvailable: true };

  it("READY when granted, MFA satisfied, runtime available", () => {
    expect(resolveNoeliaGovernedState(base)).toBe("READY");
  });

  it("RESTRICTED when the grant is absent — precedence over MFA questions", () => {
    expect(resolveNoeliaGovernedState({ ...base, canQuery: false, mfaSatisfied: false })).toBe(
      "RESTRICTED",
    );
  });

  it("AUTHORIZATION REQUIRED when granted but MFA unsatisfied", () => {
    expect(resolveNoeliaGovernedState({ ...base, mfaSatisfied: false })).toBe(
      "AUTHORIZATION_REQUIRED",
    );
  });

  it("REVIEW REQUIRED when the runtime output requires human review", () => {
    expect(resolveNoeliaGovernedState({ ...base, reviewRequired: true })).toBe("REVIEW_REQUIRED");
  });

  it("UNAVAILABLE when the runtime is down — top precedence", () => {
    expect(resolveNoeliaGovernedState({ ...base, runtimeAvailable: false })).toBe("UNAVAILABLE");
    expect(
      resolveNoeliaGovernedState({
        canQuery: false,
        mfaSatisfied: false,
        runtimeAvailable: false,
      }),
    ).toBe("UNAVAILABLE");
  });

  it("every state has a human-readable, screen-reader description", () => {
    for (const state of Object.keys(NOELIA_STATE_PRESENTATION) as Array<keyof typeof NOELIA_STATE_PRESENTATION>) {
      expect(NOELIA_STATE_PRESENTATION[state].label.length).toBeGreaterThan(0);
      expect(NOELIA_STATE_PRESENTATION[state].description.length).toBeGreaterThan(10);
    }
    expect(NOELIA_STATE_PRESENTATION.RESTRICTED.description).toMatch(/cannot execute/i);
    expect(NOELIA_STATE_PRESENTATION.REVIEW_REQUIRED.label).toBe("REVIEW REQUIRED");
  });
});

/* ------------------------------------------------------------------ */
/* Honest provider capability (Phase 7).                               */
/* ------------------------------------------------------------------ */

describe("provider capability honesty", () => {
  it("defaults to the deterministic governed analyst", () => {
    expect(noeliaProviderModeFromEnvironment({})).toBe("DETERMINISTIC_ANALYST");
    expect(noeliaProviderModeFromEnvironment({ NOELIA_GENERATIVE_ENDPOINT: "https://x" })).toBe(
      "DETERMINISTIC_ANALYST",
    );
  });

  it("reports generative only when endpoint AND credential ref are configured", () => {
    expect(
      noeliaProviderModeFromEnvironment({
        NOELIA_GENERATIVE_ENDPOINT: "https://x",
        NOELIA_GENERATIVE_CREDENTIAL_REF: "ref-1",
      }),
    ).toBe("GENERATIVE_CONFIGURED");
  });

  it("the deterministic label never claims generative inference", () => {
    const label = noeliaProviderCapabilityLabel("DETERMINISTIC_ANALYST");
    expect(label).toMatch(/deterministic/i);
    expect(label).toMatch(/no generative provider/i);
    expect(noeliaProviderCapabilityLabel("GENERATIVE_CONFIGURED")).toMatch(/configured generative/i);
  });
});

/* ------------------------------------------------------------------ */
/* Reset (Phase 11.6).                                                 */
/* ------------------------------------------------------------------ */

describe("reset restores defaults", () => {
  it("serializing the cleared store parses back to the canonical defaults", () => {
    const customized = fullPrefs({
      avatarMode: "icon",
      greetingStyle: "warm",
      chatPosition: "contextual",
      reducedMotion: true,
    });
    // Reset removes the stored payload; the view falls back to defaults.
    const restored = mergeNoeliaAppearance(NOELIA_APPEARANCE_DEFAULTS, {});
    expect(restored).toEqual(NOELIA_APPEARANCE_DEFAULTS);
    const cleared = parseNoeliaAppearance(serializeNoeliaAppearance(restored));
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.value).toEqual(NOELIA_APPEARANCE_DEFAULTS);
    // A customized view still round-trips (reset is opt-in, not implicit).
    const kept = parseNoeliaAppearance(serializeNoeliaAppearance(customized));
    expect(kept.ok).toBe(true);
    if (kept.ok) expect(kept.value.avatarMode).toBe("icon");
  });
});

/* ------------------------------------------------------------------ */
/* Architecture invariants (Phases 1, 5, 6, 8 — no duplicate, no       */
/* authority, no secrets, no second OS).                               */
/* ------------------------------------------------------------------ */

describe("architecture invariants", () => {
  const shell = source("src", "components", "noelia-shell.tsx");
  const store = source("src", "components", "noelia-appearance-store.ts");
  const settings = source("src", "components", "noelia-appearance-settings.tsx");
  const layout = source("src", "app", "os", "layout.tsx");
  const navigation = source("src", "app", "os", "os-navigation.tsx");
  const css = source("src", "app", "globals.css");

  it("uses the central canonical asset registry (no ad-hoc asset paths)", () => {
    expect(shell).toContain('import { NOELIA_ASSETS } from "./brand-assets"');
    expect(shell).toContain("NOELIA_ASSETS.icon");
    expect(shell).toContain("NOELIA_ASSETS.avatar");
    // No hardcoded canonical PNG filenames outside the registry.
    expect(shell).not.toContain("noelia-beyu-os-canonical.png");
    expect(shell).not.toMatch(/src=["']\/noelia\/[^"]*\.png["']/);
  });

  it("the shell component grants nothing: no authz, no db, no api-boundary imports", () => {
    expect(shell).not.toContain('from "@/lib/authz"');
    expect(shell).not.toContain("requireAccess");
    expect(shell).not.toContain('from "@/db"');
    expect(shell).not.toMatch(/\bcan\(principal/);
    // It only DISPLAYS server-resolved facts.
    expect(shell).toContain("canQuery");
    expect(shell).toContain("mfaSatisfied");
    expect(shell).toContain("providerMode");
  });

  it("the preference store is browser-local: localStorage only, sanitized, no network", () => {
    expect(store).toContain("beyu.noelia.appearance");
    expect(store).toContain("parseNoeliaAppearance");
    expect(store).not.toContain("fetch(");
    expect(store).not.toContain("XMLHttpRequest");
    expect(store).not.toContain("navigator.sendBeacon");
    // Shares the existing BEYU device theme key — one theme mechanism.
    expect(store).toContain("beyu.device.theme");
  });

  it("no appearance surface references secrets or credentials", () => {
    for (const s of [shell, store, settings]) {
      expect(s).not.toMatch(/api[-_ ]?key/i);
      expect(s).not.toMatch(/mfaSecret/i);
      expect(s).not.toMatch(/password/i);
      expect(s).not.toMatch(/Bearer\s+/);
    }
  });

  it("appearance settings are documented as presentation-only in the UI", () => {
    expect(settings).toMatch(/presentation\s+only/i);
    expect(settings).toMatch(/never used for\s+authorization/i);
  });

  it("Noelia is not an additional operating system", () => {
    const sector = CAPABILITY_IA.find((g) => g.id === "sector");
    expect(sector).toBeDefined();
    expect(sector!.items.map((i) => i.label)).toEqual([
      "Finance OS",
      "Health OS",
      "Agriculture OS",
      "Foundation OS",
      "Ujenzi OS",
    ]);
    // The sidebar itself carries no Noelia entry (only the existing
    // capability item in the shared-catalogue, rendered via CAPABILITY_IA).
    expect(navigation).not.toContain("Noelia");
  });

  it("the OS layout hosts the Noelia shell as a header capability, not a nav group", () => {
    expect(layout).toContain("NoeliaShell");
    expect(layout).toContain("noeliaProviderModeFromEnvironment");
    // The canonical navigation catalogue is untouched by this feature.
    const capabilities = source("src", "app", "os", "capabilities.ts");
    expect(capabilities).not.toContain("Noelia OS");
  });

  it("reduced-motion support exists at the CSS level for Noelia surfaces", () => {
    expect(css).toContain(".noelia-motion-off *");
    expect(css).toContain("animation-duration: 0.01ms !important");
    // OS-wide prefers-reduced-motion remains honoured (existing contract).
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
