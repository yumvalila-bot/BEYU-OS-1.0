/**
 * GOVERNED SIGN-IN — the ONE shared, destination-aware sign-in foundation.
 *
 * Every canonical entry point (`beyu.co.tz`, `health.`, `finance.`,
 * `agriculture.`, `ujenzi.`, `foundation.`, `familyoffice.`, `noelia.`) renders
 * its own first-class frontend and its own sign-in EXPERIENCE from this single
 * component, driven entirely by the canonical destination the hostname selected
 * (`src/lib/canonical-hosts.ts` → `destinationForResolution()`, whose facts live
 * on the ONE catalogue `src/lib/operating-system-catalog.ts`). There are not
 * eight authentication implementations and there is no destination-specific copy
 * of the form.
 *
 * PRESENTATION — the authoritative reference
 *   The brand composition (emblem, wordmark, descriptor, motto banner, mission
 *   statement, the five canonical pillars, the white sign-in card, the campus
 *   band, the capability strip and the navy footer) is the composition of
 *   `BEYU LOGIN PAGE .png`, implemented once in `src/app/login-surface.tsx`.
 *   This file adds ONLY the destination's own facts: its registry identity, its
 *   headline, its description, its highlights and the sub-line naming the
 *   destination it is signing in to.
 *
 * FRONTEND SEPARATION ≠ AUTHENTICATION SEPARATION
 *   The destination changes PRESENTATION only. Authentication is the shared BEYU
 *   identity: the same `SignInForm`, the same `/api/v1/auth/login`, the same
 *   session cookie policy (`src/lib/session-cookie.ts`), the same
 *   `resolvePrincipal()`, the same MFA step-up and the same audit ledger. No
 *   `health_users`, no duplicated password storage, no duplicated MFA, no
 *   parallel session authority, no second identity database.
 *
 * HOSTNAME IS NEVER AUTHENTICATION AND NEVER AUTHORIZATION
 *   Nothing here reads a credential, resolves a session or decides access. The
 *   `destination` prop is presentation resolved SERVER-SIDE from the `Host`
 *   header through the one canonical contract; a hostile or unknown host
 *   resolves to NEUTRAL and never reaches this component. Whether a signed-in
 *   identity may enter is answered only by the pre-existing server-side checks
 *   the entry page already composed (`authorizedGovernedDestinations()` for a
 *   Sector OS, the catalogue's declared `entryPermission` for a shared surface),
 *   and the destination route re-runs its own gate on arrival regardless of what
 *   any surface rendered.
 *
 * CANONICAL BEYU IDENTITY IS PRESERVED
 *   The shared `BeyuOsLogo` (the authoritative BEYU OS mark, unmodified) is
 *   rendered on every destination surface. No destination- or tenant-specific
 *   BEYU logo exists, and none may be created here.
 */
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { Icon } from "@/components/icons";
import { DESTINATION_TYPE_LABEL } from "@/lib/operating-system-catalog";
import type { CanonicalDestination } from "@/lib/canonical-hosts";
import {
  LoginCard,
  LoginCampusBand,
  LoginHero,
  LoginPillars,
  LoginShell,
  LoginTrustStrip,
} from "./login-surface";
import { SignInForm, type BootstrapIdentity } from "./sign-in-form";
import { SignOutButton } from "./os/sign-out-button";

/** The three states a canonical destination surface must be able to render. */
export type GovernedSignInProps = {
  /** The canonical destination this hostname selected. */
  destination: CanonicalDestination;
  /**
   * The same-origin route to open after a successful sign-in — computed
   * SERVER-SIDE by the page from the canonical contract, never from input.
   */
  landing: string;
  /** Governed bootstrap identities; empty (the default) in production mode. */
  identities?: BootstrapIdentity[];
  /**
   * True when the request carried a session cookie that the database no longer
   * honours — the truthful "your session expired" state, as distinct from a
   * first-time visitor. Presence only; validity is `resolvePrincipal()`'s answer.
   */
  sessionExpired?: boolean;
};

/** The governed facts every destination surface states in the same words. */
const GOVERNED_FACTS = [
  "GOVERNED BY BEYU OS",
  "ZERO TRUST",
  "RBAC + ABAC",
  "TENANT ISOLATION",
  "HASH-CHAINED AUDIT",
  "HUMAN ACCOUNTABILITY",
] as const;

