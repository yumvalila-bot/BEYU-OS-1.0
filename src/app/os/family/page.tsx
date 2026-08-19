import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { beneficiaries, familyMembers, familyVaultItems, governanceBodies, legalEntities, parties, resolutions } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { Badge, Denied, EmptyState, Metric, Panel, stateTone } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const access = await requireAccess("family:member.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="family:member.read" />;
  const scope = await tenantScopeIds(access.principal); const tenantId = access.principal.tenantId;

  const [members, beneficiaryRows, vault, entities, councils, resolutionRows] = await Promise.all([
    db
      .select({
        id: familyMembers.id,
        name: parties.displayName,
        branch: familyMembers.branch,
        generation: familyMembers.generation,
        line: familyMembers.familyLine,
        direct: familyMembers.directDescendant,
        verification: familyMembers.verificationStatus,
        method: familyMembers.verificationMethod,
        verifiedBy: familyMembers.verifiedBy,
        kyc: parties.kycStatus,
        classification: familyMembers.classification,
      })
      .from(familyMembers)
      .innerJoin(parties, eq(parties.id, familyMembers.partyId))
      .where(inArray(familyMembers.tenantId, scope)),
    db.select().from(beneficiaries).where(inArray(beneficiaries.tenantId, scope)),
    db.select().from(familyVaultItems).where(inArray(familyVaultItems.tenantId, scope)),
    db.select().from(legalEntities),
    db.select().from(governanceBodies).where(inArray(governanceBodies.tenantId, scope)),
    db.select().from(resolutions).where(inArray(resolutions.tenantId, scope)),
  ]);

  const canVault = can(access.principal, "family:vault.read").allowed;
  const canBeneficiary = can(access.principal, "family:beneficiary.read").allowed;
  const familyBodies = councils.filter((c) => ["FAMILY_COUNCIL", "TRUSTEES"].includes(c.bodyType));

  return (
    <div className="space-y-6">
      <header>
        <div className="beyu-kicker text-[#b08d1c]">Family office — first-class BEYU OS capability</div>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Family governance, lineage, beneficiaries & vaults</h1>
        <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
          Family Office is never a separate OS. All family data is HIGHLY_RESTRICTED, protected by named
          grants, lineage verification, succession controls and full audit.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Registered family members" value={String(members.length)} sub={`${members.filter((m) => m.verification === "VERIFIED").length} verified`} />
        <Metric label="Verified direct descendants" value={String(members.filter((m) => m.direct && m.verification === "VERIFIED").length)} sub="eligibility precondition" tone="gold" />
        <Metric label="Beneficiary entitlements" value={canBeneficiary ? String(beneficiaryRows.length) : "Restricted"} sub={canBeneficiary ? `${beneficiaryRows.filter((b) => b.eligibility === "ELIGIBLE").length} eligible` : "grant required"} />
        <Metric label="Vault items" value={canVault ? String(vault.length) : "Restricted"} sub={canVault ? `${new Set(vault.map((v) => v.vaultType)).size} vault types` : "family:vault.read required"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel kicker="Family line · branch · generation" title="Lineage registry with verification provenance">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead><tr><th>Member</th><th>Line / branch</th><th>Gen</th><th>Direct descendant</th><th>Verification</th><th>KYC</th><th>Class</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td className="font-medium">{m.name}</td>
                    <td className="text-[11.5px]">{m.line} · {m.branch}</td>
                    <td className="tabular-nums">{m.generation}</td>
                    <td>{m.direct ? <Badge tone="green">DIRECT</Badge> : <span className="text-[11px] beyu-muted">by marriage/other</span>}</td>
                    <td><Badge tone={stateTone(m.verification)}>{m.verification}</Badge><div className="mt-0.5 text-[10.5px] beyu-muted">{m.method} · {m.verifiedBy ?? "—"}</div></td>
                    <td><Badge tone={stateTone(m.kyc)}>{m.kyc}</Badge></td>
                    <td><Badge tone="gold">{m.classification}</Badge></td>
                  </tr>
                ))}
                {members.length === 0 && <tr><td colSpan={7}><EmptyState message="No family members registered." /></td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] beyu-muted">
            Beneficiary eligibility requires verified lineage; the engine will not infer descent from names or documents alone.
          </p>
        </Panel>

        <Panel kicker="Family governance" title="Council, trustees & reserved matters">
          <div className="space-y-3">
            {familyBodies.map((b) => (
              <div key={b.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12.5px] font-semibold">{b.name}</span>
                  <Badge tone="navy">{b.bodyType}</Badge>
                </div>
                <div className="mt-1 text-[11.5px] beyu-muted">quorum ≥ {b.quorumMinimum} · majority {b.majorityRule}</div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {b.reservedMatters.map((m) => <Badge key={m} tone="gold">{m}</Badge>)}
                </div>
              </div>
            ))}
            <div>
              <div className="beyu-kicker beyu-muted">Family resolutions</div>
              <div className="mt-1 space-y-1">
                {resolutionRows
                  .filter((r) => familyBodies.some((b) => b.id === r.bodyId))
                  .map((r) => (
                    <div key={r.id} className="text-[11.5px]">
                      <span className="font-mono">{r.reference}</span> — {r.title} <Badge tone={stateTone(r.status)}>{r.status}</Badge>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel kicker="Beneficiary engine" title="Eligibility, entitlement & conditions">
          {canBeneficiary ? (
            <div className="overflow-x-auto">
              <table className="beyu-table">
                <thead><tr><th>Beneficiary</th><th>Trust</th><th>Class</th><th>Eligibility</th><th>Entitlement</th><th>Authority</th></tr></thead>
                <tbody>
                  {beneficiaryRows.map((b) => {
                    const member = members.find((m) => m.id === b.familyMemberId);
                    const res = resolutionRows.find((r) => r.id === b.approvedByResolutionId);
                    return (
                      <tr key={b.id}>
                        <td className="font-medium">{member?.name ?? b.familyMemberId}</td>
                        <td className="text-[11.5px]">{entities.find((e) => e.id === b.trustEntityId)?.legalName}</td>
                        <td><Badge tone="navy">{b.beneficiaryClass}</Badge></td>
                        <td><Badge tone={stateTone(b.eligibility)}>{b.eligibility}</Badge><div className="mt-0.5 max-w-xs text-[10.5px] beyu-muted">{b.eligibilityRationale}</div></td>
                        <td className="tabular-nums">{b.entitlementPct ? `${Number(b.entitlementPct).toFixed(2)}%` : "discretionary"}</td>
                        <td className="text-[11px] beyu-muted">{res ? `${res.reference} (${res.status})` : "—"}<div>verified by {b.verifiedBy ?? "—"}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="family:beneficiary.read is not granted to your roles." />
          )}
        </Panel>

        <Panel kicker="Vaults" title="Family · member · trust · emergency · credential · legacy">
          {canVault ? (
            <div className="space-y-2">
              {vault.map((v) => (
                <div key={v.id} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold">{v.title}</span>
                    <div className="flex gap-1">
                      <Badge tone="gold">{v.vaultType}</Badge>
                      <Badge tone={stateTone(v.classification)}>{v.classification}</Badge>
                    </div>
                  </div>
                  <div className="mt-1 text-[11.5px] beyu-muted">{v.description}</div>
                  <div className="mt-1 text-[11px] beyu-muted">
                    custodian {v.custodianRole}
                    {v.sealedUntil ? ` · sealed until ${v.sealedUntil}` : ""}
                    {v.successionInstruction ? ` · ${v.successionInstruction}` : ""}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState message="family:vault.read is not granted to your roles." />
          )}
          <p className="mt-3 text-[11px] beyu-muted">
            The credential vault stores custody assignments only — never secrets. Secrets live in the key
            management service and are referenced by identifier.
          </p>
        </Panel>
      </div>
    </div>
  );
}
