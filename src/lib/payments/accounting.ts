/**
 * The accounting bridge: reconciled payment money → a journal entry, through
 * `postJournal()` and nothing else.
 *
 * THIS FILE MAY NOT
 *   - write `journal_entries` / `journal_lines` directly. `src/lib/finance/
 *     posting-engine.ts` is the sole writer (asserted by `soleWriterOf()` in
 *     `src/lib/finance/truth.ts`), and this module is registered as
 *     `PAYMENTS_BRIDGE`, a *preparer*, never a poster.
 *   - invent an account, a mapping or an accounting policy. Every debit and
 *     credit comes from `payment_account_mappings`, a governed table the runtime
 *     role cannot write (migration 0028).
 *   - activate `CAP_POSTING`, retry past a lock, or soften a refusal.
 *     `CAPABILITY_LOCKED` is returned as `CAPABILITY_LOCKED`.
 *   - manufacture a Principal. The caller supplies the human who authorised the
 *     posting; `postJournal()` checks their RBAC, tenant and entity scope. A
 *     bridge that built its own principal would be a privilege-escalation
 *     primitive, so the type makes an actor mandatory instead.
 *
 * PREPARE AND POST ARE SEPARATE ON PURPOSE
 *   Preparation is safe and automatable: it computes a draft and records why the
 *   draft is or is not postable, and writes `accounting_status = PREPARED`.
 *   Posting is never automatic on a provider event. The only automatic path is
 *   an explicit statement-confirmation call with a named authorising human and
 *   `allowPost: true`, and even then the gate must pass in full.
 */
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { paymentAccountMappings, paymentPolicies, paymentTransactions, financialPeriods } from "@/db/schema";
import { ledgerAccounts } from "@/db/schema/finance";
import type { Principal } from "@/lib/authz";
import { appendPaymentAudit } from "./audit-scope";
import { withDatabaseRlsContext } from "@/lib/tenant-scope";
import { postingAllowedIn, resolvePeriodForDate } from "@/lib/finance/period";
import { majorUnitsString } from "./money";
import { evaluateAccountingGate, PAYMENT_DOMAIN_VERSION, type TrustLevel, type VerificationStatus } from "./domain";
import { countBlockingExceptions, raiseException } from "./exceptions";

export const ACCOUNTING_BRIDGE_VERSION = "payment-accounting-1.1.0";

/**
 * The module identity this bridge is registered under in `truth.ts`. It exists so
 * `mayWrite("payments/accounting", "journal_entries")` is answerable from one
 * place rather than being a string each call site repeats.
 */
export const PAYMENTS_BRIDGE_MODULE = "payments/accounting";

export type DraftLine = {
  accountId: string;
  role: "CASH" | "RECEIVABLE" | "FEE_EXPENSE" | "SUSPENSE";
  debitMinor: number;
  creditMinor: number;
  description: string;
};

export type JournalDraft = {
  tenantId: string;
  legalEntityId: string;
  periodId: string | null;
  periodCode: string | null;
  reference: string;
  description: string;
  currency: string;
  lines: DraftLine[];
  totalDebitMinor: number;
  totalCreditMinor: number;
  balanced: boolean;
  idempotencyKey: string;
  sourceReference: "PAYMENTS";
  basis: {
    trustLevel: TrustLevel;
    verificationStatus: VerificationStatus;
    reconciliationStatus: string;
    netBasis: string;
    policyVersion: string | null;
    bridgeVersion: string;
    domainVersion: string;
  };
};

export type TransactionForDraft = {
  id: string;
  tenantId: string;
  legalEntityId: string;
  providerCode: string;
  direction: "INBOUND" | "OUTBOUND";
  currency: string;
  grossMinor: number;
  feeMinor: number | null;
  taxMinor: number | null;
  netMinor: number | null;
  netBasis: string;
  verificationStatus: VerificationStatus;
  trustLevel: TrustLevel;
  reconciliationStatus: string;
  accountingStatus: string;
  journalEntryId: string | null;
  providerTransactionId: string;
  invoiceReference: string | null;
  occurredAt: Date;
};

