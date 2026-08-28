/**
 * BEYU OS — frontend accessibility & navigation-gating certification.
 *
 * WHY THIS SUITE EXISTS
 *   The existing frontend suite (tests/frontend/integration.test.ts) proves the
 *   AUTH BOUNDARY: that a route renders for an authorized principal and renders
 *   the governed "Authorisation denied" panel otherwise. It says nothing about
 *   whether the rendered shell is USABLE or whether navigation is honest.
 *
 *   Two classes of defect were previously unverified:
 *
 *   1. ACCESSIBILITY. Labels were rendered as bare <label> text with no
 *      `for`/`id` association, the MFA field had no accessible name at all, and
 *      a failed sign-in announced nothing to assistive technology because the
 *      error had no live region. A screen-reader user could not tell which field
 *      was which, nor that authentication had failed.
 *
 *   2. NAVIGATION HONESTY. The sidebar rendered every module to every principal,
 *      so the UI advertised modules the principal was constitutionally barred
 *      from opening.
 *
 *   Both were fixed. This suite pins the fix so neither can silently regress.
 *
 * THE INVARIANT THAT MATTERS
 *   Navigation gating is a PRESENTATION decision and must never become an
 *   authority. These tests therefore assert the relationship in both
 *   directions:
 *     - no route that the backend DENIES may be advertised in navigation;
 *     - a route hidden from navigation must STILL return the real governed
 *       decision when requested directly.
 *   If either direction breaks, either the UI lies to the user or the UI has
 *   started making authorization decisions. Both are certification failures.
 *
 * Requires a running server (see tests/helpers/http.ts); skips when absent,
 * which CI prevents by starting the server and failing if it never becomes
 * ready.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { apiGet, isDeniedPage, login, serverAvailable } from "../helpers/http";

const available = await serverAvailable();

/** Every module route and the capability its page guard enforces. */
const MODULE_ROUTES: { href: string; label: string }[] = [
  { href: "/os", label: "Executive Control Centre" },
  { href: "/os/constitution", label: "Constitution & Policy" },
  { href: "/os/registry", label: "OS & Source-of-Truth Registry" },
  { href: "/os/organization", label: "Organisation & Ownership" },
  { href: "/os/governance", label: "Governance Engine" },
  { href: "/os/assurance", label: "Risk · Compliance · Legal" },
  { href: "/os/hcm", label: "HCM (workforce truth)" },
  { href: "/os/capital", label: "Capital & Treasury" },
  { href: "/os/waterfall", label: "Waterfall Engine" },
  { href: "/os/tax", label: "Tax Strategy Intelligence" },
  { href: "/os/family", label: "Family Office" },
  { href: "/os/foundation", label: "Foundation OS" },
  { href: "/os/noelia", label: "Noelia AI · HIVE" },
  { href: "/os/documents", label: "Documents & Knowledge" },
  { href: "/os/audit", label: "Audit, Events & Assurance" },
];

let ceo = "";
let hcm = "";
let auditor = "";

/**
 * Extract the href of every NAVIGATION link from a rendered /os shell.
 *
 * Scoped to the `<nav>` landmarks on purpose. The dashboard body also renders
 * module links (a waterfall "Open engine →", a governance "All →", a risk
 * "Register →"), and those are separately capability-gated. Matching every href
 * on the page conflates navigation with content and produces false results —
 * it reported gated navigation as ungated because a body link was still there.
 */
function navHrefs(html: string): string[] {
  const hrefs = new Set<string>();
  for (const nav of html.matchAll(/<nav\b[\s\S]*?<\/nav>/g)) {
    for (const m of nav[0].matchAll(/href="(\/os[a-z/-]*)"/g)) hrefs.add(m[1]);
  }
  return [...hrefs];
}

async function deniedRoutes(cookie: string): Promise<string[]> {
  const denied: string[] = [];
  for (const route of MODULE_ROUTES) {
    const res = await apiGet(route.href, cookie);
    expect(res.status).toBe(200);
    if (isDeniedPage(res.html)) denied.push(route.href);
  }
  return denied;
}

beforeAll(async () => {
  if (!available) return;
  ceo = await login("ceo@beyu.os");
  hcm = await login("hcm@beyu.os");
  auditor = await login("auditor@beyu.os");
}, 240_000);

