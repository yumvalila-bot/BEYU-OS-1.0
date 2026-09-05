import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ledgerAccounts } from "@/db/schema";
import { apiOk, guarded } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/finance/accounts
 * Read the Chart of Accounts within the caller's tenant scope.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:ledger.read",
      action: "finance.accounts.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "LEDGER_ACCOUNT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const accountType = url.searchParams.get("accountType");
      const activeFilter = url.searchParams.get("active");

      const scope = await tenantScopeIds(ctx.principal);
      const conditions = [inArray(ledgerAccounts.tenantId, scope)];

      if (accountType) {
        conditions.push(eq(ledgerAccounts.accountType, accountType));
      }
      if (activeFilter !== null) {
        conditions.push(eq(ledgerAccounts.active, activeFilter === "true"));
      }

      const accounts = await db
        .select()
        .from(ledgerAccounts)
        .where(and(...conditions))
        .orderBy(ledgerAccounts.code);

      return apiOk(
        {
          accounts,
          total: accounts.length,
        },
        ctx.traceId,
      );
    },
  );
}
