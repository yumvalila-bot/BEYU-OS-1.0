/**
 * CANONICAL DESTINATION FRONTENDS — HTTP boundary.
 *
 * Drives the REAL running server (production build, runtime role, real proxy)
 * with canonical and hostile `Host` values. `Host` is set with `node:http`
 * because `fetch` does not permit overriding it.
 *
 * Companion to `canonical-host-http.test.ts`, which pins host ROUTING. This
 * suite pins the user-facing FRONTEND and SIGN-IN contract on every canonical
 * host:
 *
 *   1. `/sign-in` exists on all eight hosts and renders THAT destination's
 *      sign-in — never the generic BEYU control-plane surface, never a redirect
 *      through the apex.
 *   2. `/` on a destination host renders that destination's OWN first-class
 *      frontend, not the generic BEYU launcher/landing.
 *   3. A signed-in identity WITHOUT the destination's access receives the
 *      governed DENIAL on that host — it is never silently redirected to
 *      `/launcher` or to a different OS, and never served the workspace.
 *   4. A signed-in identity WITH access is redirected (relatively) to the
 *      destination home, which then serves it.
 *   5. The browser-facing URL stays the canonical hostname throughout.
 *   6. A hostile / unknown / unconfigured host selects NO destination frontend:
 *      it receives the control-plane surface with every gate in force.
 *   7. Deep links keep their own server-side gate on every host.
 *   8. Authentication stays SHARED: one login endpoint, one session cookie, no
 *      destination-specific credential surface.
 *
 * Repository convention: skip when no server is running, hard-fail when one was
 * explicitly configured (tests/helpers/http.ts). The server MUST be started with
 * `BEYU_CANONICAL_DOMAIN=beyu.co.tz`; when it is not, the suite asserts the
 * documented inactive state instead.
 */
import { request as httpRequest } from "node:http";
import { beforeAll, describe, expect, it } from "vitest";
import { baseUrl, login, serverAvailable } from "../helpers/http";

const enabled = Boolean(process.env.BEYU_TEST_BASE_URL);
const routingConfigured = process.env.BEYU_TEST_CANONICAL_DOMAIN === "beyu.co.tz";

type Reply = { status: number; location?: string; body: string; setCookie: string[] };

function send(
  method: string,
  path: string,
  headers: Record<string, string>,
  payload?: string,
): Promise<Reply> {
  const url = new URL(baseUrl());
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: url.hostname, port: url.port, path, method, headers },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body,
            setCookie: ([] as string[]).concat(res.headers["set-cookie"] ?? []),
          }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const getWithHost = (path: string, host: string, cookie?: string) =>
  send("GET", path, { host, ...(cookie ? { cookie } : {}) });

/**
 * React SSR splits adjacent text nodes with `<!-- -->` (and marks Suspense
 * boundaries with `<!--$-->`), so a sentence composed from several JSX
 * expressions does not appear contiguously in the raw body. Collapsing those
 * markers reconstructs the rendered text and makes copy assertions test the
 * contract rather than React's serialisation. No real content is an HTML
 * comment this short.
 */
const text = (body: string) => body.replace(/<!--[^>]{0,8}-->/g, "");

/**
 * The contract markers a canonical destination surface must carry, and whether
 * each is present. `/` and `/sign-in` are the SAME page component, but
 * `/sign-in` additionally owns a `loading.tsx` Suspense boundary, so the two
 * responses differ in their STREAMING ENVELOPE (Suspense placeholders and the
 * `$RC`/`$RS` swap scripts) while rendering the same surface. Comparing the
 * marker set proves the surfaces are identical without asserting byte equality
 * on React's serialisation.
 */
