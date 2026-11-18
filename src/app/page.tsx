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
 *   `/`          → the PUBLIC HOMEPAGE for an anonymous visitor. There are two
 *                  homepage surfaces, both public and both marketing:
 *                    • the configured control-plane host (the apex and `www`)
 *                      renders the BEYU CENTRAL homepage (`MarketingPage`);
 *                    • a canonical DESTINATION host renders THAT DESTINATION's
 *                      own public homepage (`DestinationHomepage`), whose copy
 *                      comes from `src/lib/destination-homepages.ts` and whose
 *                      identity comes from the ONE catalogue entry the host
 *                      resolved.
 *                  On any NEUTRAL host (no Host, malformed, look-alike, unknown
 *                  label, preview host, governed tenant hostname), `/` is the
 *                  governed sign-in exactly like `/sign-in`.
 *
 * WHY A DESTINATION HOST GETS A HOMEPAGE, AND WHY NEUTRAL STILL DOES NOT
 *   `health.beyu.co.tz` is a public institutional address: a visitor who types
 *   it has not asked to be shown a login form. It gets Health OS's public
 *   homepage, which offers sign-in at `/sign-in`. That is a PRESENTATION choice
 *   and it changes no security property:
 *
 *   • A signed-in identity still never sees a homepage — the principal branch
 *     below runs FIRST, so an authorized visitor is redirected to the workspace
 *     and an unauthorized one is shown the governed denial ON the destination
 *     host. The homepage state is only ever reached by an anonymous visitor.
 *   • A NEUTRAL resolution is still not CONTROL_PLANE and still not a
 *     destination, so a hostile or unknown Host obtains neither the central
 *     homepage NOR a destination homepage — it receives the control-plane
 *     sign-in. Lying about the Host buys an attacker nothing.
 *   • No homepage can grant anything: both surfaces render zero session facts,
 *     zero destination data and zero credential input, and the destination
 *     route re-runs its own server-side gate on arrival.
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
import { DestinationHomepage } from "./destination-homepage";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import {
  apexHrefForRequest,
  canonicalHostForRequest,
  destinationHrefForRequest,
  entryHrefForRequest,
} from "@/lib/canonical-host";
import { CONTROL_PLANE_DESTINATION, destinationForResolution } from "@/lib/canonical-hosts";
import {
  CANONICAL_SURFACES,
  DESTINATION_TYPE_LABEL,
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
            <a href="#values">Vision &amp; Values</a>
            <a href="#sector-os">Sector OS</a>
            <a href="#capabilities">Capabilities</a>
            <a href="#noelia">NOELIA AI</a>
            <a href="#news">News &amp; Events</a>
            <a href="#directory">Directory</a>
            <a href="#contact">Contact</a>
          </nav>
          <details className="beyu-mobile-nav">
            <summary aria-label="Open site navigation">Menu <span aria-hidden="true">☰</span></summary>
            <nav aria-label="Mobile navigation">
              <a href="#about">About BEYU</a>
              <a href="#values">Vision &amp; Values</a>
              <a href="#architecture">Our Architecture</a>
              <a href="#sector-os">Sector OS</a>
              <a href="#capabilities">Capabilities</a>
              <a href="#gateway">Digital Gateway</a>
              <a href="#noelia">NOELIA AI</a>
              <a href="#news">News &amp; Events</a>
              <a href="#directory">Directory</a>
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

      <section className="beyu-values-section" id="values" aria-labelledby="values-title">
        <div className="beyu-home-inner">
          <div className="beyu-values-head">
            <h2 id="values-title">VISION, MISSION &amp; VALUES</h2>
            <span className="beyu-bar" />
          </div>
          <div className="beyu-values-grid">
            <article className="beyu-value-card">
              <h3>Vision</h3>
              <p>
                An Africa-rooted institutional ecosystem in which care, capital and capability are governed
                once, held accountably and made durable across generations.
              </p>
            </article>
            <article className="beyu-value-card">
              <h3>Mission</h3>
              <p>
                To operate one constitutional enterprise platform that connects governance, finance,
                healthcare, agriculture and construction to the people and institutions they serve.
              </p>
            </article>
            <article className="beyu-value-card">
              <h3>Mandate</h3>
              <p>
                One authority model, one identity, one audit truth — with every consequential decision
                attributable to a human being and every capability independently governed.
              </p>
            </article>
          </div>
          <ul className="beyu-pillar-row" aria-label="The five canonical BEYU pillars">
            {["Trust", "Care", "Integrity", "Innovation", "Impact"].map((pillar) => (
              <li key={pillar} className="beyu-pillar">
                <span aria-hidden="true">◆</span>
                {pillar}
              </li>
            ))}
          </ul>
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

      <section className="beyu-news-section" id="news" aria-labelledby="news-title">
        <div className="beyu-home-inner">
          <div className="beyu-values-head">
            <h2 id="news-title">NEWS &amp; ANNOUNCEMENTS</h2>
            <span className="beyu-bar" />
          </div>
          <div className="beyu-news-grid">
            <article className="beyu-news-card">
              <span className="beyu-news-tag">INSTITUTIONAL</span>
              <h3>One ecosystem, eight institutional homepages</h3>
              <p>
                Each BEYU destination — Health, Finance, Agriculture, Ujenzi, Foundation, Family Office and
                NOELIA — now opens its own public institutional homepage and its own governed entry point.
              </p>
            </article>
            <article className="beyu-news-card">
              <span className="beyu-news-tag">ARCHITECTURE</span>
              <h3>Canonical identity and governed tenancy</h3>
              <p>
                BEYU OS continues to resolve one shared identity and one tenant registry, with server-side
                authorization and row-level isolation on every request.
              </p>
            </article>
            <article className="beyu-news-card">
              <span className="beyu-news-tag">GOVERNANCE</span>
              <h3>Financial posting remains fail-closed</h3>
              <p>
                CAP_POSTING stays locked and separately governed. An ACTIVE Finance OS does not enable
                financial posting; activation is a distinct, governed decision.
              </p>
            </article>
          </div>

          <div className="beyu-events-panel" aria-labelledby="events-title">
            <h3 id="events-title">EVENTS</h3>
            <ul className="beyu-event-list">
              <li>
                <span className="beyu-event-when">Standing · quarterly</span>
                <span className="beyu-event-what">Family Assembly and Council sessions (Family Office)</span>
              </li>
              <li>
                <span className="beyu-event-when">Standing · monthly</span>
                <span className="beyu-event-what">Sector governance reviews — Health, Finance, Agriculture, Ujenzi</span>
              </li>
              <li>
                <span className="beyu-event-when">Standing · continuous</span>
                <span className="beyu-event-what">Foundation programme and safeguarding reviews</span>
              </li>
            </ul>
            <p className="beyu-events-note">
              Events are convened through governed workflow for authorized members. Public dates are published
              here as they are confirmed by the relevant governing body.
            </p>
          </div>
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

      <section className="beyu-directory-section" id="directory" aria-labelledby="directory-title">
        <div className="beyu-home-inner">
          <div className="beyu-values-head">
            <h2 id="directory-title">INSTITUTIONAL DIRECTORY</h2>
            <span className="beyu-bar" />
          </div>
          <p className="beyu-directory-intro">
            The canonical addresses of the BEYU ecosystem. Every destination opens its own governed entry
            point and applies its own server-side access controls.
          </p>
          <ul className="beyu-directory-grid">
            <li>
              <div className="beyu-directory-card" aria-current="page">
                <span className="beyu-directory-code">BEYU_OS</span>
                <strong>BEYU</strong>
                <small>Central institutional homepage · constitutional control plane</small>
              </div>
            </li>
            {GATEWAY_DESTINATIONS.map((destination) => (
              <li key={destination.code}>
                <a className="beyu-directory-card" href={entryHref(destination)}>
                  <span className="beyu-directory-code">{destination.registryCode}</span>
                  <strong>{destination.name}</strong>
                  <small>{DESTINATION_TYPE_LABEL[destination.destinationType]}</small>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="beyu-partnership-section" id="partnerships" aria-labelledby="partnerships-title">
        <div className="beyu-home-inner">
          <div className="beyu-values-head">
            <h2 id="partnerships-title">PARTNERSHIPS &amp; IMPACT</h2>
            <span className="beyu-bar" />
          </div>
          <div className="beyu-partnership-grid">
            <article>
              <h3>Institutional partnerships</h3>
              <p>
                BEYU works with healthcare providers, financial institutions, agricultural producers and
                cooperatives, engineering and construction firms, and philanthropic organisations — each
                engagement governed by written terms and recorded authority.
              </p>
            </article>
            <article>
              <h3>Shared capability, not shared data</h3>
              <p>
                Operating systems share governance, identity and intelligence — never each other&apos;s data.
                Cross-sector exchange happens only through explicit governed services, under tenant and
                entity boundaries.
              </p>
            </article>
            <article>
              <h3>Impact</h3>
              <p>
                Impact is measured against stated outcomes in the sectors BEYU serves — care delivered,
                capital stewarded, food produced and traced, infrastructure built, and communities
                supported through the Foundation.
              </p>
            </article>
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

  // THE PUBLIC HOMEPAGE STATES — `/`, anonymous visitor only.
  //
  // Two public surfaces, one decision:
  //   • the configured CONTROL-PLANE host (apex/`www`) → the BEYU central homepage;
  //   • a canonical DESTINATION host → that destination's own public homepage.
  //
  // A NEUTRAL host resolves to NO destination, so neither branch can fire for it:
  // a preview, malformed, look-alike or governed-tenant Host falls through to the
  // governed sign-in below. That is the fail-safe direction and it is deliberate —
  // an ungoverned marketing page must never be obtainable by lying about the Host.
  if (!principal && variant === "homepage") {
    if (canonicalHost.kind === "CONTROL_PLANE") {
      return <MarketingPage entryHref={await entryHrefForRequest()} />;
    }
    if (selectedDestination) {
      return (
        <DestinationHomepage
          destination={selectedDestination}
          entryHref={await entryHrefForRequest()}
          apexHref={await apexHrefForRequest()}
        />
      );
    }
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
 * `/` — the public homepage for an anonymous visitor: the BEYU central homepage
 * on the control-plane host, a destination's public homepage on a canonical
 * destination host, and the governed sign-in on every other (NEUTRAL) host.
 * See the module header.
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
