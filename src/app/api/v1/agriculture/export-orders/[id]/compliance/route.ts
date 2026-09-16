/**
 * GET /api/v1/agriculture/export-orders/[id]/compliance — readiness
 * POST /api/v1/agriculture/export-orders/[id]/compliance — submit check
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { complianceReadiness, submitComplianceCheck, applicableRequirementsForOrder, ensureComplianceChecks, AgriDomainError } from "@/lib/agriculture";
import { agriActor } from "@/lib/agriculture/http";

const SubmitSchema = z.object({
  requirementId: z.string().min(1),
  evidenceDocumentId: z.string().min(1).optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportOrders.compliance.read",
      classification: "RESTRICTED",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        await ensureComplianceChecks(id, ctx.principal.tenantId);
        const [readiness, applicable] = await Promise.all([
          complianceReadiness(id, ctx.principal.tenantId),
          applicableRequirementsForOrder(id, ctx.principal.tenantId),
        ]);
        return NextResponse.json({ readiness, applicable });
      } catch (err) {
        if (err instanceof AgriDomainError) {
          const status = err.code === "NOT_FOUND" ? 404 : err.code === "SCOPE" ? 403 : 409;
          return apiError(err.code, err.message, status, ctx.traceId, err.details);
        }
        throw err;
      }
    },
  );
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportOrders.compliance.submit",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_ORDER", objectId: id },
    },
    async (ctx) => {
      try {
        const body = SubmitSchema.parse(await request.json());
        const result = await submitComplianceCheck(
          {
            tenantId: ctx.principal.tenantId,
            exportOrderId: id,
            requirementId: body.requirementId,
            evidenceDocumentId: body.evidenceDocumentId,
            status: body.status,
            notes: body.notes,
          },
          agriActor(ctx),
        );
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        if (err instanceof AgriDomainError) {
          const status = err.code === "NOT_FOUND" ? 404 : err.code === "SCOPE" ? 403 : 409;
          return apiError(err.code, err.message, status, ctx.traceId, err.details);
        }
        throw err;
      }
    },
  );
}
