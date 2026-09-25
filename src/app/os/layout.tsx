import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { adminBootstrapState, notifications } from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { can, type Principal } from "@/lib/authz";
import { checkBeyuOSAuthorization } from "@/lib/os-authorization";
import { authorizedOperatingSystems } from "@/lib/operating-systems";
import { classificationsAtOrBelow } from "@/lib/constants";
import { noeliaProviderModeFromEnvironment } from "@/lib/noelia/appearance";
import { Badge } from "@/components/brand";
import { BeyuOsLogo } from "@/components/beyu-os-logo";
import { GlobalSearch } from "@/components/global-search";
import { HistoryNavigation } from "@/components/history-navigation";
import { NoeliaShellForOS } from "./noelia-shell-for-os";
import { OsBrand } from "./os-brand";
import { CAPABILITY_IA, visible, type CapabilityItem } from "./capabilities";
import {
  DesktopNavigation,
  ResponsiveNavigation,
  type OsNavigationGroup,
  type OsNavigationPrincipal,
} from "./os-navigation";

export const dynamic = "force-dynamic";

/**
 * Navigation is derived from the same canonical capability catalogue rendered
 * by the Executive Control Centre. Shared capabilities use the same `can()`
 * primitive as their target route. Sector OS entries use the canonical launcher
 * resolver so federation and tenant-backed OS scope cannot drift between
 * navigation and deep-link authority. This remains presentation only — every
 * destination repeats its server-side guard.
 */
async function visibleNav(principal: Principal): Promise<OsNavigationGroup[]> {
  const operatingSystemHrefs = new Set(
    (await authorizedOperatingSystems(principal)).map((destination) =>
      destination.href,
    ),
  );
  return CAPABILITY_IA.map((section) => ({
    group: section.title,
    items: section.items
      .filter((item) =>
        section.id === "sector"
          ? operatingSystemHrefs.has(item.href)
          : visible(principal, item),
      )
      .map((item: CapabilityItem) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
      })),
  })).filter((section) => section.items.length > 0);
}

