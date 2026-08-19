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

export const decisionStatusEnum = pgEnum("beyu_decision_status", [
  "DRAFT",
  "TABLED",
  "VOTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "DEFERRED",
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
