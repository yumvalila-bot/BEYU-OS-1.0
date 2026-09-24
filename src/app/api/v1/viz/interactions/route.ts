/**
 * Holograph — governed spatial interactions.
 *
 * POST → request a governed interaction (presentation, navigation or
 *        workflow/approval DELEGATION). Permission: viz:interaction.execute.
 *        Every request — including every DENIED one — is ledgered
 *        (viz_interactions) + audited + evented atomically. Delegation
 *        requests create NO workflow state and execute NOTHING: the target
 *        governed workflow engine owns approval, posting and execution.
 *        CAP_POSTING remains LOCKED; no interaction path posts anything.
 *
 * GET  → the interaction ledger for the principal's tenant (denied rows
 *        included — the ledger is the capability's security record).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { listInteractions, requestInteraction } from "@/lib/viz/interactions";
import { VIZ_INTERACTION_OUTCOMES, VIZ_INTERACTION_TARGET_DOMAINS, VIZ_INTERACTION_TYPES } from "@/db/schema/visualization";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import { vizActor, vizErrorResponse } from "../_shared";

const RequestSchema = z
  .object({
    interactionType: z.enum(VIZ_INTERACTION_TYPES as unknown as [string, ...string[]]),
    sector: z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]]).optional(),
    sceneId: z.string().trim().min(1).max(200).nullish(),
    twinId: z.string().trim().min(1).max(200).nullish(),
    objectRef: z.string().trim().min(1).max(300).nullish(),
    targetDomain: z.enum(VIZ_INTERACTION_TARGET_DOMAINS as unknown as [string, ...string[]]).nullish(),
    targetRef: z.string().trim().min(1).max(300).nullish(),
    deviceId: z.string().trim().min(1).max(200).nullish(),
  })
  .strict();

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:interaction.execute",
      action: "viz.interaction.request",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "VIZ_INTERACTION" },
    },
    async (ctx) => {
      const body = await parseBody(request, RequestSchema);
      try {
        const result = await requestInteraction(
          {
            interactionType: body.interactionType as (typeof VIZ_INTERACTION_TYPES)[number],
            sector: body.sector as (typeof VIZ_SECTOR_CODES)[number] | undefined,
            sceneId: body.sceneId ?? null,
            twinId: body.twinId ?? null,
            objectRef: body.objectRef ?? null,
            targetDomain: body.targetDomain as (typeof VIZ_INTERACTION_TARGET_DOMAINS)[number] | null,
            targetRef: body.targetRef ?? null,
            deviceId: body.deviceId ?? null,
          },
          vizActor(ctx),
          ctx.principal,
        );
        // DENIED results are 200 with outcome DENIED: the request was
        // processed (and audited); the 403 class is reserved for the
        // route-level permission boundary above.
        return NextResponse.json({ interaction: result });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:interaction.execute",
      action: "viz.interaction.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "VIZ_INTERACTION" },
    },
    async (ctx) => {
      try {
        const params = new URL(request.url).searchParams;
        const opts: Parameters<typeof listInteractions>[1] = {};
        const t = params.get("interactionType");
        if (t && (VIZ_INTERACTION_TYPES as readonly string[]).includes(t)) opts.interactionType = t as (typeof VIZ_INTERACTION_TYPES)[number];
        const o = params.get("outcome");
        if (o && (VIZ_INTERACTION_OUTCOMES as readonly string[]).includes(o)) opts.outcome = o as (typeof VIZ_INTERACTION_OUTCOMES)[number];
        const sid = params.get("sceneId");
        if (sid) opts.sceneId = sid;
        const lim = params.get("limit");
        if (lim) opts.limit = Number(lim);
        const interactions = await listInteractions(ctx.principal, opts);
        return NextResponse.json({ interactions });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
