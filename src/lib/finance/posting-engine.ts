/**
 * BEYU OS — Governed posting engine (Phase 7A).
 *
 * WHAT THIS IS. The single, canonical writer of journal entries and journal lines. No route, no
 * service and no AI path may construct ledger rows directly; everything goes through `postJournal`.
 *
 * THE LAYER SEPARATION THIS ENFORCES:
 *
 *     INTELLIGENCE  ->  GOVERNANCE  ->  EXECUTION
 *
 * This module is EXECUTION. It refuses to run until GOVERNANCE says the capability is activated,
 * and it never decides accounting policy itself.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It contains no accounting judgement whatsoever:
 *   - it does not decide which account to debit or credit (the caller supplies lines);
 *   - it does not decide a recognition basis, measurement rule, materiality threshold,
 *     capitalisation rule, FX rate, tax treatment or fiscal calendar;
 *   - it does not create a chart of accounts or a financial period.
 * Those are P1-P11, all unratified. This engine enforces only invariants that are
 * POLICY-INDEPENDENT — true of double-entry bookkeeping under any ratified policy:
 *   double entry balances, no negative amounts, no single-sided lines, entries must be scoped to
 *   one tenant and entity, accounts must exist, a closed period must not accept postings.
 *
 * AUTHORITY BINDING. Every call passes `requireCapability("CAP_POSTING")`, which resolves through
 * the Phase 6C activation gate: the governing decisions (P1, P6, P7, P9) must each verify as
 * ACTIVATED against a genuinely APPROVED resolution with GOVERNED provenance. None are ratified
 * today, so this engine is fully implemented, fully tested, and CANNOT EXECUTE. That is the
 * intended state: ratification will change configuration, not architecture.
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  financialPeriods,
  journalEntries,
  journalLines,
  ledgerAccounts,
  legalEntities,
} from "@/db/schema";
import { recordAuditTx, publishEventTx } from "@/lib/audit";
import { can, type Principal } from "@/lib/authz";
import { requireCapability } from "@/lib/decision-authority";
import { newId, ID_PREFIX } from "@/lib/ids";

/** Period statuses that may accept a posting. Which statuses are postable is P7/P8 and is NOT
 *  decided here: this is the structural floor (a hard-closed period can never accept a posting
 *  under any policy). A ratified P8 may narrow this further; it may never widen it. */
const STRUCTURALLY_CLOSED = ["CLOSED", "LOCKED"] as const;

export type JournalLineInput = {
  accountId: string;
  debit: string;
  credit: string;
  description?: string;
};

export type PostJournalInput = {
  tenantId: string;
  legalEntityId: string;
  periodId?: string | null;
  reference: string;
  description: string;
  currency: string;
  lines: JournalLineInput[];
  /** Optional linkage to the governance decision that authorised this posting. */
  sourceReference?: string;
  idempotencyKey?: string;
};

export type PostJournalResult = {
  entryId: string;
  lineCount: number;
  totalDebit: string;
  totalCredit: string;
};

export class PostingError extends Error {
  constructor(
    readonly code: PostingErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "PostingError";
  }
}

export type PostingErrorCode =
  | "CAPABILITY_LOCKED"
  | "DENIED"
  | "RULE_VIOLATION"
  | "NOT_FOUND"
  | "CONFLICT";

/**
 * Money is handled as integer minor units (cents) to avoid binary floating-point drift.
 * Number is safe here: 2^53 minor units is ~90 trillion major units, far beyond any balance
 * this system will hold, and all arithmetic below is integer addition only.
 */
function decimal(value: string): number {
  if (!/^-?\d+(\.\d{1,2})?$/.test(value)) {
    throw new PostingError("RULE_VIOLATION", `Amount '${value}' is not a valid monetary value.`);
  }
  const [whole, frac = ""] = value.split(".");
  const negative = whole.startsWith("-");
  const magnitude = Number(`${whole.replace("-", "")}${frac.padEnd(2, "0")}`);
  if (!Number.isSafeInteger(magnitude)) {
    throw new PostingError("RULE_VIOLATION", `Amount '${value}' exceeds the safe monetary range.`);
  }
  return negative ? -magnitude : magnitude;
}

