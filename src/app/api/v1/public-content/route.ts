import { NextRequest } from "next/server";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { guarded, apiError, apiOk, parseBody, withIdempotency } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { ID_PREFIX, newId } from "@/lib/ids";
import { CreatePublicContentSchema, PatchPublicContentSchema } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.manage",
      action: "public-content.list",
      rateLimit: { limit: 60, windowMs: 60_000 },
    },
    async (ctx) => {
      const rows = await db
        .select()
        .from(publicContent)
        .where(eq(publicContent.tenantId, ctx.principal.tenantId))
        .orderBy(desc(publicContent.updatedAt))
        .limit(100);
      return apiOk({ items: rows }, ctx.traceId);
    },
  );
}

export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.manage",
      action: "public-content.create",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "PUBLIC_CONTENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const rawPayload = await request.clone().json().catch(() => ({}));
      return withIdempotency(ctx, "public-content.create", rawPayload, async () => {
        const body = await parseBody(request, CreatePublicContentSchema);

        const [existing] = await db
          .select({ id: publicContent.id })
          .from(publicContent)
          .where(eq(publicContent.slug, body.slug))
          .limit(1);
        if (existing) {
          return apiError("SLUG_ALREADY_EXISTS", "A public content item with that slug already exists.", 409, ctx.traceId);
        }

        const id = newId(ID_PREFIX.article);
        const [row] = await db
          .insert(publicContent)
          .values({
            id,
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
            isFeatured: body.isFeatured,
            classification: body.classification,
            status: "DRAFT",
            createdBy: ctx.principal.userId,
          })
          .returning();

        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.create",
          objectType: "PUBLIC_CONTENT",
          objectId: row.id,
          outcome: "SUCCESS",
          newValue: { slug: row.slug, kind: row.kind, classification: row.classification, status: row.status },
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });

        return {
          status: 201,
          body: {
            item: row,
            note: "Saved as DRAFT. Submit PUBLIC items for independent approval before publication.",
          },
        };
      });
    },
  );
}

export async function PATCH(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.manage",
      action: "public-content.transition",
      rateLimit: { limit: 20, windowMs: 60_000 },
      audit: { objectType: "PUBLIC_CONTENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, PatchPublicContentSchema);

      if (body.action === "archive") {
        const [archived] = await db
          .update(publicContent)
          .set({ status: "ARCHIVED", updatedAt: new Date() })
          .where(
            and(
              eq(publicContent.id, body.id),
              eq(publicContent.tenantId, ctx.principal.tenantId),
              ne(publicContent.status, "ARCHIVED"),
            ),
          )
          .returning({ id: publicContent.id, slug: publicContent.slug, status: publicContent.status });

        if (!archived) {
          return apiError("CONTENT_NOT_FOUND_OR_ARCHIVED", "Content item not found in tenant scope or already archived.", 404, ctx.traceId);
        }

        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.archive",
          objectType: "PUBLIC_CONTENT",
          objectId: archived.id,
          outcome: "SUCCESS",
          newValue: { status: "ARCHIVED" },
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });

        return apiOk({ id: archived.id, slug: archived.slug, status: archived.status }, ctx.traceId);
      }

      const [existing] = await db
        .select({
          id: publicContent.id,
          status: publicContent.status,
          classification: publicContent.classification,
        })
        .from(publicContent)
        .where(and(eq(publicContent.id, body.id), eq(publicContent.tenantId, ctx.principal.tenantId)))
        .limit(1);

      if (!existing) {
        return apiError("CONTENT_NOT_FOUND", "Content item not found in tenant scope.", 404, ctx.traceId);
      }
      if (existing.classification !== "PUBLIC") {
        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.submit",
          objectType: "PUBLIC_CONTENT",
          objectId: existing.id,
          outcome: "DENIED",
          reason: "Only PUBLIC-classified content may be submitted for website publication.",
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });
        return apiError(
          "PUBLIC_CLASSIFICATION_REQUIRED",
          "Only PUBLIC-classified content may be submitted for website publication.",
          422,
          ctx.traceId,
        );
      }
      if (existing.status !== "DRAFT") {
        return apiError("ITEM_NOT_DRAFT", "Only DRAFT items can be submitted for approval.", 409, ctx.traceId);
      }

      const [updated] = await db
        .update(publicContent)
        .set({ status: "PENDING_APPROVAL", updatedAt: new Date() })
        .where(
          and(
            eq(publicContent.id, existing.id),
            eq(publicContent.tenantId, ctx.principal.tenantId),
            eq(publicContent.status, "DRAFT"),
            eq(publicContent.classification, "PUBLIC"),
          ),
        )
        .returning({ id: publicContent.id, slug: publicContent.slug });

      if (!updated) {
        return apiError("CONTENT_STATE_CHANGED_RETRY", "Content state changed concurrently. Retry the request.", 409, ctx.traceId);
      }

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "public-content.submit",
        objectType: "PUBLIC_CONTENT",
        objectId: updated.id,
        outcome: "SUCCESS",
        newValue: { status: "PENDING_APPROVAL" },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });

      return apiOk({ id: updated.id, slug: updated.slug, status: "PENDING_APPROVAL" }, ctx.traceId);
    },
  );
}