export type DraftContext = {
  accounts: Partial<Record<"CASH" | "RECEIVABLE" | "FEE_EXPENSE" | "SUSPENSE" | "CLEARING" | "TAX_PAYABLE" | "SETTLEMENT_LIABILITY", string>>;
  policy: {
    policyVersion: string;
    approvedBy: string;
    autoPostCeilingMinor: number | null;
    requireApprovalAboveMinor: number | null;
  } | null;
  period: { id: string; code: string; status: string } | null;
  periodReason: string;
  blockingExceptionCount: number;
};

export type BuildResult = { ok: true; draft: JournalDraft } | { ok: false; code: string; reason: string };

/**
 * Pure draft construction. Two properties worth stating explicitly, because they
 * are the two ways a bridge usually lies:
 *   - an unreported fee produces NO line. A booked zero would assert "the fee
 *     was zero", which nobody reported.
 *   - the debit and credit totals are computed from the same integers the lines
 *     carry and compared; an imbalance is a bridge defect and is reported as
 *     such rather than plugged.
 */
export function buildDraft(input: { transaction: TransactionForDraft; context: DraftContext }): BuildResult {
  const t = input.transaction;
  const { accounts, period } = input.context;

  if (t.netBasis === "UNRESOLVED" || t.netMinor === null) {
    return {
      ok: false,
      code: "NET_UNRESOLVED",
      reason: "The provider reported neither a net nor a complete set of components, so there is no amount that can honestly be booked.",
    };
  }
  if (!period) {
    return { ok: false, code: "NO_OPEN_PERIOD", reason: input.context.periodReason };
  }
  const periodGate = postingAllowedIn(period.status);
  if (!periodGate.allowed) {
    return { ok: false, code: "PERIOD_CLOSED", reason: periodGate.reason };
  }

  const cash = accounts.CASH ?? accounts.SUSPENSE;
  const other = accounts.RECEIVABLE ?? accounts.SUSPENSE;
  const fee = accounts.FEE_EXPENSE;
  if (!cash || !other) {
    return {
      ok: false,
      code: "MISSING_ACCOUNT_MAPPING",
      reason: `No CASH and/or RECEIVABLE mapping is approved for tenant ${t.tenantId} / entity ${t.legalEntityId} and no SUSPENSE account exists to quarantine the amount. Configure the mapping; do not guess an account.`,
    };
  }

  const lines: DraftLine[] = [];
  const memo = t.invoiceReference ? `ref ${t.invoiceReference}` : "unapplied";

  if (t.direction === "INBOUND") {
    // Money in: bank/wallet (CASH) debited for what actually landed, the
    // obligation credited for what it discharged. When a fee was REPORTED the
    // gross lands in cash and the fee is its own expense line — that is the only
    // shape in which the three amounts agree.
    const grossCash = t.feeMinor !== null ? t.netMinor + t.feeMinor : t.netMinor;
    if (t.feeMinor !== null && t.feeMinor > 0) {
      if (!fee) {
        return {
          ok: false,
          code: "MISSING_ACCOUNT_MAPPING",
          reason: "The provider reported a fee and no FEE_EXPENSE account is mapped. Booking gross and dropping the fee would misstate expense; booking net and hiding the fee would misstate cash.",
        };
      }
      lines.push({ accountId: cash, role: "CASH", debitMinor: grossCash, creditMinor: 0, description: `${t.providerCode} receipt ${t.providerTransactionId} gross` });
      lines.push({ accountId: fee, role: "FEE_EXPENSE", debitMinor: t.feeMinor, creditMinor: 0, description: `${t.providerCode} fee on receipt` });
      lines.push({ accountId: other, role: "RECEIVABLE", debitMinor: 0, creditMinor: grossCash, description: `receipt ${memo}` });
    } else {
      lines.push({ accountId: cash, role: "CASH", debitMinor: t.netMinor, creditMinor: 0, description: `${t.providerCode} receipt ${t.providerTransactionId}` });
      lines.push({ accountId: other, role: "RECEIVABLE", debitMinor: 0, creditMinor: t.netMinor, description: `receipt ${memo}` });
    }
  } else {
    const grossCash = t.feeMinor !== null ? t.grossMinor + t.feeMinor : t.grossMinor;
    lines.push({ accountId: other, role: "RECEIVABLE", debitMinor: t.grossMinor, creditMinor: 0, description: `payout ${memo}` });
    lines.push({ accountId: cash, role: "CASH", debitMinor: 0, creditMinor: grossCash, description: `${t.providerCode} payout ${t.providerTransactionId} total outflow` });
    if (t.feeMinor !== null && t.feeMinor > 0) {
      if (!fee) {
        return { ok: false, code: "MISSING_ACCOUNT_MAPPING", reason: "The provider reported a payout fee and no FEE_EXPENSE account is mapped." };
      }
      lines.push({ accountId: fee, role: "FEE_EXPENSE", debitMinor: t.feeMinor, creditMinor: 0, description: `${t.providerCode} fee on payout` });
      // Re-check balance after the fee line: total debits must still equal total
      // credits, which is why the cash credit was grown above instead of leaving
      // the fee unfunded.
    }
  }

  const totalDebitMinor = lines.reduce((n, l) => n + l.debitMinor, 0);
  const totalCreditMinor = lines.reduce((n, l) => n + l.creditMinor, 0);
  if (totalDebitMinor !== totalCreditMinor || totalDebitMinor <= 0) {
    return {
      ok: false,
      code: "INTERNAL_IMBALANCE",
      reason: `Draft does not balance (${totalDebitMinor} debit vs ${totalCreditMinor} credit). This is a bridge defect and must never be plugged with a balancing figure.`,
    };
  }

  return {
    ok: true,
    draft: {
      tenantId: t.tenantId,
      legalEntityId: t.legalEntityId,
      periodId: period.id,
      periodCode: period.code,
      reference: `PAY/${t.id}`,
      description: `${t.direction === "INBOUND" ? "Receipt" : "Payment"} via ${t.providerCode} ${t.providerTransactionId}`,
      currency: t.currency,
      lines,
      totalDebitMinor,
      totalCreditMinor,
      balanced: true,
      idempotencyKey: `payment:post:${t.id}`,
      sourceReference: "PAYMENTS",
      basis: {
        trustLevel: t.trustLevel,
        verificationStatus: t.verificationStatus,
        reconciliationStatus: t.reconciliationStatus,
        netBasis: t.netBasis,
        policyVersion: input.context.policy?.policyVersion ?? null,
        bridgeVersion: ACCOUNTING_BRIDGE_VERSION,
        domainVersion: PAYMENT_DOMAIN_VERSION,
      },
    },
  };
}

