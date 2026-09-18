/**
 * BEYU OS — P3 Release Governance API (canonical)
 *
 * GET /api/v1/system/release
 *
 * Returns current release observability: release ID, deployment ID, PVG status,
 * canary state, traffic state, promotion state, rollback state, migration fingerprint,
 * schema fingerprint, runtime version.
 *
 * Guarded: platform:dashboard.read
 */

import { apiOk, guarded } from "@/lib/api";
import { getCurrentReleaseIdentity } from "@/lib/release/identity";
import { getHealthObservability } from "@/lib/release/observability";

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
      const identity = getCurrentReleaseIdentity();
      const observability = getHealthObservability();

      // In real DB mode, would fetch history, PVG runs, canary, blue/green from DB
      // For P3, we return current identity + observability + note about DB persistence
      return apiOk(
        {
          release: identity,
          observability,
          governance: {
            stateMachine: "canonical",
            pvg: "governed",
            canary: "governed with adapter boundary",
            blueGreen: "governed with adapter boundary",
            expandContract: "EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT",
            invariants: ["DEPLOYED != VERIFIED != PROMOTED", "PVG fail-closed", "Canary % != auth"],
          },
          // Placeholder for DB-backed history (would be fetched from release_transitions)
          history: [],
          pvgRuns: [],
          canaryDeployments: [],
          blueGreenDeployments: [],
        },
        ctx.traceId,
      );
    },
  );
}
