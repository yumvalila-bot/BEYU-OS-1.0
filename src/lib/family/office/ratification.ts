/**
 * BEYU OS — Family Office ratification registry.
 *
 * The canonical mechanism that allows a FUTURE authorized ratification to
 * activate policy. The registry is the mechanism; the ratifications stored
 * in it are authoritative acts supplied by the governance process.
 *
 * It answers, for every policy key:
 *   - what policy is active?
 *   - who ratified it?
 *   - under what authority?
 *   - which instrument supports it?
 *   - when did it become effective?
 *   - what policy did it supersede?
 *   - what remains unresolved?
 *
 * It does NOT fabricate answers: an absent ratification resolves to
 * POLICY_DECISION_REQUIRED. A ratification record must carry every
 * authoritative element (authority reference, instrument reference,
 * evidence reference, decision maker, effective period, audit reference,
 * and the ratified parameter values themselves); a record missing any
 * element is invalid and is refused — fail closed.
 *
 * Pure: `registerRatification` returns a NEW registry; it never mutates its
 * input. Ratification is configuration — the engine code is unchanged.
 */

import { familyError } from "../phase3/errors";
import type { FamilyPolicyDefinition, FamilyPolicyVersion, PolicyRegistry } from "./policy";
import { buildPolicyRegistry, supersedePolicyVersion } from "./policy";
import type { EffectivePeriod, OfficeScope } from "./types";
import type { PolicyParameter } from "./policy";

/** Authority kinds that can ratify a family policy: the §26.4 model. */
export const RATIFICATION_AUTHORITY_KINDS = ["RESOLUTION", "DELEGATION"] as const;
export type RatificationAuthorityKind = (typeof RATIFICATION_AUTHORITY_KINDS)[number];

export const RATIFICATION_STATUSES = ["PROPOSED", "RATIFIED", "SUPERSEDED", "REVOKED"] as const;
export type RatificationStatus = (typeof RATIFICATION_STATUSES)[number];

/** Evidence: a canonical document with its checksum (KDD-3 pattern). */
export interface RatificationEvidenceRef {
  documentId: string;
  documentChecksum: string;
}

export interface FamilyRatificationRecord {
  /** Stable decision ID of the authoritative act, e.g. "RES-2026-041". */
  decisionId: string;
  policyKey: string;
  /** The policy version this ratification activates. */
  policyVersion: number;
  /** The accountable human who ratified. Never an AI actor. */
  decisionMaker: string;
  /** Under what authority: a canonical resolution or delegation reference. */
  authorityRef: { kind: RatificationAuthorityKind; referenceId: string };
  /** The governing instrument supporting the ratification. */
  instrumentRef: string;
  /** The evidencing document (canonical documents, checksum-bound). */
  evidenceRef: RatificationEvidenceRef;
  /** Explicit jurisdiction scope. Null = tenant-wide (an explicit choice). */
  jurisdictionRef: string | null;
  period: EffectivePeriod;
  /**
   * The ratified parameter values themselves. This is how ratification
   * CONFIGURES the engine: values arrive with the authoritative act and
   * nowhere else.
   */
  parameters: readonly PolicyParameter[];
  /** The ratification this one supersedes (null for the first). */
  supersedesDecisionId: string | null;
  status: RatificationStatus;
  version: number;
  auditRef: string;
}

