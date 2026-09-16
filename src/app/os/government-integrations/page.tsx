import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governmentAgencies, governmentSubmissions, legalEntities } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { classificationsAtOrBelow } from "@/lib/constants";
import { tenantScopeIds, withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function GovernmentIntegrationsPage() {
  const access = await requireAccess("government:integration.read", {
    classification: "CONFIDENTIAL",
  });
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="government:integration.read" />;
  }

  return withTenantDatabaseContext(access.principal, async () => {
    const tenantIds = await tenantScopeIds(access.principal);
    const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
    const [agencies, submissions] = await Promise.all([
      db.select().from(governmentAgencies).orderBy(governmentAgencies.countryCode, governmentAgencies.code),
      db
        .select({
          id: governmentSubmissions.id,
          legalEntityId: governmentSubmissions.legalEntityId,
          agencyCode: governmentSubmissions.agencyCode,
          submissionType: governmentSubmissions.submissionType,
          status: governmentSubmissions.status,
          externalReference: governmentSubmissions.externalReference,
          attemptCount: governmentSubmissions.attemptCount,
          lastErrorCode: governmentSubmissions.lastErrorCode,
          createdAt: governmentSubmissions.createdAt,
        })
        .from(governmentSubmissions)
        .innerJoin(
          legalEntities,
          and(
            eq(legalEntities.id, governmentSubmissions.legalEntityId),
            eq(legalEntities.tenantId, governmentSubmissions.tenantId),
            inArray(legalEntities.classification, allowedClassifications),
          ),
        )
        .where(
          and(
            inArray(governmentSubmissions.tenantId, tenantIds),
            ...(access.principal.entityScope.length > 0
              ? [inArray(governmentSubmissions.legalEntityId, access.principal.entityScope)]
              : []),
          ),
        )
        .orderBy(desc(governmentSubmissions.createdAt))
        .limit(100),
    ]);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Shared capability · Government Integration Fabric</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Government Integrations</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One governed gateway for tax, identity, health, registration, social-security and regulatory
            submissions. Status fields report separate verified facts; no single “integrated” claim is invented.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Agency records" value={String(agencies.length)} sub="global governed registry" tone="gold" />
          <Metric label="Production ready / live" value={String(agencies.filter((row) => ["PRODUCTION_READY", "LIVE"].includes(row.integrationStatus)).length)} sub="only with recorded evidence" />
          <Metric label="Submissions" value={String(submissions.length)} sub="visible tenant and entity scope" />
          <Metric label="Needs attention" value={String(submissions.filter((row) => ["FAILED", "RETRY_REQUIRED", "RECONCILIATION_REQUIRED", "EXTERNAL_BLOCKED"].includes(row.status)).length)} sub="external state is never fabricated" />
        </div>

        <Panel kicker="Canonical registry" title="Government agencies and interfaces">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Agency</th><th>Country</th><th>Consumers</th><th>Integration</th><th>Interface</th><th>Credentials</th><th>Blocker</th></tr></thead>
              <tbody>
                {agencies.map((row) => (
                  <tr key={row.code}>
                    <td><div className="font-medium">{row.name}</div><div className="font-mono text-[10.5px] beyu-muted">{row.code}</div></td>
                    <td className="text-[11.5px]">{row.countryCode}</td>
                    <td className="text-[11.5px]">{row.consumers.join(", ") || "—"}</td>
                    <td><Badge tone={stateTone(row.integrationStatus)}>{row.integrationStatus}</Badge></td>
                    <td className="text-[11.5px]">{row.interfaceKind}</td>
                    <td><Badge tone={stateTone(row.credentialStatus)}>{row.credentialStatus}</Badge></td>
                    <td className="max-w-xs text-[11.5px] beyu-muted">{row.blockedReason ?? "—"}</td>
                  </tr>
                ))}
                {agencies.length === 0 && <tr><td colSpan={7}><EmptyState message="No government agency records are registered." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Governed trace" title="Submission records">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Created</th><th>Agency</th><th>Type</th><th>Status</th><th>Attempts</th><th>External reference</th><th>Last error</th></tr></thead>
              <tbody>
                {submissions.map((row) => (
                  <tr key={row.id}>
                    <td className="tabular-nums text-[11.5px]">{row.createdAt.toISOString().slice(0, 10)}</td>
                    <td className="font-mono text-[11px]">{row.agencyCode}</td>
                    <td className="text-[11.5px]">{row.submissionType}</td>
                    <td><Badge tone={stateTone(row.status)}>{row.status}</Badge></td>
                    <td className="tabular-nums">{row.attemptCount}</td>
                    <td className="font-mono text-[10.5px]">{row.externalReference ?? "—"}</td>
                    <td className="text-[11.5px]">{row.lastErrorCode ?? "—"}</td>
                  </tr>
                ))}
                {submissions.length === 0 && <tr><td colSpan={7}><EmptyState message="No government submissions are visible within this scope." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
