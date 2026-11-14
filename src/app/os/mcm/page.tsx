import { Badge, Denied, EmptyState, Panel } from "@/components/brand";
import { BoundaryNote, DataStateBadge, Figure, McmEmpty } from "@/components/mcm/figure";
import { can } from "@/lib/authz";
import { requirePrincipal } from "@/lib/guard";
import { figure, MCM_DATA_STATE_MEANING, type McmDataState } from "@/lib/mcm/model";
import {
  buildHierarchy,
  consolidationOverview,
  countryViews,
  entityFinancialSnapshots,
  governanceOverview,
  intercompanyOverview,
  moduleRollup,
  ownershipOverview,
  riskComplianceOverview,
  visibleEntities,
  type HierarchyNode,
} from "@/lib/mcm/read-services";

export const dynamic = "force-dynamic";

/**
 * MULTI_COMPANY_MANAGEMENT — Executive Command Centre.
 *
 * This is a SURFACE, not an operating system: it lives inside the one BEYU OS
 * shell, uses the one GlobalUserID session, and every panel derives from the same
 * `visibleEntities()` resolution. It adds no login, no second registry and no
 * second ledger.
 *
 * Each panel names the capability it depends on, and a missing grant or a missing
 * source appears as a governed gap ("no board recorded", "requires clearance")
 * rather than an apparently healthy blank.
 */
