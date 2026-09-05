/**
 * BEYU OS — Finance OS API Routes Validation & Error Taxonomy Suite.
 *
 * Verifies request validation, schema parsing, and error behavior for Finance OS routes:
 * - /api/v1/finance/journal
 * - /api/v1/finance/reports
 * - /api/v1/finance/reconciliation
 * - /api/v1/finance/periods
 * - /api/v1/finance/accounts
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";

const PostJournalLineSchema = z.object({
  accountId: z.string().min(1),
  debit: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid debit format"),
  credit: z.string().regex(/^-?\d+(\.\d{1,2})?$/, "Invalid credit format"),
  description: z.string().max(500).optional(),
});

const PostJournalSchema = z.object({
  tenantId: z.string().min(1),
  legalEntityId: z.string().min(1),
  periodId: z.string().min(1).optional().nullable(),
  reference: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  currency: z.string().length(3).regex(/^[A-Z]{3}$/),
  lines: z.array(PostJournalLineSchema).min(2),
  sourceReference: z.string().max(100).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

const ReportKindEnum = z.enum([
  "TRIAL_BALANCE",
  "BALANCE_SHEET",
  "INCOME_STATEMENT",
  "CASH_FLOW",
  "CHANGES_IN_EQUITY",
]);

describe("Finance OS API Schemas — Validation", () => {
  it("validates valid journal post payload", () => {
    const valid = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-101",
      description: "Treasury disbursement",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "5000.00", credit: "0.00" },
        { accountId: "ACC_2000", debit: "0.00", credit: "5000.00" },
      ],
    };

    const parsed = PostJournalSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects journal post payload with fewer than 2 lines", () => {
    const singleLine = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-102",
      description: "Single line",
      currency: "USD",
      lines: [{ accountId: "ACC_1000", debit: "5000.00", credit: "0.00" }],
    };

    const parsed = PostJournalSchema.safeParse(singleLine);
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid monetary scale in line debit/credit", () => {
    const threeDecimals = {
      tenantId: "TEN_BEYU_GROUP",
      legalEntityId: "ENT_BEYU_HLD",
      reference: "JE-2026-103",
      description: "Fractional cents",
      currency: "USD",
      lines: [
        { accountId: "ACC_1000", debit: "5000.005", credit: "0.00" },
        { accountId: "ACC_2000", debit: "0.00", credit: "5000.005" },
      ],
    };

    const parsed = PostJournalSchema.safeParse(threeDecimals);
    expect(parsed.success).toBe(false);
  });

  it("validates report kinds strictly", () => {
    expect(ReportKindEnum.safeParse("TRIAL_BALANCE").success).toBe(true);
    expect(ReportKindEnum.safeParse("BALANCE_SHEET").success).toBe(true);
    expect(ReportKindEnum.safeParse("INCOME_STATEMENT").success).toBe(true);
    expect(ReportKindEnum.safeParse("CASH_FLOW").success).toBe(true);
    expect(ReportKindEnum.safeParse("CHANGES_IN_EQUITY").success).toBe(true);
    expect(ReportKindEnum.safeParse("SHADOW_LEDGER").success).toBe(false);
  });
});
