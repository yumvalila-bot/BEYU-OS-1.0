import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziClaimsPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const claimRows = await db
      .select()
      .from(s.ujenziClaims)
      .where(and(eq(s.ujenziClaims.tenantId, tenantId), inArray(s.ujenziClaims.classification, allowedClassifications)))
      .orderBy(desc(s.ujenziClaims.createdAt))
      .limit(40);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — claims</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Claims register</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Notices, review, decision and settlement with evidence references into the canonical documents registry. A claim is commercial record, never an automatic financial mutation.</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/claims" />

        <Panel kicker="Register" title="Claims lifecycle">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Title</th>
                  <th>Claimant</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {claimRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{row.code}</td>
                    <td className="font-medium">{row.title}</td>
                    <td className="text-[11.5px]">{row.claimant ?? "—"}</td>
                    <td className="tabular-nums text-[11.5px]">{row.amount ? money(row.amount, row.currency) : "—"}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {claimRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No claims recorded. Submission emits CLAIM_SUBMITTED." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  });
}
