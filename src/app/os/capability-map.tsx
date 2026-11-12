import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { osRegistry } from "@/db/schema";
import { type Principal } from "@/lib/authz";
import { authorizedGovernedDestinations } from "@/lib/operating-systems";
import { destinationHrefForRequest } from "@/lib/canonical-host";
import { Badge } from "@/components/brand";
import { Icon } from "@/components/icons";
import { CAPABILITY_IA, visible, type CapabilityItem } from "./capabilities";

/**
 * Sector routes are grouped under their owning OS in the command-centre UI.
 * These are presentation relationships only; every destination retains its
 * own server-side authorization and scope checks.
 */
const SECTOR_CHILDREN: Record<string, string[]> = {
  "/os/finance": [
    "/os/capital",
    "/os/waterfall",
    "/os/tax",
    "/os/finance/payments",
  ],
  "/os/agriculture": ["/os/agriculture/capabilities"],
};

const DESTINATION_REGISTRY_CODE: Record<string, string> = {
  "/os/health": "HEALTH_OS",
  "/os/finance": "FINANCE_OS",
  "/os/agriculture": "AGRICULTURE_OS",
  "/os/ujenzi": "UJENZI_OS",
  "/os/foundation": "SHARED_FOUNDATION_OPERATIONS",
};

function Card({ item, lifecycle, href }: { item: CapabilityItem; lifecycle?: string; href?: string }) {
  return (
    <Link
      href={href ?? item.href}
      className="beyu-panel group flex h-full items-start gap-3 rounded-xl px-4 py-3.5 transition duration-200 hover:-translate-y-0.5 hover:border-[#d4af37]/60 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
    >
      <span className="mt-[1px] flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/35 bg-[#d4af37]/10 text-[#8a6d10] dark:text-[#efd98f]">
        <Icon name={item.icon} className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-semibold tracking-tight group-hover:underline">{item.label}</span>
          {lifecycle && <Badge tone={lifecycle === "ACTIVE" ? "green" : "amber"}>{lifecycle}</Badge>}
        </span>
        <span className="mt-1 block text-[11.5px] leading-relaxed beyu-muted">{item.description}</span>
      </span>
    </Link>
  );
}

