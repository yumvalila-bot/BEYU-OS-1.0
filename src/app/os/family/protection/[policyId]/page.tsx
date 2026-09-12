import Link from "next/link";
import type { ReactNode } from "react";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { auditTrailFor } from "@/lib/audit";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { getPolicyDetail } from "@/lib/family-office-protection-service";

export const dynamic = "force-dynamic";

/**
 * Family Office — a single life-insurance policy (§25).
 *
 * A READ view over governed records: everything on this page arrived through
 * a guarded write with an actor, a reason and an audit append. Sections that
 * need a permission the viewer lacks say WHICH capability is missing instead
 * of rendering an empty table that could be mistaken for "nothing exists".
 */
export default async function PolicyDetailPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  const access = await requireAccess("familyoffice:protection.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="familyoffice:protection.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    let detail: Awaited<ReturnType<typeof getPolicyDetail>> | null = null;
    try {
      detail = await getPolicyDetail(access.principal, policyId, new Date().toISOString().slice(0, 10));
    } catch {
      return <Denied reason="No such policy within your scope." capability="familyoffice:protection.read" />;
    }

    const canClaims = can(access.principal, "familyoffice:claim.read").allowed;
    const trail = await auditTrailFor("FAMILY_INSURANCE_POLICY", policyId, access.principal.tenantId, 25);

    const p = detail.policy;
    const minor = (valueMinor: number | null, currency: string | null) =>
      valueMinor === null || !currency ? "—" : `${(valueMinor / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    const Row = ({ label, value }: { label: string; value: ReactNode }) => (
      <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
        <span className="beyu-muted">{label}</span>
        <span className="text-right">{value ?? "—"}</span>
      </div>
    );

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">
            Family office ·{" "}
            <Link href="/os/family/protection" className="underline decoration-dotted underline-offset-2">
              protection &amp; insurance
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-semibold tracking-tight">Policy {p.policyNumber}</h1>
            <Badge tone={stateTone(p.status)}>{p.status}</Badge>
            <Badge tone="navy">{p.policyType}</Badge>
            <Badge tone={stateTone(p.governanceStage)}>{p.governanceStage}</Badge>
          </div>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">{p.purpose}</p>
        </header>

        {detail.validation.length > 0 && (
          <Panel kicker="engine findings" title="Record-state findings">
            <ul className="space-y-1 text-[12px]">
              {detail.validation.map((f, i) => (
                <li key={i} className="text-[#b3261e]">{f}</li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="grid gap-5 xl:grid-cols-2">
          <Panel kicker="§9 · ownership model" title="Owner · insured · payer">
            <Row label="Legal owner" value={p.ownerRef ? `${p.ownerRef} (${p.ownerKind})` : "UNRECORDED"} />
            <Row label="Insured person" value={p.insuredRef ? `${p.insuredRef} (${p.insuredKind})` : "UNRECORDED"} />
            <Row label="Premium payer" value={p.premiumPayerRef ?? "UNRECORDED"} />
            <Row label="Insurer" value={p.insurerRef} />
            <Row label="Broker" value={p.brokerRef ?? "none recorded"} />
            <Row label="Corporate entity (viewed)" value={p.legalEntityId ?? "—"} />
            <Row label="Assignment" value={p.assignmentStatus === "NONE" ? "none" : `${p.assignmentStatus}${p.collateralBeneficiaryRef ? ` → ${p.collateralBeneficiaryRef}` : ""}`} />
            <p className="mt-2 text-[10.5px] beyu-muted">
              Owner, insured, beneficiary, payer and assignee are five recorded roles — never inferred from one
              another. A corporate key-person policy remains owned by its entity (§21).
            </p>
          </Panel>

          <Panel kicker="§4 · coverage" title="Death benefit, cash & surrender values">
            <Row label="Coverage amount" value={minor(p.coverageAmountMinor, p.currency)} />
            <Row label="Death benefit (contingent)" value={minor(p.deathBenefitMinor, p.currency)} />
            <Row label="Cash value" value={p.cashValueMinor === null ? "not applicable to this contract" : minor(p.cashValueMinor, p.currency)} />
            <Row label="Surrender value" value={p.surrenderValueMinor === null ? "not recorded" : minor(p.surrenderValueMinor, p.currency)} />
            <Row label="Amount provenance" value={`${p.amountProvenance}${p.amountSourceRef ? ` · ${p.amountSourceRef}` : ""}`} />
            <Row label="Epistemic class" value={p.amountProvenance} />
            <p className="mt-2 text-[10.5px] beyu-muted">
              Contingent protection is NOT liquid wealth: none of these figures adds to a balance sheet here. Finance
              OS remains the sole accounting authority ({p.authoritativeOwner}).
            </p>
          </Panel>

          <Panel kicker="§6 · designations" title="Insurance beneficiary designations">
            {detail.designations.length === 0 ? (
              <EmptyState message="No designations recorded — for an in-force policy this is the §14 MISSING_BENEFICIARY exception." />
            ) : (
              <div className="space-y-2">
                {detail.designations.map((d) => (
                  <div key={d.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold">{d.beneficiaryRef}</span>
                      <div className="flex gap-1">
                        <Badge tone={d.designationType === "PRIMARY" ? "navy" : "slate"}>{d.designationType}</Badge>
                        <Badge tone={stateTone(d.status)}>{d.status}</Badge>
                      </div>
                    </div>
                    <div className="mt-0.5 text-[11px] beyu-muted">
                      {d.entitlementBasis === "PERCENTAGE" && d.pctMillionths !== null
                        ? `${(d.pctMillionths / 1_000_000).toFixed(4)}%`
                        : d.entitlementBasis === "FIXED_AMOUNT"
                          ? minor(d.fixedAmountMinor, d.currency)
                          : "residuary"}{" "}
                      · eff. {d.effectiveDate}
                      {d.endDate ? ` → ${d.endDate}` : ""} · {d.beneficiaryKind}
                    </div>
                  </div>
                ))}
                <p className="text-[10.5px] beyu-muted">
                  These are contract DESIGNATIONS — not trust entitlements. The trust register
                  (<code>beneficiaries</code>) is a different legal relationship and is never read or written here.
                  Allocation audit: <Badge tone={detail.allocationAudit.ok ? "green" : "red"}>{detail.allocationAudit.ok ? "consistent" : "exceptions"}</Badge>
                </p>
              </div>
            )}
          </Panel>

          <Panel kicker="§10 · premiums" title="Premium obligation schedule">
            {detail.premiums.length === 0 ? (
              <EmptyState message="No premium schedule rows recorded." />
            ) : (
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead>
                    <tr>
                      <th>Due</th>
                      <th>Amount</th>
                      <th>Status at date</th>
                      <th>Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.premiums.map((r) => (
                      <tr key={r.id}>
                        <td className="text-[11.5px]">{r.dueDate}</td>
                        <td className="tabular-nums text-[11.5px]">{minor(r.amountMinor, r.currency)}</td>
                        <td>
                          <Badge tone={stateTone(r.effectiveStatus)}>{r.effectiveStatus}</Badge>
                        </td>
                        <td className="text-[10.5px] beyu-muted">{r.paymentEvidenceDocumentRef ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10.5px] beyu-muted">
              OVERDUE is read-time state (due date vs. today) — this system never flips statuses on its own, and a
              recorded payment is not a posting: Finance OS holds the ledger.
            </p>
          </Panel>

          <Panel kicker="§12 · links" title="Succession · liquidity · risk · HCM">
            <Row label="Succession plan" value={p.successionPlanRef ?? "not linked"} />
            <Row label="Liquidity objective" value={p.liquidityObjectiveRef ?? "not linked"} />
            <Row label="Linked risk assessment" value={p.riskAssessmentRef ?? "not linked"} />
            <Row label="HCM identity (group life)" value={p.hcmEmployeeRef ?? "n/a"} />
            <Row label="Jurisdiction" value={p.jurisdictionRef ?? "not recorded"} />
            <Row label="Legal review" value={p.legalReviewStatus} />
            <Row label="Tax review" value={p.taxReviewStatus} />
            <p className="mt-2 text-[10.5px] beyu-muted">
              Insurance supplies LIQUIDITY; the trust, agreement or instrument supplies the LEGAL OUTCOME. Review
              POSTURE is recorded here — outcomes arrive only as cited professional advice, never as a derived fact.
            </p>
          </Panel>

          <Panel kicker="§14 · review" title="Findings & review history">
            {detail.reviewFlags.length === 0 ? (
              <div className="mb-2"><Badge tone="green">no open findings at this date</Badge></div>
            ) : (
              <ul className="mb-2 space-y-1">
                {detail.reviewFlags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-[11.5px]">
                    <Badge tone={f.severity === "ESCALATE" ? "red" : f.severity === "WARNING" ? "orange" : "slate"}>{f.severity}</Badge>
                    <span>{f.detail}</span>
                  </li>
                ))}
              </ul>
            )}
            {detail.reviews.length === 0 ? (
              <EmptyState message="No review rows recorded yet." />
            ) : (
              <div className="space-y-1">
                {detail.reviews.slice(0, 8).map((r) => (
                  <div key={r.id} className="text-[11.5px] flex items-center justify-between gap-2">
                    <span>{r.reviewDate} · {r.reviewKind} · {r.reviewerRef}</span>
                    <Badge tone={stateTone(r.outcome)}>{r.outcome}</Badge>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2">
              <Row label="Assignments" value={detail.assignments.length ? detail.assignments.map((a) => `${a.assigneeName} (${a.status})`).join(", ") : "none"} />
              <Row
                label="Policy loans"
                value={
                  detail.loans.length
                    ? detail.loans.map((l) => `${l.status}${l.outstandingBalance === null ? "" : ` · ${l.outstandingBalance} ${p.currency}`}`).join(", ")
                    : "none recorded"
                }
              />
            </div>
          </Panel>

          <Panel kicker="§16 · claims" title="Claims on this policy">
            {!canClaims ? (
              <EmptyState message="familyoffice:claim.read is not granted to your roles." />
            ) : detail.claims.length === 0 ? (
              <EmptyState message="No claims recorded against this policy." />
            ) : (
              <div className="space-y-2">
                {detail.claims.map((c) => (
                  <div key={c.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">{c.claimReference}</span>
                      <div className="flex gap-1">
                        <Badge tone={stateTone(c.status)}>{c.status}</Badge>
                        <Badge tone={["RECEIVED", "ALLOCATED"].includes(c.proceedsState) ? "green" : "orange"}>{c.proceedsState}</Badge>
                      </div>
                    </div>
                    <div className="mt-0.5 beyu-muted">
                      approved {minor(c.approvedAmountMinor, c.currency)} · received {minor(c.receivedAmountMinor, c.currency)}
                      {c.proceedsReceivedDate ? ` · ${c.proceedsReceivedDate}` : ""}
                      {c.allocationRef ? ` · allocated → ${c.allocationRef}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel kicker="§17 · documents & audit" title="Evidence trail">
            <Row label="Referenced documents" value={p.documentRefs.length ? p.documentRefs.join(", ") : "none registered"} />
            <div className="mt-2 space-y-1">
              {trail.length === 0 ? (
                <EmptyState message="No audit entries for this object yet." />
              ) : (
                trail.map((t) => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                    <span>{t.action}{t.actorUserId ? ` · ${t.actorUserId}` : ""}</span>
                    <span className="beyu-muted tabular-nums">{t.occurredAt.toISOString().slice(0, 16).replace("T", " ")}</span>
                  </div>
                ))
              )}
            </div>
            <p className="mt-2 text-[10.5px] beyu-muted">
              The immutable hash-chained audit ledger is the full history; the enterprise event stream carries the
              INSURANCE_* facts. Neither is weakened by this page: it only reads, scoped to your tenant.
            </p>
          </Panel>
        </div>

        <p className="text-[11px] beyu-muted">{detail.disclaimer}</p>
      </div>
    );
  });
}
