import { redirect } from "next/navigation";
import { resolvePrincipalForPage } from "@/lib/guard";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { SignInForm, type BootstrapIdentity } from "./sign-in-form";
import { DestinationDenied, GovernedSignIn } from "./governed-sign-in";
import { LoginCampusBand, LoginCard, LoginHero, LoginPillars, LoginShell, LoginTrustStrip } from "./login-surface";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import { canonicalHostForRequest } from "@/lib/canonical-host";
import { canonicalContextOf, destinationForResolution } from "@/lib/canonical-hosts";
import { sessionCookiePresent } from "@/lib/session-state";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * True when this instance is serving in production mode.
 *
 * WHY NODE_ENV AND NOT VERCEL_ENV
 *   `VERCEL_ENV` was tried first and empirically does not work: with
 *   `VERCEL_ENV=production` exported to `next start`, the server still rendered
 *   the bootstrap identities, i.e. the value was not observable at request time
 *   (Next.js inlines statically-analysable `process.env` references in server
 *   code at build time). Shipping a control that does not actually fire would be
 *   worse than no control, because it reads as protected while publishing the
 *   same data.
 *
 *   `NODE_ENV` is set by the runner itself — `next start` always runs with
 *   `NODE_ENV=production`, `next dev` with `development` — so it cannot be
 *   missed. The rule is therefore: the provisioning hint exists only under the
 *   development server. Any production-mode server (local `next start`, Vercel
 *   preview, Vercel production) suppresses it. That is the safe direction: the
 *   failure mode of this control is a missing convenience, never a disclosure.
 */
