/**
 * Deterministic risk checks on ingested money movement.
 *
 * DELIBERATELY NOT A "FRAUD ENGINE"
 *   Four rules, each a count or a comparison against a configured limit, each
 *   carrying the numbers it used so a reviewer can check the work. No model, no
 *   score learned from data, no probability claim — the platform has no fraud
 *   training corpus and saying otherwise would be marketing. The `score` column
 *   is a fixed severity weight of the rule, not a prediction, and that is what
 *   `RULE_WEIGHTS` says.
 *
 *   A rule firing NEVER rejects a transaction by itself. Real money arrived;
 *   losing the record is worse than the risk of reviewing it. What a rule can do
 *   is make the transaction non-auto-postable (`blocking`) and put a named human
 *   on the case.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db, type DatabaseTransaction } from "@/db";
import { paymentRiskSignals, paymentTransactions } from "@/db/schema";
import { ID_PREFIX, newId } from "@/lib/ids";
import type { ResolvedPolicy } from "./config";

export const RISK_RULE_VERSION = "payment-risk-1.0.0";

/** Fixed weights. Not learned, not calibrated against a labelled population. */
export const RULE_WEIGHTS = {
  AMOUNT_OVER_POLICY: 0.9,
  DAILY_VOLUME_LIMIT: 0.8,
  DUPLICATE_AMOUNT_BURST: 0.7,
  COUNTERPARTY_VELOCITY: 0.6,
  UNMATCHED_HIGH_VALUE: 0.5,
} as const;

export type RiskSignalName = keyof typeof RULE_WEIGHTS;

export type RiskFinding = {
  id: string;
  signal: RiskSignalName;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  blocking: boolean;
  evidence: Record<string, unknown>;
};

export type RiskContext = {
  tenantId: string;
  legalEntityId: string;
  connectionId: string;
  transactionId: string;
  occurredAt: Date;
  amountMinor: number;
  currency: string;
  direction: "INBOUND" | "OUTBOUND";
  counterpartyDigest: string | null;
  policy: ResolvedPolicy | null;
  unmatchedHighValue: boolean;
  tx?: DatabaseTransaction;
};

export const UNMATCHED_HIGH_VALUE_FLOOR_MINOR = 1_000_000;