/**
 * The destination's public entry surface AND its sign-in, in one server-rendered
 * page — mobile-first, keyboard-navigable, semantically headed, and recognisably
 * BEYU with the destination's own contextual accent on top of the canonical
 * brand composition.
 */
export function GovernedSignIn({ destination, landing, identities = [], sessionExpired = false }: GovernedSignInProps) {
  const d = destination.context;
  const accent = d.accent;

  return (
    <LoginShell>
      <LoginHero />

      <div className="mt-9 grid gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(340px,430px)] lg:items-start lg:gap-x-12">
        {/* The destination's own facts. Reaching this hostname selects the
            destination; it never grants it — which is what this column says. */}
        <section className="order-2 lg:order-1" aria-labelledby="beyu-destination-headline">
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#0B1F4D]/10 bg-white text-[#0B1F4D]"
              style={{ color: accent }}
              aria-hidden="true"
            >
              <Icon name={d.icon} className="h-5 w-5" />
            </span>
            <p className="beyu-kicker text-[#5b6b85]">
              {DESTINATION_TYPE_LABEL[d.destinationType]} · {d.registryCode} · {d.status}
            </p>
          </div>

          <h1
            id="beyu-destination-headline"
            className="mt-4 max-w-2xl text-[24px] leading-[1.2] font-semibold tracking-tight text-[#0B1F4D] sm:text-[29px]"
          >
            {d.headline}
          </h1>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-[#41527a]">{d.description}</p>

          <ul className="mt-5 grid max-w-2xl list-none gap-2 p-0 sm:grid-cols-2">
            {d.highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-xl border border-[#0B1F4D]/10 bg-white/70 px-3.5 py-2.5 text-[12px] leading-relaxed text-[#41527a]"
              >
                {highlight}
              </li>
            ))}
          </ul>

          <LoginPillars className="mt-8" />

          <LoginTrustStrip items={GOVERNED_FACTS} />
          <p className="mt-4 text-[10.5px] tracking-[0.12em] text-[#5b6b85]">BRIDGING CARE. BUILDING TRUST.</p>
        </section>

        {/* The ONE shared sign-in. Destination-aware presentation, shared
            authentication: same endpoint, same cookie, same MFA. */}
        <div className="order-1 lg:order-2">
          <LoginCard
            titleId="beyu-destination-signin-title"
            signInSubtitle={destination.signInSubtitle}
            className="mt-0"
          >
            <SignInForm
              identities={identities}
              landing={landing}
              destinationName={d.name}
              sessionExpired={sessionExpired}
            />
          </LoginCard>

          <p className="mt-4 text-[11px] leading-relaxed text-[#5b6b85]">
            Reaching this hostname does not grant access. {d.name} is governed by BEYU OS: least-privilege,
            tenant-isolated and fully audited, with step-up authentication for high-risk capabilities. Your access
            is decided server-side after sign-in.
          </p>
        </div>
      </div>

      <LoginCampusBand
        notices={
          <p className="text-[11px] leading-relaxed">
            Access is least-privilege and fully audited. High-risk capabilities require step-up authentication.
            Unauthorised access attempts are recorded in the immutable audit ledger. First-time setup?{" "}
            <a
              href="/enroll"
              className="text-[#e2c25f] underline underline-offset-2 hover:text-white focus-visible:ring-2 focus-visible:ring-[#e2c25f]/60 focus-visible:outline-none"
            >
              Enroll the initial administrator
            </a>
            .
          </p>
        }
      />
    </LoginShell>
  );
}

/**
 * The governed ACCESS-DENIED state for a canonical destination: the identity is
 * signed in, the destination is ACTIVE, and this identity does not hold access
 * to it.
 *
 * This state exists because "authenticated" and "authorized" are different
 * questions, and previously a signed-in visitor without the destination's grant
 * was silently bounced to the shared launcher (or to whichever other OS they did
 * hold) instead of being told the truth on the host they asked for.
 *
 * It grants nothing, exposes nothing and elevates nothing: no destination data,
 * no admin control, no hidden route. It states the two facts separately — the
 * GLOBAL operating status of the destination and THIS identity's access — which
 * must never be conflated, and it points at the two governed exits that already
 * exist (the launcher, which re-runs its own resolver, and sign-out).
 */
