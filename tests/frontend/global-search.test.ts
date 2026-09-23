/**
 * BEYU OS — Shared Search UI: single global search control.
 *
 * Pure node suite (renderToString + source contracts), per repository
 * frontend-test convention.
 *
 * Pins the frontend half of the shared search capability:
 *   1. ONE search control: the OS shell header contains exactly one
 *      <GlobalSearch> and no other search surface exists;
 *   2. the control is presentation-only: `visible={false}` renders nothing,
 *      and it never performs authorization itself;
 *   3. relative, cookie-only requests to the ONE governed endpoint — the
 *      component sends `q` and `limit` only; no tenant/entity/clearance/scope
 *      parameter exists to send (the server is authoritative);
 *   4. result groups are derived from the authorized response (`os` per hit)
 *      with display names from the canonical OS catalogue — no hard-coded
 *      list of searchable OS groups;
 *   5. accessibility: combobox/listbox/option roles, keyboard navigation,
 *      labelled trigger and dialog;
 *   6. bounded UX: loading / error / empty states; responsive width.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "@/components/global-search";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, back: () => undefined }),
  usePathname: () => "/os",
}));

const HERE = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(HERE, "..", "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("Shared Search UI — single global control", () => {
  it("1. the OS shell header contains exactly one search control", () => {
    const layout = read("src/app/os/layout.tsx");
    const uses = layout.match(/<GlobalSearch/g) ?? [];
    expect(uses).toHaveLength(1);
    // No other search input surface in the shell.
    const header = read("src/app/os/layout.tsx");
    expect(header.match(/type=["']search["']/g) ?? []).toHaveLength(0);
  });

  it("2. visible=false renders nothing; visible renders one labelled trigger", () => {
    const hidden = renderToString(React.createElement(GlobalSearch, { visible: false }));
    expect(hidden).toBe("");
    const shown = renderToString(React.createElement(GlobalSearch));
    expect(shown).toContain("aria-label=\"Search\"");
    expect(shown.match(/aria-label="Search"/g)).toHaveLength(1);
    // No results panel before the user opens it.
    expect(shown).not.toContain('role="listbox"');
  });

  it("3. requests are relative and carry no scope parameters (server is authoritative)", () => {
    const src = read("src/components/global-search.tsx");
    expect(src).toContain('`/api/v1/search?');
    expect(src).not.toMatch(/https?:\/\/[^\s"`]*\/api\/v1\/search/);
    // The request-parameter construction sends q and limit only — no
    // tenant/entity/clearance/scope key exists anywhere in the code.
    const paramLines = src
      .split("\n")
      .filter((l) => l.includes("new URLSearchParams"))
      .join("\n");
    expect(paramLines).toContain("q");
    expect(paramLines).toContain("limit");
    for (const forbidden of ["tenantId", "entityId", "clearance", "scope:", "tenant_code", "countryCode", "classification"]) {
      expect(paramLines, `must not send ${forbidden}`).not.toContain(forbidden);
    }
    // No absolute URL anywhere in the component.
    expect(src).not.toMatch(/fetch\(\s*["']https?:/);
  });

  it("4. result groups are derived from the authorized response, not a hardcoded list", () => {
    const src = read("src/components/global-search.tsx");
    // Groups come from each hit's `os` (response-derived)…
    expect(src).toContain("g.os === hit.os");
    // …labelled through the canonical catalogue…
    expect(src).toContain("operating-system-catalog");
    // …and nowhere in the component is a literal array of OS group names.
    expect(src).not.toMatch(/const\s+(SEARCH_GROUPS|OS_GROUPS|GROUPS)\s*:/);
    expect(src).not.toContain('"UJENZI",');
  });

  it("5. accessibility: combobox/listbox/option semantics + keyboard navigation", () => {
    const src = read("src/components/global-search.tsx");
    expect(src).toContain('role="combobox"');
    expect(src).toContain('role="listbox"');
    expect(src).toContain('role="option"');
    expect(src).toContain("aria-activedescendant");
    expect(src).toContain("aria-expanded");
    expect(src).toContain("ArrowDown");
    expect(src).toContain("ArrowUp");
    expect(src).toContain("Escape");
    expect(src).toContain('role="dialog"');
  });

  it("6. bounded UX: loading / error / empty states, responsive width, debounced", () => {
    const src = read("src/components/global-search.tsx");
    expect(src).toContain("Searching…");
    expect(src).toContain("Search is unavailable right now.");
    expect(src).toContain("No results in your authorized scope.");
    expect(src).toContain("DEBOUNCE_MS");
    expect(src).toContain("AbortController");
    expect(src).toContain("max-w-[92vw]"); // mobile-safe width
  });

  it("7. the control is presentation-only: no client-side authorization logic", () => {
    const src = read("src/components/global-search.tsx");
    // The component imports and calls no authorization API: no permission
    // check, no clearance lookup, no role/principal handling. (The word
    // "RLS" can occur inside the unrelated "URLSearchParams" identifier, so
    // check the authorization API surface, not substrings.)
    expect(src).not.toContain("platform:search.read");
    expect(src).not.toMatch(/can\(/);
    expect(src).not.toContain("resolvePrincipal");
    expect(src).not.toContain("clearanceForRoles");
    expect(src).not.toContain("usePrincipal");
    expect(src).not.toContain("PermissionCode");
    // `visible` is a boolean prop from the layout, which holds the grant check.
    expect(src).toContain("visible");
    // And the layout performs the grant check server-side before rendering.
    const layout = read("src/app/os/layout.tsx");
    expect(layout).toContain('can(principal, "platform:search.read").allowed');
  });
});
