import { redirect } from "next/navigation";
import { resolvePrincipalForPage } from "@/lib/guard";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { SignInForm, type BootstrapIdentity } from "./sign-in-form";
import { DestinationDenied, GovernedSignIn } from "./governed-sign-in";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import { canonicalHostForRequest } from "@/lib/canonical-host";
import { canonicalContextOf, destinationForResolution } from "@/lib/canonical-hosts";
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

const GOVERNANCE_FOUNDATIONS = [
  { title: "Trust", copy: "One constitution, one authority model, one audit truth." },
  { title: "Care", copy: "Family, workforce and beneficiary data held to the highest tier." },
  { title: "Integrity", copy: "Hash-chained audit; financial history is never overwritten." },
  { title: "Innovation", copy: "Noelia AI on the HIVE runtime — governed, never unbounded." },
  { title: "Impact", copy: "Capital, waterfall and foundation allocation, fully explainable." },
];

const CONTROL_PLANE_FACTS = [
  "ZERO TRUST",
  "RBAC + ABAC",
  "TENANT ISOLATION",
  "HASH-CHAINED AUDIT",
  "JURISDICTION AWARE",
  "HUMAN ACCOUNTABILITY",
] as const;

function HomePageContent() {
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
            <a href="#">About BEYU</a>
            <a href="#">Our Architecture</a>
            <a href="#">Sector OS</a>
            <a href="#">Capabilities</a>
            <a href="#">NOELIA AI</a>
            <a href="#">Technology</a>
            <a href="#">Contact</a>
          </nav>

          <div className="beyu-top-actions">
            <button type="button" className="beyu-signin-btn">
              Sign In <span>→</span>
            </button>
            <button type="button" className="beyu-theme-toggle" aria-label="Toggle theme">
              ☾
            </button>
          </div>
        </div>
      </header>

      <section className="beyu-hero">
        <div className="beyu-home-inner beyu-hero-inner">
          <div className="beyu-hero-copy">
            <h1>
              Bridging Care.
              <span>Building Trust.</span>
            </h1>
            <p className="beyu-hero-kicker">A Constitutional Enterprise Operating System.</p>
            <p className="beyu-hero-text">
              BEYU connects institutional governance, enterprise operations, intelligence and multi-sector
              capabilities through one unified operating architecture.
            </p>
            <div className="beyu-hero-actions">
              <a href="#" className="beyu-primary-btn">Explore BEYU <span>→</span></a>
              <a href="#" className="beyu-secondary-btn">Explore Our Operating Systems <span>→</span></a>
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

      <section className="beyu-about-section">
        <div className="beyu-home-inner beyu-about-grid">
          <div className="beyu-about-copy">
            <h2>ABOUT BEYU</h2>
            <div className="beyu-bar" />
            <p>
              BEYU is a constitutional enterprise ecosystem built on three foundational pillars:
              Constitutional Control Plane, Enterprise Operating Kernel and Governed Intelligence Layer.
            </p>
            <a href="#" className="beyu-learn-btn">Learn More <span>→</span></a>
          </div>

          <div className="beyu-building-visual" aria-hidden="true">
            <div className="beyu-building-card">
              <div className="beyu-building-main" />
              <div className="beyu-building-side" />
            </div>
          </div>
        </div>
      </section>

      <section className="beyu-systems-section">
        <div className="beyu-home-inner">
          <h3>ONE ECOSYSTEM. FOUR SECTOR OPERATING SYSTEMS.</h3>
          <div className="beyu-systems-grid">
            {[
              { name: "HEALTH_OS", text: "Integrated healthcare operations for healthier communities.", tone: "gold" },
              { name: "FINANCE_OS", text: "Financial management for intelligent growth.", tone: "blue" },
              { name: "AGRICULTURE_OS", text: "Smart agriculture for food security.", tone: "green" },
              { name: "UJENZI_OS", text: "Infrastructure for a stronger tomorrow.", tone: "light" },
            ].map((item) => (
              <article key={item.name} className={`beyu-system-card beyu-${item.tone}`}>
                <div className="beyu-system-art" aria-hidden="true" />
                <div className="beyu-system-label">{item.name}</div>
                <p>{item.text}</p>
                <a href="#">Explore <span>→</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="beyu-capability-section">
        <div className="beyu-home-inner beyu-capability-shell">
          <div className="beyu-capabilities-panel">
            <h3>SHARED ENTERPRISE CAPABILITIES</h3>
            <div className="beyu-capability-grid">
              {[
                ["Constitutional Governance", "⚖"],
                ["Human Capital Management", "👥"],
                ["Family Office", "🏢"],
                ["Risk & Assurance", "✓"],
                ["Knowledge Management", "📚"],
                ["Audit & Accountability", "🧾"],
              ].map(([label, icon]) => (
                <div key={label} className="beyu-capability-item">
                  <span className="beyu-capability-icon" aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="beyu-noelia-panel">
            <div className="beyu-noelia-portrait" aria-hidden="true">
              <div className="beyu-noelia-face" />
            </div>
            <div className="beyu-noelia-copy">
              <h4>NOELIA</h4>
              <p>Intelligence · Governance · Care</p>
              <div className="beyu-noelia-tag">Your governed AI assistant, supporting the BEYU ecosystem.</div>
              <a href="#">Discover NOELIA <span>→</span></a>
            </div>
          </aside>
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
            <a href="#" className="beyu-impact-btn">Our Vision <span>→</span></a>
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
            <a href="#">Sign In <span>→</span></a>
          </div>
        </div>
      </section>

      <footer className="beyu-footer">
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
                <li>Institutional Structure</li>
                <li>Governance</li>
                <li>Sector OS</li>
                <li>Health OS</li>
              </ul>
            </div>
            <div>
              <h5>Finance_OS</h5>
              <ul>
                <li>Agriculture_OS</li>
                <li>Ujenzi_OS</li>
                <li>BEYU Foundation</li>
              </ul>
            </div>
            <div>
              <h5>NOELIA AI</h5>
              <ul>
                <li>Enterprise Capabilities</li>
                <li>Technology</li>
                <li>Contact</li>
              </ul>
            </div>
            <div>
              <h5>Privacy Policy</h5>
              <ul>
                <li>Terms &amp; Conditions</li>
                <li>Security</li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}

export default async function SignInPage() {
  const principal = await resolvePrincipalForPage();

  const canonicalHost = await canonicalHostForRequest();
  const hostDestination = destinationForResolution(canonicalHost);
  const requestedContext =
    canonicalHost.kind === "SECTOR_OS" || canonicalHost.kind === "SURFACE"
      ? canonicalContextOf(canonicalHost)
      : null;
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
  }

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

  return <HomePageContent />;
}
