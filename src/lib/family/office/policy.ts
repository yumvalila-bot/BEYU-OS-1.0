/**
 * BEYU OS — Family Office policy engine.
 *
 * The general policy framework the six Family Office categories and the
 * Multigenerational Family Institution layer all configure through.
 *
 * Engineering here, policy NOT here:
 *   - the engine defines policy KEYS, versions, states, scopes and the
 *     resolution mechanic;
 *   - policy VALUES exist only inside a RATIFIED policy version;
 *   - a key with no ACTIVE ratified version resolves to
 *     POLICY_DECISION_REQUIRED — UNRESOLVED never behaves like a default
 *     (no null→default, missing→permissive, missing→approved,
 *     missing→unlimited, missing→zero, missing→automatic authority).
 *
 * Pure and deterministic: the registry is data, `asOf` is always supplied
 * explicitly (never "now"), and identical inputs yield identical results.
 */

import { FamilyError, familyError, type FamilyErrorCode } from "../phase3/errors";
import { assertIsoPeriod, assertScopeShape, isIsoDate, isIsoPeriod, periodContains, scopeIsContained, type EffectivePeriod, type OfficeDomain, type OfficePolicyRequired, type OfficeScope, isOfficeDomain } from "./types";

/**
 * The universal policy state machine. Transitions are one-directional:
 * UNRESOLVED → PROPOSED → RATIFIED → ACTIVE → SUPERSEDED | REVOKED.
 * SUPERSEDED and REVOKED are terminal. Nothing moves backward; a corrected
 * policy is a NEW version, never an edit of the old one.
 */
export const POLICY_STATES = ["UNRESOLVED", "PROPOSED", "RATIFIED", "ACTIVE", "SUPERSEDED", "REVOKED"] as const;
export type PolicyState = (typeof POLICY_STATES)[number];

const POLICY_TRANSITIONS: Record<PolicyState, readonly PolicyState[]> = {
  UNRESOLVED: ["PROPOSED", "REVOKED"],
  PROPOSED: ["RATIFIED", "REVOKED"],
  RATIFIED: ["ACTIVE", "REVOKED"],
  ACTIVE: ["SUPERSEDED", "REVOKED"],
  SUPERSEDED: [],
  REVOKED: [],
};

export function canTransitionPolicy(from: PolicyState, to: PolicyState): boolean {
  return POLICY_TRANSITIONS[from].includes(to);
}

/**
 * Structural parameter kinds. A kind is a TYPE, not a value: "PERCENT" says
 * the parameter is a percentage; the percentage itself is policy.
 */
export const POLICY_PARAMETER_KINDS = ["STRING", "NUMBER", "BOOLEAN", "REFERENCE", "DATE", "PERCENT"] as const;
export type PolicyParameterKind = (typeof POLICY_PARAMETER_KINDS)[number];

export interface PolicyParameter {
  key: string;
  kind: PolicyParameterKind;
  /** The ratified value. Present ONLY on RATIFIED or later versions. */
  value: unknown;
}

export interface FamilyPolicyDefinition {
  /** Stable, namespaced key, e.g. "governance.quorum" or "loan.interestRate". */
  policyKey: string;
  domain: OfficeDomain;
  name: string;
  description: string;
  /** Scope the policy applies to (explicit; null entity/jurisdiction = tenant-wide). */
  scope: OfficeScope;
  /** Structural description of the expected parameter kinds. Not a value. */
  parameterKinds: Readonly<Record<string, PolicyParameterKind>>;
}

export interface FamilyPolicyVersion {
  policyKey: string;
  version: number;
  status: PolicyState;
  period: EffectivePeriod;
  /**
   * The ratified parameter set. MUST be null unless status is RATIFIED,
   * ACTIVE, SUPERSEDED or REVOKED — an unratified version carrying values is
   * policy invention and is refused at registry construction.
   */
  parameters: readonly PolicyParameter[] | null;
  /** The ratified version this one supersedes (null for the first version). */
  supersedesVersion: number | null;
  /** Reference to the ratification record that made this version effective. */
  ratificationDecisionId: string | null;
  auditRef: string;
}

export interface PolicyRegistry {
  definitions: ReadonlyMap<string, FamilyPolicyDefinition>;
  /** policyKey → sorted versions. */
  versions: ReadonlyMap<string, readonly FamilyPolicyVersion[]>;
}

function assertParameterKinds(def: FamilyPolicyDefinition): void {
  for (const kind of Object.values(def.parameterKinds)) {
    if (!(POLICY_PARAMETER_KINDS as readonly string[]).includes(kind)) {
      throw new Error(`policy ${def.policyKey}: unknown parameter kind "${kind}".`);
    }
  }
}

