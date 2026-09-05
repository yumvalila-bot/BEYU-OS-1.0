import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { journalEntries, journalLines, legalEntities } from "@/db/schema";
import { apiError, apiOk, guarded, parseBody, withIdempotency } from "@/lib/api";
import { postJournal, PostingError } from "@/lib/finance/posting-engine";
import { CapabilityLockedError } from "@/lib/decision-authority";
import { tenantScopeIds } from "@/lib/tenant-scope";

export const dynamic = "force-dynamic";

const PostJournalLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid debit format"),
  credit: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid credit format"),
  description: z.string().max(500).optional(),
});

const PostJournalSchema = z.object({
  tenantId: z.string().min(1),
  legalEntityId: z.string().min(1),
  periodId: z.string().min(1).optional().nullable(),
  reference: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  lines: z.array(PostJournalLineSchema).min(2),
  sourceReference: z.string().max(100).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

/**
 * GET /api/v1/finance/journal
 * Read journal entries within the caller's tenant and legal entity scope.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:ledger.read",
      action: "finance.ledger.read",
      rateLimit: { limit: 100, windowMs: 60_000 },
      audit: { objectType: "JOURNAL_ENTRY" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const legalEntityId = url.searchParams.get("legalEntityId");
      const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10)), 200);

      const scope = await tenantScopeIds(ctx.principal);
      const conditions = [inArray(journalEntries.tenantId, scope)];

      if (legalEntityId) {
        if (ctx.principal.entityScope.length > 0 && !ctx.principal.entityScope.includes(legalEntityId)) {
          return apiError("NOT_FOUND", "Legal entity not found in your scope.", 404, ctx.traceId);
        }
        conditions.push(eq(journalEntries.legalEntityId, legalEntityId));
      } else if (ctx.principal.entityScope.length > 0) {
        conditions.push(inArray(journalEntries.legalEntityId, ctx.principal.entityScope));
      }

      const entries = await db
        .select()
        .from(journalEntries)
        .where(and(...conditions))
        .orderBy(desc(journalEntries.postedAt))
        .limit(limit);

      const entryIds = entries.map((e) => e.id);
      const lines = entryIds.length > 0
        ? await db
            .select()
            .from(journalLines)
            .where(inArray(journalLines.entryId, entryIds))
        : [];

      const linesByEntry = new Map<string, typeof lines>();
      for (const line of lines) {
        const list = linesByEntry.get(line.entryId) ?? [];
        list.push(line);
        linesByEntry.set(line.entryId, list);
      }

      const result = entries.map((e) => ({
        ...e,
        lines: linesByEntry.get(e.id) ?? [],
      }));

      return apiOk({ entries: result, total: result.length }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/finance/journal
 * Governed double-entry journal posting.
 * Gated by CAP_POSTING capability which remains FAIL-CLOSED / LOCKED
 * until genuine accounting governance decisions (P1, P6, P7, P9) are ratified.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "finance:ledger.post",
      action: "finance.ledger.post",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "JOURNAL_ENTRY" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const body = await parseBody(ctx.request, PostJournalSchema);

      return withIdempotency(
        ctx,
        "finance.ledger.post",
        body,
        async () => {
          try {
            const result = await postJournal(ctx.principal, body);
            return { status: 201, body: result };
          } catch (error) {
            if (error instanceof CapabilityLockedError) {
              return {
                status: 423,
                body: {
                  code: "CAPABILITY_LOCKED",
                  message: "CAP_POSTING capability is locked. Accounting governance ratification is pending.",
                  detail: { capability: error.capabilityCode, blockedBy: error.blockedBy, reason: error.message },
                },
              };
            }
            if (error instanceof PostingError) {
              const statusMap: Record<string, number> = {
                CAPABILITY_LOCKED: 423,
                DENIED: 403,
                RULE_VIOLATION: 400,
                NOT_FOUND: 404,
                CONFLICT: 409,
              };
              return {
                status: statusMap[error.code] ?? 400,
                body: {
                  code: error.code,
                  message: error.message,
                  detail: error.detail,
                },
              };
            }
            throw error;
          }
        },
      );
    },
  );
}
