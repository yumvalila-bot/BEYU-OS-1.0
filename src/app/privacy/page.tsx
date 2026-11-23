import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata = {
  title: "Privacy Policy · BEYU",
  description: "BEYU institutional privacy, personal data protection, consent, and confidentiality standards.",
};

export default function PrivacyPolicyPage() {
  return (
    <PublicInfoShell
      eyebrow="BEYU Legal Framework · BEYU-LF-PRIV-01"
      title="Privacy Policy"
      subtitle="How BEYU collects, safeguards, governs, and limits access to personal and institutional information across the BEYU ecosystem."
    >
      <div className="beyu-doc-card">
        <section>
          <h2>1. Constitutional Privacy Principle</h2>
          <p>
            BEYU treats privacy, confidentiality, and informed consent as non-negotiable architectural commitments.
            Access to personal, clinical, financial, agricultural, and construction data inside BEYU operating systems
            is strictly tenant-isolated, role-scoped, and auditable.
          </p>
        </section>

        <section>
          <h2>2. Public Website Visitors</h2>
          <p>
            Browsing the public BEYU homepage, News &amp; Events archive, and institutional information pages does not
            require authentication and does not expose any internal workspace records. Anonymous public feeds read
            exclusively from records explicitly classified as <code>PUBLIC</code> and independently approved for
            external publication.
          </p>
        </section>

        <section>
          <h2>3. Authenticated Platform Users</h2>
          <p>
            When authorized personnel sign in through BEYU&apos;s canonical gateway, authentication credentials,
            multi-factor verification events, session tokens, and high-risk actions are recorded in immutable security
            audit trails for accountability and regulatory compliance.
          </p>
        </section>

        <section>
          <h2>4. Data Protection &amp; Inquiries</h2>
          <p>
            To exercise data protection rights or inquire about BEYU privacy governance, contact{" "}
            <a href="mailto:info@beyu.co.tz" className="beyu-inline-link">
              info@beyu.co.tz
            </a>
            . Security vulnerability reports should be directed to our dedicated security channel described on the{" "}
            <Link href="/security" className="beyu-inline-link">
              Security page
            </Link>
            .
          </p>
        </section>
      </div>
    </PublicInfoShell>
  );
}
