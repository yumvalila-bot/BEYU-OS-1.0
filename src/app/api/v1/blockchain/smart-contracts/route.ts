import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { smartContractRegistry } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { classificationsAtOrBelow } from "@/lib/constants";
import { upsertRegistryRecord, transitionRegistryRecord } from "@/lib/blockchain/service";
import { CONTRACT_OPERATIONAL_STATUSES, ORACLE_FEEDS } from "@/lib/blockchain/model";
import { ADDRESS20, HASH32, NETWORK_KEYS, contractApiError } from "../_common";

export const dynamic = "force-dynamic";

const GitCommit = /^[0-9a-f]{40}$/;

const UpsertRegistrySchema = z.object({
  name: z.string().trim().min(1).max(200),
  networkKey: z.enum(NETWORK_KEYS),
  address: z.string().trim().regex(ADDRESS20).nullish(),
  compilerVersion: z.string().trim().min(5).max(20),
  optimizerRuns: z.number().int().nonnegative().max(1_000_000).nullish(),
  repositoryRef: z.string().trim().max(300).nullish(),
  /** Full git commit SHA: build provenance must be reproducible, not abbreviated. */
  sourceCommit: z.string().trim().regex(GitCommit),
  abiHash: z.string().trim().regex(HASH32).nullish(),
  bytecodeHash: z.string().trim().regex(HASH32).nullish(),
  verifiedOnExplorer: z.boolean().optional(),
  proxyKind: z.enum(["NONE", "TRANSPARENT", "UUPS", "BEACON"]).optional(),
  implementationAddress: z.string().trim().regex(ADDRESS20).nullish(),
  upgradeAuthority: z.string().trim().regex(ADDRESS20).nullish(),
  multisigAddress: z.string().trim().regex(ADDRESS20).nullish(),
  timelockAddress: z.string().trim().regex(ADDRESS20).nullish(),
  timelockDelaySeconds: z.number().int().nonnegative().max(60 * 60 * 24 * 30).nullish(),
  auditStatus: z.string().trim().max(120).nullish(),
  auditReportDocumentRef: z.string().trim().max(200).nullish(),
  legalReviewStatus: z.enum(["REVIEW_OPEN", "LEGAL_REVIEW_CLOSED", "REQUIRES_LEGAL_REVIEW"]).optional(),
  purpose: z.string().trim().max(2000).nullish(),
  oracleDependencies: z.array(z.enum(ORACLE_FEEDS)).max(10).optional(),
  governanceBodyRef: z.string().trim().max(200).nullish(),
  riskClassificationCode: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullish(),
  externalRef: z.string().trim().max(200).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

const TransitionRegistrySchema = z.object({
  registryId: z.string().trim().min(1).max(100),
  to: z.enum(CONTRACT_OPERATIONAL_STATUSES),
  evidenceRef: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * POST /api/v1/blockchain/smart-contracts
 *
 *   UPSERT_RECORD          — register/amend a record. Refused unless the record
 *                            proves what a production deployment must prove: a
 *                            pinned compiler version, the full source commit,
 *                            ABI + bytecode digests, a completed audit, a named
 *                            multisig and timelock, and (for proxies) an
 *                            implementation plus an upgrade authority that is an
 *                            ADDRESS and is not the proxy itself.
 *   TRANSITION_STATUS      — move along the testnet-first ladder. A record cannot
 *                            skip verification, and DEPLOYED/COMPROMISED records
 *                            cannot be revived.
 *
 * `status` is not a field of UPSERT_RECORD: registration never sets its own
 * progression, exactly as a contract record cannot set its own lifecycle state.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:manage",
      action: "blockchain.registry.mutate",
      rateLimit: { limit: 40, windowMs: 60_000 },
      audit: { objectType: "SMART_CONTRACT_REGISTRY" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "UPSERT_RECORD": {
            const body = UpsertRegistrySchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.registry.upsert", body, async () => ({
              status: 201,
              body: await upsertRegistryRecord(ctx.principal, body, mutationContext),
            }));
          }
          case "TRANSITION_STATUS": {
            const body = TransitionRegistrySchema.parse(raw);
            return await withIdempotency(ctx, "blockchain.registry.transition", body, async () => ({
              status: 200,
              body: await transitionRegistryRecord(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be UPSERT_RECORD or TRANSITION_STATUS.",
              422,
              ctx.traceId,
            );
        }
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}

/** GET /api/v1/blockchain/smart-contracts?networkKey=…&status=… — the register. */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.registry.read",
      audit: { objectType: "SMART_CONTRACT_REGISTRY" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const networkKey = q.get("networkKey");
      const status = q.get("status");
      const scope = await tenantScopeIds(ctx.principal);
      const clauses = [
        inArray(smartContractRegistry.tenantId, scope),
        inArray(
          smartContractRegistry.classification,
          classificationsAtOrBelow(ctx.principal.clearance),
        ),
      ];
      if (networkKey) clauses.push(eq(smartContractRegistry.networkKey, networkKey));
      if (status) clauses.push(eq(smartContractRegistry.status, status));
      const items = await db
        .select({
          id: smartContractRegistry.id,
          name: smartContractRegistry.name,
          networkKey: smartContractRegistry.networkKey,
          chainId: smartContractRegistry.chainId,
          address: smartContractRegistry.address,
          status: smartContractRegistry.status,
          networkProduction: smartContractRegistry.networkProduction,
          compilerVersion: smartContractRegistry.compilerVersion,
          sourceCommit: smartContractRegistry.sourceCommit,
          abiHash: smartContractRegistry.abiHash,
          bytecodeHash: smartContractRegistry.bytecodeHash,
          proxyKind: smartContractRegistry.proxyKind,
          implementationAddress: smartContractRegistry.implementationAddress,
          upgradeAuthority: smartContractRegistry.upgradeAuthority,
          multisigAddress: smartContractRegistry.multisigAddress,
          timelockAddress: smartContractRegistry.timelockAddress,
          auditStatus: smartContractRegistry.auditStatus,
          legalReviewStatus: smartContractRegistry.legalReviewStatus,
          enforceabilityNote: smartContractRegistry.enforceabilityNote,
          oracleDependencies: smartContractRegistry.oracleDependencies,
          statusAt: smartContractRegistry.statusAt,
          classification: smartContractRegistry.classification,
        })
        .from(smartContractRegistry)
        .where(and(...clauses))
        .orderBy(desc(smartContractRegistry.updatedAt))
        .limit(200);
      return apiOk({ items }, ctx.traceId);
    },
  );
}
