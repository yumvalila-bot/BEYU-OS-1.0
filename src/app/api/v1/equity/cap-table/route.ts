import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { EQUITY_ERROR_STATUS, EquityError } from "@/lib/equity/errors";
import { EquityModelError } from "@/lib/equity/model";
import {
  computeCapTableSnapshot,
  createShareClass,
  issueEquityPosition,
  readCapTable,
} from "@/lib/equity/service";

export const dynamic = "force-dynamic";

const CLASS_TYPES = ["ORDINARY", "PREFERRED", "FOUNDER", "NON_VOTING", "TRACKING"] as const;
const HOLDER_TYPES = ["FOUNDER", "INVESTOR", "ESOP_POOL", "TREASURY", "EMPLOYEE", "TRUST", "OTHER"] as const;
const FREQUENCIES = ["MONTHLY", "QUARTERLY", "ANNUAL"] as const;
const ACCELERATION = ["NONE", "SINGLE_TRIGGER", "DOUBLE_TRIGGER", "PARTIAL_DOUBLE_TRIGGER"] as const;
const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED", "HIGHLY_RESTRICTED"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const CreateShareClassSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(200),
  classType: z.enum(CLASS_TYPES).optional(),
  authorizedShares: z.number().int().nonnegative(),
  votesPerShare: z.string().trim().regex(/^\d+(\.\d{1,4})?$/).optional(),
  rightsSummary: z.string().trim().max(4000).nullish(),
  instrumentDocumentRef: z.string().trim().max(200).nullish(),
  approvalRef: z.string().trim().max(200).nullish(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const IssuePositionSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  shareClassId: z.string().trim().min(1).max(100),
  holderType: z.enum(HOLDER_TYPES),
  holderPartyId: z.string().trim().max(100).nullish(),
  holderName: z.string().trim().min(1).max(200),
  instrument: z.string().trim().max(100).optional(),
  totalShares: z.number().int().positive(),
  effectiveFrom: z.string().trim().regex(ISO_DATE),
  ownershipRecordId: z.string().trim().max(100).nullish(),
  provenance: z.string().trim().min(1).max(400),
  supportingDocumentId: z.string().trim().max(200).nullish(),
  resolutionRef: z.string().trim().min(1).max(100),
  approvalRef: z.string().trim().max(200).nullish(),
  vesting: z
    .object({
      vestingMonths: z.number().int().positive().max(480),
      cliffMonths: z.number().int().nonnegative().max(480),
      frequency: z.enum(FREQUENCIES).optional(),
      startDate: z.string().trim().regex(ISO_DATE),
      accelerationPolicy: z.enum(ACCELERATION).optional(),
      accelerationPctMillionths: z.number().int().positive().max(1_000_000).nullish(),
      documentRef: z.string().trim().max(200).nullish(),
    })
    .nullish(),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

const ComputeSnapshotSchema = z.object({
  legalEntityId: z.string().trim().min(1).max(100),
  asOfDate: z.string().trim().regex(ISO_DATE),
  classification: z.enum(CLASSIFICATIONS).optional(),
});

/**
 * GET /api/v1/equity/cap-table?legalEntityId=…
 *
 * Live (read-only) financing-grade capitalization for one entity, computed by
 * the deterministic engine from canonical positions/classes/plans/grants.
 * Visibility only — never an authorization (§45).
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:cap-table.read",
      action: "equity.cap-table.read",
      audit: { objectType: "CAP_TABLE" },
    },
    async (ctx) => {
      const legalEntityId = new URL(request.url).searchParams.get("legalEntityId");
      if (!legalEntityId) {
        return apiError("VALIDATION_FAILED", "legalEntityId query parameter is required.", 422, ctx.traceId);
      }
      try {
        const capTable = await readCapTable(ctx.principal, { legalEntityId });
        return apiOk(capTable, ctx.traceId);
      } catch (err) {
        if (err instanceof EquityError) {
          return apiError(err.code, err.message, EQUITY_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        throw err;
      }
    },
  );
}

/**
 * POST /api/v1/equity/cap-table
 *
 * Governed capitalization mutations:
 *   CREATE_SHARE_CLASS — register a share class for an entity;
 *   ISSUE_POSITION     — issue an equity position (governance-authorized by an
 *                        APPROVED resolution; optionally with a DRAFT vesting
 *                        schedule using the default 48/12/monthly candidate);
 *   COMPUTE_SNAPSHOT   — persist a reconstructable cap-table snapshot.
 *
 * None of these posts money or rewrites `ownership_records` (§13, §22, §29).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "equity:cap-table.manage",
      action: "equity.cap-table.manage",
      rateLimit: { limit: 30, windowMs: 60_000 },
      audit: { objectType: "CAP_TABLE" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      try {
        switch (operation) {
          case "CREATE_SHARE_CLASS": {
            const body = CreateShareClassSchema.parse(raw);
            return await withIdempotency(ctx, "equity.cap-table.create-share-class", body, async () => {
              const result = await createShareClass(ctx.principal, body, {
                traceId: ctx.traceId,
                ipAddress: ctx.ip,
                userAgent: ctx.userAgent,
              });
              return { status: 201, body: result };
            });
          }
          case "ISSUE_POSITION": {
            const body = IssuePositionSchema.parse(raw);
            return await withIdempotency(ctx, "equity.cap-table.issue-position", body, async () => {
              const result = await issueEquityPosition(ctx.principal, body, {
                traceId: ctx.traceId,
                ipAddress: ctx.ip,
                userAgent: ctx.userAgent,
              });
              return { status: 201, body: result };
            });
          }
          case "COMPUTE_SNAPSHOT": {
            const body = ComputeSnapshotSchema.parse(raw);
            return await withIdempotency(ctx, "equity.cap-table.compute-snapshot", body, async () => {
              const result = await computeCapTableSnapshot(ctx.principal, body, {
                traceId: ctx.traceId,
                ipAddress: ctx.ip,
                userAgent: ctx.userAgent,
              });
              return { status: 201, body: result };
            });
          }
          default:
            return apiError(
              "VALIDATION_FAILED",
              "operation must be one of CREATE_SHARE_CLASS, ISSUE_POSITION, COMPUTE_SNAPSHOT.",
              422,
              ctx.traceId,
            );
        }
      } catch (err) {
        if (err instanceof EquityError) {
          return apiError(err.code, err.message, EQUITY_ERROR_STATUS[err.code], ctx.traceId, err.detail);
        }
        if (err instanceof EquityModelError) {
          return apiError("MODEL_ERROR", err.message, 422, ctx.traceId, { code: err.code });
        }
        throw err;
      }
    },
  );
}
