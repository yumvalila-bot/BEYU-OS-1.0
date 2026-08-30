import { useState } from "react";
import { I } from "../components/Icons";
import { DocumentViewer, DocList } from "../components/DocumentViewer";
import { docsForModule, BEYU_DOCS, type BeyuDoc } from "../data/documents";

export function SettingsScreenImpl() {
  const [doc, setDoc] = useState<BeyuDoc | null>(null);

  // Public-facing legal docs the user is "subject to"
  const legalDocs = [
    ...docsForModule("public-policies"),
    ...BEYU_DOCS.filter((d) => d.type === "Legal Compliance"),
  ];

  const settingsCards = [
    { i: "user", t: "Profile & Identity", s: "Edit name, photo, contact details" },
    { i: "building", t: "Tenant Memberships", s: "Manage which hospitals you can access" },
    { i: "fingerprint", t: "Biometric & MFA", s: "Fingerprint, Face ID, WebAuthn" },
    { i: "bell", t: "Notifications", s: "Push, email, SMS preferences" },
    { i: "globe", t: "Language", s: "English · Kiswahili · French" },
    { i: "monitor", t: "Theme & Accessibility", s: "Contrast, font size, motion" },
    { i: "zap", t: "API Keys & Integrations", s: "FHIR, HL7, webhook endpoints" },
    { i: "database", t: "Backup & Sync", s: "Edge sync, offline cache" },
    { i: "shield", t: "Audit Preferences", s: "What to record in your audit log" },
    { i: "lock", t: "Consent & Data Sharing", s: "Cross-tenant sharing controls" },
    { i: "cash", t: "On-Chain Wallet", s: "Signing keys for BeyuDocSign" },
    { i: "phone", t: "Emergency Contacts", s: "Next of kin and care team" },
  ] as const;

  return (
    <div className="p-6 lg:p-8">
      <h1 className="font-display text-3xl text-navy-800">Settings</h1>
      <div className="gold-divider w-16 mt-3 mb-6" />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {settingsCards.map((s) => {
          const Ico = I[s.i as keyof typeof I];
          return (
            <div key={s.t} className="card p-5 hover:-translate-y-0.5 transition cursor-pointer">
              <div className="w-10 h-10 rounded-lg bg-navy-50 flex items-center justify-center mb-3"><Ico size={18} stroke="#0B1D3A" /></div>
              <div className="font-semibold text-navy-800">{s.t}</div>
              <div className="text-xs text-slate-500 mt-1">{s.s}</div>
              <button className="text-xs text-gold-700 font-semibold mt-3 hover:underline">Open →</button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <DocList
            docs={legalDocs}
            title="Legal Documents You're Subject To"
            subtitle="Terms of Service · Privacy Policy · Legal Compliance Register — open any to read"
            onOpen={setDoc}
          />
        </div>

        <div className="card p-5">
          <div className="font-display text-base text-navy-800 mb-3">Your Consent Status</div>
          <div className="space-y-2 text-sm">
            {[
              { l: "Terms of Service v5.0", on: true },
              { l: "Privacy Policy v5.0", on: true },
              { l: "Marketing communications", on: false },
              { l: "Cross-tenant record sharing", on: true },
              { l: "Anonymized research participation", on: true },
              { l: "Telemedicine session recording", on: false },
            ].map((c) => (
              <div key={c.l} className="flex items-center justify-between p-2 rounded hover:bg-slate-50">
                <span className="text-slate-700">{c.l}</span>
                <div className={`w-9 h-5 rounded-full ${c.on ? "bg-emerald-500" : "bg-slate-300"} relative`}>
                  <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white" style={{ left: c.on ? "18px" : "2px" }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-violet-50 border border-violet-200 text-[11px] text-violet-800">
            All consent changes are recorded on BeyuConsent.sol with timestamp and signing key.
          </div>
        </div>
      </div>

      <DocumentViewer doc={doc} onClose={() => setDoc(null)} />
    </div>
  );
}
