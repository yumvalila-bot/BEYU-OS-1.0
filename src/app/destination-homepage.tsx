/**
 * THE CANONICAL DESTINATION PUBLIC HOMEPAGE — one component, eight hosts.
 *
 * WHAT THIS IS
 *   The public, anonymous-facing institutional homepage for a canonical
 *   DESTINATION hostname (`health.`, `finance.`, `agriculture.`, `ujenzi.`,
 *   `foundation.`, `familyoffice.`, `noelia.`). It is a MARKETING SURFACE: it
 *   explains the destination, its governed remit and how to reach it.
 *
 * WHAT THIS IS NOT — the distinction this file exists to make
 *   A destination-aware SIGN-IN page is not a public homepage. Before this
 *   component, an anonymous visitor on `health.beyu.co.tz/` received the Health
 *   sign-in composition: a login card where a front door should be. The two
 *   states are now distinct and stay distinct:
 *
 *     PUBLIC HOMEPAGE   `/`              anonymous, marketing, no credential form
 *     SIGN-IN           `/sign-in`       the ONE shared form, destination-aware
 *     AUTHORIZED APP    `/os/<route>`    the destination's own server-side gate
 *     DENIED            `/` `/sign-in`   `DestinationDenied` for a signed-in
 *                                        identity without the grant
 *
 *   `src/app/page.tsx` owns that routing decision; this component only renders
 *   the homepage state it is handed.
 *
 * SECURITY PROPERTIES
 *   • It renders NO credential input, NO session fact, NO privileged identity
 *     and NO destination data. An anonymous visitor can read it and nothing else.
 *   • Every destination fact (name, registry code, class, global status, accent,
 *     headline) comes from the ONE catalogue entry the host resolved — this file
 *     declares no destination and no hostname.
 *   • Every cross-destination link arrives as a prop from the ONE canonical
 *     contract (`entryHref` / `apexHref` composed in `src/app/page.tsx`). No
 *     hostname is written here, so a preview deployment links to relative routes
 *     and a configured deployment links to canonical hosts, with no branch here.
 *   • It is presentation only. It cannot grant, imply or widen access, and the
 *     destination route re-runs its own authorization on arrival regardless.
 *
 * BRAND
 *   The authoritative `BeyuOsLogo` is the only mark rendered. No destination- or
 *   tenant-specific BEYU logo exists, none is created here, and NOELIA's
 *   canonical portrait is deliberately NOT used as a generic illustration (it
 *   belongs to the NOELIA section of the central homepage).
 */
import type { CSSProperties } from "react";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { Icon } from "@/components/icons";
import { DESTINATION_TYPE_LABEL } from "@/lib/operating-system-catalog";
import type { CanonicalHostedDestination } from "@/lib/operating-system-catalog";
import type { CanonicalDestination } from "@/lib/canonical-hosts";
import {
  CANONICAL_SURFACES,
  FOUNDATION_ORGANIZATION,
  SECTOR_OPERATING_SYSTEMS,
} from "@/lib/operating-system-catalog";
import { publicHomepageFor } from "@/lib/destination-homepages";

/** The public footer contact, identical to the central homepage. */
const BEYU_CONTACT_DISPLAY = "+255 615 766 716";
const BEYU_CONTACT_TEL = "tel:+255615766716";
const BEYU_WHATSAPP = "https://wa.me/255615766716";

/** The governed facts every destination homepage states in the same words. */
const GOVERNED_FACTS = [
  "SERVER-SIDE AUTHORIZATION",
  "ZERO TRUST",
  "TENANT ISOLATION",
  "HASH-CHAINED AUDIT",
  "HUMAN ACCOUNTABILITY",
] as const;

/** Every canonical destination, in catalogue order (control plane excluded). */
const ALL_DESTINATIONS = [
  ...SECTOR_OPERATING_SYSTEMS,
  FOUNDATION_ORGANIZATION,
  ...CANONICAL_SURFACES,
] as const;

export type DestinationHomepageProps = {
  /** The destination the request's hostname selected (presentation only). */
  destination: CanonicalDestination;
  /** Public entry URL of any canonical destination, composed server-side. */
  entryHref: (destination: CanonicalHostedDestination) => string;
  /** Public URL of the BEYU central homepage (the configured apex). */
  apexHref: string;
};

