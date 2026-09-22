import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { osRegistry } from "@/db/schema";
import { type Principal } from "@/lib/authz";
import { authorizedOperatingSystems } from "@/lib/operating-systems";
import { Badge } from "@/components/brand";
import { Icon } from "@/components/icons";
import { CAPABILITY_IA, visible, type CapabilityItem } from "./capabilities";

/**
 * The Health OS route maps to its registered OS-Registry code, so the sector
 * card can carry the REAL lifecycle state recorded in the registry rather
 * than a fabricated "status".
 */
const SECTOR_REGISTRY_CODE: Record<string, string> = {
  "/os/health": "HEALTH_OS",
  "/os/finance": "FINANCE_OS",
  "/os/agriculture": "AGRICULTURE_OS",
  "/os/foundation": "FOUNDATION_OS",
};

function Card({ item, lifecycle }: { item: CapabilityItem; lifecycle?: string }) {
  return (
    <Link
      href={item.href}
      className="beyu-panel group flex items-start gap-3 px-4 py-3.5 transition hover:border-[#d4af37]/60"
    >
      <span className="mt-[1px] flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/10 text-[#8a6d10] dark:text-[#efd98f]">
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

/**
 * Capability map — the discovery surface of the Executive Control Centre.
 *
 * Renders the canonical information architecture (app/os/capabilities.ts) so
 * a principal can see the shape of the ONE control plane — executive
 * surfaces, shared capabilities, sector OSs — and navigate to what their
 * grants cover.
 *
 * AUTHORIZATION HONESTY (same invariant as the sidebar):
 *   An item is rendered only when the destination's own guard would allow it.
 *   Shared capabilities use `visible()` and the same `can()` primitive as the
 *   destination. Sector entries use the launcher resolver, including Health
 *   federation and Agriculture/Foundation tenant scope. Cards therefore never
 *   advertise what the backend would deny, and they grant nothing — every
 *   destination re-verifies server-side. Restricted items are not rendered;
 *   the per-group authority
 *   count states how much of the architecture is within reach without
 *   exposing anything about the restricted surfaces themselves.
 */
export async function CapabilityMap({ principal }: { principal: Principal }) {
  const operatingSystemHrefs = new Set(
    (await authorizedOperatingSystems(principal)).map((destination) =>
      destination.href,
    ),
  );
  const registryRows = await db
    .select({ code: osRegistry.code, lifecycle: osRegistry.lifecycle })
    .from(osRegistry)
    .where(inArray(osRegistry.code, Object.values(SECTOR_REGISTRY_CODE)));
  const lifecycleByCode = new Map(registryRows.map((r) => [r.code, r.lifecycle]));

  const groups = CAPABILITY_IA.map((group) => {
    const items = group.items.filter((item) =>
      group.id === "sector"
        ? operatingSystemHrefs.has(item.href)
        : visible(principal, item),
    );
    return { ...group, items };
  });

  return (
    <section aria-label="BEYU OS capability map" className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Platform map</div>
        <h2 className="mt-1 text-[18px] font-semibold tracking-tight">One control plane — capabilities once, sector OSs below it</h2>
        <p className="mt-1 max-w-3xl text-[12px] beyu-muted">
          BEYU OS governs shared capabilities once; Sector OSs execute specialized operations under it.
          Shown below is exactly what your identity, tenant, clearance and grants allow you to open.
        </p>
      </header>

      {groups.map((group) => (
        <div key={group.id}>
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h3 className="beyu-kicker text-[#0b1d3a] dark:text-white/80">{group.title}</h3>
            <span className="text-[10.5px] beyu-muted">
              {group.items.length} of {CAPABILITY_IA.find((g) => g.id === group.id)?.items.length ?? 0} within your authority
            </span>
          </div>
          {group.items.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((item) => (
                <Card
                  key={`${item.href}:${item.label}`}
                  item={item}
                  lifecycle={
                    group.id === "sector"
                      ? lifecycleByCode.get(SECTOR_REGISTRY_CODE[item.href] ?? "") ?? undefined
                      : undefined
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[color:var(--beyu-line)] px-4 py-4 text-[12px] beyu-muted">
              None of these destinations is within your current grants. Access travels through governed
              grants — never through a hidden URL; a direct request receives the recorded governed decision.
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