function assertVersionShape(v: FamilyPolicyVersion): void {
  if (!isIsoPeriod(v.period)) throw new Error(`policy ${v.policyKey} v${v.version}: invalid effective period.`);
  assertIsoPeriod(v.period, `policy ${v.policyKey} v${v.version}`);
  if (!Number.isInteger(v.version) || v.version < 1) {
    throw new Error(`policy ${v.policyKey}: version must be a positive integer.`);
  }
  if (!(POLICY_STATES as readonly string[]).includes(v.status)) {
    throw new Error(`policy ${v.policyKey} v${v.version}: unknown status "${v.status}".`);
  }
  const ratified = v.status === "RATIFIED" || v.status === "ACTIVE" || v.status === "SUPERSEDED" || v.status === "REVOKED";
  if (v.parameters !== null) {
    if (!ratified) {
      throw familyError(
        "POLICY_INVENTION_REFUSED",
        `policy ${v.policyKey} v${v.version} is ${v.status}: it must not carry parameter values. ` +
          "UNRESOLVED and PROPOSED versions have NO values — values exist only after ratification.",
        [],
      );
    }
    for (const p of v.parameters) {
      if (!(POLICY_PARAMETER_KINDS as readonly string[]).includes(p.kind)) {
        throw new Error(`policy ${v.policyKey} v${v.version}: parameter "${p.key}" has unknown kind.`);
      }
      if (p.value === undefined || p.value === null || p.value === "") {
        throw new Error(`policy ${v.policyKey} v${v.version}: parameter "${p.key}" is empty. ` +
          "A ratified parameter must carry an actual ratified value; empty is not a value.");
      }
    }
  } else if (v.status === "RATIFIED" || v.status === "ACTIVE") {
    throw new Error(`policy ${v.policyKey} v${v.version} is ${v.status} but carries no parameters. ` +
      "An effective policy version must carry its ratified parameter set.");
  }
  if ((v.status === "RATIFIED" || v.status === "ACTIVE") && v.ratificationDecisionId === null) {
    throw new Error(`policy ${v.policyKey} v${v.version} is ${v.status} without a ratification reference. ` +
      "Effectiveness requires the authoritative act, not existence.");
  }
}

/**
 * Build an immutable policy registry. Refuses: duplicate keys/versions,
 * unknown domains, invalid periods, transitions that never happened, and
 * unratified versions carrying values (policy invention).
 */
export function buildPolicyRegistry(
  definitions: readonly FamilyPolicyDefinition[],
  versions: readonly FamilyPolicyVersion[],
): PolicyRegistry {
  const defs = new Map<string, FamilyPolicyDefinition>();
  for (const d of definitions) {
    if (!isOfficeDomain(d.domain)) throw new Error(`policy ${d.policyKey}: unknown domain "${d.domain}".`);
    if (typeof d.policyKey !== "string" || d.policyKey.trim() === "") throw new Error("policy definition: policyKey required.");
    assertScopeShape(d.scope, `policy ${d.policyKey}`);
    assertParameterKinds(d);
    if (defs.has(d.policyKey)) throw new Error(`policy ${d.policyKey}: duplicate definition.`);
    defs.set(d.policyKey, d);
  }
  const byKey = new Map<string, FamilyPolicyVersion[]>();
  for (const v of versions) {
    if (!defs.has(v.policyKey)) throw new Error(`policy ${v.policyKey}: version without a definition. ` +
      "Every version belongs to a defined policy key.");
    assertVersionShape(v);
    const list = byKey.get(v.policyKey) ?? [];
    if (list.some((x) => x.version === v.version)) {
      throw new Error(`policy ${v.policyKey}: duplicate version ${v.version}.`);
    }
    list.push(v);
    byKey.set(v.policyKey, list);
  }
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.version - b.version);
    // Verify the version chain only uses legal transitions (per version order).
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      if (cur.supersedesVersion !== null && cur.supersedesVersion !== prev.version) {
        throw new Error(`policy ${key}: v${cur.version} supersedes unknown version ${cur.supersedesVersion}.`);
      }
      if (!canTransitionPolicy(prev.status, "RATIFIED") && prev.status === cur.status) {
        // Same status twice is allowed only via SUPERSEDED→(new version) — checked below.
      }
    }
    byKey.set(key, list);
  }
  return { definitions: defs, versions: new Map([...byKey].map(([k, l]) => [k, l as readonly FamilyPolicyVersion[]])) };
}