function isProductionDeployment(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Governed bootstrap identities — a provisioning convenience for non-production
 * environments only.
 *
 * This lives in a SERVER component and is never imported by client code, so in a
 * production build these addresses are not in the HTML and not in any shipped
 * JavaScript chunk. Publishing them on an unauthenticated page would hand an
 * attacker the exact mailboxes to target and the authority each one holds.
 */
const BOOTSTRAP_IDENTITIES: BootstrapIdentity[] = [
  { email: "ceo@beyu.os", role: "Group Chief Executive" },
  { email: "cfo@beyu.os", role: "Group CFO — Finance OS authority" },
  { email: "governance@beyu.os", role: "Chief Governance Officer" },
  { email: "risk@beyu.os", role: "Chief Risk & Compliance" },
  { email: "family@beyu.os", role: "Family Office Principal" },
  { email: "auditor@beyu.os", role: "Internal Auditor (read-only)" },
];

/**
 * What BEYU OS governs — the control plane's own substance, stated under the
 * canonical brand pillars. (The five pillars themselves render from the ONE
 * canonical definition in `login-surface.tsx`, so the brand statement cannot
 * drift between the control plane and the destination surfaces.)
 */
const GOVERNANCE_FOUNDATIONS = [
  { title: "Trust", copy: "One constitution, one authority model, one audit truth." },
  { title: "Care", copy: "Family, workforce and beneficiary data held to the highest tier." },
  { title: "Integrity", copy: "Hash-chained audit; financial history is never overwritten." },
  { title: "Innovation", copy: "Noelia AI on the HIVE runtime — governed, never unbounded." },
  { title: "Impact", copy: "Capital, waterfall and foundation allocation, fully explainable." },
];

/** The control plane's governed posture, stated as facts, not as claims. */
const CONTROL_PLANE_FACTS = [
  "ZERO TRUST",
  "RBAC + ABAC",
  "TENANT ISOLATION",
  "HASH-CHAINED AUDIT",
  "JURISDICTION AWARE",
  "HUMAN ACCOUNTABILITY",
] as const;

/**
 * The canonical BEYU entry surface, on EVERY canonical host.
 *
 *   • a DESTINATION host (`health.`/`finance.`/`agriculture.`/`ujenzi.`/
 *     `foundation.`/`familyoffice.`/`noelia.`) renders that destination's OWN
 *     first-class frontend and sign-in (`GovernedSignIn`), or its governed
 *     access-denied state (`DestinationDenied`) for a signed-in identity that
 *     does not hold access;
 *   • the apex, `www` and every NEUTRAL host (preview, unconfigured apex,
 *     unknown subdomain, malformed Host, governed tenant hostname) render the
 *     pre-existing BEYU control-plane surface — its copy, smart routing and
 *     bootstrap-identity gate untouched — now presented in the canonical BEYU
 *     login composition of the authoritative reference, with the shared
 *     expired-session notice the destination surfaces also carry.
 *
 * `/sign-in` is the SAME implementation on the same hosts — see
 * `src/app/sign-in/page.tsx`. There is one sign-in, not eight.
 */
export default async function SignInPage() {
  const principal = await resolvePrincipalForPage();

  /*
   * Canonical destination host (presentation only).
   *
   * Every canonical OS/subdomain is an INDEPENDENT USER ENTRY POINT: on
   * `health.beyu.co.tz` this page is the Health OS entry, on
   * `foundation.beyu.co.tz` the Foundation entry, on `familyoffice.beyu.co.tz`
   * the Family Office capability entry and on `noelia.beyu.co.tz` the governed
   * Noelia AI entry. The sign-in form is titled for that destination and, after
   * sign-in, lands on its canonical route. The host is resolved SERVER-SIDE
   * through the one canonical contract (`src/lib/canonical-hosts.ts`); it is
   * never an authorization input, and the browser URL stays on the canonical
   * hostname — no redirect through `beyu.co.tz`.
   *
   * Reaching a destination host authorizes nothing. The authenticated branch
   * below redirects only through the destination's OWN server-side gate:
   *   • a Sector OS → `authorizedGovernedDestinations()` (session → tenant →
   *     classification → RBAC/ABAC → federation/OS authorization) must already
   *     list it;
   *   • Foundation → live Foundation tenant scope plus a governed read grant;
   *   • Family Office or Noelia → its declared guard permission;
   * and the destination re-runs that gate on arrival regardless. Otherwise the
   * governed DENIAL below is rendered on this host: a session is identity, not
   * access, and a signed-in visitor is never silently sent to a different OS.
   */
  const canonicalHost = await canonicalHostForRequest();
  const hostDestination = destinationForResolution(canonicalHost);
  // The control plane and neutral hosts keep the pre-existing copy and landing.
  const requestedContext =
    canonicalHost.kind === "SECTOR_OS" || canonicalHost.kind === "SURFACE"
      ? canonicalContextOf(canonicalHost)
      : null;
  // A cookie the database no longer honours is the truthful "session expired"
  // state, distinct from a first-time visitor. Presence only — never validity.
  const sessionExpired = !principal && (await sessionCookiePresent());
  const identities = isProductionDeployment() ? [] : BOOTSTRAP_IDENTITIES;

  if (principal) {
    // Smart routing resolves the one BEYU control plane and each authorised
    // Sector OS independently. A session alone never creates OS access.
    const destinations = await authorizedGovernedDestinations(principal);
    if (canonicalHost.kind === "SECTOR_OS" && destinations.some((destination) => destination.code === canonicalHost.os.code)) {
      redirect(canonicalHost.os.href);
    }
    // A non-OS destination is entered only when its existing authoritative
    // resolver allows it. Foundation requires target-tenant scope plus a read
    // grant; shared surfaces retain their own declared page permission.
    if (canonicalHost.kind === "SURFACE") {
      const allowed =
        canonicalHost.surface.code === "FOUNDATION"
          ? destinations.some((destination) => destination.code === "FOUNDATION")
          : can(principal, canonicalHost.surface.entryPermission).allowed;
      if (allowed) redirect(canonicalHost.surface.href);
    }
    /*
     * GOVERNED DENIAL ON THE DESTINATION HOST.
     *
     * The identity is valid and the destination is ACTIVE, but this identity
     * does not hold access to it. Previously this fell through to the
     * control-plane routing below and silently sent the visitor to `/launcher`
     * or to whichever OTHER OS they did hold — which both hides the real answer
     * and forces a destination host through the BEYU launcher. The truthful
     * state is rendered here, on the host that was asked for: global OS status
     * and this identity's access are stated separately and never conflated.
     *
     * It grants nothing and exposes nothing — no destination data, no admin
     * control, no hidden route — and the destination's own gate still runs for
     * any direct deep link.
     */
    if (hostDestination && requestedContext) {
      return (
        <DestinationDenied
          destination={hostDestination}
          displayName={principal.displayName}
          email={principal.email}
        />
      );
    }
    if (destinations.length > 1) redirect("/launcher");
    if (destinations.length === 1) redirect(destinations[0].href);
    // With no authorised destination, retain the sign-in surface rather than
    // advertising an unusable control plane.
  }

  /*
   * UNAUTHENTICATED ON A DESTINATION HOST — that destination's own first-class
   * frontend and sign-in. Shared BEYU identity underneath: the same form, the
   * same `/api/v1/auth/login`, the same session cookie, the same MFA and the
   * same audit ledger. Only the presentation names the destination.
   */
  if (!principal && hostDestination && requestedContext) {
    return (
      <GovernedSignIn
        destination={hostDestination}
        identities={identities}
        sessionExpired={sessionExpired}
        landing={requestedContext ? requestedContext.href : "/os"}
      />
    );
  }

  return (
    <LoginShell>
      <LoginHero />

      <div className="mt-9 grid gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)] lg:items-start lg:gap-x-12">
        <section className="order-2 lg:order-1" aria-labelledby="beyu-controlplane-headline">
          <div className="flex items-center gap-3">
            {/* Authoritative BEYU OS mark (control-plane identity). The
                authoritative PNG carries a white studio matte, so on this
                surface it is presented on a light plate — the standard raster
                logo treatment; the asset itself is untouched. */}
            <span className="inline-flex w-fit items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-[#0B1F4D]/10">
              <BeyuOsLogo size={44} ariaLabel="BEYU OS — Global Enterprise Control Plane" />
            </span>
            <p className="beyu-kicker text-[#5b6b85]">BEYU OS · GLOBAL ENTERPRISE CONTROL PLANE</p>
          </div>

          <h1
            id="beyu-controlplane-headline"
            className="mt-4 max-w-2xl text-[24px] leading-[1.2] font-semibold tracking-tight text-[#0B1F4D] sm:text-[29px]"
          >
            The constitutional control plane of the <span className="beyu-gold-ink">BEYU ecosystem</span>.
          </h1>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-[#41527a]">
            BEYU OS governs identity, organisation, ownership, governance, risk, compliance, capital,
            workforce, data, audit and AI once — and only once. Health OS, Finance OS, Agriculture OS
            and Ujenzi OS are exactly the four Sector OSs beneath it. The separate nonprofit BEYU Foundation
            consumes shared capabilities through its own governed tenant and legal-entity scope.
          </p>

          <LoginPillars
            className="mt-8"
            extra={
              <div className="mt-6 rounded-2xl border border-[#0B1F4D]/10 bg-white/70 p-4">
                <h3 className="beyu-kicker text-[#5b6b85]">Governance foundations</h3>
                <dl className="mt-3 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {GOVERNANCE_FOUNDATIONS.map((foundation) => (
                    <div key={foundation.title} className="text-[12px] leading-relaxed">
                      <dt className="font-semibold text-[#0B1F4D]">{foundation.title}</dt>
                      <dd className="text-[#5b6b85]">{foundation.copy}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            }
          />

          <LoginTrustStrip items={CONTROL_PLANE_FACTS} />
        </section>

        <div className="order-1 lg:order-2">
          <LoginCard
            titleId="beyu-controlplane-signin-title"
            signInSubtitle={"Sign in to the control plane"}
            className="mt-0"
          >
            {/*
              The bootstrap-identity hint is a provisioning convenience, not a
              feature of a live control plane. Publishing privileged account
              addresses and their roles on an unauthenticated production page is
              a username-enumeration aid: it tells an attacker exactly which six
              mailboxes to attack and what authority each one holds. It is
              therefore rendered outside production only.

              The decision is made SERVER-SIDE and passed in as a prop, so no
              environment value is ever exposed to the client bundle.
            */}
            <SignInForm
              identities={identities}
              sessionExpired={sessionExpired}
              landing={requestedContext ? requestedContext.href : "/os"}
            />
          </LoginCard>

          <p className="mt-4 text-[11px] leading-relaxed text-[#5b6b85]">
            Access is least-privilege and fully audited. High-risk capabilities require step-up
            authentication. Unauthorised access attempts are recorded in the immutable audit ledger.
          </p>
        </div>
      </div>

      <LoginCampusBand
        notices={
          <p className="text-[11px] leading-relaxed">
            First-time setup?{" "}
            <a
              href="/enroll"
              className="text-[#e2c25f] underline underline-offset-2 hover:text-white focus-visible:ring-2 focus-visible:ring-[#e2c25f]/60 focus-visible:outline-none"
            >
              Enroll the initial administrator
            </a>
            . Reaching a hostname grants nothing: identity, access and tenant scope are decided server-side, and
            every consequential action is attributable in the audit ledger.
          </p>
        }
      />
    </LoginShell>
  );
}
