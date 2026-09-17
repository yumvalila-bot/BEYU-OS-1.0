import { eq, inArray, or, desc } from "drizzle-orm";
import { db } from "@/db";
import { adminAuthorityDelegations, parties, roles, tenants, users } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { ADMIN_DELEGATABLE_PERMISSIONS } from "@/lib/constants";
import { roleDerivedPermissions } from "@/lib/admin/delegation";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { CreateDelegationForm, RevokeDelegationButton } from "../governance-actions";

export const dynamic = "force-dynamic";

/**
 * Administration — Authority delegations.
 *
 * Bounded, time-limited, revocable delegations of administrative capability.
 * The delegation NEVER exceeds the delegator's own authority (validated at
 * creation against ROLE-derived grants and the resolved tenant scope), is
 * resolved on EVERY request (revocation and expiry are immediate), and can
 * never be re-delegated — chains have depth one. The delegatee is NEVER a
 * PLATFORM_ADMIN by virtue of the delegation: delegated authority and the
 * platform administrator role are different things.
 */
export default async function AdministrationDelegationsPage() {
  const access = await requireAccess("identity:delegation.manage");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:delegation.manage" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const now = new Date();

    const [instruments, tenantRows, userRows, myRolePermissions] = await Promise.all([
      db
        .select()
        .from(adminAuthorityDelegations)
        .where(or(eq(adminAuthorityDelegations.tenantId, principal.tenantId), inArray(adminAuthorityDelegations.delegatorUserId, [principal.userId])))
        .orderBy(desc(adminAuthorityDelegations.createdAt))
        .limit(200),
      db
        .select({ id: tenants.id, code: tenants.code, name: tenants.name, status: tenants.status })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
      db
        .select({ id: users.id, email: users.email, displayName: parties.displayName, status: users.status, isServiceAccount: users.isServiceAccount })
        .from(users)
        .innerJoin(parties, eq(parties.id, users.partyId))
        .where(inArray(users.primaryTenantId, scope))
        .orderBy(users.email),
      roleDerivedPermissions(principal.userId, principal.tenantId),
    ]);

    const codeById = new Map(tenantRows.map((t) => [t.id, t.code]));
    const emailById = new Map(userRows.map((u) => [u.id, u.email]));
    const nameById = new Map(userRows.map((u) => [u.id, u.displayName]));

    const live = instruments.filter(
      (i) => i.status === "ACTIVE" && !i.revokedAt && i.effectiveFrom <= now && i.effectiveTo > now,
    );

    // Only capabilities the acting administrator holds through ROLE grants can
    // be offered for delegation — the server enforces this anyway; the form
    // merely refuses to offer authority the delegator does not have.
    const delegatableHere = ADMIN_DELEGATABLE_PERMISSIONS.filter((p) => myRolePermissions.has(p));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · authority delegations</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Delegated administrative authority</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Delegation shares bounded authority — a closed set of administrative capabilities, an explicit
            tenant scope, a time window — while the delegator keeps full responsibility. It can never widen
            anyone&apos;s authority beyond their own, it is never inherited by the platform administrator role,
            and it is never permanent.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Live delegations" value={String(live.length)} sub="in-window and unrevoked" />
          <Metric label="Expired / pending" value={String(instruments.filter((i) => i.status === "ACTIVE" && (i.effectiveFrom > now || i.effectiveTo <= now)).length)} sub="authority resolved per request" tone="gold" />
          <Metric label="Revoked" value={String(instruments.filter((i) => i.status === "REVOKED").length)} sub="terminal — revocation outranks window" />
          <Metric label="Your delegable authority" value={String(delegatableHere.length)} sub={`${delegatableHere.length} of ${ADMIN_DELEGATABLE_PERMISSIONS.length} capabilities`} />
        </div>

        <Panel kicker="Governed delegation" title="Create a delegation">
          {delegatableHere.length > 0 ? (
            <CreateDelegationForm
              delegatees={userRows.filter((u) => u.status === "ACTIVE" && !u.isServiceAccount && u.id !== principal.userId)}
              tenants={tenantRows.filter((t) => t.status === "ACTIVE")}
              delegatablePermissions={[...delegatableHere]}
            />
          ) : (
            <EmptyState message="You hold no delegable administrative capability through ROLE grants. Delegated authority can never be re-delegated." />
          )}
        </Panel>

        <Panel kicker="Delegation instruments" title="Issued, received and tenant-recorded">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Instrument</th>
                  <th>Delegator</th>
                  <th>Delegatee</th>
                  <th>Capabilities</th>
                  <th>Scope</th>
                  <th>Window</th>
                  <th>Reason</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {instruments.map((i) => {
                  const inWindow = i.effectiveFrom <= now && i.effectiveTo > now;
                  const liveState = i.status === "ACTIVE" && !i.revokedAt && inWindow;
                  return (
                    <tr key={i.id}>
                      <td className="font-mono text-[10.5px] beyu-muted">{i.id}</td>
                      <td className="text-[11.5px]">
                        {nameById.get(i.delegatorUserId) ?? i.delegatorUserId}
                        <div className="font-mono text-[10px] beyu-muted">{emailById.get(i.delegatorUserId) ?? ""}</div>
                      </td>
                      <td className="text-[11.5px]">
                        {nameById.get(i.delegateeUserId) ?? i.delegateeUserId}
                        <div className="font-mono text-[10px] beyu-muted">{emailById.get(i.delegateeUserId) ?? ""}</div>
                      </td>
                      <td>
                        <div className="flex max-w-[200px] flex-wrap gap-1">
                          {(i.permissions ?? []).map((p) => (
                            <span key={p} className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] font-mono text-[10px]">
                              {p}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-[11px] beyu-muted">
                        {(i.scopeTenantIds ?? []).map((t) => codeById.get(t) ?? t).join(", ")}
                      </td>
                      <td className="text-[11px] beyu-muted">
                        {i.effectiveFrom.toISOString().slice(0, 10)} → {i.effectiveTo.toISOString().slice(0, 10)}
                      </td>
                      <td className="max-w-[220px] text-[11px] beyu-muted">{i.reason}</td>
                      <td>
                        <Badge tone={i.status === "REVOKED" ? "slate" : liveState ? "green" : "amber"}>
                          {i.status === "REVOKED" ? "REVOKED" : liveState ? "ACTIVE" : inWindow ? "ACTIVE (expired/pending window)" : "ACTIVE (outside window)"}
                        </Badge>
                        {i.revokeReason && <div className="mt-1 max-w-[160px] text-[10px] beyu-muted">{i.revokeReason}</div>}
                      </td>
                      <td>
                        {i.status === "ACTIVE" && !i.revokedAt ? (
                          <RevokeDelegationButton delegationId={i.id} />
                        ) : (
                          <span className="text-[11px] beyu-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {instruments.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState message="No delegation instruments recorded." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
