/**
 * BEYU OS — Reserved matters engine (Governance Phase 6).
 *
 * THE GAP THIS CLOSES. Six governance bodies declare fourteen reserved matters as raw JSON
 * strings in `governance_bodies.reserved_matters`:
 *
 *   GROUP_BOARD              CAPITAL>1M, OWNERSHIP_CHANGE, NEW_SECTOR_OS,
 *                            POLICY_CONSTITUTION, DISTRIBUTIONS
 *   INVESTMENT_COMMITTEE     CAPITAL>250K
 *   RISK_AUDIT_COMMITTEE     RISK_ACCEPTANCE, AUDIT_FINDING_CLOSURE
 *   TAX_GOVERNANCE_COMMITTEE AGGRESSIVE_TAX_POSITION
 *   FAMILY_COUNCIL           BENEFICIARY_ELIGIBILITY, SUCCESSION, FAMILY_CONSTITUTION
 *   TRUSTEE_BOARD            TRUST_DISTRIBUTION, TRUST_AMENDMENT
 *
 * Before this module the ONLY code touching them was `governance.ts:303`:
 *
 *     if (category === "RESERVED_MATTER" && governingBody.reservedMatters.length === 0) throw
 *
 * That checks a body has SOME reserved matter. It never asks WHICH matter an operation triggers,
 * whether THIS body is competent for THAT matter, or whether an operation that plainly engages a
 * reserved matter was routed through the reserved-matter path at all. A capital allocation of
 * 5,000,000 could be categorised CAPITAL rather than RESERVED_MATTER and the check would pass.
 *
 * WHAT THIS ADDS: resolution of a concrete operation to the matters it triggers, and verification
 * that the deciding body is competent. It reads the existing table and defines no new one —
 * a second reserved-matter registry would be a duplicate source of governance truth.
 *
 * NO MATTER IS INVENTED. The fourteen strings above are the ratified set. This engine parses and
 * enforces them; it never adds one. `CAPITAL>1M` is interpreted as a threshold because that is
 * what the ratified string says — the threshold is read, not chosen.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { governanceBodies } from "@/db/schema";

export const RESERVED_MATTER_VERSION = "reserved-matters-1.0.0";

/**
 * The operation classes that can engage a reserved matter.
 * Derived from the ratified matter strings, not invented alongside them.
 */
export const MATTER_TRIGGER = [
  "CAPITAL_ALLOCATION",
  "OWNERSHIP_CHANGE",
  "NEW_SECTOR_OS",
  "POLICY_CONSTITUTION",
  "DISTRIBUTION",
  "RISK_ACCEPTANCE",
  "AUDIT_FINDING_CLOSURE",
  "AGGRESSIVE_TAX_POSITION",
  "BENEFICIARY_ELIGIBILITY",
  "SUCCESSION",
  "FAMILY_CONSTITUTION",
  "TRUST_DISTRIBUTION",
  "TRUST_AMENDMENT",
] as const;
export type MatterTrigger = (typeof MATTER_TRIGGER)[number];

/**
 * A parsed reserved matter.
 * `threshold` is non-null only for matters written as `CAPITAL>N`.
 */
export type ParsedMatter = {
  raw: string;
  trigger: MatterTrigger | null;
  threshold: number | null;
  currency: string | null;
  parseable: boolean;
  reason: string;
};

const THRESHOLD_PATTERN = /^CAPITAL>(\d+(?:\.\d+)?)(K|M|B)?$/;

const DIRECT: Readonly<Record<string, MatterTrigger>> = {
  OWNERSHIP_CHANGE: "OWNERSHIP_CHANGE",
  NEW_SECTOR_OS: "NEW_SECTOR_OS",
  POLICY_CONSTITUTION: "POLICY_CONSTITUTION",
  DISTRIBUTIONS: "DISTRIBUTION",
  RISK_ACCEPTANCE: "RISK_ACCEPTANCE",
  AUDIT_FINDING_CLOSURE: "AUDIT_FINDING_CLOSURE",
  AGGRESSIVE_TAX_POSITION: "AGGRESSIVE_TAX_POSITION",
  BENEFICIARY_ELIGIBILITY: "BENEFICIARY_ELIGIBILITY",
  SUCCESSION: "SUCCESSION",
  FAMILY_CONSTITUTION: "FAMILY_CONSTITUTION",
  TRUST_DISTRIBUTION: "TRUST_DISTRIBUTION",
  TRUST_AMENDMENT: "TRUST_AMENDMENT",
};

/**
 * Parses one ratified reserved-matter string.
 *
 * An unparseable string is NOT ignored. It is returned with `parseable: false`, and callers treat
 * it as engaging every operation — an unreadable constraint must restrict more, never less.
 */
