import { CapabilityDirectory, type CapabilityDirectoryItem } from "@/components/capability-directory";
import { Denied, Panel } from "@/components/brand";
import { can } from "@/lib/authz";
import { requirePrincipal } from "@/lib/guard";

export const dynamic = "force-dynamic";

/**
 * Executive entry point for the connected organisation and ownership domains.
 * It deliberately contains no second model: each card opens the existing
 * authoritative workspace, which repeats its own server-side guard.
 */
export default async function OrganisationOwnershipPage() {
  const principal = await requirePrincipal();
  const entity = can(principal, "organization:entity.read");
  const ownership = can(principal, "organization:ownership.read");
  const capitalization = can(principal, "equity:cap-table.read");

  if (!entity.allowed && !ownership.allowed && !capitalization.allowed) {
    return (
      <Denied
        reason="No organisation, ownership or capitalization read grant is active for this principal."
        capability="organization:entity.read OR organization:ownership.read OR equity:cap-table.read"
      />
    );
  }

  const items: CapabilityDirectoryItem[] = [
    ...(entity.allowed
      ? [
          {
            href: "/os/organization",
            name: "Organisation",
            description:
              "Open the effective-dated legal-entity hierarchy, tenant topology and jurisdictions in your governed scope.",
            icon: "org" as const,
          },
        ]
      : []),
    ...(ownership.allowed || capitalization.allowed
      ? [
          {
            href: "/os/ownership",
            name: "Ownership",
            description:
              "Open authoritative economic, voting and beneficial ownership and, when separately granted, capitalization detail.",
            icon: "ownership" as const,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Executive · organisation &amp; ownership</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Enterprise structure and control</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          One connected view of the BEYU institutional hierarchy. Organisation and ownership remain
          distinct governed capabilities over their existing sources of truth; this page only routes to
          the workspaces your active grants allow.
        </p>
      </header>

      <Panel kicker="Canonical hierarchy" title="BEYU control and operating structure">
        <ol aria-label="Canonical BEYU organisation hierarchy" className="grid gap-2 md:grid-cols-5">
          {[
            "BEYU Family Trust",
            "BEYU Holding Company",
            "Country Holding Companies",
            "Sector LLCs / Operating Companies",
            "Sector OS",
          ].map((level, index, levels) => (
            <li key={level} className="flex min-w-0 items-center gap-2 md:items-stretch">
              <div className="flex min-h-16 flex-1 items-center rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[12px] font-semibold">
                <span className="mr-2 text-[10px] tabular-nums text-[#8a6d10]">{index + 1}</span>
                {level}
              </div>
              {index < levels.length - 1 && (
                <span aria-hidden="true" className="text-[#b08d1c] md:hidden">→</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[11px] beyu-muted">
          This is the constitutional hierarchy, not invented organisation data. The Organisation and
          Ownership workspaces below render actual records from the existing scoped registries.
        </p>
      </Panel>

      <section aria-labelledby="organisation-ownership-workspaces">
        <h2 id="organisation-ownership-workspaces" className="beyu-kicker mb-2.5 text-[#0b1d3a] dark:text-white/80">
          Workspaces within your authority
        </h2>
        <CapabilityDirectory
          items={items}
          emptyMessage="No organisation or ownership workspace is within your current grants."
        />
      </section>
    </div>
  );
}