const isPresent = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const isIso = (v: unknown): boolean => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function validateRatificationRecord(r: FamilyRatificationRecord): string[] {
  const problems: string[] = [];
  if (!isPresent(r.decisionId)) problems.push("decisionId is required.");
  if (!isPresent(r.policyKey)) problems.push("policyKey is required.");
  if (!isPresent(r.decisionMaker)) problems.push("decisionMaker is required — a ratification names its accountable human.");
  else if (/^(AI|NOELIA|HIVE)$/i.test(r.decisionMaker)) {
    problems.push("A ratification cannot be made by an AI actor (FIR-017).");
  }
  if (!r.authorityRef || !(RATIFICATION_AUTHORITY_KINDS as readonly string[]).includes(r.authorityRef.kind)) {
    problems.push("authorityRef.kind must be RESOLUTION or DELEGATION (the §26.4 authority-proof model).");
  } else if (!isPresent(r.authorityRef.referenceId)) {
    problems.push("authorityRef.referenceId is required.");
  }
  if (!isPresent(r.instrumentRef)) problems.push("instrumentRef is required — a ratification is supported by a governing instrument.");
  if (!r.evidenceRef || !isPresent(r.evidenceRef.documentId) || !isPresent(r.evidenceRef.documentChecksum)) {
    problems.push("evidenceRef (documentId + documentChecksum) is required.");
  }
  if (!Number.isInteger(r.policyVersion) || r.policyVersion < 1) problems.push("policyVersion must be a positive integer.");
  if (!Number.isInteger(r.version) || r.version < 1) problems.push("version must be a positive integer.");
  if (!isPresent(r.auditRef)) problems.push("auditRef is required — a ratification is audited, never silent.");
  if (!(RATIFICATION_STATUSES as readonly string[]).includes(r.status)) {
    problems.push(`status must be one of ${RATIFICATION_STATUSES.join(", ")}.`);
  }
  if (!isIso(r.period.effectiveFrom) || (r.period.effectiveTo !== null && !isIso(r.period.effectiveTo))) {
    problems.push("period must be ISO dates (effectiveTo may be null).");
  } else if (r.period.effectiveTo !== null && r.period.effectiveTo < r.period.effectiveFrom) {
    problems.push("period.effectiveTo must not precede period.effectiveFrom.");
  }
  if (!Array.isArray(r.parameters)) problems.push("parameters must be an array (the ratified value set).");
  for (const p of r.parameters ?? []) {
    if (!isPresent(p.key)) problems.push("a parameter is missing its key.");
    if (p.value === undefined || p.value === null || p.value === "") {
      problems.push(`parameter "${p.key ?? "(unnamed)"}" is empty — an empty value is not a ratified value.`);
    }
  }
  return problems;
}

export function assertValidRatificationRecord(r: FamilyRatificationRecord): void {
  const problems = validateRatificationRecord(r);
  if (problems.length > 0) {
    throw familyError(
      "AUTHORITY_UNPROVEN",
      `Invalid ratification record ${r.decisionId ?? "(unidentified)"}: ${problems.join(" ")}`,
      [],
      { decisionId: r.decisionId },
    );
  }
}

/**
 * A ratification registry is the policy registry plus the authoritative
 * records that produced each version.
 */
export interface RatificationRegistry {
  policies: PolicyRegistry;
  /** decisionId → record. */
  records: ReadonlyMap<string, FamilyRatificationRecord>;
  /** policyKey → decisionIds in ratification order. */
  byPolicy: ReadonlyMap<string, readonly string[]>;
}

export function buildRatificationRegistry(
  definitions: readonly FamilyPolicyDefinition[],
  versions: readonly FamilyPolicyVersion[],
  records: readonly FamilyRatificationRecord[],
): RatificationRegistry {
  const policies = buildPolicyRegistry(definitions, versions);
  const byId = new Map<string, FamilyRatificationRecord>();
  const byPolicy = new Map<string, string[]>();
  for (const r of records) {
    assertValidRatificationRecord(r);
    if (!policies.definitions.has(r.policyKey)) {
      throw new Error(`ratification ${r.decisionId}: unknown policy key "${r.policyKey}".`);
    }
    const v = (policies.versions.get(r.policyKey) ?? []).find((x) => x.version === r.policyVersion);
    if (v === undefined) throw new Error(`ratification ${r.decisionId}: policy ${r.policyKey} has no version ${r.policyVersion}.`);
    if (v.ratificationDecisionId !== r.decisionId) {
      throw new Error(`ratification ${r.decisionId}: version ${r.policyVersion} references a different ratification (${v.ratificationDecisionId}).`);
    }
    if (byId.has(r.decisionId)) throw new Error(`ratification ${r.decisionId}: duplicate decision ID.`);
    if (r.supersedesDecisionId !== null && !byId.has(r.supersedesDecisionId)) {
      throw new Error(`ratification ${r.decisionId}: supersedes unknown decision ${r.supersedesDecisionId}.`);
    }
    byId.set(r.decisionId, r);
    const list = byPolicy.get(r.policyKey) ?? [];
    list.push(r.decisionId);
    byPolicy.set(r.policyKey, list);
  }
  return {
    policies,
    records: byId,
    byPolicy: new Map([...byPolicy].map(([k, l]) => [k, l as readonly string[]])),
  };
}

