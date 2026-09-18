/**
 * BEYU OS — P3 Release Governance Types (canonical)
 *
 * One canonical type definition for the entire P3 lifecycle.
 * No duplicate release/state/PVG implementations elsewhere.
 *
 * Invariants:
 * - DEPLOYED != VERIFIED != PROMOTED
 * - EXPAND → MIGRATE → VERIFY → CANARY → PROMOTE → CONTRACT
 * - PVG must independently establish release is running, healthy, compatible, authorized
 * - Canary % controls traffic only, never authorization
 * - Authorization: GlobalUserID → RBAC+ABAC → OS → tenant → entity → country → policy → app → RLS
 * - Events do not grant authorization
 * - Noelia/HIVE must not self-authorize or bypass RBAC, ABAC, policy, approvals, audit, RLS
 * - CAP_POSTING remains LOCKED
 */

// ─────────────────────────────────────────────────────────────────────────────
// Release Identity
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseIdentity {
  /** Immutable release identifier (e.g., REL_ + short SHA + timestamp) */
  releaseId: string;
  /** Git commit SHA (full 40-char or short) */
  gitSha: string;
  /** Repository (e.g., yumvalila-bot/BEYU-OS-1.0) */
  repository: string;
  /** Build/artifact identifier (e.g., .next/BUILD_ID, Vercel build ID) */
  buildId: string;
  /** Platform deployment identifier (e.g., Vercel deployment ID) */
  deploymentId: string;
  /** Environment: production | staging | preview | local | test */
  environment: string;
  /** Application version (e.g., BEYU-OS/1.0.0) */
  applicationVersion: string;
  /** Database migration state fingerprint (sha256 of ordered migration checksums) */
  migrationFingerprint: string | null;
  /** Latest applied migration version (e.g., 0046_release_governance) */
  latestMigration: string | null;
  /** Migration count (e.g., 46) */
  migrationCount: number | null;
  /** Schema fingerprint (optional, where applicable) */
  schemaFingerprint: string | null;
  /** Release timestamp (ISO) */
  releaseTimestamp: string;
  /** Runtime version (same as applicationVersion or more specific) */
  runtimeVersion: string;
}