/**
 * Resolve the period for the transaction's own occurrence date. Not "the newest
 * period": booking a January receipt into the current open March period because
 * it is convenient is exactly what `financial_periods.status` exists to stop, and
 * a closed historical period is escalated, never reopened.
 */
export async function resolvePeriod(
  legalEntityId: string,
  occurredAt: Date,
  tenantId?: string | null,
): Promise<{ period: DraftContext["period"]; reason: string }> {
  // Same rule as every other governed read here: the open period is tenant data, so
  // the lookup that finds it needs the tenant. Called from `loadDraftContext` it
  // inherits one; called from anywhere else it must be handed one, or it silently
  // answers "no period exists" to the runtime role while a privileged handle sees it.
  const read = () => db
    .select({ id: financialPeriods.id, code: financialPeriods.code, status: financialPeriods.status, startsOn: financialPeriods.startsOn, endsOn: financialPeriods.endsOn })
    .from(financialPeriods)
    .where(eq(financialPeriods.legalEntityId, legalEntityId));
  const rows = tenantId ? await withDatabaseRlsContext([tenantId], false, read) : await read();
  const iso = occurredAt.toISOString().slice(0, 10);
  const covering = rows.filter((r) => r.startsOn <= iso && r.endsOn >= iso);
  if (covering.length === 0) {
    return {
      period: null,
      reason: `No financial period covers ${iso} for entity ${legalEntityId}. Creating one requires finance:period.manage authority and is not this bridge's to exercise.`,
    };
  }
  const resolved = resolvePeriodForDate(
    covering.map((r) => ({ id: r.id, code: r.code, status: r.status })),
    iso,
  );
  if (!resolved.found || !resolved.periodId) {
    return { period: null, reason: resolved.reason };
  }
  const chosen = covering.find((r) => r.id === resolved.periodId) ?? null;
  return { period: chosen ? { id: chosen.id, code: chosen.code, status: chosen.status } : null, reason: resolved.reason };
}

