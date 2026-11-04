/**
 * BEYU OS — TRUSTEE COMMAND.
 *
 * The constitutional authority surface of the BEYU Family Trust: who holds the
 * office, what is reserved to them, what has actually been recorded, and what a
 * named human must still bring. It replaces the demonstration "Trustee Command"
 * dashboard that lived inside the Health OS sector SPA with a real,
 * capability-gated, tenant- and classification-scoped read view.
 *
 * WHAT THIS PAGE DOES NOT DO
 *   - It does not decide, approve, appoint, remove, distribute or post.
 *     There is no form, no button that mutates, and no server action here.
 *   - It does not treat a trustee appointment as a permission. The page guard is
 *     `familyoffice:trust.read`; the appointment rows are data, not authority.
 *   - It does not invent status. A matter with no governed record type says so.
 *
 * Every value comes from `loadTrusteeCommand()`, which is the same function the
 * JSON API calls, so the rendered view and the API can never disagree.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, EmptyState, Metric, Panel, stateTone } from "@/components/brand";
import { FamilyTrustLogo } from "@/components/family-trust-logo";
import { Icon } from "@/components/icons";
import { NoeliaAvatar } from "@/components/noelia-avatar";
import { requireAccess } from "@/lib/guard";
import { noeliaProviderCapabilityLabel, noeliaProviderModeFromEnvironment } from "@/lib/noelia/appearance";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import {
  TRUSTEE_COMMAND_BOUNDARY,
  TrusteeCommandError,
  loadTrusteeCommand,
} from "@/lib/family/trustee-command-service";
import { RESERVED_MATTER_LABEL } from "@/lib/family/trustee-command";
import type { EnterpriseNode, ReservedMatterReviewState } from "@/lib/family/trustee-command";

export const metadata: Metadata = { title: "Trustee Command" };
export const dynamic = "force-dynamic";

const CAPABILITY = "familyoffice:trust.read";

const REVIEW_STATE_TONE: Record<ReservedMatterReviewState, string> = {
  RECORDED: "green",
  IN_REVIEW: "amber",
  DISPUTED: "red",
  NOT_RECORDED: "slate",
  NOT_INSTRUMENTED: "gold",
};

const REVIEW_STATE_LABEL: Record<ReservedMatterReviewState, string> = {
  RECORDED: "Recorded",
  IN_REVIEW: "In review",
  DISPUTED: "Disputed",
  NOT_RECORDED: "Not recorded",
  NOT_INSTRUMENTED: "Not instrumented",
};

function EnterpriseBranch({ nodes }: { nodes: EnterpriseNode[] }) {
  return (
    <ul className="space-y-1.5">
      {nodes.map((node) => (
        <li key={node.id}>
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2"
            style={{ marginLeft: node.depth * 14 }}
          >
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold">{node.legalName}</span>
              <span className="block font-mono text-[10.5px] beyu-muted">{node.code} · {node.entityType} · {node.countryCode}</span>
            </span>
            <Badge tone={stateTone(node.status)}>{node.status}</Badge>
          </div>
          {node.children.length > 0 && (
            <div className="mt-1.5">
              <EnterpriseBranch nodes={node.children} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export default async function TrusteeCommandPage() {
  const access = await requireAccess(CAPABILITY);
  if (!access.allowed) {
    return (
      <div className="beyu-panel mx-auto max-w-2xl px-6 py-8">
        <div className="flex items-center gap-3">
          <FamilyTrustLogo size={34} decorative />
          <div className="beyu-kicker text-[#b08d1c]">Constitutional authority</div>
        </div>
        <h1 className="mt-3 text-[20px] font-semibold tracking-tight">Trustee Command is not available to this principal</h1>
        <p className="mt-3 text-[13px] beyu-muted">{access.reason}</p>
        <div className="mt-4 rounded-lg border border-[color:var(--beyu-line)] px-4 py-3 text-[12px]">
          <div className="beyu-kicker beyu-muted">Required capability</div>
          <div className="mt-1 font-mono text-[12px]">{CAPABILITY}</div>
        </div>
        <p className="mt-4 text-[11.5px] beyu-muted">
          Trust records are HIGHLY_RESTRICTED. The denial has been recorded; a governed grant is
          requested through Identity &amp; Access and never through this surface.
        </p>
      </div>
    );
  }

  return withTenantDatabaseContext(access.principal, async () => {
    let model: Awaited<ReturnType<typeof loadTrusteeCommand>> | null = null;
    let failure: string | null = null;
    try {
      model = await loadTrusteeCommand(access.principal);
    } catch (err) {
      if (err instanceof TrusteeCommandError) failure = err.message;
      else throw err;
    }

    if (!model) {
      return (
        <div className="mx-auto max-w-2xl space-y-4">
          <header>
            <div className="beyu-kicker text-[#b08d1c]">Constitutional authority</div>
            <h1 className="mt-1 text-[24px] font-semibold tracking-tight">Trustee Command</h1>
          </header>
          <EmptyState
            message={
              failure ??
              "No trust entity resolves within your authorised scope, so there is no trustee office to display. This surface never renders placeholder trustees."
            }
          />
        </div>
      );
    }

    const providerMode = noeliaProviderModeFromEnvironment();
    const declaredMatters = model.reservedMatters.filter((matter) => matter.reservedByBody);
    const instrumentedMatters = model.reservedMatters.filter((matter) => matter.state !== "NOT_INSTRUMENTED");

    return (
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="beyu-kicker text-[#b08d1c]">Constitutional control plane</div>
            <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Trustee Command</h1>
            <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
              Constitutional authority and generational stewardship of {model.trust.legalName}.
              This surface reviews the registers; it decides nothing.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone="gold">ADVISORY · READ-ONLY</Badge>
              <Badge tone="navy">{model.trust.code}</Badge>
              <Badge tone={stateTone(model.trust.status)}>{model.trust.status}</Badge>
              <Badge tone="slate">{model.trust.countryCode}</Badge>
              <Badge tone="slate">{model.trust.functionalCurrency}</Badge>
            </div>
          </div>
          {/* The Trust's own institutional mark — used only where the Trust
              itself is represented, never as OS chrome (docs/branding/README.md). */}
          <div className="shrink-0 text-center">
            <FamilyTrustLogo size={64} className="mx-auto" />
            <div className="mt-1 text-[10px] beyu-muted">BEYU FAMILY TRUST</div>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Active trustees"
            value={String(model.counts.trustees)}
            sub={model.quorum ? `quorum ≥ ${model.quorum.quorumMinimum} · ${model.quorum.quorumMet ? "met" : "not met"}` : "no trustee body recorded"}
            tone="gold"
          />
          <Metric
            label="Reserved matters declared"
            value={String(model.counts.reservedMattersDeclared)}
            sub={`${model.reservedMatters.length} constitutional matters reviewed`}
          />
          <Metric
            label="Instruments / provisions"
            value={`${model.instruments.total} / ${model.provisions.total}`}
            sub={`${model.provisions.inert} provision${model.provisions.inert === 1 ? "" : "s"} structurally inert`}
          />
          <Metric
            label="Financial posting"
            value={model.rails.financialPosting.executable ? "Open" : "Locked"}
            sub={model.rails.financialPosting.executable ? "activation gate reports executable" : `blocked by ${model.rails.financialPosting.blockedBy.length || "registry"} decision${model.rails.financialPosting.blockedBy.length === 1 ? "" : "s"}`}
          />
        </div>

        <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
          <Panel kicker="Canonical appointment registry" title="Trustee office and quorum">
            {model.trusteeBindings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="beyu-table">
                  <thead>
                    <tr><th>Trustee</th><th>Appointed</th><th>Authority reference</th><th>Limit</th></tr>
                  </thead>
                  <tbody>
                    {model.trusteeBindings.map((trustee) => (
                      <tr key={trustee.partyId}>
                        <td className="font-medium">{trustee.displayName}</td>
                        <td className="tabular-nums">{trustee.appointedOn}</td>
                        <td className="font-mono text-[11px]">{trustee.resolutionRef ?? "—"}</td>
                        <td className="tabular-nums text-[11.5px]">{trustee.authorityLimit ?? "no stated limit"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No current trustee appointment resolves in the canonical registry for this trust." />
            )}
            <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px] beyu-muted">
              An appointment is a fiduciary office recorded in <span className="font-mono">entity_appointments</span>.
              It is never a permission: this page is guarded by <span className="font-mono">{CAPABILITY}</span>,
              and holding the office grants nothing on its own.
            </div>
            {model.quorum && (
              <div className="mt-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold">{model.quorum.bodyCode}</span>
                  <Badge tone={model.quorum.quorumMet ? "green" : "amber"}>
                    quorum {model.quorum.quorumMet ? "met" : "not met"} · {model.quorum.activeTrustees}/{model.quorum.quorumMinimum}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] beyu-muted">Majority rule {model.quorum.majorityRule}. {model.quorum.note}</p>
              </div>
            )}
          </Panel>

          <Panel kicker="Authority rails" title="What outranks the family's policy">
            <ol className="space-y-1">
              {model.rails.superiorInstruments.map((instrument, index) => (
                <li key={instrument} className="flex items-center gap-2 text-[11.5px]">
                  <span className="w-4 text-right font-mono text-[10px] beyu-muted">{index + 1}</span>
                  <span className="font-mono">{instrument}</span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] beyu-muted">
              The family constitution is a policy instrument. It sits below every entry above and creates
              no legal authority. Precedence between superior instruments is a question for counsel — this
              software does not adjudicate it.
            </p>
            <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
              <div className="beyu-kicker beyu-muted">Decision gate</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {model.rails.decisionGateSteps.map((step) => (
                  <span
                    key={step}
                    className={`rounded px-1.5 py-[2px] font-mono text-[10px] ${
                      step === model.rails.lastAiPermittedStep
                        ? "bg-[#d4af37]/20 text-[#8a6d10] dark:text-[#efd98f]"
                        : "border border-[color:var(--beyu-line)]"
                    }`}
                  >
                    {step}
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] beyu-muted">
                An AI actor may reach {model.rails.lastAiPermittedStep} and no further. Approval, execution
                and recording are human acts.
              </p>
            </div>
          </Panel>
        </div>

        <Panel
          kicker="Reserved matters"
          title="Review state — what the evidence actually supports"
          action={<Badge tone="slate">{declaredMatters.length} declared by the trustee body</Badge>}
        >
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Matter / authority</th>
                  <th>Declared</th>
                  <th>Review state</th>
                  <th>Recorded</th>
                  <th>What a human must still bring</th>
                </tr>
              </thead>
              <tbody>
                {model.reservedMatters.map((matter) => (
                  <tr key={matter.matter}>
                    <td>
                      <span className="block text-[12.5px] font-medium">{RESERVED_MATTER_LABEL[matter.matter]}</span>
                      <span className="block font-mono text-[10.5px] beyu-muted">{matter.matter}</span>
                    </td>
                    <td>
                      {matter.reservedByBody ? <Badge tone="navy">declared</Badge> : <Badge tone="slate">not in charter</Badge>}
                    </td>
                    <td>
                      <Badge tone={REVIEW_STATE_TONE[matter.state]}>{REVIEW_STATE_LABEL[matter.state]}</Badge>
                      {matter.state === "NOT_INSTRUMENTED" ? (
                        <span className="mt-0.5 block text-[10px] beyu-muted">no governed record type</span>
                      ) : (
                        <span className="mt-0.5 block text-[10px] beyu-muted">
                          {matter.recordedActs} recorded · {matter.pendingActs} pending · {matter.closedActs} closed
                        </span>
                      )}
                    </td>
                    <td className="tabular-nums">{matter.recordedActs}</td>
                    <td>
                      <ul className="list-disc space-y-0.5 pl-4 text-[11px] beyu-muted">
                        {matter.requires.map((requirement) => (
                          <li key={requirement}>{requirement}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            {instrumentedMatters.length} of {model.reservedMatters.length} constitutional matters have a governed
            record type today. “Not instrumented” is reported instead of a fabricated status — a trustee act the
            repository cannot evidence is not evidence of an act.
          </p>
        </Panel>

        <div className="grid gap-5 xl:grid-cols-3">
          <Panel kicker="Instruments" title="Versioned trust instruments">
            {model.instruments.total > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(model.instruments.byStatus)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([status, count]) => (
                      <Badge key={status} tone={stateTone(status)}>{status} · {count}</Badge>
                    ))}
                </div>
                {model.instruments.latest && (
                  <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[12.5px] font-semibold">{model.instruments.latest.instrumentName}</span>
                      <Badge tone={stateTone(model.instruments.latest.status)}>{model.instruments.latest.status}</Badge>
                    </div>
                    <div className="mt-1 text-[11px] beyu-muted">
                      {model.instruments.latest.instrumentType} · v{model.instruments.latest.version}
                      {model.instruments.latest.effectiveDate ? ` · effective ${model.instruments.latest.effectiveDate}` : ""}
                    </div>
                  </div>
                )}
                <p className="text-[11px] beyu-muted">
                  {model.instruments.legalReviewPending} instrument{model.instruments.legalReviewPending === 1 ? "" : "s"} awaiting a
                  human legal-review closure. Software never closes it.
                </p>
              </div>
            ) : (
              <EmptyState message="No trust instrument is recorded for this trust in your scope." />
            )}
          </Panel>

          <Panel kicker="Provisions" title="Legal effect status">
            {model.provisions.total > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg border border-[color:var(--beyu-line)] px-2 py-2">
                    <div className="text-[18px] font-semibold">{model.provisions.inert}</div>
                    <div className="beyu-kicker beyu-muted">INERT</div>
                  </div>
                  <div className="rounded-lg border border-[color:var(--beyu-line)] px-2 py-2">
                    <div className="text-[18px] font-semibold">{model.provisions.legallyEffective}</div>
                    <div className="beyu-kicker beyu-muted">EFFECTIVE</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(model.provisions.byType)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([type, count]) => (
                      <Badge key={type} tone="gold">{type} · {count}</Badge>
                    ))}
                </div>
                <p className="text-[11px] beyu-muted">
                  A provision is INERT without a ratified legal-effect reference. Enforceability is never
                  assumed{model.provisions.enforceabilityAssumed > 0 ? ` — ${model.provisions.enforceabilityAssumed} row(s) violate that rule and require remediation` : ""}.
                </p>
              </div>
            ) : (
              <EmptyState message="No provision is recorded for the instruments in your scope." />
            )}
          </Panel>

          <Panel kicker="Distributions" title="Decision records, not payments">
            {model.distributions.total > 0 ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge tone="slate">PROPOSED · {model.distributions.proposed}</Badge>
                  <Badge tone="amber">APPROVED · {model.distributions.approved}</Badge>
                  <Badge tone="green">EXECUTED · {model.distributions.executed}</Badge>
                  <Badge tone="red">REJECTED · {model.distributions.rejected}</Badge>
                </div>
                <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11.5px]">
                  {Object.entries(model.distributions.byCurrency).map(([currency, total]) => (
                    <div key={currency} className="flex justify-between tabular-nums">
                      <span className="beyu-muted">{currency}</span><span>{total}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] beyu-muted">
                  {model.distributions.awaitingFinance} executed record{model.distributions.awaitingFinance === 1 ? "" : "s"} awaiting a
                  Finance OS reference. A distribution record is a decision, never a payment: money truth stays in
                  Finance OS and posting remains locked.
                </p>
              </div>
            ) : (
              <EmptyState message="No distribution decision record exists for this trust in your scope." />
            )}
          </Panel>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <Panel kicker="Enterprise map" title="Ownership beneath the Trust">
            {model.enterprise.length > 0 ? (
              <EnterpriseBranch nodes={model.enterprise} />
            ) : (
              <EmptyState message="No legal entity is visible beneath this trust in your scope." />
            )}
            <p className="mt-3 text-[11px] beyu-muted">
              {model.counts.enterpriseEntities} entities in view, derived from the canonical legal-entity hierarchy.
              A registered entity is not a connected integration, and sector data stays behind its own
              authorization and repository boundary.
            </p>
          </Panel>

          <div className="space-y-5">
            <Panel kicker="Intelligence" title="NOELIA">
              <div className="flex items-start gap-3">
                <NoeliaAvatar size="md" state="idle" decorative />
                <div className="min-w-0">
                  <div className="text-[12px] font-semibold">INTELLIGENCE · GOVERNANCE · CARE</div>
                  <p className="mt-1 text-[11.5px] beyu-muted">
                    Advisory only. {model.rails.note}
                  </p>
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 text-[11px]">
                <div className="beyu-kicker beyu-muted">Runtime posture</div>
                <div className="mt-0.5">{noeliaProviderCapabilityLabel(providerMode)}</div>
              </div>
              <Link
                href="/os/noelia"
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#d4af37]/60 bg-[#d4af37]/15 px-3 py-2 text-[12px] font-semibold text-[#8a6d10] transition hover:bg-[#d4af37]/25 dark:text-[#efd98f]"
              >
                Open the governed assistant →
              </Link>
            </Panel>

            <Panel kicker="Boundary" title="What this surface will not do">
              <ul className="space-y-1.5 text-[11.5px] beyu-muted">
                <li className="flex gap-2"><Icon name="constitution" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>No vote, approval or resolution is executed here.</span></li>
                <li className="flex gap-2"><Icon name="payments" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>No payment is made and no journal entry is posted (CAP_POSTING: {model.rails.financialPosting.executable ? "open" : "locked"}).</span></li>
                <li className="flex gap-2"><Icon name="family" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>No trustee is appointed or removed; the appointment registry is written only by the governed trust service.</span></li>
                <li className="flex gap-2"><Icon name="security" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>No grant is created. Authority is not inherited by convenience.</span></li>
              </ul>
              <p className="mt-3 border-t border-[color:var(--beyu-line)] pt-2 text-[10.5px] beyu-muted">{TRUSTEE_COMMAND_BOUNDARY}</p>
            </Panel>
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--beyu-line)] pt-3 text-[11px] beyu-muted">
          <span>
            Composed {new Date(model.generatedAt).toISOString().slice(0, 10)} · model {model.version} · read-only
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <Link href="/os/family" className="underline hover:no-underline">Family Office</Link>
            <Link href="/os/organization-ownership" className="underline hover:no-underline">Organisation &amp; Ownership</Link>
            <a href="/api/v1/family-office/trustee-command" className="underline hover:no-underline">JSON model</a>
          </span>
        </footer>
      </div>
    );
  });
}