function SectorCard({
  item,
  children,
  lifecycle,
  href,
}: {
  item: CapabilityItem;
  children: CapabilityItem[];
  lifecycle?: string;
  href?: string;
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-[color:var(--beyu-line)] bg-[color:var(--beyu-surface)] shadow-sm">
      <div className="p-4 sm:p-5">
        <Link
          href={href ?? item.href}
          className="group flex items-start gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/45 bg-[#d4af37]/12 text-[#8a6d10] dark:text-[#efd98f]">
            <Icon name={item.icon} className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[15px] font-bold tracking-tight group-hover:underline">{item.label}</span>
              {lifecycle && <Badge tone={lifecycle === "ACTIVE" ? "green" : "amber"}>{lifecycle}</Badge>}
            </span>
            <span className="mt-1 block text-[12px] leading-relaxed beyu-muted">{item.description}</span>
          </span>
        </Link>
      </div>
      {children.length > 0 && (
        <div className="border-t border-[color:var(--beyu-line)] bg-black/[0.018] px-4 py-3 dark:bg-white/[0.025] sm:px-5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--beyu-muted)]">
              OS capabilities
            </p>
            <span className="text-[10px] tabular-nums text-[color:var(--beyu-muted)]">{children.length} available</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                className="group flex min-w-0 items-start gap-2.5 rounded-xl border border-[color:var(--beyu-line)] bg-[color:var(--beyu-surface)] px-3 py-2.5 transition hover:border-[#d4af37]/55 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4af37]"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#d4af37]/10 text-[#8a6d10] dark:text-[#efd98f]">
                  <Icon name={child.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[12px] font-semibold group-hover:underline">{child.label}</span>
                  <span className="mt-0.5 block text-[10.5px] leading-relaxed beyu-muted">{child.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

/**
 * Permission-aware discovery only. This map grants no authority: each linked
 * destination re-runs its own identity, RBAC/ABAC, entity, country,
 * classification and data-access checks on the server.
 */
export async function CapabilityMap({ principal }: { principal: Principal }) {
  const destinations = await authorizedGovernedDestinations(principal);
  const governedDestinationHrefs = new Set(destinations.map((destination) => destination.href));
  const hrefFor = await destinationHrefForRequest();
  const renderedHref = new Map(destinations.map((destination) => [destination.href, hrefFor(destination)]));
  const registryRows = await db
    .select({ code: osRegistry.code, lifecycle: osRegistry.lifecycle })
    .from(osRegistry)
    .where(inArray(osRegistry.code, Object.values(DESTINATION_REGISTRY_CODE)));
  const lifecycleByCode = new Map(registryRows.map((row) => [row.code, row.lifecycle]));

  const groups = CAPABILITY_IA.map((group) => {
    const items = group.items.filter((item) =>
      group.id === "sector" || item.href === "/os/foundation"
        ? governedDestinationHrefs.has(item.href)
        : visible(principal, item),
    );
    return { ...group, items };
  });

  return (
    <section aria-label="BEYU OS capability map" className="space-y-8">
      <header className="max-w-4xl">
        <div className="beyu-kicker text-[#b08d1c]">BEYU OS · Platform map</div>
        <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">One command centre. Clear ownership. No duplicated capabilities.</h2>
        <p className="mt-2 text-[12px] leading-relaxed beyu-muted sm:text-[13px]">
          Shared governance and enterprise capabilities are presented once. Sector Operating Systems own their specialist workspaces and features. What appears here is filtered by your identity, tenant, clearance and current grants.
        </p>
      </header>

      {groups.map((group) => {
        const isSector = group.id === "sector";
        const sectorItems = isSector ? group.items : [];
        const parentItems = sectorItems.filter((item) => !Object.values(SECTOR_CHILDREN).flat().includes(item.href));
        const childItems = sectorItems.filter((item) => Object.values(SECTOR_CHILDREN).flat().includes(item.href));
        const nonSectorItems = isSector ? [] : group.items;
        const visibleCount = group.items.length;
        const totalCount = CAPABILITY_IA.find((entry) => entry.id === group.id)?.items.length ?? 0;

        return (
          <section key={group.id} aria-labelledby={`capability-group-${group.id}`} className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2 border-b border-[color:var(--beyu-line)] pb-2">
              <div>
                <h3 id={`capability-group-${group.id}`} className="text-[11px] font-bold uppercase tracking-[0.16em] text-[color:var(--beyu-text)]">
                  {group.title}
                </h3>
                <p className="mt-0.5 text-[10.5px] beyu-muted">
                  {group.id === "family-office"
                    ? "One integrated family capability surface"
                    : group.id === "noelia-hive"
                      ? "The single governed intelligence layer"
                      : group.id === "sector"
                        ? "Specialist operating systems under BEYU governance"
                        : "Shared enterprise and control-plane destinations"}
                </p>
              </div>
              <span className="rounded-full border border-[color:var(--beyu-line)] px-2.5 py-1 text-[10px] tabular-nums beyu-muted">
                {visibleCount} / {totalCount} available
              </span>
            </div>

            {visibleCount > 0 ? (
              isSector ? (
                <div className="grid items-start gap-4 lg:grid-cols-2">
                  {parentItems.map((item) => (
                    <SectorCard
                      key={item.href}
                      item={item}
                      href={renderedHref.get(item.href)}
                      lifecycle={lifecycleByCode.get(DESTINATION_REGISTRY_CODE[item.href] ?? "") ?? undefined}
                      children={(SECTOR_CHILDREN[item.href] ?? [])
                        .map((href) => childItems.find((child) => child.href === href))
                        .filter((child): child is CapabilityItem => Boolean(child))
                        .map((child) => ({ ...child, href: renderedHref.get(child.href) ?? child.href }))}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {nonSectorItems.map((item) => (
                    <Card key={item.href} item={item} />
                  ))}
                </div>
              )
            ) : (
              <div className="rounded-xl border border-dashed border-[color:var(--beyu-line)] px-4 py-4 text-[12px] beyu-muted">
                None of these destinations is within your current grants. Access travels through governed grants; direct requests are independently checked by the destination.
              </div>
            )}
          </section>
        );
      })}

      {governedDestinationHrefs.has("/os/finance") && (
        <section
          aria-labelledby="shared-finance-services"
          className="overflow-hidden rounded-2xl border border-[#d4af37]/45 bg-[#0b1f4d] text-white shadow-sm"
        >
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/50 bg-[#d4af37]/15 text-[#f0d88b]">
                <Icon name="finance" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f0d88b]">Shared enterprise capability</p>
                <h3 id="shared-finance-services" className="mt-1 text-base font-bold tracking-tight">Finance OS · Shared Services</h3>
                <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-white/75">
                  The same Finance OS serves as a canonical Sector OS and provides governed financial services to authorized enterprise entities and other Sector OSs. No duplicate finance system or ledger is created.
                </p>
              </div>
            </div>
            <Link
              href={renderedHref.get("/os/finance") ?? "/os/finance"}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#d4af37]/60 bg-[#d4af37] px-4 py-2.5 text-[12px] font-bold text-[#0b1f4d] transition hover:bg-[#f0d88b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Open Finance OS
            </Link>
          </div>
          <div className="grid gap-2 border-t border-white/15 bg-white/[0.04] px-4 py-3 sm:grid-cols-2 lg:grid-cols-3 sm:px-5">
            {[
              "Holding & Board reporting",
              "Health financial services",
              "Agriculture financial services",
              "Ujenzi project finance",
              "Foundation accountability",
              "Family wealth visibility",
            ].map((service) => (
              <div key={service} className="flex min-w-0 items-center gap-2 text-[11px] text-white/85">
                <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#d4af37]" />
                {service}
              </div>
            ))}
          </div>
          <p className="px-4 pb-3 text-[10px] text-white/55 sm:px-5">One Finance OS · One financial source of truth · Permission-controlled access</p>
        </section>
      )}
    </section>
  );
}
