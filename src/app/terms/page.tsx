import Link from "next/link";
import { PublicInfoShell } from "@/components/public-info-shell";

export const metadata = {
  title: "Terms of Use · BEYU",
  description: "Terms governing public access and authorized use of the BEYU Enterprise Operating Ecosystem.",
};

export default function TermsOfUsePage() {
  return (
    <PublicInfoShell
      eyebrow="BEYU Legal Framework · BEYU-LF-TOS-01"
      title="Terms of Use"
      subtitle="Conditions governing public access to BEYU digital properties and authorized entry into BEYU governed workspaces."
    >
      <div className="beyu-doc-card">
        <section>
          <h2>1. Scope &amp; Institutional Authority</h2>
          <p>
            These Terms of Use govern access to the public BEYU website and entry gateways connecting to BEYU&apos;s four
            Sector Operating Systems (HEALTH_OS, FINANCE_OS, AGRICULTURE_OS, and UJENZI_OS), shared enterprise
            capabilities, and sister organization BEYU Foundation workspaces.
          </p>
        </section>

        <section>
          <h2>2. Authorized Access Only</h2>
          <p>
            Internal BEYU workspaces are restricted to duly authorized personnel, partners, and designated stewards.
            Unauthorized access attempts, credential sharing, automated scraping of protected endpoints, or circumvention
            of multi-factor authentication and Segregation of Duties controls are strictly prohibited.
          </p>
        </section>

        <section>
          <h2>3. Governed Intelligence (NOELIA)</h2>
          <p>
            NOELIA operates as an advisory, permission-aware intelligence layer subject to human authority and
            constitutional governance. NOELIA outputs do not constitute unsupervised medical, legal, financial, or
            binding institutional directives without required human review and approval.
          </p>
        </section>

        <section>
          <h2>4. Contact &amp; Related Policies</h2>
          <p>
            Questions regarding these terms may be directed to{" "}
            <a href="mailto:info@beyu.co.tz" className="beyu-inline-link">
              info@beyu.co.tz
            </a>
            . Please also review our{" "}
            <Link href="/privacy" className="beyu-inline-link">
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link href="/security" className="beyu-inline-link">
              Security &amp; Disclosure Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </PublicInfoShell>
  );
}
