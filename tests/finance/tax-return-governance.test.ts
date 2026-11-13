import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROLES, PERMISSIONS } from "@/lib/constants";

describe("FINANCE_OS tax return separation of duties", () => {
  const reviewRoute = readFileSync(join(process.cwd(), "src/app/api/v1/finance/tax/returns/[id]/review/route.ts"), "utf8");
  const approveRoute = readFileSync(join(process.cwd(), "src/app/api/v1/finance/tax/returns/[id]/approve/route.ts"), "utf8");
  const computeRoute = readFileSync(join(process.cwd(), "src/app/api/v1/finance/tax/compute/route.ts"), "utf8");
  const workbench = readFileSync(join(process.cwd(), "src/app/os/tax/computation-workbench.tsx"), "utf8");
  const submitRoute = readFileSync(join(process.cwd(), "src/app/api/v1/finance/tax/returns/[id]/record-submission/route.ts"), "utf8");
  const receiptRoute = readFileSync(join(process.cwd(), "src/app/api/v1/finance/tax/returns/[id]/record-receipt/route.ts"), "utf8");
  const migration = readFileSync(join(process.cwd(), "drizzle/0077_tax_return_drafts.sql"), "utf8");

  it("defines distinct specialist-review and Group-CFO approval permissions", () => {
    expect(PERMISSIONS["finance:tax.review"]).toBeDefined();
    expect(PERMISSIONS["finance:tax.approve"]).toBeDefined();
    expect(ROLES.TAX_SPECIALIST.permissions).toContain("finance:tax.review");
    expect(ROLES.TAX_MANAGER.permissions).toContain("finance:tax.review");
    expect(ROLES.CUSTOMS_SPECIALIST.permissions).toContain("finance:tax.review");
    expect(ROLES.GROUP_CFO.permissions).toContain("finance:tax.approve");
    expect(ROLES.TAX_FILING_OFFICER.permissions).toContain("finance:tax.submit");
    expect(ROLES.TAX_FILING_OFFICER.permissions).toContain("finance:tax.receipt");
    expect(ROLES.TAX_MANAGER.permissions).toContain("finance:tax.receipt");
    expect(ROLES.TAX_SPECIALIST.permissions).not.toContain("finance:tax.approve");
  });

  it("prevents preparer/reviewer self-approval and records provisional review only", () => {
    expect(reviewRoute).toContain("draft.createdBy === ctx.principal.userId");
    expect(reviewRoute).toContain("SPECIALIST_REVIEWED_PROVISIONAL");
    expect(reviewRoute).toContain("PROVISIONAL_REVIEW_ONLY_NOT_LEGAL_AUTHORITY_OR_SUBMISSION_APPROVAL");
    expect(approveRoute).toContain("draft.specialistReviewerId === ctx.principal.userId");
    expect(approveRoute).toContain("SOURCE_AUTHORITY_INCOMPLETE");
    expect(approveRoute).toContain("source.evidenceStatus === \"AUTHORITATIVE\"");
  });

  it("does not trust client-supplied evidence flags or reduced VAT rate claims", () => {
    expect(computeRoute).not.toContain("inputVatCreditVerified: z.boolean()");
    expect(computeRoute).not.toContain('rate: z.enum(["STANDARD_18", "ZERO_RATED"])');
    expect(computeRoute).not.toContain("originEvidenceVerified: z.boolean()");
    expect(computeRoute).toContain("originEvidenceVerified: false");
    expect(computeRoute).toContain('"taxableValueTzs" in body');
    expect(computeRoute).toContain('"farmGatePriceTzs" in body');
  });

  it("records only manual TRA submission and checksum-backed receipt evidence", () => {
    expect(submitRoute).toContain("TAX_FILING_OFFICER");
    expect(submitRoute).toContain("APPROVED_FOR_SUBMISSION");
    expect(submitRoute).toContain("SEPARATION_OF_DUTIES");
    expect(submitRoute).toContain("submittedAt < draft.approvedAt");
    expect(submitRoute).toContain("BEYU did not submit to TRA");
    expect(receiptRoute).toContain('eq(documents.category, "TAX_FILING_RECEIPT")');
    expect(receiptRoute).toContain('eq(documents.authorityStatus, "AUTHORITATIVE")');
    expect(receiptRoute).toContain("receiptDocumentId");
    expect(receiptRoute).toContain("receivedAt < draft.submittedAt");
    expect(receiptRoute).toContain("BEYU did not contact TRA");
  });

  it("uses deterministic tenant/entity/period/calculation idempotency for draft filing packs", () => {
    expect(computeRoute).toContain('createHash("sha256")');
    expect(computeRoute).toContain(".onConflictDoNothing()");
    expect(computeRoute).toContain("taxReturnDrafts.idempotencyKey");
  });

  it("blocks a 2026 presumptive year spanning the Finance Act commencement date", () => {
    expect(computeRoute).toContain("TRANSITIONAL_PERIOD_REVIEW_REQUIRED");
    expect(computeRoute).toContain('body.taxType === "PRESUMPTIVE_INCOME_TAX"');
    expect(computeRoute).toContain('body.periodEnd >= "2026-07-01"');
  });

  it("blocks post-commencement tax schedules for pre-commencement filing periods", () => {
    expect(computeRoute).toContain('"PRESUMPTIVE_INCOME_TAX"].includes(body.taxType)');
    expect(computeRoute).toContain('body.periodStart < "2026-07-01"');
    expect(computeRoute).toContain("originEvidenceVerified: false");
  });

  it("persists and displays source-linked compliance obligation candidates with draft packs", () => {
    expect(computeRoute).toContain("buildTaxComplianceObligations");
    expect(computeRoute).toContain("complianceObligations");
    expect(workbench).toContain("Compliance calendar candidates");
    expect(workbench).toContain("PLANNED_UNCONFIRMED");
  });

  it("database constraints require specialist review and independent approval before submission", () => {
    expect(migration).toContain("'SPECIALIST_REVIEWED_PROVISIONAL'");
    expect(migration).toContain("'APPROVED_FOR_SUBMISSION'");
    expect(migration).toContain('"specialist_reviewer_id" IS NOT NULL');
    expect(migration).toContain('"approved_by" IS NOT NULL');
    expect(migration).toContain('"external_reference" IS NOT NULL');
  });
});
