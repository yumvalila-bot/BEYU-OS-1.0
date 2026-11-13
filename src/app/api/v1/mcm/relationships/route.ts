import { apiOk, guarded, parseBody } from "@/lib/api";
import { McmError } from "@/lib/mcm/model";
import { endRelationship, recordRelationship } from "@/lib/mcm/services";
import { endRelationshipSchema, mcmRefusal, relationshipSchema } from "../_shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/v1/mcm/relationships — record an effective-dated non-ownership
 * relationship between two legal entities.
 *
 * OWNERSHIP IS NOT RECORDED HERE. The relationship enum has no ownership member,
 * because ownership truth belongs to the canonical registry and is validated,
 * never re-declared, inside MCM.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:relationship.manage",
      action: "mcm.relationship.record",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "ENTITY_RELATIONSHIP" },
    },
    async (ctx) => {
      const body = await parseBody(request, relationshipSchema);
      try {
        return apiOk(await recordRelationship(ctx.principal, body, ctx.traceId), ctx.traceId, 201);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}

/**
 * PATCH /api/v1/mcm/relationships?id=… — end-date a relationship.
 *
 * Relationships are never deleted: an ended relationship is history, and history
 * is what a group hierarchy is reconstructed from.
 */
export async function PATCH(request: Request) {
  return guarded(
    request,
    {
      permission: "mcm:relationship.manage",
      action: "mcm.relationship.end_date",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "ENTITY_RELATIONSHIP" },
    },
    async (ctx) => {
      const body = await parseBody(request, endRelationshipSchema);
      const id = new URL(request.url).searchParams.get("id");
      try {
        if (!id) {
          throw new McmError("QUERY_PARAMETER_REQUIRED", 'The query parameter "id" is required.', 422);
        }
        return apiOk(await endRelationship(ctx.principal, { relationshipId: id, ...body }, ctx.traceId), ctx.traceId);
      } catch (err) {
        const refusal = mcmRefusal(err, ctx.traceId);
        if (refusal) return refusal;
        throw err;
      }
    },
  );
}
