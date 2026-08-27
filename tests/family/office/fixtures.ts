/**
 * Shared fixtures for the Family Office engineering test suite.
 *
 * All values here are STRUCTURAL TEST FIXTURES (references, dates, IDs).
 * The only policy VALUES in the suite are the synthetic TEST-ONLY values
 * in simulated-ratification.test.ts (clearly marked). Everything else
 * tests that the engine refuses to act where no ratified value exists.
 */

import type { FamilyPolicyDefinition, FamilyPolicyVersion } from "../../../src/lib/family/office/policy";
import type { FamilyRatificationRecord } from "../../../src/lib/family/office/ratification";
import type { FamilyDelegationRecord } from "../../../src/lib/family/office/delegation";
import type { AuthorityContext } from "../../../src/lib/family/office/authority";
import type { OfficeScope } from "../../../src/lib/family/office/types";

export const TENANT = "T-1";

/** Canonical test dates (deterministic). */
export const D = {
  ratification: "2026-01-15",
  effectiveFrom: "2026-02-01",
  asOf: "2026-03-01",
  beforeEffective: "2026-01-20",
  expired: "2025-12-31",
} as const;

export const TENANT_SCOPE: OfficeScope = { tenantId: TENANT, legalEntityId: null, jurisdictionRef: null };

export function policyDef(
  policyKey: string,
  domain: FamilyPolicyDefinition["domain"],
  parameterKinds: FamilyPolicyDefinition["parameterKinds"],
): FamilyPolicyDefinition {
  return {
    policyKey,
    domain,
    name: policyKey,
    description: `Test fixture definition for ${policyKey} (structure only — no values).`,
    scope: TENANT_SCOPE,
    parameterKinds,
  };
}

export function policyVersion(
  policyKey: string,
  version: number,
  status: FamilyPolicyVersion["status"],
  opts: {
    parameters?: FamilyPolicyVersion["parameters"];
    effectiveFrom?: string;
    effectiveTo?: string | null;
    supersedesVersion?: number | null;
    ratificationDecisionId?: string | null;
  } = {},
): FamilyPolicyVersion {
  return {
    policyKey,
    version,
    status,
    period: { effectiveFrom: opts.effectiveFrom ?? D.effectiveFrom, effectiveTo: opts.effectiveTo ?? null },
    parameters: opts.parameters ?? null,
    supersedesVersion: opts.supersedesVersion ?? null,
    ratificationDecisionId: opts.ratificationDecisionId ?? null,
    auditRef: `AUD-${policyKey}-v${version}`,
  };
}

export function ratificationRecord(
  decisionId: string,
  policyKey: string,
  policyVersion: number,
  parameters: FamilyRatificationRecord["parameters"],
  opts: {
    decisionMaker?: string;
    authorityKind?: "RESOLUTION" | "DELEGATION";
    authorityReferenceId?: string;
    supersedesDecisionId?: string | null;
    effectiveFrom?: string;
    version?: number;
  } = {},
): FamilyRatificationRecord {
  return {
    decisionId,
    policyKey,
    policyVersion,
    decisionMaker: opts.decisionMaker ?? "Human Chair (fixture)",
    authorityRef: { kind: opts.authorityKind ?? "RESOLUTION", referenceId: opts.authorityReferenceId ?? `RES-${decisionId}-AUTH` },
    instrumentRef: `INST-${policyKey}`,
    evidenceRef: { documentId: `DOC-${decisionId}`, documentChecksum: "sha256:fixture" },
    jurisdictionRef: null,
    period: { effectiveFrom: opts.effectiveFrom ?? D.effectiveFrom, effectiveTo: null },
    parameters,
    supersedesDecisionId: opts.supersedesDecisionId ?? null,
    status: "RATIFIED",
    version: opts.version ?? 1,
    auditRef: `AUD-${decisionId}`,
  };
}

export function delegationRecord(
  delegationId: string,
  opts: Partial<Pick<FamilyDelegationRecord, "delegateUserId" | "limitations" | "revokedAt" | "revokedBy" | "effectiveFrom" | "effectiveTo">> = {},
): FamilyDelegationRecord {
  return {
    delegationId,
    delegatorUserId: "user-chair",
    delegateUserId: opts.delegateUserId ?? "user-secretary",
    scope: { ...TENANT_SCOPE, actions: ["approve.capital.instruction"] },
    effectiveFrom: opts.effectiveFrom ?? "2026-01-01",
    effectiveTo: opts.effectiveTo ?? null,
    limitations: opts.limitations ?? null,
    revokedAt: opts.revokedAt ?? null,
    revokedBy: opts.revokedBy ?? null,
    parentDelegationId: null,
    auditRef: `AUD-${delegationId}`,
  };
}

export function humanAuthority(
  actorUserId: string,
  authorityReferenceId: string,
  opts: Partial<Pick<AuthorityContext, "delegationRef" | "authorityExpiry" | "legalEntityId" | "jurisdictionRef" | "actorType">> = {},
): AuthorityContext {
  return {
    actorType: opts.actorType ?? "HUMAN",
    actorUserId,
    tenantId: TENANT,
    legalEntityId: opts.legalEntityId ?? null,
    jurisdictionRef: opts.jurisdictionRef ?? null,
    authorityRef: { kind: "RESOLUTION", referenceId: authorityReferenceId },
    delegationRef: opts.delegationRef ?? null,
    authorityExpiry: opts.authorityExpiry ?? null,
    auditRef: null,
  };
}

export function aiAuthority(opts: Partial<Pick<AuthorityContext, "legalEntityId" | "jurisdictionRef">> = {}): AuthorityContext {
  return {
    actorType: "AI",
    actorUserId: "noelia",
    tenantId: TENANT,
    legalEntityId: opts.legalEntityId ?? null,
    jurisdictionRef: opts.jurisdictionRef ?? null,
    authorityRef: { kind: "RESOLUTION", referenceId: "RES-AI-CLAIM" },
    delegationRef: null,
    authorityExpiry: null,
    auditRef: null,
  };
}
