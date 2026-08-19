import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { legalEntities, taxStrategies } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, Panel, stateTone } from "@/components/brand";
import { TaxWorkbench } from "./workbench";

export const dynamic = "force-dynamic";

const POSITION_TONE: Record<string, string> = {
  LEGAL_TAX_PLANNING: "green",
  LAWFUL_AVOIDANCE: "navy",
  AGGRESSIVE_UNCERTAIN: "amber",
  PROHIBITED_EVASION: "red",
};

export default async function TaxPage() {
  const access = await requireAccess("finance:tax.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="finance:tax.read" />;

  // H-NEW-1: legal entities are tenant-scoped data and must never be enumerated
  // globally. Scope is derived from the authenticated principal via the canonical
  // tenant-scope helper, then narrowed further by the principal's ABAC entity scope.
  const scope = await tenantScopeIds(access.principal);
  const [strategies, scopedEntities] = await Promise.all([
    db.select().from(taxStrategies).orderBy(taxStrategies.jurisdictionCode),
    db.select().from(legalEntities).where(inArray(legalEntities.tenantId, scope)),
  ]);
  const entities =
    access.principal.entityScope.length > 0
      ? scopedEntities.filter((e) => access.principal.entityScope.includes(e.id))
      : scopedEntities;
  const canAssess = can(access.principal, "finance:tax.assess").allowed;
  const assessable = strategies.filter((s) => s.position !== "PROHIBITED_EVASION");

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Finance OS · tax strategy intelligence</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Legal tax intelligence, governance & knowledge graph</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          The engine determines whether a lawful strategy exists for a specific taxpayer in a specific
          jurisdiction — with legal basis, eligibility, documentation, economic effect, risk, required
          approvals and evidence. It distinguishes legal planning, lawful avoidance and aggressive or
          uncertain positions, and hard-blocks unlawful evasion.
        </p>
      </header>

      <TaxWorkbench
        canAssess={canAssess}
        strategies={assessable.map((s) => ({ id: s.id, code: s.code, title: s.title, jurisdiction: s.jurisdictionCode, position: s.position }))}
        entities={entities.map((e) => ({ id: e.id, name: e.legalName, country: e.countryCode }))}
      />

      <Panel kicker="Knowledge graph" title="Registered tax positions with provenance and legal authority">
        <div className="space-y-4">
          {strategies.map((s) => (
            <details key={s.id} className="rounded-lg border border-[color:var(--beyu-line)] p-4">
              <summary className="cursor-pointer">
                <span className="text-[13.5px] font-semibold">{s.title}</span>{" "}
                <Badge tone={POSITION_TONE[s.position] ?? "slate"}>{s.position.replaceAll("_", " ")}</Badge>{" "}
                <Badge tone="navy">{s.jurisdictionCode}</Badge>{" "}
                <Badge tone={stateTone(s.authorityStatus)}>{s.authorityStatus}</Badge>
                <div className="mt-1 font-mono text-[10.5px] beyu-muted">{s.code} · {s.statutoryReference}</div>
              </summary>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="space-y-2 text-[11.5px]">
                  <div><span className="beyu-kicker beyu-muted">Legal basis </span>{s.legalBasis}</div>
                  <div><span className="beyu-kicker beyu-muted">Economic benefit </span>{s.economicBenefitBasis}{s.benefitRate ? ` (indicative ${(Number(s.benefitRate) * 100).toFixed(2)}% of base)` : ""}</div>
                  <div><span className="beyu-kicker beyu-muted">Tax effect </span>{s.taxEffect}</div>
                  <div><span className="beyu-kicker beyu-muted">Cash-flow effect </span>{s.cashflowEffect}</div>
                  <div><span className="beyu-kicker beyu-muted">Accounting effect </span>{s.accountingEffect}</div>
                  <div><span className="beyu-kicker beyu-muted">Provenance </span>{s.provenanceSource}</div>
                  <div><span className="beyu-kicker beyu-muted">Effective </span>{s.effectiveFrom} → {s.effectiveTo ?? "open"} · review {s.reviewDate}</div>
                </div>
                <div className="space-y-2 text-[11.5px]">
                  <div>
                    <span className="beyu-kicker beyu-muted">Eligibility criteria</span>
                    <ul className="mt-1 space-y-0.5">
                      {s.eligibilityCriteria.map((c) => (
                        <li key={c.key}>
                          • {c.label} <span className="beyu-muted">({c.operator} {String(Array.isArray(c.value) ? c.value.join("/") : c.value)}{c.mandatory ? ", mandatory" : ", optional"})</span>
                        </li>
                      ))}
                      {s.eligibilityCriteria.length === 0 && <li className="beyu-muted">— none (position not assessable)</li>}
                    </ul>
                  </div>
                  <div><span className="beyu-kicker beyu-muted">Documentation </span>{s.documentationRequirements.join(" · ") || "—"}</div>
                  <div><span className="beyu-kicker beyu-muted">Implementation </span>{s.implementationSteps.join(" → ") || "—"}</div>
                  <div><span className="beyu-kicker beyu-muted">Approvals </span>{s.requiredApprovals.join(", ") || "—"}</div>
                  <div><span className="beyu-kicker beyu-muted">Alternatives </span>{s.alternatives.join(" · ") || "—"}</div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Badge tone="slate">compliance risk {s.complianceRisk}/5</Badge>
                    <Badge tone="slate">audit risk {s.auditRisk}/5</Badge>
                    <Badge tone="slate">legal risk {s.legalRisk}/5</Badge>
                    <Badge tone="slate">reputational {s.reputationalRisk}/5</Badge>
                  </div>
                </div>
              </div>

              {s.position === "PROHIBITED_EVASION" && (
                <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11.5px] text-rose-700 dark:text-rose-300">
                  Registered solely so the engine can hard-block it. BEYU OS will never recommend, model or
                  facilitate unlawful evasion (Constitution Article 12).
                </div>
              )}
            </details>
          ))}
        </div>
      </Panel>
    </div>
  );
}
