/**
 * Agriculture OS — Export Compliance Checks
 * GET /api/v1/agriculture/export-compliance/checks?exportOrderId=...
 * POST /api/v1/agriculture/export-compliance/checks/verify
 */
import { z } from "zod";
import { guarded, apiError } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import * as s from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { verifyComplianceCheck, AgriDomainError } from "@/lib/agriculture";
import { visibleAgricultureItems, agriActor } from "@/lib/agriculture/http";

const VerifySchema = z.object({
  checkId: z.string().min(1),
  verified: z.boolean(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.read",
      action: "agriculture.exportCompliance.checks.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_COMPLIANCE_CHECK" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const exportOrderId = url.searchParams.get("exportOrderId");
      const conditions = [eq(s.exportComplianceChecks.tenantId, ctx.principal.tenantId)];
      if (exportOrderId) conditions.push(eq(s.exportComplianceChecks.exportOrderId, exportOrderId));
      const rows = await db.select().from(s.exportComplianceChecks).where(and(...conditions));
      return NextResponse.json({ items: visibleAgricultureItems(rows, ctx.principal.clearance) });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "agriculture:data.manage",
      action: "agriculture.exportCompliance.checks.verify",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "AGRICULTURE_EXPORT_COMPLIANCE_CHECK" },
    },
    async (ctx) => {
      try {
        const body = VerifySchema.parse(await request.json());
        const result = await verifyComplianceCheck(body.checkId, ctx.principal.tenantId, body.verified, agriActor(ctx));
        return NextResponse.json(result);
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
