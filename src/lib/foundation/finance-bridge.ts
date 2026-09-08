/**
 * BEYU Foundation OS — canonical Finance integration bridge.
 *
 * Foundation Finance NEVER posts journals directly and never invents accounts,
 * periods or recognition policy. All financial consequences flow through
 * canonical Finance OS artefacts:
 *
 *   - funding needs      → canonical `capital_requests` (sectorCode FOUNDATION)
 *   - donation receipts  → donation records LINKED to journal entries posted
 *                          by Finance (postJournal), never posted here
 *   - disbursements      → disbursement records LINKED to journal entries
 *   - fund accounting    → fund balances + allocations reconciled against the
 *                          ledger by Finance-owned reconciliation
 *
 * CAP_POSTING and every canonical financial control remain governed by BEYU's
 * financial governance; this bridge only prepares governed requests.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import { newId, ID_PREFIX } from "@/lib/ids";
import { withAuditTransaction } from "@/lib/audit";
import { tenantScopeIds } from "@/lib/tenant-scope";
import type { Principal } from "@/lib/authz";
import { FoundationError, assertMoney, getFoundation, type ServiceContext } from "./service";

export async function requestFoundationCapital(
  ctx: ServiceContext,
  input: {
    foundationId: string;
    code: string;
    title: string;
    requestType: string;
    amount: string;
    currency?: string;
    horizonMonths?: number;
    programId?: string;
    grantId?: string;
  },
) {
  const foundation = await getFoundation(ctx.principal, input.foundationId);
  const legalEntityId = foundation.legalEntityId;
  if (!legalEntityId) {
    throw new FoundationError("VALIDATION_FAILED", "The foundation has no linked legal entity; capital cannot be requested without one");
  }
  assertMoney(input.amount, "amount");
  const id = newId(ID_PREFIX.capital);
  return withAuditTransaction(
    async (tx) => {
      await tx.insert(s.capitalRequests).values({
        id,
        tenantId: foundation.tenantId,
        legalEntityId,
        code: input.code.trim(),
        title: input.title.trim(),
        requestType: input.requestType,
        sectorCode: "FOUNDATION",
        amount: input.amount,
        currency: input.currency ?? foundation.baseCurrency,
        horizonMonths: input.horizonMonths ?? 12,
        riskScore: 5,
        status: "PENDING",
        requestedBy: ctx.principal.userId,
      });
      return { id };
    },
    (r) => ({
      tenantId: foundation.tenantId,
      actorUserId: ctx.principal.userId,
      ipAddress: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      action: "foundation.finance.requestCapital",
      objectType: "CAPITAL_REQUEST",
      objectId: r.id,
      newValue: { code: input.code, amount: input.amount, foundationId: foundation.id },
    }),
    undefined,
  );
}

export async function listFoundationCapitalRequests(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  return db
    .select()
    .from(s.capitalRequests)
    .where(and(eq(s.capitalRequests.sectorCode, "FOUNDATION"), inArray(s.capitalRequests.tenantId, scope)));
}

/**
 * Link a Finance-posted journal entry to a foundation record. The entry must
 * already exist in the canonical ledger; this bridge records the linkage only.
 */
export async function linkJournalEntry(
  ctx: ServiceContext,
  input: { kind: "DONATION" | "DISBURSEMENT"; recordId: string; journalEntryId: string },
) {
  const scope = await tenantScopeIds(ctx.principal);
  const [entry] = await db
    .select({ id: s.journalEntries.id })
    .from(s.journalEntries)
    .where(and(eq(s.journalEntries.id, input.journalEntryId), inArray(s.journalEntries.tenantId, scope)))
    .limit(1);
  if (!entry) throw new FoundationError("NOT_FOUND", "Journal entry not found in your authorised scope");
  if (input.kind === "DONATION") {
    const [row] = await db
      .select()
      .from(s.donations)
      .where(and(eq(s.donations.id, input.recordId), inArray(s.donations.tenantId, scope)))
      .limit(1);
    if (!row) throw new FoundationError("NOT_FOUND", "Donation not found in your authorised scope");
    await db.update(s.donations).set({ journalEntryId: entry.id }).where(eq(s.donations.id, row.id));
  } else {
    const [row] = await db
      .select()
      .from(s.grantDisbursements)
      .where(and(eq(s.grantDisbursements.id, input.recordId), inArray(s.grantDisbursements.tenantId, scope)))
      .limit(1);
    if (!row) throw new FoundationError("NOT_FOUND", "Disbursement not found in your authorised scope");
    await db.update(s.grantDisbursements).set({ journalEntryId: entry.id, status: "RECONCILED" }).where(eq(s.grantDisbursements.id, row.id));
  }
  return { recordId: input.recordId, journalEntryId: entry.id };
}

/**
 * Fund-vs-ledger reconciliation view. Foundation OS reports its own fund
 * balances; Finance OS remains the authority for ledger truth. Any drift is
 * surfaced, never auto-corrected here.
 */
export async function fundReconciliationView(principal: Principal) {
  const scope = await tenantScopeIds(principal);
  const fundRows = await db.select().from(s.funds).where(inArray(s.funds.tenantId, scope));
  const allocationRows = await db.select().from(s.fundAllocations).where(inArray(s.fundAllocations.tenantId, scope));
  return fundRows.map((f) => {
    const allocated = allocationRows
      .filter((a) => a.fundId === f.id && a.status !== "REVERSED")
      .reduce((sum, a) => sum + Number(a.amount), 0);
    return {
      fundId: f.id,
      code: f.code,
      balance: f.balance,
      committed: f.committed,
      allocated: allocated.toFixed(2),
      available: (Number(f.balance) - Number(f.committed)).toFixed(2),
      drift: (Number(f.committed) - allocated).toFixed(2),
    };
  });
}
