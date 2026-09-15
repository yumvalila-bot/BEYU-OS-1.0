import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guarded } from "@/lib/api";
import { createProject, listProjects } from "@/lib/ujenzi";
import { ujenziActor, ujenziErrorResponse } from "@/lib/ujenzi/http";

const CreateProjectSchema = z.object({
  legalEntityId: z.string().min(1),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  countryCode: z.string().length(2),
  projectType: z.string().optional(),
  region: z.string().optional(),
  notes: z.string().optional(),
});

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "ujenzi:data.read",
      action: "ujenzi.projects.list",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "UJENZI_PROJECT" },
    },
    async (ctx) => NextResponse.json({ projects: await listProjects(ctx.principal.tenantId) }),
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "ujenzi:data.manage",
      action: "ujenzi.projects.create",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "UJENZI_PROJECT" },
    },
    async (ctx) => {
      try {
        const parsed = CreateProjectSchema.parse(await request.json());
        const result = await createProject({ tenantId: ctx.principal.tenantId, ...parsed }, ujenziActor(ctx));
        return NextResponse.json(result, { status: 201 });
      } catch (err) {
        return ujenziErrorResponse(err, ctx.traceId);
      }
    },
  );
}
