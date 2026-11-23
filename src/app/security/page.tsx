import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata = {
  title: "Security & Responsible Disclosure · BEYU",
  description: "BEYU OS security architecture, fail-closed guarantees, and vulnerability disclosure policy.",
};

export default function SecurityPolicyPage() {
  return (
    <PublicInfoShell
      eyebrow="BEYU Trust & Assurance · SECURITY.md"
      title="Security & Responsible Disclosure"
      subtitle="Defense-in-depth safeguards protecting BEYU institutions, healthcare data, financial records, and governed operations."
    >
      <div className="beyu-doc-card">
        <section>
          <h2>1. Constitutional Security Controls</h2>
          <ul>
            <li>
              <strong>Single Governed Identity &amp; MFA:</strong> All workspaces authenticate through a unified
              gateway enforcing server-verified sessions, step-up MFA for high-risk actions, and fail-closed
              authorization.
            </li>
            <li>
              <strong>Database-Enforced Tenant Isolation:</strong> PostgreSQL Row Level Security (<code>ENABLE</code>{" "}
              and <code>FORCE ROW LEVEL SECURITY</code>) enforces entity boundaries independently of application code.
            </li>
            <li>
              <strong>Segregation of Duties &amp; Immutable Audit:</strong> High-impact financial, administrative, and
              public publishing approvals require independent second-party authorization and emit tamper-evident audit
              records.
            </li>
            <li>
              <strong>Strict Public/Internal Separation:</strong> Public pages never expose internal tenant data,
              drafts, or unapproved content.
            </li>
          </ul>
        </section>

        <section>
          <h2>2. Reporting a Vulnerability</h2>
          <p>
            If you discover a potential security vulnerability in a BEYU web property or service, please report it
            privately rather than posting it publicly. Send details — including affected route, reproduction steps, and
            observed impact — to{" "}
            <a href="mailto:security@beyu.os" className="beyu-inline-link">
              security@beyu.os
            </a>{" "}
            (or institutional contact{" "}
            <a href="mailto:info@beyu.co.tz" className="beyu-inline-link">
              info@beyu.co.tz
            </a>
            ).
          </p>
          <p>
            BEYU acknowledges responsible security reports within 24 hours and coordinates verified fixes promptly.
          </p>
        </section>
      </div>
    </PublicInfoShell>
  );
}
