import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  emergencyAccessGrants,
  parties,
  permissions,
  roleAssignments,
  rolePermissions,
  roles,
  sessions,
  tenants,
  users,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Identity — the canonical identity plane of BEYU OS.
 *
 * The source-of-truth registry assigns Identity to BEYU_OS
 * ("identity.users / identity.parties", consumers: ALL). This surface renders
 * those EXISTING records — one GlobalUserID per canonical party, role grants,
 * sessions and break-glass grants — under the same identity:user.read
 * capability the authorization engine already enforces. No new identity
 * system is created here; this page only makes the canonical one visible.
 */
export default async function IdentityPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const scope = await tenantScopeIds(access.principal);
    const now = new Date();

    const [userRows, roleRows, permCount, grantCountRows, assignmentRows, activeSessions, breakGlass] =
      await Promise.all([
        db
          .select({
            id: users.id,
            email: users.email,
            status: users.status,
            mfaEnrolled: users.mfaEnrolled,
            isServiceAccount: users.isServiceAccount,
            lastLoginAt: users.lastLoginAt,
            lockedUntil: users.lockedUntil,
            createdAt: users.createdAt,
            displayName: parties.displayName,
            tenantCode: tenants.code,
          })
          .from(users)
          .leftJoin(parties, eq(parties.id, users.partyId))
          .leftJoin(tenants, eq(tenants.id, users.primaryTenantId))
          .where(inArray(users.primaryTenantId, scope))
          .orderBy(users.email),
        db.select().from(roles).orderBy(roles.code),
        db.select({ n: sql<number>`count(*)` }).from(permissions),
        db
          .select({ roleId: rolePermissions.roleId, n: sql<number>`count(*)` })
          .from(rolePermissions)
          .groupBy(rolePermissions.roleId),
        db
          .select()
          .from(roleAssignments)
          .where(inArray(roleAssignments.tenantId, scope)),
        db
          .select({ userId: sessions.userId, n: sql<number>`count(*)` })
          .from(sessions)
          .where(
            and(
              inArray(sessions.tenantId, scope),
              isNull(sessions.revokedAt),
              gt(sessions.expiresAt, now),
            ),
          )
          .groupBy(sessions.userId),
        db
          .select()
          .from(emergencyAccessGrants)
          .where(inArray(emergencyAccessGrants.tenantId, scope))
          .orderBy(desc(emergencyAccessGrants.activatedAt)),
      ]);

    const today = now.toISOString().slice(0, 10);
    const activeAssignments = assignmentRows.filter(
      (a) => a.effectiveFrom <= today && (a.effectiveTo === null || a.effectiveTo >= today),
    );
    const rolesByUser = new Map<string, string[]>();
    const roleCodeById = new Map(roleRows.map((r) => [r.id, r.code]));
    for (const a of activeAssignments) {
      const list = rolesByUser.get(a.userId) ?? [];
      const code = roleCodeById.get(a.roleId);
      if (code) list.push(code);
      rolesByUser.set(a.userId, list);
    }
    const sessionsByUser = new Map(activeSessions.map((s) => [s.userId, Number(s.n)]));
    const grantsByRole = new Map(grantCountRows.map((g) => [g.roleId, Number(g.n)]));
    const activeBreakGlass = breakGlass.filter(
      (g) => !g.revokedAt && g.expiresAt > now,
    );

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Identity · one canonical GlobalUserID</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Identity &amp; access plane</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Every actor — human, service or AI — resolves to one canonical party and at most one user
            identity. Role grants are effective-dated and justified; break-glass access is time-bound,
            approved, logged and post-reviewed.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Identities" value={String(userRows.length)} sub={`${userRows.filter((u) => u.status === "ACTIVE").length} active`} />
          <Metric label="MFA enrolled" value={String(userRows.filter((u) => u.mfaEnrolled).length)} sub={`${userRows.filter((u) => !u.mfaEnrolled).length} not enrolled`} />
          <Metric label="Active sessions" value={String(activeSessions.reduce((a, s) => a + Number(s.n), 0))} sub="unrevoked · unexpired" />
          <Metric label="Break-glass grants" value={String(activeBreakGlass.length)} sub={`${breakGlass.length} recorded in scope`} tone={activeBreakGlass.length > 0 ? "gold" : "navy"} />
        </div>

        <Panel kicker="Canonical identity registry" title="Users · roles · sessions">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr><th>Identity</th><th>Tenant</th><th>Effective roles</th><th>MFA</th><th>Sessions</th><th>Status</th><th>Last sign-in</th></tr>
              </thead>
              <tbody>
                {userRows.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="font-medium">{u.displayName ?? u.email}</div>
                      <div className="font-mono text-[10.5px] beyu-muted">{u.email}</div>
                    </td>
                    <td className="text-[11.5px]">{u.tenantCode ?? "—"}{u.isServiceAccount && <div><Badge tone="amber">SERVICE</Badge></div>}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {(rolesByUser.get(u.id) ?? []).map((r) => (
                          <span key={r} className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] text-[10px] tracking-wide">{r}</span>
                        ))}
                        {(rolesByUser.get(u.id) ?? []).length === 0 && <span className="text-[11px] beyu-muted">none effective</span>}
                      </div>
                    </td>
                    <td><Badge tone={u.mfaEnrolled ? "green" : "amber"}>{u.mfaEnrolled ? "ENROLLED" : "NOT ENROLLED"}</Badge></td>
                    <td className="tabular-nums text-[11.5px]">{sessionsByUser.get(u.id) ?? 0}</td>
                    <td>
                      <Badge tone={stateTone(u.status)}>{u.status}</Badge>
                      {u.lockedUntil && u.lockedUntil > now && <div className="mt-0.5 text-[10.5px] text-rose-700 dark:text-rose-300">locked until {u.lockedUntil.toISOString().slice(0, 16).replace("T", " ")}</div>}
                    </td>
                    <td className="text-[11.5px] beyu-muted">{u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "never"}</td>
                  </tr>
                ))}
                {userRows.length === 0 && (
                  <tr><td colSpan={7}><EmptyState message="No identities in your tenant scope." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="Constitutional role catalogue" title={`${roleRows.length} roles · ${permCount[0]?.n ?? 0} capabilities`}>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Role</th><th>Scope</th><th>Grants</th><th>Class</th></tr></thead>
                <tbody>
                  {roleRows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-medium">{r.name}</div>
                        <div className="max-w-md text-[11px] beyu-muted">{r.description}</div>
                        <div className="font-mono text-[10.5px] beyu-muted">{r.code}</div>
                      </td>
                      <td className="text-[11.5px]">{r.scopeLevel}</td>
                      <td className="tabular-nums text-[11.5px]">{grantsByRole.get(r.id) ?? 0} capabilities</td>
                      <td>
                        {r.privileged ? <Badge tone="gold">PRIVILEGED</Badge> : <Badge tone="slate">STANDARD</Badge>}
                        {r.separationGroup && <div className="mt-0.5 text-[10.5px] beyu-muted">segregation: {r.separationGroup}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel kicker="Emergency access" title="Break-glass grants — time-bound, approved, reviewed">
            <div className="space-y-2">
              {breakGlass.slice(0, 10).map((g) => {
                const state = g.revokedAt ? "REVOKED" : g.expiresAt <= now ? "EXPIRED" : "ACTIVE";
                return (
                  <div key={g.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] font-medium">{g.reason}</span>
                      <Badge tone={stateTone(state)}>{state}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] beyu-muted">
                      {(g.permissionCodes ?? []).join(", ")} · approved by {g.approvedBy} · expires {g.expiresAt.toISOString().slice(0, 16).replace("T", " ")}
                    </div>
                    <div className="mt-0.5 text-[10.5px] beyu-muted">
                      post-review: {g.postReviewBy ? `${g.postReviewBy} — ${g.postReviewOutcome ?? "recorded"}` : "pending"}
                      {g.revokedAt ? ` · revoked by ${g.revokedBy ?? "—"}` : ""}
                    </div>
                  </div>
                );
              })}
              {breakGlass.length === 0 && (
                <EmptyState message="No break-glass grants recorded. Emergency access activates only with a recorded reason, an approver and a review trail." />
              )}
            </div>
            <p className="mt-3 text-[11px] beyu-muted">
              Denials and grants alike are written to the immutable audit ledger; requests for additional
              capability travel through governed grant and resolution workflows, never through informal access.
            </p>
          </Panel>
        </div>
      </div>
    );
  });
}
