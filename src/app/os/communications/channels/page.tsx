import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationChannels } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const channels = await db.select().from(communicationChannels);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Channels</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Channel Registry</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">WHATSAPP, SMS, EMAIL, IN_APP, INTERNAL — extensible for future channels (Push, Voice, Telegram, Teams, Slack) without rewriting core.</p>
        </header>
        <Panel kicker="Registry" title="Governed Channels">
          <div className="space-y-3">
            {channels.map((c) => (
              <div key={c.code} className="rounded border border-[color:var(--beyu-line)] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={c.enabled ? "gold" : "slate"}>{c.code}</Badge>
                    <span className="font-semibold text-[13px]">{c.name}</span>
                  </div>
                  <div className="flex gap-1">
                    {c.supportsInbound && <Badge tone="navy">INBOUND</Badge>}
                    {c.supportsOutbound && <Badge tone="slate">OUTBOUND</Badge>}
                    {c.supportsMedia && <Badge tone="slate">MEDIA</Badge>}
                    {c.supportsTemplates && <Badge tone="gold">TEMPLATES</Badge>}
                  </div>
                </div>
                <p className="mt-2 text-[12px] beyu-muted">{c.description}</p>
                <p className="mt-1 text-[10.5px] beyu-muted">Capabilities: {c.capabilities.join(", ")}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  });
}
