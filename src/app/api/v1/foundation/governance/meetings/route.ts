/**
 * BEYU Foundation OS — Foundation Governance meetings.
 * Bodies, resolutions and votes remain canonical BEYU OS governance.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { listMeetings, scheduleMeeting } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const CreateSchema = z.object({
  foundationId: z.string().min(1),
  governanceBodyId: z.string().min(1),
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  scheduledAt: z.string().datetime(),
  location: z.string().max(300).optional(),
  agenda: z.array(z.record(z.string(), z.unknown())).optional(),
  quorumRequired: z.number().int().positive().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:governance.read",
      action: "foundation.governance.meetings",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_MEETING" },
    },
    async (ctx) => {
      const foundationId = new URL(request.url).searchParams.get("foundationId") ?? undefined;
      const rows = await listMeetings(ctx.principal, foundationId);
      return NextResponse.json({ meetings: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:governance.manage",
      action: "foundation.governance.scheduleMeeting",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_MEETING" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await scheduleMeeting(foundationServiceContext(ctx), {
          ...body,
          scheduledAt: new Date(body.scheduledAt),
          agenda: body.agenda as Array<Record<string, unknown>> | undefined,
        });
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
