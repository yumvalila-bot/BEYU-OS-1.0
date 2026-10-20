import { expect, type Page } from "@playwright/test";

/**
 * Global privacy control — the cookie-consent banner intentionally intercepts
 * pointer events. After any page.goto (especially in a fresh context with no
 * prior consent in localStorage), detect the dialog and record an explicit
 * privacy-preserving choice. Uses accessible role/name, never force-clicks
 * through the modal, and preserves the intentional consent behavior.
 */
export async function dismissCookieConsent(page: Page) {
  const dialog = page.getByRole("dialog", { name: "How BEYU OS uses cookies" });
  try {
    // Wait briefly for hydration; the banner appears only when no prior
    // decision is stored. If it never appears, this is a no-op.
    await dialog.waitFor({ state: "visible", timeout: 2000 });
    await page.getByRole("button", { name: "Reject optional", exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 5000 });
  } catch {
    // No dialog — already decided or not yet hydrated; continue.
  }
}
