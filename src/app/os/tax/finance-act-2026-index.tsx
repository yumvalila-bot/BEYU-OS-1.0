import { Badge, Panel } from "@/components/brand";
import { getFinanceAct2026ChangesByDomain } from "@/lib/finance/finance-act-2026-amendment-index";

const DOMAIN_LABEL: Record<string, string> = {
  INCOME_TAX: "Income Tax Act",
  TAX_ADMINISTRATION: "Tax Administration Act",
  VAT: "Value Added Tax Act",
  EXCISE: "Excise (Management and Tariff) Act",
  CUSTOMS_AND_IMPORTS: "Imports Control Act",
};

/**
 * Selected amendment index from the enacted Finance Act 2026.
 * Informational only: not consolidated law and not an executable tax-rule set.
 */
export function FinanceAct2026AmendmentIndex() {
  const groups = getFinanceAct2026ChangesByDomain();
  const total = groups.reduce((sum, group) => sum + group.changes.length, 0);

  return (
    <Panel kicker="Enacted legislation · impact index" title="Finance Act No. 2 of 2026 · selected tax amendments">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="green">Enactment 25 Jun 2026</Badge>
          <Badge tone="amber">Specialist review required</Badge>
          <Badge tone="slate">{total} indexed amendments</Badge>
          <Badge tone="slate">No tax rules activated</Badge>
        </div>
        <p className="text-[11px] beyu-muted">
          This is a provision-level navigation index of selected amendments in the enacted Act.
          It is not a consolidated version of the principal Acts, a complete legislative digest,
          a tax-rate engine or filing advice. Every item remains blocked from operational use
          until the amended principal law, subsidiary instruments and taxpayer facts are reviewed.
        </p>
        {groups.map((group) => (
          <details key={group.domain} className="rounded-lg border border-[color:var(--beyu-line)] p-3">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-[12px] font-semibold">
              <span>{DOMAIN_LABEL[group.domain] ?? group.domain}</span>
              <span className="font-mono text-[10px] beyu-muted">{group.changes.length} provisions</span>
            </summary>
            <div className="mt-3 space-y-3">
              {group.changes.map((change) => (
                <article key={change.code} className="border-t border-[color:var(--beyu-line)] pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold">{change.principalProvision}</span>
                    <Badge tone="amber">Review required</Badge>
                    <Badge tone="slate">Index only</Badge>
                  </div>
                  <p className="mt-1 text-[11px]">{change.summary}</p>
                  <div className="mt-1 text-[9.5px] beyu-muted">
                    {change.financeActProvision} · {change.sourcePages}
                  </div>
                  <p className="mt-1 text-[9.5px] beyu-muted">{change.caveat}</p>
                </article>
              ))}
            </div>
          </details>
        ))}
        <p className="text-[10px] beyu-muted">
          Primary source: Office of the Attorney General, Finance Act No. 2 of 2026.
          NOELIA may retrieve this index as explanatory metadata only; it cannot approve,
          file, calculate or post a tax position from it.
        </p>
      </div>
    </Panel>
  );
}
