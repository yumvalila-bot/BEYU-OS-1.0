import { inArray, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { parties, roleAssignments, roles, tenants, users } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel } from "@/components/brand";
import { GrantRoleForm, RevokeRoleButton } from "../governance-actions";

export const dynamic = "force-dynamic";

/**
 * Administration — Roles & capabilities.
 *
 * The constitutional role catalogue (roles seeded from the ONE constants.ts
 * definition) and the governed grant/revoke of scoped role assignments.
 * identity:role.grant is HIGH-RISK: MFA step-up, no self-escalation, privileged
 * roles grantable only by a PLATFORM_ADMIN, and the last active PLATFORM_ADMIN
 * assignment can never be revoked.
 */
export default async function AdministrationRolesPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const today = new Date().toISOString().slice(0, 10);

    const [catalogue, assignmentRows, userRows, tenantRows] = await Promise.all([
      db
        .select({
          id: roles.id,
          code: roles.code,
          name: roles.name,
          description: roles.description,
          scopeLevel: roles.scopeLevel,
          privileged: roles.privileged,
        })
        .from(roles)
        .orderBy(roles.code),
      db
        .select({
          id: roleAssignments.id,
          userId: roleAssignments.userId,
          tenantId: roleAssignments.tenantId,
          roleCode: roles.code,
          privileged: roles.privileged,
          effectiveFrom: roleAssignments.effectiveFrom,
          effectiveTo: roleAssignments.effectiveTo,
          grantedBy: roleAssignments.grantedBy,
          justification: roleAssignments.justification,
          email: users.email,
          displayName: parties.displayName,
        })
        .from(roleAssignments)
        .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
        .innerJoin(users, eq(users.id, roleAssignments.userId))
        .innerJoin(parties, eq(parties.id, users.partyId))
        .where(inArray(roleAssignments.tenantId, scope))
        .orderBy(desc(roleAssignments.effectiveFrom))
        .limit(300),
      db
        .select({ id: users.id, email: users.email, displayName: parties.displayName, status: users.status })
        .from(users)
        .innerJoin(parties, eq(parties.id, users.partyId))
        .where(inArray(users.primaryTenantId, scope))
        .orderBy(users.email),
      db
        .select({ id: tenants.id, code: tenants.code, name: tenants.name, status: tenants.status })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
    ]);

    const activeRows = assignmentRows.filter(
      (a) => a.effectiveFrom <= today && (a.effectiveTo === null || a.effectiveTo >= today),
    );
    const canGrant = can(principal, "identity:role.grant").allowed;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · roles &amp; capabilities</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Constitutional roles, governed grants</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            The role catalogue is constitutional: it is defined once in the constants of the control plane and
            mirrored into the database — no administrator can mint a role or a permission. Grants are
            effective-dated, justified, tenant-scoped and revoked by end-dating; every grant and revocation is
            audited.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Roles in catalogue" value={String(catalogue.length)} sub={`${catalogue.filter((r) => r.privileged).length} privileged`} />
          <Metric label="Active assignments in scope" value={String(activeRows.length)} sub="effective-dated grants" />
          <Metric label="Privileged assignments" value={String(activeRows.filter((a) => a.privileged).length)} sub="PLATFORM_ADMIN-class grants" tone="gold" />
          <Metric label="Ended (history)" value={String(assignmentRows.length - activeRows.length)} sub="attribution retained" />
        </div>

        <Panel kicker="Governed grant" title="Grant a role assignment">
          {canGrant ? (
            <GrantRoleForm
              users={userRows.filter((u) => u.status === "ACTIVE")}
              tenants={tenantRows.filter((t) => t.status === "ACTIVE")}
              roles={catalogue.map((r) => ({ code: r.code, name: r.name, privileged: r.privileged }))}
            />
          ) : (
            <EmptyState message="You do not hold identity:role.grant (HIGH-RISK, MFA step-up). Role grants are confined to the Chief Executive and the platform administrator." />
          )}
        </Panel>

        <Panel kicker="Assignments" title="Scoped grants (most recent first)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Tenant</th>
                  <th>Window</th>
                  <th>Granted by</th>
                  <th>Justification</th>
                  <th>State</th>
                  {canGrant && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {assignmentRows.slice(0, 80).map((a) => {
                  const active = a.effectiveFrom <= today && (a.effectiveTo === null || a.effectiveTo >= today);
                  return (
                    <tr key={a.id}>
                      <td>
                        <div className="font-medium">{a.displayName ?? a.email}</div>
                        <div className="font-mono text-[10.5px] beyu-muted">{a.email}</div>
                      </td>
                      <td>
                        <span className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[10px] tracking-wide">{a.roleCode}</span>
                        {a.privileged && (
                          <div className="mt-1">
                            <Badge tone="amber">PRIVILEGED</Badge>
                          </div>
                        )}
                      </td>
                      <td className="text-[11.5px] beyu-muted">{tenantRows.find((t) => t.id === a.tenantId)?.code ?? a.tenantId}</td>
                      <td className="text-[11px] beyu-muted">
                        {a.effectiveFrom} → {a.effectiveTo ?? "open"}
                      </td>
                      <td className="font-mono text-[10.5px] beyu-muted">{a.grantedBy}</td>
                      <td className="max-w-[260px] text-[11px] beyu-muted">{a.justification}</td>
                      <td>
                        <Badge tone={active ? "green" : "slate"}>{active ? "ACTIVE" : "ENDED"}</Badge>
                      </td>
                      {canGrant && (
                        <td>{active ? <RevokeRoleButton assignmentId={a.id} /> : <span className="text-[11px] beyu-muted">—</span>}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Catalogue" title="Constitutional roles">
          <div className="grid gap-2 md:grid-cols-2">
            {catalogue.map((r) => (
              <div key={r.id} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{r.code}</span>
                  <span className="flex gap-1">
                    {r.privileged && <Badge tone="amber">PRIVILEGED</Badge>}
                    <Badge tone="slate">{r.scopeLevel}</Badge>
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] beyu-muted">{r.name}</div>
                <p className="mt-1 text-[11px] beyu-muted">{r.description}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    );
  });
}
