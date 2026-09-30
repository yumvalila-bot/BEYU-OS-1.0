import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { can } from "@/lib/authz";
import { withTenantDatabaseContext, tenantScopeIds } from "@/lib/tenant-scope";
import { listRegistryFamilies } from "@/lib/admin/registry-service";
import { Badge, Denied, EmptyState, Panel, stateTone } from "@/components/brand";
import { RegisterFamilyForm } from "../../registration/registry-actions";

export const dynamic = "force-dynamic";

/**
 * Family Office — the canonical FAMILIES registry (governed domain inside
 * BEYU OS, never a separate OS or tenant). Read-only presentation over the
 * registry read service; registration POSTs to the guarded API.
 */
export default async function FamiliesPage() {
  const access = await requireAccess("family:member.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="family:member.read" />;
  const principal = access.principal;

  return withTenantDatabaseContext(principal, async () => {
    const scope = await tenantScopeIds(principal);
    const [families, tenantRows] = await Promise.all([
      listRegistryFamilies(principal),
      db
        .select({ id: tenants.id, code: tenants.code, name: tenants.name })
        .from(tenants)
        .where(inArray(tenants.id, scope))
        .orderBy(tenants.code),
    ]);

    const canManage = can(principal, "family:member.manage").allowed;

    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Family Office · registry</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight">Families</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">
            The governed family domain — a family is a canonical entity with an ORGANIZATION party
            identity, not a tenant, not an OS. Membership is a relationship: it never creates a user,
            a role or a permission.
          </p>
        </header>

        <Panel
          title="Registered families"
          kicker="families · canonical"
          action={
            canManage ? (
              <Link href="/os/registration" className="text-[12px] text-[#a8830f] hover:underline">
                Register a family →
              </Link>
            ) : null
          }
        >
          {families.length === 0 ? (
            <EmptyState message="No families registered in your scope." />
          ) : (
            <div className="divide-y divide-[color:var(--beyu-line)]">
              {families.map((f) => (
                <Link
                  key={f.id}
                  href={`/os/family/families/${f.id}`}
                  className="flex items-center justify-between py-2.5 text-[13px] hover:underline"
                >
                  <span>
                    {f.displayName} <span className="beyu-muted">({f.code})</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={stateTone(f.classification)}>{f.classification}</Badge>
                    <Badge tone={stateTone(f.status)}>{f.status}</Badge>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {canManage ? (
          <Panel title="Register a family" kicker="one transaction · party + family">
            <RegisterFamilyForm tenants={tenantRows} />
          </Panel>
        ) : null}
      </div>
    );
  });
}
