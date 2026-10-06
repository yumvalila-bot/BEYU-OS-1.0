/**
 * BEYU OS — Noelia enterprise intelligence tools (§26).
 *
 * FINANCE intelligence, PRICING, PRIVATE CAPITAL, CAPITAL FORMATION and HCM COMPENSATION capability
 * for Noelia — the SAME canonical Noelia, extended with domain tools. This is not a second AI, a
 * second tool registry or a second authorization path: every tool below is declared to the one
 * `NoeliaToolRegistry`, is gated by a canonical `PermissionCode`, runs inside the caller's
 * RLS-scoped transaction, and is audited by the existing tool-invocation audit.
 *
 * WHAT NOELIA MAY DO HERE
 *   · report a metric that the engine computed, WITH its provenance (state, method, inputs, source,
 *     calculation version);
 *   · report a refusal — MISSING, NOT APPLICABLE, INVALID — as faithfully as a value;
 *   · read fund and capital positions inside the pinned tenant scope and aggregate them by origin;
 *   · explain a markup, a margin, a discount impact and a break-even.
 *
 * WHAT NOELIA MAY NOT DO HERE, AND WHY THERE IS NO TOOL FOR IT
 *   · approve, sign, or clear an approval stage (approval is a human authority; `assertNoSelfApproval`
 *     has no Noelia entry point);
 *   · post to the ledger (CAP_POSTING remains LOCKED and has no tool path);
 *   · invent a figure that was not supplied or read from the governed tables — a missing input is
 *     reported as MISSING, never estimated into a plausible number;
 *   · bypass RLS, tenant scope, classification or the entity scope of the principal.
 *
 * Every tool declares `sideEffects: "NONE"`, is idempotent, scoped to the caller's entity restrictions,
 * and is read-only or pure computation. A `DOMAIN_WRITE` capability would need its own governed
 * approval contract and is deliberately absent here.
 */
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import * as s from "@/db/schema";
import { db, hasDatabaseTransactionContext } from "@/db";
import type { NoeliaToolRegistry } from "./tool-registry";
import { noeliaToolOutputSchema } from "./default-tools";
import type { NoeliaFinding, NoeliaSource, ToolInvocationContext } from "./types";
import type { MetricSeedBase } from "@/lib/finance/intelligence/provenance";
import { canonicalStatus } from "@/lib/noelia/epistemics";
import type { NoeliaEpistemicStatus } from "@/lib/constants";
import { valueOrNull } from "@/lib/finance/intelligence/provenance";
import { marketCapitalization, priceEarnings } from "@/lib/finance/intelligence/metrics";
import { assumptionFingerprint } from "@/lib/finance/intelligence/valuation";
import { classifyCapitalOrigin } from "@/lib/finance/private-capital/entrusted";
import { discountImpact, marginRate, markupRate } from "@/lib/pricing/costing";


/**
 * The metric engine's data state, expressed in Noelia's canonical epistemic catalogue.
 *
 * The two vocabularies are deliberately not merged: the engine's states are the DATA CONTRACT, and
 * Noelia's statuses are the PRESENTATION contract. This mapping is the single translation point —
 * MISSING becomes UNAVAILABLE (never a zero), ESTIMATED becomes INFERENCE (an estimate is an
 * inference), and INVALID becomes UNCERTAINTY (an unresolved conflict, not a value).
 */
const METRIC_STATE_TO_BASIS: Readonly<Record<string, string>> = {
  VERIFIED: "OBSERVED",
  CALCULATED: "DERIVED",
  ESTIMATED: "ASSUMPTION",
  FORECAST: "FORECAST",
  MISSING: "DATA_NOT_AVAILABLE",
  NOT_APPLICABLE: "DATA_NOT_AVAILABLE",
  INVALID: "DATA_CONFLICT",
};

function noeliaStatus(state: string): NoeliaEpistemicStatus {
  return canonicalStatus(METRIC_STATE_TO_BASIS[state] ?? state);
}

const AUDIT = { event: "NOELIA_TOOL_INVOKED", objectType: "AI_DECISION" } as const;
const ENVELOPE = z.object({ question: z.string().optional() }).passthrough().optional();

function requireContext(): void {
  if (!hasDatabaseTransactionContext()) {
    // A tool must never read outside the caller's RLS-scoped transaction. Without it, the query would
    // execute with no tenant GUC and the RLS policies would return nothing — or worse, if some future
    // role could bypass RLS, everything.
    throw new Error("Enterprise intelligence tools require canonical tenant context");
  }
}

