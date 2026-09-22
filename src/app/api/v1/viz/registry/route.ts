/**
 * Universal Dimensional Graphics Foundation — the Dimension Registry.
 *
 * GET  → the resolved registry for this tenant: canonical 1D–8D + XD, the
 *        tenant's governed 9D+ extensions, and the honest adapter matrix
 *        (what each sector adapter supplies today and what is
 *        NOT_IMPLEMENTED). Permission: viz:registry.read.
 * POST → register a governed 9D+ dimension extension (HIGH-RISK: MFA
 *        step-up applies through the canonical can() boundary).
 *        Permission: viz:dimension.manage. Extensions can never shadow a
 *        canonical dimension and can never carry posting authority —
 *        CAP_POSTING stays LOCKED.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded, parseBody } from "@/lib/api";
import { registryFor, registerDimensionExtension, type RegisterDimensionExtensionInput } from "@/lib/viz/service";
import { VIZ_SECTOR_CODES } from "@/lib/viz/dimensions";
import type { PermissionCode } from "@/lib/constants";
import { adapterDescriptors } from "@/lib/viz/adapters";
import { vizActor, vizErrorResponse } from "../_shared";

const RegisterSchema = z
  .object({
    code: z.string().trim().min(2).max(40),
    name: z.string().trim().min(2).max(200),
    description: z.string().trim().min(10).max(2000),
    capabilities: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
    dataRequirements: z.array(z.string().trim().min(1).max(200)).max(40).optional(),
    renderingRequirements: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
    requiredPermissions: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    sectorApplicability: z.union([z.literal("*"), z.array(z.enum(VIZ_SECTOR_CODES as unknown as [string, ...string[]])).min(1)]).optional(),
    lifecycleState: z.enum(["EXPERIMENTAL", "PLANNED", "AVAILABLE", "NOT_IMPLEMENTED", "RETIRED"]).optional(),
    rationale: z.string().trim().min(10).max(2000),
    classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"]).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:registry.read",
      action: "viz.registry.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "VIZ_DIMENSION_REGISTRY" },
    },
    async (ctx) => {
      try {
        const registry = await registryFor(ctx.principal);
        return NextResponse.json({
          dimensions: registry.dimensions,
          canonicalCount: registry.canonicalCount,
          extensionCount: registry.extensionCount,
          sectors: VIZ_SECTOR_CODES,
          adapters: adapterDescriptors(),
        });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "viz:dimension.manage",
      action: "viz.dimension.register",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "VIZ_DIMENSION_EXTENSION" },
    },
    async (ctx) => {
      // parseBody throws ZodError on invalid input; guarded() normalizes zod
      // failures onto the canonical VALIDATION_FAILED envelope (same contract
      // as every other BEYU route).
      const body = await parseBody(request, RegisterSchema);
      try {
        const result = await registerDimensionExtension(
          {
            ...body,
            requiredPermissions: body.requiredPermissions as PermissionCode[] | undefined,
            sectorApplicability: body.sectorApplicability as RegisterDimensionExtensionInput["sectorApplicability"],
          },
          vizActor(ctx),
        );
        return NextResponse.json({ extension: result }, { status: 201 });
      } catch (err) {
        return vizErrorResponse(err, ctx.traceId);
      }
    },
  );
}
