import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import {
  buildRegistryGraph,
  listRegistryBusinesses,
  listRegistryEntities,
  listRegistryFamilies,
  listRegistryOwnership,
  listRegistryParties,
} from "@/lib/admin/registry-service";
import { listWorkforce } from "@/lib/hcm";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import {
  RegisterBusinessForm,
  RegisterEmploymentForm,
  RegisterEntityForm,
  RegisterFamilyForm,
  RegisterOwnershipForm,
  RegisterPersonForm,
} from "./registry-actions";

export const dynamic = "force-dynamic";

/**
 * BEYU REGISTRY — the ONE unified governed registration console.
 *
 * Presentation only: reads run server-side under the principal's tenant
 * context (RLS) through the canonical registry read services; every mutation
 * is a POST to the capability-guarded /api/v1/admin/registry/* API. This page
 * never writes, never authorizes on the client, and never merges identities:
 * duplicate conflicts are surfaced as first-class records for the governed
 * resolution workflow.
 */
export default async function BeyuRegistryPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const [
      tenantRows,
      parties,
      families,
      entities,
      businesses,
      ownership,
      graph,
      workforce,
    ] = await Promise.all([
      db
        .select({ id: tenants.id, code: tenants.code, name: tenants.name })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
      listRegistryParties(principal),
      listRegistryFamilies(principal),
      listRegistryEntities(principal),
      listRegistryBusinesses(principal),
      listRegistryOwnership(principal),
      buildRegistryGraph(principal),
      listWorkforce(principal).catch(() => ({ records: [] as unknown[] })),
    ]);

    const canParty = can(principal, "identity:party.register").allowed;
    const canFamily = can(principal, "family:member.manage").allowed;
    const canEntity = can(principal, "organization:entity.manage").allowed;
    const canBusiness = can(principal, "organization:business.register").allowed;
    const canOwnership = can(principal, "organization:ownership.manage").allowed;
    const canEmployment = can(principal, "hcm:employee.manage").allowed;

    const personOptions = parties.items.map((p) => ({
      id: String(p.id),
      displayName: String(p.displayName),
    }));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · BEYU Registry</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Canonical registration console</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            The ONE governed registration layer over the existing canonical models — person parties,
            families, legal entities, business units, ownership and employment. Every act passes
            authentication → permission → scope → validation → atomic mutation → hash-chained audit →
            enterprise event, fail-closed. Person ≠ user, family ≠ tenant, employment ≠ membership.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Person parties (in scope)" value={String(parties.items.length)} sub={parties.conflicts.length > 0 ? `${parties.conflicts.length} conflict(s) to resolve` : "no duplicate conflicts"} tone={parties.conflicts.length > 0 ? "gold" : "navy"} />
          <Metric label="Families" value={String(families.length)} sub="governed family domain" />
          <Metric label="Legal entities" value={String(entities.length)} sub={`${businesses.length} business units`} />
          <Metric label="Relationship edges" value={String(graph.edges.length)} sub={`${graph.nodes.length} graph nodes`} />
        </div>

        <Panel
          title="Controlled duplicate-conflict workflow"
          kicker="never silently merged"
        >
          {parties.conflicts.length === 0 ? (
            <EmptyState message="No duplicate conflicts detected in your scope. Duplicate registrations are refused at the API with the existing record identified." />
          ) : (
            <ul className="space-y-2">
              {parties.conflicts.map((c) => (
                <li key={String(c.email)} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[12px]">
                  <Badge tone="red">{String(c.type)}</Badge>
                  <span className="ml-2 font-mono">{String(c.email)}</span>
                  <span className="ml-2 beyu-muted">candidates: {Array.isArray(c.partyIds) ? (c.partyIds as string[]).join(", ") : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Person parties" kicker="identity master · no login implied">
            {parties.items.length === 0 ? (
              <EmptyState message="No person parties in your scope yet." />
            ) : (
              <div className="divide-y divide-[color:var(--beyu-line)]">
                {parties.items.slice(0, 8).map((p) => (
                  <div key={String(p.id)} className="flex items-center justify-between py-2 text-[12.5px]">
                    <span>
                      {String(p.displayName)}
                      {p.email ? <span className="ml-2 beyu-muted">{String(p.email)}</span> : null}
                    </span>
                    <Badge tone={stateTone(String(p.kycStatus))}>{String(p.kycStatus)}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Families" kicker="governed domain · member ≠ user">
            {families.length === 0 ? (
              <EmptyState message="No families registered in your scope." />
            ) : (
              <div className="divide-y divide-[color:var(--beyu-line)]">
                {families.map((f) => (
                  <Link key={f.id} href={`/os/family/families/${f.id}`} className="flex items-center justify-between py-2 text-[12.5px] hover:underline">
                    <span>
                      {f.displayName} <span className="beyu-muted">({f.code})</span>
                    </span>
                    <Badge tone={stateTone(f.status)}>{f.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Legal entities & business units" kicker="tenant ≠ legal entity ≠ business">
            {entities.length === 0 ? (
              <EmptyState message="No legal entities in your scope." />
            ) : (
              <div className="divide-y divide-[color:var(--beyu-line)]">
                {entities.slice(0, 8).map((e) => (
                  <div key={e.id} className="flex items-center justify-between py-2 text-[12.5px]">
                    <span>
                      {e.legalName} <span className="beyu-muted">({e.code} · {e.entityType})</span>
                    </span>
                    <Badge tone={stateTone(e.status)}>{e.status}</Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 text-[11.5px] beyu-muted">{businesses.length} operating unit(s) registered under in-scope entities.</div>
          </Panel>

          <Panel title="Ownership & employment" kicker="ownership ≠ membership ≠ role">
            <div className="space-y-1 text-[12.5px]">
              {ownership.slice(0, 6).map((o) => (
                <div key={o.id} className="flex items-center justify-between py-1">
                  <span className="font-mono text-[11.5px]">{o.ownedEntityId}</span>
                  <span>
                    {o.ownershipType} · {String(o.economicPct)}%
                  </span>
                </div>
              ))}
              {ownership.length === 0 ? <EmptyState message="No ownership records in scope." /> : null}
            </div>
            <div className="mt-3 text-[11.5px] beyu-muted">
              {Array.isArray((workforce as { records?: unknown[] }).records)
                ? ((workforce as { records: unknown[] }).records.length)
                : 0}{" "}
              employment record(s) from the single HCM master.
            </div>
          </Panel>
        </div>

        <Panel title="Register" kicker="guarded API — every act audited server-side">
          <div className="grid gap-6 lg:grid-cols-2">
            {canParty ? <RegisterPersonForm defaultTenantId={tenantRows[0]?.id ?? principal.tenantId} /> : null}
            {canFamily ? <RegisterFamilyForm tenants={tenantRows} /> : null}
            {canEntity ? <RegisterEntityForm tenants={tenantRows} /> : null}
            {canBusiness ? <RegisterBusinessForm tenants={tenantRows} entities={entities.map((e) => ({ id: e.id, code: e.code, legalName: e.legalName, tenantId: e.tenantId }))} /> : null}
            {canOwnership ? <RegisterOwnershipForm tenants={tenantRows} entities={entities.map((e) => ({ id: e.id, code: e.code, legalName: e.legalName, tenantId: e.tenantId }))} persons={personOptions} /> : null}
            {canEmployment ? <RegisterEmploymentForm tenants={tenantRows} entities={entities.map((e) => ({ id: e.id, code: e.code, legalName: e.legalName, tenantId: e.tenantId }))} persons={personOptions} /> : null}
            {!canParty && !canFamily && !canEntity && !canBusiness && !canOwnership && !canEmployment ? (
              <EmptyState message="You hold registry read access but no registration capability. Request a governed grant — authority is never self-issued here." />
            ) : null}
          </div>
        </Panel>
      </div>
    );
  });
}
