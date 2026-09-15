import { apiError, apiOk, guarded } from "@/lib/api";
import { readExecutionPosture } from "@/lib/blockchain/service";
import { EXECUTION_PACKAGE_STATES, ORACLE_FEEDS, networkByKey } from "@/lib/blockchain/model";
import { NETWORK_KEYS, contractApiError } from "../_common";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/blockchain/execution-posture
 *   ?contractId=…            (id or code)
 *   &networkKey=…            (a governed network)
 *   &packageState=…          (one of the execution-package states)
 *   [&obligationId=…&contractAddress=…&feed=…&subjectCode=…&multisigApproved=true&timelockReady=true]
 *
 * The answer to "may this be executed on-chain right now?", computed from the
 * governed registers every time and never stored: the contract's lifecycle
 * state, whether a dispute pauses execution, whether the contract address is
 * registry-verified on that network, whether a VERIFIED anchor exists, whether
 * an oracle reading is usable for the feed, the multisig/timelock posture, and
 * whether the network is production at all.
 *
 * `permitted: true` means the gates are open, nothing more. This endpoint does
 * not sign, submit or broadcast; BEYU holds no keys and the decision to execute
 * still belongs to a human in the treasury and legal workflow.
 */
export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "blockchain:read",
      action: "blockchain.execution-posture.read",
      rateLimit: { limit: 600, windowMs: 60_000 },
      audit: { objectType: "BLOCKCHAIN_EXECUTION_PACKAGE" },
    },
    async (ctx) => {
      const q = new URL(request.url).searchParams;
      const contractId = q.get("contractId") ?? q.get("contractCode");
      const networkKey = q.get("networkKey");
      const packageState = q.get("packageState");
      if (!contractId || !networkKey || !packageState) {
        return apiError(
          "VALIDATION_FAILED",
          "contractId, networkKey and packageState are required.",
          422,
          ctx.traceId,
        );
      }
      if (!(NETWORK_KEYS as readonly string[]).includes(networkKey)) {
        return apiError("VALIDATION_FAILED", "networkKey is not a governed network.", 422, ctx.traceId);
      }
      if (!(EXECUTION_PACKAGE_STATES as readonly string[]).includes(packageState)) {
        return apiError("VALIDATION_FAILED", "packageState is not a governed execution-package state.", 422, ctx.traceId);
      }
      const feedParam = q.get("feed");
      const feed = feedParam ? ORACLE_FEEDS.find((f) => f === feedParam) : null;
      if (feedParam && !feed) {
        return apiError("VALIDATION_FAILED", "feed is not a governed oracle feed.", 422, ctx.traceId);
      }
      const subjectCode = q.get("subjectCode");
      if (Boolean(feedParam) !== Boolean(subjectCode)) {
        return apiError(
          "VALIDATION_FAILED",
          "feed and subjectCode must be supplied together: an oracle gate is evaluated for one subject of one feed.",
          422,
          ctx.traceId,
        );
      }
      try {
        const posture = await readExecutionPosture(ctx.principal, {
          contractId,
          obligationId: q.get("obligationId"),
          networkKey,
          packageState: packageState as (typeof EXECUTION_PACKAGE_STATES)[number],
          multisigApproved: q.get("multisigApproved") === "true",
          timelockReady: q.get("timelockReady") === "true",
          contractAddress: q.get("contractAddress"),
          feed,
          subjectCode,
        });
        return apiOk(
          {
            ...posture,
            networkKey: networkByKey(networkKey).key,
            executionAttempted: false,
            note: "Gates open does not mean executed: BEYU verifies, it does not sign or broadcast.",
          },
          ctx.traceId,
        );
      } catch (err) {
        const mapped = contractApiError(err, ctx.traceId);
        if (mapped) return mapped;
        throw err;
      }
    },
  );
}
