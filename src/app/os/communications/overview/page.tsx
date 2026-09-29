import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Metric, Panel } from "@/components/brand";
import { db } from "@/db";
import {
  communicationConversations,
  communicationMessages,
  communicationContacts,
  communicationProviders,
  communicationSecurityEvents,
} from "@/db/schema";
import { eq, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function CommunicationsOverviewPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const convMetrics = await db.execute(
      sql`SELECT status, COUNT(*) as cnt FROM communication_conversations WHERE tenant_id = ${principal.tenantId} GROUP BY status`,
    );
    const msgMetrics = await db.execute(
      sql`SELECT status, COUNT(*) as cnt, channel, COUNT(*) as total FROM communication_messages WHERE tenant_id = ${principal.tenantId} GROUP BY status, channel`,
    );
    const recentMessages = await db
      .select()
      .from(communicationMessages)
      .where(eq(communicationMessages.tenantId, principal.tenantId))
      .orderBy(desc(communicationMessages.createdAt))
      .limit(20);

    const statusMap = new Map<string, number>();
    for (const row of convMetrics.rows as unknown as { status: string; cnt: string }[]) {
      statusMap.set(row.status, Number(row.cnt));
    }

    const open = statusMap.get("OPEN") ?? 0;
    const botActive = statusMap.get("BOT_ACTIVE") ?? 0;
    const humanRequired = statusMap.get("HUMAN_REQUIRED") ?? 0;
    const humanActive = statusMap.get("HUMAN_ACTIVE") ?? 0;
    const resolved = statusMap.get("RESOLVED") ?? 0;

    const failedMessages = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM communication_messages WHERE tenant_id = ${principal.tenantId} AND status = 'FAILED'`,
    );
    const failedCount = Number((failedMessages.rows[0] as { cnt: string } | undefined)?.cnt ?? 0);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Overview</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Overview</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Active conversations, messages, delivery, failures, human handoffs, SLA breaches, feedback, provider health, channel usage, costs, alerts — all tenant-isolated via RLS.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Open" value={String(open)} sub="awaiting action" tone={open > 0 ? "gold" : "navy"} />
          <Metric label="Bot Active" value={String(botActive)} sub="Noelia/HIVE handling" />
          <Metric label="Human Required" value={String(humanRequired)} sub="needs human handoff" tone={humanRequired > 0 ? "red" : "navy"} />
          <Metric label="Human Active" value={String(humanActive)} sub="agent handling" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Resolved" value={String(resolved)} sub="completed" tone="gold" />
          <Metric label="Failed Messages" value={String(failedCount)} sub="delivery failures" tone={failedCount > 0 ? "red" : "navy"} />
          <Metric label="Total Conversations" value={String([...statusMap.values()].reduce((a, b) => a + b, 0))} sub="all statuses" />
          <Metric label="Recent Messages" value={String(recentMessages.length)} sub="latest 20" />
        </div>

        <Panel kicker="Recent Messages" title="Most recent first — tenant-isolated, classified">
          <div className="space-y-2">
            {recentMessages.map((m) => (
              <div key={m.id} className="rounded border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px]">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.status === "FAILED" ? "red" : m.status === "DELIVERED" || m.status === "READ" ? "gold" : "slate"}>{m.status}</Badge>
                    <Badge tone="slate">{m.channel}</Badge>
                    <span className="font-semibold">{m.subject ?? m.messageType}</span>
                    <span className="beyu-muted">{m.direction} · {m.priority}</span>
                  </div>
                  <span className="text-[10.5px] beyu-muted">{m.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="mt-1 text-[11.5px] beyu-muted line-clamp-2">{m.body.slice(0, 200)}</p>
                <div className="mt-1 text-[10px] beyu-muted">
                  {m.sender} → {m.recipient} · {m.classification} · correlation {m.correlationId.slice(0, 12)} · {m.providerId ? `provider ${m.providerId.slice(0, 8)}` : "no provider"}
                  {m.aiDrafted && <Badge tone="gold" className="ml-2">AI_DRAFTED</Badge>}
                </div>
              </div>
            ))}
            {recentMessages.length === 0 && <p className="text-[12px] beyu-muted">No messages in tenant scope.</p>}
          </div>
        </Panel>
      </div>
    );
  });
}
