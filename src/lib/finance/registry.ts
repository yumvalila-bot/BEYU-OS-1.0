/**
 * BEYU OS — Finance OS capability inventory and dependency graph (Phase 7J, §21, §22).
 *
 * NO CAPABILITY IS CREATED HERE. This reads the 60 capabilities that already exist in
 * `governance_capability_registry` and classifies them. Inflating the count to make the Finance OS
 * look more complete would be the easiest lie in this codebase to tell and the hardest to detect.
 *
 * READ-ONLY. Activates nothing.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceCapabilityRegistry, governanceDecisionRegistry } from "@/db/schema";
import { buildChain } from "@/lib/authority/engines";
import type { AuthorityChain, ChainLink } from "@/lib/authority/model";
import type { FinanceDomain } from "./truth";

/**
 * What a capability does, which decides how dangerous it is.
 *
 * ANALYTICAL     reads and computes; cannot change financial state
 * GOVERNED       produces a governed record (a recommendation, an assessment)
 * EXECUTION      moves money or creates accounting truth — the class that must stay locked
 * ADMINISTRATIVE configuration and registry maintenance
 */
export const CAPABILITY_CLASS = ["ANALYTICAL", "GOVERNED", "EXECUTION", "ADMINISTRATIVE"] as const;
export type CapabilityClass = (typeof CAPABILITY_CLASS)[number];

/**
 * Execution readiness for one capability, as a pure function of its registry row.
 *
 * EXPORTED FOR DIRECT TESTING. FI-20 showed the "no declared decisions" branch could be flipped to
 * ELIGIBLE undetected, because every real row is also LOCKED and the first branch already denied.
 * The rule that an empty `requiredDecisions` list is a registry DEFECT rather than a free pass
 * must be provable on its own.
 */
export function executionStatusOf(
  activationStatus: string,
  requiredDecisions: string[],
): "LOCKED" | "ELIGIBLE" | "ACTIVE" {
  if (activationStatus !== "ACTIVATED") return "LOCKED";
  // An activated capability that declares no governing decisions is a registry defect. Treating
  // it as eligible would grant execution that no decision authorises.
  if (requiredDecisions.length === 0) return "LOCKED";
  return "ELIGIBLE";
}

export type FinanceCapability = {
  capabilityId: string;
  domain: FinanceDomain | "PLATFORM";
  operation: string;
  permission: string | null;
  requiredDecisions: string[];
  capabilityClass: CapabilityClass;
  tenantScope: "TENANT_SCOPED" | "GROUP_WIDE";
  entityScope: "ENTITY_SCOPED" | "ALL_ENTITIES";
  activationStatus: string;
  auditRequired: boolean;
  executionStatus: "LOCKED" | "ELIGIBLE" | "ACTIVE";
};

/** Maps a capability code onto a Finance OS domain from its own name. */
function domainOf(code: string): FinanceDomain | "PLATFORM" {
  const c = code.toUpperCase();
  if (c.includes("FORECAST")) return "FORECASTING";
  if (c.includes("TREASURY")) return "TREASURY";
  if (c.includes("RISK")) return "RISK";
  if (c.includes("COMPLIANCE")) return "COMPLIANCE";
  if (c.includes("AUDIT")) return "AUDIT";
  if (c.includes("FPNA") || c.includes("FP_AND_A")) return "FPNA";
  if (c.includes("TAX")) return "TAX";
  if (c.includes("CAPITAL") || c.includes("WATERFALL")) return "CAPITAL";
  if (c.includes("POSTING") || c.includes("JOURNAL") || c.includes("LEDGER")) return "ACCOUNTING";
  if (c.includes("CLOSE")) return "CLOSE";
  if (c.includes("REPORT")) return "REPORTING";
  return "PLATFORM";
}

/**
 * Classifies a capability by what its operation verb implies.
 *
 * Conservative by construction: anything not recognisably read-only is treated as EXECUTION.
 * Mis-classifying an execution capability as analytical would understate the risk of activating it.
 *
 * EXPORTED FOR DIRECT TESTING. Fault injection (7J FI-19) showed the execution-verb branch could
 * be deleted without any test failing: the conservative default caught the same cases, so the
 * branch was load-bearing only for codes carrying BOTH an execution and an analytical verb.
 * Defence in depth is not coverage — the precedence rule needs its own test.
 */
export function classOf(code: string, requiredDecisions: string[]): CapabilityClass {
  const c = code.toUpperCase();
  const analytical = ["ASSESS", "PROJECT", "SCENARIO", "SENSITIVITY", "STRESS", "COMPARE",
    "REPORT", "ANALYZE", "ANALYSE", "REVIEW", "DETECT", "EVALUATE", "SUMMAR", "TRACE", "READ", "VIEW"];
  const execution = ["EXECUTE", "POST", "ALLOCATE", "COMMIT", "DISBURSE", "TRANSFER",
    "SETTLE", "PAY", "CLOSE", "CONSOLIDATE", "APPROVE", "RATIFY", "ACTIVATE"];
  const admin = ["REGISTER", "CONFIGURE", "SEED", "ADMIN"];

  if (execution.some((v) => c.includes(v))) return "EXECUTION";
  if (admin.some((v) => c.includes(v))) return "ADMINISTRATIVE";
  if (analytical.some((v) => c.includes(v))) {
    // An "analytical" capability that requires governance decisions is really governed output.
    return requiredDecisions.length > 0 ? "GOVERNED" : "ANALYTICAL";
  }
  return "EXECUTION";
}

