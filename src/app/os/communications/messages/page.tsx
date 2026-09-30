import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationMessages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MessagesPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const messages = await db
      .select()
      .from(communicationMessages)
      .where(eq(communicationMessages.tenantId, principal.tenantId))
      .orderBy(desc(communicationMessages.createdAt))
      .limit(50);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Messages</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Message Engine</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Canonical message model: message_id, conversation_id, tenant_id, entity_id, country_code, channel, provider, sender, recipient, subject, body, structured_payload, template, message_type, priority, classification, status, delivery_status, correlation_id, causation_id, idempotency_key, timestamps. Reuses existing audit/events/idempotency.</p>
        </header>

        <Panel kicker="Messages" title="Delivery States: QUEUED→SENDING→SENT→DELIVERED→READ→FAILED→BOUNCED→REJECTED→CANCELLED">
          <div className="space-y-2">
            {messages.map((m) => (
              <div key={m.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={m.status === "FAILED" ? "red" : m.status === "DELIVERED" || m.status === "READ" ? "gold" : "slate"}>{m.status}</Badge>
                    <Badge tone="slate">{m.channel} · {m.direction}</Badge>
                    <span className="font-semibold text-[13px]">{m.subject ?? m.messageType}</span>
                  </div>
                  <span className="text-[10.5px] beyu-muted">{m.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {m.priority} · {m.classification}</span>
                </div>
                <p className="mt-1 text-[11.5px] beyu-muted line-clamp-2">{m.body.slice(0, 300)}</p>
                <div className="mt-1 text-[10px] beyu-muted">
                  {m.sender} → {m.recipient} · idemp:{m.idempotencyKey.slice(0, 16)} · trace:{m.traceId.slice(0, 12)} · corr:{m.correlationId.slice(0, 12)} {m.aiDrafted && "· AI_DRAFTED"} {m.requiresHumanApproval && "· REQUIRES_APPROVAL"}
                </div>
              </div>
            ))}
            {messages.length === 0 && <p className="text-[12px] beyu-muted">No messages in tenant scope.</p>}
          </div>
        </Panel>
      </div>
    );
  });
}