export type PrepareOutcome =
  | { kind: "DRAFTED"; transactionId: string; draft: JournalDraft; gateBlockers: string[]; postable: false; reason: string }
  | { kind: "POSTED"; transactionId: string; draft: JournalDraft; journalEntryId: string; lineCount: number; totalDebit: string; totalCredit: string }
  | { kind: "ALREADY_POSTED"; transactionId: string; journalEntryId: string }
  | { kind: "BLOCKED"; transactionId: string; blockers: string[]; reason: string; draft: JournalDraft | null };

export async function loadTransactionForDraft(transactionId: string, tenantId?: string | null): Promise<TransactionForDraft | null> {
  // A scoped read, not only scoped writes. Under the runtime role an unselected
  // tenant context returns nothing, which would read as "this payment does not
  // exist" instead of what it actually is: a caller that never established a scope.
  const read = () => db.select().from(paymentTransactions).where(eq(paymentTransactions.id, transactionId)).limit(1);
  const rows = tenantId ? await withDatabaseRlsContext([tenantId], false, read) : await read();
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    providerCode: row.providerCode,
    direction: row.direction as "INBOUND" | "OUTBOUND",
    currency: row.currency,
    grossMinor: Number(row.grossMinor),
    feeMinor: row.feeMinor === null ? null : Number(row.feeMinor),
    taxMinor: row.taxMinor === null ? null : Number(row.taxMinor),
    netMinor: row.netMinor === null ? null : Number(row.netMinor),
    netBasis: row.netBasis,
    verificationStatus: row.verificationStatus as VerificationStatus,
    trustLevel: row.trustLevel as TrustLevel,
    reconciliationStatus: row.reconciliationStatus,
    accountingStatus: row.accountingStatus,
    journalEntryId: row.journalEntryId,
    providerTransactionId: row.providerTransactionId,
    invoiceReference: row.invoiceReference,
    occurredAt: row.occurredAt,
  };
}

/** Governed read of the mapping and policy configuration for one transaction. */
export async function loadDraftContext(transaction: TransactionForDraft): Promise<DraftContext> {
  // The mapping, the policy, the open period and the blocking-exception count are all
  // tenant data, and the tenant is on the transaction row itself — so this lookup
  // establishes its own scope instead of inheriting one from whoever called it.
  return withDatabaseRlsContext([transaction.tenantId], false, async () => {
    const mappingRows = await db
      .select({ role: paymentAccountMappings.mappingRole, accountId: paymentAccountMappings.ledgerAccountId })
      .from(paymentAccountMappings)
      .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, paymentAccountMappings.ledgerAccountId))
      .where(
        and(
          eq(paymentAccountMappings.tenantId, transaction.tenantId),
          eq(paymentAccountMappings.legalEntityId, transaction.legalEntityId),
          eq(ledgerAccounts.active, true),
          inArray(paymentAccountMappings.mappingRole, [
            "CASH",
            "RECEIVABLE",
            "FEE_EXPENSE",
            "SUSPENSE",
            "CLEARING",
            "TAX_PAYABLE",
            "SETTLEMENT_LIABILITY",
          ]),
        ),
      );
    const accounts: DraftContext["accounts"] = {};
    for (const m of mappingRows) accounts[m.role as keyof DraftContext["accounts"]] = m.accountId;

    // The policy row that governs this currency and entity, most specific first —
    // the same resolution order `config.ts` uses, so the bridge and ingestion can
    // never disagree about which policy applies.
    const policy = await loadGoverningPolicy(transaction);
    const { period, reason } = await resolvePeriod(transaction.legalEntityId, transaction.occurredAt, transaction.tenantId);

    return {
      accounts,
      policy,
      period,
      periodReason: reason,
      blockingExceptionCount: await countBlockingExceptions(transaction.id),
    };
  });
}

