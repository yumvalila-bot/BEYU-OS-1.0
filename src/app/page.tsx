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
 *   `/`          → the central homepage on the control-plane host and the
 *                  destination homepage on each canonical destination host.
 *                  Neutral and tenant hosts retain the governed sign-in.
 * Public presentation never grants access; authorization remains server-side.
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
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { NOELIA_CANONICAL_APPEARANCE } from "@/components/brand-assets";
import {
  AboutHeadquartersIllustration,
  CapabilityIcon,
  FooterWaveAccent,
  HeroEcosystemGlobe,
  JourneyHandshakeBadge,
  NewsMegaphoneIcon,
  QuickAccessIcon,
  SectorBannerArtwork,
  SignInLockIcon,
  VisionSavannaArtwork,
} from "@/components/homepage-artwork";
import { PublicNewsEvents } from "@/components/public-news-events";
import { OFFICIAL_BEYU_CONTACT } from "@/components/public-contact";
import type { BootstrapIdentity } from "./sign-in-form";
import { DestinationDenied, GovernedSignIn } from "./governed-sign-in";
import { DestinationHomepage } from "./destination-homepage";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import { apexHrefForRequest, canonicalHostForRequest, destinationHrefForRequest, entryHrefForRequest } from "@/lib/canonical-host";
import { CONTROL_PLANE_DESTINATION, destinationForResolution } from "@/lib/canonical-hosts";
import {
  CANONICAL_SURFACES,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import { sessionCookiePresent } from "@/lib/session-state";
import { can } from "@/lib/authz";

export const dynamic = "force-dynamic";

/** Host-selected public metadata is presentation only, never an access grant. */
export async function generateMetadata(): Promise<Metadata> {
  const host = await canonicalHostForRequest();
  if (host.kind !== "SECTOR_OS" && host.kind !== "SURFACE") return {};
  const context = destinationForResolution(host)?.context;
  if (!context) return {};
  return {
    title: context.name,
    description: context.description,
    openGraph: { title: context.name, description: context.description },
  };
}


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

const SHARED_CAPABILITIES = [
  { label: "Constitutional Governance", icon: "governance" as const },
  { label: "Human Capital Management", icon: "hcm" as const },
  { label: CAPABILITY_LABEL_FAMILY_OFFICE, icon: "family-office" as const },
  { label: "Risk & Assurance", icon: "risk" as const },
  { label: "Knowledge Management", icon: "knowledge" as const },
  { label: "Audit & Accountability", icon: "audit" as const },
] as const;

const SECTOR_BANNER_MAP = {
  HEALTH: "HEALTH_OS",
  FINANCE: "FINANCE_OS",
  AGRICULTURE: "AGRICULTURE_OS",
  UJENZI: "UJENZI_OS",
} as const;

/**
 * The CANONICAL PUBLIC HOMEPAGE.
 *
 * The marketing surface lives at `/`. It is never replaced by a dashboard, a
 * launcher, the sign-in form or a generic landing page — that is the homepage
 * requirement this module exists to honour. It renders the authoritative BEYU
 * OS emblem, in-page navigation with real anchors, the four Sector OS
 * destinations, shared capabilities, byte-exact NOELIA portrait, live governed
 * public news & events feed, and the governed destination gateway.
 *
 * `MarketingPage` takes the destination→entry-URL resolver as a prop because the
 * entry URL depends on DEPLOYMENT configuration (`BEYU_CANONICAL_DOMAIN`), which
 * is read per request on the server. It is presentation only: an entry URL is
 * where a visitor is OFFERED a sign-in, never an authorization outcome.
 */
export function MarketingPage({ entryHref }: { entryHref: (destination: (typeof GATEWAY_DESTINATIONS)[number]) => string }) {
  return (
    <div className="beyu-home-shell" id="top">
      <a href="#main-content" className="beyu-skip-link">
        Skip to main content
      </a>

      {/* Top institutional utility bar */}
      <div className="beyu-utility-bar">
        <div className="beyu-home-inner beyu-utility-inner">
          <div className="beyu-utility-contact">
            <a href={OFFICIAL_BEYU_CONTACT.phoneHref}>{OFFICIAL_BEYU_CONTACT.phoneDisplay}</a>
            <span className="beyu-utility-sep" aria-hidden="true">|</span>
            <a href={OFFICIAL_BEYU_CONTACT.emailHref}>{OFFICIAL_BEYU_CONTACT.email}</a>
            <span className="beyu-utility-sep" aria-hidden="true">|</span>
            <span>{OFFICIAL_BEYU_CONTACT.country}</span>
          </div>

          <div className="beyu-utility-right">
            <span className="beyu-utility-lang" aria-label="Language availability">
              <strong>English</strong>
              <span className="beyu-utility-sep" aria-hidden="true">|</span>
              <span title="Swahili localization is planned for a future release">Kiswahili</span>
            </span>
            <form action="/news" method="get" className="beyu-utility-search" role="search" aria-label="Search published BEYU announcements">
              <label htmlFor="beyu-header-search" className="sr-only">
                Search published BEYU announcements
              </label>
              <input
                id="beyu-header-search"
                type="search"
                name="q"
                maxLength={100}
                placeholder="Search BEYU..."
                className="beyu-utility-search-input"
              />
              <button type="submit" className="beyu-utility-search-btn" aria-label="Submit search">
                <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="9" cy="9" r="6" />
                  <path d="M13.5 13.5 L18 18" strokeLinecap="round" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Main white navigation header */}
      <header className="beyu-topbar">
        <div className="beyu-home-inner beyu-topbar-inner">
          <a href="#top" className="beyu-brand" aria-label="BEYU home">
            <div className="beyu-brand-mark">
              <BeyuOsLogo size={38} ariaLabel="BEYU" />
            </div>
            <div className="beyu-brand-text">
              <div className="beyu-brand-name">BEYU</div>
              <div className="beyu-brand-tag">Bridging Care. Building Trust.</div>
            </div>
          </a>

          <nav className="beyu-main-nav" aria-label="Main navigation">
            <a href="#top" className="beyu-nav-active">Home</a>
            <a href="#about">About BEYU</a>
            <a href="#sector-os">Our Ecosystem</a>
            <a href="#capabilities">Capabilities</a>
            <Link href="/news">News &amp; Events</Link>
            <a href="#gateway">Resources</a>
            <a href="#contact">Contact</a>
          </nav>

          <details className="beyu-mobile-nav">
            <summary aria-label="Open site navigation">Menu <span aria-hidden="true">☰</span></summary>
            <nav aria-label="Mobile navigation">
              <a href="#top">Home</a>
              <a href="#about">About BEYU</a>
              <a href="#sector-os">Our Ecosystem</a>
              <a href="#capabilities">Capabilities</a>
              <Link href="/news">News &amp; Events</Link>
              <a href="#gateway">Digital Gateway</a>
              <a href="#noelia">NOELIA AI</a>
              <a href="#contact">Contact</a>
              <a href="/sign-in">Sign In</a>
            </nav>
          </details>

          <div className="beyu-top-actions">
            <a href="/sign-in" className="beyu-signin-btn">
              <SignInLockIcon />
              <span>Sign In</span>
              <span aria-hidden="true">›</span>
            </a>
            <span className="beyu-theme-mark" aria-hidden="true">☾</span>
          </div>
        </div>
      </header>

      <main id="main-content">
        {/* Hero section */}
        <section className="beyu-hero" aria-labelledby="beyu-home-title">
          <div className="beyu-home-inner beyu-hero-inner">
            <div className="beyu-hero-copy">
              <h1 id="beyu-home-title">
                Bridging Care.
                <span>Building Trust.</span>
              </h1>
              <p className="beyu-hero-kicker">A Constitutional Enterprise Operating Ecosystem.</p>
              <p className="beyu-hero-text">
                BEYU connects institutional governance, enterprise operations, intelligence, and multi-sector
                capabilities through one unified operating architecture.
              </p>
              <div className="beyu-hero-actions">
                <a href="#about" className="beyu-primary-btn">
                  Explore BEYU <span aria-hidden="true">›</span>
                </a>
                <a href="#sector-os" className="beyu-secondary-btn">
                  Discover Our Ecosystem <span aria-hidden="true">›</span>
                </a>
              </div>
            </div>

            <HeroEcosystemGlobe />
          </div>
        </section>

        {/* About BEYU section */}
        <section className="beyu-about-section" id="about">
          <div className="beyu-home-inner beyu-about-grid">
            <div className="beyu-about-copy" id="architecture">
              <h2 className="beyu-section-title">About BEYU</h2>
              <div className="beyu-bar" />
              <p>
                BEYU is a constitutional enterprise ecosystem built on three foundational pillars: the{" "}
                <strong>Constitutional Control Plane</strong>, <strong>Enterprise Operating Kernel</strong>, and{" "}
                <strong>Governed Intelligence Layer</strong> — uniting holding stewardship, multi-company operations,
                and BEYU Foundation&apos;s sister nonprofit mission under disciplined institutional accountability.
              </p>
              <a href="#capabilities" className="beyu-learn-btn">
                Learn More <span aria-hidden="true">›</span>
              </a>
            </div>

            <AboutHeadquartersIllustration />
          </div>
        </section>

        {/* Four Sector Operating Systems */}
        <section className="beyu-systems-section" id="sector-os">
          <div className="beyu-home-inner">
            <div className="beyu-section-header-center">
              <h2 className="beyu-section-title">One Ecosystem. Four Sector Operating Systems.</h2>
              <div className="beyu-bar beyu-bar-center" />
            </div>
            <div className="beyu-systems-grid">
              {SECTOR_OPERATING_SYSTEMS.map((os, index) => (
                <article key={os.code} className={`beyu-system-card beyu-${SYSTEM_TONES[index % SYSTEM_TONES.length]}`}>
                  <div className="beyu-system-banner">
                    <SectorBannerArtwork sector={SECTOR_BANNER_MAP[os.code as keyof typeof SECTOR_BANNER_MAP] ?? "HEALTH_OS"} />
                  </div>
                  <div className="beyu-system-card-body">
                    <h3 className="beyu-system-label">{os.registryCode}</h3>
                    <p>{os.highlights[0]}</p>
                    <a href={entryHref(os)} className="beyu-system-cta">
                      Explore <span aria-hidden="true">›</span>
                    </a>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Shared Enterprise Capabilities + NOELIA Split */}
        <section className="beyu-capability-section" id="capabilities">
          <div className="beyu-home-inner beyu-capability-shell">
            <div className="beyu-capabilities-panel" id="technology">
              <h2 className="beyu-section-title beyu-section-title-sm">Shared Enterprise Capabilities</h2>
              <p className="beyu-cap-subtitle">Powering the BEYU ecosystem with integrated capabilities.</p>
              <div className="beyu-bar" />
              <div className="beyu-capability-grid">
                {SHARED_CAPABILITIES.map(({ label, icon }) =>
                  label === CAPABILITY_LABEL_FAMILY_OFFICE ? (
                    <a key={label} href={entryHref(FAMILY_OFFICE_SURFACE)} className="beyu-capability-item beyu-capability-link">
                      <span className="beyu-capability-icon" aria-hidden="true">
                        <CapabilityIcon kind={icon} />
                      </span>
                      <span className="beyu-capability-label">{label}</span>
                    </a>
                  ) : (
                    <div key={label} className="beyu-capability-item">
                      <span className="beyu-capability-icon" aria-hidden="true">
                        <CapabilityIcon kind={icon} />
                      </span>
                      <span className="beyu-capability-label">{label}</span>
                    </div>
                  ),
                )}
              </div>
              <p className="beyu-capability-footnote">
                Supported by Multi-Company Management (MCM), sovereign RBAC/ABAC, and immutable audit trails across
                every entity.
              </p>
            </div>

            <aside className="beyu-noelia-panel" id="noelia" aria-labelledby="noelia-card-heading">
              <div className="beyu-noelia-portrait">
                {/*
                 * NOELIA'S APPEARANCE — the ONE canonical asset, byte-exact.
                 * Rendered via a plain <img> referencing NOELIA_CANONICAL_APPEARANCE.path
                 * so Next.js image optimization never recompresses or alters the SHA-256
                 * pinned portrait asset.
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
                <h2 id="noelia-card-heading">NOELIA</h2>
                <p className="beyu-noelia-pillars">Intelligence • Governance • Care</p>
                <div className="beyu-noelia-tag">
                  Your governed AI assistant, supporting the BEYU ecosystem.
                </div>
                <a href={entryHref(NOELIA_SURFACE)} className="beyu-noelia-cta">
                  Chat with NOELIA <span aria-hidden="true">›</span>
                </a>
              </div>
            </aside>
          </div>
        </section>

        {/* Institutional Vision + Quick Access */}
        <section className="beyu-vision-section" id="vision">
          <div className="beyu-home-inner beyu-vision-grid">
            <div className="beyu-vision-card">
              <VisionSavannaArtwork />
              <div className="beyu-vision-content">
                <p className="beyu-vision-eyebrow">OUR INSTITUTIONAL VISION.</p>
                <h2>Rooted in Africa. Inspired Globally.</h2>
                <p className="beyu-vision-text">
                  A prosperous, inclusive and digitally empowered Africa through trusted institutions and intelligent
                  ecosystems across healthcare, finance, agriculture, and infrastructure.
                </p>
                <a href="#gateway" className="beyu-primary-btn">
                  Our Vision <span aria-hidden="true">›</span>
                </a>
              </div>
            </div>

            <aside className="beyu-quick-access" aria-labelledby="quick-access-heading">
              <h2 id="quick-access-heading">Quick Access</h2>
              <ul>
                <li>
                  <a href="#gateway">
                    <span className="beyu-quick-item-left">
                      <QuickAccessIcon kind="services" />
                      <span>BEYU Digital Services</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </a>
                </li>
                <li>
                  <Link href="/news?kind=NEWS">
                    <span className="beyu-quick-item-left">
                      <QuickAccessIcon kind="announcements" />
                      <span>News &amp; Announcements</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
                <li>
                  <Link href="/news?kind=EVENT">
                    <span className="beyu-quick-item-left">
                      <QuickAccessIcon kind="calendar" />
                      <span>Events Calendar</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </Link>
                </li>
                <li>
                  <a href="#sector-os">
                    <span className="beyu-quick-item-left">
                      <QuickAccessIcon kind="directory" />
                      <span>Institutional Directory</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </a>
                </li>
                <li>
                  <a href="#contact">
                    <span className="beyu-quick-item-left">
                      <QuickAccessIcon kind="partner" />
                      <span>Partner with BEYU</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </a>
                </li>
              </ul>
            </aside>
          </div>
        </section>

        {/* Live Governed News & Announcements + Join Our Journey */}
        <section className="beyu-news-section" id="news-section">
          <div className="beyu-home-inner beyu-news-layout">
            <div className="beyu-news-column">
              <div className="beyu-news-header">
                <div>
                  <div className="beyu-news-heading-row">
                    <NewsMegaphoneIcon />
                    <h2 className="beyu-section-title beyu-section-title-sm">Latest News &amp; Announcements</h2>
                  </div>
                  <div className="beyu-bar" />
                </div>
                <Link href="/news" className="beyu-link-arrow">
                  View All News <span aria-hidden="true">›</span>
                </Link>
              </div>
              <PublicNewsEvents limit={3} />
            </div>

            <aside className="beyu-journey-card" aria-labelledby="join-journey-heading">
              <div className="beyu-journey-head">
                <JourneyHandshakeBadge />
                <div>
                  <p className="beyu-journey-eyebrow">INSTITUTIONAL ENGAGEMENT</p>
                  <h2 id="join-journey-heading">Join Our Journey</h2>
                </div>
              </div>
              <p>
                Partner with BEYU for a healthier, more prosperous and trusted future through institutional
                collaboration and governed digital services across our growing ecosystem.
              </p>
              <div className="beyu-journey-actions">
                <a href="#contact" className="beyu-primary-btn">
                  Get Involved <span aria-hidden="true">›</span>
                </a>
                <a href="/sign-in" className="beyu-journey-signin">
                  Sign In to BEYU <span aria-hidden="true">›</span>
                </a>
              </div>
            </aside>
          </div>
        </section>

        {/* Compact Governed Digital Gateway Directory */}
        <section className="beyu-gateway-section" id="gateway">
          <div className="beyu-home-inner">
            <div className="beyu-gateway-heading">
              <p className="beyu-gateway-eyebrow">BEYU DIGITAL GATEWAY</p>
              <h2 className="beyu-section-title beyu-section-title-sm">One Institution. Connected Destinations.</h2>
              <p>
                Select an institutional destination. Each destination opens its governed entry point and applies
                server-side identity, MFA, and tenant access controls.
              </p>
            </div>
            <div className="beyu-gateway-grid">
              {GATEWAY_DESTINATIONS.map((destination, index) => (
                <a key={destination.code} className="beyu-gateway-card" href={entryHref(destination)}>
                  <span className="beyu-gateway-index">{String(index + 1).padStart(2, "0")}</span>
                  <strong>{destination.registryCode}</strong>
                  <small>{destination.headline}</small>
                  <b>Enter destination ›</b>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Deep-navy institutional footer with signature gold & blue horizon wave */}
      <footer className="beyu-footer" id="contact">
        <div className="beyu-home-inner beyu-footer-grid">
          <div className="beyu-footer-brand-col">
            <div className="beyu-footer-brand">
              <div className="beyu-brand-mark small">
                <BeyuOsLogo size={32} ariaLabel="BEYU" />
              </div>
              <div className="beyu-brand-text">
                <div className="beyu-brand-name">BEYU</div>
                <div className="beyu-brand-tag">Bridging Care. Building Trust.</div>
              </div>
            </div>
            <p className="beyu-footer-mission">
              Constitutional Enterprise Operating Ecosystem uniting healthcare, finance, agriculture, infrastructure,
              and institutional stewardship.
            </p>
            <div className="beyu-footer-contact-list">
              <a href={OFFICIAL_BEYU_CONTACT.phoneHref}>{OFFICIAL_BEYU_CONTACT.phoneSpaced}</a>
              <a href={OFFICIAL_BEYU_CONTACT.emailHref}>{OFFICIAL_BEYU_CONTACT.email}</a>
              <span>{OFFICIAL_BEYU_CONTACT.cityCountry}</span>
              <a href={OFFICIAL_BEYU_CONTACT.whatsappHref} rel="noopener noreferrer">WhatsApp BEYU ›</a>
            </div>
          </div>

          <div className="beyu-footer-col">
            <h3>About BEYU</h3>
            <ul>
              <li><a href="#about">Institutional Overview</a></li>
              <li><a href="#architecture">Governance &amp; Architecture</a></li>
              <li><a href="#capabilities">Enterprise Capabilities</a></li>
              <li><a href="#vision">Our Vision</a></li>
            </ul>
          </div>

          <div className="beyu-footer-col">
            <h3>Our Ecosystem</h3>
            <ul>
              <li><a href={entryHref(HEALTH_DESTINATION)}>{HEALTH_DESTINATION.name}</a></li>
              <li><a href={entryHref(FINANCE_DESTINATION)}>{FINANCE_DESTINATION.name}</a></li>
              <li><a href={entryHref(AGRICULTURE_DESTINATION)}>{AGRICULTURE_DESTINATION.name}</a></li>
              <li><a href={entryHref(UJENZI_DESTINATION)}>{UJENZI_DESTINATION.name}</a></li>
              <li><a href={entryHref(FOUNDATION_DESTINATION)}>{FOUNDATION_DESTINATION.name}</a></li>
            </ul>
          </div>

          <div className="beyu-footer-col">
            <h3>Resources &amp; Access</h3>
            <ul>
              <li><Link href="/news">News &amp; Events</Link></li>
              <li><Link href="/news?kind=EVENT">Events Calendar</Link></li>
              <li><a href={entryHref(NOELIA_SURFACE)}>{NOELIA_SURFACE.name}</a></li>
              <li><a href={entryHref(FAMILY_OFFICE_SURFACE)}>{FAMILY_OFFICE_SURFACE.name}</a></li>
              <li><a href="/sign-in">Governed Sign In</a></li>
            </ul>
          </div>

          <div className="beyu-footer-col">
            <h3>Legal &amp; Trust</h3>
            <ul>
              <li><Link href="/privacy">Privacy Policy</Link></li>
              <li><Link href="/terms">Terms of Use</Link></li>
              <li><Link href="/security">Security &amp; Disclosure</Link></li>
              <li><a href="#gateway">Digital Gateway</a></li>
            </ul>
          </div>
        </div>

        <div className="beyu-home-inner beyu-footer-bottom">
          <p>© {new Date().getFullYear()} BEYU. All Rights Reserved.</p>
          <p>Bridging Care. Building Trust.</p>
        </div>

        <FooterWaveAccent />
      </footer>
    </div>
  );
}

/**
 * The ONE resolver shared by both canonical URLs.
 *
 * `variant` selects public presentation only for anonymous canonical hosts.
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

  // Public presentation is limited to anonymous users on canonical hosts.
  if (!principal && variant === "homepage") {
    if (canonicalHost.kind === "CONTROL_PLANE") {
      return <MarketingPage entryHref={await entryHrefForRequest()} />;
    }
    if (selectedDestination) {
      return <DestinationHomepage destination={selectedDestination} entryHref={await entryHrefForRequest()} apexHref={await apexHrefForRequest()} />;
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
 * `/` — the public homepage on canonical hosts; governed sign-in elsewhere.
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
