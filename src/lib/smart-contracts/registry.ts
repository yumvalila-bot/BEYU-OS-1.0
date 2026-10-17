/**
 * BEYU OS — SMART CONTRACT GOVERNANCE & AUTOMATION: INVENTORY AND AUTHORIZATION
 * (pack `BEYU-SCG`, documents `SCG-03`, `SCG-04`, `SCG-04A`, `SCG-08`).
 *
 * WHY THIS MODULE EXISTS.
 *   The Phase 0 audit (`BEYU-SCG-PHASE0`) found an engine whose boundaries are
 *   structural — no keys, no web3 dependency, no RPC client, no money path, no
 *   authority from chain data — and a governance pack (`BEYU-SCG`) that says who
 *   may do what. Nothing joined them. `AUTOMATION_INVENTORY.json` described 23
 *   automations, and `R-AUT-01` was specified to hold ZERO authorized ones, but
 *   no code could answer the only question that matters at action time:
 *
 *       "Is THIS automation, in THIS version, acting for THIS tenant, under a
 *        decision that exists, allowed to do this — right now?"
 *
 *   This module is that join. It is a REGISTER READER, not an authority engine.
 *   It does not sign, post, pay, deploy, pause or execute anything, and it
 *   imports no database handle, no network client and no signer. It asserts
 *   facts that are true of the code (class, external-execution capability,
 *   prohibition) and it evaluates authorization evidence supplied by the caller
 *   — where, by design, NO valid evidence can exist yet.
 *
 * CONSTITUTIONAL PROPERTIES (each one is tested):
 *  - FAIL CLOSED. Every unknown, absent, malformed, expired, revoked, mismatched
 *    or unapproved input resolves to DENY. `authorizeAutomation()` returns
 *    `allowed: true` for exactly one shape of input, and no environment
 *    variable, config flag, seed row, inventory entry or UI state can produce it.
 *  - AN INVENTORY ENTRY IS NOT A GRANT. Presence in the inventory authorises
 *    nothing. `grantsAuthority` is `false` as a type-level literal, and the
 *    A7 authority set is the empty tuple — the action is unrepresentable, not
 *    merely refused.
 *  - EXTERNAL EXECUTION IS UNREACHABLE. No automation declares external
 *    execution; `EXTERNAL_EXECUTION_AUTOMATIONS` is empty because the codebase
 *    holds no key material and no signing capability at all.
 *  - NO AUTHORITY FROM ANYWHERE ELSE. A contract address, a registry record, a
 *    `permitted: true` execution posture, a hostname, an AI suggestion or a
 *    frontend state is never an input to this module.
 *  - NO SECRETS. Nothing here reads a credential, and no output carries key
 *    material, personal data or a payload body — only references and reasons.
 *
 * This module sits alongside the existing canonical authority control plane
 * (`src/lib/decision-authority.ts`, `src/lib/authority/`). It is deliberately
 * NOT a second authority engine: it does not decide whether a governance
 * decision is valid in general; it requires a decision reference to be supplied
 * through the governed lookup and refuses everything else.
 */

export const SCG_INVENTORY_ID = "BEYU-SCG-04A";
export const SCG_AUTHORIZATION_REGISTER_ID = "R-AUT-01";
export const SCG_REGISTRY_VERSION = "scg-registry-1.0.0";

/* ------------------------------------------------------------------ */
/* Classes                                                             */
/* ------------------------------------------------------------------ */

/**
 * Automation classes (`SCG-04` §2). A1–A6 describe what an automation may do
 * *unattended in kind*. **A class is a capability description, never a grant:**
 * `SCG-04` §2 says so, and `authorizeAutomation()` enforces it by requiring a
 * decision for every class without exception.
 */
export const AUTOMATION_CLASSES = ["A1", "A2", "A3", "A4", "A5", "A6", "A7"] as const;
export type AutomationClass = (typeof AUTOMATION_CLASSES)[number];

/** Classes that may exist at all. A7 is catalogued so it can be refused. */
export const PERMITTED_CLASSES: readonly AutomationClass[] = ["A1", "A2", "A3", "A4", "A5", "A6"];

