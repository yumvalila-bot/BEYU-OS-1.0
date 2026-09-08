/**
 * BEYU Foundation OS — Grant lifecycle.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createGrant, listGrantees, listGrants, registerGrantee } from "@/lib/foundation/service";
import { foundationErrorResponse, foundationServiceContext } from "../_shared";

const CreateSchema = z.object({
  code: z.string().min(1).max(60),
  title: z.string().min(1).max(300),
  foundationId: z.string().min(1),
  fundId: z.string().min(1).optional(),
  programId: z.string().min(1).optional(),
  granteeId: z.string().min(1).optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  currency: z.string().length(3).optional(),
  budget: z.record(z.string(), z.unknown()).optional(),
  restrictions: z.string().max(4000).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:grant.read",
      action: "foundation.grant.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "GRANT" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      if (url.searchParams.get("grantees") === "1") {
        const grantees = await listGrantees(ctx.principal);
        return NextResponse.json({ grantees });
      }
      const rows = await listGrants(ctx.principal);
      return NextResponse.json({ grants: rows });
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:grant.manage",
      action: "foundation.grant.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GRANT" },
    },
    async (ctx) => {
      try {
        const body = CreateSchema.parse(await request.json());
        const result = await createGrant(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}

const GranteeSchema = z.object({
  code: z.string().min(1).max(60),
  displayName: z.string().min(1).max(300),
  granteeType: z.enum(["ORGANIZATION", "INDIVIDUAL", "GOVERNMENT"]),
  countryCode: z.string().length(2).optional(),
  registrationRef: z.string().max(200).optional(),
});

export async function PUT(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "foundation:grant.manage",
      action: "foundation.grant.registerGrantee",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "GRANTEE" },
    },
    async (ctx) => {
      try {
        const body = GranteeSchema.parse(await request.json());
        const result = await registerGrantee(foundationServiceContext(ctx), body);
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return foundationErrorResponse(err, ctx.traceId);
      }
    },
  );
}
