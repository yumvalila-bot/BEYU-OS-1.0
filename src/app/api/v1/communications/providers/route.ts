/**
 * GET /api/v1/communications/providers — list providers
 * POST /api/v1/communications/providers — create provider (HIGH-RISK)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { listProviders, createProvider } from "@/lib/communications/provider-registry";
import { isValidChannel } from "@/lib/communications/channel-registry";

export const dynamic = "force-dynamic";

const CreateProviderSchema = z.object({
  code: z.string().min(2).max(60).regex(/^[A-Z][A-Z0-9_]+$/),
  channelCode: z.string().min(2).max(20),
  providerType: z.string().min(2).max(60),
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  secretRef: z.string().max(120).optional(),
  signingSecretRef: z.string().max(120).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  countryCode: z.string().length(2).optional(),
  isDefault: z.boolean().optional(),
  priority: z.number().int().min(0).max(1000).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:provider.read",
      action: "communications.providers.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
    },
    async (ctx) => {
      const { searchParams } = new URL(request.url);
      const channel = searchParams.get("channel") ?? undefined;
      const providers = await listProviders(ctx.principal.tenantId, channel);
      // Never expose secret values — only refs (by construction, no secret column exists)
      const safe = providers.map((p) => ({
        id: p.id,
        code: p.code,
        channelCode: p.channelCode,
        providerType: p.providerType,
        name: p.name,
        status: p.status,
        healthStatus: p.healthStatus,
        countryCode: p.countryCode,
        tenantId: p.tenantId,
        isDefault: p.isDefault,
        priority: p.priority,
        capabilities: p.capabilities,
        lastSuccessAt: p.lastSuccessAt,
        lastFailureAt: p.lastFailureAt,
        failureCount: p.failureCount,
        createdAt: p.createdAt,
        // secretRef intentionally NOT returned in list — only via detail with audit
        hasSecret: !!p.secretRef,
        hasSigningSecret: !!p.signingSecretRef,
      }));
      return apiOk({ providers: safe, total: safe.length }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:provider.manage",
      action: "communications.providers.create",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "COMMUNICATION_PROVIDER" },
      databaseContext: "handler",
    },
    async (ctx) => {
      return withIdempotency(ctx, "communications.providers.create", await request.json().catch(() => ({})), async () => {
        const body = await parseBody(request, CreateProviderSchema);

        if (!isValidChannel(body.channelCode)) {
          return { status: 422, body: { error: { code: "INVALID_CHANNEL", message: `Channel ${body.channelCode} is not a known communications channel` } } };
        }

        const provider = await createProvider({
          tenantId: ctx.principal.tenantId,
          code: body.code,
          channelCode: body.channelCode,
          providerType: body.providerType,
          name: body.name,
          description: body.description,
          secretRef: body.secretRef,
          signingSecretRef: body.signingSecretRef,
          config: body.config,
          countryCode: body.countryCode,
          isDefault: body.isDefault,
          priority: body.priority,
          createdBy: ctx.principal.userId,
        });

        return {
          status: 201,
          body: {
            provider: {
              id: provider.id,
              code: provider.code,
              channelCode: provider.channelCode,
              providerType: provider.providerType,
              name: provider.name,
              status: provider.status,
              healthStatus: provider.healthStatus,
            },
          },
        };
      });
    },
  );
}
