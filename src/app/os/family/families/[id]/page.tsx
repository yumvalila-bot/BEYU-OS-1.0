import Link from "next/link";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { getRegistryFamily, listRegistryFamilyMembers } from "@/lib/admin/registry-service";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { RegisterFamilyMemberForm } from "../../../registration/registry-actions";

export const dynamic = "force-dynamic";

/**
 * Family detail — ONE canonical family with its membership relationships.
 *
 * Presentation only. Each person shows their GlobalUserID and employment flag
 * ONLY when those rows actually exist (the read service never fabricates an
 * edge). Adding a member POSTs to the guarded registry API.
 */
export default async function FamilyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const access = await requireAccess("family:member.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="family:member.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    let family: Awaited<ReturnType<typeof getRegistryFamily>>;
    try {
      family = await getRegistryFamily(principal, id);
    } catch {
      return <Denied reason={`Family ${id} is not in your scope.`} capability="family:member.read" />;
    }
    const { items: members } = await listRegistryFamilyMembers(principal, id);
    const canManage = can(principal, "family:member.manage").allowed;

    // Person parties for the add-member select: any in-scope party (the
    // registry service enforces membership uniqueness server-side).
    const { listRegistryParties } = await import("@/lib/admin/registry-service");
    const { items: persons } = await listRegistryParties(principal);

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">
            <Link href="/os/family/families" className="hover:underline">
              Families
            </Link>{" "}
            · {family.code}
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">{family.displayName}</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            Canonical family entity · party {family.partyId} · tenant {family.tenantId}. Membership is
            a relationship row — member ≠ user, membership ≠ role, and marriage never creates
            descent.
          </p>
          <div className="mt-3 flex gap-2">
            <Badge tone={stateTone(family.status)}>{family.status}</Badge>
            <Badge tone={stateTone(family.classification)}>{family.classification}</Badge>
          </div>
        </header>

        <Panel title="Members" kicker="governed memberships">
          {members.length === 0 ? (
            <EmptyState message="No members registered for this family." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="beyu-kicker beyu-muted">
                  <tr>
                    <th className="py-2 pr-3">Person</th>
                    <th className="py-2 pr-3">Relationship</th>
                    <th className="py-2 pr-3">Gen</th>
                    <th className="py-2 pr-3">Branch</th>
                    <th className="py-2 pr-3">Membership</th>
                    <th className="py-2 pr-3">Verification</th>
                    <th className="py-2 pr-3">GlobalUserID</th>
                    <th className="py-2">Employed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--beyu-line)]">
                  {members.map((m) => (
                    <tr key={m.id}>
                      <td className="py-2 pr-3">{m.displayName}</td>
                      <td className="py-2 pr-3 font-mono text-[11.5px]">{m.relationshipToParent}</td>
                      <td className="py-2 pr-3">{m.generation}</td>
                      <td className="py-2 pr-3">{m.branch}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={stateTone(m.membershipStatus)}>{m.membershipStatus}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={stateTone(m.verificationStatus)}>{m.verificationStatus}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-[11px]">
                        {m.globalUserId ?? "— not a user —"}
                      </td>
                      <td className="py-2">{m.employed ? "yes" : "no"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {canManage ? (
          <Panel title="Add a member" kicker="relationship registration · guarded API">
            <RegisterFamilyMemberForm
              familyId={family.id}
              persons={persons.map((p) => ({ id: String(p.id), displayName: String(p.displayName) }))}
              members={members.map((m) => ({
                id: m.id,
                displayName: m.displayName,
                relationshipToParent: m.relationshipToParent,
              }))}
            />
          </Panel>
        ) : null}
      </div>
    );
  });
}
