import { eq, inArray, sql, and, isNull, gte } from "drizzle-orm";
import { db } from "@/db";
import { parties, roleAssignments, roles, sessions, tenants, users } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { RegisterUserForm, UserStatusActions } from "./user-actions";

export const dynamic = "force-dynamic";

/**
 * Administration — Users & identities.
 *
 * The FIRST-CLASS shared administrative capability of BEYU OS: governed
 * registration and lifecycle of the canonical identities (parties + users,
 * ONE GlobalUserID per party). This page is presentation over the EXISTING
 * identity plane — every mutation POSTs to a capability-guarded API route that
 * re-authorizes, validates scope and appends the immutable audit record.
 * The frontend is never the authorization boundary.
 */
export default async function AdministrationUsersPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const [userRows, tenantRows, assignmentRows, activeSessions] = await Promise.all([
      db
        .select({
          id: users.id,
          email: users.email,
          status: users.status,
          mfaEnrolled: users.mfaEnrolled,
          isServiceAccount: users.isServiceAccount,
          lastLoginAt: users.lastLoginAt,
          primaryTenantId: users.primaryTenantId,
          displayName: parties.displayName,
          countryCode: parties.countryCode,
          tenantCode: tenants.code,
        })
        .from(users)
        .innerJoin(parties, eq(parties.id, users.partyId))
        .leftJoin(tenants, eq(tenants.id, users.primaryTenantId))
        .where(inArray(users.primaryTenantId, scope))
        .orderBy(users.email),
      db
        .select({ id: tenants.id, code: tenants.code, name: tenants.name, status: tenants.status })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
      db
        .select({
          userId: roleAssignments.userId,
          tenantId: roleAssignments.tenantId,
          roleCode: roles.code,
          effectiveFrom: roleAssignments.effectiveFrom,
          effectiveTo: roleAssignments.effectiveTo,
        })
        .from(roleAssignments)
        .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
        .where(inArray(roleAssignments.tenantId, scope)),
      db
        .select({ userId: sessions.userId, n: sql<number>`count(*)` })
        .from(sessions)
        .where(and(inArray(sessions.tenantId, scope), isNull(sessions.revokedAt), gte(sessions.expiresAt, now)))
        .groupBy(sessions.userId),
    ]);

    const tenantCodeById = new Map(tenantRows.map((t) => [t.id, t.code]));
    const activeAssignments = assignmentRows.filter(
      (a) => a.effectiveFrom <= today && (a.effectiveTo === null || a.effectiveTo >= today),
    );
    const tenantsByUser = new Map<string, Set<string>>();
    for (const a of activeAssignments) {
      const set = tenantsByUser.get(a.userId) ?? new Set<string>();
      set.add(tenantCodeById.get(a.tenantId) ?? a.tenantId);
      tenantsByUser.set(a.userId, set);
    }
    const rolesByUser = new Map<string, string[]>();
    for (const a of activeAssignments) {
      const list = rolesByUser.get(a.userId) ?? [];
      if (!list.includes(a.roleCode)) list.push(a.roleCode);
      rolesByUser.set(a.userId, list);
    }
    const sessionsByUser = new Map(activeSessions.map((s) => [s.userId, Number(s.n)]));

    const canRegister = can(principal, "identity:user.register").allowed;
    const canSuspend = can(principal, "identity:user.suspend").allowed;
    const canRemove = can(principal, "identity:user.remove").allowed;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · users &amp; identities</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">User governance</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Governed lifecycle of the canonical identity plane: register, activate, suspend, deactivate and
            remove — every act capability-checked, scoped, confirmed, reasoned and written to the immutable
            audit ledger. Registration never discloses a credential; removal never destroys attribution.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Identities in scope" value={String(userRows.length)} sub={`${userRows.filter((u) => u.status === "ACTIVE").length} active · ${userRows.filter((u) => u.status === "CREATED").length} created`} />
          <Metric label="Suspended / deactivated" value={String(userRows.filter((u) => u.status === "SUSPENDED" || u.status === "DEACTIVATED").length)} sub="access revoked immediately" tone="gold" />
          <Metric label="MFA enrolled" value={String(userRows.filter((u) => u.mfaEnrolled).length)} sub={`${userRows.filter((u) => !u.mfaEnrolled).length} not enrolled`} />
          <Metric label="Live sessions" value={String(activeSessions.reduce((a, s) => a + Number(s.n), 0))} sub="unrevoked · unexpired" />
        </div>

        <Panel kicker="Governed registration" title="Register a user identity">
          {canRegister ? (
            <RegisterUserForm tenants={tenantRows.filter((t) => t.status === "ACTIVE")} />
          ) : (
            <EmptyState message="You do not hold identity:user.register. Registration is a governed capability, never a default." />
          )}
        </Panel>

        <Panel kicker="Canonical identity registry" title="Users · lifecycle · tenants · roles">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Identity</th>
                  <th>GlobalUserID</th>
                  <th>Home tenant</th>
                  <th>Tenants (active grants)</th>
                  <th>Roles</th>
                  <th>Sessions</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                  {(canSuspend || canRemove) && <th>Governed actions</th>}
                </tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium">{u.displayName ?? u.email}</div>
                      <div className="font-mono text-[10.5px] beyu-muted">{u.email}</div>
                    </td>
                    <td className="font-mono text-[10.5px] beyu-muted">{u.id}</td>
                    <td className="text-[11.5px]">
                      {u.tenantCode ?? "—"}
                      {u.isServiceAccount && (
                        <div>
                          <Badge tone="amber">SERVICE</Badge>
                        </div>
                      )}
                    </td>
                    <td className="text-[11px] beyu-muted">
                      {[...(tenantsByUser.get(u.id) ?? [])].join(", ") || "home only"}
                    </td>
                    <td>
                      <div className="flex max-w-[220px] flex-wrap gap-1">
                        {(rolesByUser.get(u.id) ?? []).map((r) => (
                          <span key={r} className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[10px] tracking-wide">
                            {r}
                          </span>
                        ))}
                        {(rolesByUser.get(u.id) ?? []).length === 0 && <span className="text-[11px] beyu-muted">none effective</span>}
                      </div>
                    </td>
                    <td className="tabular-nums text-[11.5px]">{sessionsByUser.get(u.id) ?? 0}</td>
                    <td>
                      <Badge tone={stateTone(u.status)}>{u.status}</Badge>
                    </td>
                    <td className="text-[11.5px] beyu-muted">
                      {u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "never"}
                    </td>
                    {(canSuspend || canRemove) && (
                      <td>
                        <UserStatusActions
                          userId={u.id}
                          status={u.status}
                          canSuspend={canSuspend}
                          canRemove={canRemove}
                          isSelf={u.id === principal.userId}
                        />
                      </td>
                    )}
                  </tr>
                ))}
                {userRows.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState message="No identities in your tenant scope." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Removal is irreversible and HIGH-RISK (MFA step-up): identity rows are retained for audit and legal
            attribution, sessions die immediately, every grant is end-dated and personal data is anonymized.
          </p>
        </Panel>
      </div>
    );
  });
}