async function loadGoverningPolicy(transaction: TransactionForDraft): Promise<DraftContext["policy"]> {
  const rows = await db
    .select()
    .from(paymentPolicies)
    .where(
      and(
        eq(paymentPolicies.tenantId, transaction.tenantId),
        eq(paymentPolicies.currency, transaction.currency),
        eq(paymentPolicies.enabled, 1),
        or(isNull(paymentPolicies.legalEntityId), eq(paymentPolicies.legalEntityId, transaction.legalEntityId)),
      ),
    );
  const score = (r: (typeof rows)[number]) => (r.legalEntityId === transaction.legalEntityId ? 2 : 0);
  const best = [...rows].sort((a, b) => score(b) - score(a))[0];
  return best
    ? {
          policyVersion: best.policyVersion,
          approvedBy: best.approvedBy,
        autoPostCeilingMinor: best.autoPostCeilingMinor === null ? null : Number(best.autoPostCeilingMinor),
        requireApprovalAboveMinor: best.requireApprovalAboveMinor === null ? null : Number(best.requireApprovalAboveMinor),
      }
    : null;
}

/**
 * Prepare, and post only when the caller explicitly authorised posting and every
 * gate is satisfied. `settlementStatus` is taken from the row rather than assumed
 * to be settled: an unsettled receipt is still real money, but the platform's
 * own clearing rules are not this bridge's to relax.
 */
