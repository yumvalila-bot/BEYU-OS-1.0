import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { requireAccess } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { Badge, Denied, EmptyState, Panel, stateTone, money } from "@/components/brand";
import { UjenziSectionNav } from "../sections";

export const dynamic = "force-dynamic";

export default async function UjenziPaymentsPage() {
  const access = await requireAccess("ujenzi:data.read");
  if (!access.allowed) return <Denied reason={access.reason} capability="ujenzi:data.read" />;

  return withTenantDatabaseContext(access.principal, async () => {
    const principal = access.principal;
    const allowedClassifications = classificationsAtOrBelow(principal.clearance);
    const tenantId = principal.tenantId;
    const certificateRows = await db
      .select()
      .from(s.ujenziPaymentCertificates)
      .where(and(eq(s.ujenziPaymentCertificates.tenantId, tenantId), inArray(s.ujenziPaymentCertificates.classification, allowedClassifications)))
      .orderBy(desc(s.ujenziPaymentCertificates.certificateNo))
      .limit(40);
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Ujenzi OS — payments</div>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight">Payment certificates</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Construction valuation records: gross value, retention and net per certificate. Certification emits PAYMENT_CERTIFIED and NEVER posts a journal — canonical financial truth and settlement remain in Finance OS (CAP_POSTING LOCKED).</p>
        </header>

        <UjenziSectionNav current="/os/ujenzi/payments" />

        <Panel kicker="Certificates" title="Valuation and certification history">
          <div className="overflow-x-auto">
            <table className="beyu-table">
              <thead>
                <tr>
                  <th>Cert no.</th>
                  <th>Gross</th>
                  <th>Retention</th>
                  <th>Net</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {certificateRows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-[11.5px]">{`#${row.certificateNo}`}</td>
                    <td className="tabular-nums text-[11.5px]">{money(row.grossValue, row.currency)}</td>
                    <td className="tabular-nums text-[11.5px]">{money(row.retention, row.currency)}</td>
                    <td className="tabular-nums text-[11.5px]">{money(row.netValue, row.currency)}</td>
                    <td>{<Badge tone={stateTone(row.status)}>{row.status}</Badge>}</td>
                  </tr>
                ))}
                {certificateRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState message="No payment certificates yet. Finance OS integration is the governed posting path." />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel kicker="Finance boundary" title="Why these never post">
          <p className="text-[12.5px] beyu-muted">
            A Ujenzi payment certificate is project-control truth: a valuation of work executed. The canonical
            financial consequence — journal entries, treasury movement, settlement — is owned exclusively by
            Finance OS through the governed integration. No Ujenzi code path holds CAP_POSTING or writes to
            journal tables; the certification result explicitly reports{" "}<span className="font-mono">journalsPosted: false</span> and{" "}
            <span className="font-mono">capPosting: LOCKED</span>.
          </p>
        </Panel>
      </div>
    );
  });
}
