import { z } from "zod";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { blockchainEvents } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { ingestEvents } from "@/lib/blockchain/service";
import { EVENT_KINDS } from "@/lib/blockchain/model";
import { ADDRESS20, HASH32, contractApiError } from "../_common";

export const dynamic = "force-dynamic";

const IngestSchema = z.object({
  events: z
    .array(
      z.object({
        chainId: z.number().int().positive(),
        contractAddress: z.string().trim().regex(ADDRESS20),
        blockNumber: z.number().int().nonnegative(),
        blockHash: z.string().trim().regex(HASH32),
        transactionHash: z.string().trim().regex(HASH32),
        logIndex: z.number().int().min(0).max(10_000),
        eventKind: z.enum(EVENT_KINDS),
        emittedAt: z.string().trim().min(12).max(40),
        actorAddress: z.string().trim().regex(ADDRESS20).nullish(),
        funcSelector: z.string().trim().max(20).nullish(),
        /** Commitment-bearing attributes only. Payloads are size-capped: a log is not a content store. */
        payload: z.record(z.string(), z.unknown()).optional(),
        anchorId: z.string().trim().max(100).nullish(),
        contractId: z.string().trim().max(100).nullish(),
        obligationId: z.string().trim().max(100).nullish(),
        correlationId: z.string().trim().max(100).nullish(),
      }),
    )
    .min(1)
    .max(500),
});

/**
 * POST /api/v1/blockchain/events
 *
 * INGEST_EVENTS — the indexer's write path. Per event the engine decides
 * ACCEPTED / DUPLICATE / QUARANTINED, and every refusal reason is PERSISTED
 * alongside the row: a gap, a reorg candidate, an unknown contract, an
 * unauthorized actor or a payload that smuggles confidential content is a
 * finding a human must be able to see. Nothing in this route mutates a
 * contract, an obligation or a register, and no event can create authority.
 *
 * Authorization is `blockchain:manage`; the route is deliberately NOT exposed to
 * a public unauthenticated ingest endpoint (see docs/security) — an indexer
 * authenticates as a governed service principal.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:manage",
      action: "blockchain.events.ingest",
      rateLimit: { limit: 120, windowMs: 60_000 },
      audit: { objectType: "BLOCKCHAIN_EVENT" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      try {
        if (operation !== "INGEST_EVENTS") {
          return apiError("VALIDATION_FAILED", "operation must be INGEST_EVENTS.", 422, ctx.traceId);
        }
        const body = IngestSchema.parse(raw);
        return await withIdempotency(ctx, "blockchain.events.ingest", body, async () => ({
          status: 202,
          body: await ingestEvents(ctx.principal, body.events, {
            traceId: ctx.traceId,
            ipAddress: ctx.ip,
            userAgent: ctx.userAgent,
          }),
        }));
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}

/**
 * GET /api/v1/blockchain/events?contractAddress=…&eventKind=…&onlyFindings=true
 *
 * Indexed-event view for review. `onlyFindings` narrows to quarantined or
 * anomaly-bearing rows — the queue a human actually works, and the reason the
 * findings column exists instead of being dropped on the floor.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.events.read",
      audit: { objectType: "BLOCKCHAIN_EVENT" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const scope = await tenantScopeIds(ctx.principal);
      const clauses = [inArray(blockchainEvents.tenantId, scope)];
      const address = q.get("contractAddress");
      const eventKind = q.get("eventKind");
      if (address) clauses.push(sql`lower(${blockchainEvents.contractAddress}) = ${address.toLowerCase()}`);
      if (eventKind) clauses.push(eq(blockchainEvents.eventKind, eventKind));
      if (q.get("onlyFindings") === "true") clauses.push(sql`jsonb_array_length(${blockchainEvents.findings}) > 0`);
      const items = await db
        .select({
          id: blockchainEvents.id,
          chainId: blockchainEvents.chainId,
          contractAddress: blockchainEvents.contractAddress,
          blockNumber: blockchainEvents.blockNumber,
          txHash: blockchainEvents.txHash,
          logIndex: blockchainEvents.logIndex,
          eventKind: blockchainEvents.eventKind,
          emittedAt: blockchainEvents.emittedAt,
          actorAddress: blockchainEvents.actorAddress,
          payload: blockchainEvents.payload,
          ingestState: blockchainEvents.ingestState,
          findings: blockchainEvents.findings,
          createsAuthority: blockchainEvents.createsAuthority,
          correlationId: blockchainEvents.correlationId,
        })
        .from(blockchainEvents)
        .where(and(...clauses))
        .orderBy(desc(blockchainEvents.blockNumber), desc(blockchainEvents.logIndex))
        .limit(500);
      return apiOk({ items, count: items.length }, ctx.traceId);
    },
  );
}