export default async function McmCommandCentrePage() {
  const principal = await requirePrincipal();
  if (!can(principal, "mcm:company.read").allowed) {
    return (
      <Denied
        reason="No Multi-Company Management read grant is active for this principal."
        capability="mcm:company.read"
      />
    );
  }

  const entities = await visibleEntities(principal);
  const [countries, financials, governance, ownership, risk, intercompany, consolidation, modules] =
    await Promise.all([
      countryViews(entities),
      can(principal, "mcm:consolidation.read").allowed
        ? entityFinancialSnapshots(principal, entities, null)
        : null,
      governanceOverview(principal, entities),
      ownershipOverview(principal, entities),
      riskComplianceOverview(principal, entities),
      intercompanyOverview(principal, entities),
      consolidationOverview(principal),
      moduleRollup(principal, entities),
    ]);
  const roots = buildHierarchy(entities);

  const activeCount = entities.filter(
    (entity) => (entity.profile?.mcmLifecycleState ?? entity.status) === "ACTIVE",
  ).length;
  const noProfile = entities.filter((entity) => entity.profile === null);
  const unverified = entities.filter(
    (entity) => entity.profile !== null && entity.profile.verificationState !== "VERIFIED",
  );

  const moduleLines = [
    modules.procurement
      ? {
          label: "Procurement register",
          owner: "in-module · MCM satellite",
          count: modules.procurement.records,
          note: Object.entries(modules.procurement.committedByCurrency)
            .map(([currency, amount]) => `${currency} ${Number(BigInt(amount)) / 100}`)
            .join(" · "),
        }
      : { label: "Procurement register", owner: "mcm:procurement.read", count: null, note: "restricted" },
    modules.assets
      ? {
          label: "Asset register",
          owner: "in-module · MCM satellite",
          count: modules.assets.records,
          note: Object.entries(modules.assets.byClass)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · "),
        }
      : { label: "Asset register", owner: "mcm:asset.read", count: null, note: "restricted" },
    modules.projects
      ? {
          label: "Project portfolio",
          owner: "in-module · MCM satellite",
          count: modules.projects.records,
          note: Object.entries(modules.projects.byHealth)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · "),
        }
      : { label: "Project portfolio", owner: "mcm:project.read", count: null, note: "restricted" },
    modules.capitalAllocations
      ? {
          label: "Capital allocations",
          owner: "governance resolution required",
          count: modules.capitalAllocations.records,
          note: Object.entries(modules.capitalAllocations.byStatus)
            .map(([key, value]) => `${key} ${value}`)
            .join(" · "),
        }
      : { label: "Capital allocations", owner: "mcm:capital.read", count: null, note: "restricted" },
  ];

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Executive · multi-company management</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Group command centre</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          One governed view of the corporate group: the legal-entity hierarchy, ownership and control
          evidence, board presence, financial oversight, the cross-entity position and operating-module
          coverage — each filtered to the companies your grants, entity scope and clearance actually
          reach.
        </p>
      </header>

      <BoundaryNote title="What this surface deliberately does not do">
        MCM is not a ledger, a registry or an operating system. Legal entities, ownership, boards,
        resolutions, contracts, risks, obligations, documents and financial balances stay owned by
        their canonical modules; this command centre reads them and never restates them.{" "}
        <strong>CAP_POSTING stays locked</strong>: nothing on these screens produces a journal entry,
        and no consolidated figure is ever fabricated from an absent source.
      </BoundaryNote>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Companies in scope", value: entities.length, note: `${activeCount} active` },
          {
            label: "Countries",
            value: countries.length,
            note: countries.map((country) => country.countryCode).join(", ") || "none representable",
          },
          { label: "Root companies", value: roots.length, note: "top of your visible hierarchy" },
          {
            label: "Registration gaps",
            value: noProfile.length + unverified.length,
            note: `${noProfile.length} without a profile · ${unverified.length} unverified`,
          },
        ].map((tile) => (
          <div key={tile.label} className="beyu-panel px-4 py-3">
            <div className="beyu-kicker beyu-muted">{tile.label}</div>
            <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums">{tile.value}</div>
            <div className="mt-0.5 text-[11px] beyu-muted">{tile.note}</div>
          </div>
        ))}
      </div>

      <Panel kicker="Corporate registry" title="Group structure">
        {roots.length === 0 ? (
          <EmptyState message="No legal entity is inside your current tenant, entity and clearance scope." />
        ) : (
          <div className="space-y-1.5">
            {roots.map((root) => (
              <HierarchyBranch key={root.id} node={root} />
            ))}
          </div>
        )}
        <p className="mt-3 text-[11px] beyu-muted">
          Tree position reflects the registry&apos;s parent pointer only. It asserts no ownership
          percentage and no control right — those are separate facts, each validated against its own
          legal instrument.
        </p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Jurisdictions" title="Countries and operating entities">
          {countries.length === 0 ? (
            <McmEmpty>No country is represented in your scope.</McmEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Country</th>
                    <th>Entities</th>
                    <th>Active</th>
                    <th>Currencies</th>
                    <th>Jurisdiction profile</th>
                  </tr>
                </thead>
                <tbody>
                  {countries.map((country) => (
                    <tr key={country.countryCode}>
                      <td>
                        <div className="font-medium">{country.countryName}</div>
                        <div className="font-mono text-[10.5px] beyu-muted">{country.countryCode}</div>
                      </td>
                      <td className="tabular-nums">{country.entities}</td>
                      <td className="tabular-nums">{country.activeEntities}</td>
                      <td className="text-[11.5px]">{country.functionalCurrencies.join(" · ")}</td>
                      <td className="text-[11.5px]">
                        {country.configuration ? (
                          <div className="space-y-0.5">
                            <div>
                              {country.configuration.incorporationAuthority ?? "incorporation authority unrecorded"}
                            </div>
                            <div className="beyu-muted">
                              {country.configuration.taxAuthority ?? "tax authority unrecorded"}
                            </div>
                            <div className="beyu-muted">
                              config v{country.configuration.version} · from {country.configuration.effectiveFrom}
                            </div>
                          </div>
                        ) : (
                          <Badge tone="amber">No country profile recorded</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] beyu-muted">
            Filings are recorded as manual or document-based work unless a verified regulator
            integration exists. No regulator API is invented, and one country&apos;s rules are never
            generalised to another.
          </p>
        </Panel>

        <Panel kicker="Ownership evidence" title="Ownership and control">
          {ownership.records.length === 0 ? (
            <McmEmpty>
              No ownership record is visible for these companies. MCM supplies no default percentage:
              ownership must come from an instrument recorded in the canonical registry.
            </McmEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Owned entity</th>
                    <th>Owner</th>
                    <th>Type</th>
                    <th>Economic</th>
                    <th>Voting</th>
                    <th>Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {ownership.records.slice(0, 12).map((record) => (
                    <tr key={record.id}>
                      <td className="text-[11.5px] font-medium">{record.ownedEntityCode}</td>
                      <td className="text-[11.5px]">
                        {record.ownerEntityCode ?? record.ownerPartyId ?? "unrecorded"}
                      </td>
                      <td>
                        <Badge tone="navy">{record.ownershipType}</Badge>
                      </td>
                      <td className="font-mono text-[11.5px] tabular-nums">{record.economicPct}%</td>
                      <td className="font-mono text-[11.5px] tabular-nums">{record.votingPct}%</td>
                      <td>
                        {record.latestValidation ? (
                          <Badge tone={record.latestValidation === "VALID" ? "green" : "amber"}>
                            {record.latestValidation}
                          </Badge>
                        ) : (
                          <Badge tone="slate">Not validated</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ownership.entitiesWithNoOwnerRecorded.length > 0 && (
            <p className="mt-2 text-[11px] beyu-muted">
              No live owner record: {ownership.entitiesWithNoOwnerRecorded.join(", ")}. Reported as a
              gap, never filled with an assumption.
            </p>
          )}
          <p className="mt-2 text-[11px] beyu-muted">
            A total below 100% is reported as a finding, not corrected. MCM records validation evidence
            and never edits the ownership registry.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Governance" title="Boards, committees and trustees">
          {governance.bodies.length === 0 ? (
            <McmEmpty>
              No governance body is recorded for these companies.{" "}
              {governance.entitiesWithoutBody.length > 0
                ? `${governance.entitiesWithoutBody.length} entities have no board on record.`
                : ""}
            </McmEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Body</th>
                    <th>Type</th>
                    <th>Quorum</th>
                    <th>Majority</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {governance.bodies.map((body) => (
                    <tr key={body.id}>
                      <td>
                        <div className="font-medium">{body.name}</div>
                        <div className="font-mono text-[10.5px] beyu-muted">{body.code}</div>
                      </td>
                      <td>
                        <Badge tone="navy">{body.bodyType}</Badge>
                      </td>
                      <td className="tabular-nums">{body.quorumMinimum}</td>
                      <td className="text-[11.5px]">{body.majorityRule}</td>
                      <td>
                        <Badge tone={body.status === "ACTIVE" ? "green" : "slate"}>{body.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-[11px] beyu-muted">
            Appointments, meetings and resolutions are created in the governance domain under its own
            authority. MCM presents them per company; it cannot appoint a director or pass a
            resolution.
          </p>
        </Panel>

        <Panel kicker="Financial oversight" title="Entity position (Finance OS)">
          {financials === null ? (
            <McmEmpty>
              Per-entity financial oversight requires <code>mcm:consolidation.read</code>. Balances are
              held by Finance OS and are not duplicated here.
            </McmEmpty>
          ) : financials.length === 0 ? (
            <McmEmpty>No entity in scope reports a financial position.</McmEmpty>
          ) : (
            <div className="space-y-2">
              {financials.slice(0, 8).map((snapshot) => (
                <div
                  key={snapshot.entityId}
                  className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-[11.5px] font-semibold">{snapshot.entityCode}</span>
                    <span className="text-[10.5px] beyu-muted">
                      HCM headcount: {snapshot.employeeCount ?? "unavailable"}
                    </span>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Figure figure={snapshot.treasury} label="Treasury" compact />
                    <Figure figure={snapshot.capitalRequested} label="Capital requested" compact />
                    <Figure figure={snapshot.capitalApproved} label="Capital approved" compact />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] beyu-muted">
            Every figure carries currency, period, source and data state.{" "}
            {MCM_DATA_STATE_MEANING.UNAVAILABLE}
          </p>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Cross-entity" title="Intercompany position">
          {intercompany.restrictedReason ? (
            <McmEmpty>{intercompany.restrictedReason}</McmEmpty>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: "Transactions", value: intercompany.transactions.length },
                  { label: "Agreements", value: intercompany.agreements },
                  {
                    label: "Both sides authorised",
                    value: intercompany.transactions.filter(
                      (transaction) => transaction.receivableAuthorized && transaction.payableAuthorized,
                    ).length,
                  },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                    <div className="beyu-kicker beyu-muted">{tile.label}</div>
                    <div className="font-mono text-[18px] tabular-nums">{tile.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 space-y-2">
                {Object.entries(intercompany.totalsByCurrency).length === 0 ? (
                  <McmEmpty>No authorised intercompany amount in scope for the current period.</McmEmpty>
                ) : (
                  Object.entries(intercompany.totalsByCurrency).map(([currency, totals]) => (
                    <div key={currency} className="grid gap-2 sm:grid-cols-2">
                      <Figure
                        figure={figure({
                          amountMinor: totals.authorizedMinor,
                          currency,
                          period: null,
                          source: "MCM intercompany transactions (both sides authorised)",
                          dataState: "ACTUAL",
                        })}
                        label="Authorised"
                        compact
                      />
                      <Figure
                        figure={figure({
                          amountMinor: totals.awaitingMinor,
                          currency,
                          period: null,
                          source: "MCM intercompany transactions (awaiting counterparty)",
                          dataState: "PENDING",
                        })}
                        label="Awaiting counterparty"
                        compact
                      />
                    </div>
                  ))
                )}
              </div>
              <p className="mt-2 text-[11px] beyu-muted">
                Amounts are never summed across currencies. A transaction needs authorisation from BOTH
                legal entities, and the database refuses the same principal authorising both sides.
              </p>
            </>
          )}
        </Panel>

        <Panel kicker="Consolidation" title="Runs and independent review">
          {consolidation.restrictedReason ? (
            <McmEmpty>{consolidation.restrictedReason}</McmEmpty>
          ) : consolidation.runs.length === 0 ? (
            <McmEmpty>
              No consolidation run has been prepared. MCM does not fabricate a consolidated group
              figure: a run requires a preparer and an independent reviewer, and its result is a
              reviewed computation, never a posting.
            </McmEmpty>
          ) : (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>State</th>
                    <th>Entities</th>
                    <th>Residual</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {consolidation.runs.map((run) => (
                    <tr key={run.id}>
                      <td className="font-mono text-[11.5px]">
                        {run.periodCode}
                        <div className="text-[10.5px] beyu-muted">{run.reportingCurrency}</div>
                      </td>
                      <td>
                        <Badge tone={run.state === "REVIEWED" || run.state === "FINAL" ? "green" : "amber"}>
                          {run.state}
                        </Badge>
                      </td>
                      <td className="tabular-nums">{run.entitiesIncluded}</td>
                      <td className="text-[11.5px]">
                        <Figure
                          figure={figure({
                            amountMinor: run.residualMinor,
                            currency: run.reportingCurrency,
                            period: run.periodCode,
                            source: `Consolidation run ${run.code}`,
                            dataState: run.dataState as McmDataState,
                          })}
                          compact
                        />
                      </td>
                      <td className="text-[11.5px]">
                        {run.reviewedByUserId ? (
                          <span className="text-[11px] beyu-muted">reviewed</span>
                        ) : (
                          <Badge tone="amber">awaiting review</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel kicker="Assurance" title="Risk and compliance across the group">
          {risk.restrictedReason ? (
            <McmEmpty>{risk.restrictedReason}</McmEmpty>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="beyu-kicker beyu-muted">Open risks</div>
                  <div className="font-mono text-[18px] tabular-nums">{risk.risks?.open ?? "—"}</div>
                  <div className="text-[10.5px] beyu-muted">
                    {risk.risks ? `${risk.risks.aboveAppetite} above appetite` : "restricted"}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="beyu-kicker beyu-muted">Obligations overdue</div>
                  <div className="font-mono text-[18px] tabular-nums">{risk.obligations?.overdue ?? "—"}</div>
                  <div className="text-[10.5px] beyu-muted">
                    {risk.obligations ? `${risk.obligations.total} tracked` : "restricted"}
                  </div>
                </div>
                <div className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="beyu-kicker beyu-muted">Statutory filings overdue</div>
                  <div className="font-mono text-[18px] tabular-nums">{risk.filings?.overdue ?? "—"}</div>
                  <div className="text-[10.5px] beyu-muted">
                    {risk.filings ? `${risk.filings.total} tracked` : "restricted"}
                  </div>
                </div>
              </div>
              <p className="text-[11px] beyu-muted">
                Counts come from the canonical risk register, compliance obligations and the MCM
                statutory-filing record. A filing marked overdue is one whose due date has passed
                without a recorded filing — never an assumption that it was missed.
              </p>
            </div>
          )}
        </Panel>

        <Panel kicker="Enterprise modules" title="Operating coverage">
          {modules.restrictedReason ? (
            <McmEmpty>{modules.restrictedReason}</McmEmpty>
          ) : (
            <ul className="space-y-1.5 text-[12.5px]">
              {moduleLines.map((line) => (
                <li
                  key={line.label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2"
                >
                  <span className="min-w-0">
                    <span className="font-medium">{line.label}</span>
                    <span className="ml-2 text-[11px] beyu-muted">{line.owner}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11.5px] tabular-nums">{line.count ?? "—"}</span>
                    <DataStateBadge state={line.count === null ? "RESTRICTED" : "ACTUAL"} />
                  </span>
                  {line.note && <span className="w-full text-[10.5px] beyu-muted">{line.note}</span>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] beyu-muted">
            Counts reflect records owned by each canonical module and linked to these companies. MCM
            creates no module record and keeps no copy of one.
          </p>
        </Panel>
      </div>
    </div>
  );
}

/**
 * One branch of the visible hierarchy.
 *
 * Rendering is recursive with a depth cap: the database refuses a parent cycle
 * (0076 trigger), but a malformed read must never be able to hang a server
 * component.
 */
function HierarchyBranch({ node, depth = 0 }: { node: HierarchyNode; depth?: number }) {
  const lifecycle = node.profile?.mcmLifecycleState ?? node.status;
  return (
    <div className="min-w-0">
      <div
        className="flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--beyu-line)] px-3 py-2"
        style={{ marginLeft: `${Math.min(depth, 8) * 12}px` }}
      >
        <span className="font-mono text-[10.5px] beyu-muted">{node.code}</span>
        <span className="min-w-0 truncate text-[13px] font-medium">{node.legalName}</span>
        <Badge tone="navy">{node.entityType}</Badge>
        <Badge
          tone={
            lifecycle === "ACTIVE"
              ? "green"
              : lifecycle === "DISSOLVED" || lifecycle === "ARCHIVED"
                ? "slate"
                : "amber"
          }
        >
          {lifecycle}
        </Badge>
        {node.profile === null ? (
          <Badge tone="amber">No MCM profile</Badge>
        ) : node.profile.verificationState !== "VERIFIED" ? (
          <Badge tone="amber">Registration unverified</Badge>
        ) : null}
        {node.parentOutsideScope && <Badge tone="slate">parent outside your scope</Badge>}
        <span className="ml-auto whitespace-nowrap font-mono text-[10.5px] beyu-muted">
          {node.countryCode} · {node.functionalCurrency}
        </span>
      </div>
      {depth < 8 &&
        node.children.map((child) => <HierarchyBranch key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}
