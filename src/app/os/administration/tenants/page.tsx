import { inArray, eq, sql, and, isNull, gt } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, sessions, tenants, users } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { RegisterTenantForm, TenantStatusActions } from "../tenant-actions";

export const dynamic = "force-dynamic";

/**
 * Administration — Tenants.
 *
 * The canonical tenant registry under governance: register tenants through the
 * organization model, transition lifecycle status, archive, and remove with a
 * dependency check that refuses safely and explains the blockers. No tenant is
 * ever hard-deleted; legal, financial, compliance and audit history survives
 * every transition.
 */
export default async function AdministrationTenantsPage() {
  const access = await requireAccess("organization:entity.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="organization:entity.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const now = new Date();

    const [tenantRows, entityCounts, userCounts, sessionCounts] = await Promise.all([
      db
        .select({
          id: tenants.id,
          code: tenants.code,
          name: tenants.name,
          type: tenants.type,
          parentTenantId: tenants.parentTenantId,
          countryCode: tenants.countryCode,
          isolationTier: tenants.isolationTier,
          status: tenants.status,
          createdAt: tenants.createdAt,
        })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
      db
        .select({ tenantId: legalEntities.tenantId, n: sql<number>`count(*)` })
        .from(legalEntities)
        .where(inArray(legalEntities.tenantId, scope))
        .groupBy(legalEntities.tenantId),
      db
        .select({ tenantId: users.primaryTenantId, n: sql<number>`count(*)` })
        .from(users)
        .where(inArray(users.primaryTenantId, scope))
        .groupBy(users.primaryTenantId),
      db
        .select({ tenantId: sessions.tenantId, n: sql<number>`count(*)` })
        .from(sessions)
        .where(and(inArray(sessions.tenantId, scope), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
        .groupBy(sessions.tenantId),
    ]);

    const codeById = new Map(tenantRows.map((t) => [t.id, t.code]));
    const entitiesByTenant = new Map(entityCounts.map((e) => [e.tenantId, Number(e.n)]));
    const usersByTenant = new Map(userCounts.map((u) => [u.tenantId, Number(u.n)]));
    const sessionsByTenant = new Map(sessionCounts.map((s) => [s.tenantId, Number(s.n)]));
    const childrenByParent = new Map<string, number>();
    for (const t of tenantRows) {
      if (t.parentTenantId) {
        childrenByParent.set(t.parentTenantId, (childrenByParent.get(t.parentTenantId) ?? 0) + 1);
      }
    }

    const canRegister = can(principal, "organization:tenant.register").allowed;
    const canManage = can(principal, "organization:tenant.manage").allowed;
    const canRemove = can(principal, "organization:tenant.remove").allowed;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · tenants</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Tenant governance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            The constitutional hierarchy — trust, holding, country, sector and operating tenants — under
            governed lifecycle control. Registration validates code uniqueness, hierarchy and country
            references; destructive operations are dependency-checked and fail safely with the blocking
            conditions.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Tenants in scope" value={String(tenantRows.length)} sub={`${tenantRows.filter((t) => t.status === "ACTIVE").length} active`} />
          <Metric label="Suspended / deactivated" value={String(tenantRows.filter((t) => ["SUSPENDED", "DEACTIVATED"].includes(t.status)).length)} sub="operations halted, records retained" tone="gold" />
          <Metric label="Archived / removed" value={String(tenantRows.filter((t) => ["ARCHIVED", "REVOKED"].includes(t.status)).length)} sub="history retained, never deleted" />
          <Metric label="Legal entities" value={String(entityCounts.reduce((a, e) => a + Number(e.n), 0))} sub="across the tenant subtree" />
        </div>

        <Panel kicker="Governed registration" title="Register a tenant">
          {canRegister ? (
            <RegisterTenantForm parentTenants={tenantRows.filter((t) => t.status === "ACTIVE")} />
          ) : (
            <EmptyState message="You do not hold organization:tenant.register. Tenant registration is a governed capability." />
          )}
        </Panel>

        <Panel kicker="Canonical tenant registry" title="Tenants · hierarchy · lifecycle">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Tenant</th>
                  <th>Tenant ID</th>
                  <th>Type</th>
                  <th>Parent</th>
                  <th>Country</th>
                  <th>Entities</th>
                  <th>Home users</th>
                  <th>Live sessions</th>
                  <th>Status</th>
                  <th>Registered</th>
                  {(canManage || canRemove) && <th>Governed actions</th>}
                </tr>
              </thead>
              <tbody>
                {tenantRows.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="font-medium">{t.name}</div>
                      <div className="font-mono text-[10.5px] beyu-muted">{t.code}</div>
                      <div className="text-[10.5px] beyu-muted">isolation: {t.isolationTier}</div>
                    </td>
                    <td className="font-mono text-[10.5px] beyu-muted">{t.id}</td>
                    <td className="text-[11.5px]">{t.type}</td>
                    <td className="text-[11.5px] beyu-muted">{t.parentTenantId ? (codeById.get(t.parentTenantId) ?? t.parentTenantId) : "root"}</td>
                    <td className="text-[11.5px]">{t.countryCode ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{entitiesByTenant.get(t.id) ?? 0}</td>
                    <td className="tabular-nums text-[11.5px]">{usersByTenant.get(t.id) ?? 0}</td>
                    <td className="tabular-nums text-[11.5px]">{sessionsByTenant.get(t.id) ?? 0}</td>
                    <td>
                      <Badge tone={stateTone(t.status)}>{t.status}</Badge>
                    </td>
                    <td className="text-[11.5px] beyu-muted">{t.createdAt.toISOString().slice(0, 10)}</td>
                    {(canManage || canRemove) && (
                      <td>
                        <TenantStatusActions tenantId={t.id} status={t.status} canManage={canManage} canRemove={canRemove} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Removal is HIGH-RISK (MFA step-up) and dependency-checked: live users, sessions, grants, legal
            entities, child tenants or operational rows block it and are reported. Archive retains everything
            while ending operations; REVOKED is the terminal, attribution-preserving end state.
          </p>
        </Panel>
      </div>
    );
  });
}