export function parseMatter(raw: string): ParsedMatter {
  const direct = DIRECT[raw];
  if (direct) {
    return {
      raw,
      trigger: direct,
      threshold: null,
      currency: null,
      parseable: true,
      reason: `'${raw}' is a categorical reserved matter engaging ${direct}.`,
    };
  }

  const m = THRESHOLD_PATTERN.exec(raw);
  if (m) {
    const mult = m[2] === "B" ? 1e9 : m[2] === "M" ? 1e6 : m[2] === "K" ? 1e3 : 1;
    return {
      raw,
      trigger: "CAPITAL_ALLOCATION",
      threshold: Number(m[1]) * mult,
      // The ratified strings carry no currency. Assuming one would invent policy, so the
      // threshold is currency-agnostic and the caller must supply comparable units.
      currency: null,
      parseable: true,
      reason: `'${raw}' reserves capital allocations at or above ${Number(m[1]) * mult}.`,
    };
  }

  return {
    raw,
    trigger: null,
    threshold: null,
    currency: null,
    parseable: false,
    reason:
      `'${raw}' is not a recognised reserved-matter form. It is treated as engaging EVERY ` +
      "operation, because an unreadable constraint must restrict more, never less.",
  };
}

export type CompetenceVerdict = {
  competent: boolean;
  decision:
    | "COMPETENT"
    | "BODY_NOT_COMPETENT"
    | "RESERVED_MATTER_BYPASS"
    | "BODY_NOT_FOUND"
    | "UNPARSEABLE_MATTER"
    | "NOT_RESERVED";
  bodyCode: string | null;
  triggeredMatters: string[];
  competentBodies: string[];
  reason: string;
};

/**
 * Which of a body's reserved matters does this operation trigger?
 *
 * Pure and exported: reserved-matter resolution is the control most likely to be bypassed, and it
 * must be assertable without a database.
 */
export function mattersTriggeredBy(input: {
  reservedMatters: string[];
  trigger: MatterTrigger;
  amount?: number | null;
}): { triggered: ParsedMatter[]; unparseable: ParsedMatter[] } {
  const parsed = input.reservedMatters.map(parseMatter);
  const unparseable = parsed.filter((p) => !p.parseable);

  const triggered = parsed.filter((p) => {
    // An unparseable matter engages everything — fail closed.
    if (!p.parseable) return true;
    if (p.trigger !== input.trigger) return false;
    if (p.threshold === null) return true;
    // A threshold matter with no amount supplied engages: the caller cannot escape a monetary
    // reservation by omitting the amount.
    if (input.amount === null || input.amount === undefined) return true;
    return input.amount >= p.threshold;
  });

  return { triggered, unparseable };
}

/**
 * Is `bodyId` competent to decide an operation of this kind?
 *
 * The central anti-bypass check. Returns RESERVED_MATTER_BYPASS when an operation engages a
 * reserved matter held by some OTHER body — the case where routing a decision to a friendlier
 * committee would otherwise succeed.
 */
