import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listFoundations } from "@/lib/foundation/service";

export const dynamic = "force-dynamic";

export default async function FoundationRegistryPage() {
  const access = await requireAccess("foundation:registry.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:registry.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const rows = await listFoundations(access.principal);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Registry</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Foundation Registry</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Every foundation in scope, across tenants, entities and jurisdictions. Lifecycle transitions
            are governed and audited; material moves require an approval reference.
          </p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Registered" value={String(rows.length)} sub="foundations in scope" tone="gold" />
          <Metric label="Active" value={String(rows.filter((r) => r.status === "ACTIVE").length)} sub="operational" />
          <Metric label="In formation" value={String(rows.filter((r) => ["PROPOSED", "FORMATION", "REGISTRATION_PENDING"].includes(r.status)).length)} sub="pre-registration" />
          <Metric label="Restricted / suspended" value={String(rows.filter((r) => ["RESTRICTED", "SUSPENDED"].includes(r.status)).length)} sub="needs attention" />
        </div>
        <Panel kicker="Registry" title="Foundations">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Foundation</th><th>Vehicle</th><th>Country</th><th>Registration</th><th>Tax status</th><th>Status</th></tr></thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id}>
                    <td><div className="font-medium">{f.legalName}</div><div className="font-mono text-[10.5px] beyu-muted">{f.code}</div></td>
                    <td className="text-[11.5px]">{f.legalVehicle}</td>
                    <td className="text-[11.5px]">{f.countryCode}</td>
                    <td className="font-mono text-[11px]">{f.registrationNumber ?? "—"}</td>
                    <td><Badge tone={stateTone(f.taxStatus)}>{f.taxStatus}</Badge></td>
                    <td><Badge tone={stateTone(f.status)}>{f.status}</Badge></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={6}><EmptyState message="No foundations registered." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
