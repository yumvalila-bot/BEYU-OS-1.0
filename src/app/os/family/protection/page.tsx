import Link from "next/link";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { FamilyTrustLogo } from "@/components/family-trust-logo";
import { protectionSummary, listPolicies, familyView } from "@/lib/family-office-protection-service";

export const dynamic = "force-dynamic";

/**
 * Family Office — PROTECTION & INSURANCE.
 *
 * A SUB-PAGE of the existing Family Office (`/os/family`), exactly as the
 * capital & wealth page is: the same principal, the same tenant scope, the
 * same RLS policies and the same design system. No Family Office page is
 * replaced; nothing outside this domain is modified.
 *
 * The §4 rule governs the whole render: contingent protection, recorded cash/
 * surrender values, premium obligations, expected proceeds and received
 * proceeds are shown in SEPARATE figures, per currency. There is deliberately
 * no single grand total: no cross-currency rollup exists without a ratified
 * FX source, and a death benefit is never presented as wealth.
 */
export default async function FamilyProtectionPage() {
  const access = await requireAccess("familyoffice:protection.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="familyoffice:protection.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    await tenantScopeIds(access.principal); // pins the request scope; reads re-scope themselves
    const asOf = new Date().toISOString().slice(0, 10);
    const canClaims = can(access.principal, "familyoffice:claim.read").allowed;

    const [summary, listing, famview] = await Promise.all([
      protectionSummary(access.principal, asOf),
      listPolicies(access.principal, asOf),
      familyView(access.principal, asOf),
    ]);

    const minor = (valueMinor: number, currency: string) =>
      `${(valueMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="beyu-kicker text-[#b08d1c]">
              Family office ·{" "}
              <Link href="/os/family" className="underline decoration-dotted underline-offset-2">
                governance, lineage &amp; vaults
              </Link>{" "}
              ·{" "}
              <Link href="/os/family/capital" className="underline decoration-dotted underline-offset-2">
                capital &amp; wealth
              </Link>
            </div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Protection &amp; insurance</h1>
            <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
              Life insurance as a governed Family Office capability: protection records, succession liquidity and
              review. Contingent cover is shown separately from wealth — a death benefit is never a cash balance, and
              Finance OS remains the sole accounting authority.
            </p>
          </div>
          <FamilyTrustLogo size={64} className="shrink-0" ariaLabel="BEYU Family Trust" />
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active policies"
            value={String(summary.totalsByCurrency.reduce((n, c) => n + c.inForcePolicies, 0))}
            sub={`${String(summary.totalsByCurrency.reduce((n, c) => n + c.policies, 0))} total · per currency, never blended`}
          />
          <Metric
            label="Contingent protection"
            value={
              summary.totalsByCurrency.length === 0
                ? "—"
                : summary.totalsByCurrency
                    .filter((c) => c.deathBenefitContingentMinor > 0)
                    .map((c) => `${(c.deathBenefitContingentMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${c.currency}`)
                    .join(" · ") || "none in force"
            }
            sub="Death benefits in force — contingent cover, NOT net worth (§4)"
            tone="gold"
          />
          <Metric
            label="Annual premium obligation"
            value={
              summary.totalsByCurrency
                .map((c) => `${(c.annualPremiumObligationMinor / 100).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${c.currency}`)
                .join(" · ") || "—"
            }
            sub="Recorded obligations only — posting stays with Finance OS"
          />
          <Metric
            label="Policies needing review"
            value={String(summary.review.needsReview)}
            sub={`${String(summary.review.beneficiaryExceptions)} with beneficiary exceptions`}
            tone={summary.review.needsReview > 0 ? "red" : undefined}
          />
        </div>

        <Panel kicker="§24 · protection overview" title="Policies, designations & review state">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Policy</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Death benefit (contingent)</th>
                  <th>Premium / yr</th>
                  <th>Beneficiaries</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {listing.policies.map((p) => (
                  <tr key={p.id}>
                    <td className="font-medium">
                      <Link href={`/os/family/protection/${p.id}`} className="underline decoration-dotted underline-offset-2">
                        {p.policyNumber}
                      </Link>
                      <div className="mt-0.5 text-[10.5px] beyu-muted">
                        {p.currency}
                        {p.countryCode ? ` · ${p.countryCode}` : ""}
                        {p.legalEntityId ? " · corporate-viewed" : ""}
                      </div>
                    </td>
                    <td className="text-[11.5px]">{p.policyType}</td>
                    <td>
                      <Badge tone={stateTone(p.status)}>{p.status}</Badge>
                      <div className="mt-0.5 text-[10.5px] beyu-muted">{p.governanceStage}</div>
                    </td>
                    <td className="tabular-nums text-[11.5px]">
                      {minor(p.coverage.deathBenefitMinor, p.currency)}
                      <div className="text-[10.5px] beyu-muted">
                        provenance: {p.coverage.amountProvenance}
                        {p.coverage.cashValueMinor !== null ? ` · cash ${minor(p.coverage.cashValueMinor, p.currency)}` : " · no cash value"}
                      </div>
                    </td>
                    <td className="tabular-nums text-[11.5px]">
                      {minor(p.premium.annualObligationMinor, p.currency)}
                      <div className="text-[10.5px] beyu-muted">
                        {p.premium.nextPremiumDueDate ? `next due ${p.premium.nextPremiumDueDate}` : "no schedule recorded"}
                      </div>
                    </td>
                    <td className="text-[11.5px]">
                      <Badge tone={p.beneficiarySummary.ok ? "green" : "red"}>
                        {p.beneficiarySummary.standingPrimaries > 0 ? `${p.beneficiarySummary.standingPrimaries} primary` : "none standing"}
                      </Badge>
                      {p.beneficiarySummary.primaryPercentageSumMillionths !== null && (
                        <div className="mt-0.5 text-[10.5px] beyu-muted">{(p.beneficiarySummary.primaryPercentageSumMillionths / 1_000_000).toFixed(2)}% allocated</div>
                      )}
                    </td>
                    <td className="text-[11.5px]">
                      {p.reviewFlags.length === 0 ? (
                        <Badge tone="green">clean</Badge>
                      ) : (
                        <div className="space-y-0.5">
                          {p.reviewFlags.slice(0, 3).map((f, i) => (
                            <div key={i} className="text-[10.5px]">
                              <Badge tone={f.severity === "ESCALATE" ? "red" : f.severity === "WARNING" ? "orange" : "slate"}>{f.code}</Badge>
                            </div>
                          ))}
                          {p.reviewFlags.length > 3 && <div className="text-[10px] beyu-muted">+{p.reviewFlags.length - 3} more</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {listing.policies.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState message="No protection records in scope. Nothing is imported, assumed or seeded — the register starts empty." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Modeled planning data over recorded facts. Not legal, tax, actuarial or financial advice; the engine
            holds no thresholds and invents no values — a missing figure reads &ldquo;not quantified&rdquo;, never zero.
          </p>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="§13/§16 · claims" title="Proceeds posture — contingent vs received">
            {canClaims ? (
              <div className="space-y-2 text-[12px]">
                <div className="flex items-center justify-between gap-2">
                  <span>Open claims</span>
                  <Badge tone={summary.claims.open > 0 ? "orange" : "green"}>{summary.claims.open}</Badge>
                </div>
                {Object.entries(summary.claims.expectedProceedsMinorByCurrency).map(([currency, v]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <span className="beyu-muted">Expected (contingent — not cash)</span>
                    <span className="tabular-nums">{minor(v as number, currency)}</span>
                  </div>
                ))}
                {Object.entries(summary.claims.receivedProceedsMinorByCurrency).map(([currency, v]) => (
                  <div key={currency} className="flex items-center justify-between gap-2">
                    <span className="beyu-muted">Received (recorded receipt)</span>
                    <span className="tabular-nums">{minor(v as number, currency)}</span>
                  </div>
                ))}
                {Object.keys(summary.claims.expectedProceedsMinorByCurrency).length === 0 &&
                  Object.keys(summary.claims.receivedProceedsMinorByCurrency).length === 0 && (
                    <EmptyState message="No claims proceeds recorded in either state." />
                  )}
                <p className="pt-1 text-[10.5px] beyu-muted">{summary.claims.note}</p>
              </div>
            ) : (
              <EmptyState message="familyoffice:claim.read is not granted to your roles." />
            )}
          </Panel>

          <Panel kicker="§26 · family protection board" title="Member → protection → gap (as far as recorded)">
            <div className="space-y-2">
              {famview.rows.slice(0, 8).map((r) => (
                <div key={r.memberId} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">
                      {r.familyLine} / {r.branch} · gen {r.generation}
                    </span>
                    <div className="flex gap-1">
                      <Badge tone={stateTone(r.reviewStatus)}>{r.reviewStatus}</Badge>
                      <Badge tone="navy">{r.inForcePolicies} in force</Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-[11px] beyu-muted">
                    {r.policies.length === 0
                      ? "No policies record this member as insured or owner."
                      : r.policies.map((p) => p.policyNumber).join(", ")}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10.5px] beyu-muted">
                    <span>
                      gap:{" "}
                      {r.modeledGapMinor === null
                        ? "NOT_QUANTIFIED (no final assessment)"
                        : `${minor(r.modeledGapMinor, r.assessmentCurrency ?? "—")} (${r.gapBound})`}
                    </span>
                    <span>succession: {r.successionObjective}</span>
                  </div>
                </div>
              ))}
              {famview.rows.length === 0 && <EmptyState message="No family-registry rows are visible to your scope." />}
              <p className="text-[10.5px] beyu-muted">{famview.note}</p>
            </div>
          </Panel>
        </div>

        <p className="text-[11px] beyu-muted">
          API surface: <code>/api/v1/family-office/protection/*</code>. Audit: every sensitive change appends to the
          immutable hash-chained audit ledger and publishes to the enterprise event stream in the same transaction.
        </p>
      </div>
    );
  });
}
