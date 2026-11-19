import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { guarded, apiOk, parseBody } from "@/lib/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Independent high-risk approval; the author cannot approve their own item. */
export async function POST(request: NextRequest) {
  return guarded(request, {
    permission: "communications:broadcast.approve",
    action: "public-content.approve-and-publish",
    rateLimit: { limit: 10, windowMs: 60_000 },
    audit: { objectType: "PUBLIC_CONTENT" },
    databaseContext: "handler",
  }, async (ctx) => {
    const body = await parseBody(request, z.object({ id: z.string().min(1) }));
    const [row] = await db.select().from(publicContent).where(and(
      eq(publicContent.id, body.id),
      eq(publicContent.tenantId, ctx.principal.tenantId),
      eq(publicContent.status, "PENDING_APPROVAL"),
    )).limit(1);
    if (!row) return { status: 404, body: { error: "PENDING_ITEM_NOT_FOUND" } };
    if (row.createdBy === ctx.principal.userId) return { status: 403, body: { error: "AUTHOR_CANNOT_APPROVE_OWN_CONTENT" } };
    if (row.classification !== "PUBLIC") return { status: 422, body: { error: "PUBLIC_CLASSIFICATION_REQUIRED" } };
    const now = new Date();
    const [published] = await db.update(publicContent).set({
      status: "PUBLISHED", approvedBy: ctx.principal.userId, approvedAt: now,
      publishedAt: now, updatedAt: now,
    }).where(and(eq(publicContent.id, row.id), eq(publicContent.status, "PENDING_APPROVAL"))).returning({ id: publicContent.id, slug: publicContent.slug });
    if (!published) return { status: 409, body: { error: "CONTENT_STATE_CHANGED_RETRY" } };
    return apiOk({ ...published, status: "PUBLISHED" }, ctx.traceId);
  });
}