export interface RuntimeIdentityResponse {
  releaseId: string;
  gitSha: string;
  repository: string;
  buildId: string;
  deploymentId: string;
  environment: string;
  applicationVersion: string;
  runtimeVersion: string;
  schemaVersion: string | null;
  migrationFingerprint: string | null;
  latestMigration: string | null;
  releaseTimestamp: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Release State Machine
// ─────────────────────────────────────────────────────────────────────────────

export const RELEASE_STATES = [
  "DESIGNED",
  "BUILT",
  "DEPLOYED",
  "PVG_VERIFIED",
  "CANARY",
  "PROMOTED",
  "SWITCHED",
  "RETIRED",
  "CONTRACTED",
  "VERIFIED",
  "FAILED",
  "ROLLED_BACK",
] as const;

export type ReleaseState = (typeof RELEASE_STATES)[number];

export const CANARY_STATES = [
  "CANARY_CONFIGURED",
  "CANARY_DEPLOYED",
  "CANARY_PVG_VERIFIED",
  "CANARY_TRAFFIC_ACTIVE",
  "CANARY_OBSERVATION",
  "CANARY_PROMOTION_ELIGIBLE",
  "CANARY_FAILED",
  "CANARY_ROLLED_BACK",
] as const;

export type CanaryState = (typeof CANARY_STATES)[number];

export const BLUE_GREEN_STATES = [
  "BLUE_ACTIVE",
  "GREEN_DEPLOYED",
  "GREEN_PVG_VERIFIED",
  "GREEN_CANARY",
  "GREEN_PROMOTION_READY",
  "GREEN_ACTIVE",
  "BLUE_RETIRED",
  "BG_FAILED",
  "BG_ROLLED_BACK",
] as const;

export type BlueGreenState = (typeof BLUE_GREEN_STATES)[number];

export interface ReleaseTransition {
  /** Unique transition ID */
  id: string;
  /** Release identity */
  releaseId: string;
  /** Source commit SHA */
  sourceCommit: string;
  /** Artifact/build identity */
  artifactBuildId: string;
  /** Environment */
  environment: string;
  /** Timestamp ISO */
  timestamp: string;
  /** Actor/service identity (user ID or service principal) */
  actorId: string;
  /** Actor type */
  actorType: "HUMAN" | "SERVICE" | "AI" | "SYSTEM";
  /** Previous state */
  previousState: ReleaseState | null;
  /** Next state */
  nextState: ReleaseState;
  /** Reason for transition */
  reason: string;
  /** Verification evidence (PVG, canary, etc.) */
  verificationEvidence: Record<string, unknown> | null;
  /** Correlation/request ID */
  correlationId: string | null;
  /** Trace ID */
  traceId: string | null;
}

export interface TransitionValidationContext {
  /** Full history of transitions for this release (ordered) */
  history: ReleaseTransition[];
  /** PVG evidence if present */
  pvgEvidence?: PvgResult | null;
  /** Canary evidence if present */
  canaryEvidence?: CanaryEvidence | null;
  /** Blue-green evidence if present */
  blueGreenEvidence?: BlueGreenEvidence | null;
  /** Current migration fingerprint */
  migrationFingerprint?: string | null;
  /** Expected migration fingerprint */
  expectedMigrationFingerprint?: string | null;
  /** Release identity mismatch flag */
  releaseIdentityMatches?: boolean;
  /** Actor authorization */
  actorAuthorized?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PVG
// ─────────────────────────────────────────────────────────────────────────────

export const PVG_CHECKS = [
  "runtime_health",
  "release_identity",
  "database_connectivity",
  "database_migration_state",
  "schema_fingerprint",
  "authorization_security",
  "critical_application_readiness",
  "event_outbox_health",
  "environment_identity",
  "deployment_identity",
] as const;

export type PvgCheckId = (typeof PVG_CHECKS)[number];

export interface PvgCheckResult {
  check: PvgCheckId;
  passed: boolean;
  /** Blocking = must pass for promotion */
  blocking: boolean;
  /** Evidence for this check */
  evidence: Record<string, unknown>;
  /** Failure reason if failed */
  failureReason: string | null;
  /** Duration ms */
  durationMs: number;
}

export interface PvgResult {
  /** Overall PASS/FAIL */
  status: "PASS" | "FAIL";
  /** Release being verified */
  releaseId: string;
  /** Commit SHA verified */
  commitSha: string;
  /** Environment */
  environment: string;
  /** Deployment ID */
  deploymentId: string | null;
  /** Build ID */
  buildId: string | null;
  /** Database info */
  database: {
    connected: boolean;
    migrationCount: number | null;
    latestMigration: string | null;
    fingerprint: string | null;
    fingerprintMatches: boolean | null;
  };
  /** Schema */
  schema: {
    fingerprint: string | null;
    matches: boolean | null;
  };
  /** Security */
  security: {
    rbac: boolean;
    abac: boolean;
    rls: boolean;
    capPostingLocked: boolean;
    noeliaBoundary: boolean;
  };
  /** Events */
  events: {
    outboxHealthy: boolean | null;
    chainIntact: boolean | null;
  };
  /** Runtime */
  runtime: {
    health: boolean;
    version: string;
    identityMatches: boolean;
  };
  /** All checks */
  checks: PvgCheckResult[];
  /** Blocking failures */
  blockingFailures: string[];
  /** Verified at */
  verifiedAt: string;
  /** Correlation ID */
  correlationId: string | null;
  /** Trace ID */
  traceId: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canary
// ─────────────────────────────────────────────────────────────────────────────

export interface CanaryConfig {
  releaseId: string;
  environment: string;
  /** Traffic percentages allowed: 0,1,5,25,50,100 */
  allowedPercentages: number[];
  /** Current configured percentage */
  configuredPercentage: number;
  /** Is canary enabled */
  enabled: boolean;
  /** Observation window in minutes */
  observationWindowMinutes: number;
  /** Required PVG checks for canary promotion */
  requiredPvgChecks: PvgCheckId[];
}

export interface CanaryDeployment {
  id: string;
  releaseId: string;
  environment: string;
  state: CanaryState;
  trafficPercentage: number;
  previousPercentage: number | null;
  verificationEvidence: Record<string, unknown> | null;
  pvgResult: PvgResult | null;
  createdAt: string;
  updatedAt: string;
  actorId: string;
  correlationId: string | null;
}

export interface CanaryEvidence {
  releaseId: string;
  state: CanaryState;
  trafficPercentage: number;
  pvgVerified: boolean;
  observationPassed: boolean;
  promotionEligible: boolean;
  evidence: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Blue/Green
// ─────────────────────────────────────────────────────────────────────────────

export interface BlueGreenDeployment {
  id: string;
  environment: string;
  blueReleaseId: string;
  greenReleaseId: string;
  state: BlueGreenState;
  trafficState: {
    bluePercentage: number;
    greenPercentage: number;
  };
  verificationEvidence: Record<string, unknown> | null;
  pvgEvidence: PvgResult | null;
  createdAt: string;
  updatedAt: string;
  actorId: string;
  correlationId: string | null;
}

export interface BlueGreenEvidence {
  environment: string;
  blueReleaseId: string;
  greenReleaseId: string;
  state: BlueGreenState;
  pvgVerified: boolean;
  identityMatches: boolean;
  dbCompatible: boolean;
  promotionReady: boolean;
  evidence: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Expand/Contract
// ─────────────────────────────────────────────────────────────────────────────

export type MigrationClassification = "ADDITIVE" | "CONTRACTING" | "DESTRUCTIVE";

export interface ExpandContractGate {
  releaseId: string;
  classification: MigrationClassification;
  expandCompleted: boolean;
  migrateCompleted: boolean;
  verifyCompleted: boolean;
  canaryCompleted: boolean;
  promoteCompleted: boolean;
  contractAllowed: boolean;
  compatibilityWindowHours: number;
  reason: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rollback
// ─────────────────────────────────────────────────────────────────────────────

export type RollbackType = "APPLICATION" | "DATABASE" | "TRAFFIC";

export interface RollbackRequest {
  id: string;
  releaseId: string;
  targetReleaseId: string;
  type: RollbackType;
  reason: string;
  actorId: string;
  actorType: "HUMAN" | "SERVICE";
  compatibilityChecked: boolean;
  authorized: boolean;
  evidence: Record<string, unknown> | null;
  correlationId: string | null;
  createdAt: string;
}

export interface RollbackResult {
  requestId: string;
  success: boolean;
  type: RollbackType;
  fromReleaseId: string;
  toReleaseId: string;
  reason: string;
  auditEventId: string | null;
  evidence: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Observability
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseObservability {
  releaseId: string;
  deploymentId: string | null;
  pvgStatus: "PASS" | "FAIL" | "NOT_RUN" | "IN_PROGRESS";
  pvgFailureReason: string | null;
  canaryState: CanaryState | null;
  trafficState: { blue: number; green: number } | null;
  promotionState: ReleaseState;
  rollbackState: "NONE" | "IN_PROGRESS" | "COMPLETED" | "FAILED";
  migrationFingerprint: string | null;
  schemaFingerprint: string | null;
  runtimeVersion: string;
  environment: string;
  lastTransitionAt: string | null;
  verifiedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adapter Boundaries (provider-neutral)
// ─────────────────────────────────────────────────────────────────────────────

export interface TrafficAdapter {
  /** Get current traffic split (provider-specific) */
  getTrafficSplit(environment: string): Promise<{ blue: number; green: number }>;
  /** Set traffic split — must be human-governed, audited, fail-closed */
  setTrafficSplit(
    environment: string,
    split: { blue: number; green: number },
    evidence: { actorId: string; reason: string; correlationId: string | null },
  ): Promise<{ success: boolean; evidence: Record<string, unknown> }>;
  /** Provider name */
  provider: string;
  /** Whether real infrastructure is available */
  isRealInfrastructure: boolean;
}

export interface DeploymentAdapter {
  /** Deploy green */
  deployGreen(releaseId: string, environment: string): Promise<{ deploymentId: string; evidence: Record<string, unknown> }>;
  /** Get deployment status */
  getDeploymentStatus(deploymentId: string): Promise<{ status: string; evidence: Record<string, unknown> }>;
  /** Retire blue */
  retireBlue(releaseId: string, environment: string): Promise<{ success: boolean; evidence: Record<string, unknown> }>;
  provider: string;
  isRealInfrastructure: boolean;
}
