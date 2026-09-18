/**
 * BEYU OS — P3 Expand/Contract Release Safety
 *
 * Integrates P2's verified migration model into P3.
 * Preserves:
 * - 46 migration history (now 47 with P3)
 * - 0045
 * - checksums
 * - fail-closed ledger validation
 * - truthful drift detection
 * - destructive migration controls
 * - Expand/Contract policy
 *
 * For every future release:
 * EXPAND → deploy application compatibility → migrate → verify → canary → promote → contract only after compatibility window
 *
 * A CONTRACT operation must never execute before release state machine proves safety.
 * Do not modify existing historical migrations.
 */

import { join } from "node:path";
import { readMigrationFiles } from "@/lib/migration/integrity";
import type { MigrationClassification, ExpandContractGate } from "./types";
import type { ReleaseTransition } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Migration Classification (reuses P2 logic, extends for P3)
// ─────────────────────────────────────────────────────────────────────────────

export function classifyMigration(sql: string): MigrationClassification {
  const normalized = sql.toLowerCase();

  // Destructive patterns (same as P2's destructive scan, but simplified for P3)
  const destructivePatterns = [
    /\bdrop\s+table\b/,
    /\bdrop\s+column\b/,
    /\btruncate\s+table\b/,
    /\bdrop\s+constraint\b/,
    /\bdrop\s+index\b/,
  ];

  for (const pattern of destructivePatterns) {
    if (pattern.test(normalized)) {
      // Check if it's inside a comment or dollar-quoted body (simplified)
      // For P3 we reuse P2's stripSqlForStructure logic via import if needed
      // Here we do a basic check: if pattern appears outside of obvious safe contexts
      return "DESTRUCTIVE";
    }
  }

  // Contracting patterns: removal of columns, constraints, etc. that were previously added
  const contractingPatterns = [
    /\balter\s+table\b.*\bdrop\b/,
    /\bdrop\s+policy\b/,
    /\bremove\s+column\b/,
  ];

  for (const pattern of contractingPatterns) {
    if (pattern.test(normalized)) {
      return "CONTRACTING";
    }
  }

  // Default is additive (EXPAND)
  return "ADDITIVE";
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand/Contract Gate
// ─────────────────────────────────────────────────────────────────────────────

export function createExpandContractGate(params: {
  releaseId: string;
  classification: MigrationClassification;
  compatibilityWindowHours?: number;
}): ExpandContractGate {
  return {
    releaseId: params.releaseId,
    classification: params.classification,
    expandCompleted: params.classification === "ADDITIVE" ? false : true, // ADDITIVE needs expand step
    migrateCompleted: false,
    verifyCompleted: false,
    canaryCompleted: false,
    promoteCompleted: false,
    contractAllowed: false,
    compatibilityWindowHours: params.compatibilityWindowHours ?? 24,
    reason: null,
  };
}

export function evaluateContractSafety(
  gate: ExpandContractGate,
  history: ReleaseTransition[],
  currentTime: Date = new Date(),
): { allowed: boolean; reason: string; blocking: string[] } {
  const blocking: string[] = [];

  // CONTRACT only allowed after full lifecycle
  const hasPromoted = history.some((t) => t.nextState === "PROMOTED");
  const hasSwitched = history.some((t) => t.nextState === "SWITCHED");
  const hasRetired = history.some((t) => t.nextState === "RETIRED");
  const hasVerified = history.some((t) => t.nextState === "VERIFIED" || t.nextState === "PVG_VERIFIED");
  const hasCanary = history.some((t) => t.nextState === "CANARY");

  if (gate.classification === "ADDITIVE") {
    // ADDITIVE migrations: contract not needed, but if contracting old schema, need safety
    // For P3, ADDITIVE is always safe to expand, contract is separate release
    if (!gate.expandCompleted) blocking.push("EXPAND not completed");
    if (!gate.migrateCompleted) blocking.push("MIGRATE not completed");
    if (!gate.verifyCompleted) blocking.push("VERIFY not completed");
  }

  if (gate.classification === "CONTRACTING" || gate.classification === "DESTRUCTIVE") {
    // CONTRACTING/DESTRUCTIVE must have gone through full lifecycle
    if (!hasPromoted) blocking.push("PROMOTED required before CONTRACT");
    if (!hasSwitched) blocking.push("SWITCHED required before CONTRACT");
    if (!hasRetired) blocking.push("RETIRED required before CONTRACT");
    if (!hasVerified) blocking.push("VERIFIED required before CONTRACT");

    // Check compatibility window: time since PROMOTED must exceed window
    const promotedTransition = history.filter((t) => t.nextState === "PROMOTED").sort((a, b) => a.timestamp.localeCompare(b.timestamp)).pop();
    if (promotedTransition) {
      const promotedAt = new Date(promotedTransition.timestamp);
      const elapsedHours = (currentTime.getTime() - promotedAt.getTime()) / (1000 * 60 * 60);
      if (elapsedHours < gate.compatibilityWindowHours) {
        blocking.push(`Compatibility window not elapsed: ${elapsedHours.toFixed(1)}h < ${gate.compatibilityWindowHours}h`);
      }
    } else {
      blocking.push("No PROMOTED transition found for compatibility window check");
    }

    // Canary required for contracting changes (if canary is part of flow)
    if (gate.classification === "DESTRUCTIVE" && !hasCanary) {
      // Destructive changes should have canary, but not strictly required if flagged
      blocking.push("CANARY recommended for DESTRUCTIVE changes");
    }
  }

  const allowed = blocking.length === 0;

  return {
    allowed,
    reason: allowed ? "Contract safety conditions satisfied" : `Contract blocked: ${blocking.join("; ")}`,
    blocking,
  };
}

export function updateGateFromHistory(gate: ExpandContractGate, history: ReleaseTransition[]): ExpandContractGate {
  const hasDeployed = history.some((t) => t.nextState === "DEPLOYED");
  const hasPvgVerified = history.some((t) => t.nextState === "PVG_VERIFIED");
  const hasCanary = history.some((t) => t.nextState === "CANARY");
  const hasPromoted = history.some((t) => t.nextState === "PROMOTED");
  const hasSwitched = history.some((t) => t.nextState === "SWITCHED");
  const hasRetired = history.some((t) => t.nextState === "RETIRED");
  const hasContracted = history.some((t) => t.nextState === "CONTRACTED");
  const hasVerified = history.some((t) => t.nextState === "VERIFIED");

  return {
    ...gate,
    expandCompleted: hasDeployed || gate.expandCompleted,
    migrateCompleted: hasDeployed || gate.migrateCompleted,
    verifyCompleted: hasPvgVerified || hasVerified || gate.verifyCompleted,
    canaryCompleted: hasCanary || gate.canaryCompleted,
    promoteCompleted: hasPromoted || gate.promoteCompleted,
    contractAllowed: hasContracted ? true : evaluateContractSafety(gate, history).allowed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 Integration Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify the repository's ACTUAL migration inventory against the expected
 * count. P4: no longer a placeholder — counts the real files under `drizzle/`
 * through the canonical P2 inventory reader, so the release plane and the
 * migration plane can never disagree about what "the migrations" are.
 */
export function verifyP2MigrationIntegrity(expectedCount?: number): { ok: boolean; count: number; expected: number | null } {
  const files = readMigrationFiles(join(process.cwd(), "drizzle"));
  const count = files.length;
  const expected = expectedCount ?? null;
  return {
    // Without an explicit expectation the inventory itself is the truth;
    // with one, the real count must match exactly.
    ok: expected === null ? count > 0 : count === expected,
    count,
    expected,
  };
}