/**
 * The public homepage of one canonical destination.
 *
 * Mobile-first and keyboard-navigable: a native `details` disclosure carries the
 * navigation below 900px, every control is at least 44px tall, headings are
 * hierarchical (`h1` → `h2` → `h3`), and the accent is used for emphasis only —
 * never as the sole carrier of meaning.
 */
export function DestinationHomepage({ destination, entryHref, apexHref }: DestinationHomepageProps) {
  const d = destination.context;
  const content = publicHomepageFor(d.code);
  const classLabel = DESTINATION_TYPE_LABEL[d.destinationType];

  // A destination with no public content falls back to its catalogue facts only.
  // This cannot happen for the seven canonical destinations (the registry is
  // total over them and a test asserts it), and the fallback states no more than
  // the catalogue already says.
  const sections = content?.sections ?? [];
  const navSections = sections.slice(0, 4);

  return (
    <main className="beyu-home-shell beyu-dest-shell" style={{ "--dest-accent": d.accent } as CSSProperties}>
      <a className="beyu-skip-link" href="#dest-main">
        Skip to main content
      </a>

      <header className="beyu-topbar">
        <div className="beyu-home-inner beyu-topbar-inner">
          <a className="beyu-brand" href={apexHref} aria-label="BEYU — central institutional homepage">
            <div className="beyu-brand-mark">
              <BeyuOsLogo size={30} ariaLabel="BEYU" />
            </div>
            <div className="beyu-brand-text">
              <div className="beyu-brand-name">BEYU</div>
              <div className="beyu-brand-tag">Bridging Care. Building Trust.</div>
            </div>
          </a>

          <nav className="beyu-main-nav" aria-label={`${d.name} public navigation`}>
            <a href="#about">About</a>
            {navSections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
            <a href="#access">Access</a>
            <a href="#directory">Directory</a>
          </nav>

          <details className="beyu-mobile-nav">
            <summary aria-label={`Open ${d.name} navigation`}>
              Menu <span aria-hidden="true">☰</span>
            </summary>
            <nav aria-label={`${d.name} mobile navigation`}>
              <a href="#about">About</a>
              {sections.map((section) => (
                <a key={section.id} href={`#${section.id}`}>
                  {section.title}
                </a>
              ))}
              <a href="#access">Access</a>
              <a href="#directory">Directory</a>
              <a href="/sign-in">Sign In</a>
            </nav>
          </details>

          <div className="beyu-top-actions">
            <a href="/sign-in" className="beyu-signin-btn">
              Sign In <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </header>

      <section className="beyu-dest-hero" aria-labelledby="dest-title">
        <div className="beyu-home-inner beyu-dest-hero-inner">
          <div className="beyu-dest-hero-copy">
            <p className="beyu-dest-eyebrow">
              {classLabel} · {d.registryCode}
            </p>
            <h1 id="dest-title">
              {d.name}
              <span>{content?.promise ?? d.headline}</span>
            </h1>
            <p className="beyu-dest-lede">{d.description}</p>
            <div className="beyu-dest-hero-actions">
              <a href="#about" className="beyu-primary-btn">
                Explore {d.name} <span aria-hidden="true">→</span>
              </a>
              <a href="/sign-in" className="beyu-secondary-btn">
                Sign In <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>

          <div className="beyu-dest-emblem" aria-hidden="true">
            <div className="beyu-dest-emblem-ring">
              <span className="beyu-dest-emblem-icon">
                <Icon name={d.icon} className="h-10 w-10" />
              </span>
              <span className="beyu-dest-emblem-code">{d.registryCode}</span>
              <span className="beyu-dest-emblem-status">{d.status}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="beyu-dest-about" id="about" aria-labelledby="about-title">
        <div className="beyu-home-inner beyu-dest-about-grid">
          <div className="beyu-dest-about-copy">
            <h2 id="about-title">About {d.name}</h2>
            <span className="beyu-bar" />
            <p className="beyu-dest-headline">{d.headline}</p>
            <p>{content?.mission ?? d.description}</p>
          </div>
          <ul className="beyu-dest-about-highlights">
            {d.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </div>
      </section>

      <div id="dest-main" className="beyu-dest-sections">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} className="beyu-dest-section" aria-labelledby={`${section.id}-title`}>
            <div className="beyu-home-inner">
              <div className="beyu-dest-section-head">
                <span className="beyu-dest-section-index">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h2 id={`${section.id}-title`}>{section.title}</h2>
                  <p>{section.intro}</p>
                </div>
              </div>
              <ul className="beyu-dest-area-grid">
                {section.areas.map((area) => (
                  <li key={area.title} className="beyu-dest-area">
                    <h3>{area.title}</h3>
                    <p>{area.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ))}
      </div>

      <section className="beyu-dest-access" id="access" aria-labelledby="access-title">
        <div className="beyu-home-inner beyu-dest-access-grid">
          <div className="beyu-dest-access-copy">
            <p className="beyu-dest-eyebrow">GOVERNED ACCESS</p>
            <h2 id="access-title">Access to {d.name} is decided server-side.</h2>
            <p>
              This homepage is public information. It does not grant access, and reaching this hostname never
              does. Sign in with your canonical BEYU identity and the platform will evaluate your tenant,
              entity, role, permissions, classification and policy before any workspace opens.
            </p>
            <div className="beyu-dest-hero-actions">
              <a href="/sign-in" className="beyu-primary-btn">
                Sign In <span aria-hidden="true">→</span>
              </a>
              <a href={apexHref} className="beyu-secondary-btn">
                BEYU central homepage <span aria-hidden="true">→</span>
              </a>
            </div>
            <ul className="beyu-dest-facts" aria-label="Governance properties">
              {GOVERNED_FACTS.map((fact) => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
          </div>

          <aside className="beyu-dest-notices" aria-labelledby="notices-title">
            <h3 id="notices-title">Honest limits</h3>
            <ul>
              {(content?.notices ?? []).map((notice) => (
                <li key={notice}>{notice}</li>
              ))}
            </ul>
            <dl className="beyu-dest-status">
              <div>
                <dt>Destination status</dt>
                <dd>
                  {d.name} · {d.status}
                </dd>
              </div>
              <div>
                <dt>Your access</dt>
                <dd>Decided after sign-in</dd>
              </div>
            </dl>
          </aside>
        </div>
      </section>

      <section className="beyu-dest-directory" id="directory" aria-labelledby="directory-title">
        <div className="beyu-home-inner">
          <h2 id="directory-title">Institutional directory</h2>
          <p className="beyu-dest-directory-intro">
            One ecosystem, eight institutional homepages. Each opens its own governed entry point and applies
            its own server-side access controls.
          </p>
          <ul className="beyu-dest-directory-grid">
            <li>
              <a href={apexHref} className="beyu-dest-directory-card">
                <span className="beyu-dest-directory-code">BEYU_OS</span>
                <strong>BEYU</strong>
                <small>Central institutional homepage · control plane</small>
              </a>
            </li>
            {ALL_DESTINATIONS.map((entry) => {
              const current = entry.code === d.code;
              return (
                <li key={entry.code}>
                  <a
                    href={entryHref(entry)}
                    className="beyu-dest-directory-card"
                    aria-current={current ? "page" : undefined}
                  >
                    <span className="beyu-dest-directory-code">{entry.registryCode}</span>
                    <strong>{entry.name}</strong>
                    <small>{DESTINATION_TYPE_LABEL[entry.destinationType]}</small>
                  </a>
                </li>
              );
            })}
          </ul>
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
              <h5>This destination</h5>
              <ul>
                <li>
                  <a href="#about">About {d.name}</a>
                </li>
                <li>
                  <a href="#access">Governed access</a>
                </li>
                <li>
                  <a href="/sign-in">Sign In</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Sector OS</h5>
              <ul>
                {SECTOR_OPERATING_SYSTEMS.map((os) => (
                  <li key={os.code}>
                    <a href={entryHref(os)}>{os.name}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h5>Institution</h5>
              <ul>
                <li>
                  <a href={entryHref(FOUNDATION_ORGANIZATION)}>{FOUNDATION_ORGANIZATION.name}</a>
                </li>
                {CANONICAL_SURFACES.map((surface) => (
                  <li key={surface.code}>
                    <a href={entryHref(surface)}>{surface.name}</a>
                  </li>
                ))}
                <li>
                  <a href={apexHref}>BEYU central homepage</a>
                </li>
              </ul>
            </div>
            <div>
              <h5>Governance</h5>
              <ul>
                <li>Server-side authorization</li>
                <li>Tenant isolation</li>
                <li>Hash-chained audit</li>
              </ul>
            </div>
          </div>

          <div className="beyu-footer-contact">
            <span>OFFICIAL BEYU CONTACT</span>
            <a href={BEYU_CONTACT_TEL}>{BEYU_CONTACT_DISPLAY}</a>
            <a href={BEYU_WHATSAPP}>WhatsApp BEYU →</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