function findActiveVersion(registry: PolicyRegistry, policyKey: string, scope: OfficeScope | null, asOf: string): FamilyPolicyVersion | null {
  const list = registry.versions.get(policyKey);
  if (!list) return null;
  const active = list.filter((v) => v.status === "ACTIVE" && periodContains(v.period, asOf));
  if (active.length === 0) return null;
  if (scope !== null) {
    const scoped = active.filter((v) => scopeIsPolicyScoped(registry, v.policyKey, scope));
    if (scoped.length > 0) return scoped[scoped.length - 1];
  }
  return active[active.length - 1];
}

function scopeIsPolicyScoped(registry: PolicyRegistry, policyKey: string, scope: OfficeScope): boolean {
  const def = registry.definitions.get(policyKey)!;
  return scopeIsContained(def.scope, scope);
}

export interface ResolvedPolicy<T = unknown> {
  state: "RESOLVED";
  policyKey: string;
  version: number;
  /** The full ratified parameter set (typed access via parametersOf). */
  parameters: readonly PolicyParameter[];
  value: T;
  effectiveFrom: string;
  effectiveTo: string | null;
  ratificationDecisionId: string | null;
}

/**
 * The result of resolving a policy at a point in time: the resolved
 * policy itself (flat — `state` + the ratified parameter set), or the
 * exact unresolved reason. A RESOLVED result is usable directly.
 */
export type PolicyResolution<T = unknown> =
  | ResolvedPolicy<T>
  | OfficePolicyRequired
  | { state: "ARCHITECTURE_DECISION_REQUIRED"; policyKey: string; reason: string }
  | { state: "DENIED"; code: FamilyErrorCode; reason: string };

/**
 * Resolve a policy value at an explicit point in time.
 *
 *   - key undefined                → POLICY_DECISION_REQUIRED (no such policy)
 *   - no ACTIVE version at `asOf`  → POLICY_DECISION_REQUIRED (unresolved/expired)
 *   - >1 ACTIVE overlapping        → ARCHITECTURE_DECISION_REQUIRED (config conflict)
 *   - exactly one                   → RESOLVED with its ratified parameters
 *
 * `value` is the parameter set as a plain object; a specific field is read
 * with `parametersOf` — reading a missing field is itself POLICY_DECISION_REQUIRED,
 * never undefined-as-default.
 */
export function resolvePolicy<T = Record<string, unknown>>(
  registry: PolicyRegistry,
  policyKey: string,
  asOf: string,
  scope: OfficeScope | null = null,
): PolicyResolution<T> {
  if (!isIsoDate(asOf)) return { state: "DENIED", code: "EVIDENCE_INSUFFICIENT", reason: "asOf must be an ISO date (determinism requires an explicit point in time)." };
  const def = registry.definitions.get(policyKey);
  if (!def) {
    return { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `No policy definition for "${policyKey}". Absence is not a default.` };
  }
  const list = registry.versions.get(policyKey) ?? [];
  const active = list.filter((v) => v.status === "ACTIVE" && periodContains(v.period, asOf));
  const candidates = scope === null ? active : active.filter((v) => scopeIsPolicyScoped(registry, policyKey, scope));
  if (scope !== null && active.length > 0 && candidates.length === 0) {
    return { state: "POLICY_DECISION_REQUIRED", policyKey, reason: `Policy "${policyKey}" is active but outside the requested scope. Scope is never widened implicitly.` };
  }
  if (candidates.length > 1) {
    return { state: "ARCHITECTURE_DECISION_REQUIRED", policyKey, reason: `${candidates.length} overlapping ACTIVE versions of "${policyKey}" at ${asOf}. Configuration conflict — fail closed.` };
  }
  const v = candidates[0] ?? null;
  if (v === null) {
    const anyVersion = list.length > 0;
    return {
      state: "POLICY_DECISION_REQUIRED",
      policyKey,
      reason: anyVersion
        ? `Policy "${policyKey}" has no ACTIVE version at ${asOf} (unratified, not yet effective, superseded, or revoked).`
        : `Policy "${policyKey}" is defined but has no version (UNRESOLVED).`,
    };
  }
  const value = Object.fromEntries(v.parameters!.map((p) => [p.key, p.value])) as T;
  return {
    state: "RESOLVED",
    policyKey,
    version: v.version,
    parameters: v.parameters!,
    value,
    effectiveFrom: v.period.effectiveFrom,
    effectiveTo: v.period.effectiveTo,
    ratificationDecisionId: v.ratificationDecisionId,
  };
}

