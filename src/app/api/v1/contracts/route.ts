import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contractRecords } from "@/db/schema";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { tenantScopeIds } from "@/lib/tenant-scope";
import { CONTRACT_LIFECYCLE_STATES } from "@/lib/contracts/vocabulary";
import {
  createContractRecord,
  transitionContract,
  evaluateContractAuthority,
  attachAnchorEvidence,
} from "@/lib/contracts/service";
import { CONTRACT_ERROR_STATUS, ContractError } from "@/lib/contracts/errors";
import { ContractModelError } from "@/lib/contracts/pure";
import {
  ANCHOR_METHODS,
  CLASSIFICATIONS,
  CONTRACT_ACTIONS,
  CONTRACT_TYPES,
  ISO_DATE,
  NETWORK_KEYS,
  contractApiError,
} from "./_common";

export const dynamic = "force-dynamic";

const CreateRecordSchema = z.object({
  code: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  typeCode: z.enum(CONTRACT_TYPES),
  counterpartyPartyId: z.string().trim().max(100).nullish(),
  beyuEntityId: z.string().trim().max(100).nullish(),
  contractValue: z.number().int().nonnegative().nullish(),
  currencyCode: z.string().trim().length(3).toUpperCase().optional(),
  governingLawJurisdictionCode: z.string().trim().min(2).max(8).nullish(),
  ownerUserId: z.string().trim().max(100).nullish(),
  criticality: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  classification: z.enum(CLASSIFICATIONS).optional(),
  note: z.string().trim().max(2000).nullish(),
});

const TransitionSchema = z.object({
  contractId: z.string().trim().min(1).max(100),
  action: z.enum(CONTRACT_ACTIONS),
  evidenceRef: z.string().trim().max(200).nullish(),
  resolutionRef: z.string().trim().max(100).nullish(),
  disputeRef: z.string().trim().max(100).nullish(),
  note: z.string().trim().max(2000).nullish(),
});

const AuthoritySchema = z.object({
  contractId: z.string().trim().min(1).max(100),
  facts: z.object({
    jurisdictionCode: z.string().trim().min(2).max(8),
    annualValue: z.number().int().nonnegative().optional(),
    trustPartyInvolved: z.boolean().optional(),
    relatedParty: z.boolean().optional(),
    affectsOwnership: z.boolean().optional(),
    involvesPersonalData: z.boolean().optional(),
    blockchainExecution: z.boolean().optional(),
    asOfDate: z.string().trim().regex(ISO_DATE).optional(),
    contractingEntityIdentified: z.boolean(),
    counterpartyIdentified: z.boolean(),
    signatoryRoleIds: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    requiredSignatoryRoleIds: z.array(z.string().trim().min(1).max(60)).max(40).default([]),
    delegation: z
      .object({
        active: z.boolean(),
        approvedOn: z.string().trim().regex(ISO_DATE).nullish(),
        scopeOk: z.boolean().optional(),
      })
      .nullable()
      .default(null),
    legalReviewStatus: z.string().trim().min(1).max(60),
    riskReviewClosed: z.boolean(),
    commercialApproval: z.object({ approved: z.boolean() }),
    boardResolution: z.object({ approved: z.boolean() }),
    shareholderResolution: z.object({ approved: z.boolean() }),
    trusteeResolution: z.object({ approved: z.boolean() }),
    financeApproval: z.object({ approved: z.boolean() }),
    procurementApproval: z.object({ approved: z.boolean() }),
    regulatoryRestrictionsChecked: z.object({ checked: z.boolean(), clean: z.boolean() }),
    conflictsChecked: z.object({ checked: z.boolean(), clean: z.boolean() }),
    complianceRestrictionsChecked: z.object({ checked: z.boolean(), clean: z.boolean() }),
    executionMethod: z.enum(["LEGAL_ONLY", "LEGAL_PLUS_ONCHAIN", "ONCHAIN_DETERMINISTIC"]).optional(),
  }),
});