export async function checkBodyCompetence(input: {
  bodyId: string;
  trigger: MatterTrigger;
  amount?: number | null;
  /** Optional scope of governance bodies supplied by the caller's principal. */
  tenantIds?: readonly string[];
  /** Backward-compatible exact-tenant scope for direct callers. */
  tenantId?: string;
}): Promise<CompetenceVerdict> {
  const tenantScope = input.tenantIds ?? (input.tenantId ? [input.tenantId] : undefined);
  const [body] = await db
    .select()
    .from(governanceBodies)
    .where(
      tenantScope
        ? and(eq(governanceBodies.id, input.bodyId), inArray(governanceBodies.tenantId, tenantScope))
        : eq(governanceBodies.id, input.bodyId),
    )
    .limit(1);

  if (!body) {
    return {
      competent: false,
      decision: "BODY_NOT_FOUND",
      bodyCode: null,
      triggeredMatters: [],
      competentBodies: [],
      reason: `Governance body ${input.bodyId} does not exist; competence cannot be established.`,
    };
  }

  const own = Array.isArray(body.reservedMatters) ? (body.reservedMatters as string[]) : [];
  const { triggered, unparseable } = mattersTriggeredBy({
    reservedMatters: own,
    trigger: input.trigger,
    amount: input.amount,
  });

  // Every other body that reserves this operation. When invoked from a request,
  // only bodies inside that principal's resolved tenant subtree may affect the
  // result; a body in another tenant must neither veto nor be disclosed.
  const allBodies = await db
    .select()
    .from(governanceBodies)
    .where(tenantScope ? inArray(governanceBodies.tenantId, tenantScope) : undefined);
  const otherCompetent = allBodies
    .filter((b) => b.id !== body.id)
    .filter((b) => {
      const rm = Array.isArray(b.reservedMatters) ? (b.reservedMatters as string[]) : [];
      return mattersTriggeredBy({ reservedMatters: rm, trigger: input.trigger, amount: input.amount })
        .triggered.length > 0;
    })
    .map((b) => b.code)
    .sort();

  if (unparseable.length > 0) {
    return {
      competent: false,
      decision: "UNPARSEABLE_MATTER",
      bodyCode: body.code,
      triggeredMatters: unparseable.map((u) => u.raw),
      competentBodies: otherCompetent,
      reason:
        `${body.code} declares unreadable reserved matter(s): ${unparseable.map((u) => u.raw).join(", ")}. ` +
        "Fails closed rather than proceeding on a constraint the system cannot interpret.",
    };
  }

  if (triggered.length > 0) {
    return {
      competent: true,
      decision: "COMPETENT",
      bodyCode: body.code,
      triggeredMatters: triggered.map((t) => t.raw),
      competentBodies: [body.code, ...otherCompetent].sort(),
      reason:
        `${body.code} reserves this operation via ${triggered.map((t) => t.raw).join(", ")} ` +
        "and is competent to decide it.",
    };
  }

  // The body does not reserve it — but someone else might, which is the bypass case.
  if (otherCompetent.length > 0) {
    return {
      competent: false,
      decision: "RESERVED_MATTER_BYPASS",
      bodyCode: body.code,
      triggeredMatters: [],
      competentBodies: otherCompetent,
      reason:
        `${body.code} does not reserve this operation, but ${otherCompetent.join(", ")} does. ` +
        "Deciding it here would bypass the competent body's reserved matter.",
    };
  }

  return {
    competent: false,
    decision: "NOT_RESERVED",
    bodyCode: body.code,
    triggeredMatters: [],
    competentBodies: [],
    reason: `No governance body reserves this operation; it is not a reserved matter.`,
  };
}

/**
 * Does an operation require reserved-matter treatment at all?
 *
 * Answers the question `governance.ts:303` could not: an operation engaging a reserved matter must
 * be categorised RESERVED_MATTER, and cannot be routed through an ordinary category.
 */
export async function requiresReservedMatterTreatment(input: {
  trigger: MatterTrigger;
  amount?: number | null;
  declaredCategory: string;
  /** Optional scope of governance bodies supplied by the caller's principal. */
  tenantIds?: readonly string[];
}): Promise<{
  required: boolean;
  correctlyCategorised: boolean;
  decision: "PERMITTED" | "MISCATEGORISED_RESERVED_MATTER" | "NOT_RESERVED";
  competentBodies: string[];
  reason: string;
}> {
  const bodies = await db
    .select()
    .from(governanceBodies)
    .where(input.tenantIds ? inArray(governanceBodies.tenantId, input.tenantIds) : undefined);

  const competent = bodies
    .filter((b) => {
      const rm = Array.isArray(b.reservedMatters) ? (b.reservedMatters as string[]) : [];
      return mattersTriggeredBy({ reservedMatters: rm, trigger: input.trigger, amount: input.amount })
        .triggered.length > 0;
    })
    .map((b) => b.code)
    .sort();

  if (competent.length === 0) {
    return {
      required: false,
      correctlyCategorised: true,
      decision: "NOT_RESERVED",
      competentBodies: [],
      reason: "No body reserves this operation.",
    };
  }

  if (input.declaredCategory !== "RESERVED_MATTER") {
    return {
      required: true,
      correctlyCategorised: false,
      decision: "MISCATEGORISED_RESERVED_MATTER",
      competentBodies: competent,
      reason:
        `This operation engages a reserved matter held by ${competent.join(", ")}, but was declared ` +
        `as '${input.declaredCategory}'. Categorising a reserved matter as ordinary business is a bypass.`,
    };
  }

  return {
    required: true,
    correctlyCategorised: true,
    decision: "PERMITTED",
    competentBodies: competent,
    reason: `Correctly categorised as a reserved matter; competent bodies: ${competent.join(", ")}.`,
  };
}

/** The full ratified reserved-matter map, parsed. Reports rather than interprets. */
export async function reservedMatterRegistry(): Promise<
  Array<{ bodyCode: string; quorumMinimum: number; majorityRule: string; matters: ParsedMatter[] }>
> {
  const bodies = await db.select().from(governanceBodies).orderBy(governanceBodies.code);
  return bodies.map((b) => ({
    bodyCode: b.code,
    quorumMinimum: b.quorumMinimum,
    majorityRule: b.majorityRule,
    matters: (Array.isArray(b.reservedMatters) ? (b.reservedMatters as string[]) : []).map(parseMatter),
  }));
}
