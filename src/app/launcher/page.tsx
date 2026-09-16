/**
 * Governed operating-system launcher.
 *
 * BEYU OS is the one constitutional control plane. Finance, Health,
 * Agriculture and Foundation are Sector OSs beneath it — never peer control
 * planes and never capabilities renamed as operating systems.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { Icon } from "@/components/icons";
import { resolvePrincipal } from "@/lib/session";
import { SignOutButton } from "../os/sign-out-button";
import { SECTOR_OPERATING_SYSTEMS, authorizedOperatingSystems, type OperatingSystemDestination } from "@/lib/operating-systems";

function DestinationCard({ destination, authorized }: { destination: OperatingSystemDestination; authorized: boolean }) {
  const content = (
    <>
      <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${authorized ? "bg-[#0b1f4d] text-[#e7c45c]" : "bg-slate-100 text-slate-400"}`}>
        <Icon name={destination.icon} className="h-6 w-6" />
      </span>
      <span className="mt-5 flex flex-wrap items-start justify-between gap-3">
        <span>
          <span className="block text-[11px] font-semibold tracking-[0.16em] text-slate-500">
            {destination.code} · {destination.level === "CONTROL_PLANE" ? "CONSTITUTIONAL CONTROL PLANE" : "SECTOR OS"}
          </span>
          <span className={`mt-1 block text-xl font-semibold tracking-tight ${authorized ? "text-[#0b1f4d]" : "text-slate-500"}`}>{destination.name}</span>
        </span>
        <span
          className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${authorized ? "border-emerald-600/25 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-50 text-slate-500"}`}
        >
          {authorized ? "AUTHORISED" : "NOT IN CURRENT GRANT"}
        </span>
      </span>
      <span className="mt-3 block text-[13px] leading-relaxed text-slate-600">{destination.description}</span>
      <span className={`mt-5 flex items-center justify-between text-[12px] font-semibold ${authorized ? "text-[#9b7410]" : "text-slate-500"}`}>
        {authorized ? "Open governed destination" : "Access unavailable for this identity"}
        {authorized && (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5 transition group-hover:translate-x-1">
            <path d="m9 5 7 7-7 7" />
          </svg>
        )}
      </span>
    </>
  );

  if (!authorized) {
    return <article className="relative overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6">{content}</article>;
  }

  return (
    <Link
      href={destination.href}
      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-[#d4a017]/60 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4a017]"
    >
      {content}
    </Link>
  );
}

export default async function LauncherPage() {
  const principal = await resolvePrincipal();
  if (!principal) redirect("/");

  const destinations = await authorizedOperatingSystems(principal);
  if (destinations.length === 1) redirect(destinations[0].href);

  if (destinations.length === 0) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <section aria-labelledby="launcher-denied-title" className="mx-auto max-w-md text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0b1f4d] text-[#e7c45c]">
            <Icon name="security" className="h-7 w-7" />
          </span>
          <h1 id="launcher-denied-title" className="mt-5 text-3xl font-semibold tracking-tight text-[#0b1f4d]">
            No operating-system access
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600">Your identity is valid, but no active grant or Health federation link authorises an operating-system destination.</p>
          <SignOutButton
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-lg bg-[#0b1f4d] px-6 text-[13px] font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#d4a017] disabled:cursor-not-allowed disabled:opacity-60"
          />
        </section>
      </main>
    );
  }

  const controlPlane = destinations.filter((destination) => destination.level === "CONTROL_PLANE");
  const authorizedCodes = new Set(destinations.map((destination) => destination.code));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-[#0b1f4d] text-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="inline-flex rounded-xl bg-white p-1.5">
              <BeyuOsLogo size={46} ariaLabel="BEYU OS" />
            </span>
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#e7c45c]">OPERATING-SYSTEM LAUNCHER</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Select a governed destination</h1>
              <p className="mt-1 text-[12px] text-white/60">Bridging Care. Building Trust.</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end sm:text-right">
            <div>
              <p className="text-[13px] font-semibold">{principal.displayName}</p>
              <p className="mt-0.5 text-[11px] text-white/55">{principal.email}</p>
              <p className="mt-1 text-[10px] tracking-[0.12em] text-white/40">
                {principal.tenantCode} · {principal.clearance}
              </p>
            </div>
            <SignOutButton className="inline-flex min-h-9 items-center justify-center rounded-md border border-white/25 px-3 text-[11px] font-semibold text-white/80 transition hover:border-[#d4a017] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a017] disabled:cursor-not-allowed disabled:opacity-60" />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-10 px-6 py-10">
        {controlPlane.length > 0 && (
          <section aria-labelledby="control-plane-heading">
            <div className="mb-4">
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[#9b7410]">ONE GLOBAL KERNEL</p>
              <h2 id="control-plane-heading" className="mt-1 text-xl font-semibold tracking-tight text-[#0b1f4d]">
                Constitutional control plane
              </h2>
              <p className="mt-1 max-w-3xl text-[12.5px] text-slate-600">
                Shared identity, organisation, ownership, governance, risk, compliance, HCM, documents,
                audit, registries and intelligence are governed here once.
              </p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              {controlPlane.map((destination) => (
                <DestinationCard key={destination.code} destination={destination} authorized />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="sector-os-heading" className="border-t border-slate-200 pt-8">
          <div className="mb-4">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[#9b7410]">BENEATH BEYU OS</p>
            <h2 id="sector-os-heading" className="mt-1 text-xl font-semibold tracking-tight text-[#0b1f4d]">
              Sector operating systems
            </h2>
            <p className="mt-1 max-w-3xl text-[12.5px] text-slate-600">
              Only Sector OSs covered by your current grants or canonical federation link are launchable.
              Every destination rechecks authority on entry.
            </p>
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {SECTOR_OPERATING_SYSTEMS.map((destination) => (
              <DestinationCard key={destination.code} destination={destination} authorized={authorizedCodes.has(destination.code)} />
            ))}
          </div>
        </section>

        <footer className="border-t border-slate-200 pt-5 text-[11px] leading-relaxed text-slate-500">
          Launcher visibility is not authority. Tenant, entity, country, role, permission, clearance and
          operating-system boundaries are re-evaluated by each destination. Finance OS remains the
          financial source of truth.
        </footer>
      </div>
    </main>
  );
}
