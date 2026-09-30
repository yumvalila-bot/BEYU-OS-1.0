import { apiOk, guarded, parseBody } from "@/lib/api";
import { listRegistryFamilyMembers, registerFamilyMember } from "@/lib/admin/registry-service";
import { governedRefusal, registerFamilyMemberSchema } from "../../../../_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/admin/registry/families/[id]/members — the membership rows of
 * one canonical family. Each person carries their GlobalUserID and employment
 * flag ONLY when those rows actually exist — the API never fabricates a user
 * or employment relationship. Read-only.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "family:member.read",
      action: "registry.family.members.read",
      audit: { objectType: "FAMILY", objectId: id },
    },
    async (ctx) => {
      try {
        return apiOk(await listRegistryFamilyMembers(ctx.principal, id), ctx.traceId);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * POST /api/v1/admin/registry/families/[id]/members — register a family
 * membership relationship over an existing Party (member ≠ user). Descent
 * requires a governed parent; affinal relationships attach through
 * linkedToMemberId and never create descent; duplicates are controlled
 * refusals. Every act is audited with an enterprise event.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "family:member.manage",
      action: "registry.family.member.add",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "FAMILY_MEMBER", objectId: id },
    },
    async (ctx) => {
      const body = await parseBody(request, registerFamilyMemberSchema);
      try {
        const result = await registerFamilyMember(
          ctx.principal,
          { ...body, familyId: id },
          ctx.traceId,
        );
        return apiOk(result, ctx.traceId, 201);
      } catch (err) {
        const refusal = governedRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
