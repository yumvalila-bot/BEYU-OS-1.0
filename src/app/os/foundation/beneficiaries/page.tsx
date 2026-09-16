import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { listBeneficiaries } from "@/lib/foundation/service-operations";

export const dynamic = "force-dynamic";

export default async function FoundationBeneficiariesPage() {
  const access = await requireAccess("foundation:beneficiary.read", {
    classification: "RESTRICTED",
  });
  if (!access.allowed) {
    return <Denied reason={access.reason} capability="foundation:beneficiary.read" />;
  }

  return withTenantDatabaseContext(access.principal, async () => {
    const beneficiaries = await listBeneficiaries(access.principal);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Foundation OS · Beneficiaries</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Beneficiary Register</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            A minimised, restricted register for eligibility, consent and safeguarding posture. It does not
            duplicate canonical identity records or expose unnecessary personal data.
          </p>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Beneficiaries" value={String(beneficiaries.length)} sub="restricted records in scope" tone="gold" />
          <Metric label="Eligible" value={String(beneficiaries.filter((row) => row.eligibilityStatus === "ELIGIBLE").length)} sub="eligibility recorded" />
          <Metric label="Consent recorded" value={String(beneficiaries.filter((row) => row.consentStatus === "GRANTED").length)} sub="purpose-bound consent" />
          <Metric label="Safeguarding flags" value={String(beneficiaries.filter((row) => row.safeguardingFlag).length)} sub="review in protected casework" />
        </div>

        <Panel kicker="Minimised register" title="Beneficiaries in scope">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Cohort</th>
                  <th>Eligibility</th>
                  <th>Consent</th>
                  <th>Safeguarding</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {beneficiaries.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11px]">{row.code}</td>
                    <td className="text-[11.5px]">{row.cohort ?? "—"}</td>
                    <td><Badge tone={stateTone(row.eligibilityStatus)}>{row.eligibilityStatus}</Badge></td>
                    <td><Badge tone={stateTone(row.consentStatus)}>{row.consentStatus}</Badge></td>
                    <td><Badge tone={row.safeguardingFlag ? "red" : "green"}>{row.safeguardingFlag ? "FLAGGED" : "CLEAR"}</Badge></td>
                    <td><Badge tone={stateTone(row.status)}>{row.status}</Badge></td>
                  </tr>
                ))}
                {beneficiaries.length === 0 && (
                  <tr><td colSpan={6}><EmptyState message="No beneficiary records are available within this scope." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
