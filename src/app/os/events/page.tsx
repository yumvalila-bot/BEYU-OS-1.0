import { and, desc, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { enterpriseEvents } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds, hasGlobalGovernanceScope } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Events — the enterprise event stream as a first-class shared capability.
 *
 * The immutable, hash-chained CloudEvents-aligned stream already exists
 * (platform.enterprise_events) and is partially rendered inside the Audit
 * surface. This page presents the stream itself under its own canonical
 * capability (audit:event.read) with the same tenant/global-governance
 * scoping the audit surface applies — nothing here widens who can read what.
 */
export default async function EventsPage() {
  const access = await requireAccess("audit:event.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="audit:event.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const scope = await tenantScopeIds(access.principal);
    const global = hasGlobalGovernanceScope(access.principal);
    const tenantFilter = global
      ? or(
          inArray(enterpriseEvents.tenantId, scope),
          isNull(enterpriseEvents.tenantId),
        )
      : inArray(enterpriseEvents.tenantId, scope);
    const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
    const scopeFilter =
      access.principal.entityScope.length > 0
        ? and(
            tenantFilter,
            inArray(
              enterpriseEvents.legalEntityId,
              access.principal.entityScope,
            ),
            inArray(enterpriseEvents.classification, allowedClassifications),
          )
        : and(
            tenantFilter,
            inArray(enterpriseEvents.classification, allowedClassifications),
          );

    const events = await db
      .select()
      .from(enterpriseEvents)
      .where(scopeFilter)
      .orderBy(desc(enterpriseEvents.sequence))
      .limit(80);

    const byType = new Map<string, number>();
    const bySource = new Map<string, number>();
    for (const e of events) {
      byType.set(e.type, (byType.get(e.type) ?? 0) + 1);
      bySource.set(e.source, (bySource.get(e.source) ?? 0) + 1);
    }
    const domainEvents = events.filter((e) => e.domain).length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Events · enterprise stream</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Governed enterprise events</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One immutable event backbone connects every OS: domain events are versioned, carry actor and
            authority context, and are hash-chained so retro-active mutation is detectable. Sector OSs
            consume these events through governed contracts — never by reading another OS&rsquo;s store.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Events (recent)" value={String(events.length)} sub="latest 80 in scope" />
          <Metric label="Distinct types" value={String(byType.size)} sub={[...byType.entries()].slice(0, 3).map(([t, n]) => `${t} (${n})`).join(" · ") || "—"} />
          <Metric label="Producers" value={String(bySource.size)} sub={[...bySource.keys()].slice(0, 3).join(" · ") || "—"} />
          <Metric label="Interoperability contract" value={String(domainEvents)} sub="events carrying domain/operation fields" />
        </div>

        <Panel kicker="Append-only stream" title="Sequence-ordered · hash-chained · authorised">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>#</th><th>Type</th><th>Domain · operation</th><th>Source</th><th>Subject</th><th>Actor</th><th>Class</th><th>When</th><th>Hash</th></tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="tabular-nums text-[11px] beyu-muted">{e.sequence}</td>
                    <td className="font-mono text-[11px]">{e.type}<div className="beyu-muted">v{e.schemaVersion}{e.eventVersion ? ` · ev ${e.eventVersion}` : ""}</div></td>
                    <td className="text-[11px]">{e.domain ?? "—"}{e.operation ? <div className="beyu-muted">{e.operation}{e.destinationDomain ? ` → ${e.destinationDomain}` : ""}</div> : null}</td>
                    <td className="text-[11px] beyu-muted">{e.source}</td>
                    <td className="text-[11px]">{e.subjectType}<div className="beyu-muted">{e.subjectId.slice(0, 24)}</div></td>
                    <td><Badge tone={e.actorType === "AI" ? "amber" : "slate"}>{e.actorType}</Badge></td>
                    <td><Badge tone={stateTone(e.classification)}>{e.classification}</Badge></td>
                    <td className="text-[11px] beyu-muted">{e.occurredAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                    <td className="font-mono text-[10px] beyu-muted">{e.hash.slice(0, 12)}…</td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={9}><EmptyState message="No enterprise events visible in your scope yet." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <p className="text-[11px] beyu-muted">
          Cross-OS ingestion is idempotent: a duplicate delivery can never produce a second enterprise
          event — the receipt and the event are written in one transaction.
        </p>
      </div>
    );
  });
}
