import type { Metadata } from "next";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact BEYU OS",
  description: "Contact BEYU OS — general inquiries, support, and partnership requests. Bridging Care. Building Trust.",
  openGraph: {
    title: "Contact BEYU OS",
    description: "Get in touch with BEYU OS. We respond to every inquiry with care.",
    type: "website",
  },
  alternates: { canonical: "https://beyu-os-1-0.vercel.app/contact" },
};

export default function ContactPage() {
  return (
    <main className="beyu-login-bg min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center rounded-xl bg-white p-2 ring-1 ring-[#0B1F4D]/10">
            <BeyuOsLogo size={36} ariaLabel="BEYU OS" />
          </span>
          <div>
            <p className="beyu-kicker text-[#5b6b85]">BEYU OS · Bridging Care. Building Trust.</p>
            <h1 className="text-[22px] font-semibold tracking-tight text-[#0B1F4D]">Contact us</h1>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="beyu-panel p-6">
            <h2 className="text-[15px] font-semibold text-[#0B1F4D]">Send a message</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed beyu-muted">
              We welcome inquiries from clients, partners, and the public. Fields marked * are required. Your
              message is validated both in the browser and on the server, and we retain it only as needed to respond.
            </p>
            <div className="mt-5">
              <ContactForm />
            </div>
          </div>

          <div className="space-y-4">
            <div className="beyu-panel p-5">
              <h3 className="text-[13px] font-semibold text-[#0B1F4D]">Other ways to reach us</h3>
              <p className="mt-2 text-[12px] leading-relaxed beyu-muted">
                BEYU OS is the constitutional control plane of the BEYU ecosystem. Sector OS inquiries (Health,
                Finance, Agriculture, Ujenzi) are routed through the governed operations desk.
              </p>
              <ul className="mt-3 list-disc pl-5 text-[12px] leading-relaxed beyu-muted">
                <li>For authenticated users: open Communications → Contacts in BEYU OS.</li>
                <li>For governance matters: contact your designated governance lead.</li>
              </ul>
            </div>

            <div id="privacy" className="beyu-panel p-5">
              <h3 className="text-[13px] font-semibold text-[#0B1F4D]">Privacy notice</h3>
              <p className="mt-2 text-[12px] leading-relaxed beyu-muted">
                We collect only what you submit (name, email, phone, message) to respond to your inquiry. We do not
                sell data, we do not add you to marketing without explicit consent, and we delete or anonymize inquiry
                records per retention policy. Essential cookies keep this site secure; optional analytics only runs with
                your consent (see cookie banner).
              </p>
              <p className="mt-2 text-[11px] beyu-muted">
                Legal review: this notice is descriptive, not a claim of GDPR/Tanzania-law compliance. Consult counsel
                for regulated processing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
