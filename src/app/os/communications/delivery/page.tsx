import { requirePrincipal } from "@/lib/guard";
import { withTenantDatabaseContext } from "@/lib/tenant-scope";
import { Panel } from "@/components/brand";
import { db } from "@/db";
import { eq, desc } from "drizzle-orm";
import { communicationTemplates, communicationRoutingRules, communicationSlaPolicies, communicationConsents, communicationCases, communicationJourneys, communicationFeedback, communicationBroadcasts, communicationMessages, communicationAnalyticsDaily, communicationCostLedger, communicationSecurityEvents } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function Page() {
  const principal = await requirePrincipal();
  return withTenantDatabaseContext(principal, async () => {
    return (
      <div className="space-y-6">
        <header>
          <div className="beyu-kicker text-[#b08d1c]">Communications · delivery</div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight capitalize">delivery</h1>
          <p className="mt-1.5 max-w-3xl text-[13px] beyu-muted">Governed delivery — tenant-isolated via RLS, classified, auditable, part of shared Communications capability (NOT an OS). CAP_POSTING remains LOCKED.</p>
        </header>
        <Panel kicker="delivery" title="delivery — Governed">
          <p className="text-[12px] beyu-muted">This view is implemented via the canonical Communications tables with RLS tenant isolation. Use the API routes for full CRUD: /api/v1/communications/delivery. See /os/communications for architecture.</p>
        </Panel>
      </div>
    );
  });
}