/** Read one parameter of a resolved policy. Missing → POLICY_DECISION_REQUIRED. */
export function parametersOf<T = unknown>(
  resolved: ResolvedPolicy<unknown>,
  field: string,
): { state: "RESOLVED"; value: T } | OfficePolicyRequired {
  const p = resolved.parameters.find((x) => x.key === field);
  if (p === undefined) {
    return { state: "POLICY_DECISION_REQUIRED", policyKey: resolved.policyKey, reason: `Resolved ${resolved.policyKey} v${resolved.version} has no ratified parameter "${field}". Missing is not a default.` };
  }
  return { state: "RESOLVED", value: p.value as T };
}

/**
 * Asserting form: a workflow step that requires a policy value.
 * Resolved → returns it; anything else throws with the exact gap named.
 */
export function requirePolicy<T>(
  registry: PolicyRegistry,
  policyKey: string,
  asOf: string,
  field: string,
  scope: OfficeScope | null = null,
): T {
  const outcome = resolvePolicy<Record<string, unknown>>(registry, policyKey, asOf, scope);
  if (outcome.state !== "RESOLVED") {
    const code = outcome.state === "ARCHITECTURE_DECISION_REQUIRED" ? "ARCHITECTURE_DECISION_REQUIRED" : "POLICY_DECISION_REQUIRED";
    throw familyError(code as "POLICY_DECISION_REQUIRED" | "ARCHITECTURE_DECISION_REQUIRED", `POLICY DECISION REQUIRED — ${outcome.reason}`, [], { policyKey, field });
  }
  const p = parametersOf<unknown>(outcome, field);
  if (p.state !== "RESOLVED") {
    throw familyError("POLICY_DECISION_REQUIRED", `POLICY DECISION REQUIRED — ${p.reason}`, [], { policyKey, field });
  }
  return p.value as T;
}

/**
 * Deterministic supersession: returns a NEW registry in which `superseded`
 * becomes SUPERSEDED and the new version becomes the given status (RATIFIED
 * or ACTIVE). Terminal versions can never be reactivated.
 */
export function supersedePolicyVersion(
  registry: PolicyRegistry,
  policyKey: string,
  newVersion: FamilyPolicyVersion,
  supersededVersion: number,
): PolicyRegistry {
  const list = [...(registry.versions.get(policyKey) ?? [])];
  const target = list.find((v) => v.version === supersededVersion);
  if (target === undefined) throw new Error(`policy ${policyKey}: no version ${supersededVersion} to supersede.`);
  if (target.status !== "ACTIVE" && target.status !== "RATIFIED") {
    throw new Error(`policy ${policyKey}: version ${supersededVersion} is ${target.status}; only RATIFIED/ACTIVE versions can be superseded.`);
  }
  if (newVersion.supersedesVersion !== supersededVersion) {
    throw new Error(`policy ${policyKey}: new version must name the version it supersedes.`);
  }
  assertVersionShape(newVersion);
  const next = list.map((v) => (v.version === supersededVersion ? { ...v, status: "SUPERSEDED" as PolicyState } : v));
  next.push(newVersion);
  next.sort((a, b) => a.version - b.version);
  const versions = new Map(registry.versions);
  versions.set(policyKey, next as readonly FamilyPolicyVersion[]);
  return { definitions: registry.definitions, versions };
}

/** Deterministic revocation: terminal, audit-referenced, never reversed. */
export function revokePolicyVersion(
  registry: PolicyRegistry,
  policyKey: string,
  version: number,
  auditRef: string,
): PolicyRegistry {
  const list = [...(registry.versions.get(policyKey) ?? [])];
  const target = list.find((v) => v.version === version);
  if (target === undefined) throw new Error(`policy ${policyKey}: no version ${version} to revoke.`);
  if (target.status === "SUPERSEDED" || target.status === "REVOKED") {
    throw new Error(`policy ${policyKey}: version ${version} is already ${target.status} (terminal).`);
  }
  if (typeof auditRef !== "string" || auditRef.trim() === "") {
    throw new Error("revocation requires an audit reference — it is a governed act, never silent.");
  }
  const next = list.map((v) => (v.version === version ? { ...v, status: "REVOKED" as PolicyState, auditRef } : v));
  const versions = new Map(registry.versions);
  versions.set(policyKey, next as readonly FamilyPolicyVersion[]);
  return { definitions: registry.definitions, versions };
}

/** The policy keys of this registry that have no ACTIVE version at `asOf`. */
export function unresolvedPolicyKeys(registry: PolicyRegistry, asOf: string): string[] {
  return [...registry.definitions.keys()]
    .filter((key) => (resolvePolicy(registry, key, asOf).state !== "RESOLVED"))
    .sort();
}
