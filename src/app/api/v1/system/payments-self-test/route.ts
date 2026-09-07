/**
 * GET /api/v1/system/payments-self-test
 *
 * Non-destructive installation and enforcement probe. Same content as
 * `npx tsx scripts/payments-selftest.ts`; exposed over HTTP for the deployment
 * dashboard.
 *
 * Permission follows the existing `/api/v1/system/self-test` (`audit:log.read`),
 * because a self-test readout is assurance-plane information and that is the
 * permission the platform already uses for exactly this kind of endpoint.
 *
 * It cannot be talked into reporting PASS for a live provider or for an unlocked
 * posting capability: those answers are read from the provider ledger and the
 * capability registry, not from a parameter.
 */
import { apiOk, guarded } from "@/lib/api";
import { runPaymentsSelfTest, SELFTEST_CONTRACT } from "@/lib/payments/selftest";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    { permission: "audit:log.read", action: "system.payments.self_test", audit: { objectType: "SYSTEM" }, rateLimit: { limit: 30, windowMs: 60_000 } },
    async (ctx) => {
      const result = await runPaymentsSelfTest();
      return apiOk(
        {
          ...result,
          contract: SELFTEST_CONTRACT,
          environment: {
            node: process.env.NODE_ENV ?? "development",
            providerCredentialMounted: false,
            note: "No provider credential is present in this environment; REAL_PROVIDER_INTEGRATION remains BLOCKED_EXTERNAL_DEPENDENCY regardless of what the checks pass.",
          },
        },
        ctx.traceId,
      );
    },
  );
}
