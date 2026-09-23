/**
 * Noelia shell & appearance settings — component render certification.
 *
 * React server rendering of the real client components (no browser needed,
 * no database needed): proves the shell entry, the governed-state cues and
 * the Appearance section markup exist with their accessible structure.
 * The panel body is intentionally absent from SSR (it opens on user action),
 * which is asserted explicitly.
 */
import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NoeliaShell } from "@/components/noelia-shell";
import { NoeliaAppearanceSettings } from "@/components/noelia-appearance-settings";

const shellProps = {
  canQuery: true,
  mfaSatisfied: true,
  providerMode: "DETERMINISTIC_ANALYST" as const,
  principalName: "Amani Beyu",
};

function renderShell(props: Partial<typeof shellProps> = {}) {
  return renderToString(
    React.createElement(NoeliaShell, { ...shellProps, ...props }),
  );
}

describe("NoeliaShell (server render)", () => {
  it("renders the header entry with canonical face, identity and READY state", () => {
    const html = renderShell();
    expect(html).toContain("aria-controls=\"noelia-assistant-panel\"");
    expect(html).toContain("/NOELIA.png");
    expect(html).toContain('alt="Noelia AI"');
    expect(html).toContain(">Noelia<span");
    expect(html).toContain("Governed AI");
    expect(html).toContain("aria-label=\"Open Noelia — Governed AI, state READY\"");
    // The assistant panel is closed by default — user action required.
    expect(html).not.toContain("noelia-panel-assistant");
  });

  it("renders the floating compact mobile entry (hidden on desktop by CSS)", () => {
    const html = renderShell();
    expect(html).toContain("fixed bottom-4 right-4");
    expect(html).toContain("md:hidden");
  });

  it("shows RESTRICTED for an ungranted principal and no ask form", () => {
    const html = renderShell({ canQuery: false });
    expect(html).toContain("aria-label=\"Open Noelia — Governed AI, state RESTRICTED\"");
    expect(html).not.toContain("id=\"noelia-panel-question\"");
  });

  it("shows AUTHORIZATION REQUIRED when MFA is not satisfied", () => {
    const html = renderShell({ mfaSatisfied: false });
    expect(html).toContain("state AUTHORIZATION REQUIRED\"");
  });
});

describe("NoeliaAppearanceSettings (server render)", () => {
  const html = renderToString(React.createElement(NoeliaAppearanceSettings));

  it("shows the fixed canonical identity header", () => {
    expect(html).toContain("NOELIA");
    expect(html).toContain("Governed BEYU AI");
    expect(html).toContain("Intelligence • Governance • Care.");
  });

  it("renders every appearance control in labelled groups", () => {
    for (const legend of [
      "Avatar",
      "Presence",
      "Motion",
      "Reduced motion",
      "Greeting",
      "Position",
      "Notifications",
      "Layout density",
      "Voice UI",
    ]) {
      expect(html).toContain(legend);
    }
    // Colour mode is explicitly the shared BEYU OS setting.
    expect(html).toContain("Colour mode (BEYU OS shared setting)");
    // Radio + switch controls are real, accessible inputs.
    expect(html).toContain('name="noelia-avatar-mode"');
    expect(html).toContain('name="noelia-presence-mode"');
    expect(html).toContain('name="noelia-greeting-style"');
    expect(html).toContain('name="noelia-chat-position"');
    expect(html).toContain('name="noelia-notification-preference"');
    expect(html).toContain('name="noelia-theme-mode"');
    expect(html).toContain('name="noelia-visual-mode"');
    expect(html).toContain('role="switch"');
  });

  it("offers the reset control and the persistence-scope disclosure", () => {
    expect(html).toContain("Restore Noelia Defaults");
    expect(html).toMatch(/stored only in this browser/);
    expect(html).toMatch(/never used for\s+authorization/i);
    // Screen-reader announcements are wired.
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});