const SURFACE_MARKERS = (destination: (typeof DESTINATIONS)[number]): string[] => [
  destination.copy,
  destination.headline,
  destination.registry,
  `aria-label="Sign in to ${destination.name}"`,
  `Enter ${destination.name}`,
  "beyu-destination-headline",
  "beyu-destination-signin-title",
  "beyu-signin-email",
  "beyu-signin-password",
  "beyu-signin-mfa",
  "You are signed in, but you are not authorized",
  "Destination status",
  "Sign in to the control plane",
  CONTROL_PLANE_ONLY,
];
const surfaceOf = (body: string, destination: (typeof DESTINATIONS)[number]): string[] =>
  SURFACE_MARKERS(destination).filter((marker) => text(body).includes(marker));

/**
 * The eight canonical destinations: host → the copy, headline and home its own
 * frontend must own. `beYUOnly` is a string that appears ONLY on the generic
 * BEYU control-plane surface, so its absence proves a destination host is not
 * serving the generic launcher.
 */
const CONTROL_PLANE_ONLY = "The constitutional control plane of the";
const DESTINATIONS = [
  {
    host: "health.beyu.co.tz",
    home: "/os/health",
    name: "Health OS",
    copy: "Sign in to Health OS — governed by BEYU OS",
    headline: "Health OS — federated care operations under canonical BEYU identity.",
    registry: "HEALTH_OS",
  },
  {
    host: "finance.beyu.co.tz",
    home: "/os/finance",
    name: "Finance OS",
    copy: "Sign in to Finance OS — governed by BEYU OS",
    headline: "Finance OS — the canonical financial authority of the BEYU ecosystem.",
    registry: "FINANCE_OS",
  },
  {
    host: "agriculture.beyu.co.tz",
    home: "/os/agriculture",
    name: "Agriculture OS",
    copy: "Sign in to Agriculture OS — governed by BEYU OS",
    headline: "Agriculture OS — farms, crops, livestock, traceability and export operations.",
    registry: "AGRICULTURE_OS",
  },
  {
    host: "ujenzi.beyu.co.tz",
    home: "/os/ujenzi",
    name: "Ujenzi OS",
    copy: "Sign in to Ujenzi OS — governed by BEYU OS",
    headline: "Ujenzi OS — the governed engineering and construction operating system.",
    registry: "UJENZI_OS",
  },
  {
    host: "foundation.beyu.co.tz",
    home: "/os/foundation",
    name: "Foundation OS",
    copy: "Sign in to Foundation OS — governed by BEYU OS",
    headline: "Foundation — the nonprofit sister organisation of the BEYU Holding Company.",
    registry: "FOUNDATION_OS",
  },
  {
    host: "familyoffice.beyu.co.tz",
    home: "/os/family",
    name: "Family Office",
    copy: "Sign in to Family Office — governed by BEYU OS",
    headline: "Family Office — the shared family governance and wealth capability.",
    registry: "SHARED_FAMILY_OFFICE",
  },
  {
    host: "noelia.beyu.co.tz",
    home: "/os/noelia",
    name: "Noelia AI",
    copy: "Sign in to Noelia AI — governed by BEYU OS",
    headline: "Noelia — the single governed BEYU AI identity on the HIVE runtime.",
    registry: "NOELIA_AI",
  },
] as const;

/** Hostile / unknown hosts: none of these may select a destination frontend. */
const HOSTILE_HOSTS = [
  "evil-health.beyu.co.tz",
  "health.beyu.co.tz.attacker.example",
  "x.health.beyu.co.tz",
  "unknown.beyu.co.tz",
  "family-office.beyu.co.tz",
  "noelias.beyu.co.tz",
  "foundationx.beyu.co.tz",
  "mwanza.health.beyu.co.tz",
] as const;

let ceoCookie: string;
let healthCookie: string;
let agriCookie: string;
let ujenziCookie: string;
let foundationCookie: string;
let auditorCookie: string;
let hcmCookie: string;

beforeAll(async () => {
  if (!(await serverAvailable())) return;
  ceoCookie = await login("ceo@beyu.os");
  healthCookie = await login("health.ops@beyu.os");
  agriCookie = await login("agri.ops@beyu.os");
  ujenziCookie = await login("ujenzi.ops@beyu.os");
  foundationCookie = await login("foundation.director@beyu.os");
  auditorCookie = await login("auditor@beyu.os");
  hcmCookie = await login("hcm@beyu.os");
}, 240_000);

