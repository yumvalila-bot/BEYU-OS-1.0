import { and, desc, inArray, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, tenants, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds, hasGlobalGovernanceScope } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/** The administrative audit surface: canonical actions of this capability. */
const ADMIN_ACTIONS = [
  "USER_REGISTERED",
  "USER_UPDATED",
  "USER_ACTIVATED",
  "USER_SUSPENDED",
  "USER_DEACTIVATED",
  "USER_REMOVED",
  "TENANT_REGISTERED",
  "TENANT_ACTIVATED",
  "TENANT_SUSPENDED",
  "TENANT_DEACTIVATED",
  "TENANT_ARCHIVED",
  "TENANT_REMOVED",
  "MEMBERSHIP_GRANTED",
  "MEMBERSHIP_REVOKED",
  "ROLE_GRANTED",
  "ROLE_REVOKED",
  "ADMIN_DELEGATED",
  "ADMIN_DELEGATION_REVOKED",
] as const;

/**
 * Administration — Administrative audit.
 *
 * A governed READ of the EXISTING immutable, hash-chained audit ledger,
 * filtered to the administrative actions of this capability, inside the RLS
 * tenant scope established for the request. Denials are recorded alongside
 * successes: refusals are part of the governance story.
 */
export default async function AdministrationAuditPage() {
  const access = await requireAccess("audit:log.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="audit:log.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const global = hasGlobalGovernanceScope(principal);

    const [records, tenantRows, userRows] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(
          and(
            inArray(auditLog.action, [...ADMIN_ACTIONS]),
            global ? or(inArray(auditLog.tenantId, scope), isNull(auditLog.tenantId)) : inArray(auditLog.tenantId, scope),
          ),
        )
        .orderBy(desc(auditLog.sequence))
        .limit(150),
      db.select({ id: tenants.id, code: tenants.code }).from(tenants).where(inArray(tenants.id, scope)),
      db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.primaryTenantId, scope)),
    ]);

    const codeByTenant = new Map(tenantRows.map((t) => [t.id, t.code]));
    const emailByUser = new Map(userRows.map((u) => [u.id, u.email]));
    const denied = records.filter((r) => r.outcome === "DENIED").length;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Administration · audit</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Administrative audit trail</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Every governed administrative act — registrations, lifecycle transitions, memberships, role grants,
            delegations — and every refusal, written to the append-only hash-chained ledger in the same
            transaction as the act itself. Nothing here can be edited or deleted.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Administrative records (recent)" value={String(records.length)} sub={`${ADMIN_ACTIONS.length} canonical actions tracked`} />
          <Metric label="Refusals recorded" value={String(denied)} sub="denials are governance signal" tone="gold" />
          <Metric label="Actors" value={String(new Set(records.map((r) => r.actorUserId)).size)} sub="distinct administrators" />
          <Metric label="Scope" value={global ? "Global governance" : "Tenant subtree"} sub="RLS-enforced read boundary" />
        </div>

        <Panel kicker="Immutable ledger" title="Administrative actions (most recent first)">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Tenant</th>
                  <th>Action</th>
                  <th>Object</th>
                  <th>Authority</th>
                  <th>Reason</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular-nums text-[10.5px] beyu-muted">#{r.sequence}</td>
                    <td className="text-[11px] beyu-muted">{r.occurredAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                    <td className="text-[11px]">
                      {r.actorUserId ? (emailByUser.get(r.actorUserId) ?? r.actorUserId) : "system"}
                      <div className="text-[10px] beyu-muted">{r.actorType}</div>
                    </td>
                    <td className="text-[11px] beyu-muted">{r.tenantId ? (codeByTenant.get(r.tenantId) ?? r.tenantId) : "platform"}</td>
                    <td>
                      <span className="rounded border border-[color:var(--beyu-line)] px-1.5 py-[2px] font-mono text-[10px]">{r.action}</span>
                    </td>
                    <td className="text-[11px] beyu-muted">
                      {r.objectType}
                      <div className="font-mono text-[10px]">{r.objectId}</div>
                    </td>
                    <td className="font-mono text-[10px] beyu-muted">{r.authority ?? "—"}</td>
                    <td className="max-w-[240px] text-[11px] beyu-muted">{r.reason ?? "—"}</td>
                    <td>
                      <Badge tone={r.outcome === "SUCCESS" ? "green" : stateTone("REVOKED")}>{r.outcome}</Badge>
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td colSpan={9}>
                      <EmptyState message="No administrative audit records in your scope yet." />
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
