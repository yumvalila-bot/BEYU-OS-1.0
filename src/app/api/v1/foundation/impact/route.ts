/**
 * BEYU Foundation OS — Impact metrics + measurements.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createImpactMetric, listImpactMetrics, recordImpactMeasurement } from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const MetricSchema = z.object({
  code: z.string().min(1).max(60),
  name: z.string().min(1).max(300),
  level: z.enum(["INPUT", "ACTIVITY", "OUTPUT", "OUTCOME", "IMPACT"]),
  unit: z.string().min(1).max(60),
  programId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  grantId: z.string().min(1).optional(),
  baseline: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional(),
  target: z.string().regex(/^-?\d+(\.\d{1,4})?$/).optional(),
  geography: z.string().max(500).optional(),
  beneficiaryScope: z.string().max(500).optional(),
});

const MeasurementSchema = z.object({
  metricId: z.string().min(1),
  period: z.string().min(1).max(40),
  actual: z.string().regex(/^-?\d+(\.\d{1,4})?$/),
  evidenceDocumentId: z.string().min(1).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:impact.read",
      action: "foundation.impact.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_IMPACT_METRIC" },
    },
    async (ctx) => {
      const rows = await listImpactMetrics(ctx.principal);
      return NextResponse.json({ metrics: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:impact.manage",
      action: "foundation.impact.createMetric",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_IMPACT_METRIC" },
    },
    async (ctx) => {
      try {
        const body = MetricSchema.parse(await request.json());
        const result = await createImpactMetric(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function PUT(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:impact.manage",
      action: "foundation.impact.recordMeasurement",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_IMPACT_MEASUREMENT" },
    },
    async (ctx) => {
      try {
        const body = MeasurementSchema.parse(await request.json());
        const result = await recordImpactMeasurement(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
