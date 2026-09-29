import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Panel, Metric } from "@/components/brand";
import { db } from "@/db";
import { communicationProviders } from "@/db/schema";
import { eq, or, isNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function ProvidersPage() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    const providers = await db
      .select()
      .from(communicationProviders)
      .where(or(eq(communicationProviders.tenantId, principal.tenantId), isNull(communicationProviders.tenantId)));

    const byStatus = new Map<string, number>();
    for (const p of providers) byStatus.set(p.status, (byStatus.get(p.status) ?? 0) + 1);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · Providers</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Provider Registry</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Adapter pattern — WhatsApp → Meta Cloud API, SMS → approved provider, Email → approved provider. Never hard-coded. Status: CONFIGURED, CONNECTED, VERIFIED, DEGRADED, FAILED, NOT_CONNECTED, SIMULATED. Never claim CONNECTED without evidence. Secrets are env-var NAMES only.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Total Providers" value={String(providers.length)} sub="global + tenant" />
          <Metric label="Connected" value={String(byStatus.get("CONNECTED") ?? 0)} sub="verified connectivity" tone="gold" />
          <Metric label="Simulated" value={String(byStatus.get("SIMULATED") ?? 0)} sub="safe, no real provider activation" tone="slate" />
        </div>

        <Panel kicker="Registry" title="Providers — No Fake CONNECTED Claims">
          <div className="space-y-2">
            {providers.map((p) => (
              <div key={p.id} className="rounded border border-[color:var(--beyu-line)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={p.status === "VERIFIED" ? "gold" : p.status === "CONNECTED" ? "navy" : p.status === "SIMULATED" ? "slate" : "red"}>{p.status}</Badge>
                    <span className="font-semibold text-[13px]">{p.code}</span>
                    <span className="text-[11.5px] beyu-muted">{p.name} · {p.channelCode} · {p.providerType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10.5px] beyu-muted">
                    <Badge tone={p.healthStatus === "HEALTHY" ? "gold" : "slate"}>{p.healthStatus}</Badge>
                    <span>prio {p.priority}</span>
                    {p.countryCode && <Badge tone="slate">{p.countryCode}</Badge>}
                    <span>{p.tenantId ? "tenant" : "global"}</span>
                    {p.secretRef && <span>secret:{p.secretRef}</span>}
                  </div>
                </div>
                {p.description && <p className="mt-1.5 text-[11.5px] beyu-muted">{p.description}</p>}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            SIMULATED providers never reach real providers, are visibly labeled, and are safe for tests. Production activation requires: secret refs (env-var NAMES, never values), webhook signing secrets, business approval, evidence. Never commit WhatsApp tokens, SMS API keys, email keys, webhook secrets.
          </p>
        </Panel>
      </div>
    );
  });
}
