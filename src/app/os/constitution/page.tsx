import { db } from "@/db";
import { constitutionArticles, policies, workflows } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { Badge, Denied, Panel, stateTone } from "@/components/brand";
import { POLICY_LEVEL_ORDER } from "@/lib/policy";

export const dynamic = "force-dynamic";

export default async function ConstitutionPage() {
  const access = await requireAccess("governance:policy.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="governance:policy.read" />;

  const [articles, policyRows, workflowRows] = await Promise.all([
    db.select().from(constitutionArticles).orderBy(constitutionArticles.articleNo),
    db.select().from(policies).orderBy(policies.level),
    db.select().from(workflows),
  ]);

  const ordered = [...policyRows].sort(
    (a, b) => POLICY_LEVEL_ORDER.indexOf(a.level) - POLICY_LEVEL_ORDER.indexOf(b.level),
  );

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Constitutional layer</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">BEYU OS Constitution & Policy Hierarchy</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          The Constitution is the highest authority in the ecosystem. Policies inherit from it and may
          never weaken a higher level: CONSTITUTION → ENTERPRISE → DOMAIN → SECTOR → ENTITY → TENANT →
          WORKFLOW RULE → TRANSACTION CONTROL.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {articles.map((a) => (
          <Panel key={a.id} kicker={`Article ${a.articleNo} · ${a.domain}`} title={a.title}>
            <p className="text-[12.5px] leading-relaxed">{a.body}</p>
            <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
              <div className="beyu-kicker beyu-muted">Authority</div>
              <div className="mt-1 text-[11.5px]">{a.authorityStatement}</div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] beyu-muted">
              <Badge tone={stateTone(a.status)}>{a.status}</Badge>
              <span>v{a.version}</span>
              <span>· effective {a.effectiveFrom}</span>
            </div>
          </Panel>
        ))}
      </div>

      <Panel kicker="Policy engine" title="Machine-readable policy hierarchy">
        <div className="overflow-x-auto">
          <table className="beyu-table">
            <thead>
              <tr>
                <th>Level</th>
                <th>Code</th>
                <th>Title</th>
                <th>Scope</th>
                <th>Rules (effect · action)</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((p) => (
                <tr key={p.id}>
                  <td><Badge tone={p.level === "CONSTITUTION" ? "gold" : "navy"}>{p.level}</Badge></td>
                  <td className="font-mono text-[11.5px]">{p.code}@{p.version}</td>
                  <td>
                    <div className="font-medium">{p.title}</div>
                    <div className="mt-0.5 max-w-xl text-[11.5px] beyu-muted">{p.body}</div>
                  </td>
                  <td className="text-[11.5px] beyu-muted">
                    {p.domain}
                    {p.jurisdictionCode ? ` · ${p.jurisdictionCode}` : " · all jurisdictions"}
                    <div>owner {p.ownerRole}</div>
                  </td>
                  <td>
                    <div className="space-y-1">
                      {(p.rules ?? []).map((r) => (
                        <div key={r.id} className="text-[11.5px]">
                          <Badge tone={r.effect === "DENY" ? "red" : r.effect === "ALLOW" ? "green" : "amber"}>{r.effect}</Badge>{" "}
                          <span className="font-mono">{r.action}</span>
                          <div className="beyu-muted">{r.message}</div>
                        </div>
                      ))}
                      {(p.rules ?? []).length === 0 && <span className="beyu-muted text-[11.5px]">narrative policy</span>}
                    </div>
                  </td>
                  <td><Badge tone={stateTone(p.status)}>{p.status}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel kicker="Workflow engine" title="Policy-aware workflow definitions">
        <div className="grid gap-4 lg:grid-cols-3">
          {workflowRows.map((w) => (
            <div key={w.id} className="rounded-lg border border-[color:var(--beyu-line)] p-4">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold">{w.name}</span>
                <Badge tone={stateTone(w.status)}>{w.status}</Badge>
              </div>
              <div className="mt-0.5 font-mono text-[11px] beyu-muted">{w.code}@{w.version}</div>
              <ol className="mt-3 space-y-2">
                {(w.definition ?? []).map((step) => (
                  <li key={step.step} className="text-[11.5px]">
                    <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[#0b1d3a] text-[9px] font-bold text-white">
                      {step.step}
                    </span>
                    <span className="font-medium">{step.name}</span>
                    <div className="ml-6 beyu-muted">
                      {step.type} · {step.role} · SLA {step.slaHours}h
                      {step.escalateToRole ? ` · escalates to ${step.escalateToRole}` : ""}
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
