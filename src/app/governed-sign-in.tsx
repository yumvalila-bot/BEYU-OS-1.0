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
 * FRONTEND SEPARATION ≠ AUTHENTICATION SEPARATION
 *   The destination changes PRESENTATION only — the name, the headline, the
 *   contextual accent, the highlights and the accessible name of the form.
 *   Authentication is the shared BEYU identity: the same `SignInForm`, the same
 *   `/api/v1/auth/login`, the same session cookie policy
 *   (`src/lib/session-cookie.ts`), the same `resolvePrincipal()`, the same MFA
 *   step-up and the same audit ledger. No `health_users`, no duplicated password
 *   storage, no duplicated MFA, no parallel session authority, no second
 *   identity database.
 *
 * HOSTNAME IS NEVER AUTHENTICATION AND NEVER AUTHORIZATION
 *   Nothing here reads a credential, resolves a session or decides access. The
 *   `destination` prop is presentation resolved SERVER-SIDE from the `Host`
 *   header through the one canonical contract; a hostile or unknown host
 *   resolves to NEUTRAL and never reaches this component. Whether a signed-in
 *   identity may enter is answered only by the pre-existing server-side checks
 *   the entry page already composed (`authorizedOperatingSystems()` for a Sector
 *   OS, the catalogue's declared `entryPermission` for a shared surface), and the
 *   destination route re-runs its own gate on arrival regardless of what any
 *   surface rendered.
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

/**
 * The destination's public entry surface AND its sign-in, in one server-rendered
 * page — mobile-first, keyboard-navigable, semantically headed, and recognisably
 * BEYU (navy shell, gold rule, authoritative mark) with a contextual accent.
 */
export function GovernedSignIn({
  destination,
  landing,
  identities = [],
  sessionExpired = false,
}: GovernedSignInProps) {
  const d = destination.context;
  const accent = d.accent;

  return (
    <main className="beyu-shell min-h-screen text-white">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
        <section className="flex flex-col justify-center" aria-labelledby="beyu-destination-headline">
          {/* Shared BEYU identity + the destination's own mark. The BEYU OS mark
              is the authoritative PNG on a light plate (its studio matte), never
              a per-destination redraw. */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex w-fit items-center justify-center rounded-2xl bg-white p-2">
              <BeyuOsLogo size={48} ariaLabel="BEYU OS — governed identity" />
            </span>
            <span
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]"
              style={{ color: accent }}
              aria-hidden="true"
            >
              <Icon name={d.icon} className="h-6 w-6" />
            </span>
          </div>

          <p className="beyu-kicker mt-8" style={{ color: accent }}>
            {DESTINATION_TYPE_LABEL[d.destinationType]} · {d.registryCode} · {d.status}
          </p>

          <div className="beyu-gold-rule my-6 max-w-xl" />

          <h1
            id="beyu-destination-headline"
            className="max-w-2xl text-[30px] font-semibold leading-[1.15] tracking-tight sm:text-[34px] lg:text-[42px]"
          >
            {d.headline}
          </h1>
          <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-white/70">{d.description}</p>

          <ul className="mt-8 grid max-w-2xl list-none gap-3 p-0 sm:grid-cols-2">
            {d.highlights.map((highlight) => (
              <li
                key={highlight}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-[12px] leading-relaxed text-white/70"
              >
                {highlight}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[10.5px] tracking-[0.16em] text-white/40">
            <span>GOVERNED BY BEYU OS</span>
            <span>ZERO TRUST</span>
            <span>RBAC + ABAC</span>
            <span>TENANT ISOLATION</span>
            <span>HASH-CHAINED AUDIT</span>
            <span>HUMAN ACCOUNTABILITY</span>
          </div>
          <p className="mt-4 text-[10.5px] tracking-[0.12em] text-white/35">
            BRIDGING CARE. BUILDING TRUST.
          </p>
        </section>

        <section className="flex items-center justify-center" aria-labelledby="beyu-destination-signin-title">
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/12 bg-white/[0.06] backdrop-blur">
            {/* Contextual accent — the destination's own visual language, on top
                of the canonical BEYU surface. */}
            <div className="h-1 w-full" style={{ background: accent }} aria-hidden="true" />
            <div className="p-7">
              <div className="flex items-center gap-3">
                <span className="inline-flex w-fit items-center justify-center rounded-lg bg-white p-1">
                  <BeyuOsLogo size={30} ariaLabel="BEYU OS" />
                </span>
                <div className="min-w-0">
                  <div id="beyu-destination-signin-title" className="text-[15px] font-semibold">
                    {d.name}
                  </div>
                  <div className="text-[11.5px] text-white/60">{destination.signInSubtitle}</div>
                </div>
              </div>

              <div className="beyu-gold-rule my-5" />

              {/* The expired-session notice is rendered by the shared form itself
                  (`sessionExpired`), so the control-plane surface and every
                  destination surface announce it identically — one definition. */}
              <SignInForm
                identities={identities}
                landing={landing}
                destinationName={d.name}
                sessionExpired={sessionExpired}
              />

              <p className="mt-6 text-[10.5px] leading-relaxed text-white/45">
                Reaching this hostname does not grant access. {d.name} is governed by BEYU OS:
                least-privilege, tenant-isolated and fully audited, with step-up authentication for
                high-risk capabilities. Your access is decided server-side after sign-in.
              </p>
              <p className="mt-3 text-[10.5px] text-white/40">
                First-time setup?{" "}
                <a href="/enroll" className="text-[#d4af37] underline-offset-2 hover:underline">
                  Enroll the initial administrator
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
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
    <main className="beyu-shell min-h-screen text-white">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-12">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex w-fit items-center justify-center rounded-2xl bg-white p-2">
            <BeyuOsLogo size={40} ariaLabel="BEYU OS — governed identity" />
          </span>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]"
            style={{ color: accent }}
            aria-hidden="true"
          >
            <Icon name={d.icon} className="h-5 w-5" />
          </span>
        </div>

        <p className="beyu-kicker mt-8" style={{ color: accent }}>
          {DESTINATION_TYPE_LABEL[d.destinationType]} · {d.registryCode}
        </p>

        <h1 className="mt-3 max-w-2xl text-[26px] font-semibold leading-[1.2] tracking-tight sm:text-[30px]">
          You are signed in, but you are not authorized for {d.name}.
        </h1>

        <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-white/70">
          Your BEYU identity is valid. Access to {d.name} is decided separately, server-side, and
          your current grants do not reach it. Reaching this hostname selects the destination — it
          never grants it.
        </p>

        {/* The two facts, kept apart on purpose: global OS status is NOT this
            identity's access, and this identity's access is NOT the OS status. */}
        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <dt className="beyu-kicker text-white/45">Destination status</dt>
            <dd className="mt-1.5 text-[13px] font-semibold text-white">
              {d.name} · {d.status}
            </dd>
            <dd className="mt-1 text-[11.5px] leading-relaxed text-white/55">
              The destination is live and governed. This is a global fact, not a statement about your
              identity.
            </dd>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
            <dt className="beyu-kicker text-white/45">Your access</dt>
            <dd className="mt-1.5 text-[13px] font-semibold text-[#f2a3a3]">Not authorized</dd>
            <dd className="mt-1 text-[11.5px] leading-relaxed text-white/55">
              Signed in as {displayName} ({email}).
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <div className="beyu-kicker text-white/45">Required for this destination</div>
          <div className="mt-1 font-mono text-[12px] text-white/80">{requirement}</div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-white/55">
            Request a governed grant through Identity &amp; Access in BEYU OS. Denials are handled
            under least privilege; no capability is widened by this page.
          </p>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="/launcher"
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-white/20 bg-white/[0.06] px-5 text-[12.5px] font-semibold text-white transition hover:border-white/35 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4af37]"
          >
            View destinations I can access
          </a>
          <SignOutButton className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#d4af37] px-5 text-[12.5px] font-semibold text-[#0b1d3a] transition hover:bg-[#e2c25f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60" />
        </div>
      </div>
    </main>
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