const BURST_WINDOW_MS = 15 * 60 * 1000;
const BURST_DUPLICATE_THRESHOLD = 3;
const VELOCITY_THRESHOLD = 5;
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function evaluateRisk(input: RiskContext): Promise<{ findings: RiskSignal[]; blocking: boolean }> {
  const handle = input.tx ?? db;
  const findings: RiskSignal[] = [];
  const since = new Date(input.occurredAt.getTime() - BURST_WINDOW_MS);
  const daySince = new Date(input.occurredAt.getTime() - DAILY_WINDOW_MS);

  // 1. Per-transaction ceiling from the governed policy.
  if (input.policy && input.amountMinor > input.policy.maxTransactionMinor) {
    findings.push({
      signal: "AMOUNT_OVER_POLICY",
      severity: "CRITICAL",
      score: RULE_WEIGHTS.AMOUNT_OVER_POLICY,
      blocking: true,
      evidence: {
        amountMinor: input.amountMinor,
        policyMaxTransactionMinor: input.policy.maxTransactionMinor,
        policyVersion: input.policy.policyVersion,
        currency: input.currency,
      },
    });
  }

  // 2. Rolling 24-hour volume, in the direction the limit governs.
  if (input.policy) {
    const limit =
      input.direction === "INBOUND"
        ? input.policy.dailyInboundLimitMinor
        : input.policy.dailyOutboundLimitMinor;
    if (limit !== null && limit !== undefined) {
      const rows = await handle
        .select({ total: sql<number>`coalesce(sum("gross_minor"),0)::numeric` })
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.tenantId, input.tenantId),
            eq(paymentTransactions.connectionId, input.connectionId),
            eq(paymentTransactions.direction, input.direction),
            gte(paymentTransactions.occurredAt, daySince),
            lt(paymentTransactions.occurredAt, new Date(input.occurredAt.getTime() + 1)),
          ),
        );
      const observedMinor = Number(rows[0]?.total ?? 0);
      if (observedMinor > limit) {
        findings.push({
          signal: "DAILY_VOLUME_LIMIT",
          severity: "HIGH",
          score: RULE_WEIGHTS.DAILY_VOLUME_LIMIT,
          blocking: true,
          evidence: {
            windowHours: 24,
            observedGrossMinor: observedMinor,
            dailyLimitMinor: limit,
            currency: input.currency,
            policyVersion: input.policy.policyVersion,
            note: "Rolling 24h from the occurred time, not a calendar day: the cut-off timezone for a daily limit is an unratified policy choice.",
          },
        });
      }
    }
  }

  // 3. Same counterparty, same amount, tight window.
  if (input.counterpartyDigest) {
    const dupes = await handle
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, input.tenantId),
          eq(paymentTransactions.connectionId, input.connectionId),
          eq(paymentTransactions.counterpartyDigest, input.counterpartyDigest),
          eq(paymentTransactions.grossMinor, String(input.amountMinor)),
          gte(paymentTransactions.occurredAt, since),
        ),
      );
    const n = Number(dupes[0]?.n ?? 0);
    if (n >= BURST_DUPLICATE_THRESHOLD) {
      findings.push({
        signal: "DUPLICATE_AMOUNT_BURST",
        severity: "HIGH",
        score: RULE_WEIGHTS.DUPLICATE_AMOUNT_BURST,
        blocking: true,
        evidence: {
          matchingCount: n,
          windowMinutes: BURST_WINDOW_MS / 60000,
          amountMinor: input.amountMinor,
          threshold: BURST_DUPLICATE_THRESHOLD,
          note: "Counts rows including this one. Provider retries are deduplicated upstream, so a hit here is not a replay artefact.",
        },
      });
    }

    const velocity = await handle
      .select({ n: sql<number>`count(*)::int` })
      .from(paymentTransactions)
      .where(
        and(
          eq(paymentTransactions.tenantId, input.tenantId),
          eq(paymentTransactions.connectionId, input.connectionId),
          eq(paymentTransactions.counterpartyDigest, input.counterpartyDigest),
          gte(paymentTransactions.occurredAt, since),
        ),
      );
    const vn = Number(velocity[0]?.n ?? 0);
    if (vn >= VELOCITY_THRESHOLD) {
      findings.push({
        signal: "COUNTERPARTY_VELOCITY",
        severity: "MEDIUM",
        score: RULE_WEIGHTS.COUNTERPARTY_VELOCITY,
        blocking: false,
        evidence: {
          eventCount: vn,
          windowMinutes: BURST_WINDOW_MS / 60000,
          threshold: VELOCITY_THRESHOLD,
          note: "Review signal only. Velocity alone never blocks: a busy market day is not fraud.",
        },
      });
    }
  }

  // 4. Large money nobody has attributed.
  if (input.unmatchedHighValue && input.amountMinor >= UNMATCHED_HIGH_VALUE_FLOOR_MINOR) {
    findings.push({
      signal: "UNMATCHED_HIGH_VALUE",
      severity: "HIGH",
      score: RULE_WEIGHTS.UNMATCHED_HIGH_VALUE,
      blocking: true,
      evidence: {
        amountMinor: input.amountMinor,
        floorMinor: UNMATCHED_HIGH_VALUE_FLOOR_MINOR,
        note: "The floor is a fixed programme constant, not a configured policy value; configuring it is an outstanding decision.",
      },
    });
  }

  const persisted: RiskSignal[] = [];
  for (const f of findings) {
    const id = newId(ID_PREFIX.paymentRiskSignal);
    await handle.insert(paymentRiskSignals).values({
      id,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      transactionId: input.transactionId,
      signal: f.signal,
      severity: f.severity,
      score: String(f.score),
      evidence: f.evidence as Record<string, never>,
      disposition: f.blocking ? "BLOCKED" : "OPEN",
      ruleVersion: RISK_RULE_VERSION,
    });
    persisted.push({ ...f, id });
  }

  return { findings: persisted, blocking: persisted.some((f) => f.blocking) };
}

export type RiskSignal = { id?: string } & Omit<RiskFinding, "id">;