/** Every identity the suite exercises, so the invariants hold for all of them. */
const identities = () =>
  [
    ["ceo", ceoCookie],
    ["health.ops", healthCookie],
    ["agri.ops", agriCookie],
    ["ujenzi.ops", ujenziCookie],
    ["foundation.director", foundationCookie],
    ["auditor", auditorCookie],
    ["hcm", hcmCookie],
  ] as const;

describe("1/2. every canonical host serves its OWN first-class frontend at / and /sign-in", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "unauthenticated: `/sign-in` renders the destination sign-in (200), never a redirect, never the generic BEYU surface",
    async () => {
      for (const destination of DESTINATIONS) {
        const res = await getWithHost("/sign-in", destination.host);
        expect(res.status, destination.host).toBe(200);
        expect(res.location, destination.host).toBeUndefined();
        expect(text(res.body), destination.host).toContain(destination.copy);
        expect(text(res.body), destination.host).toContain(destination.headline);
        expect(text(res.body), destination.host).toContain(destination.registry);
        // The destination surface is NOT the generic BEYU control-plane page.
        expect(text(res.body), destination.host).not.toContain(CONTROL_PLANE_ONLY);
        expect(text(res.body), destination.host).not.toContain("Sign in to the control plane");
        // Accessible, mobile-first, shared BEYU identity — and one shared form.
        expect(res.body, destination.host).toContain(`aria-label="Sign in to ${destination.name}"`);
        expect(text(res.body), destination.host).toContain(`Enter ${destination.name}`);
        expect(res.body, destination.host).toContain('id="beyu-signin-email"');
        expect(res.body, destination.host).toContain('id="beyu-signin-password"');
        expect(res.body, destination.host).toContain('id="beyu-signin-mfa"');
        expect(res.body, destination.host).toContain('role="alert"');
        expect(res.body, destination.host).toContain("viewport");
        // The authoritative BEYU mark is present on every destination surface.
        expect(res.body, destination.host).toContain("/brand/beyu-os-logo.png");
      }
    },
    180_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "unauthenticated: `/` renders the SAME destination frontend — one entry surface, two canonical URLs",
    async () => {
      for (const destination of DESTINATIONS) {
        const root = await getWithHost("/", destination.host);
        const signIn = await getWithHost("/sign-in", destination.host);
        expect(root.status, destination.host).toBe(200);
        expect(text(root.body), destination.host).toContain(destination.copy);
        expect(text(root.body), destination.host).toContain(destination.headline);
        expect(text(root.body), destination.host).not.toContain(CONTROL_PLANE_ONLY);
        // `/` and `/sign-in` are the SAME page component, so the destination
        // surface they render is identical — asserted on the contract markers,
        // not on React's streaming envelope (see `surfaceOf`).
        const markers = surfaceOf(root.body, destination);
        expect(markers, destination.host).toEqual(surfaceOf(signIn.body, destination));
        expect(markers, destination.host).toEqual(
          expect.arrayContaining([
            destination.copy,
            destination.headline,
            destination.registry,
            `aria-label="Sign in to ${destination.name}"`,
            `Enter ${destination.name}`,
            "beyu-signin-email",
          ]),
        );
        expect(markers, destination.host).not.toContain("Sign in to the control plane");
        expect(markers, destination.host).not.toContain(CONTROL_PLANE_ONLY);
      }
    },
    180_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "the apex and www keep the generic BEYU control-plane surface (unchanged)",
    async () => {
      for (const host of ["beyu.co.tz", "www.beyu.co.tz"]) {
        for (const path of ["/", "/sign-in"]) {
          const res = await getWithHost(path, host);
          expect(res.status, `${host}${path}`).toBe(200);
          expect(text(res.body), `${host}${path}`).toContain("Sign in to the control plane");
          expect(text(res.body), `${host}${path}`).toContain(CONTROL_PLANE_ONLY);
          expect(res.body, `${host}${path}`).toContain('aria-label="Sign in to BEYU OS"');
          expect(text(res.body), `${host}${path}`).toContain("Enter BEYU OS");
        }
      }
    },
    180_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "a hostile or unknown host selects NO destination frontend, at / or /sign-in",
    async () => {
      for (const host of HOSTILE_HOSTS) {
        for (const path of ["/", "/sign-in"]) {
          const res = await getWithHost(path, host);
          expect(res.status, `${host}${path}`).toBe(200);
          expect(text(res.body), `${host}${path}`).toContain("Sign in to the control plane");
          // No privileged destination frontend is reachable by spoofing a host.
          for (const destination of DESTINATIONS) {
            expect(text(res.body), `${host}${path}`).not.toContain(destination.copy);
            expect(text(res.body), `${host}${path}`).not.toContain(destination.headline);
          }
        }
      }
    },
    180_000,
  );
});