/**
 * A7 — external execution (sign, submit, broadcast, post, pay, transfer).
 * **PROHIBITED.** `SCG-04` §3 AU-2/AU-3, `SCG-07` R-3.
 */
export const PROHIBITED_CLASSES: readonly AutomationClass[] = ["A7"];

/**
 * The authority set an A7 automation could ever hold.
 *
 * `never` is not documentation — it is the type. There is no value of this type,
 * so no A7 automation can be described as authorised no matter what a caller,
 * a fixture, a JSON file or a future edit attempts. `SCG-04` AU-1 ("an
 * automation may only ever act within the class it is registered under") and the
 * prohibition on external execution become a compile-time property rather than a
 * runtime check that could be removed.
 */
export type ExternalExecutionAuthority = never;

/**
 * Inventory status (`SCG-08` R-AUT-01). `AUTHORISED` is produced by exactly one
 * function, which requires approval evidence — and no such evidence can be
 * constructed today, because no governance body is evidenced as constituted.
 */
export const AUTOMATION_STATUSES = ["PROPOSED", "AUTHORISED", "SUSPENDED", "WITHDRAWN"] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];

/** `SCG-04` AU-20: the inventory describes; it never authorises. */
export const INVENTORY_GRANTS_AUTHORITY = false as const;

/* ------------------------------------------------------------------ */
/* Read models                                                         */
/* ------------------------------------------------------------------ */

/** How an inventory entry was verified against the source tree. */
export const VERIFICATION_KINDS = [
  "VERIFIED_BY_READING_SOURCE",
  "VERIFIED_BY_READING_SOURCE_AND_TESTS",
  /** Part of the recorded-inventory index that is not itself an automation
   *  (aggregate surfaces such as the Noelia tool registry). Excluded from
   *  authorization entirely and may never hold a decision. */
  "CATALOGUE_REFERENCE",
] as const;
export type VerificationKind = (typeof VERIFICATION_KINDS)[number];

export type AutomationRecord = {
  /** Stable id, `AUT-##`. */
  id: string;
  name: string;
  class: AutomationClass;
  /** Where the behaviour actually lives. Resolved against the repository. */
  sourcePaths: readonly string[];
  /** Tests that exercise it, where they exist. Resolved against the repository. */
  tests?: readonly string[];
  verification: VerificationKind;
  /** Human bindings that constrain this automation, by id (`HB-##`). */
  humanBindings: readonly string[];
  /** True when the automation acts without a human in the loop for that act. */
  unattended: boolean;
  /**
   * Whether the module can sign, submit, broadcast, post, pay or transfer.
   * `false` for every automation that exists. `true` is unrepresentable in the
   * registry below.
   */
  externalExecution: false;
  /**
   * Structural assertion, matching the machine-readable inventory: reading this
   * record grants nothing.
   */
  grantsAuthority: typeof INVENTORY_GRANTS_AUTHORITY;
};

export type HumanBindingRecord = {
  id: string;
  name: string;
  why: string;
  sourcePaths: readonly string[];
};

/* ------------------------------------------------------------------ */
/* The register                                                        */
/* ------------------------------------------------------------------ */

/**
 * The governed register, derived from `AUTOMATION_INVENTORY.json` at the audited
 * commit and read the same way (`SCG-04` §6, `SCG-09` V-03). 23 automations and
 * 6 human bindings; the aggregate surfaces that the JSON carries as inventory
 * entries are marked `CATALOGUE_REFERENCE` and cannot be authorized.
 */