describe("Sign-in accessibility (unauthenticated shell)", () => {
  it.skipIf(!available)("every field has a programmatically associated label", async () => {
    const { status, html } = await apiGet("/", null);
    expect(status).toBe(200);
    // A <label> with no `for` and no nested control is not a label at all:
    // assistive technology reads the field as unlabelled.
    for (const [id, name] of [
      ["beyu-signin-email", "email"],
      ["beyu-signin-password", "password"],
      ["beyu-signin-mfa", "mfaCode"],
    ] as const) {
      expect(html, `label for="${id}" must exist`).toContain(`for="${id}"`);
      expect(html, `input id="${id}" must exist`).toContain(`id="${id}"`);
      expect(html, `input name="${name}" must exist`).toContain(`name="${name}"`);
    }
  });

  it.skipIf(!available)("the MFA field declares one-time-code autocomplete and a help association", async () => {
    const { html } = await apiGet("/", null);
    // HTML attribute NAMES are ASCII case-insensitive (HTML Standard), so the
    // browser parses React's SSR output `autoComplete="one-time-code"` as
    // `autocomplete="one-time-code"`. React 19 emits these two props in
    // camelCase while it lowercases `htmlFor` to `for`, so the assertion must
    // be case-insensitive to test the real contract rather than React's casing.
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(html).toContain('id="beyu-signin-mfa-help"');
    expect(html).toContain("beyu-signin-mfa-help beyu-signin-error");
  });

  it.skipIf(!available)("a sign-in failure is announced via an assertive live region", async () => {
    const { html } = await apiGet("/", null);
    expect(html).toContain('id="beyu-signin-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-live="assertive"');
    expect(html).toContain('aria-atomic="true"');
  });

  /**
   * The unauthenticated sign-in page must not publish privileged identities.
   *
   * It used to list six bootstrap accounts with their roles AND pre-fill the
   * Group Chief Executive's address in the email field — both serialised into
   * the server-rendered HTML of a public page. That is a username-enumeration
   * aid aimed at exactly the accounts with the most authority. The hint is now
   * suppressed on any production-mode server (`next start`, which is how Vercel
   * runs it) and the default email is empty; `next dev` keeps the convenience.
   *
   * This suite runs against `next start`, so production behaviour is what is
   * asserted here.
   */
  it.skipIf(!available)("does not publish privileged identities on the public sign-in page", async () => {
    const { html } = await apiGet("/", null);
    expect(html).not.toContain("Governed bootstrap identities");
    for (const email of [
      "ceo@beyu.os",
      "cfo@beyu.os",
      "governance@beyu.os",
      "risk@beyu.os",
      "family@beyu.os",
      "auditor@beyu.os",
    ]) {
      expect(html, `${email} must not appear on the public sign-in page`).not.toContain(email);
    }
    // The form must still be usable — an empty email field, not a removed one.
    expect(html).toContain('id="beyu-signin-email"');
  });
});

