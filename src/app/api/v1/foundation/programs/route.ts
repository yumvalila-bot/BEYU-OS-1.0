/**
 * BEYU Foundation OS — Programs (canonical foundation_programs table).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createProgram, listPrograms } from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(300),
  theme: z.string().min(1).max(120),
  countryCode: z.string().length(2),
  budget: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:program.read",
      action: "foundation.program.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_PROGRAM" },
    },
    async (ctx) => {
      const rows = await listPrograms(ctx.principal);
      return NextResponse.json({ programs: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:program.manage",
      action: "foundation.program.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_PROGRAM" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createProgram(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
