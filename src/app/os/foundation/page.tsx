import Link from "next/link";
import { requirePrincipal } from "@/lib/guard";
import { can } from "@/lib/authz";
import { Icon, type IconName } from "@/components/icons";
import type { Classification, PermissionCode } from "@/lib/constants";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, money, stateTone } from "@/components/brand";
import { listFoundations } from "@/lib/foundation/service";
import { complianceDashboard, deadlinesMissingEvidence, listDeadlines } from "@/lib/foundation/compliance";
import { listFunds } from "@/lib/foundation/service";
import { listDonations, listGrants } from "@/lib/foundation/service";
import { listPrograms } from "@/lib/foundation/service-operations";
import { deadlineHealth } from "@/lib/foundation/deadlines";

export const dynamic = "force-dynamic";

type FoundationSection = {
  href: string;
  title: string;
  desc: string;
  icon: IconName;
  permission: PermissionCode;
  alternateAccess?: Array<{ permission: PermissionCode; classification: Classification }>;
  classification: Classification;
};

const SECTIONS: FoundationSection[] = [
  { href: "/os/foundation/registry", title: "Foundation Registry", desc: "Lifecycle, jurisdiction, tax status", icon: "registry", permission: "foundation:registry.read", classification: "CONFIDENTIAL" },
  { href: "/os/foundation/formation", title: "Start a Foundation", desc: "Guided formation workflow", icon: "workflow", permission: "foundation:formation.read", classification: "CONFIDENTIAL" },
  { href: "/os/foundation/structures", title: "Structure & Simulator", desc: "Design and what-if analysis", icon: "hierarchy", permission: "foundation:structure.read", classification: "CONFIDENTIAL" },
  { href: "/os/foundation/governance", title: "Governance", desc: "Meetings, conflicts, fiduciary duties", icon: "governance", permission: "foundation:governance.read", classification: "RESTRICTED" },
  { href: "/os/foundation/tax", title: "Tax Intelligence", desc: "Rules, profiles, assessments", icon: "tax", permission: "foundation:tax.read", classification: "RESTRICTED" },
  { href: "/os/foundation/compliance", title: "Compliance Center", desc: "Deadlines, tasks, escalation", icon: "compliance", permission: "foundation:compliance.read", classification: "CONFIDENTIAL" },
  { href: "/os/foundation/donors", title: "Donors", desc: "Profiles, donations, pledges", icon: "identity", permission: "foundation:donor.read", classification: "RESTRICTED" },
  { href: "/os/foundation/funds", title: "Funds & Finance", desc: "Funds, allocations, capital", icon: "capital", permission: "foundation:fund.read", classification: "RESTRICTED" },
  { href: "/os/foundation/grants", title: "Grants", desc: "Grantees, awards, disbursements", icon: "documents", permission: "foundation:grant.read", classification: "RESTRICTED" },
  { href: "/os/foundation/programs", title: "Programs & Impact", desc: "Programs, projects, outcomes", icon: "foundation", permission: "foundation:program.read", classification: "CONFIDENTIAL", alternateAccess: [{ permission: "foundation:impact.read", classification: "CONFIDENTIAL" }] },
  { href: "/os/foundation/beneficiaries", title: "Beneficiaries", desc: "Minimised eligibility, consent and safeguarding posture", icon: "identity", permission: "foundation:beneficiary.read", classification: "RESTRICTED" },
  { href: "/os/foundation/operations", title: "Operations", desc: "Procurement, assets, investments", icon: "org", permission: "foundation:procurement.read", classification: "CONFIDENTIAL", alternateAccess: [
    { permission: "foundation:asset.read", classification: "CONFIDENTIAL" },
    { permission: "foundation:investment.read", classification: "RESTRICTED" },
    { permission: "foundation:assignment.read", classification: "CONFIDENTIAL" },
  ] },
  { href: "/os/foundation/safeguarding", title: "Safeguarding", desc: "Protected casework", icon: "security", permission: "foundation:safeguarding.read", classification: "HIGHLY_RESTRICTED" },
];