const AttachAnchorSchema = z.object({
  contractId: z.string().trim().min(1).max(100),
  obligationId: z.string().trim().max(100).nullish(),
  anchorId: z.string().trim().min(1).max(100),
  networkKey: z.enum(NETWORK_KEYS),
  anchorContractAddress: z.string().trim().regex(/^0x[0-9a-fA-F]{40}$/),
  documentId: z.string().trim().max(100).nullish(),
  contentHash: z.string().trim().regex(/^0x[0-9a-fA-F]{64}$/),
  executedAt: z.string().trim().min(10).max(40),
  method: z.enum(ANCHOR_METHODS).optional(),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * GET /api/v1/contracts?state=…&typeFamily=…&counterpartyPartyId=…&limit=…&offset=…
 *
 * The governed contract register, filtered within the caller's tenant scope.
 * Read-only visibility: a list row is never an authorization, and the `state`
 * shown here is only ever written by the lifecycle engine (POST below).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:read",
      action: "contracts.register.read",
      audit: { objectType: "CONTRACT_RECORD" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const state = q.get("state");
      const typeFamily = q.get("typeFamily");
      const counterpartyPartyId = q.get("counterpartyPartyId");
      const limit = Math.min(200, Math.max(1, Number(q.get("limit") ?? 50)));
      const offset = Math.max(0, Number(q.get("offset") ?? 0));
      if (state && !(CONTRACT_LIFECYCLE_STATES as readonly string[]).includes(state)) {
        return apiError("VALIDATION_FAILED", "state is not a governed lifecycle state.", 422, ctx.traceId);
      }
      const scope = await tenantScopeIds(ctx.principal);
      const clauses = [inArray(contractRecords.tenantId, scope)];
      if (state) clauses.push(eq(contractRecords.state, state));
      if (typeFamily) clauses.push(eq(contractRecords.typeFamily, typeFamily));
      if (counterpartyPartyId) clauses.push(eq(contractRecords.counterpartyPartyId, counterpartyPartyId));
      const rows = await db
        .select({
          id: contractRecords.id,
          code: contractRecords.code,
          title: contractRecords.title,
          typeCode: contractRecords.typeCode,
          typeFamily: contractRecords.typeFamily,
          state: contractRecords.state,
          criticality: contractRecords.criticality,
          currencyCode: contractRecords.currencyCode,
          contractValue: contractRecords.contractValue,
          signedDate: contractRecords.signedDate,
          effectiveDate: contractRecords.effectiveDate,
          expiryDate: contractRecords.expiryDate,
          legalReviewStatus: contractRecords.legalReviewStatus,
          enforceabilityState: contractRecords.enforceabilityState,
          executionMethod: contractRecords.executionMethod,
          currentStateAt: contractRecords.currentStateAt,
          classification: contractRecords.classification,
        })
        .from(contractRecords)
        .where(and(...clauses))
        .orderBy(desc(contractRecords.updatedAt))
        .limit(limit)
        .offset(offset);
      return apiOk({ items: rows, limit, offset, asOf: new Date().toISOString() }, ctx.traceId);
    },
  );
}

/**
 * POST /api/v1/contracts
 *
 * Governed register mutations, all idempotency-keyed:
 *   CREATE_RECORD        — register a contract (inert; closes no gate);
 *   TRANSITION           — one lifecycle action, decided by the engine from
 *                          recorded gates/evidence/resolution (AI-actor refusal
 *                          applies to the human-only action set);
 *   EVALUATE_AUTHORITY   — record an authority determination (never an approval);
 *   ATTACH_ANCHOR        — link on-chain anchor evidence + the EIP-712 commitment.
 *
 * There is deliberately no operation that sets a state, a review status or an
 * authority outcome directly: those are engine outputs, not client inputs.
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:manage",
      action: "contracts.register.mutate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "CONTRACT_RECORD" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      const mutationContext = { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent };
      try {
        switch (operation) {
          case "CREATE_RECORD": {
            const body = CreateRecordSchema.parse(raw);
            return await withIdempotency(ctx, "contracts.register.create", body, async () => ({
              status: 201,
              body: await createContractRecord(ctx.principal, body, mutationContext),
            }));
          }
          case "TRANSITION": {
            const body = TransitionSchema.parse(raw);
            return await withIdempotency(ctx, "contracts.register.transition", body, async () => ({
              status: 200,
              body: await transitionContract(ctx.principal, body, mutationContext),
            }));
          }
          case "EVALUATE_AUTHORITY": {
            const body = AuthoritySchema.parse(raw);
            return await withIdempotency(ctx, "contracts.register.evaluate-authority", body, async () => ({
              status: 200,
              body: await evaluateContractAuthority(ctx.principal, body, mutationContext),
            }));
          }
          case "ATTACH_ANCHOR": {
            const body = AttachAnchorSchema.parse(raw);
            return await withIdempotency(ctx, "contracts.register.attach-anchor", body, async () => ({
              status: 201,
              body: await attachAnchorEvidence(ctx.principal, body, mutationContext),
            }));
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of CREATE_RECORD, TRANSITION, EVALUATE_AUTHORITY, ATTACH_ANCHOR.",
              422,
              ctx.traceId,
            );
        }
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        if (err instanceof ContractError) {
          return apiError(err.code, err.message, CONTRACT_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        if (err instanceof ContractModelError) {
          return apiError(err.code, err.message, 422, ctx.traceId, { code: err.code });
        }
        throw err;
      }
    },
  );
}
