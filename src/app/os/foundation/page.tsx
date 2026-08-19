import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { capitalRequests, foundationPrograms, legalEntities, osRegistry, tenants } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function FoundationPage() {
  const access = await requireAccess("platform:dashboard.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="platform:dashboard.read" />;

  /**
   * H-NEW-2: the Foundation is a distinct tenant, not a global namespace. Its
   * records are resolved by tenant identity and then intersected with the
   * principal's canonical tenant scope. The BEYU-FOUNDATION code is used only to
   * identify the tenant — never to bypass scope. A principal outside the
   * Foundation subtree is denied rather than shown another tenant's data.
   */
  const scope = await tenantScopeIds(access.principal);
  const [foundationTenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.code, "BEYU-FOUNDATION"), inArray(tenants.id, scope)))
    .limit(1);

  if (!foundationTenant) {
    return (
      <Denied
        reason="Tenant isolation: the BEYU Foundation tenant is outside your authorised scope."
        capability="platform:dashboard.read"
      />
    );
  }

  const foundationScope = [foundationTenant.id];
  const programs = await db
    .select()
    .from(foundationPrograms)
    .where(inArray(foundationPrograms.tenantId, foundationScope));
  const entity = await db
    .select()
    .from(legalEntities)
    .where(and(eq(legalEntities.code, "BEYU-FDN"), inArray(legalEntities.tenantId, foundationScope)))
    .limit(1);
  const funding = await db
    .select()
    .from(capitalRequests)
    .where(and(eq(capitalRequests.sectorCode, "FOUNDATION"), inArray(capitalRequests.tenantId, scope)));
  const charter = await db.select().from(osRegistry).where(eq(osRegistry.code, "FOUNDATION_OS")).limit(1);

  const budget = programs.reduce((a, p) => a + Number(p.budget), 0);
  const spend = programs.reduce((a, p) => a + Number(p.spendToDate), 0);
  const reached = programs.reduce((a, p) => a + p.beneficiariesReached, 0);

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Foundation OS — sector OS under BEYU OS</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">BEYU Foundation</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          A separate non-profit sister organisation. It consumes shared BEYU OS capabilities (identity,
          HCM, governance, audit, documents) while retaining its own legal, governance, financial, data
          and tenant boundaries.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Programme budget" value={money(budget, "USD")} sub={`${programs.length} active programmes`} tone="gold" />
        <Metric label="Spend to date" value={money(spend, "USD")} sub={budget ? `${Math.round((spend / budget) * 100)}% utilised` : "—"} />
        <Metric label="Beneficiaries reached" value={reached.toLocaleString()} sub="monitoring & evaluation" />
        <Metric label="Legal boundary" value={entity[0]?.entityType ?? "—"} sub={entity[0] ? `${entity[0].legalName} · ${entity[0].registrationNumber}` : "—"} />
      </div>

      <Panel kicker="Programmes" title="Grants, projects, impact & monitoring">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead><tr><th>Programme</th><th>Theme</th><th>Country</th><th>Budget</th><th>Spend</th><th>Beneficiaries</th><th>Impact</th><th>Status</th></tr></thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id}>
                  <td><div className="font-medium">{p.name}</div><div className="font-mono text-[10.5px] beyu-muted">{p.code}</div></td>
                  <td><Badge tone="navy">{p.theme}</Badge></td>
                  <td className="text-[11.5px]">{p.countryCode}</td>
                  <td className="tabular-nums">{money(p.budget, p.currency)}</td>
                  <td className="tabular-nums">{money(p.spendToDate, p.currency)}</td>
                  <td className="tabular-nums">{p.beneficiariesReached.toLocaleString()}</td>
                  <td className="text-[11.5px]">{p.impactMetric}: {p.impactValue ? Number(p.impactValue).toLocaleString() : "—"}</td>
                  <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                </tr>
              ))}
              {programs.length === 0 && <tr><td colSpan={8}><EmptyState message="No programmes registered." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Funding interface" title="Capital allocation from the enterprise waterfall">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Request</th><th>Amount</th><th>Status</th><th>Decision</th></tr></thead>
              <tbody>
                {funding.map((f) => (
                  <tr key={f.id}>
                    <td><div className="font-medium">{f.title}</div><div className="font-mono text-[10.5px] beyu-muted">{f.code}</div></td>
                    <td className="tabular-nums">{money(f.amount, f.currency)}</td>
                    <td><Badge tone={stateTone(f.status)}>{f.status}</Badge></td>
                    <td className="text-[11.5px] beyu-muted">{f.decisionDate ? new Date(f.decisionDate).toISOString().slice(0, 10) : "pending"}</td>
                  </tr>
                ))}
                {funding.length === 0 && <tr><td colSpan={4}><EmptyState message="No foundation funding requests." /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            The FOUNDATION tier of the enterprise waterfall funds these programmes. Finance OS remains
            authoritative for the financial consequence of each transfer.
          </p>
        </Panel>

        <Panel kicker="Registered charter" title="Foundation OS boundary">
          {charter[0] ? (
            <dl className="space-y-2 text-[11.5px]">
              <div><span className="beyu-kicker beyu-muted">Purpose </span>{charter[0].purpose}</div>
              <div><span className="beyu-kicker beyu-muted">Authority </span>{charter[0].authorityScope}</div>
              <div><span className="beyu-kicker beyu-muted">Owner </span>{charter[0].ownerRole}</div>
              <div><span className="beyu-kicker beyu-muted">Data authority </span>{charter[0].dataAuthority.join(", ")}</div>
              <div><span className="beyu-kicker beyu-muted">Consumes </span>{charter[0].dependencies.join(", ")}</div>
              <div><span className="beyu-kicker beyu-muted">Compliance </span>{charter[0].complianceFrameworks.join(", ")}</div>
              <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                Foundation OS must not duplicate enterprise identity, HCM, governance, security, audit or
                enterprise finance authority.
              </div>
            </dl>
          ) : (
            <EmptyState message="Foundation OS charter is not registered." />
          )}
        </Panel>
      </div>
    </div>
  );
}
