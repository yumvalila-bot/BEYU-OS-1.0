/**
 * BEYU OS — P4 Release Governance API (canonical)
 *
 * GET /api/v1/system/release
 * GET /api/v1/system/release?releaseId=…
 *
 * Returns the release control plane's AUTHORITATIVE state read from the
 * persisted ledger — not from memory and not decorated: current release
 * identity, persisted state-machine history, latest PVG evidence, canary /
 * blue-green / rollback instrument state, and the governance invariants.
 * Guarded: platform:dashboard.read.
 */

import { apiOk, apiError, guarded } from "@/lib/api";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { getHealthObservability } from "@/lib/release/observability";
import {
  getCurrentStateFromDb,
  getLatestBlueGreenDeployment,
  getLatestCanaryDeployment,
  getLatestPvgRun,
  getReleaseRecord,
  getTransitionHistory,
  listApprovals,
  listRollbackRequests,
} from "@/lib/release/store";
import { APPROVAL_REQUIRED_STATES } from "@/lib/release/approvals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return guarded(
    request,
    {
      permission: "platform:dashboard.read",
      action: "system.release.read",
      audit: { objectType: "RELEASE" },
    },
    async (ctx) => {
      const url = new URL(request.url);
      const requested = url.searchParams.get("releaseId");
      const identity = getCurrentReleaseIdentity();
      const releaseId = requested ?? identity.releaseId;

      try {
        const record = await getReleaseRecord(releaseId);
        const history = await getTransitionHistory(releaseId);
        const currentState = await getCurrentStateFromDb(releaseId);
        const latestPvg = await getLatestPvgRun(releaseId, identity.environment);
        const latestCanary = await getLatestCanaryDeployment(releaseId);
        const latestBlueGreen = await getLatestBlueGreenDeployment(identity.environment);
        const rollbacks = await listRollbackRequests(releaseId);
        const approvals = await listApprovals(releaseId);

        return apiOk(
          {
            release: identity,
            record,
            state: currentState,
            transitions: history,
            pvg: latestPvg,
            canary: latestCanary,
            blueGreen: latestBlueGreen,
            rollbacks,
            approvals,
            observability: getHealthObservability(),
            governance: {
              stateMachine: "canonical",
              pvg: "governed — runs are persisted evidence",
              canary: "governed with adapter boundary",
              blueGreen: "governed with adapter boundary",
              approvals: "four-eyes for PROMOTED/SWITCHED/CONTRACTED",
              approvalRequiredStates: APPROVAL_REQUIRED_STATES,
              expandContract: "EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT",
              invariants: ["DEPLOYED ≠ VERIFIED ≠ PROMOTED", "PVG fail-closed", "Canary % ≠ auth", "approval ≠ authorization"],
            },
          },
          ctx.traceId,
        );
      } catch (e) {
        // Persistence unreachable: report the failure explicitly rather than
        // degrading to an in-memory answer that would look authoritative.
        return apiError(
          "RELEASE_STORE_UNAVAILABLE",
          "Release governance persistence is unreachable",
          503,
          ctx.traceId,
          { error: e instanceof Error ? e.message : "error" },
        );
      }
    },
  );
}
