/**
 * BEYU Foundation OS — compliance evidence.
 *
 * POST  /api/v1/foundation/compliance/evidence — submit
 * PATCH /api/v1/foundation/compliance/evidence { id, approved } — verify
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { submitEvidence, verifyEvidence } from "@/lib/foundation/compliance";
import { foundationErrorResponse, foundationServiceContext } from "../../_shared";

const SubmitSchema = z.object({
  foundationId: z.string().min(1),
  obligationId: z.string().min(1).optional(),
  deadlineId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  evidenceType: z.string().min(1).max(120),
  title: z.string().min(1).max(300),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const VerifySchema = z.object({ id: z.string().min(1), approved: z.boolean() });

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.submitEvidence",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_EVIDENCE" },
    },
    async (ctx) => {
      try {
        const body = SubmitSchema.parse(await request.json());
        const result = await submitEvidence(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:compliance.manage",
      action: "foundation.compliance.verifyEvidence",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_EVIDENCE" },
    },
    async (ctx) => {
      try {
        const body = VerifySchema.parse(await request.json());
        const row = await verifyEvidence(foundationServiceContext(ctx), body.id, body.approved);
        return NextResponse.json({ evidence: row });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
