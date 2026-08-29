import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { BeyuLogo } from "@/components/beyu-logo";
import { SignInForm, type BootstrapIdentity } from "./sign-in-form";

export const dynamic = "force-dynamic";

/**
 * True when this instance is serving in production mode.
 *
 * WHY NODE_ENV AND NOT VERCEL_ENV
 *   `VERCEL_ENV` was tried first and empirically does not work: with
 *   `VERCEL_ENV=production` exported to `next start`, the server still rendered
 *   the bootstrap identities, i.e. the value was not observable at request time
 *   (Next.js inlines statically-analysable `process.env` references in server
 *   code at build time). Shipping a control that does not actually fire would be
 *   worse than no control, because it reads as protected while publishing the
 *   same data.
 *
 *   `NODE_ENV` is set by the runner itself — `next start` always runs with
 *   `NODE_ENV=production`, `next dev` with `development` — so it cannot be
 *   missed. The rule is therefore: the provisioning hint exists only under the
 *   development server. Any production-mode server (local `next start`, Vercel
 *   preview, Vercel production) suppresses it. That is the safe direction: the
 *   failure mode of this control is a missing convenience, never a disclosure.
 */
function isProductionDeployment(): boolean {
  return process.env["NODE_ENV"] === "production";
}

/**
 * Governed bootstrap identities — a provisioning convenience for non-production
 * environments only.
 *
 * This lives in a SERVER component and is never imported by client code, so in a
 * production build these addresses are not in the HTML and not in any shipped
 * JavaScript chunk. Publishing them on an unauthenticated page would hand an
 * attacker the exact mailboxes to target and the authority each one holds.
 */
const BOOTSTRAP_IDENTITIES: BootstrapIdentity[] = [
  { email: "ceo@beyu.os", role: "Group Chief Executive" },
  { email: "cfo@beyu.os", role: "Group CFO — Finance OS authority" },
  { email: "governance@beyu.os", role: "Chief Governance Officer" },
  { email: "risk@beyu.os", role: "Chief Risk & Compliance" },
  { email: "family@beyu.os", role: "Family Office Principal" },
  { email: "auditor@beyu.os", role: "Internal Auditor (read-only)" },
];

const PILLARS = [
  { title: "Trust", copy: "One constitution, one authority model, one audit truth." },
  { title: "Care", copy: "Family, workforce and beneficiary data held to the highest tier." },
  { title: "Integrity", copy: "Hash-chained audit; financial history is never overwritten." },
  { title: "Innovation", copy: "Noelia AI on the HIVE runtime — governed, never unbounded." },
  { title: "Impact", copy: "Capital, waterfall and foundation allocation, fully explainable." },
];

export default async function SignInPage() {
  const principal = await resolvePrincipal();
  if (principal) redirect("/os");

  return (
    <main className="beyu-shell min-h-screen text-white">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.15fr_0.85fr] lg:py-16">
        <section className="flex flex-col justify-center">
          <BeyuLogo variant="light" size={64} ariaLabel="BEYU OS — Global Enterprise Control Plane" />

          <div className="beyu-gold-rule my-8 max-w-xl" />

          <h1 className="max-w-2xl text-[34px] font-semibold leading-[1.15] tracking-tight lg:text-[42px]">
            The constitutional control plane of the{" "}
            <span className="text-[#d4af37]">BEYU ecosystem</span>.
          </h1>
          <p className="mt-5 max-w-2xl text-[14.5px] leading-relaxed text-white/70">
            BEYU OS governs identity, organisation, ownership, governance, risk, compliance, capital,
            workforce, data, audit and AI once — and only once. Health OS, Finance OS, Agriculture OS
            and Foundation OS execute specialised operations underneath it, consuming shared
            capabilities through governed APIs, events and policies.
          </p>

          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <div key={p.title} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="text-[12.5px] font-semibold text-[#d4af37]">{p.title}</div>
                <div className="mt-1 text-[12px] leading-relaxed text-white/65">{p.copy}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-[10.5px] tracking-[0.16em] text-white/40">
            <span>ZERO TRUST</span>
            <span>RBAC + ABAC</span>
            <span>TENANT ISOLATION</span>
            <span>HASH-CHAINED AUDIT</span>
            <span>JURISDICTION AWARE</span>
            <span>HUMAN ACCOUNTABILITY</span>
          </div>
        </section>

        <section className="flex items-center justify-center">
          <div className="w-full max-w-md rounded-2xl border border-white/12 bg-white/[0.06] p-7 backdrop-blur">
            <div className="flex items-center gap-3">
              <BeyuLogo variant="mark" size={34} ariaLabel="BEYU" />
              <div>
                <div className="text-[15px] font-semibold">Welcome</div>
                <div className="text-[11.5px] text-white/60">Sign in to the control plane</div>
              </div>
            </div>
            <div className="beyu-gold-rule my-5" />
            {/*
              The bootstrap-identity hint is a provisioning convenience, not a
              feature of a live control plane. Publishing privileged account
              addresses and their roles on an unauthenticated production page is
              a username-enumeration aid: it tells an attacker exactly which six
              mailboxes to attack and what authority each one holds. It is
              therefore rendered outside production only.

              The decision is made SERVER-SIDE and passed in as a prop, so no
              environment value is ever exposed to the client bundle.
            */}
            <SignInForm identities={isProductionDeployment() ? [] : BOOTSTRAP_IDENTITIES} />
            <p className="mt-6 text-[10.5px] leading-relaxed text-white/45">
              Access is least-privilege and fully audited. High-risk capabilities require step-up
              authentication. Unauthorised access attempts are recorded in the immutable audit ledger.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