export function DestinationDenied({
  destination,
  displayName,
  email,
}: {
  destination: CanonicalDestination;
  displayName: string;
  email: string;
}) {
  const d = destination.context;
  const accent = d.accent;
  const requirement =
    destination.hostKind === "SURFACE" && "entryPermission" in d
      ? d.entryPermission
      : `${d.registryCode} governed OS authorization`;

  return (
    <LoginShell>
      <div className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center py-12">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex w-fit items-center justify-center rounded-2xl bg-white p-2 ring-1 ring-[#0B1F4D]/10">
            <BeyuOsLogo size={40} ariaLabel="BEYU OS — governed identity" />
          </span>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[#0B1F4D]/10 bg-white"
            style={{ color: accent }}
            aria-hidden="true"
          >
            <Icon name={d.icon} className="h-5 w-5" />
          </span>
        </div>

        <p className="beyu-kicker mt-8 text-[#5b6b85]">
          {DESTINATION_TYPE_LABEL[d.destinationType]} · {d.registryCode}
        </p>

        <h1 className="mt-3 max-w-2xl text-[24px] leading-[1.2] font-semibold tracking-tight text-[#0B1F4D] sm:text-[28px]">
          You are signed in, but you are not authorized for {d.name}.
        </h1>

        <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-[#41527a]">
          Your BEYU identity is valid. Access to {d.name} is decided separately, server-side, and your current
          grants do not reach it. Reaching this hostname selects the destination — it never grants it.
        </p>

        {/* The two facts, kept apart on purpose: global OS status is NOT this
            identity's access, and this identity's access is NOT the OS status. */}
        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-[#0B1F4D]/10 bg-white/80 px-4 py-3">
            <dt className="beyu-kicker text-[#5b6b85]">Destination status</dt>
            <dd className="mt-1.5 text-[13px] font-semibold text-[#0B1F4D]">
              {d.name} · {d.status}
            </dd>
            <dd className="mt-1 text-[11.5px] leading-relaxed text-[#5b6b85]">
              The destination is live and governed. This is a global fact, not a statement about your identity.
            </dd>
          </div>
          <div className="rounded-xl border border-[#0B1F4D]/10 bg-white/80 px-4 py-3">
            <dt className="beyu-kicker text-[#5b6b85]">Your access</dt>
            <dd className="mt-1.5 text-[13px] font-semibold text-[#a03434]">Not authorized</dd>
            <dd className="mt-1 text-[11.5px] leading-relaxed text-[#5b6b85]">
              Signed in as {displayName} ({email}).
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-[#0B1F4D]/10 bg-white/80 px-4 py-3">
          <div className="beyu-kicker text-[#5b6b85]">Required for this destination</div>
          <div className="mt-1 font-mono text-[12px] text-[#0B1F4D]">{requirement}</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-[#5b6b85]">
            Request a governed grant through Identity &amp; Access in BEYU OS. Denials are handled under least
            privilege; no capability is widened by this page.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/launcher"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#0B1F4D]/25 bg-white px-5 text-[12.5px] font-semibold text-[#0B1F4D] transition hover:border-[#0B1F4D]/45 focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none"
          >
            View destinations I can access
          </a>
          <SignOutButton className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0B1F4D] px-5 text-[12.5px] font-semibold text-white transition hover:bg-[#132c62] focus-visible:ring-2 focus-visible:ring-[#0B1F4D]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60" />
        </div>
      </div>
    </LoginShell>
  );
}

/*
 * WHY THERE IS NO `loading.tsx` ON `/` OR `/sign-in`
 *   A route-level Suspense boundary commits the HTTP 200 and streams the
 *   fallback BEFORE the page body resolves. The canonical entry page is a
 *   server-side ROUTER as well as a surface: for a signed-in identity it calls
 *   `redirect(<destination home>)`, which must leave the server as a real
 *   relative 307 so the browser stays on the canonical hostname. Behind a
 *   `loading.tsx` the status is already committed and Next.js degrades that
 *   redirect to a client-side navigation — exactly the "client-side JavaScript
 *   as the primary routing mechanism" the architecture forbids, and a
 *   measurable regression (verified: `/sign-in` returned 200 where `/` returned
 *   307 for the same identity on the same host).
 *
 *   The AUTHENTICATION LOADING state therefore lives where it belongs — inside
 *   the shared form (`SignInForm`): the submit button disables, reports
 *   `aria-busy` and reads "Authenticating…", and a failure is announced through
 *   the assertive `beyu-signin-error` live region. The authenticated OS shell
 *   keeps its own pre-existing boundary (`src/app/os/loading.tsx`), which is
 *   safe because that segment never redirects on the identity's behalf.
 */
