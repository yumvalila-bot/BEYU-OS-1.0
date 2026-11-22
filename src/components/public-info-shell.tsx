import type { ReactNode } from "react";
import Link from "next/link";
import { BeyuOsLogo } from "@/components/beyu-os-logo";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: ReactNode;
};

/**
 * Shared public institutional page shell used by `/news`, `/news/[slug]`,
 * `/privacy`, `/terms`, and `/security`. Keeps navigation, brand identity,
 * and footer links consistent with the canonical BEYU public homepage.
 */
export function PublicInfoShell({ eyebrow, title, subtitle, children }: Props) {
  return (
    <div className="beyu-public-page">
      <div className="beyu-topbar">
        <div className="beyu-public-inner beyu-topbar-inner">
          <div className="beyu-topbar-contact">
            <a href="tel:+255615766716">+255615766716</a>
            <span aria-hidden="true">|</span>
            <a href="mailto:info@beyu.co.tz">info@beyu.co.tz</a>
            <span aria-hidden="true">|</span>
            <span>Tanzania</span>
          </div>
          <div className="beyu-topbar-right">
            <Link href="/news" className="beyu-topbar-link">
              News &amp; Events
            </Link>
            <span aria-hidden="true">|</span>
            <Link href="/sign-in" className="beyu-topbar-link">
              Governed Sign In
            </Link>
          </div>
        </div>
      </div>

      <header className="beyu-nav-wrap">
        <div className="beyu-public-inner beyu-nav-inner">
          <Link href="/" className="beyu-brand-lockup" aria-label="BEYU home">
            <BeyuOsLogo size={42} ariaLabel="BEYU" />
            <span className="beyu-brand-text">
              <strong>BEYU</strong>
              <span>Bridging Care. Building Trust.</span>
            </span>
          </Link>

          <nav className="beyu-nav-links" aria-label="Public navigation">
            <Link href="/" className="beyu-nav-link">
              Home
            </Link>
            <Link href="/#about" className="beyu-nav-link">
              About BEYU
            </Link>
            <Link href="/#sector-os" className="beyu-nav-link">
              Our Ecosystem
            </Link>
            <Link href="/news" className="beyu-nav-link">
              News &amp; Events
            </Link>
            <Link href="/security" className="beyu-nav-link">
              Security
            </Link>
          </nav>

          <Link href="/sign-in" className="beyu-nav-signin">
            Sign In <span aria-hidden="true">›</span>
          </Link>
        </div>
      </header>

      <section className="beyu-subpage-hero">
        <div className="beyu-public-inner">
          <p className="beyu-subpage-eyebrow">{eyebrow}</p>
          <h1 className="beyu-subpage-title">{title}</h1>
          <p className="beyu-subpage-subtitle">{subtitle}</p>
        </div>
      </section>

      <main className="beyu-subpage-main">
        <div className="beyu-public-inner">{children}</div>
      </main>

      <footer className="beyu-footer-compact">
        <div className="beyu-public-inner beyu-footer-compact-inner">
          <p>© {new Date().getFullYear()} BEYU. All Rights Reserved. Constitutional Enterprise Operating Ecosystem.</p>
          <nav aria-label="Institutional legal and security links" className="beyu-footer-compact-links">
            <Link href="/">Home</Link>
            <Link href="/news">News &amp; Events</Link>
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms of Use</Link>
            <Link href="/security">Security</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
