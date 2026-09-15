import { z } from "zod";
import { apiError, apiOk, guarded, withIdempotency } from "@/lib/api";
import { upsertContractParty, readContractHealth, readDisputes, readSigningStatus } from "@/lib/contracts/service";
import { PARTY_KINDS } from "@/lib/contracts/parties";
import { SIGNATORY_ROLE_KINDS } from "@/lib/contracts/vocabulary";
import { ADDRESS20, ISO_DATE, contractApiError, todayIso } from "../_common";

export const dynamic = "force-dynamic";

const UpsertPartySchema = z.object({
  partyId: z.string().trim().min(1).max(100),
  counterpartyKind: z.enum(PARTY_KINDS),
  legalEntityId: z.string().trim().max(100).nullish(),
  signatoryRoleCode: z.enum(SIGNATORY_ROLE_KINDS).nullish(),
  sanctionsResult: z.enum(["CLEAN", "HIT", "PENDING", "STALE"]).optional(),
  sanctionsScreenedOn: z.string().trim().regex(ISO_DATE).nullish(),
  kycState: z.enum(["NOT_REQUIRED", "PENDING", "VERIFIED", "EXPIRED", "REFUSED"]).optional(),
  legalNameSnapshot: z.string().trim().max(200).nullish(),
  taxIdReference: z.string().trim().max(80).nullish(),
  defaultCurrencyCode: z.string().trim().length(3).toUpperCase().nullish(),
  payoutProfileRef: z.string().trim().max(200).nullish(),
  approvedBlockchainAddress: z.string().trim().regex(ADDRESS20).nullish(),
  blockchainAddressEvidenceRef: z.string().trim().max(200).nullish(),
  riskOverride: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullish(),
  openDisputes: z.number().int().nonnegative().max(10_000).optional(),
  priorDisputes: z.number().int().nonnegative().max(10_000).optional(),
  asOfDate: z.string().trim().regex(ISO_DATE),
  note: z.string().trim().max(2000).nullish(),
});

/**
 * POST /api/v1/contracts/parties
 *
 * UPSERT_PARTY — record a counterparty's contract posture. The verdict is
 * COMPUTED by the parties engine from verification facts (identity, authority,
 * KYC/KYB, screening freshness, dispute history): a caller can supply facts but
 * can never supply "CLEAR". `approvedBlockchainAddress` is a relationship fact
 * used for reconciliation attribution only — it is not an identity claim and not
 * a key (there is no key material anywhere in this domain).
 */
export async function POST(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:manage",
      action: "contracts.parties.mutate",
      rateLimit: { limit: 60, windowMs: 60_000 },
      audit: { objectType: "CONTRACT_PARTY" },
      databaseContext: "handler",
    },
    async (ctx) => {
      const raw = (await ctx.request.json().catch(() => ({}))) as Record<string, unknown>;
      const operation = typeof raw.operation === "string" ? raw.operation : "";
      try {
        if (operation !== "UPSERT_PARTY") {
          return apiError("VALIDATION_FAILED", "operation must be UPSERT_PARTY.", 422, ctx.traceId);
        }
        const body = UpsertPartySchema.parse(raw);
        const { approvedBlockchainAddress, blockchainAddressEvidenceRef, ...rest } = body;
        return await withIdempotency(ctx, "contracts.parties.upsert", body, async () => ({
          status: 200,
          body: await upsertContractParty(
            ctx.principal,
            {
              ...rest,
              // The address is validated and normalized by the service; passing it
              // through keeps posture and reconciliation attribution in one act.
              approvedBlockchainAddress: approvedBlockchainAddress ?? null,
              blockchainAddressEvidenceRef: blockchainAddressEvidenceRef ?? null,
            },
            { traceId: ctx.traceId, ipAddress: ctx.ip, userAgent: ctx.userAgent },
          ),
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
 * GET /api/v1/contracts/parties?contractId=…&asOf=…
 *
 * Signing readiness and dispute posture for one contract. ADVISORY VIEWS: health
 * scores never gate anything, and these reads cannot change a state — an operator
 * dashboard must be able to look without touching.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "contracts:read",
      action: "contracts.parties.read",
      audit: { objectType: "CONTRACT_PARTY" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const contractId = q.get("contractId");
      if (!contractId) return apiError("VALIDATION_FAILED", "contractId is required.", 422, ctx.traceId);
      const asOf = q.get("asOf") ?? todayIso();
      if (!ISO_DATE.test(asOf)) return apiError("VALIDATION_FAILED", "asOf must be YYYY-MM-DD.", 422, ctx.traceId);
      try {
        const [signing, disputes, health] = await Promise.all([
          readSigningStatus(ctx.principal, contractId),
          readDisputes(ctx.principal, contractId),
          readContractHealth(ctx.principal, contractId, asOf),
        ]);
        return apiOk({ contractId, asOf, signing, disputes, health }, ctx.traceId);
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}
