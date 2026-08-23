import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { countries, jurisdictions, legalEntities, ownershipRecords, tenants } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

type EntityRow = typeof legalEntities.$inferSelect;

function EntityNode({ entity, all, depth }: { entity: EntityRow; all: EntityRow[]; depth: number }) {
  const children = all.filter((e) => e.parentEntityId === entity.id);
  return (
    <div style={{ marginLeft: depth * 18 }} className="border-l border-[color:var(--beyu-line)] pl-3">
      <div className="flex flex-wrap items-center gap-2 py-1.5">
        <span className="text-[12.5px] font-semibold">{entity.legalName}</span>
        <Badge tone="navy">{entity.entityType}</Badge>
        <Badge tone={stateTone(entity.status)}>{entity.status}</Badge>
        <span className="text-[11px] beyu-muted">
          {entity.countryCode} · {entity.functionalCurrency} · {entity.accountingStandard}
          {entity.registrationNumber ? ` · reg ${entity.registrationNumber}` : ""}
        </span>
      </div>
      {children.map((c) => (
        <EntityNode key={c.id} entity={c} all={all} depth={1} />
      ))}
    </div>
  );
}

export default async function OrganizationPage() {
  const access = await requireAccess("organization:entity.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="organization:entity.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

  const scope = await tenantScopeIds(access.principal);
  const ownershipAllowed = can(access.principal, "organization:ownership.read").allowed;
  const [entities, tenantRows, ownership, jurisdictionRows, countryRows] = await Promise.all([
    db.select().from(legalEntities).where(inArray(legalEntities.tenantId, scope)).orderBy(legalEntities.effectiveFrom),
    db.select().from(tenants).where(inArray(tenants.id, scope)),
    ownershipAllowed
      ? db.select().from(ownershipRecords).where(inArray(ownershipRecords.tenantId, scope))
      : Promise.resolve([]),
    db.select().from(jurisdictions),
    db.select().from(countries),
  ]);

  const canOwnership = ownershipAllowed;
  const roots = entities.filter((e) => !e.parentEntityId);
  const byId = new Map(entities.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Organisation · corporate structure · ownership</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Enterprise structure</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Trust → holdings → country holdings → operating companies → tenants → users. The model supports
          alternative legal structures, effective dating and historical versions without assuming a fixed shape.
        </p>
      </header>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel kicker="Corporate structure" title="Legal entity hierarchy (effective-dated)">
          <div className="space-y-1">
            {roots.map((r) => (
              <EntityNode key={r.id} entity={r} all={entities} depth={0} />
            ))}
          </div>
        </Panel>

        <Panel kicker="Multi-tenancy" title="Tenant topology & isolation">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Tenant</th><th>Type</th><th>Parent</th><th>Isolation</th><th>Class</th></tr></thead>
              <tbody>
                {tenantRows.map((t) => (
                  <tr key={t.id}>
                    <td><div className="font-medium">{t.name}</div><div className="font-mono text-[10.5px] beyu-muted">{t.code}</div></td>
                    <td><Badge tone="navy">{t.type}</Badge></td>
                    <td className="text-[11.5px] beyu-muted">{tenantRows.find((p) => p.id === t.parentTenantId)?.code ?? "—"}</td>
                    <td className="text-[11.5px]">{t.isolationTier}</td>
                    <td><Badge tone={stateTone(t.classification)}>{t.classification}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Every request resolves identity → tenant → entity → role → permission → data scope. Cross-tenant
            access requires explicit authorisation.
          </p>
        </Panel>
      </div>

      <Panel kicker="Ownership registry" title="Economic rights, voting rights, control & beneficial ownership">
        {canOwnership ? (
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>Owned entity</th><th>Owner</th><th>Type</th><th>Economic %</th><th>Voting %</th><th>Effective</th><th>Provenance</th></tr>
              </thead>
              <tbody>
                {ownership.map((o) => (
                  <tr key={o.id}>
                    <td className="font-medium">{byId.get(o.ownedEntityId)?.legalName ?? o.ownedEntityId}</td>
                    <td>{o.ownerEntityId ? byId.get(o.ownerEntityId)?.legalName : o.ownerPartyId ?? "—"}</td>
                    <td><Badge tone={o.ownershipType === "BENEFICIAL" ? "gold" : "navy"}>{o.ownershipType}</Badge></td>
                    <td className="tabular-nums">{Number(o.economicPct).toFixed(2)}%</td>
                    <td className="tabular-nums">{Number(o.votingPct).toFixed(2)}%</td>
                    <td className="text-[11.5px] beyu-muted">{o.effectiveFrom} → {o.effectiveTo ?? "open"}</td>
                    <td className="max-w-xs text-[11.5px] beyu-muted">{o.provenance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="organization:ownership.read is not granted to your roles." />
        )}
      </Panel>

      <Panel kicker="Jurisdiction engine" title="Countries & jurisdictions in scope">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead><tr><th>Jurisdiction</th><th>Country</th><th>Level</th><th>Regulator</th><th>Currency</th><th>Timezone</th></tr></thead>
            <tbody>
              {jurisdictionRows.map((j) => {
                const c = countryRows.find((x) => x.code === j.countryCode);
                return (
                  <tr key={j.id}>
                    <td><div className="font-medium">{j.name}</div><div className="font-mono text-[10.5px] beyu-muted">{j.code}</div></td>
                    <td className="text-[11.5px]">{c?.name}</td>
                    <td className="text-[11.5px]">{j.level}</td>
                    <td className="text-[11.5px]">{j.regulator}</td>
                    <td className="text-[11.5px]">{c?.currencyCode}</td>
                    <td className="text-[11.5px] beyu-muted">{c?.timezone}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] beyu-muted">
          Rules are jurisdiction-bound. A national rule (for example Tanzanian tax law) is never generalised globally.
        </p>
      </Panel>
    </div>
  );  });
}
