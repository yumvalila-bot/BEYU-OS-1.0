/** UJENZI OS — add a BOQ item (only while the version is DRAFT/SUBMITTED) */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";
import { addBoqItem } from "@/lib/ujenzi";

const Schema = z.object({
  code: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.string().min(1),
  rate: z.string().min(1),
  section: z.string().optional(),
  costCode: z.string().optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.boqItems.add",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_BOQ_ITEM", objectId: id },
    },
    async (ctx) => {
      try {
        const body = Schema.parse(await request.json());
        const result = await addBoqItem({ ...body, tenantId: ctx.principal.tenantId, boqId: id }, ujenziActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
