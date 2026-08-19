import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies, governanceMembers, parties, policies, resolutions } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { auditTrailsFor } from "@/lib/audit";
import { CLASSIFICATION_ORDER, classificationRank } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { ProposeResolution } from "./propose";

export const dynamic = "force-dynamic";

export default async function GovernancePage() {
  const access = await requireAccess("governance:resolution.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="governance:resolution.read" />;

  const scope = await tenantScopeIds(access.principal);
  const [bodies, members, resolutionRows, policyRows] = await Promise.all([
    db.select().from(governanceBodies).where(inArray(governanceBodies.tenantId, scope)),
    db
      .select({
        id: governanceMembers.id,
        bodyId: governanceMembers.bodyId,
        seatRole: governanceMembers.seatRole,
        votingRights: governanceMembers.votingRights,
        name: parties.displayName,
      })
      .from(governanceMembers)
      .innerJoin(parties, eq(parties.id, governanceMembers.partyId)),
    db.select().from(resolutions).where(inArray(resolutions.tenantId, scope)).orderBy(resolutions.createdAt),
    db.select().from(policies),
  ]);

  const visible = resolutionRows.filter(
    (r) => classificationRank(r.classification) <= classificationRank(access.principal.clearance),
  );

  /**
   * Provenance from the immutable ledger. This is what distinguishes a resolution
   * genuinely created through the governed mutation from one that was seeded:
   * a transactional resolution has audit records, seeded historical data does not.
   */
  const trails = await auditTrailsFor(
    "RESOLUTION",
    visible.map((r) => r.id),
    scope,
  );

  // A principal may only propose at or below their own clearance ceiling.
  const canPropose = can(access.principal, "governance:resolution.propose").allowed;
  const proposableClassifications = CLASSIFICATION_ORDER.filter(
    (c) => classificationRank(c) <= classificationRank(access.principal.clearance),
  );

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
                      {m.name} <span className="beyu-muted">· {m.seatRole}{m.votingRights ? "" : " · non-voting"}</span>
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
                <div key={r.id} className="rounded-lg border border-[color:var(--beyu-line)] p-4">
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
                    <div><span className="beyu-kicker beyu-muted">Authority </span>{body?.name}{policy ? ` under ${policy.code}@${policy.version}` : ""}</div>
                    <div><span className="beyu-kicker beyu-muted">Consequences </span>{r.consequences}</div>
                  </dl>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px] beyu-muted">
                    <span>proposed by {r.proposedBy}</span>
                    <span>· majority required {r.requiredMajority}</span>
                    <span>· quorum {r.quorumMet ? "met" : "NOT met"}</span>
                    <span>· votes {r.votesFor} for / {r.votesAgainst} against / {r.votesAbstain} abstain{total ? ` (${total} cast)` : ""}</span>
                    <span>· decided {r.decisionDate ? new Date(r.decisionDate).toISOString().slice(0, 10) : "pending"}</span>
                  </div>

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
  );
}
