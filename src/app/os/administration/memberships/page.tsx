import { inArray, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { parties, roleAssignments, roles, tenants, users } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { MembershipForm, RevokeMembershipButton } from "../governance-actions";

export const dynamic = "force-dynamic";

/**
 * Administration — Memberships.
 *
 * User ↔ tenant membership expressed through the CANONICAL assignment model:
 * membership is an active TENANT_MEMBER (zero-capability) assignment; presence
 * in a tenant never implies access to another. Every mutation is a governed
 * API call; grants apply only in the granted tenant or its ancestors.
 */
export default async function AdministrationMembershipsPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const today = new Date().toISOString().slice(0, 10);

    const [assignmentRows, userRows, tenantRows] = await Promise.all([
      db
        .select({
          id: roleAssignments.id,
          userId: roleAssignments.userId,
          tenantId: roleAssignments.tenantId,
          roleCode: roles.code,
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
    const membershipRows = activeRows.filter((a) => a.roleCode === "TENANT_MEMBER");
    const canManage = can(principal, "identity:membership.manage").allowed;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · memberships</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">User ↔ tenant membership</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Membership is the governed statement that a user belongs to a tenant — an active TENANT_MEMBER
            assignment with zero capability. Every request still re-evaluates GlobalUserID, tenant, entity,
            country, role, permission, capability, policy and RLS; membership of one tenant never grants
            access to another.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active memberships" value={String(membershipRows.length)} sub="TENANT_MEMBER assignments" />
          <Metric label="Active scoped grants" value={String(activeRows.filter((a) => a.roleCode !== "TENANT_MEMBER").length)} sub="capability-bearing assignments" />
          <Metric label="Ended (history)" value={String(assignmentRows.length - activeRows.length)} sub="end-dated, attribution retained" />
          <Metric label="Tenants in scope" value={String(tenantRows.length)} sub="subtree of your session tenant" />
        </div>

        <Panel kicker="Governed membership" title="Assign membership">
          {canManage ? (
            <MembershipForm
              users={userRows.filter((u) => u.status === "ACTIVE")}
              tenants={tenantRows.filter((t) => t.status === "ACTIVE")}
            />
          ) : (
            <EmptyState message="You do not hold identity:membership.manage. Membership is a governed capability." />
          )}
        </Panel>

        <Panel kicker="Membership registry" title="Active memberships">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Tenant</th>
                  <th>Granted</th>
                  <th>Granted by</th>
                  <th>Justification</th>
                  <th>State</th>
                  {canManage && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {membershipRows.map((m) => {
                  const tenant = tenantRows.find((t) => t.id === m.tenantId);
                  return (
                    <tr key={m.id}>
                      <td>
                        <div className="font-medium">{m.displayName ?? m.email}</div>
                        <div className="font-mono text-[10.5px] beyu-muted">{m.email}</div>
                      </td>
                      <td className="text-[11.5px]">
                        {tenant?.code ?? m.tenantId}
                        <div className="text-[10.5px] beyu-muted">{tenant?.name}</div>
                      </td>
                      <td className="text-[11.5px] beyu-muted">{m.effectiveFrom}</td>
                      <td className="font-mono text-[10.5px] beyu-muted">{m.grantedBy}</td>
                      <td className="max-w-[280px] text-[11px] beyu-muted">{m.justification}</td>
                      <td>
                        <Badge tone="green">ACTIVE</Badge>
                      </td>
                      {canManage && (
                        <td>
                          <RevokeMembershipButton userId={m.userId} tenantId={m.tenantId} />
                        </td>
                      )}
                    </tr>
                  );
                })}
                {membershipRows.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState message="No active memberships in scope. Assign one above — or note that users still hold their home tenant." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Scoped grants" title="All active assignments (capability-bearing)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>User</th><th>Tenant</th><th>Role</th><th>Window</th><th>Granted by</th></tr>
              </thead>
              <tbody>
                {activeRows
                  .filter((a) => a.roleCode !== "TENANT_MEMBER")
                  .map((a) => (
                    <tr key={a.id}>
                      <td className="text-[11.5px]">{a.displayName ?? a.email}</td>
                      <td className="text-[11.5px] beyu-muted">{tenantRows.find((t) => t.id === a.tenantId)?.code ?? a.tenantId}</td>
                      <td>
                        <span className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[10px] tracking-wide">{a.roleCode}</span>
                      </td>
                      <td className="text-[11px] beyu-muted">
                        {a.effectiveFrom} → {a.effectiveTo ?? "open"}
                      </td>
                      <td className="font-mono text-[10.5px] beyu-muted">{a.grantedBy}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
