import { NextRequest } from "next/server";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { guarded, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { newId, ID_PREFIX } from "@/lib/ids";

export const dynamic = "force-dynamic";

const ContentInput = z.object({
  kind: z.enum(["NEWS", "EVENT"]),
  title: z.string().min(4).max(180),
  slug: z.string().min(3).max(180).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  summary: z.string().min(10).max(400),
  body: z.string().min(20).max(20000),
  imageUrl: z.string().url().refine((value) => value.startsWith("https://"), "Image URL must use HTTPS").max(1000).optional().nullable(),
  location: z.string().max(180).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  classification: z.enum(["PUBLIC", "INTERNAL", "CONFIDENTIAL"]).default("INTERNAL"),
});

export async function GET(request: NextRequest) {
  return guarded(request, {
    permission: "communications:broadcast.manage",
    action: "public-content.list",
    rateLimit: { limit: 60, windowMs: 60_000 },
  }, async (ctx) => {
    const rows = await db.select().from(publicContent)
      .where(eq(publicContent.tenantId, ctx.principal.tenantId))
      .orderBy(desc(publicContent.updatedAt)).limit(100);
    return apiOk({ items: rows }, ctx.traceId);
  });
}

export async function POST(request: NextRequest) {
  return guarded(request, {
    permission: "communications:broadcast.manage",
    action: "public-content.create",
    rateLimit: { limit: 20, windowMs: 60_000 },
    audit: { objectType: "PUBLIC_CONTENT" },
    databaseContext: "handler",
  }, async (ctx) => withIdempotency(ctx, "public-content.create", await request.clone().json().catch(() => ({})), async () => {
    const body = await parseBody(request, ContentInput);
    const [row] = await db.insert(publicContent).values({
      id: newId(ID_PREFIX.article),
      tenantId: ctx.principal.tenantId,
      kind: body.kind,
      title: body.title,
      slug: body.slug,
      summary: body.summary,
      body: body.body,
      imageUrl: body.imageUrl ?? null,
      location: body.location ?? null,
      startsAt: body.startsAt ? new Date(body.startsAt) : null,
      endsAt: body.endsAt ? new Date(body.endsAt) : null,
      classification: body.classification,
      status: "DRAFT",
      createdBy: ctx.principal.userId,
    }).returning();
    return { status: 201, body: { item: row, note: "Saved as DRAFT. Submit for independent approval before publication." } };
  }));
}

export async function PATCH(request: NextRequest) {
  return guarded(request, {
    permission: "communications:broadcast.manage",
    action: "public-content.submit",
    rateLimit: { limit: 20, windowMs: 60_000 },
    audit: { objectType: "PUBLIC_CONTENT" },
    databaseContext: "handler",
  }, async (ctx) => {
    const body = await parseBody(request, z.object({ id: z.string().min(1) }));
    const [row] = await db.update(publicContent).set({ status: "PENDING_APPROVAL", updatedAt: new Date() })
      .where(and(eq(publicContent.id, body.id), eq(publicContent.tenantId, ctx.principal.tenantId), eq(publicContent.status, "DRAFT"), eq(publicContent.classification, "PUBLIC")))
      .returning({ id: publicContent.id });
    if (!row) return { status: 409, body: { error: "ITEM_NOT_DRAFT_OR_OUT_OF_SCOPE" } };
    return apiOk({ id: row.id, status: "PENDING_APPROVAL" }, ctx.traceId);
  });
}
