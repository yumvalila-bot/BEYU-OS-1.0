import type { ReactNode } from "react";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { can, type Principal } from "@/lib/authz";
import type { PermissionCode } from "@/lib/constants";
import { Badge } from "@/components/brand";
import { BeyuLogo } from "@/components/beyu-logo";
import { NavLink } from "./nav-link";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

/**
 * Navigation catalogue.
 *
 * `permission` is the SAME capability the target page passes to
 * `requireAccess()`, and visibility is computed with the SAME `can()` primitive
 * the guard uses. Navigation is therefore derived from server authority, never
 * from a client-side copy of the policy — and it grants nothing: hiding a link
 * is a presentation decision, while the page guard and the API remain the only
 * authority. A principal who types a hidden URL still gets the real governed
 * decision (200 or the recorded "Authorisation denied" page), exactly as before.
 */
const NAV: { group: string; items: { href: string; label: string; permission?: PermissionCode }[] }[] = [
  {
    group: "Control plane",
    items: [
      { href: "/os", label: "Executive Control Centre" },
      { href: "/os/constitution", label: "Constitution & Policy", permission: "governance:policy.read" },
      { href: "/os/registry", label: "OS & Source-of-Truth Registry", permission: "platform:registry.read" },
    ],
  },
  {
    group: "Enterprise",
    items: [
      { href: "/os/organization", label: "Organisation & Ownership", permission: "organization:entity.read" },
      { href: "/os/governance", label: "Governance Engine", permission: "governance:resolution.read" },
      { href: "/os/assurance", label: "Risk · Compliance · Legal", permission: "risk:register.read" },
      { href: "/os/hcm", label: "HCM (workforce truth)", permission: "hcm:employee.read" },
    ],
  },
  {
    group: "Finance OS",
    items: [
      { href: "/os/capital", label: "Capital & Treasury", permission: "finance:capital.read" },
      { href: "/os/waterfall", label: "Waterfall Engine", permission: "finance:waterfall.read" },
      { href: "/os/tax", label: "Tax Strategy Intelligence", permission: "finance:tax.read" },
    ],
  },
  {
    group: "Family & Foundation",
    items: [
      { href: "/os/family", label: "Family Office", permission: "family:member.read" },
      { href: "/os/foundation", label: "Foundation OS", permission: "platform:dashboard.read" },
    ],
  },
  {
    group: "Platform",
    items: [
      { href: "/os/noelia", label: "Noelia AI · HIVE", permission: "ai:noelia.query" },
      { href: "/os/documents", label: "Documents & Knowledge", permission: "documents:registry.read" },
      { href: "/os/audit", label: "Audit, Events & Assurance", permission: "audit:log.read" },
    ],
  },
];

/** Presentation-only filter: derived from `can()`, grants no authority. */
function visibleNav(principal: Principal) {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !item.permission || can(principal, item.permission).allowed,
    ),
  })).filter((section) => section.items.length > 0);
}

export default async function OsLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
  const alerts = await db
    .select()
    .from(notifications)
    .where(eq(notifications.tenantId, principal.tenantId))
    .orderBy(desc(notifications.createdAt))
    .limit(5);
  const nav = visibleNav(principal);

  return (
    <div className="min-h-screen lg:flex">
      <a
        href="#beyu-main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[#d4af37] focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-[#0b1d3a]"
      >
        Skip to main content
      </a>
      <aside
        aria-label="BEYU OS module navigation"
        className="beyu-shell hidden w-[268px] shrink-0 flex-col border-r border-white/10 lg:flex"
      >
        <div className="px-5 pt-5 pb-4">
          <BeyuLogo variant="light" size={40} href="/os" />
        </div>
        <div className="beyu-gold-rule mx-5" />
        <nav aria-label="Primary" className="beyu-scroll flex-1 overflow-y-auto px-3 py-4">
          {nav.map((section) => (
            <div key={section.group} className="mb-5">
              <div className="beyu-kicker px-3 pb-2 text-white/35">{section.group}</div>
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} href={item.href} label={item.label} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-5 py-4">
          <div className="text-[12px] font-semibold text-white">{principal.displayName}</div>
          <div className="mt-0.5 text-[10.5px] text-white/50">{principal.email}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {principal.roles.map((r) => (
              <span key={r} className="rounded border border-[#d4af37]/40 px-1.5 py-[2px] text-[9.5px] tracking-wide text-[#efd98f]">
                {r}
              </span>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[9.5px] tracking-[0.14em] text-white/40">
              {principal.tenantCode} · {principal.clearance}
            </span>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="beyu-shell flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3 text-white lg:px-8">
          <div className="flex items-center gap-3 lg:hidden">
            <BeyuLogo variant="light" size={32} href="/os" />
          </div>
          <div className="hidden items-center gap-3 lg:flex">
            <span className="beyu-kicker text-white/45">Tenant context</span>
            <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11.5px]">
              {principal.tenantCode} · {principal.tenantType}
            </span>
            <span className="beyu-kicker text-white/45">Session risk</span>
            <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11.5px]">
              {principal.riskScore} · MFA {principal.mfaSatisfied ? "satisfied" : "not satisfied"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="beyu-kicker text-white/45">Alerts</span>
            <span className="rounded-full border border-[#d4af37]/50 bg-[#d4af37]/15 px-2 py-[3px] text-[11px] font-semibold text-[#efd98f]">
              {alerts.length}
            </span>
            <div className="lg:hidden">
              <SignOutButton />
            </div>
          </div>
        </header>

        <div className="lg:hidden">
          <nav
            aria-label="Modules"
            className="beyu-scroll flex gap-2 overflow-x-auto border-b border-[color:var(--beyu-line)] bg-[color:var(--beyu-card)] px-4 py-2"
          >
            {nav.flatMap((s) => s.items).map((item) => (
              <NavLink key={item.href} href={item.href} label={item.label} variant="chip" />
            ))}
          </nav>
        </div>

        <main id="beyu-main" className="beyu-scroll min-h-0 flex-1 overflow-y-auto px-5 py-6 lg:px-8">
          {alerts.length > 0 && (
            <div className="mb-5 flex flex-wrap gap-2">
              {alerts.slice(0, 3).map((a) => (
                <Link
                  key={a.id}
                  href={a.linkHref ?? "/os"}
                  className="beyu-panel flex items-center gap-2 px-3 py-2 text-[11.5px] transition hover:border-[#d4af37]/50"
                >
                  <Badge tone={a.urgency === "HIGH" ? "red" : "gold"}>{a.urgency}</Badge>
                  <span className="font-medium">{a.subject}</span>
                  <span className="beyu-muted hidden sm:inline">{a.body}</span>
                </Link>
              ))}
            </div>
          )}
          {children}
          <footer className="mt-10 flex items-start gap-2.5 border-t border-[color:var(--beyu-line)] pt-4 text-[10.5px] beyu-muted">
            <BeyuLogo variant="mark" size={18} decorative className="mt-[1px] shrink-0" />
            <span>
              BEYU OS · every view is permission-scoped, tenant-isolated and audited. Metrics resolve to a
              declared source of truth. AI output is advisory; material decisions require human accountability.
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
  });
}
