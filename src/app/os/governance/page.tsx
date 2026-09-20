import { BodyLifecyclePanel } from "./body-lifecycle-panel";
import { listBodyChanges, canManageBodyChanges } from "@/lib/governance/body-lifecycle-service";
import { MembershipPanel } from "./membership-panel";
import { listMembershipChanges, canManageMembership } from "@/lib/governance/membership-service";
import { ActivationPanel } from "./activation-panel";
import { listBodyActivations } from "@/lib/governance/activation-service";
import { canManageAppointments } from "@/lib/governance/appointment-authority";
import { EstablishmentPanel } from "./establishment-panel";
import { listBodyEstablishments } from "@/lib/governance/establishment-service";
import { AppointmentPanel } from "./appointment-panel";
import { listBodyAppointments } from "@/lib/governance/appointment-service";
import { SimulationPanel } from "./simulation-panel";
import { CharterPanel } from "./charter-panel";
import { readBodyCharters, canManageCharters } from "@/lib/governance/charter-service";
import { currentCharterComposition } from "@/lib/governance/charter-rules";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceMembers, parties, policies, resolutions } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { can } from "@/lib/authz";
import { auditTrailsFor } from "@/lib/audit";
import {
  authorizeResolutionFollowUp,
  canDecideResolutions,
  canTableResolutions,
  votingSnapshots,
} from "@/lib/governance-vote-service";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { ProposeResolution } from "./propose";
import { VotePanel } from "./vote-panel";
import { ActionPanel } from "./action-panel";
import { listGovernanceActions } from "@/lib/governance/action-service";
import { GovernanceError } from "@/lib/governance";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const access = await requireAccess("governance:resolution.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="governance:resolution.read" />;
  return withTenantDatabaseContext(access.principal, async () => {

  const scope = await tenantScopeIds(access.principal);
  const allowedClassifications = classificationsAtOrBelow(access.principal.clearance);
  const bodyPredicate =
    access.principal.entityScope.length > 0
      ? and(
          inArray(governanceBodies.tenantId, scope),
          inArray(governanceBodies.legalEntityId, access.principal.entityScope),
        )
      : inArray(governanceBodies.tenantId, scope);
  const bodies = await db.select().from(governanceBodies).where(bodyPredicate);
  const charterViews = new Map(await Promise.all(bodies.map(async (body) => {
    const view = await readBodyCharters(access.principal, body.id);
    const composition = await currentCharterComposition(body);
    const { appointments } = await listBodyAppointments(access.principal, body.id);
    const { changes } = await listMembershipChanges(access.principal, body.id);
    const bodyLifecycle = await listBodyChanges(access.principal, body.id);
    const manageBodyLifecycle = await canManageBodyChanges(access.principal, body.id);
    const canManageMember = await canManageMembership(access.principal, body.id);
    const { plans } = await listBodyActivations(access.principal, body.id);
    const { proposals } = await listBodyEstablishments(access.principal, body.id);
    return [body.id, { ...view, bodyLifecycle, manageBodyLifecycle, appointments, proposals, plans, changes, canManageMember, canManageAppointments: await canManageAppointments(access.principal, body.id), canManage: body.status === "ACTIVE" && await canManageCharters(access.principal, body.id), canManageCharter: await canManageCharters(access.principal, body.id),
      composition: composition.coverage === "APPROVED_PENDING_ACTIVATION" ? "Initial charter approved, not effective; composition and activation remain blocked" : composition.coverage === "LEGACY_UNCHARTERED" ? "No adopted charter recorded (legacy coverage gap)" : composition.satisfied ? "Current composition satisfies adopted rules" : "Adopted charter requirements not satisfied; mutations are blocked" }] as const;
  })));
  const bodyIds = bodies.map((body) => body.id);
  const members =
    bodyIds.length > 0
      ? await db
          .select({
            id: governanceMembers.id,
            bodyId: governanceMembers.bodyId,
            seatRole: governanceMembers.seatRole,
            votingRights: governanceMembers.votingRights,
            appointedOn: governanceMembers.appointedOn, retiredOn: governanceMembers.retiredOn,
            partyId: governanceMembers.partyId, lifecycleStatus: governanceMembers.lifecycleStatus, lifecycleRevision: governanceMembers.lifecycleRevision,
            name: parties.displayName,
          })
          .from(governanceMembers)
          .innerJoin(parties, eq(parties.id, governanceMembers.partyId))
          .where(inArray(governanceMembers.bodyId, bodyIds))
      : [];
  const visible =
    bodyIds.length > 0
      ? await db
          .select()
          .from(resolutions)
          .where(
            and(
              inArray(resolutions.tenantId, scope),
              inArray(resolutions.bodyId, bodyIds),
              inArray(resolutions.classification, allowedClassifications),
            ),
          )
          .orderBy(resolutions.createdAt)
      : [];
  const execution = new Map(await Promise.all(visible.filter((r) => r.status === "APPROVED").map(async (r) => {
    const actions = await listGovernanceActions(access.principal, r.id);
    let canManage = false;
    try { await authorizeResolutionFollowUp(access.principal, r.id, true); canManage = true; }
    catch (error) { if (!(error instanceof GovernanceError)) throw error; }
    return [r.id, { actions, canManage }] as const;
  })));
  const canReadPolicies = can(access.principal, "governance:policy.read").allowed;
  const policyIds = [
    ...new Set(
      visible.flatMap((resolution) =>
        resolution.authorityPolicyId ? [resolution.authorityPolicyId] : [],
      ),
    ),
  ];
  const policyRows =
    canReadPolicies && policyIds.length > 0
      ? await db.select().from(policies).where(inArray(policies.id, policyIds))
      : [];

  /**
   * Provenance from the immutable ledger. This is what distinguishes a resolution
   * genuinely created through the governed mutation from one that was seeded:
   * a transactional resolution has audit records, seeded historical data does not.
   */
  const visibleIds = visible.map((r) => r.id);
  const [trails, snapshots, tableable, decidable] = await Promise.all([
    auditTrailsFor("RESOLUTION", visibleIds, scope),
    // Eligibility, window state, tally and quorum are all computed server-side.
    votingSnapshots(access.principal, visibleIds),
    canTableResolutions(access.principal, visibleIds),
    // Decision authority is resolved server-side too; the panel only renders it.
    canDecideResolutions(access.principal, visibleIds),
  ]);

  // A principal may only propose at or below their own clearance ceiling.
  const canPropose = can(access.principal, "governance:resolution.propose").allowed;
  const proposableClassifications = allowedClassifications;

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Governance execution engine</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Boards, committees, councils & decisions</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Every material decision is traceable to who, what, when, why, under which authority, on which
          data, under which policy, with which approvals and with which consequences.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {bodies.map((b) => {
          const seat = members.filter((m) => m.bodyId === b.id);
          return (
            <Panel key={b.id} kicker={b.bodyType} title={b.name}>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] beyu-muted">
                <Badge tone={stateTone(b.status)}>{b.status}</Badge>
                <span>quorum ≥ {b.quorumMinimum}</span>
                <span>· majority {b.majorityRule}</span>
              </div>
              <div className="mt-3">
                <div className="beyu-kicker beyu-muted">Seats</div>
                <ul className="mt-1 space-y-1">
                  {seat.map((m) => (
                    <li key={m.id} className="text-[12px]">
                      {m.name} <span className="beyu-muted">· {m.seatRole}{m.votingRights ? "" : " · non-voting"} · {m.appointedOn} – {m.retiredOn ?? "open term"} · {m.lifecycleStatus !== "ACTIVE" ? m.lifecycleStatus : m.appointedOn > new Date().toISOString().slice(0,10) ? "SCHEDULED" : m.retiredOn && m.retiredOn < new Date().toISOString().slice(0,10) ? "EXPIRED" : "CURRENT TERM"}</span>
                    </li>
                  ))}
                  {seat.length === 0 && <li className="text-[11.5px] beyu-muted">No seats recorded.</li>}
                </ul>
              </div>
              <div className="mt-3">
                <div className="beyu-kicker beyu-muted">Reserved matters</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {b.reservedMatters.map((m) => (
                    <Badge key={m} tone="gold">{m}</Badge>
                  ))}
                </div>
              </div>
              <EstablishmentPanel parentId={b.id} userId={access.principal.userId} canManage={charterViews.get(b.id)!.canManage && ["BOARD", "TRUSTEES"].includes(b.bodyType)} quorum={b.quorumMinimum} majority={b.majorityRule} proposals={charterViews.get(b.id)!.proposals.map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.status, revision: p.revision, proposedByUserId: p.proposedByUserId, bodyId: p.bodyId }))} />
              {seat.length > 0 && <MembershipPanel bodyId={b.id} userId={access.principal.userId} partyId={access.principal.partyId} canManage={charterViews.get(b.id)!.canManageMember} members={seat} changes={charterViews.get(b.id)!.changes.map(c=>({id:c.id,memberId:c.memberId,command:c.command,status:c.status,proposedByUserId:c.proposedByUserId,appliedAt:c.appliedAt?.toISOString()??null}))}/>}
              <BodyLifecyclePanel bodyId={b.id} status={b.status} revision={charterViews.get(b.id)!.bodyLifecycle.revision} userId={access.principal.userId} canManage={charterViews.get(b.id)!.manageBodyLifecycle} changes={charterViews.get(b.id)!.bodyLifecycle.changes.map(c=>({...c,appliedAt:c.appliedAt?.toISOString()??null}))}/>
              <AppointmentPanel initial={b.status === "DRAFT"} bodyId={b.id} userId={access.principal.userId} canManage={charterViews.get(b.id)!.canManageAppointments} appointments={charterViews.get(b.id)!.appointments.map((a) => ({ id: a.id, authorityBodyId: a.authorityBodyId, initialCharterId: a.initialCharterId, status: a.status, revision: a.revision, nomineeUserId: a.nomineeUserId, nominatedByUserId: a.nominatedByUserId, seatRole: a.seatRole, votingRights: a.votingRights, appointedOn: a.appointedOn, retiredOn: a.retiredOn, documentId: a.documentId, rationale: a.rationale, memberId: a.memberId }))} />
              {(b.status === "DRAFT" || charterViews.get(b.id)!.plans.length > 0) && <ActivationPanel bodyId={b.id} userId={access.principal.userId} canManage={b.status === "DRAFT" && charterViews.get(b.id)!.canManageAppointments}
                plans={charterViews.get(b.id)!.plans.map((p) => ({ id:p.id,status:p.status,revision:p.revision,authorityBodyId:p.authorityBodyId,initialCharterId:p.initialCharterId,nominationIds:p.nominationIds,proposedByUserId:p.proposedByUserId,activatedAt:p.activatedAt?.toISOString() ?? null }))}
                accepted={charterViews.get(b.id)!.appointments.filter((a) => a.status === "ACCEPTED" && a.initialCharterId).map((a) => ({ id:a.id,seatRole:a.seatRole,nomineeUserId:a.nomineeUserId }))} />}
              <CharterPanel bodyId={b.id} userId={access.principal.userId} quorum={b.quorumMinimum} majority={b.majorityRule}
                initial={b.status === "DRAFT"} canManage={charterViews.get(b.id)!.canManageCharter} charters={charterViews.get(b.id)!.charters} composition={charterViews.get(b.id)!.composition} />
            </Panel>
          );
        })}
      </div>

      <ProposeResolution
        canPropose={canPropose}
        clearance={access.principal.clearance}
        classifications={[...proposableClassifications]}
        bodies={bodies
          .filter((b) => b.status === "ACTIVE")
          .map((b) => ({
            id: b.id,
            name: b.name,
            code: b.code,
            majorityRule: b.majorityRule,
            reservedMatters: b.reservedMatters,
          }))}
      />

      <Panel kicker="Decision record" title="Resolutions">
        {visible.length === 0 ? (
          <EmptyState message="No resolutions are visible at your clearance level." />
        ) : (
          <div className="space-y-4">
            {visible.map((r) => {
              const body = bodies.find((b) => b.id === r.bodyId);
              const policy = policyRows.find((p) => p.id === r.authorityPolicyId);
              const total = r.votesFor + r.votesAgainst + r.votesAbstain;
              return (
                <div key={r.id} id={`resolution-${r.id}`} data-resolution-id={r.id} className="rounded-lg border border-[color:var(--beyu-line)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[11.5px] beyu-muted">{r.reference}</span>
                      <div className="text-[14px] font-semibold">{r.title}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={stateTone(r.status)}>{r.status}</Badge>
                      <Badge tone="navy">{r.category}</Badge>
                      <Badge tone={stateTone(r.classification)}>{r.classification}</Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-[12.5px]">{r.summary}</p>
                  <dl className="mt-3 grid gap-2 text-[11.5px] lg:grid-cols-2">
                    <div><span className="beyu-kicker beyu-muted">Why </span>{r.rationale}</div>
                    <div><span className="beyu-kicker beyu-muted">Data basis </span>{r.dataBasis}</div>
                    <div>
                      <span className="beyu-kicker beyu-muted">Authority </span>
                      {body?.name}
                      {policy
                        ? ` under ${policy.code}@${policy.version}`
                        : r.authorityPolicyId && !canReadPolicies
                          ? " · policy details restricted"
                          : ""}
                    </div>
                    <div><span className="beyu-kicker beyu-muted">Consequences </span>{r.consequences}</div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] beyu-muted">
                    <span>proposed by {r.proposedBy}</span>
                    <span>· majority required {r.requiredMajority}</span>
                    <span>· quorum {r.quorumMet ? "met" : "NOT met"}</span>
                    <span>· votes {r.votesFor} for / {r.votesAgainst} against / {r.votesAbstain} abstain{total ? ` (${total} cast)` : ""}</span>
                    <span>· decided {r.decisionDate ? new Date(r.decisionDate).toISOString().slice(0, 10) : "pending"}</span>
                  </div>

                  {snapshots.get(r.id) && (
                    <VotePanel
                      snapshot={snapshots.get(r.id)!}
                      status={r.status}
                      canTable={tableable.has(r.id)}
                      canDecide={decidable.has(r.id)}
                      decidedByMemberId={r.decidedByMemberId}
                      decisionDate={r.decisionDate ? r.decisionDate.toISOString() : null}
                    />
                  )}

                  <SimulationPanel resolutionId={r.id} />
                  {execution.has(r.id) && <ActionPanel resolutionId={r.id} userId={access.principal.userId}
                    canManage={execution.get(r.id)!.canManage}
                    actions={execution.get(r.id)!.actions.map((action) => ({ ...action,
                      dueAt: action.dueAt?.toISOString() ?? null, closedAt: action.closedAt?.toISOString() ?? null }))} />}

                  {(() => {
                    const trail = trails.get(r.id) ?? [];
                    if (trail.length === 0) {
                      return (
                        <div className="mt-2 text-[11px] beyu-muted">
                          <Badge tone="slate">REFERENCE DATA</Badge>{" "}
                          No entries in the immutable ledger — this record predates the governed
                          mutation and was not produced by a transaction in this system.
                        </div>
                      );
                    }
                    const origin = trail[trail.length - 1];
                    return (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[11px] text-[#b08d1c]">
                          <Badge tone="green">GOVERNED</Badge>{" "}
                          {trail.length} ledger {trail.length === 1 ? "entry" : "entries"} · originated{" "}
                          {new Date(origin.occurredAt).toISOString().slice(0, 16).replace("T", " ")}
                        </summary>
                        <ul className="mt-1.5 space-y-1">
                          {trail.map((a) => (
                            <li key={a.id} className="text-[11px] beyu-muted">
                              <span className="font-mono">{a.action}</span> · {a.outcome} ·{" "}
                              {new Date(a.occurredAt).toISOString().slice(0, 16).replace("T", " ")}
                              {a.authority ? ` · under ${a.authority}` : ""}
                              <span className="ml-1 font-mono opacity-70">{a.hash.slice(0, 12)}…</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );  });
}
