import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { SignInForm, type BootstrapIdentity } from "./sign-in-form";
import { DestinationDenied, GovernedSignIn } from "./governed-sign-in";
import { authorizedOperatingSystems } from "@/lib/operating-systems";
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

const PILLARS = [
  { title: "Trust", copy: "One constitution, one authority model, one audit truth." },
  { title: "Care", copy: "Family, workforce and beneficiary data held to the highest tier." },
  { title: "Integrity", copy: "Hash-chained audit; financial history is never overwritten." },
  { title: "Innovation", copy: "Noelia AI on the HIVE runtime — governed, never unbounded." },
  { title: "Impact", copy: "Capital, waterfall and foundation allocation, fully explainable." },
];

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
 *     pre-existing BEYU control-plane surface exactly as before — its copy,
 *     layout, smart routing and bootstrap-identity gate are untouched, and the
 *     only addition is the shared expired-session notice the destination
 *     surfaces also carry.
 *
 * `/sign-in` is the SAME implementation on the same hosts — see
 * `src/app/sign-in/page.tsx`. There is one sign-in, not eight.
 */
export default async function SignInPage() {
  const principal = await resolvePrincipal();

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
   *   • a Sector OS → `authorizedOperatingSystems()` (session → tenant →
   *     classification → RBAC/ABAC → federation/OS authorization) must already
   *     list it;
   *   • a shared surface (Family Office capability, Noelia AI) → the
   *     destination's own declared guard permission must already be granted;
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
    const destinations = await authorizedOperatingSystems(principal);
    if (canonicalHost.kind === "SECTOR_OS" && destinations.some((destination) => destination.code === canonicalHost.os.code)) {
      redirect(canonicalHost.os.href);
    }
    // A shared surface is entered only when the destination's own guard would
    // already allow it (the same honesty rule the launcher and capability map
    // follow). It grants nothing: the page re-checks server-side.
    if (canonicalHost.kind === "SURFACE" && can(principal, canonicalHost.surface.entryPermission).allowed) {
      redirect(canonicalHost.surface.href);
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
    <main className="beyu-shell min-h-screen text-white">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
        <section className="flex flex-col justify-center">
          {/* Authoritative BEYU OS mark (control-plane identity). The
              authoritative PNG carries a white studio matte, so on this dark
              surface it is presented on a light plate — the standard raster
              logo treatment; the asset itself is untouched. */}
          <span className="inline-flex w-fit items-center justify-center rounded-2xl bg-white p-2">
            <BeyuOsLogo size={64} ariaLabel="BEYU OS — Global Enterprise Control Plane" />
          </span>

          <div className="beyu-gold-rule my-8 max-w-xl" />

          <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.15] tracking-tight lg:text-[42px]">
            The constitutional control plane of the{" "}
            <span className="text-[#d4af37]">BEYU ecosystem</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-white/70">
            BEYU OS governs identity, organisation, ownership, governance, risk, compliance, capital,
            workforce, data, audit and AI once — and only once. Health OS, Finance OS, Agriculture OS
            and Foundation OS execute specialised operations underneath it, consuming shared
            capabilities through governed APIs, events and policies.
          </p>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="text-[12.5px] font-semibold text-[#d4af37]">{p.title}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-white/65">{p.copy}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[10.5px] tracking-[0.16em] text-white/40">
            <span>ZERO TRUST</span>
            <span>RBAC + ABAC</span>
            <span>TENANT ISOLATION</span>
            <span>HASH-CHAINED AUDIT</span>
            <span>JURISDICTION AWARE</span>
            <span>HUMAN ACCOUNTABILITY</span>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-white/[0.06] p-7 backdrop-blur">
            <div className="flex items-center gap-3">
              <span className="inline-flex w-fit items-center justify-center rounded-lg bg-white p-1">
                <BeyuOsLogo size={30} ariaLabel="BEYU OS" />
              </span>
              <div>
                <div className="text-[15px] font-semibold">Welcome</div>
                <div className="text-[11.5px] text-white/60">
                  {requestedContext
                    ? `Sign in to ${requestedContext.name} — governed by BEYU OS`
                    : "Sign in to the control plane"}
                </div>
              </div>
            </div>
            <div className="beyu-gold-rule my-5" />
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
            <p className="mt-6 text-[10.5px] leading-relaxed text-white/45">
              Access is least-privilege and fully audited. High-risk capabilities require step-up
              authentication. Unauthorised access attempts are recorded in the immutable audit ledger.
            </p>
            <p className="mt-3 text-[10.5px] text-white/40">
              First-time setup?{" "}
              <a href="/enroll" className="text-[#d4af37] underline-offset-2 hover:underline">
                Enroll the initial administrator
              </a>
              .
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
