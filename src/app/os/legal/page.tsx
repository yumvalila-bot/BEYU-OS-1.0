import { and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalMatters } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { classificationsAtOrBelow } from "@/lib/constants";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import Link from "next/link";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Legal & Liability — the legal domain as a first-class shared capability.
 *
 * Legal matters already exist (assurance.legal_matters) and are also
 * summarised on the Assurance overview behind the same capability. This
 * focused surface presents the legal domain itself under legal:matter.read.
 * The constitutional rule is carried onto the surface: no AI-generated legal
 * conclusion is binding without authorised human legal governance.
 */
export default async function LegalPage() {
  const access = await requireAccess("legal:matter.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="legal:matter.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

    const scope = await tenantScopeIds(access.principal);
    const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
    const matterPredicate =
      access.principal.entityScope.length > 0
        ? and(
            inArray(legalMatters.tenantId, scope),
            inArray(legalMatters.legalEntityId, access.principal.entityScope),
            inArray(legalMatters.classification, allowedClassifications),
          )
        : and(
            inArray(legalMatters.tenantId, scope),
            inArray(legalMatters.classification, allowedClassifications),
          );
    const legalRows = await db.select().from(legalMatters).where(matterPredicate);

    const open = legalRows.filter((l) => l.status === "OPEN" || l.status === "IN_REVIEW");
    const withDeadline = legalRows.filter((l) => l.keyDeadline && l.keyDeadline < new Date().toISOString().slice(0, 10));
    const exposureByCurrency = new Map<string, number>();
    for (const l of legalRows) {
      if (l.exposureAmount) {
        exposureByCurrency.set(l.currency, (exposureByCurrency.get(l.currency) ?? 0) + Number(l.exposureAmount));
      }
    }
    const byType = new Map<string, number>();
    for (const l of legalRows) byType.set(l.matterType, (byType.get(l.matterType) ?? 0) + 1);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Legal &amp; liability · shared capability</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Matters, obligations and exposure</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            One legal register: matters, counterparties, obligations and quantified exposure, every one
            owned by a human with legal authority. No AI-generated legal conclusion is binding without
            authorised human legal governance.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Legal matters" value={String(legalRows.length)} sub={`${open.length} open or in review`} />
          <Metric label="Matter types" value={String(byType.size)} sub={[...byType.entries()].slice(0, 3).map(([t, n]) => `${t}:${n}`).join(" · ") || "—"} />
          <Metric label="Deadlines passed" value={String(withDeadline.length)} sub="key deadline before today" tone={withDeadline.length > 0 ? "gold" : "navy"} />
          <Metric
            label="Quantified exposure"
            value={exposureByCurrency.size ? [...exposureByCurrency.entries()].map(([c, v]) => money(v, c)).join(" · ") : "—"}
            sub="recorded, never summed across currencies"
          />
        </div>

        <Panel kicker="Legal register" title="Every matter carries an accountable owner">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Matter</th><th>Type</th><th>Counterparty</th><th>Exposure</th><th>Deadline</th><th>Status</th></tr></thead>
              <tbody>
                {legalRows.map((l) => (
                  <tr key={l.id}>
                    <td><div className="font-medium">{l.title}</div><div className="max-w-md text-[11px] beyu-muted">{l.obligationSummary}</div></td>
                    <td><Badge tone="navy">{l.matterType}</Badge></td>
                    <td className="text-[11.5px]">{l.counterparty ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{l.exposureAmount ? money(l.exposureAmount, l.currency) : "—"}</td>
                    <td className="text-[11.5px] beyu-muted">{l.keyDeadline ?? "—"}</td>
                    <td><Badge tone={stateTone(l.status)}>{l.status}</Badge></td>
                  </tr>
                ))}
                {legalRows.length === 0 && <tr><td colSpan={6}><EmptyState message="No legal matters recorded in your scope." /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11.5px] beyu-muted">
            Governed contracting obligations and disputes are administered through the contracts domain;
            compliance obligations sit under{" "}
            <Link href="/os/compliance" className="font-semibold text-[#b08d1c]">Compliance</Link>, and anomaly
            evidence under the <Link href="/os/assurance" className="font-semibold text-[#b08d1c]">Assurance overview</Link>.
          </p>
        </Panel>
      </div>
    );
  });
}