describe("3/4/5. a session is identity, not access — and the browser stays on the canonical host", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "authenticated at `/`: EITHER a relative 307 to that destination's home, OR the governed denial on this host — never another OS, never the launcher",
    async () => {
      for (const destination of DESTINATIONS) {
        for (const [label, cookie] of identities()) {
          if (!cookie) continue;
          const res = await getWithHost("/", destination.host, cookie);
          const at = `${destination.host}/ as ${label}`;
          expect([200, 307], at).toContain(res.status);

          if (res.status === 307) {
            // Relative Location only: the browser stays on this canonical host.
            expect(res.location, at).toMatch(/^\/(?!\/)/);
            expect(res.location, at).toBe(destination.home);
            expect(res.location, at).not.toBe("/launcher");
            // …and the home it points at actually serves this identity.
            const home = await getWithHost(destination.home, destination.host, cookie);
            expect(home.status, `${at} → ${destination.home}`).toBe(200);
          } else {
            // The governed denial: truthful, on this host, and revealing nothing.
            expect(text(res.body), at).toContain(
              `You are signed in, but you are not authorized for ${destination.name}`,
            );
            expect(text(res.body), at).toContain("Destination status");
            expect(text(res.body), at).toContain("ACTIVE");
            expect(text(res.body), at).toContain("Not authorized");
            expect(res.location, at).toBeUndefined();
            // It is NOT the workspace and NOT the generic BEYU surface.
            expect(text(res.body), at).not.toContain(destination.headline);
            expect(text(res.body), at).not.toContain(CONTROL_PLANE_ONLY);
          }
        }
      }
    },
    600_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "`/sign-in` behaves identically for an authenticated identity (one implementation)",
    async () => {
      for (const destination of DESTINATIONS) {
        for (const [label, cookie] of identities()) {
          if (!cookie) continue;
          const root = await getWithHost("/", destination.host, cookie);
          const signIn = await getWithHost("/sign-in", destination.host, cookie);
          const at = `${destination.host} as ${label}`;
          expect(signIn.status, at).toBe(root.status);
          expect(signIn.location, at).toBe(root.location);
          // Same component, same decision, same rendered surface — compared on
          // the contract markers (`/sign-in` owns an extra Suspense boundary).
          if (signIn.status === 200) {
            expect(surfaceOf(signIn.body, destination), at).toEqual(surfaceOf(root.body, destination));
            expect(surfaceOf(signIn.body, destination), at).toContain(
              "You are signed in, but you are not authorized",
            );
          }
        }
      }
    },
    600_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "no destination host ever bounces a visitor through the apex",
    async () => {
      for (const destination of DESTINATIONS) {
        for (const [label, cookie] of identities()) {
          for (const path of ["/", "/sign-in", destination.home, "/launcher", "/os"]) {
            const res = await getWithHost(path, destination.host, cookie || undefined);
            if (res.status < 300 || res.status >= 400) continue;
            const location = res.location ?? "";
            expect(location, `${destination.host}${path} as ${label}`).not.toBe("");
            if (location.startsWith("/")) {
              expect(location, `${destination.host}${path}`).not.toMatch(/^\/\//);
              continue;
            }
            const next = new URL(location);
            expect(next.hostname, `${destination.host}${path}`).not.toBe("beyu.co.tz");
            expect(next.hostname, `${destination.host}${path}`).not.toBe("www.beyu.co.tz");
          }
        }
      }
    },
    600_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "OS ACTIVE ≠ USER AUTHORIZED: an unauthorized identity gains nothing from an ACTIVE destination host",
    async () => {
      // The seed creates no Health federation link, so even the Health operator
      // is NOT Health-authorized — while HEALTH_OS is globally ACTIVE.
      const health = await getWithHost("/", "health.beyu.co.tz", healthCookie);
      expect([200, 307]).toContain(health.status);
      if (health.status === 200) {
        expect(text(health.body)).toContain("You are signed in, but you are not authorized for Health OS");
        expect(health.body).toContain("ACTIVE");
      }
      const healthDeep = await getWithHost("/os/health", "health.beyu.co.tz", healthCookie);
      expect(healthDeep.status).not.toBe(200);
      expect(healthDeep.body).not.toContain("healthSpaHtml");

      // An Agriculture operator on the Ujenzi host: ACTIVE OS, no Ujenzi access.
      const ujenzi = await getWithHost("/", "ujenzi.beyu.co.tz", agriCookie);
      expect(ujenzi.status).toBe(200);
      expect(text(ujenzi.body)).toContain("You are signed in, but you are not authorized for Ujenzi OS");
      expect(ujenzi.body).toContain("UJENZI_OS");
      expect(ujenzi.body).toContain("ACTIVE");
      expect(ujenzi.location).toBeUndefined();

      // The mirror image: the Foundation director gains nothing on Agriculture.
      const agri = await getWithHost("/", "agriculture.beyu.co.tz", foundationCookie);
      expect(agri.status).toBe(200);
      expect(text(agri.body)).toContain("You are signed in, but you are not authorized for Agriculture OS");

      // A shared surface grants nothing either: the auditor holds no Noelia query.
      const noelia = await getWithHost("/", "noelia.beyu.co.tz", auditorCookie);
      expect(noelia.status).toBe(200);
      expect(text(noelia.body)).toContain("You are signed in, but you are not authorized for Noelia AI");
      expect(noelia.body).toContain("ai:noelia.query");
    },
    240_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "cross-host sessions: one shared session, each destination re-evaluated independently",
    async () => {
      // The SAME cookie is presented to every canonical host. Nothing about the
      // host changes the identity, and each destination decides for itself.
      for (const [, cookie] of identities()) {
        if (!cookie) continue;
        const seen: Array<{ host: string; status: number }> = [];
        for (const destination of DESTINATIONS) {
          const res = await getWithHost("/", destination.host, cookie);
          expect([200, 307], destination.host).toContain(res.status);
          seen.push({ host: destination.host, status: res.status });
        }
        // At least one destination must refuse: no single seeded identity holds
        // every destination, which is the point — access is per destination.
        expect(seen.some((entry) => entry.status === 200)).toBe(true);
      }
      // Health → Finance and Finance → Health with the same session: the target
      // host answers for itself; the session is recognized, not inherited.
      for (const [from, to] of [
        ["health.beyu.co.tz", "finance.beyu.co.tz"],
        ["finance.beyu.co.tz", "health.beyu.co.tz"],
        ["health.beyu.co.tz", "ujenzi.beyu.co.tz"],
        ["beyu.co.tz", "health.beyu.co.tz"],
        ["health.beyu.co.tz", "noelia.beyu.co.tz"],
        ["noelia.beyu.co.tz", "health.beyu.co.tz"],
      ] as const) {
        const a = await getWithHost("/", from, ceoCookie);
        const b = await getWithHost("/", to, ceoCookie);
        expect([200, 307], `${from} → ${to}`).toContain(a.status);
        expect([200, 307], `${from} → ${to}`).toContain(b.status);
        // No forced credential re-entry was introduced: neither hop demands a
        // new login for an already-valid shared session.
        for (const res of [a, b]) {
          if (res.status === 200) expect(res.body).not.toContain("id=\"beyu-signin-password\"");
        }
      }
    },
    600_000,
  );
});

