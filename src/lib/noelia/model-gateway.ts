import { asc, eq } from "drizzle-orm";
import { db, hasDatabaseTransactionContext } from "@/db";
import { modelRegistry } from "@/db/schema";
import type { NoeliaToolOutput, ToolInvocationContext } from "./types";

/**
 * Governed Model Gateway (section 19 of the Noelia capability target).
 *
 * HIVE remains the governed runtime boundary. No uncontrolled external LLM
 * provider is invoked: the gateway only exposes APPROVED models from the
 * governed registry, each with capability metadata, data-classification
 * limits, jurisdiction restrictions, timeout, retry policy, circuit breaker
 * and cost/token accounting fields.
 *
 * Until an external provider is registered AND activated by an accountable
 * human, execution remains deterministic/internal (the HIVE analyst
 * "beyu-hive-deterministic-analyst"). Retrieval of the registry is read-only;
 * provider activation is a governed write that requires authority.
 */
export class BeyuNoeliaModelGateway {
  private requireContext(): void {
    if (!hasDatabaseTransactionContext()) {
      throw new Error("Noelia model gateway requires canonical transaction-scoped tenant context");
    }
  }

  async registry(context: ToolInvocationContext): Promise<NoeliaToolOutput> {
    this.requireContext();
    const rows = await db
      .select()
      .from(modelRegistry)
      .orderBy(asc(modelRegistry.provider), asc(modelRegistry.model));

    if (rows.length === 0) {
      return {
        headline: "Model registry is EMPTY: only the deterministic internal HIVE analyst is available.",
        findings: [{
          label: "Approved models",
          value: "beyu-hive-deterministic-analyst (internal, deterministic)",
          kind: "FACT",
          status: "OBSERVED",
        }],
        narrative:
          "No external model provider is registered or activated. Noelia executes deterministically inside the HIVE boundary; no BEYU data leaves the approved execution boundary.",
        confidence: 0.95,
        metadata: {
          externalProviders: [],
          deterministicOnly: true,
        },
      };
    }

    return {
      headline: `${rows.length} model registry record(s).`,
      findings: rows.map((row) => ({
        label: `${row.provider} · ${row.model}@${row.version}`,
        value: `status ${row.status} · max classification ${row.maxClassification}${row.jurisdictionRestrictions.length ? ` · jurisdictions ${row.jurisdictionRestrictions.join(",")}` : ""}`,
        kind: "FACT",
        status: "OBSERVED",
      })),
      sources: rows.map((row) => ({
        kind: "MODEL_REGISTRY",
        ref: row.id,
        label: `${row.provider}/${row.model}@${row.version}`,
        authority: "MODEL_GATEWAY",
      })),
      metadata: {
        models: rows.map((row) => ({
          id: row.id,
          provider: row.provider,
          model: row.model,
          version: row.version,
          status: row.status,
          maxClassification: row.maxClassification,
          jurisdictionRestrictions: row.jurisdictionRestrictions,
          timeoutMs: row.timeoutMs,
          costPerToken: row.costPerToken,
          latencyMs: row.latencyMs,
          fallbackModelId: row.fallbackModelId,
          effectiveFrom: row.effectiveFrom,
          retiredAt: row.retiredAt,
        })),
      },
      narrative:
        "The registry lists approved models; activation of an external provider remains a governed human decision. Until then execution is deterministic and internal.",
      confidence: 0.9,
    };
  }
}
