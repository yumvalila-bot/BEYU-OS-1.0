/**
 * THE CANONICAL ENTRY MODULE — `/`, `/sign-in` and every destination host.
 *
 * ONE resolver, ONE authentication implementation (`GovernedSignIn`, which
 * composes the one shared `SignInForm` and posts to `/api/v1/auth/login`), TWO
 * canonical URLs:
 *
 *   `/sign-in`   → the governed sign-in on EVERY hostname. The host selects the
 *                  CONTEXT COPY (control plane, a Sector OS or a surface), never
 *                  a second authentication implementation.
 *   `/`          → the PUBLIC HOMEPAGE on the control-plane host only (the apex
 *                  and `www`). On a Sector OS or surface host, and on any NEUTRAL
 *                  host (no Host, malformed, look-alike, unknown label, preview
 *                  host, governed tenant hostname), `/` is the governed sign-in
 *                  exactly like `/sign-in`.
 *
 * WHY THE HOMEPAGE IS CONFINED TO THE CONTROL-PLANE HOST
 *   The apex is BEYU's public front door, so it carries the marketing surface
 *   and links to `/sign-in`. Every other hostname is an entry point into a
 *   governed destination and serves the governed sign-in. A hostile or unknown
 *   Host resolves to NEUTRAL, never to CONTROL_PLANE, so it cannot obtain the
 *   homepage by lying about the Host: it receives the control-plane sign-in and
 *   can never select a destination frontend.
 *
 * SECURITY — unchanged by the presentation choice above
 *   • The `variant` is a compile-time route constant, never a query string or
 *     client input, and it changes no authorization decision.
 *   • Authorization is decided server-side here and re-evaluated by the
 *     destination route on arrival.
 *   • Every post-authentication landing is a server-computed same-origin path
 *     derived from the canonical contract, so no route here is an open redirector.
 *   • `identities` is empty in production, so no privileged username is
 *     serialised into any unauthenticated surface's HTML.
 */
import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { NOELIA_CANONICAL_APPEARANCE } from "@/components/brand-assets";
import type { BootstrapIdentity } from "./sign-in-form";
import { DestinationDenied, GovernedSignIn } from "./governed-sign-in";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import { canonicalHostForRequest, destinationHrefForRequest, entryHrefForRequest } from "@/lib/canonical-host";
import { CONTROL_PLANE_DESTINATION, destinationForResolution } from "@/lib/canonical-hosts";
import {
  CANONICAL_SURFACES,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import { sessionCookiePresent } from "@/lib/session-state";
import { can } from "@/lib/authz";
import { PublicNewsEvents } from "@/components/public-news-events";


export const dynamic = "force-dynamic";

function isProductionDeployment(): boolean {
  return process.env["NODE_ENV"] === "production";
}

const BOOTSTRAP_IDENTITIES: BootstrapIdentity[] = [
  { email: "ceo@beyu.os", role: "Group Chief Executive" },
  { email: "cfo@beyu.os", role: "Group CFO — Finance OS authority" },
  { email: "governance@beyu.os", role: "Chief Governance Officer" },
  { email: "risk@beyu.os", role: "Chief Risk & Compliance" },
  { email: "family@beyu.os", role: "Family Office Principal" },
  { email: "auditor@beyu.os", role: "Internal Auditor (read-only)" },
];

/* -------------------------------------------------------------------------- */
/* The public destination gateway — catalogue-driven, never a host literal     */
/* -------------------------------------------------------------------------- */

/**
 * The destinations the PUBLIC gateway offers, in canonical order: the four Sector
 * OSs (the catalogue is constitutionally closed at four), then the Foundation
 * nonprofit sister organization, then the two shared surfaces.
 *
 * WHY THIS EXISTS
 *   The gateway used to spell the seven production DESTINATION hostnames into its
 *   own markup. That is a SECOND host table beside the ONE canonical contract, and
 *   it rendered links to hosts that are not attached in an environment where
 *   `BEYU_CANONICAL_DOMAIN` is not configured (a preview deployment carries no
 *   canonical hosts at all). The destination list and every label now come from
 *   the catalogue, and the entry URL comes from the contract (canonical host when
 *   the apex is configured, internal route otherwise). No file outside
 *   `src/lib/canonical-hosts.ts` composes a canonical hostname.
 */
const GATEWAY_DESTINATIONS = [
  ...SECTOR_OPERATING_SYSTEMS,
  FOUNDATION_ORGANIZATION,
  ...CANONICAL_SURFACES,
] as const;

const FAMILY_OFFICE_SURFACE = CANONICAL_SURFACES.find((surface) => surface.code === "FAMILY_OFFICE")!;
const NOELIA_SURFACE = CANONICAL_SURFACES.find((surface) => surface.code === "NOELIA_AI")!;
const HEALTH_DESTINATION = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "HEALTH")!;
const FINANCE_DESTINATION = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "FINANCE")!;
const AGRICULTURE_DESTINATION = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "AGRICULTURE")!;
const UJENZI_DESTINATION = SECTOR_OPERATING_SYSTEMS.find((os) => os.code === "UJENZI")!;
const FOUNDATION_DESTINATION = FOUNDATION_ORGANIZATION;
const CAPABILITY_LABEL_FAMILY_OFFICE = "Family Office";