/** The canonical Finance OS capability inventory, read from the live registry. */
export async function financeCapabilityMatrix(): Promise<FinanceCapability[]> {
  const rows = await db.select().from(governanceCapabilityRegistry);

  return rows
    .map((r) => {
      const requiredDecisions = Array.isArray(r.requiredDecisions)
        ? (r.requiredDecisions as string[])
        : [];
      const capabilityClass = classOf(r.capabilityCode, requiredDecisions);
      return {
        capabilityId: r.capabilityCode,
        domain: domainOf(r.capabilityCode),
        operation: r.name,
        permission: r.executionPermission,
        requiredDecisions,
        capabilityClass,
        tenantScope: "TENANT_SCOPED" as const,
        entityScope: "ALL_ENTITIES" as const,
        activationStatus: r.activationStatus,
        // READ operations are deliberately unaudited (7B); everything else emits audit + event.
        auditRequired: capabilityClass !== "ANALYTICAL",
        executionStatus: executionStatusOf(r.activationStatus, requiredDecisions),
      };
    })
    .sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
}

/** Counts by domain and class. Never inflates: derived purely from the registry. */
export async function capabilitySummary(): Promise<{
  total: number;
  byClass: Record<CapabilityClass, number>;
  byDomain: Record<string, number>;
  locked: number;
  executionCapabilities: number;
}> {
  const matrix = await financeCapabilityMatrix();
  const byClass = { ANALYTICAL: 0, GOVERNED: 0, EXECUTION: 0, ADMINISTRATIVE: 0 } as Record<CapabilityClass, number>;
  const byDomain: Record<string, number> = {};
  for (const c of matrix) {
    byClass[c.capabilityClass] += 1;
    byDomain[c.domain] = (byDomain[c.domain] ?? 0) + 1;
  }
  return {
    total: matrix.length,
    byClass,
    byDomain,
    locked: matrix.filter((c) => c.executionStatus === "LOCKED").length,
    executionCapabilities: byClass.EXECUTION,
  };
}

/**
 * The full Finance OS dependency chain for one capability:
 *
 *   BEYU OS → AUTHORITY → POLICY → DECISION → CAPABILITY → PERMISSION → FINANCE SERVICE
 *   → DOMAIN → CANONICAL TRUTH → EXECUTION → AUDIT → EVENT → TRACE
 *
 * Any missing link yields AUTHORITY_CHAIN_INCOMPLETE. Reuses the 7I chain builder rather than
 * implementing a second graph walker.
 */
export async function financeDependencyChain(capabilityCode: string): Promise<AuthorityChain> {
  const [cap] = await db
    .select()
    .from(governanceCapabilityRegistry)
    .where(inArray(governanceCapabilityRegistry.capabilityCode, [capabilityCode]))
    .limit(1);

  const links: ChainLink[] = [];

  links.push({
    layer: "CAPABILITY",
    id: capabilityCode,
    present: Boolean(cap),
    status: cap?.activationStatus ?? null,
    detail: cap ? `Registered, activation ${cap.activationStatus}.` : "Not registered.",
  });

  if (!cap) {
    return buildChain({ direction: "FORWARD", origin: `finance:${capabilityCode}`, links });
  }

  const required = Array.isArray(cap.requiredDecisions) ? (cap.requiredDecisions as string[]) : [];
  const decisions = required.length
    ? await db
        .select()
        .from(governanceDecisionRegistry)
        .where(inArray(governanceDecisionRegistry.decisionId, required))
    : [];

  if (required.length === 0) {
    links.push({
      layer: "DECISION",
      id: "(none declared)",
      present: false,
      status: null,
      detail: "Capability declares no governing decisions; its authority cannot be traced.",
    });
  }

  for (const decisionId of required) {
    const row = decisions.find((d) => d.decisionId === decisionId);
    links.push({
      layer: "DECISION",
      id: decisionId,
      present: Boolean(row),
      status: row?.status ?? null,
      detail: row ? `Status ${row.status}.` : "Decision not registered.",
    });
    links.push({
      layer: "AUTHORITY",
      id: row?.resolutionId ?? `(no resolution for ${decisionId})`,
      present: Boolean(row?.resolutionId) && row?.provenance === "GOVERNED",
      status: row?.provenance ?? null,
      detail: row?.resolutionId
        ? `Resolution ${row.resolutionId}, provenance ${row.provenance ?? "null"}.`
        : "No approving resolution.",
    });
  }

  links.push({
    layer: "PERMISSION",
    id: cap.executionPermission ?? "(none declared)",
    present: Boolean(cap.executionPermission),
    status: null,
    detail: cap.executionPermission ?? "No execution permission declared.",
  });

  const domain = domainOf(capabilityCode);
  links.push({
    layer: "SERVICE",
    id: `finance:${domain}`,
    present: domain !== "PLATFORM",
    status: null,
    detail: `Finance OS domain ${domain}.`,
  });

  links.push({
    layer: "EXECUTION",
    id: cap.activationStatus === "ACTIVATED" ? "permitted" : "locked",
    present: cap.activationStatus === "ACTIVATED",
    status: cap.activationStatus,
    detail:
      cap.activationStatus === "ACTIVATED"
        ? "Execution is permitted by the registry."
        : "Execution is locked; no financial operation can proceed.",
  });

  return buildChain({ direction: "FORWARD", origin: `finance:${capabilityCode}`, links });
}
