import { z } from "zod";
import { desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blockchainReconciliationRuns, blockchainTokenPositions } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { recordTokenPositions, runReconciliation } from "@/lib/blockchain/service";
import { ADDRESS20, ISO_DATE, NETWORK_KEYS, contractApiError, todayIso } from "../_common";

export const dynamic = "force-dynamic";

const RunSchema = z.object({
  code: z.string().trim().min(1).max(40),
  networkKey: z.enum(NETWORK_KEYS),
  registryId: z.string().trim().max(100).nullish(),
  tokenSymbol: z.string().trim().min(1).max(20).nullish(),
  asOfDate: z.string().trim().regex(ISO_DATE),
  toleranceUnits: z.number().int().nonnegative().max(1_000_000_000).optional(),
  staleBlockTolerance: z.number().int().nonnegative().max(100_000).optional(),
  note: z.string().trim().max(2000).nullish(),
});

const RecordPositionsSchema = z.object({
  chainId: z.number().int().positive(),
  tokenSymbol: z.string().trim().min(1).max(20),
  registryId: z.string().trim().max(100).nullish(),
  decimals: z.number().int().min(0).max(36).optional(),
  sharesPerUnit: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,6})?$/)
    .optional(),
  positions: z
    .array(
      z.object({
        holderAddress: z.string().trim().regex(ADDRESS20),
        balanceUnits: z.number().int().nonnegative(),
        lastSyncedBlock: z.number().int().nonnegative().optional(),
        chainHeadBlock: z.number().int().nonnegative().optional(),
      }),
    )
    .min(1)
    .max(1000),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * POST /api/v1/blockchain/reconciliation
 *
 *   RUN               — compare the canonical capitalization records against the
 *                       approved on-chain representation and persist a run with
 *                       its inputs, findings and totals. READ-ONLY with respect to
 *                       both sides: `mutates_state = false` is stored, there is no
 *                       remediation field, and a stale chain view is reported as
 *                       `STALE_BLOCKCHAIN_STATE` instead of being trusted.
 *   RECORD_POSITIONS  — persist observed balances for a registered token. The
 *                       `authoritative` flag is pinned false by the service and no
 *                       input can set it; an unattributed address becomes an
 *                       UNKNOWN_HOLDER finding, never an invented party.
 *
 * A discrepancy is a finding for a human and must be fixed through the governed
 * cap-table / registry paths — never by writing an on-chain observation over the
 * register (or the other way round).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:manage",
      action: "blockchain.reconciliation.mutate",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "BLOCKCHAIN_RECONCILIATION_RUN" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "RUN": {
            const body = RunSchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.reconciliation.run", body, async () => ({
              status: 201,
              body: await runReconciliation(ctx.principal, body, mutationContext),
            }));
          }
          case "RECORD_POSITIONS": {
            const body = RecordPositionsSchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.reconciliation.record-positions", body, async () => ({
              status: 202,
              body: await recordTokenPositions(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError("VALIDATION_FAILED", "operation must be RUN or RECORD_POSITIONS.", 422, ctx.traceId);
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
 * GET /api/v1/blockchain/reconciliation?limit=… — run history with findings.
 * The finding list is returned verbatim (code, severity, detail, holder) so a
 * reviewer sees the same thing the engine saw. Positions are available with
 * `mode=positions` for the attribution check.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.reconciliation.read",
      audit: { objectType: "BLOCKCHAIN_RECONCILIATION_RUN" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const scope = await tenantScopeIds(ctx.principal);
      const limit = Math.min(100, Math.max(1, Number(q.get("limit") ?? 25)));
      if (q.get("mode") === "positions") {
        const items = await db
          .select({
            id: blockchainTokenPositions.id,
            holderAddress: blockchainTokenPositions.holderAddress,
            holderPartyId: blockchainTokenPositions.holderPartyId,
            tokenSymbol: blockchainTokenPositions.tokenSymbol,
            shareClassCode: blockchainTokenPositions.shareClassCode,
            balanceUnits: blockchainTokenPositions.balanceUnits,
            chainId: blockchainTokenPositions.chainId,
            lastSyncedBlock: blockchainTokenPositions.lastSyncedBlock,
            chainHeadBlock: blockchainTokenPositions.chainHeadBlock,
            authoritative: blockchainTokenPositions.authoritative,
            state: blockchainTokenPositions.state,
            lastReconciliationRunId: blockchainTokenPositions.lastReconciliationRunId,
          })
          .from(blockchainTokenPositions)
          .where(inArray(blockchainTokenPositions.tenantId, scope))
          .orderBy(desc(blockchainTokenPositions.updatedAt))
          .limit(500);
        return apiOk({ items, authoritative: false }, ctx.traceId);
      }
      const items = await db
        .select({
          id: blockchainReconciliationRuns.id,
          code: blockchainReconciliationRuns.code,
          networkKey: blockchainReconciliationRuns.networkKey,
          chainId: blockchainReconciliationRuns.chainId,
          asOfDate: blockchainReconciliationRuns.asOfDate,
          sharesPerUnit: blockchainReconciliationRuns.sharesPerUnit,
          toleranceUnits: blockchainReconciliationRuns.toleranceUnits,
          staleBlockTolerance: blockchainReconciliationRuns.staleBlockTolerance,
          status: blockchainReconciliationRuns.status,
          findings: blockchainReconciliationRuns.findings,
          findingCount: blockchainReconciliationRuns.findingCount,
          highSeverityCount: blockchainReconciliationRuns.highSeverityCount,
          totals: blockchainReconciliationRuns.totals,
          mutatesState: blockchainReconciliationRuns.mutatesState,
          ranBy: blockchainReconciliationRuns.ranBy,
          createdAt: blockchainReconciliationRuns.createdAt,
        })
        .from(blockchainReconciliationRuns)
        .where(inArray(blockchainReconciliationRuns.tenantId, scope))
        .orderBy(desc(blockchainReconciliationRuns.createdAt))
        .limit(limit);
      return apiOk({
        items,
        asOf: todayIso(),
        note: "Findings drive human action. No run may alter the cap table or the token ledger.",
      }, ctx.traceId);
    },
  );
}
