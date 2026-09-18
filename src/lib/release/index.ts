/**
 * BEYU OS — P3 Release Governance (canonical barrel)
 *
 * Single canonical location for all P3 capabilities.
 * No duplicate release/state/PVG implementations elsewhere.
 */

export * from "./types";
export * from "./state-machine";
export * from "./identity";
export * from "./pvg";
export * from "./canary";
export * from "./blue-green";
export * from "./expand-contract";
export * from "./evidence";
export * from "./rollback";
export * from "./observability";

// Re-export key invariants for architecture tests
export const P3_INVARIANTS = {
  DEPLOYED_NOT_VERIFIED: "DEPLOYED != VERIFIED",
  VERIFIED_NOT_PROMOTED: "VERIFIED != PROMOTED",
  DEPLOYED_NOT_PROMOTED: "DEPLOYED != PROMOTED",
  EXPAND_MIGRATE_VERIFY_CANARY_PROMOTE_CONTRACT: "EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT",
  CANARY_PERCENTAGE_NOT_AUTHORIZATION: "Canary percentage controls traffic only, never authorization",
  PVG_FAIL_CLOSED: "PVG must fail closed",
  RELEASE_IDENTITY_SERVER_DERIVED: "Release identity must be server-derived, not user-provided",
} as const;