describe("OS shell accessibility (authenticated)", () => {
  it.skipIf(!available)("provides a skip link that targets the main landmark", async () => {
    const { html } = await apiGet("/os", ceo);
    expect(html).toContain('href="#beyu-main"');
    expect(html).toContain('id="beyu-main"');
    expect(html).toMatch(/Skip to main content/);
  });

  it.skipIf(!available)("labels its landmarks so a screen reader can tell them apart", async () => {
    const { html } = await apiGet("/os", ceo);
    expect(html).toContain('aria-label="BEYU OS module navigation"');
    expect(html).toContain('aria-label="Primary"');
    expect(html).toContain('aria-label="Modules"');
  });

  it.skipIf(!available)("marks the current page with aria-current in BOTH desktop and mobile navigation", async () => {
    const { html } = await apiGet("/os", ceo);
    const count = (html.match(/aria-current="page"/g) ?? []).length;
    // The desktop sidebar and the mobile overflow bar each render the active
    // link, so the current page must be announced at least twice.
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it.skipIf(!available)("announces the active module on a deep route", async () => {
    const { html } = await apiGet("/os/constitution", ceo);
    expect(html).toContain('aria-current="page"');
  });
});

describe("Navigation honesty — gating is presentation, never authority", () => {
  it.skipIf(!available)(
    "no module the backend denies is advertised in navigation (every principal)",
    async () => {
      for (const [who, cookie] of [
        ["ceo", ceo],
        ["hcm", hcm],
        ["auditor", auditor],
      ] as const) {
        const denied = await deniedRoutes(cookie);
        const shell = await apiGet("/os", cookie);
        const links = navHrefs(shell.html);
        for (const route of denied) {
          expect(
            links.includes(route),
            `${who}: navigation must not advertise ${route}, which the backend denies`,
          ).toBe(false);
        }
        // The dashboard is open to every authenticated principal and must stay
        // reachable, otherwise gating has hidden the only entry point.
        expect(links, `${who}: dashboard link must remain`).toContain("/os");
      }
    },
    240_000,
  );

  it.skipIf(!available)(
    "hiding a module does not change the governed decision on direct access",
    async () => {
      // HCM director has no finance:capital.read (asserted by the existing
      // frontend suite). Capital must be absent from navigation…
      const denied = await deniedRoutes(hcm);
      expect(denied).toContain("/os/capital");
      const shell = await apiGet("/os", hcm);
      expect(navHrefs(shell.html)).not.toContain("/os/capital");
      // …and a direct request must still yield the real governed denial rather
      // than a 404 or an empty shell. The authority is unchanged by the UI.
      const direct = await apiGet("/os/capital", hcm);
      expect(direct.status).toBe(200);
      expect(isDeniedPage(direct.html)).toBe(true);
      expect(direct.html).toMatch(/finance:capital\.read/);
    },
    120_000,
  );

  it.skipIf(!available)("a read-only auditor sees only modules they can actually open", async () => {
    const denied = await deniedRoutes(auditor);
    // An internal auditor is deliberately not a finance or workforce authority;
    // if this ever becomes empty the assertion below would prove nothing.
    expect(denied.length).toBeGreaterThan(0);
    const shell = await apiGet("/os", auditor);
    const links = navHrefs(shell.html);
    expect(links.length).toBeLessThan(MODULE_ROUTES.length);
  });
});

/**
 * DASHBOARD AUTHORIZATION VISIBILITY.
 *
 * The Executive Control Centre summarises finance, risk, governance, workforce
 * and AI data. It used to be tenant-scoped but NOT capability-scoped, so a
 * principal explicitly denied the Governance and Risk modules could still read
 * recent resolutions and above-appetite risks on the dashboard — module-level
 * RBAC bypassed by the page that summarises the same data. These tests pin the
 * fix: the dashboard must never show what the module would deny.
 */
describe("Dashboard authorization visibility", () => {
  it.skipIf(!available)(
    "omits every panel and figure whose capability the principal lacks",
    async () => {
      const denied = await deniedRoutes(hcm);
      // HCM director is denied Governance, Risk, Capital, Tax, Family, Audit and
      // the Registry. If that set ever empties, the assertions below prove
      // nothing, so fail loudly rather than passing vacuously.
      expect(denied).toContain("/os/governance");
      expect(denied).toContain("/os/assurance");
      expect(denied).toContain("/os/capital");

      const dash = await apiGet("/os", hcm);
      expect(dash.status).toBe(200);
      expect(isDeniedPage(dash.html)).toBe(false);

      // Panels belonging to denied modules must not render at all.
      expect(dash.html).not.toContain("Recent decisions");
      expect(dash.html).not.toContain("Above appetite");
      expect(dash.html).not.toContain("Finance OS · waterfall");

      // Figures belonging to denied modules must be redacted, not zero-filled —
      // a zero would be a fabricated financial figure.
      expect(dash.html).toContain("finance:capital.read not granted");
      expect(dash.html).toContain("finance:treasury.read not granted");
      expect(dash.html).toContain("Restricted");

      // What the principal IS entitled to still renders.
      expect(dash.html).toContain("Active workforce · HCM");
    },
    180_000,
  );

  it.skipIf(!available)(
    "a fully entitled principal still sees the finance and governance panels",
    async () => {
      const dash = await apiGet("/os", ceo);
      expect(dash.status).toBe(200);
      // Guards against over-gating: the fix must not blank the dashboard for a
      // principal who legitimately holds every capability.
      expect(dash.html).toContain("Recent decisions");
      expect(dash.html).toContain("Finance OS · waterfall");
      expect(dash.html).not.toContain("finance:capital.read not granted");
    },
    120_000,
  );
});