/** Presentation accents, one per Sector OS card position (catalogue order). */
const SYSTEM_TONES = ["gold", "blue", "green", "light"] as const;

/**
 * The CANONICAL PUBLIC HOMEPAGE.
 *
 * The marketing surface lives at `/`. It is never replaced by a dashboard, a
 * launcher, the sign-in form or a generic landing page — that is the homepage
 * requirement this module exists to honour. It renders the authoritative BEYU
 * OS emblem, in-page navigation with real anchors, the four Sector OS
 * destinations and the governed Family Office surface.
 *
 * `MarketingPage` takes the destination→entry-URL resolver as a prop because the
 * entry URL depends on DEPLOYMENT configuration (`BEYU_CANONICAL_DOMAIN`), which
 * is read per request on the server. It is presentation only: an entry URL is
 * where a visitor is OFFERED a sign-in, never an authorization outcome.
 */
export function MarketingPage({ entryHref }: { entryHref: (destination: (typeof GATEWAY_DESTINATIONS)[number]) => string }) {
  const capabilityItems = [
    ["Constitutional Governance", "⚖"],
    ["Human Capital Management", "♟"],
    ["Family Office", "⌂"],
    ["Risk & Assurance", "✓"],
    ["Knowledge Management", "▤"],
    ["Audit & Accountability", "▣"],
  ] as const;

  const sectorIcons: Record<string, string> = {
    HEALTH: "✚",
    FINANCE: "▤",
    AGRICULTURE: "♧",
    UJENZI: "⌂",
  };

  return (
    <main className="beyu-home-shell beyu-home-v2">
      <div className="beyu-v2-utility">
        <div className="beyu-home-inner beyu-v2-utility-inner">
          <div className="beyu-v2-contact">
            <a href="tel:+255615766716">☎ +255615766716</a>
            <span aria-hidden="true">|</span>
            <a href="mailto:info@beyu.co.tz">✉ info@beyu.co.tz</a>
            <span aria-hidden="true">|</span>
            <span>⌖ Tanzania</span>
          </div>
          <div className="beyu-v2-utility-right">
            <span>English</span><span aria-hidden="true">|</span><span>Kiswahili</span>
            <a href="#gateway" className="beyu-v2-search">Search BEYU… <span aria-hidden="true">⌕</span></a>
          </div>
        </div>
      </div>

      <header className="beyu-v2-header">
        <div className="beyu-home-inner beyu-v2-header-inner">
          <a className="beyu-v2-brand" href="/" aria-label="BEYU homepage">
            <span className="beyu-v2-brand-mark"><BeyuOsLogo size={56} ariaLabel="BEYU" /></span>
            <span className="beyu-v2-brand-lockup">
              <strong>BEYU</strong>
              <small>Bridging Care. Building Trust.</small>
            </span>
          </a>
          <nav className="beyu-v2-nav" aria-label="Main navigation">
            <a className="active" href="/">Home</a>
            <a href="#about">About BEYU⌄</a>
            <a href="#sector-os">Our Ecosystem⌄</a>
            <a href="#capabilities">Capabilities⌄</a>
            <a href="#news">News & Events⌄</a>
            <a href="#gateway">Resources⌄</a>
            <a href="#contact">Contact</a>
          </nav>
          <a href="/sign-in" className="beyu-v2-signin">♙ Sign In <span aria-hidden="true">›</span></a>
        </div>
      </header>

      <section className="beyu-v2-hero" aria-labelledby="beyu-home-title">
        <div className="beyu-home-inner beyu-v2-hero-inner">
          <div className="beyu-v2-hero-copy">
            <h1 id="beyu-home-title">Bridging Care.<span>Building Trust.</span></h1>
            <p className="beyu-v2-kicker">A Constitutional Enterprise Operating Ecosystem.</p>
            <p>BEYU connects institutional governance, enterprise operations, intelligence and multi-sector capabilities through one unified operating architecture.</p>
            <div className="beyu-v2-actions">
              <a href="#about" className="beyu-v2-primary">Explore BEYU <span>›</span></a>
              <a href="#sector-os" className="beyu-v2-outline">Discover Our Ecosystem <span>›</span></a>
            </div>
          </div>
          <div className="beyu-v2-globe" aria-label="BEYU ecosystem with four sector operating systems">
            <div className="beyu-v2-orbit beyu-v2-orbit-one" />
            <div className="beyu-v2-orbit beyu-v2-orbit-two" />
            <div className="beyu-v2-earth">
              <div className="beyu-v2-earth-glow" />
              <div className="beyu-v2-earth-core">
                <BeyuOsLogo size={76} ariaLabel="BEYU OS" />
                <strong>BEYU</strong><small>Ecosystem</small>
              </div>
            </div>
            <span className="beyu-v2-sector-tag tag-health">✚ HEALTH_OS</span>
            <span className="beyu-v2-sector-tag tag-finance">▤ FINANCE_OS</span>
            <span className="beyu-v2-sector-tag tag-agri">♧ AGRICULTURE_OS</span>
            <span className="beyu-v2-sector-tag tag-ujenzi">⌂ UJENZI_OS</span>
          </div>
        </div>
      </section>

      <section className="beyu-v2-about" id="about">
        <div className="beyu-home-inner beyu-v2-about-inner">
          <div className="beyu-v2-about-copy" id="architecture">
            <h2>About BEYU</h2><span className="beyu-v2-gold-rule" />
            <p>BEYU is a constitutional enterprise ecosystem built on three foundational pillars: Constitutional Control Plane, Enterprise Operating Kernel and Governed Intelligence Layer.</p>
            <a href="#capabilities" className="beyu-v2-dark-btn">Learn More <span>›</span></a>
          </div>
          <div className="beyu-v2-building" aria-hidden="true">
            <div className="beyu-v2-building-tower"><span /><span /><span /><span /><span /><span /></div>
            <div className="beyu-v2-palms"><i /><i /><i /><i /><i /></div>
          </div>
        </div>
      </section>

      <section className="beyu-v2-sectors" id="sector-os">
        <div className="beyu-home-inner">
          <div className="beyu-v2-section-heading"><span /><h2>One Ecosystem. Four Sector Operating Systems.</h2><span /></div>
          <div className="beyu-v2-sector-grid">
            {SECTOR_OPERATING_SYSTEMS.map((os, index) => (
              <article key={os.code} className={`beyu-v2-sector-card sector-${index + 1}`}>
                <div className="beyu-v2-sector-art" aria-hidden="true"><span>{sectorIcons[os.code] ?? "◈"}</span></div>
                <strong>{os.registryCode}</strong>
                <p>{os.highlights[0]}</p>
                <a href={entryHref(os)}>Explore <span>›</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="beyu-v2-capabilities" id="capabilities">
        <div className="beyu-home-inner beyu-v2-capability-layout">
          <div className="beyu-v2-capability-main">
            <h2>Shared Enterprise Capabilities</h2>
            <p>Powering the BEYU ecosystem with integrated capabilities.</p>
            <div className="beyu-v2-capability-grid">
              {capabilityItems.map(([label, icon]) => (
                label === CAPABILITY_LABEL_FAMILY_OFFICE ? (
                  <a key={label} href={entryHref(FAMILY_OFFICE_SURFACE)} className="beyu-v2-capability-card">
                    <span>{icon}</span><strong>{label}</strong>
                  </a>
                ) : (
                  <div key={label} className="beyu-v2-capability-card"><span>{icon}</span><strong>{label}</strong></div>
                )
              ))}
            </div>
          </div>
          <aside className="beyu-v2-noelia" id="noelia">
            <div className="beyu-noelia-portrait beyu-v2-noelia-portrait">
              {/* Canonical portrait: original registry file, rendered directly without an image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={NOELIA_CANONICAL_APPEARANCE.path}
                alt={NOELIA_CANONICAL_APPEARANCE.altText}
                width={NOELIA_CANONICAL_APPEARANCE.dimensions.width}
                height={NOELIA_CANONICAL_APPEARANCE.dimensions.height}
                draggable={false}
                className="beyu-noelia-image"
              />
            </div>
            <div className="beyu-v2-noelia-copy">
              <h3>NOELIA</h3><p>Intelligence · Governance · Care</p>
              <span>Your governed AI assistant across the BEYU ecosystem.</span>
              <a href={entryHref(NOELIA_SURFACE)}>Chat with NOELIA <span>›</span></a>
            </div>
          </aside>
        </div>
      </section>

      <section className="beyu-v2-vision" id="vision">
        <div className="beyu-v2-vision-panel">
          <div className="beyu-home-inner beyu-v2-vision-copy">
            <h2>OUR INSTITUTIONAL VISION.</h2>
            <p>A prosperous, inclusive and digitally empowered Africa through trusted institutions and intelligent ecosystems.</p>
            <a href="#about" className="beyu-v2-primary">Our Vision <span>›</span></a>
          </div>
          <div className="beyu-v2-savannah" aria-hidden="true"><i /><i /><i /></div>
        </div>
        <aside className="beyu-v2-quick-access" id="gateway">
          <h2>Quick Access</h2>
          <a href="/sign-in">▣ BEYU Digital Services <span>›</span></a>
          <a href="#news">▤ News & Announcements <span>›</span></a>
          <a href="#news">▦ Events Calendar <span>›</span></a>
          <a href="#about">▥ Institutional Directory <span>›</span></a>
          <a href="#contact">♧ Partner with BEYU <span>›</span></a>
          <a className="beyu-v2-all-destinations" href="#sector-os">Explore all destinations →</a>
        </aside>
      </section>

      <section className="beyu-v2-news" id="news">
        <div className="beyu-home-inner beyu-v2-news-layout">
          <div className="beyu-v2-news-main">
            <div className="beyu-v2-news-heading"><h2>📣 Latest News & Announcements</h2><a href="#sector-os">View All News ›</a></div>
            <PublicNewsEvents />
          </div>
          <aside className="beyu-v2-join">
            <div className="beyu-v2-handshake" aria-hidden="true">🤝</div>
            <h2>Join Our Journey</h2>
            <p>Partner with BEYU for a healthier, more prosperous and trusted future.</p>
            <a href="#contact">Get Involved <span>›</span></a>
          </aside>
        </div>
      </section>

      <footer className="beyu-v2-footer" id="contact">
        <div className="beyu-home-inner">
          <div className="beyu-v2-footer-main">
            <a className="beyu-v2-footer-brand" href="/" aria-label="BEYU homepage">
              <span><BeyuOsLogo size={66} ariaLabel="BEYU" /></span>
              <strong>BEYU<small>Bridging Care. Building Trust.</small></strong>
            </a>
            <div className="beyu-v2-footer-column"><h3>About BEYU</h3><a href="#about">Our Architecture</a><a href="#about">Governance</a><a href="#capabilities">Shared Capabilities</a><a href="#vision">Institutional Vision</a></div>
            <div className="beyu-v2-footer-column"><h3>Sector OS</h3>{SECTOR_OPERATING_SYSTEMS.map(os => <a key={os.code} href={entryHref(os)}>{os.registryCode}</a>)}<a href={entryHref(FOUNDATION_DESTINATION)}>{FOUNDATION_DESTINATION.name}</a></div>
            <div className="beyu-v2-footer-column"><h3>NOELIA AI</h3><a href={entryHref(NOELIA_SURFACE)}>Enterprise Capabilities</a><a href={entryHref(NOELIA_SURFACE)}>Technology</a><a href="#contact">Contact</a></div>
            <div className="beyu-v2-footer-column"><h3>Information</h3><a href="#contact">Privacy Policy</a><a href="#contact">Terms & Conditions</a><a href="#contact">Security</a><a href="mailto:info@beyu.co.tz">Email BEYU</a></div>
          </div>
          <div className="beyu-v2-footer-bottom">
            <span>◎ www.beyu.co.tz</span><span>© 2026 BEYU. Bridging Care. Building Trust. All rights reserved.</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

/**
 * The ONE resolver shared by both canonical URLs.
 *
 * `variant` selects presentation only, and only on the control-plane host: the
 * homepage variant renders the public homepage there for an anonymous visitor.
 * Everything else — principal, host, destination and denial resolution, and the
 * governed sign-in itself — is identical for `/` and `/sign-in`.
 */
export async function CanonicalEntryPage({
  variant,
}: {
  variant: "homepage" | "sign-in";
}) {
  const principal = await resolvePrincipal();

  const canonicalHost = await canonicalHostForRequest();
  // The destination this host SELECTED: the control plane for the apex/`www`, the
  // OS or surface for a `<label>.<apex>` host, and nothing for a NEUTRAL host.
  const selectedDestination = destinationForResolution(canonicalHost);
  // The sign-in is the governed entry on EVERY hostname. A NEUTRAL host selects no
  // destination and carries the control-plane context — it never falls back to an
  // un-governed page and can never select a destination frontend.
  const signInDestination = selectedDestination ?? CONTROL_PLANE_DESTINATION;
  // The context the HOST selected (null for NEUTRAL). The post-authentication
  // landing is derived from it alone — never from a query string.
  const requestedContext = selectedDestination?.context ?? null;
  const sessionExpired = !principal && (await sessionCookiePresent());
  const identities = isProductionDeployment() ? [] : BOOTSTRAP_IDENTITIES;

  if (principal) {
    const destinations = await authorizedGovernedDestinations(principal);
    if (canonicalHost.kind === "SECTOR_OS" && destinations.some((destination) => destination.code === canonicalHost.os.code)) {
      redirect(canonicalHost.os.href);
    }
    if (canonicalHost.kind === "SURFACE") {
      const allowed =
        canonicalHost.surface.code === "FOUNDATION"
          ? destinations.some((destination) => destination.code === "FOUNDATION")
          : can(principal, canonicalHost.surface.entryPermission).allowed;
      if (allowed) redirect(canonicalHost.surface.href);
    }
    // Denial is a DESTINATION-host outcome: a signed-in identity on a Sector OS or
    // surface host it may not enter is told so on that host. The control plane and
    // NEUTRAL hosts deny nothing here — a signed-in identity there continues to the
    // destinations it is authorized for (the launcher, or its single destination).
    if ((canonicalHost.kind === "SECTOR_OS" || canonicalHost.kind === "SURFACE") && selectedDestination) {
      return (
        <DestinationDenied
          destination={selectedDestination}
          displayName={principal.displayName}
          email={principal.email}
        />
      );
    }
    if (destinations.length > 1) redirect("/launcher");
    if (destinations.length === 1) {
      const hrefFor = await destinationHrefForRequest();
      redirect(hrefFor(destinations[0]));
    }
  }

  // The public homepage: `/`, on the control-plane host (apex or `www`), for an
  // anonymous visitor. A NEUTRAL host never resolves to CONTROL_PLANE.
  if (!principal && variant === "homepage" && canonicalHost.kind === "CONTROL_PLANE") {
    return <MarketingPage entryHref={await entryHrefForRequest()} />;
  }

  // Every other case: the ONE governed sign-in, carrying the selected context. The
  // landing is the context's own route — never a query string — so this cannot
  // become an open redirector.
  return (
    <GovernedSignIn
      destination={signInDestination}
      identities={identities}
      sessionExpired={sessionExpired}
      landing={requestedContext ? requestedContext.href : "/os"}
    />
  );
}

/**
 * `/` — the public homepage on the control-plane host; the governed sign-in on
 * every other host (see the module header).
 */
export default function HomeEntry() {
  return CanonicalEntryPage({ variant: "homepage" });
}

/**
 * `/sign-in` — the governed sign-in on every host, re-exported by
 * `src/app/sign-in/page.tsx`. A thin re-export, not a second implementation.
 */
export function CanonicalSignInPage() {
  return CanonicalEntryPage({ variant: "sign-in" });
}