/** Every partial figure the caller did not supply is reported as MISSING — never as zero. */
function missingInputFinding(label: string): NoeliaFinding {
  return { label, value: "MISSING — not supplied and not read from a governed source", kind: "FACT", status: noeliaStatus("MISSING") };
}

function seedFrom(context: ToolInvocationContext, subjectType: string, subjectId: string): MetricSeedBase {
  return {
    subject: { subjectType: subjectType as MetricSeedBase["subject"]["subjectType"], subjectId },
    dataTimestamp: new Date().toISOString(),
    nextId: () => `NOELIA-${context.traceId ?? "trace"}-${subjectId}`,
  };
}

export function registerEnterpriseIntelligenceTools(registry: NoeliaToolRegistry): void {
  /* ------------------------------------------------------------------ */
  /* Finance Intelligence — metrics                                      */
  /* ------------------------------------------------------------------ */

  registry.register({
    name: "finance.intelligence.market_capitalization",
    permission: "finance:intelligence.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Compute market capitalisation from a supplied share price and share count, with full provenance. Refuses to compute when either figure is missing, and never substitutes zero.",
    metadata: {
      stableId: "cap-finance-intelligence-market-cap",
      version: "1.0.0",
      ownerRole: "INVESTMENT_OFFICER",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: z
        .object({
          priceMinorPerShare: z.number().int().nonnegative().nullable().optional(),
          sharesOutstanding: z.number().int().nonnegative().nullable().optional(),
          currency: z.string().length(3).optional(),
          asOf: z.string().optional(),
          question: z.string().optional(),
        })
        .passthrough(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      const parsed = z
        .object({
          priceMinorPerShare: z.number().int().nonnegative().nullable().optional(),
          sharesOutstanding: z.number().int().nonnegative().nullable().optional(),
          currency: z.string().length(3).optional(),
          asOf: z.string().optional(),
        })
        .passthrough()
        .parse(input ?? {});
      const findings: NoeliaFinding[] = [];
      if (parsed.priceMinorPerShare === null || parsed.priceMinorPerShare === undefined) findings.push(missingInputFinding("Share price"));
      if (parsed.sharesOutstanding === null || parsed.sharesOutstanding === undefined) findings.push(missingInputFinding("Shares outstanding"));
      if (findings.length > 0) {
        return {
          headline: "Market capitalisation not available",
          narrative:
            "Market capitalisation requires both a share price and a share count. A missing figure is reported as MISSING — treating it as zero would understate the company by its entire equity value.",
          findings,
          humanReviewRequired: false,
        };
      }
      const outcome = marketCapitalization({
        seed: seedFrom(context, "SECURITY", context.target.tenantId),
        sharePrice: { amountMinorPerShare: parsed.priceMinorPerShare ?? null, source: "caller-supplied price", currency: parsed.currency ?? null },
        sharesOutstanding: { shares: parsed.sharesOutstanding ?? null, source: "caller-supplied share count" },
        currency: parsed.currency ?? null,
        asOf: parsed.asOf ?? null,
      });
      if (outcome.kind === "ABSENT") {
        return { headline: "Market capitalisation not available", narrative: outcome.reason, findings: [{ label: "State", value: outcome.state, kind: "FACT", status: noeliaStatus(outcome.state) }] };
      }
      return {
        headline: `Market capitalisation ${outcome.value}`,
        narrative: `Calculated as ${outcome.provenance.method}. Calculation version ${outcome.provenance.calculationVersion}; state ${outcome.state}.`,
        metrics: [
          {
            code: outcome.provenance.metricCode,
            label: "Market capitalisation (minor units)",
            value: String(outcome.value),
            status: noeliaStatus(outcome.state),
            confidence: null,
            source: "caller-supplied price and share count",
            period: parsed.asOf ?? null,
            trend: "UNKNOWN" as const,
          },
        ],
        findings: [{ label: "Method", value: outcome.provenance.method, kind: "FACT", status: noeliaStatus(outcome.state), provenance: outcome.provenance.calculationVersion }],
      };
    },
  });

  registry.register({
    name: "finance.intelligence.price_earnings",
    permission: "finance:intelligence.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Compute a trailing or forward P/E from a supplied price and EPS. A zero or negative EPS returns NOT AVAILABLE — never a negative or infinite multiple.",
    metadata: {
      stableId: "cap-finance-intelligence-pe",
      version: "1.0.0",
      ownerRole: "INVESTMENT_OFFICER",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 5000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: z
        .object({
          priceMinorPerShare: z.number().int().nonnegative().nullable().optional(),
          earningsPerShareMinor: z.number().int().nullable().optional(),
          basis: z.enum(["TRAILING", "FORWARD"]).optional(),
          question: z.string().optional(),
        })
        .passthrough(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      const parsed = z
        .object({
          priceMinorPerShare: z.number().int().nonnegative().nullable().optional(),
          earningsPerShareMinor: z.number().int().nullable().optional(),
          basis: z.enum(["TRAILING", "FORWARD"]).optional(),
        })
        .passthrough()
        .parse(input ?? {});
      const outcome = priceEarnings({
        seed: seedFrom(context, "SECURITY", context.target.tenantId),
        sharePrice: { amountMinorPerShare: parsed.priceMinorPerShare ?? null, source: "caller-supplied price" },
        earningsPerShare: { amountMinorPerShare: parsed.earningsPerShareMinor ?? null, source: "caller-supplied earnings" },
        basis: parsed.basis ?? "TRAILING",
      });
      const value = valueOrNull(outcome);
      if (outcome.kind === "ABSENT") {
        return {
          headline: "Price/earnings multiple not available",
          narrative: outcome.reason,
          findings: [{ label: "State", value: outcome.state, kind: "FACT", status: noeliaStatus(outcome.state) }],
        };
      }
      return {
        headline: `P/E ${(value ?? 0) / 1_000_000}`,
        narrative: `Scaled multiple (10^6 fixed point) ${value}. Method: ${outcome.provenance.method}. A negative or zero EPS is reported as NOT AVAILABLE rather than as a multiple.`,
        metrics: [
          {
            code: outcome.provenance.metricCode,
            label: "Price/earnings (scaled by 10^6)",
            value: String(value),
            status: noeliaStatus(outcome.state),
            confidence: null,
            source: "caller-supplied price and EPS",
            period: null,
            trend: "UNKNOWN" as const,
          },
        ],
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Private capital positions (read-only, tenant-scoped)                 */
  /* ------------------------------------------------------------------ */

  registry.register({
    name: "finance.private_capital.fund_positions",
    permission: "finance:privatecapital.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description:
      "Summarise the authorised private-capital positions visible to the caller: commitments, paid-in, distributed and unrealised per fund, with DPI/TVPI/RVPI computed by the governed engine. Read-only; no approval and no posting.",
    metadata: {
      stableId: "cap-finance-private-capital-positions",
      version: "1.0.0",
      ownerRole: "INVESTMENT_OFFICER",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 9000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      const rows = await db
        .select({
          fundId: s.privateFunds.id,
          fundName: s.privateFunds.name,
          strategy: s.privateFunds.strategy,
          currency: s.privateFunds.currency,
          commitment: sql<string>`coalesce(sum(${s.privateFundParticipants.commitmentMinor}), 0)`,
          paidIn: sql<string>`coalesce(sum(${s.privateFundParticipants.paidInMinor}), 0)`,
          distributed: sql<string>`coalesce(sum(${s.privateFundParticipants.distributedMinor}), 0)`,
          unrealized: sql<string>`coalesce(sum(${s.privateFundParticipants.unrealizedMinor}), 0)`,
        })
        .from(s.privateFunds)
        .leftJoin(s.privateFundParticipants, eq(s.privateFundParticipants.fundId, s.privateFunds.id))
        .where(eq(s.privateFunds.tenantId, context.target.tenantId))
        .groupBy(s.privateFunds.id, s.privateFunds.name, s.privateFunds.strategy, s.privateFunds.currency);

      if (rows.length === 0) {
        return {
          headline: "No private-capital positions in scope",
          narrative: "No fund is recorded in the caller's authorised scope. Absence of data is reported as absence — not as a zero position.",
          findings: [missingInputFinding("Private capital funds")],
        };
      }

      const findings: NoeliaFinding[] = rows.map((row) => {
        const paidIn = Number(row.paidIn);
        const distributed = Number(row.distributed);
        const unrealized = Number(row.unrealized);
        const dpi = paidIn > 0 ? distributed / paidIn : null;
        const rvpi = paidIn > 0 ? unrealized / paidIn : null;
        return {
          label: `${row.fundName} (${row.strategy}, ${row.currency})`,
          value: `Committed ${row.commitment} · paid-in ${row.paidIn} · distributed ${row.distributed} · unrealised ${row.unrealized} · DPI ${dpi === null ? "NOT AVAILABLE" : dpi.toFixed(4)} · RVPI ${rvpi === null ? "NOT AVAILABLE" : rvpi.toFixed(4)}`,
          kind: "FACT" as const,
          status: noeliaStatus(unrealized > 0 ? "ESTIMATED" : "CALCULATED"),
        };
      });
      findings.push({
        label: "Unrealised value",
        value: "RVPI and any total-value figure that includes unrealised marks are ESTIMATES, because an unrealised holding has not been sold.",
        kind: "FACT",
        status: noeliaStatus("ESTIMATED"),
      });
      const sources: NoeliaSource[] = [{ kind: "TABLE", ref: "private_fund_participants", label: "Fund participant capital accounts", authority: "FINANCE_OS" }];
      return { headline: `${rows.length} private-capital fund(s) in scope`, narrative: "Read live from the governed capital-account register inside the caller's tenant scope.", findings, sources };
    },
  });

  registry.register({
    name: "finance.capital_formation.positions_by_origin",
    permission: "finance:capitalformation.read",
    classification: "HIGHLY_RESTRICTED",
    risk: "LOW",
    description:
      "Report BEYU's own, fiduciary, project and guaranteed capital SEPARATELY. There is deliberately no combined total: entrusted capital is not BEYU's capital, and summing the two would misstate both.",
    metadata: {
      stableId: "cap-finance-capital-formation-origins",
      version: "1.0.0",
      ownerRole: "GROUP_CFO",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 9000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      const rows = await db
        .select({
          instrument: s.entrustedCapitalArrangements.instrument,
          currency: s.entrustedCapitalArrangements.currency,
          commitment: sql<string>`coalesce(sum(${s.entrustedCapitalArrangements.commitmentMinor}), 0)`,
          drawn: sql<string>`coalesce(sum(${s.entrustedCapitalArrangements.drawnMinor}), 0)`,
        })
        .from(s.entrustedCapitalArrangements)
        .where(and(eq(s.entrustedCapitalArrangements.tenantId, context.target.tenantId)))
        .groupBy(s.entrustedCapitalArrangements.instrument, s.entrustedCapitalArrangements.currency);

      const byOrigin = new Map<string, { currency: string; commitmentMinor: number; drawnMinor: number }>();
      for (const row of rows) {
        const origin = classifyCapitalOrigin(row.instrument as never);
        const key = `${origin}:${row.currency}`;
        const bucket = byOrigin.get(key) ?? { currency: row.currency, commitmentMinor: 0, drawnMinor: 0 };
        bucket.commitmentMinor += Number(row.commitment);
        bucket.drawnMinor += Number(row.drawn);
        byOrigin.set(key, bucket);
      }

      const findings: NoeliaFinding[] = [...byOrigin.entries()].map(([key, bucket]) => {
        const [origin] = key.split(":");
        return {
          label: `${origin} capital (${bucket.currency})`,
          value: `Committed ${bucket.commitmentMinor} · drawn ${bucket.drawnMinor}`,
          kind: "FACT" as const,
          status: noeliaStatus("CALCULATED"),
        };
      });
      findings.push({
        label: "Combined total",
        value: "NOT AVAILABLE BY DESIGN — BEYU-owned and entrusted capital are different claims and are never summed.",
        kind: "FACT",
        status: noeliaStatus("NOT_APPLICABLE"),
      });
      return {
        headline: `Capital formation: ${byOrigin.size} origin/currency group(s) in scope`,
        narrative: "Origins are kept separate. A single combined figure would present money BEYU manages as money BEYU owns.",
        findings,
        sources: [{ kind: "TABLE", ref: "entrusted_capital_arrangements", label: "Capital formation register", authority: "FINANCE_OS" }],
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* Pricing — markup vs margin and discount impact                       */
  /* ------------------------------------------------------------------ */

  registry.register({
    name: "pricing.markup_margin.analyse",
    permission: "pricing:read",
    classification: "INTERNAL",
    risk: "LOW",
    description:
      "Explain markup and margin for a supplied unit cost and price, and the profit and margin erosion of a discount. Markup is profit/cost; margin is profit/revenue — never conflated.",
    metadata: {
      stableId: "cap-pricing-markup-margin",
      version: "1.0.0",
      ownerRole: "SECTOR_OPERATOR",
      domain: "PRICING",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 5000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: z
        .object({
          unitCostMinor: z.number().int().nonnegative(),
          listPriceMinor: z.number().int().nonnegative(),
          discountBps: z.number().int().min(0).max(9999).optional(),
          quantity: z.number().int().positive().optional(),
          question: z.string().optional(),
        })
        .passthrough(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (_context: ToolInvocationContext, input: unknown) => {
      const parsed = z
        .object({
          unitCostMinor: z.number().int().nonnegative(),
          listPriceMinor: z.number().int().nonnegative(),
          discountBps: z.number().int().min(0).max(9999).optional(),
          quantity: z.number().int().positive().optional(),
        })
        .passthrough()
        .parse(input ?? {});
      const profit = parsed.listPriceMinor - parsed.unitCostMinor;
      const markup = markupRate(parsed.unitCostMinor, profit);
      const margin = marginRate(parsed.listPriceMinor, profit);
      const findings: NoeliaFinding[] = [
        {
          label: "Markup",
          value: markup === null ? "NOT AVAILABLE — cost is zero, so markup is undefined (not zero)" : `${(markup / 100).toFixed(2)}% (profit ÷ cost)`,
          kind: "FACT",
          status: noeliaStatus(markup === null ? "NOT_APPLICABLE" : "CALCULATED"),
        },
        {
          label: "Margin",
          value: margin === null ? "NOT AVAILABLE — price is zero, so margin is undefined (not zero)" : `${(margin / 100).toFixed(2)}% (profit ÷ revenue)`,
          kind: "FACT",
          status: noeliaStatus(margin === null ? "NOT_APPLICABLE" : "CALCULATED"),
        },
      ];
      if (parsed.discountBps) {
        const impact = discountImpact({
          unitCostMinor: parsed.unitCostMinor,
          listPriceMinor: parsed.listPriceMinor,
          discountBps: parsed.discountBps,
          quantity: parsed.quantity ?? 1,
        });
        findings.push({
          label: `Discount of ${(parsed.discountBps / 100).toFixed(2)}%`,
          value: `Price becomes ${impact.discountedPriceMinor}; margin falls from ${impact.listMarginBps ?? "NOT AVAILABLE"} bps to ${impact.discountedMarginBps ?? "NOT AVAILABLE"} bps; profit retained ${impact.profitRetentionBps ?? "NOT AVAILABLE"} bps.`,
          kind: "FACT",
          status: noeliaStatus("CALCULATED"),
        });
      }
      return {
        headline: `Cost ${parsed.unitCostMinor} · price ${parsed.listPriceMinor}`,
        narrative:
          "Markup and margin are different numbers on the same trade. 100 cost and 125 price is a 25% markup and a 20% margin; reporting either as the other overstates the business by five percentage points.",
        findings,
      };
    },
  });

  /* ------------------------------------------------------------------ */
  /* HCM compensation — entitlements, never approval                      */
  /* ------------------------------------------------------------------ */

  registry.register({
    name: "hcm.compensation.entitlement_summary",
    permission: "compensation:read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Summarise the compensation entitlements visible to the caller by kind and status, and report compensation cost SEPARATELY from receivable treatments such as employee loans. Read-only: Noelia can never approve, clear an approval stage, or release a payment.",
    metadata: {
      stableId: "cap-hcm-compensation-summary",
      version: "1.0.0",
      ownerRole: "HCM_DIRECTOR",
      domain: "HCM",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 9000,
      retryPolicy: { maxRetries: 1, backoffMs: 200 },
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: ENVELOPE,
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext) => {
      requireContext();
      const rows = await db
        .select({
          kind: s.compensationEntitlements.kind,
          status: s.compensationEntitlements.status,
          treatment: s.compensationEntitlements.financialTreatment,
          currency: s.compensationEntitlements.currency,
          total: sql<string>`coalesce(sum(${s.compensationEntitlements.amountMinor}), 0)`,
          count: sql<number>`count(*)::int`,
        })
        .from(s.compensationEntitlements)
        .where(eq(s.compensationEntitlements.tenantId, context.target.tenantId))
        .groupBy(
          s.compensationEntitlements.kind,
          s.compensationEntitlements.status,
          s.compensationEntitlements.financialTreatment,
          s.compensationEntitlements.currency,
        );

      if (rows.length === 0) {
        return {
          headline: "No compensation entitlements in scope",
          narrative: "No entitlement is recorded in the caller's authorised scope. Absence is reported as absence.",
          findings: [missingInputFinding("Compensation entitlements")],
        };
      }

      const findings: NoeliaFinding[] = rows.map((row) => ({
        label: `${row.kind} · ${row.status} · ${row.currency}`,
        value: `${row.total} across ${row.count} entitlement(s), financial treatment ${row.treatment}`,
        kind: "FACT" as const,
        status: noeliaStatus(row.status === "PAID" ? "VERIFIED" : "CALCULATED"),
      }));
      const receivable = rows.filter((r) => r.treatment === "LOAN_ADVANCE").reduce((a, r) => a + Number(r.total), 0);
      const pending = rows.filter((r) => r.status === "DRAFT" || r.status === "PENDING").reduce((a, r) => a + Number(r.total), 0);
      findings.push({
        label: "Boundaries",
        value: `Receivable treatments (employee loans and advances) total ${receivable} and are NOT compensation cost. Entitlements not yet approved total ${pending} and are included in no cost figure. Noelia cannot approve an entitlement, clear an approval stage, or release a payment.`,
        kind: "FACT",
        status: noeliaStatus("CALCULATED"),
      });
      return {
        headline: `${new Set(rows.map((r) => r.kind)).size} entitlement kind(s) in scope`,
        narrative: "Read live from the entitlement register inside the caller's tenant scope; approval authority remains with human roles.",
        findings,
        sources: [{ kind: "TABLE", ref: "compensation_entitlements", label: "HCM compensation entitlements", authority: "HCM capability" }],
      };
    },
  });

  registry.register({
    name: "finance.valuation.assumption_fingerprint",
    permission: "finance:valuation.read",
    classification: "CONFIDENTIAL",
    risk: "LOW",
    description:
      "Report the stable fingerprint of a valuation assumption set, so a run can be compared with another only when their assumptions genuinely match. Pure computation; nothing is persisted.",
    metadata: {
      stableId: "cap-finance-valuation-fingerprint",
      version: "1.0.0",
      ownerRole: "INVESTMENT_OFFICER",
      domain: "FINANCE",
      sideEffects: "NONE",
      idempotent: true,
      timeoutMs: 4000,
      retryPolicy: null,
      jurisdictionRestrictions: null,
      entityRestrictions: "SCOPED",
      approvalRequirements: null,
      auditRequirements: AUDIT,
      inputSchema: z
        .object({
          modelId: z.string().min(1),
          version: z.number().int().positive(),
          assumptions: z.array(
            z.object({
              key: z.string().min(1),
              value: z.string(),
              unit: z.string().min(1),
              kind: z.enum(["OBSERVED", "DERIVED", "ASSUMPTION", "POLICY"]),
              source: z.string().min(1),
              sourceTimestamp: z.string().nullable().optional(),
            }),
          ),
          question: z.string().optional(),
        })
        .passthrough(),
      outputSchema: noeliaToolOutputSchema,
    },
    execute: async (context: ToolInvocationContext, input: unknown) => {
      const parsed = z
        .object({
          modelId: z.string().min(1),
          version: z.number().int().positive(),
          scenarioKind: z.enum(["BASE", "UPSIDE", "DOWNSIDE", "CUSTOM"]).optional(),
          authoredBy: z.string().min(1).optional(),
          authoredAt: z.string().optional(),
          rationale: z.string().nullable().optional(),
          assumptions: z.array(
            z.object({
              key: z.string().min(1),
              value: z.string(),
              unit: z.string().min(1),
              kind: z.enum(["OBSERVED", "DERIVED", "ASSUMPTION", "POLICY"]),
              source: z.string().min(1),
              sourceTimestamp: z.string().nullable().optional(),
            }),
          ),
        })
        .passthrough()
        .parse(input ?? {});
      const fingerprint = assumptionFingerprint({
        modelId: parsed.modelId,
        version: parsed.version,
        scenarioKind: parsed.scenarioKind ?? "BASE",
        authoredBy: parsed.authoredBy ?? context.principal.userId,
        authoredAt: parsed.authoredAt ?? new Date().toISOString(),
        rationale: parsed.rationale ?? null,
        assumptions: parsed.assumptions,
      });
      return {
        headline: `Assumption fingerprint ${fingerprint}`,
        narrative:
          "Two valuation runs may be compared only when their fingerprints match. A changed assumption changes the fingerprint, which is how an unexplained assumption change becomes visible rather than silent.",
        findings: [{ label: "Fingerprint", value: fingerprint, kind: "FACT", status: noeliaStatus("CALCULATED") }],
      };
    },
  });
}
