import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationConversations } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const conversations = await db
      .select()
      .from(communicationConversations)
      .where(eq(communicationConversations.tenantId, principal.tenantId))
      .orderBy(desc(communicationConversations.updatedAt))
      .limit(50);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Conversations</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Unified Conversations</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            OPEN → BOT_ACTIVE → HUMAN_REQUIRED → HUMAN_ACTIVE → WAITING_CUSTOMER/WAITING_INTERNAL → BOT_RESUMED → RESOLVED → CLOSED. Omnichannel continuity: WhatsApp → Email → SMS → In-App remains one conversation only where identity linking is verified via GlobalUserID. Governed identity resolution, not just phone/email matching.
          </p>
        </header>

        <Panel kicker="Conversations" title="Governed Conversation Engine">
          <div className="space-y-2">
            {conversations.map((c) => (
              <div key={c.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.status === "HUMAN_REQUIRED" ? "red" : c.status === "OPEN" ? "gold" : c.status === "RESOLVED" ? "navy" : "slate"}>{c.status}</Badge>
                    <Badge tone="slate">{c.channel}</Badge>
                    <span className="font-semibold text-[13px]">{c.subject ?? `Conversation ${c.id.slice(0, 8)}`}</span>
                    <Badge tone={c.priority === "CRITICAL" ? "red" : c.priority === "HIGH" ? "gold" : "slate"}>{c.priority}</Badge>
                  </div>
                  <span className="text-[10.5px] beyu-muted">{c.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {c.classification}</span>
                </div>
                <div className="mt-1 text-[11px] beyu-muted">
                  contact:{c.contactId?.slice(0, 8) ?? "none"} · assigned:{c.assignedToUserId?.slice(0, 8) ?? "none"} · corr:{c.correlationId.slice(0, 12)} · last:{c.lastMessageAt?.toISOString().slice(0, 16) ?? "never"}
                </div>
              </div>
            ))}
            {conversations.length === 0 && <p className="text-[12px] beyu-muted">No conversations in tenant scope.</p>}
          </div>
        </Panel>
      </div>
    );
  });
}