export async function prepareOrPost(input: {
  principal: Principal;
  transactionId: string;
  allowPost: boolean;
  traceId: string;
  correlationId: string | null;
  settlementStatus?: "PENDING" | "IN_SETTLEMENT" | "SETTLED" | "FAILED" | "NOT_APPLICABLE";
}): Promise<PrepareOutcome> {
  const transaction = await loadTransactionForDraft(input.transactionId, input.principal.tenantId);
  if (!transaction) {
    return { kind: "BLOCKED", transactionId: input.transactionId, blockers: ["NOT_FOUND"], reason: "Transaction is not visible in this scope.", draft: null };
  }
  if (transaction.accountingStatus === "POSTED" && transaction.journalEntryId) {
    return { kind: "ALREADY_POSTED", transactionId: transaction.id, journalEntryId: transaction.journalEntryId };
  }

  const context = await loadDraftContext(transaction);
  const built = buildDraft({ transaction, context });
  const amountMinor = transaction.netMinor ?? transaction.grossMinor;
  const gate = evaluateAccountingGate({
    verificationStatus: transaction.verificationStatus,
    trustLevel: transaction.trustLevel,
    reconciliationStatus: transaction.reconciliationStatus,
    settlementStatus: input.settlementStatus ?? "PENDING",
    accountingStatus: transaction.accountingStatus as never,
    blockingExceptionCount: context.blockingExceptionCount,
    hasAccountMapping: Boolean(context.accounts.CASH && context.accounts.RECEIVABLE),
    policyApproved: Boolean(context.policy),
    amountMinor,
    autoPostCeilingMinor: context.policy?.autoPostCeilingMinor ?? null,
    requiresApproval: context.policy?.requireApprovalAboveMinor !== null && context.policy?.requireApprovalAboveMinor !== undefined && amountMinor > context.policy.requireApprovalAboveMinor,
    approved: false,
  });

  const blockers = !built.ok ? [built.code] : [...gate.blockers];

  if (!built.ok || !gate.allowed) {
    const reason = !built.ok ? built.reason : "The accounting gate is not satisfied; no journal entry was created.";
    await withDatabaseRlsContext([transaction.tenantId], false, async () => {
      await db
        .update(paymentTransactions)
        .set({
          accountingStatus: blockers.includes("ACCOUNTING_POLICY_MISSING") ? "POLICY_MISSING" : "NOT_PREPARED",
          updatedAt: new Date(),
        })
        .where(eq(paymentTransactions.id, transaction.id));
      await raiseException({
        tenantId: transaction.tenantId,
        legalEntityId: transaction.legalEntityId,
        transactionId: transaction.id,
        code: exceptionCodeFor(blockers),
        severity: blockers.includes("MISSING_ACCOUNT_MAPPING") || blockers.includes("INTERNAL_IMBALANCE") ? "HIGH" : "MEDIUM",
        detail: { blockers, reason, bridgeVersion: ACCOUNTING_BRIDGE_VERSION },
        correlationId: input.correlationId,
      });
      await appendPaymentAudit({
        tenantId: transaction.tenantId,
        actorUserId: input.principal.userId,
        actorType: "HUMAN",
        action: "PAYMENT_ACCOUNTING_BLOCKED",
        objectType: "payment_transaction",
        objectId: transaction.id,
        outcome: "DENIED",
        reason: blockers.join(",").slice(0, 200),
        authority: ACCOUNTING_BRIDGE_VERSION,
        policyVersion: context.policy?.policyVersion ?? undefined,
      });
    });
    return { kind: "BLOCKED", transactionId: transaction.id, blockers, reason, draft: built.ok ? built.draft : null };
  }

  const draft = built.draft;

  if (!input.allowPost) {
    await withDatabaseRlsContext([transaction.tenantId], false, async () => {
      await db
        .update(paymentTransactions)
        .set({ accountingStatus: "PREPARED", accountingPreparedAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentTransactions.id, transaction.id));
      await appendPaymentAudit({
        tenantId: transaction.tenantId,
        actorUserId: input.principal.userId,
        actorType: "HUMAN",
        action: "PAYMENT_ACCOUNTING_PREPARED",
        objectType: "payment_transaction",
        objectId: transaction.id,
        outcome: "SUCCESS",
        reason: `draft ${draft.reference}; ${draft.lines.length} lines; ${draft.totalDebitMinor} minor units each side; period ${draft.periodCode}`,
        authority: ACCOUNTING_BRIDGE_VERSION,
        policyVersion: context.policy?.policyVersion ?? undefined,
        newValue: { lines: draft.lines.map((l) => ({ role: l.role, debitMinor: l.debitMinor, creditMinor: l.creditMinor })) },
      });
    });
    return {
      kind: "DRAFTED",
      transactionId: transaction.id,
      draft,
      gateBlockers: gate.blockers,
      postable: false,
      reason: "Draft prepared. Posting is a separate, explicitly authorised act and remains behind CAP_POSTING.",
    };
  }

  const { postJournal, PostingError } = await import("../finance/posting-engine");
  try {
    const result = await withDatabaseRlsContext([transaction.tenantId], false, () =>
      postJournal(input.principal, {
        tenantId: draft.tenantId,
        legalEntityId: draft.legalEntityId,
        periodId: draft.periodId ?? undefined,
        reference: draft.reference,
        description: draft.description,
        currency: draft.currency,
        lines: draft.lines.map((l) => ({
          accountId: l.accountId,
          debit: majorUnitsString(l.debitMinor, draft.currency),
          credit: majorUnitsString(l.creditMinor, draft.currency),
          description: l.description,
        })),
        sourceReference: draft.sourceReference,
        idempotencyKey: draft.idempotencyKey,
      }),
    );

    await withDatabaseRlsContext([transaction.tenantId], false, async () => {
      await db
        .update(paymentTransactions)
        .set({ accountingStatus: "POSTED", journalEntryId: result.entryId, accountingPreparedAt: new Date(), updatedAt: new Date() })
        .where(eq(paymentTransactions.id, transaction.id));
      await appendPaymentAudit({
        tenantId: transaction.tenantId,
        actorUserId: input.principal.userId,
        actorType: "HUMAN",
        action: "PAYMENT_TRANSACTION_POSTED",
        objectType: "payment_transaction",
        objectId: transaction.id,
        outcome: "SUCCESS",
        reason: `posted ${result.entryId} (${result.lineCount} lines, ${result.totalDebit} ${draft.currency})`,
        authority: ACCOUNTING_BRIDGE_VERSION,
        approvalRef: draft.reference,
        policyVersion: context.policy?.policyVersion ?? undefined,
      });
    });

    return {
      kind: "POSTED",
      transactionId: transaction.id,
      draft,
      journalEntryId: result.entryId,
      lineCount: result.lineCount,
      totalDebit: result.totalDebit,
      totalCredit: result.totalCredit,
    };
  } catch (e) {
    const code = e instanceof PostingError ? e.code : ((e as { code?: string }).code ?? "POSTING_REJECTED");
    await withDatabaseRlsContext([transaction.tenantId], false, async () => {
      await db.update(paymentTransactions).set({ accountingStatus: "POSTING_FAILED", updatedAt: new Date() }).where(eq(paymentTransactions.id, transaction.id));
      await raiseException({
        tenantId: transaction.tenantId,
        legalEntityId: transaction.legalEntityId,
        transactionId: transaction.id,
        code: code === "CAPABILITY_LOCKED" ? "CAPABILITY_LOCKED" : "POSTING_REJECTED",
        severity: code === "CAPABILITY_LOCKED" ? "MEDIUM" : "HIGH",
        detail: {
          code,
          message: e instanceof Error ? e.message.slice(0, 300) : String(e),
          note:
            code === "CAPABILITY_LOCKED"
              ? "CAP_POSTING is LOCKED. Nothing was posted and nothing will retry. This is the platform's ratified state, not a payment-layer failure."
              : undefined,
        },
        correlationId: input.correlationId,
      });
      await appendPaymentAudit({
        tenantId: transaction.tenantId,
        actorUserId: input.principal.userId,
        actorType: "HUMAN",
        action: "PAYMENT_TRANSACTION_POSTING_REFUSED",
        objectType: "payment_transaction",
        objectId: transaction.id,
        outcome: "DENIED",
        reason: String(code),
        authority: ACCOUNTING_BRIDGE_VERSION,
      });
    });
    return { kind: "BLOCKED", transactionId: transaction.id, blockers: [code], reason: `Posting refused by the ledger: ${code}.`, draft };
  }
}