function format(scaled: number): string {
  const negative = scaled < 0;
  const s = Math.abs(scaled).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

/**
 * Validates the policy-independent accounting invariants of a proposed journal.
 * Exported so intelligence and simulation layers can check a draft WITHOUT posting it.
 */
export function validateJournalStructure(input: PostJournalInput): {
  valid: boolean;
  errors: string[];
  totalDebit: string;
  totalCredit: string;
} {
  const errors: string[] = [];
  let debits = 0;
  let credits = 0;

  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    errors.push("A journal entry must have at least one line.");
  }
  if (!input.currency || !/^[A-Z]{3}$/.test(input.currency)) {
    errors.push("Currency must be a three-letter ISO code.");
  }

  for (const [index, line] of (input.lines ?? []).entries()) {
    let d = 0;
    let c = 0;
    try {
      d = decimal(line.debit);
      c = decimal(line.credit);
    } catch (error) {
      errors.push(`Line ${index + 1}: ${(error as Error).message}`);
      continue;
    }
    if (d < 0 || c < 0) errors.push(`Line ${index + 1}: amounts must not be negative.`);
    if (d > 0 && c > 0) errors.push(`Line ${index + 1}: a line must be single-sided.`);
    if (d === 0 && c === 0) errors.push(`Line ${index + 1}: a line must carry an amount.`);
    debits += d;
    credits += c;
  }

  if (debits !== credits) {
    errors.push(`Entry does not balance: debits ${format(debits)} != credits ${format(credits)}.`);
  }
  if (debits === 0 && credits === 0 && errors.length === 0) {
    errors.push("Entry total must be greater than zero.");
  }

  return { valid: errors.length === 0, errors, totalDebit: format(debits), totalCredit: format(credits) };
}

/**
 * Posts a balanced journal entry.
 *
 * Order of enforcement, and every step is mandatory:
 *   1. AUTHORITY   — the CAP_POSTING capability must be activated (Phase 6C gate).
 *   2. IDENTITY    — RBAC must grant finance:ledger.post.
 *   3. TENANT      — the principal's tenant must match the target tenant.
 *   4. ENTITY      — the entity must exist, belong to the tenant, and be in the principal's scope.
 *   5. ACCOUNTING  — structure must satisfy the policy-independent invariants.
 *   6. ACCOUNTS    — every account must exist and belong to the same tenant.
 *   7. PERIOD      — a referenced period must exist, match the entity, and not be closed.
 *   8. ATOMIC      — entry, lines, audit and event are written in ONE transaction.
 */
