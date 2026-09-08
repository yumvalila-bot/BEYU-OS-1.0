/**
 * BEYU Foundation OS — Procurement lifecycle + suppliers.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import {
  createProcurement,
  getProcurement,
  listProcurements,
  listSuppliers,
  registerSupplier,
  transitionProcurement,
} from "@/lib/foundation/service-operations";
import { PROCUREMENT_STATUSES, type ProcurementStatus } from "@/lib/foundation/types";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  needStatement: z.string().max(4000).optional(),
  budgetAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  currency: z.string().length(3).optional(),
});

const TransitionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(PROCUREMENT_STATUSES as unknown as [string, ...string[]]),
  approvalRef: z.string().min(1).max(200).optional(),
});

const SupplierSchema = z.object({
  code: z.string().min(1).max(60),
  displayName: z.string().min(1).max(300),
  countryCode: z.string().length(2).optional(),
  registrationRef: z.string().max(200).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:procurement.read",
      action: "foundation.procurement.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "PROCUREMENT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      if (url.searchParams.get("suppliers") === "1") {
        return NextResponse.json({ suppliers: await listSuppliers(ctx.principal) });
      }
      const id = url.searchParams.get("id");
      if (id) {
        try {
          return NextResponse.json({ procurement: await getProcurement(ctx.principal, id) });
        } catch (err) {
          return foundationErrorResponse(err, ctx.traceId);
        }
      }
      const rows = await listProcurements(ctx.principal);
      return NextResponse.json({ procurements: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:procurement.manage",
      action: "foundation.procurement.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "PROCUREMENT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createProcurement(foundationServiceContext(ctx), body);
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
      permission: "foundation:procurement.manage",
      action: "foundation.procurement.transition",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "PROCUREMENT" },
    },
    async (ctx) => {
      try {
        const body = TransitionSchema.parse(await request.json());
        const row = await transitionProcurement(
          foundationServiceContext(ctx),
          body.id,
          body.status as ProcurementStatus,
          body.approvalRef,
        );
        return NextResponse.json({ procurement: row });
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
      permission: "foundation:procurement.manage",
      action: "foundation.procurement.registerSupplier",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "SUPPLIER" },
    },
    async (ctx) => {
      try {
        const body = SupplierSchema.parse(await request.json());
        const result = await registerSupplier(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
