/**
 * BEYU OS — Shared Search capability: the single search endpoint.
 *
 * GET /api/v1/search?q=...[&os=...][&type=...][&limit=...][&offset=...]
 *
 * This is the ONE entry point of the shared BEYU OS search capability
 * (kind SHARED_CAPABILITY in os_registry). There is no per-OS search route,
 * no separate knowledge/document search endpoint and no search OS — every
 * result is a governed read through this endpoint, on the canonical
 * transaction-scoped tenant context that `guarded()` establishes.
 *
 * Security boundary:
 *   - authentication + `platform:search.read` (RBAC) + rate limit via guarded();
 *   - tenant / entity / classification scope comes ONLY from the resolved
 *     principal — no request parameter can widen scope;
 *   - each source additionally requires its own EXISTING read permission
 *     (surfaces nothing the principal cannot already read);
 *   - the raw query is NEVER logged or stored: the success audit records a
 *     sha256 fingerprint so searches remain auditable without leaking
 *     sensitive search terms.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { guarded, apiError, apiOk } from "@/lib/api";
import { recordAudit } from "@/lib/audit";
import { runGovernedSearch } from "@/lib/search/service";
import { parseSearchQuery } from "@/lib/search/query";

export const GET = (request: Request) =>
  guarded(
    request,
    {
      permission: "platform:search.read",
      action: "search.query",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "SEARCH" },
    },
    async (ctx) => {
      const parsed = parseSearchQuery(new URL(request.url).searchParams);
      if (!parsed.ok) {
        return apiError("VALIDATION_FAILED", parsed.message, 422, ctx.traceId, parsed.details);
      }

      const result = await runGovernedSearch(ctx.principal, parsed.value);

      // Success audit: the raw query is deliberately NOT recorded. A short
      // sha256 fingerprint makes searches attributable in audit trails
      // (abuse, correlation) without exposing search terms — the same
      // treatment the platform applies to sensitive payloads.
      const fingerprint = `search:${createHash("sha256").update(parsed.value.query).digest("hex").slice(0, 32)}`;
      await recordAudit({
        tenantId: ctx.principal.tenantId,
        actorUserId: ctx.principal.userId,
        action: "search.query",
        objectType: "SEARCH",
        objectId: fingerprint,
        outcome: "SUCCESS",
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        traceId: ctx.traceId,
      });

      return apiOk(result, ctx.traceId);
    },
  );

/** No search is created, mutated or deleted: the endpoint is read-only. */
export function POST(_request: Request): NextResponse {
  return apiError("METHOD_NOT_ALLOWED", "Search is a read-only capability.", 405, "search-method-not-allowed");
}
export const PUT = POST;
export const PATCH = POST;
export const DELETE = POST;