function resolveActiveVersion(policies: PolicyRegistry, policyKey: string, asOf: string): FamilyPolicyVersion | null {
  const list = policies.versions.get(policyKey) ?? [];
  const active = list.filter(
    (v) => v.status === "ACTIVE" && v.period.effectiveFrom <= asOf && (v.period.effectiveTo === null || asOf <= v.period.effectiveTo),
  );
  return active.length > 0 ? active[active.length - 1] : null;
}

/** The seven registry questions, answered only from authoritative data. */
export function activeRatification(registry: RatificationRegistry, policyKey: string, asOf: string): FamilyRatificationRecord | null {
  const resolved = resolveActiveVersion(registry.policies, policyKey, asOf);
  if (resolved === null) return null;
  return resolved.ratificationDecisionId === null ? null : registry.records.get(resolved.ratificationDecisionId) ?? null;
}

export function whoRatified(registry: RatificationRegistry, policyKey: string, asOf: string): string | null {
  return activeRatification(registry, policyKey, asOf)?.decisionMaker ?? null;
}

export function underWhatAuthority(
  registry: RatificationRegistry,
  policyKey: string,
  asOf: string,
): { kind: RatificationAuthorityKind; referenceId: string } | null {
  return activeRatification(registry, policyKey, asOf)?.authorityRef ?? null;
}

export function supportingInstrument(registry: RatificationRegistry, policyKey: string, asOf: string): string | null {
  return activeRatification(registry, policyKey, asOf)?.instrumentRef ?? null;
}

export function effectiveSince(registry: RatificationRegistry, policyKey: string, asOf: string): string | null {
  return activeRatification(registry, policyKey, asOf)?.period.effectiveFrom ?? null;
}

export function whatWasSuperseded(registry: RatificationRegistry, policyKey: string, asOf: string): string | null {
  return activeRatification(registry, policyKey, asOf)?.supersedesDecisionId ?? null;
}

/** Every policy key with no ACTIVE version at `asOf` — the honest gap list. */
export function whatRemainsUnresolved(registry: RatificationRegistry, asOf: string): string[] {
  return [...registry.policies.definitions.keys()]
    .filter((k) => activeRatification(registry, k, asOf) === null)
    .sort();
}

function allVersionsExcept(registry: PolicyRegistry, key: string): readonly FamilyPolicyVersion[] {
  return [...registry.versions.entries()].filter(([k]) => k !== key).flatMap(([, v]) => v);
}

export interface RegistrationOutcome {
  registry: RatificationRegistry;
  decisionId: string;
  activated: boolean;
}

/**
 * Register a ratification and (when its effective period has started)
 * activate its policy version — the universal activation path:
 *
 *   PolicyDefinition → PolicyProposal (PROPOSED record) → Ratification
 *   → AuthorityVerification → PolicyVersion → EffectivePeriod
 *   → Activation → Validation → Runtime Enforcement
 *
 * Every step is validated; ANY missing step fails closed (throws).
 * Pure: returns a NEW registry; the input is never mutated.
 */
