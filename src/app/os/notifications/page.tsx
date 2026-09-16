import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Notifications — the tenant's governed alert stream, full view.
 *
 * The OS shell header already surfaces the five most recent notifications to
 * EVERY authenticated principal of the tenant (no permission grant governs
 * the tenant's own IN_APP alert stream). This page is the full stream behind
 * that strip: same table, same tenant isolation, no new data exposure — which
 * is exactly why it carries session-level (not permission-level) gating. It
 * is read-only: read/dismiss semantics remain governed mutations elsewhere.
 */
export default async function NotificationsPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {

    // Same visibility as the OS shell header: the principal's own tenant,
    // never widened. RLS enforces the same boundary at the database layer.
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.tenantId, principal.tenantId))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const unread = rows.filter((n) => !n.readAt);
    const high = rows.filter((n) => n.urgency === "HIGH");
    const byChannel = new Map<string, number>();
    for (const n of rows) byChannel.set(n.channel, (byChannel.get(n.channel) ?? 0) + 1);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Notifications · governed alerts</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Notification stream</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Alerts raised to your tenant by governed processes — approvals due, deadlines missed,
            escalations and system notices. Nothing here bypasses an authorization decision: every link
            leads to a destination that re-verifies your capability.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Notifications" value={String(rows.length)} sub="latest 100 in scope" />
          <Metric label="Unread" value={String(unread.length)} sub="not yet acknowledged" tone={unread.length > 0 ? "gold" : "navy"} />
          <Metric label="High urgency" value={String(high.length)} sub="require attention first" tone={high.length > 0 ? "gold" : "navy"} />
          <Metric
            label="Channels"
            value={String(byChannel.size)}
            sub={[...byChannel.entries()].map(([c, n]) => `${c}:${n}`).join(" · ") || "—"}
          />
        </div>

        <Panel kicker="Tenant alert stream" title="Most recent first">
          <div className="space-y-2">
            {rows.map((n) => (
              <div key={n.id} className="rounded-lg border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={n.urgency === "HIGH" ? "red" : "gold"}>{n.urgency}</Badge>
                    <span className="text-[13px] font-semibold">{n.subject}</span>
                    {!n.readAt && <Badge tone="navy">UNREAD</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] beyu-muted">
                    <Badge tone="slate">{n.channel}</Badge>
                    <Badge tone={stateTone(n.status)}>{n.status}</Badge>
                    <span>{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  </div>
                </div>
                <p className="mt-1.5 text-[12px] leading-relaxed">{n.body}</p>
                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[10.5px] beyu-muted">
                    {n.role ? `role ${n.role}` : n.userId ? "directed to you" : "tenant-wide"} · classification {n.classification}
                  </span>
                  {n.linkHref && (
                    <Link href={n.linkHref} className="text-[11.5px] font-semibold text-[#b08d1c]">
                      Open governed destination →
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <EmptyState message="No notifications for your tenant. Governed processes raise alerts here when they need human attention." />
            )}
          </div>
        </Panel>
      </div>
    );
  });
}
