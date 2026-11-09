import "dotenv/config";
import "../setup-env";
/**
 * Holograph phone-first 3D — browser gate (Playwright, real Chromium).
 *
 * Verifies the progressive-enhancement contract end to end on the governed
 * /os/viz surface:
 *   • the accessible table remains the always-present channel;
 *   • the 3D toggle exists with an honest "not an optical hologram" label;
 *   • opening 3D either reaches a ready canvas (WebGL present) or lands on an
 *     honest fallback state — never an indefinite loader;
 *   • exiting 3D restores the 2D flow;
 *   • the same flow works at a phone-sized viewport.
 *
 * The spec deliberately accepts ANY honest terminal state (ready /
 * no-geometry / unsupported) because headless environments differ in WebGL
 * support — it asserts the absence of hangs and the presence of fallbacks,
 * not a specific hardware capability.
 */
import { test, expect } from "@playwright/test";
import { login } from "../helpers/http";

let cookie = "";

test.beforeAll(async () => {
  test.setTimeout(180_000);
  cookie = await login("ceo@beyu.os");
});

test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies(
    cookie.split("; ").map((part) => {
      const index = part.indexOf("=");
      return { name: part.slice(0, index), value: part.slice(index + 1), url: baseURL! };
    }),
  );
});

const TERMINAL_PHASE = /(located object\(s\)|No located geometry|3D unavailable)/;

async function buildGovernedScene(page: import("@playwright/test").Page) {
  await page.goto("/os/viz");
  await page.getByRole("button", { name: "Build governed scene" }).click();
  await expect(page.getByText("Accessible table equivalent (always present)")).toBeVisible({
    timeout: 60_000,
  });
}

test("3D view opens with an honest terminal state and exits back to the canonical 2D channel", async ({ page }) => {
  await buildGovernedScene(page);

  const enable = page.getByTestId("enable-3d");
  await expect(enable).toBeVisible();
  // Honest labeling before the user opts in.
  await expect(page.getByText(/not an optical hologram/i)).toBeVisible();

  await enable.click();

  const canvas = page.getByTestId("scene3d-canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });

  // The canvas carries the full text alternative (accessible channel).
  await expect(canvas).toHaveAttribute("aria-label", /Visualization:/);

  // No indefinite loader: one of the honest terminal states appears.
  await expect(page.getByTestId("scene3d-phase")).toHaveText(TERMINAL_PHASE, { timeout: 30_000 });

  // The accessible table never goes away while 3D is open.
  await expect(page.getByText("Accessible table equivalent (always present)")).toBeVisible();

  // If WebGL initialized, the visible controls are operable; if not, an
  // honest fallback message with a return path is present instead.
  const phaseText = (await page.getByTestId("scene3d-phase").textContent()) ?? "";
  if (/located object\(s\)/.test(phaseText)) {
    await expect(page.getByRole("button", { name: "Zoom in" })).toBeEnabled();
    await expect(page.getByRole("button", { name: "Reset the 3D camera" })).toBeEnabled();
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("+");
    await expect(page.getByRole("button", { name: "Exit the 3D view and return to the 2D projection" })).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: /Return to 2D view/ })).toBeVisible();
  }

  // Exit restores the opt-in state (progressive enhancement is reversible).
  await page.getByRole("button", { name: "Exit the 3D view and return to the 2D projection" }).click();
  await expect(page.getByTestId("enable-3d")).toBeVisible();
  await expect(page.getByText("Accessible table equivalent (always present)")).toBeVisible();
});

test("the 3D opt-in works at a phone-sized viewport (375px)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await buildGovernedScene(page);

  const enable = page.getByTestId("enable-3d");
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(page.getByTestId("scene3d-canvas")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("scene3d-phase")).toHaveText(TERMINAL_PHASE, { timeout: 30_000 });
  // Controls remain reachable on a narrow viewport.
  await expect(page.getByRole("button", { name: "Zoom in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exit the 3D view and return to the 2D projection" })).toBeVisible();
});
