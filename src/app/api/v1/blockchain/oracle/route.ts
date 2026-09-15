import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blockchainOracleReadings, blockchainOracleSources } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { readOraclePosture, recordOracleReading, upsertOracleSource } from "@/lib/blockchain/service";
import { ORACLE_FEEDS, ORACLE_SOURCE_KINDS } from "@/lib/blockchain/model";
import { ADDRESS20, NETWORK_KEYS, contractApiError, todayIso } from "../_common";

export const dynamic = "force-dynamic";

const UpsertSourceSchema = z.object({
  code: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(200),
  feed: z.enum(ORACLE_FEEDS),
  sourceKind: z.enum(ORACLE_SOURCE_KINDS),
  networkKey: z.enum(NETWORK_KEYS).nullish(),
  contractAddress: z.string().trim().regex(ADDRESS20).nullish(),
  authorityRef: z.string().trim().max(200).nullish(),
  deviationLimitBps: z.number().int().nonnegative().max(100_000).nullish(),
  maxAgeSeconds: z.number().int().nonnegative().max(60 * 60 * 24 * 365).nullish(),
  fallbackOrder: z.number().int().min(1).max(20).optional(),
  manualSubmitterRoleCode: z.string().trim().max(60).nullish(),
  state: z.enum(["ACTIVE", "SUSPENDED", "DISQUALIFIED"]).optional(),
  legalReviewStatus: z.enum(["REQUIRES_LEGAL_REVIEW", "LEGAL_REVIEW_CLOSED"]).optional(),
  governanceNote: z.string().trim().max(2000).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

const ReadingSchema = z.object({
  sourceId: z.string().trim().min(1).max(100),
  subjectCode: z.string().trim().min(1).max(100),
  valueBps: z.number().int().nonnegative().nullish(),
  valueText: z.string().trim().max(500).nullish(),
  decimals: z.number().int().min(0).max(36).optional(),
  rawValue: z.string().trim().max(200).nullish(),
  observedAt: z.string().trim().min(12).max(40),
  asOf: z.string().trim().min(12).max(40).nullish(),
  roundId: z.string().trim().max(100).nullish(),
  anchorId: z.string().trim().max(100).nullish(),
  disputeRef: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * POST /api/v1/blockchain/oracle
 *
 *   UPSERT_SOURCE   — govern a source. A source may only TIGHTEN its feed's
 *                     deviation limit and freshness bound; the family floor in
 *                     the engine is the governance minimum, so a captured or
 *                     misconfigured source cannot widen what executors accept.
 *                     An AUTHORITATIVE_PRIMARY / ONCHAIN_PUSH source must cite
 *                     the record that qualifies it; a MANUAL_EVIDENCE source must
 *                     name the submitting role.
 *   RECORD_READING  — record one reading and store the engine's verdict at the
 *                     decision instant (freshness, deviation vs the previous
 *                     reading, source-kind requirements, dispute coverage).
 *
 * No field in either operation can approve, pay, settle or release anything: an
 * oracle reading is an INPUT to a governed decision, never the decision.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:manage",
      action: "blockchain.oracle.mutate",
      rateLimit: { limit: 300, windowMs: 60_000 },
      audit: { objectType: "BLOCKCHAIN_ORACLE_SOURCE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "UPSERT_SOURCE": {
            const body = UpsertSourceSchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.oracle.upsert-source", body, async () => ({
              status: 201,
              body: await upsertOracleSource(ctx.principal, body, mutationContext),
            }));
          }
          case "RECORD_READING": {
            const body = ReadingSchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.oracle.record-reading", body, async () => ({
              status: 201,
              body: await recordOracleReading(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError("VALIDATION_FAILED", "operation must be UPSERT_SOURCE or RECORD_READING.", 422, ctx.traceId);
        }
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}

/**
 * GET /api/v1/blockchain/oracle?feed=…&subjectCode=…&asOf=…&mode=posture|readings|sources
 *
 * `mode=posture` (default) answers the question an executor asks: is there a
 * usable reading for this subject at this instant, and why not if there is not.
 * `mode=readings` returns the stored reading history for review. Both are
 * read-only and both report `grantsAuthority: false`, because that is the point.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.oracle.read",
      audit: { objectType: "BLOCKCHAIN_ORACLE_SOURCE" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const feed = q.get("feed");
      const subjectCode = q.get("subjectCode");
      const mode = q.get("mode") ?? "posture";
      const scope = await tenantScopeIds(ctx.principal);
      if (mode === "sources") {
        const clauses = [inArray(blockchainOracleSources.tenantId, scope)];
        if (feed) clauses.push(eq(blockchainOracleSources.feed, feed));
        const sources = await db
          .select({
            id: blockchainOracleSources.id,
            code: blockchainOracleSources.code,
            displayName: blockchainOracleSources.displayName,
            feed: blockchainOracleSources.feed,
            sourceKind: blockchainOracleSources.sourceKind,
            networkKey: blockchainOracleSources.networkKey,
            contractAddress: blockchainOracleSources.contractAddress,
            authorityRef: blockchainOracleSources.authorityRef,
            deviationLimitBps: blockchainOracleSources.deviationLimitBps,
            maxAgeSeconds: blockchainOracleSources.maxAgeSeconds,
            fallbackOrder: blockchainOracleSources.fallbackOrder,
            state: blockchainOracleSources.state,
            legalReviewStatus: blockchainOracleSources.legalReviewStatus,
            manualSubmitterRoleCode: blockchainOracleSources.manualSubmitterRoleCode,
          })
          .from(blockchainOracleSources)
          .where(and(...clauses))
          .orderBy(desc(blockchainOracleSources.updatedAt))
          .limit(200);
        return apiOk({ items: sources }, ctx.traceId);
      }
      if (mode === "readings") {
        const clauses = [inArray(blockchainOracleReadings.tenantId, scope)];
        if (feed) clauses.push(eq(blockchainOracleReadings.feed, feed));
        if (subjectCode) clauses.push(eq(blockchainOracleReadings.subjectCode, subjectCode));
        const items = await db
          .select({
            id: blockchainOracleReadings.id,
            sourceId: blockchainOracleReadings.sourceId,
            feed: blockchainOracleReadings.feed,
            subjectCode: blockchainOracleReadings.subjectCode,
            valueBps: blockchainOracleReadings.valueBps,
            decimals: blockchainOracleReadings.decimals,
            rawValue: blockchainOracleReadings.rawValue,
            observedAt: blockchainOracleReadings.observedAt,
            asOf: blockchainOracleReadings.asOf,
            ageSeconds: blockchainOracleReadings.ageSeconds,
            deviationBps: blockchainOracleReadings.deviationBps,
            state: blockchainOracleReadings.state,
            usable: blockchainOracleReadings.usable,
            grantsAuthority: blockchainOracleReadings.grantsAuthority,
            evaluation: blockchainOracleReadings.evaluation,
          })
          .from(blockchainOracleReadings)
          .where(and(...clauses))
          .orderBy(desc(blockchainOracleReadings.observedAt))
          .limit(200);
        return apiOk({ items }, ctx.traceId);
      }
      if (!feed || !subjectCode) {
        return apiError("VALIDATION_FAILED", "feed and subjectCode are required for mode=posture.", 422, ctx.traceId);
      }
      if (!(ORACLE_FEEDS as readonly string[]).includes(feed)) {
        return apiError("VALIDATION_FAILED", "feed is not a governed oracle feed.", 422, ctx.traceId);
      }
      const asOfParam = q.get("asOf");
      if (asOfParam && asOfParam.length < 10) {
        return apiError("VALIDATION_FAILED", "asOf must be an ISO timestamp or date.", 422, ctx.traceId);
      }
      try {
        const posture = await readOraclePosture(ctx.principal, {
          feed: feed as (typeof ORACLE_FEEDS)[number],
          subjectCode,
          asOf: asOfParam ?? `${todayIso()}T00:00:00.000Z`,
          sourceId: q.get("sourceId"),
        });
        return apiOk(posture, ctx.traceId);
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}

/*
 * The governed SOURCE register is read through the same route family: GET with
 * `mode=sources` lists sources with their configured tolerances, which is what a
 * reviewer needs to see to judge whether a feed is being used inside its limits.
 */
