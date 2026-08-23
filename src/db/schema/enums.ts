/**
 * BEYU OS — Canonical enumerations.
 * Constitutional rule: one vocabulary across the whole control plane.
 * Every enum defined here is authoritative for the entire ecosystem and MUST
 * NOT be redefined by a Sector OS.
 */
import { pgEnum } from "drizzle-orm/pg-core";

export const classificationEnum = pgEnum("beyu_classification", [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
]);

export const lifecycleStatusEnum = pgEnum("beyu_lifecycle_status", [
  "CREATED",
  "VERIFIED",
  "ACTIVE",
  "MODIFIED",
  "SUSPENDED",
  "REVOKED",
  "DEACTIVATED",
  "ARCHIVED",
]);

export const tenantTypeEnum = pgEnum("beyu_tenant_type", [
  "ENTERPRISE",
  "COUNTRY",
  "SECTOR",
  "LEGAL_ENTITY",
  "BRANCH",
  "DEPARTMENT",
]);

export const entityTypeEnum = pgEnum("beyu_entity_type", [
  "TRUST",
  "FOUNDATION",
  "HOLDING",
  "COUNTRY_HOLDING",
  "OPERATING_COMPANY",
  "SUBSIDIARY",
  "ASSOCIATE",
  "JOINT_VENTURE",
  "PARTNERSHIP",
  "BRANCH",
  "NON_PROFIT",
]);

export const partyTypeEnum = pgEnum("beyu_party_type", [
  "PERSON",
  "ORGANIZATION",
  "SERVICE_ACCOUNT",
  "AI_AGENT",
  "DEVICE",
]);

export const ownershipTypeEnum = pgEnum("beyu_ownership_type", [
  "DIRECT",
  "INDIRECT",
  "BENEFICIAL",
  "CONTROL_ONLY",
]);

export const policyLevelEnum = pgEnum("beyu_policy_level", [
  "CONSTITUTION",
  "ENTERPRISE",
  "DOMAIN",
  "SECTOR",
  "ENTITY",
  "TENANT",
  "WORKFLOW_RULE",
  "TRANSACTION_CONTROL",
]);

export const versionStatusEnum = pgEnum("beyu_version_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "ACTIVE",
  "SUSPENDED",
  "SUPERSEDED",
  "RETIRED",
]);

/**
 * Canonical decision lifecycle.
 *
 * DRAFT      — proposed; not yet before the body. No votes may be cast.
 * TABLED     — placed before the body by a presiding officer; voting is OPEN.
 * VOTED      — voting concluded (the window closed, or every eligible member
 *              voted). The ballots are final but NO decision has been taken.
 *              Produced by the vote endpoint as its terminal state; only the
 *              decision authority (`governance:resolution.approve`) may move a
 *              resolution out of VOTED.
 * APPROVED   — carried under the body's majority rule.
 * REJECTED   — failed the body's majority rule.
 * DEADLOCKED — FOR and AGAINST are tied. There is NO automatic tie-break and no
 *              chair casting vote; escalation is a separate governed action.
 * WITHDRAWN  — withdrawn before decision.
 * DEFERRED   — voting closed without quorum; no decision was reachable.
 *
 * APPROVED, REJECTED, DEADLOCKED, DEFERRED and WITHDRAWN are TERMINAL: no vote,
 * tabling or decision may alter a resolution that has reached one. Reversal, if
 * it is ever permitted, must be its own governed amendment transaction.
 *
 * Only DRAFT → TABLED → VOTED → (terminal) is reachable, and each arrow is a
 * distinct governed mutation with its own authority:
 *   DRAFT  → TABLED   `tableResolution`         presiding seat + .approve
 *   TABLED → VOTED    `castVote`                eligible seat  + .vote
 *   TABLED |
 *   VOTED  → terminal `decideResolutionClosure` presiding seat + .approve
 */
