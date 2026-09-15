import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { blockchainAnchors } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { createAnchor, verifyAnchor } from "@/lib/blockchain/service";
import { ANCHOR_METHODS } from "@/lib/blockchain/model";
import { ADDRESS20, HASH32, NETWORK_KEYS, contractApiError } from "../_common";

export const dynamic = "force-dynamic";

const CreateAnchorSchema = z.object({
  anchorType: z.enum(["CONTRACT", "OBLIGATION", "LEGAL_DOCUMENT", "CAP_TABLE_SNAPSHOT", "POLICY_SET", "DECISION_LOG"]),
  subjectId: z.string().trim().max(100).nullish(),
  contractId: z.string().trim().max(100).nullish(),
  obligationId: z.string().trim().max(100).nullish(),
  /** Commitment-bearing payload only: confidential text belongs in `documents`. */
  content: z.record(z.string(), z.unknown()).refine((v) => v !== null && typeof v === "object"),
  contentVersion: z.string().trim().min(1).max(60).optional(),
  method: z.enum(ANCHOR_METHODS),
  networkKey: z.enum(NETWORK_KEYS).nullish(),
  anchorContractAddress: z.string().trim().regex(ADDRESS20).nullish(),
  signerRef: z.string().trim().max(200).nullish(),
  txHash: z.string().trim().regex(HASH32).nullish(),
  blockNumber: z.number().int().nonnegative().nullish(),
  note: z.string().trim().max(2000).nullish(),
});

const VerifySchema = z.object({
  anchorId: z.string().trim().min(1).max(100),
  latestBlock: z.number().int().nonnegative().nullish(),
  blockHash: z.string().trim().regex(HASH32).nullish(),
  blockHashMatchesChain: z.boolean().nullish(),
});

/**
 * POST /api/v1/blockchain/anchors
 *
 *   CREATE_ANCHOR — record a commitment. BEYU computes `contentHash` (SHA-256 over
 *                   the canonical, stable-stringified payload) and, for EVM
 *                   methods, the EIP-712 typed digest. A caller cannot supply its
 *                   own hash of the same payload: what is stored must be
 *                   reproducible by BEYU and re-verifiable by a contract.
 *   VERIFY_ANCHOR — re-verify against observed chain data (confirmation depth for
 *                   the network, block-hash agreement, registry listing) AND against
 *                   the recomputed commitment. Verification never approves
 *                   anything; a mismatch is a stored finding for a human.
 *
 * There is no operation here that signs, broadcasts or accepts key material — the
 * request schemas above have no field that could carry one.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:manage",
      action: "blockchain.anchors.mutate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "BLOCKCHAIN_ANCHOR" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "CREATE_ANCHOR": {
            const body = CreateAnchorSchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.anchors.create", body, async () => ({
              status: 201,
              body: await createAnchor(ctx.principal, body, mutationContext),
            }));
          }
          case "VERIFY_ANCHOR": {
            const body = VerifySchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.anchors.verify", body, async () => ({
              status: 200,
              body: await verifyAnchor(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError("VALIDATION_FAILED", "operation must be CREATE_ANCHOR or VERIFY_ANCHOR.", 422, ctx.traceId);
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
 * GET /api/v1/blockchain/anchors?contractId=…&status=…
 * Anchor register with the stored verification findings. `asOf`-free by design:
 * confirmation depth is whatever the last verification observed, and the row
 * records who verified it and when.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.anchors.read",
      audit: { objectType: "BLOCKCHAIN_ANCHOR" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const contractId = q.get("contractId");
      const status = q.get("status");
      const scope = await tenantScopeIds(ctx.principal);
      const clauses = [inArray(blockchainAnchors.tenantId, scope)];
      if (contractId) clauses.push(eq(blockchainAnchors.contractId, contractId));
      if (status) clauses.push(eq(blockchainAnchors.status, status));
      const items = await db
        .select({
          id: blockchainAnchors.id,
          anchorType: blockchainAnchors.anchorType,
          subjectId: blockchainAnchors.subjectId,
          contractId: blockchainAnchors.contractId,
          contentHash: blockchainAnchors.contentHash,
          commitment: blockchainAnchors.commitment,
          commitmentVersion: blockchainAnchors.commitmentVersion,
          method: blockchainAnchors.method,
          networkKey: blockchainAnchors.networkKey,
          chainId: blockchainAnchors.chainId,
          txHash: blockchainAnchors.txHash,
          blockNumber: blockchainAnchors.blockNumber,
          confirmations: blockchainAnchors.confirmations,
          requiredConfirmations: blockchainAnchors.requiredConfirmations,
          status: blockchainAnchors.status,
          verification: blockchainAnchors.verification,
          legalReviewStatus: blockchainAnchors.legalReviewStatus,
          classification: blockchainAnchors.classification,
          updatedAt: blockchainAnchors.updatedAt,
        })
        .from(blockchainAnchors)
        .where(and(...clauses))
        .orderBy(desc(blockchainAnchors.updatedAt))
        .limit(200);
      return apiOk({ items }, ctx.traceId);
    },
  );
}
