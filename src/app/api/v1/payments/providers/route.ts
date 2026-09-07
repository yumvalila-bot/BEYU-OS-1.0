/**
 * GET /api/v1/payments/providers
 *
 * The §58 contract, as an endpoint: per provider, ten separate status fields,
 * the evidence for each, and the list of what it is blocked on. There is
 * deliberately no `integrated` boolean anywhere in this response, and the
 * response is assembled from the registry + the registered connection rows, so
 * an operator sees both "what we claimed" and "what is actually mounted".
 */
import { desc, sql } from "drizzle-orm";
import { apiOk, guarded } from "@/lib/api";
import { db } from "@/db";
import { paymentProviderConnections, paymentProviders } from "@/db/schema";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { allStatuses, PROVIDER_REGISTRY_VERSION, assertNoLiveIntegrationClaim } from "@/lib/payments/providers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:payments.read",
      action: "finance.payments.providers.read",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const scope = await tenantScopeIds(ctx.principal);
      const registry = allStatuses();
      const claims = registry.map((s) => ({ provider: s.provider, ...assertNoLiveIntegrationClaim(s) }));
      const connections = await db
        .select({
          id: paymentProviderConnections.id,
          providerCode: paymentProviderConnections.providerCode,
          label: paymentProviderConnections.label,
          environment: paymentProviderConnections.environment,
          enabled: paymentProviderConnections.enabled,
          tenantId: paymentProviderConnections.tenantId,
          legalEntityId: paymentProviderConnections.legalEntityId,
          countryCode: paymentProviderConnections.countryCode,
          approvalReference: paymentProviderConnections.approvalReference,
        })
        .from(paymentProviderConnections)
        .where(sql`${paymentProviderConnections.tenantId} IN (${sql.join(scope.map((s) => sql`${s}`), sql`, `)})`)
        .orderBy(desc(paymentProviderConnections.createdAt))
        .limit(50);
      const registered = await db
        .select({
          code: paymentProviders.code,
          displayName: paymentProviders.displayName,
          kind: paymentProviders.kind,
          countryCode: paymentProviders.countryCode,
          integrationStatus: paymentProviders.integrationStatus,
          contractStatus: paymentProviders.contractStatus,
          credentialStatus: paymentProviders.credentialStatus,
          apiAvailability: paymentProviders.apiAvailability,
          webhookModel: paymentProviders.webhookModel,
          settlementModel: paymentProviders.settlementModel,
          signatureScheme: paymentProviders.signatureScheme,
          enabledBy: paymentProviders.enabledBy,
          approvalReference: paymentProviders.approvalReference,
          blockedReason: paymentProviders.blockedReason,
        })
        .from(paymentProviders);

      return apiOk(
        {
          registryVersion: PROVIDER_REGISTRY_VERSION,
          providers: registry,
          mountedConnections: connections,
          registeredProviderRows: registered,
          integrity: {
            liveClaimsInternallyConsistent: claims.every((c) => c.ok),
            violations: claims.filter((c) => !c.ok),
          },
          realProviderIntegration: "BLOCKED_EXTERNAL_DEPENDENCY",
          note: "A status field may only be advanced by a governed configuration write with evidence, through the admin DSN. No endpoint on this system advances one.",
        },
        ctx.traceId,
      );
    },
  );
}