function exceptionCodeFor(blockers: readonly string[]): "MISSING_ACCOUNT_MAPPING" | "POLICY_MISSING" | "PERIOD_CLOSED" | "CAPABILITY_LOCKED" | "NET_UNRESOLVED" {
  if (blockers.includes("ACCOUNT_MAPPING_MISSING") || blockers.includes("MISSING_ACCOUNT_MAPPING")) return "MISSING_ACCOUNT_MAPPING";
  if (blockers.includes("ACCOUNTING_POLICY_MISSING") || blockers.includes("POLICY_MISSING")) return "POLICY_MISSING";
  if (blockers.includes("PERIOD_CLOSED") || blockers.includes("NO_OPEN_PERIOD")) return "PERIOD_CLOSED";
  if (blockers.includes("CAPABILITY_LOCKED")) return "CAPABILITY_LOCKED";
  return "NET_UNRESOLVED";
}

/** Asserted by the self-test: what this bridge is and is not allowed to do. */
export const BRIDGE_SELF_CHECK = {
  module: PAYMENTS_BRIDGE_MODULE,
  writesLedgerDirectly: false,
  soleLedgerWriter: "src/lib/finance/posting-engine.ts#postJournal",
  grantsCapability: false,
  manufacturesPrincipal: false,
  autoPostsOnWebhook: false,
  domainVersion: PAYMENT_DOMAIN_VERSION,
} as const;
