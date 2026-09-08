/**
 * BEYU Foundation OS — Beneficiaries (minimised, restricted).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import {
  listBeneficiaries,
  recordBeneficiaryService,
  registerBeneficiary,
} from "@/lib/foundation/service-operations";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  programId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  cohort: z.string().max(300).optional(),
});

const ServiceSchema = z.object({
  beneficiaryId: z.string().min(1),
  serviceType: z.string().min(1).max(200),
  providedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outcome: z.string().max(2000).optional(),
  providerRef: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:beneficiary.read",
      action: "foundation.beneficiary.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_BENEFICIARY" },
    },
    async (ctx) => {
      const rows = await listBeneficiaries(ctx.principal);
      return NextResponse.json({ beneficiaries: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:beneficiary.manage",
      action: "foundation.beneficiary.register",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "FOUNDATION_BENEFICIARY" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await registerBeneficiary(foundationServiceContext(ctx), body);
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
      permission: "foundation:beneficiary.manage",
      action: "foundation.beneficiary.recordService",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "BENEFICIARY_SERVICE" },
    },
    async (ctx) => {
      try {
        const body = ServiceSchema.parse(await request.json());
        const result = await recordBeneficiaryService(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
