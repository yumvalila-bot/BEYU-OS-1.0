import { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { publicContent } from "@/db/schema";
import { guarded, apiError, apiOk, parseBody } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { ApprovePublicContentSchema } from "@/lib/public-content";

export const dynamic = "force-dynamic";

/**
 * Independent maker-checker approval for public website news & events.
 *
 * SECURITY CONTROLS
 * - Requires high-risk `communications:broadcast.approve` permission (enforces
 *   step-up MFA via `HIGH_RISK_PERMISSIONS` in `src/lib/constants.ts`).
 * - Runs inside tenant RLS context (`guarded()` default `databaseContext: "guard"`).
 * - Enforces Segregation of Duties: the creator (`createdBy`) can never approve
 *   their own item, verified both here and by database CHECK constraint.
 * - Rejects non-PUBLIC content fail-closed (422) and records denied attempts
 *   in the immutable audit ledger.
 */
export async function POST(request: NextRequest) {
  return guarded(
    request,
    {
      permission: "communications:broadcast.approve",
      action: "public-content.approve-and-publish",
      rateLimit: { limit: 10, windowMs: 60_000 },
      audit: { objectType: "PUBLIC_CONTENT" },
    },
    async (ctx) => {
      const body = await parseBody(request, ApprovePublicContentSchema);

      const [row] = await db
        .select()
        .from(publicContent)
        .where(
          and(
            eq(publicContent.id, body.id),
            eq(publicContent.tenantId, ctx.principal.tenantId),
            eq(publicContent.status, "PENDING_APPROVAL"),
          ),
        )
        .limit(1);

      if (!row) {
        return apiError("PENDING_ITEM_NOT_FOUND", "No pending public content item was found in tenant scope.", 404, ctx.traceId);
      }

      if (row.createdBy === ctx.principal.userId) {
        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.approve-and-publish",
          objectType: "PUBLIC_CONTENT",
          objectId: row.id,
          outcome: "DENIED",
          reason: "Segregation of Duties: the author cannot approve or publish their own content.",
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });
        return apiError(
          "AUTHOR_CANNOT_APPROVE_OWN_CONTENT",
          "Segregation of Duties: an independent authorized approver must review and approve this item.",
          403,
          ctx.traceId,
        );
      }

      if (body.decision === "REJECT") {
        const now = new Date();
        const [returned] = await db
          .update(publicContent)
          .set({ status: "DRAFT", updatedAt: now })
          .where(
            and(
              eq(publicContent.id, row.id),
              eq(publicContent.tenantId, ctx.principal.tenantId),
              eq(publicContent.status, "PENDING_APPROVAL"),
            ),
          )
          .returning({ id: publicContent.id, slug: publicContent.slug });

        if (!returned) {
          return apiError("CONTENT_STATE_CHANGED_RETRY", "Content state changed concurrently. Retry the request.", 409, ctx.traceId);
        }

        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.reject",
          objectType: "PUBLIC_CONTENT",
          objectId: returned.id,
          outcome: "SUCCESS",
          newValue: { status: "DRAFT", decision: "REJECT", reason: body.reason ?? null },
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });

        return apiOk({ ...returned, status: "DRAFT", decision: "REJECTED" }, ctx.traceId);
      }

      if (row.classification !== "PUBLIC") {
        await recordAudit({
          tenantId: ctx.principal.tenantId,
          actorUserId: ctx.principal.userId,
          action: "public-content.approve-and-publish",
          objectType: "PUBLIC_CONTENT",
          objectId: row.id,
          outcome: "DENIED",
          reason: "Non-PUBLIC content cannot be published to the public website.",
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          traceId: ctx.traceId,
        });
        return apiError(
          "PUBLIC_CLASSIFICATION_REQUIRED",
          "Only PUBLIC-classified items may be approved for public website publication.",
          422,
          ctx.traceId,
        );
      }

      const now = new Date();
      const [published] = await db
        .update(publicContent)
        .set({
          status: "PUBLISHED",
          approvedBy: ctx.principal.userId,
          approvedAt: now,
          publishedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(publicContent.id, row.id),
            eq(publicContent.tenantId, ctx.principal.tenantId),
            eq(publicContent.status, "PENDING_APPROVAL"),
            eq(publicContent.classification, "PUBLIC"),
          ),
        )
        .returning({ id: publicContent.id, slug: publicContent.slug, publishedAt: publicContent.publishedAt });

      if (!published) {
        return apiError("CONTENT_STATE_CHANGED_RETRY", "Content state changed concurrently. Retry the request.", 409, ctx.traceId);
      }

      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "public-content.approve-and-publish",
        objectType: "PUBLIC_CONTENT",
        objectId: published.id,
        outcome: "SUCCESS",
        newValue: {
          status: "PUBLISHED",
          slug: published.slug,
          approvedBy: ctx.principal.userId,
          publishedAt: now.toISOString(),
        },
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });

      return apiOk(
        {
          id: published.id,
          slug: published.slug,
          status: "PUBLISHED",
          publishedAt: published.publishedAt?.toISOString() ?? now.toISOString(),
        },
        ctx.traceId,
      );
    },
  );
}