export const decisionStatusEnum = pgEnum("beyu_decision_status", [
  "DRAFT",
  "TABLED",
  "VOTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DEFERRED",
  "DEADLOCKED",
]);

export const approvalDecisionEnum = pgEnum("beyu_approval_decision", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DELEGATED",
  "ESCALATED",
]);

export const complianceStateEnum = pgEnum("beyu_compliance_state", [
  "COMPLIANT",
  "NON_COMPLIANT",
  "PARTIALLY_COMPLIANT",
  "NOT_ASSESSED",
  "NOT_APPLICABLE",
  "REQUIRES_HUMAN_REVIEW",
]);

export const riskCategoryEnum = pgEnum("beyu_risk_category", [
  "STRATEGIC",
  "OPERATIONAL",
  "FINANCIAL",
  "LEGAL",
  "REGULATORY",
  "CYBERSECURITY",
  "PRIVACY",
  "INVESTMENT",
  "LIQUIDITY",
  "REPUTATIONAL",
  "THIRD_PARTY",
  "AI",
  "CLINICAL",
  "COUNTRY",
  "GEOPOLITICAL",
  "CONCENTRATION",
]);

export const authorityStatusEnum = pgEnum("beyu_authority_status", [
  "AUTHORITATIVE",
  "UNDER_REVIEW",
  "SUPERSEDED",
  "EXPIRED",
  "REJECTED",
]);

/**
 * Activation lifecycle of a governance decision in the pre-ratification registry.
 *
 * Phase 6C. A new enum was required rather than reusing an existing one, and the analysis is
 * recorded here because adding a status is otherwise prohibited:
 *
 *   - `beyu_version_status` (DRAFT|IN_REVIEW|APPROVED|ACTIVE|SUSPENDED|SUPERSEDED|RETIRED)
 *     describes a *document version*. It cannot distinguish EFFECTIVE from RATIFIED, and has no
 *     concept of activation readiness.
 *   - `beyu_decision_status` (DRAFT|TABLED|VOTED|APPROVED|...) is the *resolution voting*
 *     lifecycle. It ends at the vote and never reaches execution.
 *   - `beyu_authority_status` (AUTHORITATIVE|UNDER_REVIEW|SUPERSEDED|EXPIRED|REJECTED) is the
 *     closest fit but collapses RATIFIED and ACTIVATED into a single AUTHORITATIVE value, and is
 *     already in use on four unrelated tables — widening it would silently change their meaning.
 *
 * The distinctions this enum must preserve, and which no existing enum expresses:
 *   PENDING != RATIFIED · RATIFIED != ACTIVATED · APPROVED != EXECUTION AUTHORITY
 *
 * This enum describes only the *authority state* of a decision. It never encodes accounting
 * content.
 */
export const decisionActivationStateEnum = pgEnum("beyu_decision_activation_state", [
  "PENDING",
  "APPROVED",
  "EFFECTIVE",
  "RATIFIED",
  "ACTIVATION_READY",
  "ACTIVATED",
  "SUSPENDED",
  "SUPERSEDED",
  "RETIRED",
]);

export const taxPositionEnum = pgEnum("beyu_tax_position", [
  "LEGAL_TAX_PLANNING",
  "LAWFUL_AVOIDANCE",
  "AGGRESSIVE_UNCERTAIN",
  "PROHIBITED_EVASION",
]);

export const aiOutputClassEnum = pgEnum("beyu_ai_output_class", [
  "FACT",
  "INFERENCE",
  "RECOMMENDATION",
  "PREDICTION",
  "UNCERTAINTY",
  "REQUIRES_HUMAN_REVIEW",
]);

export const verificationStatusEnum = pgEnum("beyu_verification_status", [
  "UNVERIFIED",
  "DOCUMENTED",
  "VERIFIED",
  "DISPUTED",
]);

export const eligibilityEnum = pgEnum("beyu_eligibility", [
  "ELIGIBLE",
  "CONDITIONAL",
  "INELIGIBLE",
  "UNDER_REVIEW",
]);
