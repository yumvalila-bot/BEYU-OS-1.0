import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel } from "@/components/brand";
import { db } from "@/db";
import { communicationRoutingRules, communicationSlaPolicies } from "@/db/schema";
import { or, isNull, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function RoutingPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const rules = await db
      .select()
      .from(communicationRoutingRules)
      .where(or(eq(communicationRoutingRules.tenantId, principal.tenantId), isNull(communicationRoutingRules.tenantId)));
    const sla = await db
      .select()
      .from(communicationSlaPolicies)
      .where(or(eq(communicationSlaPolicies.tenantId, principal.tenantId), isNull(communicationSlaPolicies.tenantId)));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Routing</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Routing Engine</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Governed channel selection: recipient preference, classification, urgency, country, tenant, entity, provider availability, consent, message type, language, cost, reliability. Invoice: Email PDF + WhatsApp notification + In-app. Critical alert: In-app + SMS + internal escalation. Noelia may RECOMMEND, governance DECIDES.
          </p>
        </header>

        <Panel kicker="Routing Rules" title="Intelligent Channel Selection">
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={r.enabled ? "gold" : "slate"}>{r.enabled ? "ENABLED" : "DISABLED"}</Badge>
                  <span className="font-semibold text-[13px]">{r.name}</span>
                  <Badge tone="slate">prio {r.priority}</Badge>
                  {r.channel && <Badge tone="slate">{r.channel}</Badge>}
                </div>
                {r.description && <p className="mt-1 text-[11.5px] beyu-muted">{r.description}</p>}
                <div className="mt-1 text-[10px] beyu-muted font-mono">conditions: {JSON.stringify(r.conditions)} → action: {JSON.stringify(r.action)}</div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel kicker="SLA" title="SLA & Escalation Policies">
          <div className="space-y-2">
            {sla.map((s) => (
              <div key={s.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex items-center gap-2">
                  <Badge tone={s.enabled ? "gold" : "slate"}>{s.priority}</Badge>
                  <span className="font-semibold text-[13px]">{s.name}</span>
                  {s.channel && <Badge tone="slate">{s.channel}</Badge>}
                  <span className="text-[11px] beyu-muted">response {s.responseTimeMinutes}min · resolution {s.resolutionTimeMinutes}min · {s.timezone}</span>
                </div>
                {s.description && <p className="mt-1 text-[11.5px] beyu-muted">{s.description}</p>}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  });
}
