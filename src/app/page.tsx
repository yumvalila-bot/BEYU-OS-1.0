import { redirect } from "next/navigation";
import { resolvePrincipal } from "@/lib/session";
import { BeyuMark } from "@/components/brand";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

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
          <div className="flex items-center gap-4">
            <BeyuMark size={64} />
            <div>
              <div className="text-[30px] font-semibold tracking-[0.3em]">BEYU OS</div>
              <div className="mt-1 text-[10px] font-medium tracking-[0.42em] text-[#d4af37]">
                GLOBAL ENTERPRISE CONTROL PLANE
              </div>
            </div>
          </div>

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
              <BeyuMark size={34} />
              <div>
                <div className="text-[15px] font-semibold">Welcome</div>
                <div className="text-[11.5px] text-white/60">Sign in to the control plane</div>
              </div>
            </div>
            <div className="beyu-gold-rule my-5" />
            <SignInForm />
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
