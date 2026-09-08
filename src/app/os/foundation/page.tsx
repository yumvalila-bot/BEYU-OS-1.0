import Link from "next/link";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listFoundations } from "@/lib/foundation/service";
import { complianceDashboard, deadlinesMissingEvidence, listDeadlines } from "@/lib/foundation/compliance";
import { listFunds } from "@/lib/foundation/service";
import { listDonations, listGrants } from "@/lib/foundation/service";
import { listPrograms } from "@/lib/foundation/service-operations";
import { deadlineHealth } from "@/lib/foundation/deadlines";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/os/foundation/registry", title: "Foundation Registry", desc: "Lifecycle, jurisdiction, tax status" },
  { href: "/os/foundation/formation", title: "Start a Foundation", desc: "Guided formation workflow" },
  { href: "/os/foundation/structures", title: "Structure & Simulator", desc: "Design and what-if analysis" },
  { href: "/os/foundation/governance", title: "Governance", desc: "Meetings, conflicts, fiduciary duties" },
  { href: "/os/foundation/tax", title: "Tax Intelligence", desc: "Rules, profiles, assessments" },
  { href: "/os/foundation/compliance", title: "Compliance Center", desc: "Deadlines, tasks, escalation" },
  { href: "/os/foundation/donors", title: "Donors", desc: "Profiles, donations, pledges" },
  { href: "/os/foundation/funds", title: "Funds & Finance", desc: "Funds, allocations, capital" },
  { href: "/os/foundation/grants", title: "Grants", desc: "Grantees, awards, disbursements" },
  { href: "/os/foundation/programs", title: "Programs & Impact", desc: "Programs, projects, outcomes" },
  { href: "/os/foundation/operations", title: "Operations", desc: "Procurement, assets, investments" },
  { href: "/os/foundation/safeguarding", title: "Safeguarding", desc: "Protected casework" },
];

export default async function FoundationPage() {
  const access = await requireAccess("foundation:registry.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="foundation:registry.read" />;
  return withTenantDatabaseContext(access.principal, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [foundationRows, dashboard, missingEvidence, fundRows, donationRows, grantRows, programRows, deadlineRows] =
      await Promise.all([
        listFoundations(access.principal),
        complianceDashboard(access.principal, today),
        deadlinesMissingEvidence(access.principal),
        listFunds(access.principal),
        listDonations(access.principal),
        listGrants(access.principal),
        listPrograms(access.principal),
        listDeadlines(access.principal),
      ]);

    const fundBalance = fundRows.reduce((a, f) => a + Number(f.balance), 0);
    const donationsTotal = donationRows.reduce((a, d) => a + Number(d.amount), 0);
    const upcoming = deadlineRows
      .filter((d) => !["COMPLETED", "VERIFIED", "WAIVED"].includes(d.status))
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
      .slice(0, 6);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS — one institutional OS under BEYU OS</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Foundation Executive Dashboard</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Foundations, formation, governance, tax, timely compliance, donors, funds, grants, programs and
            impact — consuming canonical BEYU OS identity, HCM, governance, audit and Finance OS, with
            Noelia on HIVE as the single AI identity.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Foundations" value={String(foundationRows.length)} sub={`${foundationRows.filter((f) => f.status === "ACTIVE").length} active`} tone="gold" />
          <Metric label="Fund balance" value={money(fundBalance, "USD")} sub={`${fundRows.length} funds`} />
          <Metric label="Donations recorded" value={money(donationsTotal, "USD")} sub={`${donationRows.length} donations`} />
          <Metric label="Compliance health" value={dashboard.overdueCount === 0 ? "On track" : `${dashboard.overdueCount} overdue`} sub={`${dashboard.health.DUE_TODAY} due today · ${dashboard.health.AT_RISK} at risk`} tone={dashboard.overdueCount === 0 ? undefined : "red"} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Grants" value={String(grantRows.length)} sub={`${grantRows.filter((g) => g.status === "APPROVAL").length} awaiting approval`} />
          <Metric label="Programs" value={String(programRows.length)} sub={`${programRows.reduce((a, p) => a + p.beneficiariesReached, 0).toLocaleString()} beneficiaries reached`} />
          <Metric label="Open escalations" value={String(dashboard.openEscalations)} sub="acknowledge in Compliance Center" />
          <Metric label="Evidence missing" value={String(missingEvidence.length)} sub="deadlines blocked on evidence" />
        </div>

        <Panel kicker="Attention" title="Next deadlines">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Due</th><th>Health</th><th>Status</th><th>Period</th><th>Obligation</th></tr></thead>
              <tbody>
                {upcoming.map((d) => {
                  const h = d.status === "OVERDUE" ? "OVERDUE" : deadlineHealth(d.dueDate, today);
                  return (
                    <tr key={d.id}>
                      <td className="tabular-nums">{d.dueDate}</td>
                      <td><Badge tone={stateTone(h)}>{h}</Badge></td>
                      <td><Badge tone={stateTone(d.status)}>{d.status}</Badge></td>
                      <td className="text-[11.5px]">{d.periodLabel ?? "—"}</td>
                      <td className="font-mono text-[10.5px] beyu-muted">{d.obligationId.slice(0, 18)}…</td>
                    </tr>
                  );
                })}
                {upcoming.length === 0 && <tr><td colSpan={5}><EmptyState message="No open deadlines." /></td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Workspace" title="Foundation OS areas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {SECTIONS.map((s) => (
              <Link key={s.href} href={s.href} className="rounded-xl border border-[color:var(--beyu-line)] p-4 transition hover:border-[#b08d1c]">
                <div className="text-[13.5px] font-semibold">{s.title}</div>
                <div className="mt-0.5 text-[11.5px] beyu-muted">{s.desc}</div>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    );
  });
}