export function registerRatification(
  registry: RatificationRegistry,
  record: FamilyRatificationRecord,
  scope: OfficeScope,
  asOf: string,
): RegistrationOutcome {
  assertValidRatificationRecord(record);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error("asOf must be an ISO date (determinism requires an explicit point in time).");
  const def = registry.policies.definitions.get(record.policyKey);
  if (def === undefined) throw new Error(`ratification ${record.decisionId}: unknown policy key "${record.policyKey}".`);
  const existing = (registry.policies.versions.get(record.policyKey) ?? []).find((v) => v.version === record.policyVersion);
  if (existing !== undefined) {
    throw new Error(`policy ${record.policyKey} v${record.policyVersion} already exists. A correction is a NEW version, never an edit.`);
  }
  // Authority verification: canonical resolution or delegation only.
  if (!record.authorityRef || !(RATIFICATION_AUTHORITY_KINDS as readonly string[]).includes(record.authorityRef.kind)) {
    throw familyError("AUTHORITY_UNPROVEN", `Ratification ${record.decisionId}: authority kind must be RESOLUTION or DELEGATION.`, [], {
      decisionId: record.decisionId,
    });
  }
  // Scope: the ratification's jurisdiction must be inside the policy scope.
  if (record.jurisdictionRef !== null && def.scope.jurisdictionRef !== null && record.jurisdictionRef !== def.scope.jurisdictionRef) {
    throw new Error(
      `ratification ${record.decisionId}: jurisdiction ${record.jurisdictionRef} escapes the policy scope ${def.scope.jurisdictionRef}.`,
    );
  }
  // Supersession: must supersede the LATEST ratification for the policy.
  const chain = registry.byPolicy.get(record.policyKey) ?? [];
  let superseded: FamilyRatificationRecord | null = null;
  if (record.supersedesDecisionId !== null) {
    const found = registry.records.get(record.supersedesDecisionId);
    if (found === undefined) throw new Error(`ratification ${record.decisionId}: supersedes unknown decision.`);
    superseded = found;
    const latest = chain[chain.length - 1];
    if (latest !== record.supersedesDecisionId) {
      throw new Error(
        `ratification ${record.decisionId}: supersedes ${record.supersedesDecisionId}, but ${latest} is the latest ratification for ${record.policyKey}.`,
      );
    }
  }
  const supersedesVersion = superseded?.policyVersion ?? null;
  // Activation decision: ACTIVE only when the effective period has started
  // at `asOf`; otherwise RATIFIED (effective later) — existence never equals
  // effect.
  const activated = asOf >= record.period.effectiveFrom;
  const version: FamilyPolicyVersion = {
    policyKey: record.policyKey,
    version: record.policyVersion,
    status: activated ? "ACTIVE" : "RATIFIED",
    period: record.period,
    parameters: record.parameters,
    supersedesVersion,
    ratificationDecisionId: record.decisionId,
    auditRef: record.auditRef,
  };
  // Keep this policy's EXISTING versions (the superseded chain must remain
  // visible); other policies pass through untouched. The NEW version enters
  // through exactly one path: supersession (when it supersedes, activated
  // now) or plain addition (first version, or not yet effective).
  const existingVersions = [...(registry.policies.versions.get(record.policyKey) ?? [])];
  let nextPolicies = buildPolicyRegistry(
    [...registry.policies.definitions.values()],
    [...allVersionsExcept(registry.policies, record.policyKey), ...existingVersions],
  );
  if (record.supersedesDecisionId !== null && activated) {
    nextPolicies = supersedePolicyVersion(nextPolicies, record.policyKey, version, superseded!.policyVersion);
  } else {
    const current = [...(nextPolicies.versions.get(record.policyKey) ?? [])];
    current.push(version);
    current.sort((a, b) => a.version - b.version);
    nextPolicies = { ...nextPolicies, versions: new Map(nextPolicies.versions).set(record.policyKey, current) };
  }
  const records = new Map(registry.records);
  if (record.supersedesDecisionId !== null && superseded !== null) {
    records.set(record.supersedesDecisionId, { ...superseded, status: "SUPERSEDED" });
  }
  records.set(record.decisionId, { ...record, status: "RATIFIED" });
  const byPolicy = new Map(registry.byPolicy);
  byPolicy.set(record.policyKey, [...(byPolicy.get(record.policyKey) ?? []), record.decisionId]);
  // The tenant scope of the ratification must match the policy scope tenant.
  if (scope.tenantId !== def.scope.tenantId) {
    throw new Error(`ratification ${record.decisionId}: tenant ${scope.tenantId} does not match the policy scope tenant ${def.scope.tenantId}.`);
  }
  return { registry: { policies: nextPolicies, records, byPolicy }, decisionId: record.decisionId, activated };
}

/**
 * Activate an already-registered RATIFIED version once its effective period
 * begins (effective-date activation). Deterministic and pure.
 */
export function activateWhenEffective(registry: RatificationRegistry, policyKey: string, asOf: string): RatificationRegistry {
  const list = registry.policies.versions.get(policyKey) ?? [];
  const due = list.filter((v) => v.status === "RATIFIED" && v.period.effectiveFrom <= asOf);
  if (due.length === 0) return registry;
  let policies = registry.policies;
  for (const v of due) {
    const current = policies.versions.get(policyKey) ?? [];
    const next = current.map((x) => {
      if (x.version === v.version) return { ...x, status: "ACTIVE" as const };
      // A superseding version that becomes effective also supersedes its
      // predecessor — otherwise two ACTIVE versions would coexist (a
      // configuration conflict the engine must not create).
      if (v.supersedesVersion !== null && x.version === v.supersedesVersion && (x.status === "ACTIVE" || x.status === "RATIFIED")) {
        return { ...x, status: "SUPERSEDED" as const };
      }
      return x;
    });
    policies = { ...policies, versions: new Map(policies.versions).set(policyKey, next) };
  }
  return { ...registry, policies };
}
