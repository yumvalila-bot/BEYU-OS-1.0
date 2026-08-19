import { db } from "@/db";
import { architectureDecisions, dataAssets, integrations, metricDefinitions, osRegistry, sourceOfTruth } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { filterByClearance } from "@/lib/authz";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

const KIND_TONE: Record<string, string> = {
  CONTROL_PLANE: "gold",
  SHARED_CAPABILITY: "navy",
  SECTOR_OS: "green",
  AI_RUNTIME: "amber",
};

export default async function RegistryPage() {
  const access = await requireAccess("platform:registry.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="platform:registry.read" />;

  const [osRows, sotRows, adrRows, integrationRows, metricRows, allAssetRows] = await Promise.all([
    db.select().from(osRegistry).orderBy(osRegistry.kind),
    db.select().from(sourceOfTruth).orderBy(sourceOfTruth.capability),
    db.select().from(architectureDecisions).orderBy(architectureDecisions.adrNumber),
    db.select().from(integrations),
    db.select().from(metricDefinitions),
    db.select().from(dataAssets),
  ]);

  /**
   * A-02: the data-asset catalogue is enterprise reference metadata, but individual
   * entries carry their own classification (the family & beneficiary registry is
   * HIGHLY_RESTRICTED). Registry read access is not a clearance override, so the
   * catalogue is filtered through the kernel's classification ceiling.
   */
  const assetRows = filterByClearance(access.principal, allAssetRows);
  const suppressedAssets = allAssetRows.length - assetRows.length;

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Enterprise registry</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">OS Registry, Source of Truth & Architecture Control</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          No OS may exist without a registered charter. Before a new OS is created, the capability must
          be shown not to belong inside BEYU OS or an existing Sector OS — avoiding OS proliferation.
        </p>
      </header>

      <Panel kicker="Registered systems" title="BEYU OS · shared capabilities · Sector OSs · AI runtime">
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {osRows.map((os) => (
            <div key={os.id} className="rounded-lg border border-[color:var(--beyu-line)] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold">{os.name}</div>
                  <div className="font-mono text-[10.5px] beyu-muted">{os.code}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge tone={KIND_TONE[os.kind] ?? "slate"}>{os.kind}</Badge>
                  <Badge tone={stateTone(os.lifecycle)}>{os.lifecycle}</Badge>
                </div>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed">{os.purpose}</p>
              <dl className="mt-3 space-y-1.5 text-[11px]">
                <div><span className="beyu-kicker beyu-muted">Owner </span>{os.ownerRole}</div>
                <div><span className="beyu-kicker beyu-muted">Authority </span>{os.authorityScope}</div>
                <div><span className="beyu-kicker beyu-muted">Data authority </span>{os.dataAuthority.join(", ") || "—"}</div>
                <div><span className="beyu-kicker beyu-muted">Depends on </span>{os.dependencies.join(", ") || "—"}</div>
                <div><span className="beyu-kicker beyu-muted">Events </span>{os.events.join(", ") || "—"}</div>
                <div><span className="beyu-kicker beyu-muted">Compliance </span>{os.complianceFrameworks.join(", ") || "—"}</div>
              </dl>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Non-duplication rule" title="Source-of-Truth matrix">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Capability</th><th>Authoritative OS</th><th>Store</th><th>Consumers</th></tr></thead>
              <tbody>
                {sotRows.map((r) => (
                  <tr key={r.id}>
                    <td className="font-medium">{r.capability}</td>
                    <td><Badge tone="navy">{r.authoritativeOs}</Badge></td>
                    <td className="font-mono text-[11px]">{r.authoritativeStore}</td>
                    <td className="text-[11px] beyu-muted">{r.consumers.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Change control" title="Architecture Decision Records">
          <div className="space-y-3">
            {adrRows.map((a) => (
              <details key={a.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <summary className="cursor-pointer text-[12.5px] font-semibold">
                  ADR-{String(a.adrNumber).padStart(3, "0")} · {a.title}{" "}
                  <Badge tone={stateTone(a.status)}>{a.status}</Badge>
                </summary>
                <dl className="mt-2 space-y-2 text-[11.5px]">
                  <div><span className="beyu-kicker beyu-muted">Context </span>{a.context}</div>
                  <div><span className="beyu-kicker beyu-muted">Decision </span>{a.decision}</div>
                  <div><span className="beyu-kicker beyu-muted">Consequences </span>{a.consequences}</div>
                  <div><span className="beyu-kicker beyu-muted">Alternatives </span>{a.alternatives}</div>
                  <div><span className="beyu-kicker beyu-muted">Security </span>{a.securityAnalysis}</div>
                  <div><span className="beyu-kicker beyu-muted">Compliance </span>{a.complianceAnalysis}</div>
                  <div><span className="beyu-kicker beyu-muted">Rollback </span>{a.rollbackPlan}</div>
                  <div className="beyu-muted">{a.decidedBy} · {a.decidedOn}</div>
                </dl>
              </details>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Integration management" title="Governed external integrations">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Integration</th><th>Category</th><th>Standard</th><th>Auth</th><th>Secret</th><th>SLA</th></tr></thead>
              <tbody>
                {integrationRows.map((i) => (
                  <tr key={i.id}>
                    <td><div className="font-medium">{i.name}</div><div className="font-mono text-[10.5px] beyu-muted">{i.code}</div></td>
                    <td className="text-[11.5px]">{i.category}</td>
                    <td className="text-[11.5px]">{i.standard ?? i.protocol}</td>
                    <td className="text-[11.5px]">{i.authType}</td>
                    <td className="font-mono text-[10.5px] beyu-muted">{i.secretRef}</td>
                    <td className="text-[11.5px]">{i.slaUptimePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">Secrets are referenced, never stored in the platform database.</p>
        </Panel>

        <Panel kicker="Data governance" title="Critical data assets & metric definitions">
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Data asset</th><th>System of record</th><th>Owner / steward</th><th>Class</th><th>Retention</th></tr></thead>
                <tbody>
                  {assetRows.map((d) => (
                    <tr key={d.id}>
                      <td><div className="font-medium">{d.name}</div><div className="text-[11px] beyu-muted">{d.qualityRules.join(" · ")}</div></td>
                      <td className="text-[11.5px]">{d.systemOfRecord}</td>
                      <td className="text-[11.5px]">{d.ownerRole} / {d.stewardRole}</td>
                      <td><Badge tone={stateTone(d.classification)}>{d.classification}</Badge></td>
                      <td className="text-[11.5px]">{d.retentionCode}</td>
                    </tr>
                  ))}
                  {assetRows.length === 0 && (
                    <tr><td colSpan={5}><EmptyState message="No data assets are visible at your clearance level." /></td></tr>
                  )}
                </tbody>
              </table>
              {suppressedAssets > 0 && (
                <p className="mt-2 text-[11px] beyu-muted">
                  {suppressedAssets} data asset{suppressedAssets === 1 ? "" : "s"} suppressed: classification
                  exceeds your {access.principal.clearance} clearance ceiling.
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Metric</th><th>Definition</th><th>Source of truth</th><th>Owner</th><th>Period</th></tr></thead>
                <tbody>
                  {metricRows.map((m) => (
                    <tr key={m.code}>
                      <td className="font-mono text-[11px]">{m.code}</td>
                      <td className="text-[11.5px]"><div className="font-medium">{m.name}</div><div className="beyu-muted">{m.calculation}</div></td>
                      <td className="text-[11.5px]">{m.sourceOfTruth}</td>
                      <td className="text-[11.5px]">{m.ownerRole}</td>
                      <td className="text-[11.5px]">{m.period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