export default async function FoundationPage() {
  const principal = await requirePrincipal();
  const may = (permission: PermissionCode, classification: Classification) =>
    can(principal, permission, { classification }).allowed;
  const hasWorkspace = SECTIONS.some(
    (section) =>
      may(section.permission, section.classification) ||
      section.alternateAccess?.some((requirement) =>
        may(requirement.permission, requirement.classification),
      ),
  );
  if (!hasWorkspace) {
    return <Denied reason="No Foundation OS read capability is authorized" capability="foundation:registry.read" />;
  }

  return withTenantDatabaseContext(principal, async () => {
    const today = new Date().toISOString().slice(0, 10);
    const capabilities = {
      registry: may("foundation:registry.read", "CONFIDENTIAL"),
      compliance: may("foundation:compliance.read", "CONFIDENTIAL"),
      funds: may("foundation:fund.read", "RESTRICTED"),
      donations: may("foundation:donor.read", "RESTRICTED"),
      grants: may("foundation:grant.read", "RESTRICTED"),
      programs: may("foundation:program.read", "CONFIDENTIAL"),
    };

    // Dashboard datasets remain independently authorized. Possession of the
    // registry permission cannot reveal adjacent Foundation capabilities.
    const [foundationRows, dashboard, missingEvidence, fundRows, donationRows, grantRows, programRows, deadlineRows] =
      await Promise.all([
        capabilities.registry ? listFoundations(principal) : Promise.resolve([]),
        capabilities.compliance ? complianceDashboard(principal, today) : Promise.resolve(null),
        capabilities.compliance ? deadlinesMissingEvidence(principal) : Promise.resolve([]),
        capabilities.funds ? listFunds(principal) : Promise.resolve([]),
        capabilities.donations ? listDonations(principal) : Promise.resolve([]),
        capabilities.grants ? listGrants(principal) : Promise.resolve([]),
        capabilities.programs ? listPrograms(principal) : Promise.resolve([]),
        capabilities.compliance ? listDeadlines(principal) : Promise.resolve([]),
      ]);

    const visibleSections = SECTIONS.filter(
      (section) =>
        may(section.permission, section.classification) ||
        section.alternateAccess?.some((requirement) =>
          may(requirement.permission, requirement.classification),
        ),
    );
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
          {capabilities.registry && <Metric label="Foundations" value={String(foundationRows.length)} sub={`${foundationRows.filter((f) => f.status === "ACTIVE").length} active`} tone="gold" />}
          {capabilities.funds && <Metric label="Fund balance" value={money(fundBalance, "USD")} sub={`${fundRows.length} funds`} />}
          {capabilities.donations && <Metric label="Donations recorded" value={money(donationsTotal, "USD")} sub={`${donationRows.length} donations`} />}
          {dashboard && <Metric label="Compliance health" value={dashboard.overdueCount === 0 ? "On track" : `${dashboard.overdueCount} overdue`} sub={`${dashboard.health.DUE_TODAY} due today · ${dashboard.health.AT_RISK} at risk`} tone={dashboard.overdueCount === 0 ? undefined : "red"} />}
          {capabilities.grants && <Metric label="Grants" value={String(grantRows.length)} sub={`${grantRows.filter((g) => g.status === "APPROVAL").length} awaiting approval`} />}
          {capabilities.programs && <Metric label="Programs" value={String(programRows.length)} sub={`${programRows.reduce((a, p) => a + p.beneficiariesReached, 0).toLocaleString()} beneficiaries reached`} />}
          {dashboard && <Metric label="Open escalations" value={String(dashboard.openEscalations)} sub="acknowledge in Compliance Center" />}
          {dashboard && <Metric label="Evidence missing" value={String(missingEvidence.length)} sub="deadlines blocked on evidence" />}
        </div>

        {capabilities.compliance && <Panel kicker="Attention" title="Next deadlines">
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
        </Panel>}

        <Panel kicker="Workspace" title="Foundation OS areas">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleSections.map((section) => (
              <Link key={section.href} href={section.href} className="group rounded-xl border border-[color:var(--beyu-line)] p-4 transition hover:border-[#b08d1c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A017]">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#0B1F4D]/8 text-[#0B1F4D] dark:bg-white/10 dark:text-[#D4A017]" aria-hidden="true">
                    <Icon name={section.icon} className="h-[18px] w-[18px]" />
                  </span>
                  <span>
                    <span className="block text-[13.5px] font-semibold">{section.title}</span>
                    <span className="mt-0.5 block text-[11.5px] beyu-muted">{section.desc}</span>
                  </span>
                </div>
              </Link>
            ))}
            {visibleSections.length === 0 && <EmptyState message="No Foundation OS areas are available within your authorized scope." />}
          </div>
        </Panel>
      </div>
    );
  });
}
