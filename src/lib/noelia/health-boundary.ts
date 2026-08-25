import { eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { integrations } from "@/db/schema";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * Health OS integration boundary (section 11 of the Noelia capability target).
 *
 * The rule is source-driven:
 *   - If a real Health OS runtime/source is registered (an integration of
 *     category HEALTH pointing at a canonical provider), this boundary reports
 *     its status and future tools may be bound to its governed APIs.
 *   - If no real Health OS runtime exists, this boundary returns UNAVAILABLE.
 *     It NEVER fabricates clinical data, creates fake clinical tables, or
 *     treats seeded snapshots as clinical truth. Clinical decisions remain
 *     human-authorized; Noelia never diagnoses, prescribes, orders treatment
 *     or makes binding clinical decisions.
 */
export class BeyuNoeliaHealthBoundary {
  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia health boundary requires canonical transaction-scoped tenant context");
    }
  }

  async status(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const healthIntegrations = await db
      .select()
      .from(integrations)
      .where(eq(integrations.category, "HEALTH"))
      .limit(10);

    if (healthIntegrations.length === 0) {
      return {
        headline: "Health OS runtime is NOT REGISTERED — health intelligence is UNAVAILABLE.",
        findings: [{
          label: "Health OS runtime",
          value: "UNAVAILABLE",
          kind: "INFERENCE",
          status: "UNAVAILABLE",
        }],
        narrative:
          "No governed Health OS integration is registered. Noelia does not fabricate clinical data or create fake clinical truth. The integration boundary is ready for a real Health OS source; clinical decisions remain human-authorized.",
        confidence: 0.95,
        humanReviewRequired: false,
        metadata: {
          healthSource: "NONE_REGISTERED",
          clinicalDecisionSupport: "NOT_AVAILABLE",
        },
      };
    }

    const active = healthIntegrations.filter((integration) => integration.status === "ACTIVE");
    return {
      headline: `Health OS integration registered: ${healthIntegrations.length} record(s), ${active.length} active.`,
      findings: healthIntegrations.map((integration) => ({
        label: `${integration.code} · ${integration.name}`,
        value: `${integration.provider} · ${integration.standard ?? "REST"} · status ${integration.status}${integration.lastSyncAt ? ` · last sync ${integration.lastSyncAt.toISOString()}` : ""}`,
        kind: "FACT",
        status: "OBSERVED",
      })),
      sources: healthIntegrations.map((integration) => ({
        kind: "INTEGRATION",
        ref: integration.code,
        label: integration.name,
        authority: "INTEGRATION_REGISTRY",
      })),
      narrative:
        "Health integration status is register evidence. Clinical truth remains with the authorized Health OS source; Noelia never diagnoses, prescribes, orders treatment or makes binding clinical decisions.",
      confidence: 0.9,
      humanReviewRequired: active.length === 0,
      metadata: {
        healthSource: active.length ? "REGISTERED" : "REGISTERED_BUT_INACTIVE",
        clinicalDecisionSupport: "NOT_AVAILABLE",
      },
    };
  }
}