export const AUTOMATION_REGISTRY: readonly AutomationRecord[] = [
  { id: "AUT-01", name: "Noelia scheduler tick", class: "A3", sourcePaths: ["src/app/api/v1/ai/noelia/schedules/tick/route.ts", "src/lib/noelia/scheduler-service.ts"], verification: "VERIFIED_BY_READING_SOURCE", humanBindings: ["HB-05"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-02", name: "Scheduled briefing execution (Noelia)", class: "A2", sourcePaths: ["src/lib/noelia/scheduler-service.ts", "src/lib/noelia.ts"], verification: "VERIFIED_BY_READING_SOURCE", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-03", name: "Noelia tool invocation surface", class: "A4", sourcePaths: ["src/lib/noelia/default-tools.ts", "src/lib/noelia/tool-registry.ts", "src/lib/noelia/types.ts"], verification: "CATALOGUE_REFERENCE", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-04", name: "Human approval binding (Noelia control commands)", class: "A3", sourcePaths: ["src/lib/noelia/human-approval.ts"], tests: ["tests/noelia/human-approval.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-01", "HB-05"], unattended: false, externalExecution: false, grantsAuthority: false },
  { id: "AUT-05", name: "Payment webhook ingestion", class: "A1", sourcePaths: ["src/lib/payments/ingest.ts"], tests: ["tests/payments/webhook-security-and-provider-honesty.test.ts", "tests/payments/state-machines-and-gates.test.ts", "tests/payments/payment-controls-db.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-06", name: "Payment settlement ingestion (trust raising)", class: "A5", sourcePaths: ["src/lib/payments/settlement.ts"], tests: ["tests/payments/state-machines-and-gates.test.ts", "tests/payments/money-and-precision.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-07", name: "Payment reconciliation pass", class: "A5", sourcePaths: ["src/lib/payments/reconcile.ts", "src/lib/payments/matching.ts"], tests: ["tests/payments/human-review-assurance.test.ts", "tests/payments/money-and-precision.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-02"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-08", name: "Deterministic payment risk rules", class: "A6", sourcePaths: ["src/lib/payments/risk.ts"], tests: ["tests/payments/payment-controls-db.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-09", name: "Contract obligation timing and escalation clock", class: "A2", sourcePaths: ["src/lib/contracts/obligations.ts"], tests: ["tests/contracts/service.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-10", name: "Contract health aggregation", class: "A2", sourcePaths: ["src/lib/contracts/model.ts"], tests: ["tests/contracts/service.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-11", name: "Blockchain anchor verification", class: "A3", sourcePaths: ["src/lib/blockchain/model.ts", "src/lib/blockchain/service.ts"], tests: ["tests/blockchain/model.test.ts", "tests/blockchain/service.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-04"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-12", name: "Oracle reading evaluation", class: "A2", sourcePaths: ["src/lib/blockchain/model.ts"], tests: ["tests/blockchain/model.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-13", name: "Registry progression validation (testnet-first)", class: "A3", sourcePaths: ["src/lib/blockchain/model.ts"], tests: ["tests/blockchain/model.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-05"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-14", name: "On-chain execution posture (read-only gate)", class: "A2", sourcePaths: ["src/app/api/v1/blockchain/execution-posture/route.ts", "src/lib/blockchain/model.ts"], tests: ["tests/blockchain/model.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-05"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-15", name: "Blockchain reconciliation run (findings only)", class: "A2", sourcePaths: ["src/lib/blockchain/model.ts", "src/lib/blockchain/service.ts"], tests: ["tests/blockchain/service.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-16", name: "Enterprise event ingestion (cross-OS)", class: "A1", sourcePaths: ["src/app/api/v1/internal/events/route.ts"], verification: "VERIFIED_BY_READING_SOURCE", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-17", name: "Retention eligibility evaluation", class: "A2", sourcePaths: ["src/lib/data-governance/retention-service.ts"], tests: ["tests/data-governance/retention-enforcement.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-03"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-18", name: "Governed execution simulation", class: "A2", sourcePaths: ["src/lib/execution/simulate.ts"], tests: ["tests/execution/simulate.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: false, externalExecution: false, grantsAuthority: false },
  { id: "AUT-19", name: "Authority verdict evaluation (activation gate)", class: "A2", sourcePaths: ["src/lib/decision-authority.ts", "src/lib/authority/"], tests: ["tests/governance/decision-authority.test.ts", "tests/security/activation-gate.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: ["HB-05"], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-20", name: "Governed idempotency", class: "A2", sourcePaths: ["src/lib/idempotency.ts"], tests: ["tests/security/idempotency.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-21", name: "HCM observation", class: "A2", sourcePaths: ["src/lib/hcm.ts", "src/lib/hcm-observe.ts"], tests: ["tests/hcm/hcm.test.ts", "tests/architecture/hcm.test.ts"], verification: "VERIFIED_BY_READING_SOURCE_AND_TESTS", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-22", name: "Governance escalation recording", class: "A6", sourcePaths: ["src/lib/governance/calendar-service.ts"], verification: "VERIFIED_BY_READING_SOURCE", humanBindings: [], unattended: true, externalExecution: false, grantsAuthority: false },
  { id: "AUT-23", name: "Operator-invoked scripts", class: "A3", sourcePaths: ["scripts/", "src/db/seed.ts", "src/lib/payments/fixture-reset.ts"], verification: "VERIFIED_BY_READING_SOURCE", humanBindings: [], unattended: false, externalExecution: false, grantsAuthority: false },
] as const;

export const HUMAN_BINDINGS: readonly HumanBindingRecord[] = [
  { id: "HB-01", name: "Contract lifecycle transitions and review gates", why: "A gate closes only by a recorded human act carrying the named authority; the software never infers closure.", sourcePaths: ["src/lib/contracts/service.ts", "src/lib/contracts/vocabulary.ts"] },
  { id: "HB-02", name: "Payment confirmation (the only route from uncertain to certain)", why: "Separation of duties: whoever prepared it may not confirm it; confirmation does not post and does not adjust amounts.", sourcePaths: ["src/lib/payments/review.ts", "src/lib/finance/workflow.ts"] },
  { id: "HB-03", name: "Record destruction after retention expiry", why: "Eligibility is computed; destruction requires human approval; legal holds block regardless.", sourcePaths: ["src/lib/data-governance/retention-service.ts"] },
  { id: "HB-04", name: "Anchor revocation and supersession", why: "Verification never demotes an anchor; the status change is a separate governed act.", sourcePaths: ["src/lib/blockchain/model.ts", "src/lib/blockchain/service.ts"] },
  { id: "HB-05", name: "Registry approval transitions and execution decisions", why: "Testnet-first; permitted true is a posture, not a permission.", sourcePaths: ["src/lib/blockchain/service.ts", "docs/governance/smart-contracts/SMART_CONTRACT_AUTHORITY_FRAMEWORK.md"] },
  { id: "HB-06", name: "Incident pause, upgrade and rollback", why: "Pausing, upgrading and revoking are human acts under dual control; automation may not resume a paused package.", sourcePaths: ["docs/governance/smart-contracts/INCIDENT_PAUSE_UPGRADE_AND_ROLLBACK_RUNBOOK.md"] },
] as const;

/* ------------------------------------------------------------------ */
/* Facts the code asserts about itself                                 */
/* ------------------------------------------------------------------ */

/**
 * Automations that can sign, submit, broadcast, post, pay or transfer.
 *
 * EMPTY, and it must stay empty: `package.json` carries no web3 or RPC client,
 * `src/lib/blockchain/service.ts` boundary 1 forbids key material, and the
 * posting engine is LOCKED behind CAP_POSTING. An empty result here is how a
 * test detects the introduction of a signing surface.
 */
export function automationsWithExternalExecution(): readonly AutomationRecord[] {
  return AUTOMATION_REGISTRY.filter((a) => a.externalExecution);
}

/** Automations that may act without a human in the loop for that act. */
export function unattendedAutomations(): readonly AutomationRecord[] {
  return AUTOMATION_REGISTRY.filter((a) => a.unattended);
}

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

/**
 * Fail-closed lookup: an unknown id returns `null`, never a default record.
 *
 * THE MATCH IS EXACT — no trimming, no case folding. Normalising an identifier
 * is how `aut-05`, `AUT-05 ` and `Aut-05` become `AUT-05`, and an authorization
 * boundary that accepts several spellings of the same name has no way to tell a
 * caller's convenience from an attacker's. The register's ids are canonical
 * (`AUT-##`); anything else simply does not exist here.
 *
 * A `CATALOGUE_REFERENCE` is not an automation and is never returned: it
 * describes an aggregate surface (the Noelia tool registry) which cannot hold an
 * authorization at all.
 */
export function automationById(id: string): AutomationRecord | null {
  const found = findExact(id);
  if (!found) return null;
  if (found.verification === "CATALOGUE_REFERENCE") return null;
  // A class outside the permitted set is not a usable record: the caller must
  // never receive a record whose class this module would have to refuse.
  if (!PERMITTED_CLASSES.includes(found.class)) return null;
  if (found.externalExecution !== false) return null;
  return found;
}

/** Exact, unnormalised, internal lookup — used only to classify a refusal. */
function findExact(id: unknown): AutomationRecord | null {
  if (typeof id !== "string" || id === "") return null;
  return AUTOMATION_REGISTRY.find((a) => a.id === id) ?? null;
}

export function humanBindingById(id: string): HumanBindingRecord | null {
  if (typeof id !== "string" || id === "") return null;
  return HUMAN_BINDINGS.find((b) => b.id === id) ?? null;
}

/* ------------------------------------------------------------------ */
/* Authorization                                                       */
/* ------------------------------------------------------------------ */

/** Why an authorization attempt was refused. Every code is terminal. */
export const AUTOMATION_DENIAL_REASONS = [
  "UNKNOWN_AUTOMATION",
  "CATALOGUE_REFERENCE_NOT_AUTHORIZABLE",
  "PROHIBITED_CLASS_EXTERNAL_EXECUTION",
  "APPROVAL_ABSENT",
  "APPROVAL_MISSING_DECISION_REFERENCE",
  "DECISION_UNKNOWN",
  "DECISION_NOT_APPROVED",
  "DECISION_PROVENANCE_NOT_GOVERNED",
  "DECISION_OUT_OF_SCOPE",
  "AUTHORIZATION_REVOKED",
  "VERSION_MISMATCH",
  "NOT_YET_EFFECTIVE",
  "AUTHORIZATION_EXPIRED",
  "EXTERNAL_EXECUTION_PROHIBITED",
  "GOVERNANCE_BODY_NOT_CONSTITUTED",
] as const;
export type AutomationDenialReason = (typeof AUTOMATION_DENIAL_REASONS)[number];

/** Provenance of a governance decision. Only `GOVERNED` can ever authorise. */
export const DECISION_PROVENANCE = ["GOVERNED", "REFERENCE_DATA", "UNKNOWN"] as const;
export type DecisionProvenance = (typeof DECISION_PROVENANCE)[number];

/** Decision status. Only `APPROVED` can ever authorise. */
export const DECISION_STATUSES = ["DRAFT", "APPROVED", "REJECTED", "SUPERSEDED", "WITHDRAWN"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/**
 * A governance decision, supplied by the caller through the governed lookup.
 *
 * NOTE WHAT IS ABSENT: there is no field for a class, verb, capability or
 * "may execute" flag. The decision authorises an automation ID and version for
 * a scope — nothing else — and it can never widen a class or unlock external
 * execution, because those are properties of the automation, not of a decision.
 */
export type AutomationDecision = {
  reference: string;
  status: DecisionStatus;
  provenance: DecisionProvenance;
  /** The single automation this decision authorises. */
  automationId: string;
  /** The version it authorises. A newer automation needs a newer decision. */
  automationVersion: string;
  /** Tenant scope, or `*` for a group-wide decision. Required by the resolver. */
  tenantId: string;
  /** Optional entity scope; `null` means tenant-wide. */
  legalEntityId?: string | null;
  effectiveFrom: string;
  expiresAt: string;
  revokedAt?: string | null;
};

export type ApprovalEvidence = {
  decision: AutomationDecision;
};

/**
 * The authorization request.
 *
 * Deliberately absent: any field describing what the caller WANTS to do beyond
 * the automation id and version. A caller cannot ask for a stronger verb, a
 * different class, an external execution or a capability bypass, because the
 * request has no vocabulary for those — and `automationVersion` must match the
 * decision exactly.
 */
export type AutomationAuthorizationRequest = {
  automationId: string;
  automationVersion: string;
  tenantId: string;
  legalEntityId?: string | null;
  /** The instant the authorisation is evaluated for. Injected, never ambient. */
  now: string;
  approval?: ApprovalEvidence | null;
};

export type AutomationAuthorizationDecision =
  | {
      allowed: true;
      automationId: string;
      class: AutomationClass;
      /** The decision reference that authorised this act. Always present. */
      decisionReference: string;
      evaluatedAt: string;
      /** Echoed so a caller cannot mistake this for external-execution authority. */
      externalExecution: false;
      grantsAuthority: false;
      note: string;
    }
  | {
      allowed: false;
      automationId: string;
      denial: AutomationDenialReason;
      reason: string;
      evaluatedAt: string;
      externalExecution: false;
      grantsAuthority: false;
      note: string;
    };

const DENY_NOTE =
  "Denied. An inventory entry, a class, a registry record, a contract address, a hostname, an AI suggestion, a frontend state or a `permitted: true` posture is never authorization; only a governed decision can be, and none exists.";

function deny(
  automationId: string,
  denial: AutomationDenialReason,
  reason: string,
  evaluatedAt: string,
): AutomationAuthorizationDecision {
  return {
    allowed: false,
    automationId,
    denial,
    reason,
    evaluatedAt,
    externalExecution: false,
    grantsAuthority: false,
    note: DENY_NOTE,
  };
}

function isoMs(value: string): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Resolve a decision reference through the governed lookup.
 *
 * There is NO default resolver that invents a decision, no in-memory fallback
 * and no environment switch. Until the governed projection is wired (which
 * requires a constituted body, an adopted process and a reviewed change), every
 * call to `authorizeAutomation()` without an explicit resolver denies with
 * `GOVERNANCE_BODY_NOT_CONSTITUTED`.
 */
export type DecisionLookup = (reference: string) => AutomationDecision | null;

/**
 * The production lookup. It refuses every reference, by design, and names the
 * reason. Replacing this function with one backed by
 * `governance_decision_registry` requires a governance decision that does not
 * exist yet — see `SCG-13` §C and `SCG-14` R-DEC-01.
 */
export const governedDecisionLookup: DecisionLookup = () => null;

export type AuthorizationOptions = {
  /**
   * Injected for tests and for future governed wiring. Defaults to the
   * fail-closed production lookup.
   */
  lookup?: DecisionLookup;
  /**
   * Whether a constituted approving body is evidenced for this act.
   * Defaults to `false`. No code path sets this true outside an explicit test,
   * and setting it true without the evidence is a governance breach — the
   * decision record itself must still be governed, approved and in scope.
   */
  bodyEvidenced?: boolean;
};

/**
 * THE AUTHORIZATION BOUNDARY.
 *
 * Every check is a refusal unless positively satisfied, and the order is
 * deliberate: the automation must exist and be authorizable at all, then the
 * approval must be present and complete, then the decision must be governed,
 * approved and in scope, then the version, then the clock. Nothing is inferred.
 */
export function authorizeAutomation(
  request: AutomationAuthorizationRequest,
  options: AuthorizationOptions = {},
): AutomationAuthorizationDecision {
  const evaluatedAt = isoMs(request?.now) === null ? "" : request.now;
  const requestedId = typeof request?.automationId === "string" ? request.automationId : "";

  // 1 — the input must be evaluable at all.
  if (evaluatedAt === "") {
    return deny(requestedId, "APPROVAL_ABSENT", "`now` must be an ISO-8601 instant; an unverifiable decision instant is refused (§32: an unverifiable timestamp is treated as no data).", "");
  }

  // 2 — the automation must exist. An unknown id is never a default record.
  const automation = automationById(requestedId);
  if (!automation) {
    const raw = findExact(requestedId);
    if (raw && PROHIBITED_CLASSES.includes(raw.class)) {
      return deny(requestedId, "PROHIBITED_CLASS_EXTERNAL_EXECUTION", `${raw.id} is class ${raw.class}: external execution is prohibited and carries no authority type in this codebase.`, evaluatedAt);
    }
    if (raw && raw.verification === "CATALOGUE_REFERENCE") {
      return deny(requestedId, "CATALOGUE_REFERENCE_NOT_AUTHORIZABLE", `${raw.id} is a catalogue reference, not an automation: it describes an aggregate surface and can never hold an authorization.`, evaluatedAt);
    }
    return deny(requestedId, "UNKNOWN_AUTOMATION", `No automation ${JSON.stringify(requestedId)} exists in ${SCG_INVENTORY_ID}. Identifiers match exactly: an unknown or differently-spelled id is refused, never defaulted.`, evaluatedAt);
  }

  // 3 — external execution is unreachable, structurally.
  if (automation.externalExecution !== false) {
    return deny(automation.id, "EXTERNAL_EXECUTION_PROHIBITED", "This automation declares external execution; none may.", evaluatedAt);
  }

  // 4 — a constituted approving body must be evidenced.
  if (options.bodyEvidenced !== true) {
    return deny(automation.id, "GOVERNANCE_BODY_NOT_CONSTITUTED", "No approving body is evidenced as constituted in this repository, so no automation can be authorized. This is the current, accurate state (SCG-13 §C M1).", evaluatedAt);
  }

  // 5 — approval evidence must be present and reference a decision.
  const approval = request.approval;
  if (!approval || !approval.decision) {
    return deny(automation.id, "APPROVAL_ABSENT", "No approval evidence supplied. An authorization without a decision is not an authorization.", evaluatedAt);
  }
  const decision = approval.decision;
  if (typeof decision.reference !== "string" || decision.reference.trim() === "") {
    return deny(automation.id, "APPROVAL_MISSING_DECISION_REFERENCE", "The approval carries no decision reference; an unreferenced approval is not evidence.", evaluatedAt);
  }

  // 6 — the decision must be resolvable through the governed lookup.
  const lookup = options.lookup ?? governedDecisionLookup;
  const resolved = lookup(decision.reference);
  if (!resolved) {
    return deny(automation.id, "DECISION_UNKNOWN", `Decision ${decision.reference} does not resolve through the governed lookup. A caller-supplied decision object is not proof that the decision exists.`, evaluatedAt);
  }

  // 7 — provenance. Seed and hand-inserted data never authorise.
  if (resolved.provenance !== "GOVERNED") {
    return deny(automation.id, "DECISION_PROVENANCE_NOT_GOVERNED", `Decision ${resolved.reference} has provenance ${resolved.provenance}. Only a GOVERNED decision with an audit-ledger trail can authorize; REFERENCE_DATA never authorises.`, evaluatedAt);
  }

  // 8 — status.
  if (resolved.status !== "APPROVED") {
    return deny(automation.id, "DECISION_NOT_APPROVED", `Decision ${resolved.reference} is ${resolved.status}; only APPROVED authorizes.`, evaluatedAt);
  }

  // 9 — the decision must name THIS automation.
  if (resolved.automationId !== automation.id) {
    return deny(automation.id, "DECISION_OUT_OF_SCOPE", `Decision ${resolved.reference} authorizes ${resolved.automationId}, not ${automation.id}.`, evaluatedAt);
  }

  // 10 — the decision must name THIS version.
  if (resolved.automationVersion !== request.automationVersion) {
    return deny(automation.id, "VERSION_MISMATCH", `Decision ${resolved.reference} authorizes version ${resolved.automationVersion}; the request is for ${request.automationVersion}. A newer automation needs a newer decision.`, evaluatedAt);
  }

  // 11 — tenant scope.
  const scopeMatches =
    resolved.tenantId === "*" ||
    (resolved.tenantId === request.tenantId &&
      (resolved.legalEntityId === null || resolved.legalEntityId === undefined || resolved.legalEntityId === request.legalEntityId));
  if (!scopeMatches) {
    return deny(automation.id, "DECISION_OUT_OF_SCOPE", `Decision ${resolved.reference} is scoped to tenant ${resolved.tenantId}; the request is for ${request.tenantId}.`, evaluatedAt);
  }

  // 12 — revocation.
  if (resolved.revokedAt) {
    return deny(automation.id, "AUTHORIZATION_REVOKED", `Authorization was revoked at ${resolved.revokedAt}.`, evaluatedAt);
  }

  // 13 — the clock, on both ends.
  const nowMs = isoMs(evaluatedAt) as number;
  const fromMs = isoMs(resolved.effectiveFrom);
  const expiryMs = isoMs(resolved.expiresAt);
  if (fromMs === null || expiryMs === null) {
    return deny(automation.id, "DECISION_UNKNOWN", `Decision ${resolved.reference} carries an unverifiable effective or expiry instant; an unverifiable window is refused.`, evaluatedAt);
  }
  if (nowMs < fromMs) {
    return deny(automation.id, "NOT_YET_EFFECTIVE", `Decision ${resolved.reference} takes effect at ${resolved.effectiveFrom}.`, evaluatedAt);
  }
  if (nowMs >= expiryMs) {
    return deny(automation.id, "AUTHORIZATION_EXPIRED", `Decision ${resolved.reference} expired at ${resolved.expiresAt}. Approvals expire (SCG-01 A-10).`, evaluatedAt);
  }

  // The only path that returns a permit. Note that it still cannot carry
  // external-execution authority: the type forbids it.
  return {
    allowed: true,
    automationId: automation.id,
    class: automation.class,
    decisionReference: resolved.reference,
    evaluatedAt,
    externalExecution: false,
    grantsAuthority: false,
    note: `Authorized: ${automation.id} (class ${automation.class}) under decision ${resolved.reference}, within its recorded scope and window. This is permission to act WITHIN the class — and never to sign, submit, broadcast, post, pay or transfer, which remain unreachable in this codebase.`,
  };
}

/* ------------------------------------------------------------------ */
/* Posture is not permission                                           */
/* ------------------------------------------------------------------ */

/**
 * What an execution posture means. `permitted: true` reports that the platform's
 * gates are open; `SCG-02` L-11 and `SCG-07` §1 are explicit that it is not a
 * permission, and `SCG-14` records how it has been misread before.
 */
export type ExecutionPosture = {
  permitted: boolean;
  blockedBy?: readonly string[];
};

export type PostureInterpretation = {
  /** The posture's literal meaning, unchanged. NEVER a grant. */
  gatesOpen: boolean;
  /** Always false. A posture authorises nothing, alone or in combination. */
  isPermission: false;
  /** What must still happen before any act. */
  requiresBeforeActing: readonly string[];
} & (
  | { blockedBy: readonly string[]; blockedByNote: string }
  | { blockedBy: readonly []; blockedByNote: "" }
);

/**
 * Interpret a posture. This function exists so that no caller can convert
 * `permitted: true` into a permission by accident: the return type carries
 * `isPermission: false` as a literal, and the requirements list is always
 * non-empty.
 */
export function interpretExecutionPosture(posture: ExecutionPosture): PostureInterpretation {
  const blockedBy = (posture?.blockedBy ?? []) as readonly string[];
  const gatesOpen = posture?.permitted === true;
  const base = {
    gatesOpen,
    isPermission: false as const,
    requiresBeforeActing: [
      "A governed decision referenced in R-APP-01 (SCG-02 L-12)",
      "A digest-bound human approval for the exact payload and version (SCG-01 A-10)",
      "A registry record that is complete and verified on the target network (SCG-02 L-10)",
      "Closure of any open dispute (SCG-02 §4)",
      "For a production network, multisig approval and timelock readiness (SCG-02 §4)",
    ] as readonly string[],
  };
  return blockedBy.length > 0
    ? { ...base, blockedBy, blockedByNote: "Gates are closed; the list names what is missing. A refusal is not an error." }
    : { ...base, blockedBy: [] as readonly [], blockedByNote: "" as const };
}
