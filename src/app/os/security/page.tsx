import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import {
  permissions,
  roleAssignments,
  servicePrincipals,
  sessions,
  users,
} from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { CLASSIFICATION_ORDER, HIGH_RISK_PERMISSIONS, PERMISSIONS } from "@/lib/constants";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Security — the security posture surface of the BEYU OS control plane.
 *
 * Security is a SHARED CAPABILITY, not a "Security OS" (Constitution Art. 2):
 * authentication, MFA, session risk, the high-risk permission catalogue and
 * the service-principal registry already exist in the kernel and its schema.
 * This page renders that existing posture read-only under identity:user.read
 * (the identity & access plane capability) — nothing here mutates state, and
 * no secret material is ever selected onto the page.
 */
export default async function SecurityPage() {
  const access = await requireAccess("identity:user.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="identity:user.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const scope = await tenantScopeIds(access.principal);
    const now = new Date();

    const entityScoped = access.principal.entityScope.length > 0;
    const scopedAssignments = entityScoped
      ? await db
          .select({ userId: roleAssignments.userId })
          .from(roleAssignments)
          .where(
            and(
              inArray(roleAssignments.tenantId, scope),
              inArray(roleAssignments.legalEntityId, access.principal.entityScope),
            ),
          )
      : [];
    const scopedUserIds = [
      ...new Set(scopedAssignments.map((assignment) => assignment.userId)),
    ];
    const sessionPredicate = entityScoped
      ? and(
          inArray(sessions.tenantId, scope),
          inArray(sessions.userId, scopedUserIds),
        )
      : inArray(sessions.tenantId, scope);
    const userPredicate = entityScoped
      ? and(
          inArray(users.primaryTenantId, scope),
          inArray(users.id, scopedUserIds),
        )
      : inArray(users.primaryTenantId, scope);

    const [sessionRows, userRows, principalRows, highRiskRows] = await Promise.all([
      // Select posture fields only. Session token hashes, IP addresses and user
      // agents never enter this rendering process.
      db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          issuedAt: sessions.issuedAt,
          expiresAt: sessions.expiresAt,
          revokedAt: sessions.revokedAt,
          deviceTrust: sessions.deviceTrust,
          riskScore: sessions.riskScore,
          mfaSatisfied: sessions.mfaSatisfied,
        })
        .from(sessions)
        .where(sessionPredicate)
        .orderBy(desc(sessions.issuedAt))
        .limit(200),
      db
        .select({
          id: users.id,
          email: users.email,
          status: users.status,
          mfaEnrolled: users.mfaEnrolled,
          failedAttempts: users.failedAttempts,
          lockedUntil: users.lockedUntil,
          mfaLockedUntil: users.mfaLockedUntil,
        })
        .from(users)
        .where(userPredicate),
      entityScoped ? Promise.resolve([]) : db.select().from(servicePrincipals),
      db
        .select()
        .from(permissions)
        .where(
          or(
            eq(permissions.highRisk, true),
            eq(permissions.requiresMfa, true),
            inArray(permissions.code, HIGH_RISK_PERMISSIONS as string[]),
          ),
        ),
    ]);

    const active = sessionRows.filter((s) => !s.revokedAt && s.expiresAt > now);
    const activeNoMfa = active.filter((s) => !s.mfaSatisfied);
    const elevatedRisk = active.filter((s) => s.riskScore > 0).sort((a, b) => b.riskScore - a.riskScore);
    const lockedUsers = userRows.filter(
      (u) => (u.lockedUntil && u.lockedUntil > now) || (u.mfaLockedUntil && u.mfaLockedUntil > now),
    );
    const mfaEnrolled = userRows.filter((u) => u.mfaEnrolled).length;

    const byDeviceTrust = new Map<string, number>();
    for (const s of active) byDeviceTrust.set(s.deviceTrust, (byDeviceTrust.get(s.deviceTrust) ?? 0) + 1);

    const emailByUserId = new Map(userRows.map((u) => [u.id, u.email]));

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Security · shared capability</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Security posture</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Session risk, MFA coverage and the governed permission catalogue, derived from the
            kernel&rsquo;s own authentication and authorization records. POSTURE ONLY — this surface
            grants nothing and displays no secret material.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Active sessions" value={String(active.length)} sub={`${activeNoMfa.length} without satisfied MFA`} tone={activeNoMfa.length > 0 ? "gold" : "navy"} />
          <Metric label="MFA coverage" value={`${mfaEnrolled}/${userRows.length}`} sub="identities enrolled" />
          <Metric label="Locked identities" value={String(lockedUsers.length)} sub="credential or MFA lockout active" tone={lockedUsers.length > 0 ? "gold" : "navy"} />
          <Metric label="Service principals" value={entityScoped ? "Restricted" : String(principalRows.length)} sub={entityScoped ? "global rows have no entity key; read refused" : `${principalRows.filter((p) => p.status !== "ACTIVE").length} suspended or revoked`} />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel kicker="Session risk posture" title="Active sessions by device trust">
            <div className="mb-4 flex flex-wrap gap-2">
              {[...byDeviceTrust.entries()].map(([trust, n]) => (
                <Badge key={trust} tone={trust === "TRUSTED" ? "green" : trust === "UNKNOWN" ? "amber" : "slate"}>
                  {trust}: {n}
                </Badge>
              ))}
              {active.length === 0 && <EmptyState message="No active sessions in your tenant scope." />}
            </div>
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Identity</th><th>Risk</th><th>Device trust</th><th>MFA</th><th>Issued</th><th>Expires</th></tr></thead>
                <tbody>
                  {elevatedRisk.slice(0, 12).map((s) => (
                    <tr key={s.id}>
                      <td className="text-[11.5px]">{emailByUserId.get(s.userId) ?? s.userId}</td>
                      <td><Badge tone={s.riskScore >= 50 ? "red" : s.riskScore >= 20 ? "amber" : "green"}>{s.riskScore}</Badge></td>
                      <td className="text-[11.5px]">{s.deviceTrust}</td>
                      <td><Badge tone={s.mfaSatisfied ? "green" : "amber"}>{s.mfaSatisfied ? "SATISFIED" : "NOT SATISFIED"}</Badge></td>
                      <td className="text-[11.5px] beyu-muted">{s.issuedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                      <td className="text-[11.5px] beyu-muted">{s.expiresAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                    </tr>
                  ))}
                  {elevatedRisk.length === 0 && (
                    <tr><td colSpan={6}><EmptyState message="No session carries an elevated risk score." /></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {lockedUsers.length > 0 && (
              <div className="mt-4">
                <div className="beyu-kicker beyu-muted pb-2">Lockouts in effect</div>
                <div className="space-y-1.5">
                  {lockedUsers.map((u) => (
                    <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px]">
                      <span className="font-medium">{u.email}</span>
                      <span className="beyu-muted">
                        {u.failedAttempts} failed attempts · credential lock {u.lockedUntil && u.lockedUntil > now ? u.lockedUntil.toISOString().slice(0, 16).replace("T", " ") : "—"} · MFA lock {u.mfaLockedUntil && u.mfaLockedUntil > now ? u.mfaLockedUntil.toISOString().slice(0, 16).replace("T", " ") : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          <div className="space-y-5">
            <Panel kicker="Cross-OS trust" title="Service-principal registry">
              <div className="space-y-1.5">
                {principalRows.map((p) => (
                  <div key={p.issuer} className="flex items-center justify-between gap-2 border-b border-[color:var(--beyu-line)] pb-1.5 last:border-none">
                    <span className="font-mono text-[11.5px]">{p.issuer}</span>
                    <Badge tone={stateTone(p.status)}>{p.status}</Badge>
                  </div>
                ))}
                {principalRows.length === 0 && (
                  <EmptyState message={entityScoped ? "Service-principal rows have no legal-entity key, so this entity-scoped grant cannot read the global registry." : "No explicit service-principal rows; issuers remain governed by the static allowlist."} />
                )}
              </div>
              <p className="mt-3 text-[11px] beyu-muted">
                A SUSPENDED or REVOKED row denies that issuer&rsquo;s service tokens on every internal endpoint immediately.
              </p>
            </Panel>

            <Panel kicker="Data handling" title="Classification standard">
              <div className="flex flex-wrap gap-1.5">
                {CLASSIFICATION_ORDER.map((c) => (
                  <Badge key={c} tone={stateTone(c)}>{c}</Badge>
                ))}
              </div>
              <p className="mt-3 text-[11px] beyu-muted">
                Clearance ceilings are enforced in the kernel: a principal reads only what their
                clearance covers, and HIGHLY_RESTRICTED data additionally requires named grants and MFA.
              </p>
            </Panel>
          </div>
        </div>

        <Panel kicker="Consequential acts" title={`High-risk capability catalogue · ${highRiskRows.length} capabilities under MFA step-up`}>
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Capability</th><th>Effect</th><th>MFA</th><th>Risk</th></tr></thead>
              <tbody>
                {highRiskRows.map((p) => (
                  <tr key={p.code}>
                    <td className="font-mono text-[11px]">{p.code}</td>
                    <td className="max-w-xl text-[11.5px]">{PERMISSIONS[p.code as keyof typeof PERMISSIONS] ?? p.description}</td>
                    <td><Badge tone={p.requiresMfa ? "gold" : "slate"}>{p.requiresMfa ? "STEP-UP" : "—"}</Badge></td>
                    <td><Badge tone={p.highRisk ? "red" : "slate"}>{p.highRisk ? "HIGH" : "STANDARD"}</Badge></td>
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
