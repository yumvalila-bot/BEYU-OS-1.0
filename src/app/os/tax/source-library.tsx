import { Badge, Panel } from "@/components/brand";
import { getTraSourceCollectionCounts, getTraSourceInventory } from "@/lib/finance/tra-source-inventory";

/**
 * Read-only discovery catalogue. It deliberately does not expose document
 * content or imply that listed instruments have been ingested or verified.
 * Full source content continues through the existing governed knowledge_sources
 * and NOELIA retrieval path.
 */
export function TraSourceLibrary() {
  const counts = getTraSourceCollectionCounts();
  const sources = getTraSourceInventory();

  return (
    <Panel kicker="TRA source inventory" title="Tanzania tax, customs, legal & audit knowledge">
      <div className="space-y-4">
        <p className="text-[12px] beyu-muted">
          Owner-supplied TRA archive titles are registered for acquisition and verification.
          A listing is not proof that the underlying PDF, current legal status or operative rate
          has been verified. No tax liability is calculated from this inventory.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {counts.map((collection) => (
            <div key={collection.code} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
              <div className="text-[12px] font-semibold">{collection.title}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums">{collection.count}</div>
              <div className="text-[10px] beyu-muted">{collection.description}</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="amber">Source PDFs required</Badge>
          <Badge tone="slate">Legal status unverified</Badge>
          <Badge tone="navy">{sources.length} inventory records</Badge>
        </div>
        <div className="space-y-2">
          {counts.map((collection) => {
            const rows = sources.filter((source) => source.collection === collection.code);
            return (
              <details key={collection.code} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[12px] font-semibold">
                  <span>{collection.title}</span>
                  <span className="font-mono text-[10px] beyu-muted">{rows.length} records</span>
                </summary>
                <ul className="mt-3 space-y-2">
                  {rows.map((source) => (
                    <li key={source.code} className="flex flex-wrap items-start justify-between gap-2 border-t border-[color:var(--beyu-line)] pt-2">
                      <span className="min-w-0 flex-1 text-[11px]">{source.title}</span>
                      <span className="shrink-0 font-mono text-[9px] beyu-muted">{source.code}</span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
        <p className="text-[10px] beyu-muted">
          Verified source documents must be ingested into the existing scoped knowledge registry,
          reviewed by an authorized specialist and linked to their amendments, effective periods
          and source-page citations before NOELIA may rely on them.
        </p>
      </div>
    </Panel>
  );
}
