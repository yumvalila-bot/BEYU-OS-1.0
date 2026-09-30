import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryParties, registerParty } from "@/lib/admin/registry-service";
import { governedRefusal, registerPartySchema } from "../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/parties — canonical person Party listing within
 * the principal's resolved tenant scope (via any in-scope relationship), with
 * the controlled duplicate-conflict list surfaced alongside. Read-only.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:user.read",
      action: "registry.party.read",
      audit: { objectType: "PARTY" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams.get("q") ?? undefined;
      return apiOk(await listRegistryParties(ctx.principal, q), ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/admin/registry/parties — register a canonical PERSON Party
 * (identity master record). Creates NO login identity — person ≠ user.
 * A duplicate email/name+birthdate is a controlled DUPLICATE refusal naming
 * the existing Party: identities are never silently merged or duplicated.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "identity:party.register",
      action: "registry.party.register",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "PARTY" },
    },
    async (ctx) => {
      const body = await parseBody(request, registerPartySchema);
      try {
        const result = await registerParty(ctx.principal, body, ctx.traceId);
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