export default async function OsLayout({ children }: { children: ReactNode }) {
  const principal = await requirePrincipal();

  // A session is identity, not OS authorization. Health-only principals and
  // principals with no control-plane grant are routed through the launcher;
  // typing /os (or any nested deep link) cannot bypass this check.
  if (!checkBeyuOSAuthorization(principal).authorized) {
    redirect("/launcher");
  }

  return withTenantDatabaseContext(principal, async () => {
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);

    /*
     * "BEYU Admin — Frontend Preview" marker — a DISPLAY-ONLY fact.
     *
     * The current BEYU administrator is the canonical identity the one-time
     * bootstrap sealed (`admin_bootstrap_state` singleton, `admin_user_id`);
     * the development-preview capability is the named `platform:frontend.preview`
     * grant. Both must hold — the role grant alone, or the sealed identity
     * alone, never suffices, and a missing state row fails closed to "no
     * marker". The marker itself grants nothing: no page, query or RLS policy
     * reads it for authorization, and every surface the administrator opens
     * still re-runs the existing server-side authorization on their own
     * governed grants. Regular users see no marker and gain no capability.
     */
    const [bootstrap] = await db
      .select({ adminUserId: adminBootstrapState.adminUserId })
      .from(adminBootstrapState)
      .where(eq(adminBootstrapState.id, "SINGLETON"))
      .limit(1);
    const frontendPreview =
      bootstrap?.adminUserId === principal.userId &&
      can(principal, "platform:frontend.preview").allowed;

    const roleRecipient =
      principal.roles.length > 0
        ? or(isNull(notifications.role), inArray(notifications.role, principal.roles))
        : isNull(notifications.role);
    const alerts = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.tenantId, principal.tenantId),
          inArray(notifications.classification, allowedClassifications),
          or(
            eq(notifications.userId, principal.userId),
            and(isNull(notifications.userId), roleRecipient),
          ),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(5);
    const nav = await visibleNav(principal);

    /*
     * Noelia shell facts — computed ONCE here, server-side, and passed to the
     * client shell as display-only props. Noelia is a single governed AI
     * identity; she is not a module and does not add a navigation entry.
     * Whether a principal may query her is the existing ai:noelia.query grant;
     * the panel only displays the resulting state and every action still
     * travels through the governed API boundary.
     *
     * The ACTIVE OS context is not a server fact a layout can know (layouts do
     * not receive the pathname), so it is resolved client-side by
     * `NoeliaShellForOS` from the canonical registry — `/os/health` →
     * HEALTH_OS, `/os/finance` → FINANCE_OS, `/os/agriculture` →
     * AGRICULTURE_OS, `/os/ujenzi` → UJENZI_OS, `/os/foundation` →
     * FOUNDATION_OS, everything else → BEYU_OS. Presentation only: it is never
     * an authorization input, and this layout's `checkBeyuOSAuthorization`
     * check above remains the control-plane boundary.
     */
    const noeliaShell = {
      canQuery: can(principal, "ai:noelia.query").allowed,
      mfaSatisfied: principal.mfaSatisfied,
      providerMode: noeliaProviderModeFromEnvironment(),
      principalName: principal.displayName,
    };

    const navigationPrincipal: OsNavigationPrincipal = {
      displayName: principal.displayName,
      email: principal.email,
      roles: principal.roles,
      tenantCode: principal.tenantCode,
      clearance: principal.clearance,
      canSwitchOperatingSystem: nav.some(
        (group) => group.group === "Sector operating systems" && group.items.length > 0,
      ),
    };

    return (
      <div className="flex min-h-screen">
        <a
          href="#beyu-main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-[#d4af37] focus:px-3 focus:py-2 focus:text-[12px] focus:font-semibold focus:text-[#0b1d3a]"
        >
          Skip to main content
        </a>

        <DesktopNavigation groups={nav} principal={navigationPrincipal} />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="beyu-shell sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white sm:px-5 xl:px-8">
            <div className="flex items-center gap-3 xl:hidden">
              <ResponsiveNavigation groups={nav} principal={navigationPrincipal} />
              <OsBrand size={32} />
            </div>
            <div className="hidden items-center gap-3 xl:flex">
              <span className="beyu-kicker text-white/45">Tenant context</span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11.5px]">
                {principal.tenantCode} · {principal.tenantType}
              </span>
              <span className="beyu-kicker text-white/45">Session risk</span>
              <span className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11.5px]">
                {principal.riskScore} · MFA {principal.mfaSatisfied ? "satisfied" : "not satisfied"}
              </span>
              {frontendPreview && (
                <span
                  title="Governed development preview of the canonical BEYU frontend surfaces. This marker grants no permission: every surface still re-runs the existing server-side authorization."
                  className="rounded-md border border-[#d4af37]/60 bg-[#d4af37]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#efd98f]"
                >
                  BEYU Admin — Frontend Preview
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <GlobalSearch visible={can(principal, "platform:search.read").allowed} />
              <NoeliaShellForOS {...noeliaShell} />
              <HistoryNavigation />
              <span className="beyu-kicker text-white/45">Alerts</span>
              <span className="rounded-full border border-[#d4af37]/50 bg-[#d4af37]/15 px-2 py-[3px] text-[11px] font-semibold text-[#efd98f]">
                {alerts.length}
              </span>
            </div>
          </header>

          <main id="beyu-main" className="beyu-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-5 xl:px-8">
            {alerts.length > 0 && (
              <div className="mb-5 flex flex-wrap gap-2">
                {alerts.slice(0, 3).map((alert) => (
                  <Link
                    key={alert.id}
                    href={alert.linkHref ?? "/os"}
                    className="beyu-panel flex items-center gap-2 px-3 py-2 text-[11.5px] transition hover:border-[#d4af37]/50"
                  >
                    <Badge tone={alert.urgency === "HIGH" ? "red" : "gold"}>{alert.urgency}</Badge>
                    <span className="font-medium">{alert.subject}</span>
                    <span className="beyu-muted hidden sm:inline">{alert.body}</span>
                  </Link>
                ))}
              </div>
            )}
            {children}
            <footer className="mt-10 flex items-start gap-2.5 border-t border-[color:var(--beyu-line)] pt-4 text-[10.5px] beyu-muted">
              <BeyuOsLogo size={18} decorative className="mt-[1px] shrink-0" />
              <span>
                BEYU OS · Bridging Care. Building Trust. Every view is permission-scoped, tenant-isolated
                and audited. Metrics resolve to a declared source of truth. AI output is advisory; material
                decisions require human accountability.
              </span>
            </footer>
          </main>
        </div>
      </div>
    );
  });
}