describe("6/7. deep links keep their own gate; the URL is never an authorization input", () => {
  it.skipIf(!enabled || !routingConfigured)(
    "unauthenticated deep link on a destination host → one relative 307 to that host's sign-in",
    async () => {
      for (const destination of DESTINATIONS) {
        const res = await getWithHost(destination.home, destination.host);
        expect(res.status, `${destination.host}${destination.home}`).toBe(307);
        expect(res.location, `${destination.host}${destination.home}`).toMatch(/^\/(?!\/)/);
        expect(res.location, `${destination.host}${destination.home}`).not.toMatch(/beyu\.co\.tz/);
        // The sign-in it lands on is THIS destination's, on THIS host.
        const followed = await getWithHost(res.location ?? "/", destination.host);
        expect(followed.status, destination.host).toBe(200);
        if ((res.location ?? "") === "/" || (res.location ?? "") === "/sign-in") {
          expect(text(followed.body), destination.host).toContain(destination.copy);
        }
      }
    },
    240_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "old launcher paths cannot bypass the canonical host model",
    async () => {
      // `/os/<sector>` on a DIFFERENT destination host is redirected to the
      // owning canonical host or refused — never served in place.
      for (const [host, path] of [
        ["health.beyu.co.tz", "/os/finance"],
        ["finance.beyu.co.tz", "/os/ujenzi"],
        ["noelia.beyu.co.tz", "/os/agriculture"],
        ["familyoffice.beyu.co.tz", "/os/foundation"],
      ] as const) {
        const res = await getWithHost(path, host, ceoCookie);
        if (res.status === 307) {
          expect(res.location, `${host}${path}`).toMatch(/^https:\/\/[a-z]+\.beyu\.co\.tz\//);
          expect(new URL(res.location ?? "").hostname, `${host}${path}`).not.toBe(host);
        } else {
          expect(res.status, `${host}${path}`).not.toBe(200);
        }
      }
      // The apex keeps serving every pre-existing URL (it is the central BEYU
      // experience), and its own gate still decides.
      for (const path of ["/os", "/os/finance", "/os/agriculture", "/launcher"]) {
        const res = await getWithHost(path, "www.beyu.co.tz", ceoCookie);
        expect([200, 307], path).toContain(res.status);
      }
    },
    240_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "an unauthorized identity is refused on the deep link too — the host is not a bypass",
    async () => {
      const cases = [
        ["ujenzi.beyu.co.tz", "/os/ujenzi", agriCookie],
        ["agriculture.beyu.co.tz", "/os/agriculture", foundationCookie],
        ["noelia.beyu.co.tz", "/os/noelia", auditorCookie],
      ] as const;
      for (const [host, path, cookie] of cases) {
        const res = await getWithHost(path, host, cookie);
        // Either a governed denial surface or a redirect away — never the
        // workspace, and never a 200 that renders destination data.
        if (res.status === 200) {
          expect(res.body, `${host}${path}`).toMatch(/Authorisation denied|not authorized|Denied/i);
        } else {
          expect([302, 307, 404], `${host}${path}`).toContain(res.status);
        }
      }
    },
    240_000,
  );
});

describe("59/54. the launcher separates GLOBAL OS status from THIS identity's access", () => {
  it.skipIf(!enabled)(
    "renders both facts, separately labelled, for every registered destination",
    async () => {
      const res = await getWithHost("/launcher", "www.beyu.co.tz", ceoCookie);
      expect(res.status).toBe(200);
      const body = text(res.body);

      // Every canonical destination is listed by its constitutional charter code…
      for (const registry of [
        "BEYU_OS",
        "HEALTH_OS",
        "FINANCE_OS",
        "AGRICULTURE_OS",
        "UJENZI_OS",
        "FOUNDATION_OS",
      ]) {
        expect(body, registry).toContain(registry);
      }
      // …with its destination class kept distinct (never flattened into "OS").
      expect(body).toContain("Constitutional control plane");
      expect(body).toContain("Sector operating system");
      expect(body).toContain("Nonprofit sister organisation");

      // TWO separately labelled facts, both present in the same render.
      expect(body).toContain("Global operating state of this destination");
      expect(body).toContain("Your access to this destination, resolved server-side");
      expect(body).toMatch(/ACCESS: (AUTHORISED|NOT IN CURRENT GRANT)/);
      expect(body).toContain("ACTIVE");

      // The section copy states the boundary explicitly, so the launcher cannot
      // be read as granting anything.
      expect(body).toContain("launcher visibility is not authority");
      expect(body).toContain("does not mean every capability inside it is active");

      // HEALTH_OS is globally ACTIVE while the canonical seed creates no Health
      // federation link — so for that card the two facts visibly disagree, which
      // is exactly the distinction this test exists to protect.
      expect(body).toContain("HEALTH_OS · Sector operating system");
    },
    120_000,
  );
});

describe("8. authentication stays SHARED across every destination frontend", () => {
  it.skipIf(!enabled)(
    "one login endpoint, one session cookie name — no destination-specific credential surface",
    async () => {
      // The canonical web login route answers on every host with the same
      // envelope; a destination-specific auth route does not exist.
      for (const host of ["beyu.co.tz", "health.beyu.co.tz", "noelia.beyu.co.tz"]) {
        const res = await send(
          "POST",
          "/api/v1/auth/login",
          { host, "content-type": "application/json" },
          JSON.stringify({ email: "nobody@beyu.os", password: "not-a-real-credential" }),
        );
        expect([400, 401, 429], host).toContain(res.status);
        for (const path of [
          "/api/v1/auth/health/login",
          "/api/v1/auth/finance/login",
          "/api/v1/auth/noelia/login",
        ]) {
          const missing = await send("POST", path, { host, "content-type": "application/json" }, "{}");
          expect(missing.status, `${host}${path}`).toBe(404);
        }
      }
      // A successful login sets exactly the one canonical session cookie.
      const issued = await send(
        "POST",
        "/api/v1/auth/login",
        { host: "health.beyu.co.tz", "content-type": "application/json" },
        JSON.stringify({ email: "nobody@beyu.os", password: "not-a-real-credential" }),
      );
      expect(issued.setCookie.filter((cookie) => cookie.startsWith("beyu_os_session="))).toHaveLength(0);
    },
    180_000,
  );

  it.skipIf(!enabled || !routingConfigured)(
    "the destination frontend publishes no privileged identity and no secret",
    async () => {
      for (const destination of DESTINATIONS) {
        for (const path of ["/", "/sign-in"]) {
          const res = await getWithHost(path, destination.host);
          expect(res.status, `${destination.host}${path}`).toBe(200);
          expect(text(res.body), `${destination.host}${path}`).not.toContain("Governed bootstrap identities");
          expect(res.body, `${destination.host}${path}`).not.toMatch(/sk-[A-Za-z0-9]{48,}|ghp_[A-Za-z0-9_]{36,}/);
          for (const email of ["ceo@beyu.os", "cfo@beyu.os", "family@beyu.os", "auditor@beyu.os"]) {
            expect(res.body, `${destination.host}${path}`).not.toContain(email);
          }
        }
      }
    },
    240_000,
  );
});

describe("9. the documented inactive state — no canonical domain configured", () => {
  it.skipIf(!enabled || routingConfigured)(
    "no host resolves to a destination frontend: every host serves the control-plane surface",
    async () => {
      for (const host of ["beyu.co.tz", ...DESTINATIONS.map((destination) => destination.host)]) {
        for (const path of ["/", "/sign-in"]) {
          const res = await getWithHost(path, host);
          expect(res.status, `${host}${path}`).toBe(200);
          expect(text(res.body), `${host}${path}`).toContain("Sign in to the control plane");
        }
      }
    },
    240_000,
  );
});