export async function postJournal(
  principal: Principal,
  input: PostJournalInput,
): Promise<PostJournalResult> {
  // --- 1. AUTHORITY. Throws CapabilityLockedError while P1/P6/P7/P9 remain unratified. ---
  await requireCapability("CAP_POSTING");

  // --- 2. IDENTITY / RBAC ---
  const decision = can(principal, "finance:ledger.post");
  if (!decision.allowed) {
    throw new PostingError("DENIED", "You do not hold authority to post to the ledger.");
  }

  // --- 3. TENANT ISOLATION ---
  if (principal.tenantId !== input.tenantId) {
    // Non-enumerating: do not reveal whether the tenant exists.
    throw new PostingError("NOT_FOUND", "The target entity was not found.");
  }

  // --- 4. ENTITY SCOPE ---
  const [entity] = await db
    .select({ id: legalEntities.id, tenantId: legalEntities.tenantId })
    .from(legalEntities)
    .where(eq(legalEntities.id, input.legalEntityId))
    .limit(1);

  if (!entity || entity.tenantId !== input.tenantId) {
    throw new PostingError("NOT_FOUND", "The target entity was not found.");
  }
  if (principal.entityScope.length > 0 && !principal.entityScope.includes(entity.id)) {
    throw new PostingError("NOT_FOUND", "The target entity was not found.");
  }

  // --- 5. ACCOUNTING INVARIANTS (policy-independent) ---
  const structure = validateJournalStructure(input);
  if (!structure.valid) {
    throw new PostingError("RULE_VIOLATION", structure.errors[0], { errors: structure.errors });
  }

  // --- 6/7/8. Everything below is inside one transaction. ---
  const entryId = `JE_${crypto.randomUUID()}`;
  const traceId = newId(ID_PREFIX.event);

  return db.transaction(async (tx) => {
    // Accounts must exist and be in the same tenant. Re-read inside the transaction.
    for (const line of input.lines) {
      const [account] = await tx
        .select({ id: ledgerAccounts.id, tenantId: ledgerAccounts.tenantId, active: ledgerAccounts.active })
        .from(ledgerAccounts)
        .where(eq(ledgerAccounts.id, line.accountId))
        .limit(1);

      if (!account || account.tenantId !== input.tenantId) {
        throw new PostingError("NOT_FOUND", "A referenced ledger account was not found.");
      }
      if (account.active === false) {
        throw new PostingError("RULE_VIOLATION", "A referenced ledger account is inactive.");
      }
    }

    // Period, when supplied, must belong to the entity and must not be structurally closed.
    if (input.periodId) {
      const [period] = await tx
        .select({
          id: financialPeriods.id,
          legalEntityId: financialPeriods.legalEntityId,
          status: financialPeriods.status,
        })
        .from(financialPeriods)
        .where(eq(financialPeriods.id, input.periodId))
        .limit(1);

      if (!period || period.legalEntityId !== input.legalEntityId) {
        throw new PostingError("NOT_FOUND", "The referenced financial period was not found.");
      }
      if ((STRUCTURALLY_CLOSED as readonly string[]).includes(String(period.status))) {
        throw new PostingError("RULE_VIOLATION", "The financial period is closed to postings.");
      }
    }

    // Idempotency: a repeated key for the same entity must not double-post.
    if (input.idempotencyKey) {
      const [existing] = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(
          and(
            eq(journalEntries.idempotencyKey, input.idempotencyKey),
            eq(journalEntries.tenantId, input.tenantId),
          ),
        )
        .limit(1);
      if (existing) {
        throw new PostingError("CONFLICT", "This posting has already been recorded.", {
          entryId: existing.id,
        });
      }
    }

    await tx.insert(journalEntries).values({
      id: entryId,
      tenantId: input.tenantId,
      legalEntityId: input.legalEntityId,
      periodId: input.periodId ?? null,
      reference: input.reference,
      description: input.description,
      currency: input.currency,
      postedBy: principal.userId,
      source: input.sourceReference ?? "GOVERNED_POSTING",
      idempotencyKey: input.idempotencyKey ?? null,
    });

    for (const [index, line] of input.lines.entries()) {
      await tx.insert(journalLines).values({
        id: `JL_${entryId}_${index}`,
        entryId,
        accountId: line.accountId,
        debit: line.debit,
        credit: line.credit,
        memo: line.description ?? input.description,
      });
    }

    // The deferred balance trigger fires here, so an unbalanced entry cannot survive commit even
    // if application validation were bypassed.
    await tx.execute(sql`set constraints all immediate`);

    await recordAuditTx(tx, {
      tenantId: input.tenantId,
      actorUserId: principal.userId,
      actorType: "HUMAN",
      action: "finance.ledger.post",
      objectType: "JOURNAL_ENTRY",
      objectId: entryId,
      outcome: "SUCCESS",
      authority: "CAP_POSTING",
      newValue: {
        reference: input.reference,
        currency: input.currency,
        totalDebit: structure.totalDebit,
        lineCount: input.lines.length,
      },
      traceId,
    });

    await publishEventTx(tx, {
      tenantId: input.tenantId,
      type: "JOURNAL_ENTRY_POSTED",
      source: "finance.posting-engine",
      domain: "FINANCE",
      operation: "POST_JOURNAL",
      destinationDomain: null,
      legalEntityId: input.legalEntityId,
      subjectType: "JOURNAL_ENTRY",
      subjectId: entryId,
      actorUserId: principal.userId,
      classification: "RESTRICTED",
      payload: {
        reference: input.reference,
        legalEntityId: input.legalEntityId,
        currency: input.currency,
        totalDebit: structure.totalDebit,
        totalCredit: structure.totalCredit,
      },
      traceId,
      correlationId: traceId,
      causationId: null,
      authorityContext: { authorityId: null, decisionId: null, capabilityCode: "CAP_POSTING", permissionCode: "finance:ledger.post", policyVersion: null },
      policyVersion: null,
    });

    return {
      entryId,
      lineCount: input.lines.length,
      totalDebit: structure.totalDebit,
      totalCredit: structure.totalCredit,
    };
  });
}

/**
 * Trial balance for an entity. Read-only derivation from posted entries — it holds no separate
 * truth of its own and stores nothing.
 */
export async function trialBalance(
  principal: Principal,
  tenantId: string,
  legalEntityId: string,
): Promise<Array<{ accountId: string; debit: string; credit: string; balance: string }>> {
  if (!can(principal, "finance:ledger.read").allowed) {
    throw new PostingError("DENIED", "You do not hold authority to read the ledger.");
  }
  if (principal.tenantId !== tenantId) {
    throw new PostingError("NOT_FOUND", "The target entity was not found.");
  }

  const rows = await db
    .select({
      accountId: journalLines.accountId,
      debit: sql<string>`coalesce(sum(${journalLines.debit}), 0)::text`,
      credit: sql<string>`coalesce(sum(${journalLines.credit}), 0)::text`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(
      and(eq(journalEntries.tenantId, tenantId), eq(journalEntries.legalEntityId, legalEntityId)),
    )
    .groupBy(journalLines.accountId);

  return rows.map((r) => ({
    accountId: r.accountId,
    debit: r.debit,
    credit: r.credit,
    balance: format(decimal(Number(r.debit).toFixed(2)) - decimal(Number(r.credit).toFixed(2))),
  }));
}
