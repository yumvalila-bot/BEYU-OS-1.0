/**
 * Noelia shell — HTTP/E2E certification (Phases 6, 11, 12).
 *
 * Drives the real running server (RLS-bound runtime role) exactly like the
 * existing frontend integration suite: SSR page rendering + real HTTP API
 * calls. Requires a running server; skips when absent, hard-fails when the
 * base URL was explicitly configured (see tests/helpers/http.ts).
 */
import "dotenv/config";
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, apiPost, isDeniedPage, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

let ceo = "";
let auditor = "";

beforeAll(async () => {
  if (!available) return;
  ceo = await login("ceo@beyu.os");
  auditor = await login("auditor@beyu.os"); // no ai:noelia.query grant
}, 240_000);

describe("Noelia appears in the authenticated OS shell", () => {
  it.skipIf(!available)("renders the Noelia entry with the canonical face, identity and state", async () => {
    const res = await apiGet("/os", ceo);
    expect(res.status).toBe(200);
    expect(isDeniedPage(res.html)).toBe(false);
    // Canonical asset from the central registry (never a re-drawn face).
    expect(res.html).toContain("/NOELIA.png");
    expect(res.html).toContain('alt="Noelia AI"');
    // Identity cues: entry shows the name with the governed-state chip.
    expect(res.html).toContain(">Noelia<span");
    expect(res.html).toContain("Governed AI");
    // Governed state indicator (CEO holds ai:noelia.query, MFA satisfied).
    expect(res.html).toMatch(/Open Noelia — Governed AI, state READY/);
    // No fabricated generative-provider claim in the shell.
    expect(res.html).not.toContain("live generative");
  });

  it.skipIf(!available)("mobile presentation carries the floating compact entry (SSR)", async () => {
    const res = await apiGet("/os", ceo);
    // The floating entry is always SSR'd (CSS hides it on desktop).
    expect(res.html).toMatch(/Open Noelia — Governed AI, state READY/);
    expect(res.html).toContain("bottom-4 right-4");
    expect(res.html).toContain("md:hidden");
  });

  it.skipIf(!available)(
    "accessibility: the entry button carries an accessible name and state",
    async () => {
      const res = await apiGet("/os", ceo);
      expect(res.html).toMatch(/aria-label="Open Noelia — Governed AI, state [A-Z ]+"/);
      expect(res.html).toMatch(/aria-controls="noelia-assistant-panel"/);
      // The canonical face carries alternative text.
      expect(res.html).toMatch(/alt="Noelia AI"/);
    },
  );
});

describe("Noelia is not an additional operating system", () => {
  it.skipIf(!available)(
    "the shell adds no navigation module and no 'Noelia OS' surface",
    async () => {
      const res = await apiGet("/os", ceo);
      // Every Noelia ROUTE on the executive surface is one of the two
      // pre-existing capability routes (rendered once per nav instance:
      // desktop sidebar + responsive drawer). No other Noelia route exists.
      const noeliaRouteHrefs = new Set(
        [...res.html.matchAll(/href="(\/os\/[^"]*noelia[^"]*)"/gi)].map((m) => m[1]),
      );
      expect(noeliaRouteHrefs.size).toBeGreaterThan(0);
      for (const href of noeliaRouteHrefs) {
        expect(["/os/noelia", "/os/noelia/governance"]).toContain(href);
      }
      expect(res.html).toContain("Noelia / HIVE");
      expect(res.html).not.toContain("Noelia OS");
      // Sector OS set is unchanged on the launcher.
      const launcher = await apiGet("/launcher", ceo);
      expect(launcher.html).toContain("Sector operating systems");
      expect(launcher.html).not.toContain("Noelia OS");
    },
  );
});

describe("governed states render honestly per principal", () => {
  it.skipIf(!available)(
    "a principal without ai:noelia.query sees RESTRICTED, never the ask form",
    async () => {
      const res = await apiGet("/os", auditor);
      expect(res.status).toBe(200);
      expect(res.html).toMatch(/Open Noelia — Governed AI, state RESTRICTED/);
      // The ask input is not rendered for the ungranted principal.
      expect(res.html).not.toContain('id="noelia-panel-question"');
    },
  );

  it.skipIf(!available)(
    "the /os/noelia deep link still re-checks authority server-side",
    async () => {
      const denied = await apiGet("/os/noelia", auditor);
      expect(isDeniedPage(denied.html)).toBe(true);
      const ok = await apiGet("/os/noelia", ceo);
      expect(ok.status).toBe(200);
      expect(isDeniedPage(ok.html)).toBe(false);
    },
  );
});

describe("appearance preferences cannot alter authorization", () => {
  it.skipIf(!available)(
    "the governed Noelia API rejects ungranted callers regardless of any payload",
    async () => {
      const res = await apiPost(
        "/api/v1/ai/noelia",
        { question: "Give me the enterprise liquidity position" },
        { cookie: auditor },
      );
      expect(res.status).toBe(403);
    },
    60_000,
  );

  it.skipIf(!available)(
    "appearance data cannot be smuggled into the governed API contract",
    async () => {
      // The endpoint schema is strict: an 'appearance' field is a validation
      // failure, never an input to the authorization or execution path.
      const res = await apiPost(
        "/api/v1/ai/noelia",
        {
          question: "What is the compliance status across frameworks?",
          appearance: {
            avatarMode: "full",
            permissions: ["ai:noelia.query"],
            apiKey: "sk-live-should-never-appear",
          },
        },
        { cookie: ceo },
      );
      expect([400, 422]).toContain(res.status);
      const text = JSON.stringify(res.body ?? {});
      expect(text).not.toContain("sk-live-should-never-appear");
    },
    60_000,
  );

  it.skipIf(!available)(
    "a forged tenant target in the ask context still fails closed",
    async () => {
      const res = await apiPost(
        "/api/v1/ai/noelia",
        {
          question: "Which risks currently exceed our enterprise risk appetite?",
          context: { tenantId: "TEN_NOT_MINE" },
        },
        { cookie: auditor },
      );
      // Ungranted caller: denied outright; the forged body changes nothing.
      expect([403, 422]).toContain(res.status);
    },
    60_000,
  );
});

describe("settings page — Noelia section is presentation-gated", () => {
  it.skipIf(!available)(
    "shows the Noelia section with the canonical identity and links to /os/noelia",
    async () => {
      for (const cookie of [ceo, auditor]) {
        const res = await apiGet("/os/settings", cookie);
        expect(res.status).toBe(200);
        expect(res.html).toContain('id="noelia"');
        // React SSR inserts <!-- --> between adjacent text expressions.
        expect(res.html).toMatch(/NOELIA<!-- --> — <!-- -->Governed BEYU AI/);
        expect(res.html).toMatch(/Intelligence • Governance • Care\./);
        expect(res.html).toContain('href="/os/noelia"');
      }
    },
  );
});
