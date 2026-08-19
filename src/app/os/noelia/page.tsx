import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiDecisions, knowledgeSources, osRegistry } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { NoeliaConsole } from "./console";

export const dynamic = "force-dynamic";

const PIPELINE = [
  "REQUEST", "IDENTITY", "AUTHORIZATION", "CONTEXT", "POLICY", "DATA RETRIEVAL", "KNOWLEDGE RETRIEVAL",
  "ANALYSIS", "TOOL EXECUTION", "VALIDATION", "RISK CHECK", "HUMAN REVIEW", "RECOMMENDATION", "AUDIT", "MONITORING",
];

export default async function NoeliaPage() {
  const access = await requireAccess("ai:noelia.query");
  if (!access.allowed) return <Denied reason={access.reason} capability="ai:noelia.query" />;

  const [recent, knowledge, hive] = await Promise.all([
    db.select().from(aiDecisions).where(eq(aiDecisions.tenantId, access.principal.tenantId)).orderBy(desc(aiDecisions.occurredAt)).limit(8),
    db.select().from(knowledgeSources),
    db.select().from(osRegistry).where(eq(osRegistry.code, "HIVE_RUNTIME")).limit(1),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Noelia AI · single AI identity · HIVE runtime</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Governed enterprise intelligence</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Noelia inherits your identity, roles, tenant, clearance and policy constraints — and can never
          exceed them. Every answer declares whether it is fact, inference, recommendation, prediction or
          uncertainty, cites its sources, and is written to the AI decision register.
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {PIPELINE.map((p, i) => (
          <span key={p} className="rounded-md border border-[color:var(--beyu-line)] px-2 py-1 text-[10px] tracking-wide beyu-muted">
            {i + 1}. {p}
          </span>
        ))}
      </div>

      <NoeliaConsole
        principal={{
          name: access.principal.displayName,
          roles: access.principal.roles,
          clearance: access.principal.clearance,
          tenant: access.principal.tenantCode,
        }}
      />

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel kicker="AI decision register" title="Recent Noelia interactions (audited)">
          <div className="space-y-2">
            {recent.map((a) => (
              <div key={a.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-medium">{a.question.slice(0, 100)}</span>
                  <div className="flex gap-1">
                    <Badge tone="navy">{a.engine}</Badge>
                    <Badge tone={stateTone(a.outputClass)}>{a.outputClass}</Badge>
                  </div>
                </div>
                <div className="mt-1 text-[10.5px] beyu-muted">
                  {new Date(a.occurredAt).toISOString().replace("T", " ").slice(0, 19)} · confidence{" "}
                  {(Number(a.confidence) * 100).toFixed(0)}% · policy {a.policyDecision} · {a.latencyMs}ms
                </div>
              </div>
            ))}
            {recent.length === 0 && <EmptyState message="No AI interactions recorded yet." />}
          </div>
        </Panel>

        <div className="space-y-5">
          <Panel kicker="HIVE runtime charter" title="Registered AI runtime boundary">
            {hive[0] ? (
              <dl className="space-y-2 text-[11.5px]">
                <div><span className="beyu-kicker beyu-muted">Purpose </span>{hive[0].purpose}</div>
                <div><span className="beyu-kicker beyu-muted">Owner </span>{hive[0].ownerRole}</div>
                <div><span className="beyu-kicker beyu-muted">Data authority </span>{hive[0].dataAuthority.join(", ")}</div>
                <div><span className="beyu-kicker beyu-muted">Events </span>{hive[0].events.join(", ")}</div>
                <div><span className="beyu-kicker beyu-muted">Frameworks </span>{hive[0].complianceFrameworks.join(", ")}</div>
              </dl>
            ) : (
              <EmptyState message="HIVE runtime is not registered." />
            )}
            <div className="mt-3 rounded-lg border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-2 text-[11.5px]">
              Noelia may not post financial entries, alter ownership, change beneficiary entitlement,
              approve resolutions or assert compliance. Those are reserved to accountable humans.
            </div>
          </Panel>

          <Panel kicker="Retrieval corpus" title="Authoritative knowledge available to Noelia">
            <div className="space-y-1.5">
              {knowledge.map((k) => (
                <div key={k.id} className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span>{k.title}</span>
                  <Badge tone={stateTone(k.authorityStatus)}>{k.domain}</Badge>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
