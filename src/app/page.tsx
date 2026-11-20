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
  return (
    <main className="beyu-home-shell">
      <header className="beyu-topbar">
        <div className="beyu-home-inner beyu-topbar-inner">
          <div className="beyu-brand">
            <div className="beyu-brand-mark">
              <BeyuOsLogo size={30} ariaLabel="BEYU" />
            </div>
            <div className="beyu-brand-text">
              <div className="beyu-brand-name">BEYU</div>
              <div className="beyu-brand-tag">Bridging Care. Building Trust.</div>
            </div>
          </div>

          <nav className="beyu-main-nav" aria-label="Main navigation">
            <a href="#about">About BEYU</a>
            <a href="#architecture">Our Architecture</a>
            <a href="#sector-os">Sector OS</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#gateway">Digital Gateway</a>
            <a href="#noelia">NOELIA AI</a>
            <a href="#technology">Technology</a>
            <a href="#contact">Contact</a>
          </nav>
          <details className="beyu-mobile-nav">
            <summary aria-label="Open site navigation">Menu <span aria-hidden="true">☰</span></summary>
            <nav aria-label="Mobile navigation">
              <a href="#about">About BEYU</a>
              <a href="#architecture">Our Architecture</a>
              <a href="#sector-os">Sector OS</a>
              <a href="#capabilities">Capabilities</a>
            <a href="#gateway">Digital Gateway</a>
              <a href="#noelia">NOELIA AI</a>
              <a href="#technology">Technology</a>
              <a href="#contact">Contact</a>
              <a href="/sign-in">Sign In</a>
            </nav>
          </details>

          <div className="beyu-top-actions">
            <a href="/sign-in" className="beyu-signin-btn">
              Sign In <span aria-hidden="true">→</span>
            </a>
            <span className="beyu-theme-mark" aria-hidden="true">☾</span>
          </div>
        </div>
      </header>

      <section className="beyu-hero" aria-labelledby="beyu-home-title">
        <div className="beyu-home-inner beyu-hero-inner">
          <div className="beyu-hero-copy">
            <h1 id="beyu-home-title">
              Bridging Care.
              <span>Building Trust.</span>
            </h1>
            <p className="beyu-hero-kicker">A Constitutional Enterprise Operating Ecosystem.</p>
            <p className="beyu-hero-text">
              BEYU connects institutional governance, enterprise operations, intelligence and multi-sector
              capabilities through one unified operating architecture.
            </p>
            <div className="beyu-hero-actions">
              <a href="#about" className="beyu-primary-btn">Explore BEYU <span aria-hidden="true">→</span></a>
              <a href="#sector-os" className="beyu-secondary-btn">Explore Our Operating Systems <span aria-hidden="true">→</span></a>
            </div>
          </div>

          <div className="beyu-globe-scene" aria-hidden="true">
            <div className="beyu-globe-core">
              <div className="beyu-globe-capture">
                <div className="beyu-globe-mark">
                  <BeyuOsLogo size={82} ariaLabel="BEYU OS" />
                </div>
                <div className="beyu-globe-word">BEYU</div>
                <div className="beyu-globe-sub">System</div>
              </div>
            </div>

            <span className="beyu-label label-health">HEALTH_OS</span>
            <span className="beyu-label label-finance">FINANCE_OS</span>
            <span className="beyu-label label-agri">AGRICULTURE_OS</span>
            <span className="beyu-label label-ujenzi">UJENZI_OS</span>

            <div className="beyu-orbit-icon orbit-health">+</div>
            <div className="beyu-orbit-icon orbit-finance">◈</div>
            <div className="beyu-orbit-icon orbit-agri">✦</div>
            <div className="beyu-orbit-icon orbit-ujenzi">▣</div>
          </div>
        </div>
      </section>

      <section className="beyu-about-section" id="about">
        <div className="beyu-home-inner beyu-about-grid">
          <div className="beyu-about-copy" id="architecture">
            <h2>ABOUT BEYU</h2>
            <div className="beyu-bar" />
            <p>
              BEYU is a constitutional enterprise ecosystem built on three foundational pillars:
              Constitutional Control Plane, Enterprise Operating Kernel and Governed Intelligence Layer.
            </p>
            <a href="#architecture" className="beyu-learn-btn">Learn More <span aria-hidden="true">→</span></a>
          </div>

          <div className="beyu-building-visual" aria-hidden="true">
            <div className="beyu-building-card">
              <div className="beyu-building-main" />
              <div className="beyu-building-side" />
            </div>
          </div>
        </div>
      </section>

      <section className="beyu-systems-section" id="sector-os">
        <div className="beyu-home-inner">
          <h3>ONE ECOSYSTEM. FOUR SECTOR OPERATING SYSTEMS.</h3>
          <div className="beyu-systems-grid">
            {SECTOR_OPERATING_SYSTEMS.map((os, index) => (
              <article key={os.code} className={`beyu-system-card beyu-${SYSTEM_TONES[index % SYSTEM_TONES.length]}`}>
                <div className="beyu-system-art" aria-hidden="true" />
                <div className="beyu-system-label">{os.registryCode}</div>
                <p>{os.highlights[0]}</p>
                <a href={entryHref(os)}>Explore <span aria-hidden="true">→</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="beyu-capability-section" id="capabilities">
        <div className="beyu-home-inner beyu-capability-shell">
          <div className="beyu-capabilities-panel" id="technology">
            <h3>SHARED ENTERPRISE CAPABILITIES</h3>
            <div className="beyu-capability-grid">
              {[
                ["Constitutional Governance", "⚖"],
                ["Multi-Company Management (MCM)", "▦"],
                ["Human Capital Management (HCM)", "👥"],
                ["Family Office", "🏢"],
                ["Risk & Assurance", "✓"],
                ["Knowledge Management", "📚"],
                ["Audit & Accountability", "🧾"],
              ].map(([label, icon]) => (
                label === CAPABILITY_LABEL_FAMILY_OFFICE ? (
                  <a key={label} href={entryHref(FAMILY_OFFICE_SURFACE)} className="beyu-capability-item">
                    <span className="beyu-capability-icon" aria-hidden="true">{icon}</span>
                    <span>{label}</span>
                  </a>
                ) : (
                  <div key={label} className="beyu-capability-item">
                    <span className="beyu-capability-icon" aria-hidden="true">{icon}</span>
                    <span>{label}</span>
                  </div>
                )
              ))}
            </div>
          </div>

          <aside className="beyu-noelia-panel" id="noelia">
            <div className="beyu-noelia-portrait">
              {/*
               * NOELIA'S APPEARANCE — the ONE canonical asset, byte-exact.
               *
               * This was a `next/image` <Image fill>. The optimizer fetched
               * `/NOELIA.png` (1,966,448 B) and re-encoded it to 28,897 B of
               * `image/png` at q=75 — a lossy recompression of the single
               * canonical Noelia appearance. `brand-assets.ts` states the
               * contract plainly: this file may never be "modified,
               * recompressed, recolored, cropped or regenerated", and it is
               * pinned by SHA-256 (`NOELIA_CANONICAL_APPEARANCE.sha256`) plus
               * tests. A hash cannot detect an optimizer that re-encodes on the
               * way out, and every other Noelia surface (`noelia-shell`,
               * `noelia-avatar`, `noelia-cross-os-visual`) renders the canonical
               * registry path as a plain <img> for exactly this reason.
               *
               * So the homepage now resolves the SAME registry entry every
               * other surface uses, and serves the bytes unmodified. Portrait
               * framing comes from CSS (`object-fit: cover;
               * object-position: center 25%` in globals.css), not from a
               * re-encoding pipeline.
               */}
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
            <div className="beyu-noelia-copy">
              <h4>NOELIA</h4>
              <p>Intelligence · Governance · Care</p>
              <div className="beyu-noelia-tag">Your governed AI assistant, supporting the BEYU ecosystem.</div>
              <a href={entryHref(NOELIA_SURFACE)}>Discover NOELIA <span aria-hidden="true">→</span></a>
            </div>
          </aside>
        </div>
      </section>

      <section className="beyu-gateway-section" id="gateway">
        <div className="beyu-home-inner">
          <div className="beyu-gateway-heading">
            <p className="beyu-gateway-eyebrow">BEYU DIGITAL GATEWAY</p>
            <h3>ONE INSTITUTION. CONNECTED DESTINATIONS.</h3>
            <p>Choose an institutional destination. Each destination opens its own governed entry point and applies its own server-side access controls.</p>
          </div>
          <div className="beyu-gateway-grid">
            {GATEWAY_DESTINATIONS.map((destination, index) => (
              <a key={destination.code} className="beyu-gateway-card" href={entryHref(destination)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{destination.registryCode}</strong>
                <small>{destination.headline}</small>
                <b>Enter destination →</b>
              </a>
            ))}
          </div>
          <div className="beyu-information-grid">
            <article><span>01 / INSTITUTION</span><h4>Governance & Architecture</h4><p>Understand the principles, institutional structure and operating model behind BEYU.</p><a href="#architecture">Explore architecture →</a></article>
            <article><span>02 / OPERATIONS</span><h4>Sector Services</h4><p>Explore the four sector operating systems and their distinct responsibilities.</p><a href="#sector-os">Explore sector systems →</a></article>
            <article><span>03 / CAPABILITIES</span><h4>Shared Enterprise Capabilities</h4><p>Discover the common capabilities that connect and support the BEYU ecosystem.</p><a href="#capabilities">Explore capabilities →</a></article>
          </div>
        </div>
      </section>

      <section className="beyu-impact-section">
        <div className="beyu-home-inner beyu-impact-grid">
          <div className="beyu-impact-copy">
            <h3>
              BUILDING INSTITUTIONS.
              <span>CREATING LASTING IMPACT.</span>
            </h3>
            <p>
              Rooted in Africa. Inspired globally. BEYU is committed to sustainable development across
              healthcare, finance, agriculture, infrastructure and communities.
            </p>
            <a href="#contact" className="beyu-impact-btn">Our Vision <span aria-hidden="true">→</span></a>
          </div>

          <div className="beyu-impact-visual" aria-hidden="true">
            <div className="beyu-skyline" />
            <div className="beyu-tree tree-left" />
            <div className="beyu-tree tree-right" />
          </div>

          <div className="beyu-signin-card">
            <div className="beyu-signin-lock">🔒</div>
            <h4>SIGN IN TO BEYU</h4>
            <p>Access your BEYU environment and explore the ecosystem.</p>
            <a href="/sign-in">Sign In <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>

      <footer className="beyu-footer" id="contact">
        <div className="beyu-home-inner beyu-footer-inner">
          <div className="beyu-footer-brand">
            <div className="beyu-brand-mark small">
              <BeyuOsLogo size={26} ariaLabel="BEYU" />
            </div>
            <div className="beyu-brand-text">
              <div className="beyu-brand-name">BEYU</div>
              <div className="beyu-brand-tag">Bridging Care. Building Trust.</div>
            </div>
          </div>

          <div className="beyu-footer-links">
            <div>
              <h5>About BEYU</h5>
              <ul>
                <li><a href="#architecture">Institutional Structure</a></li>
                <li><a href="#architecture">Governance</a></li>
                <li><a href="#sector-os">Sector OS</a></li>
                <li><a href={entryHref(HEALTH_DESTINATION)}>{HEALTH_DESTINATION.name}</a></li>
              </ul>
            </div>
            <div>
              <h5>Sector OS</h5>
              <ul>
                <li><a href={entryHref(FINANCE_DESTINATION)}>{FINANCE_DESTINATION.name}</a></li>
                <li><a href={entryHref(AGRICULTURE_DESTINATION)}>{AGRICULTURE_DESTINATION.name}</a></li>
                <li><a href={entryHref(UJENZI_DESTINATION)}>{UJENZI_DESTINATION.name}</a></li>
                <li><a href={entryHref(FOUNDATION_DESTINATION)}>{FOUNDATION_DESTINATION.name}</a></li>
              </ul>
            </div>
            <div>
              <h5>NOELIA AI</h5>
              <ul>
                <li><a href="#capabilities">Enterprise Capabilities</a></li>
                <li><a href="#gateway">Digital Gateway</a></li>
                <li><a href={entryHref(NOELIA_SURFACE)}>{NOELIA_SURFACE.name}</a></li>
              </ul>
            </div>
            <div>
              <h5>Access</h5>
              <ul>
                <li><a href="/sign-in">Sign In</a></li>
                <li><a href={entryHref(FAMILY_OFFICE_SURFACE)}>{FAMILY_OFFICE_SURFACE.name}</a></li>
                <li><a href="#gateway">All destinations</a></li>
              </ul>
            </div>
          </div>
          <div className="beyu-footer-contact">
            <span>OFFICIAL BEYU CONTACT</span>
            <a href="tel:+255615766716">+255 615 766 716</a>
            <a href="https://wa.me/255615766716">WhatsApp BEYU →</a>
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
export default async function HomeEntry() {
  // The public control-plane root is a permanent public front door. Do not
  // redirect authenticated visitors away from the homepage: authentication
  // and server-side authorization remain in the explicit /sign-in flow and
  // the destination routes. Sector/surface/neutral hosts retain the governed
  // entry behavior implemented by CanonicalEntryPage.
  const canonicalHost = await canonicalHostForRequest();
  if (canonicalHost.kind === "CONTROL_PLANE") {
    return <MarketingPage />;
  }
  return CanonicalEntryPage({ variant: "homepage" });
}

/**
 * `/sign-in` — the governed sign-in on every host, re-exported by
 * `src/app/sign-in/page.tsx`. A thin re-export, not a second implementation.
 */
export function CanonicalSignInPage() {
  return CanonicalEntryPage({ variant: "sign-in" });
}
