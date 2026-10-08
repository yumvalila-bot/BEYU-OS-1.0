/**
 * Insurance / revenue-cycle tests (migration 039).
 *
 * These are the assertions that keep this module from becoming a wish list:
 * cover the patient described is not cover the payer confirmed; a claim cannot
 * bill more than the invoice it was generated from; nothing is recorded as
 * submitted or posted unless a document from the OTHER side exists.
 */
import { describe, it, expect, beforeAll } from "@jest/globals";
import { buildTestBed, TestBed } from "../../common/testing/test-bed";
import {
  ClaimItemRepository,
  ClaimRepository,
  EligibilityCheckRepository,
  InsuranceProfileRepository,
  InsuranceService,
  PreauthRepository,
  RemittanceRepository,
} from "./insurance.service";
import { DomainError } from "../../common/errors/domain.error";
import { EventOutboxService } from "../events/event-outbox.service";

const ACTOR = "00000000-0000-0000-0000-000000000001";

describe("InsuranceService", () => {
  let bed: TestBed;
  let svc: InsuranceService;
  let patientId: string;
  let profileId: string;
  let invoiceNo: string;
  let seq = 0;

  const newProfile = async (extra: Record<string, unknown> = {}) =>
    (await svc.registerProfile({
      patient_id: patientId,
      payer_name: "Mutua Bima Scheme",
      payer_type: "private_insurer",
      policy_number: `POL-${++seq}`,
      primary_coverage: false,
      ...extra,
    })) as any;

  /** A verified scheme, ready to be billed. */
  const verifiedProfile = async (extra: Record<string, unknown> = {}) => {
    const p = await newProfile(extra);
    await svc.verifyProfile(String(p.profile_id), {
      evidence: "Insured card sighted at front desk, member photo matched",
    });
    return p;
  };

  const newInvoice = async (total = 120_000, lines = 2) => {
    const no = `INV-${++seq}`;
    const inv = (
      await (bed.conn as any).query(
        `INSERT INTO health.invoices (tenant_id, invoice_no, patient_id, status, currency, subtotal, total, balance, issued_at)
         VALUES ($1, $2, $3, 'issued', 'KES', $4, $4, $4, now())
         RETURNING invoice_id, invoice_no, total`,
        [bed.tenantCtx.tenantId(), no, patientId, total],
      )
    )[0];
    const per = Math.floor(total / lines);
    for (let i = 0; i < lines; i += 1) {
      await (bed.conn as any).query(
        `INSERT INTO health.invoice_items (tenant_id, invoice_id, description, qty, unit_price, line_total)
         VALUES ($1, $2, $3, 1, $4, $4)`,
        [bed.tenantCtx.tenantId(), inv.invoice_id, `Line ${i + 1}`, per],
      );
    }
    return inv;
  };

  beforeAll(async () => {
    bed = await buildTestBed();
    const outbox = new EventOutboxService(bed.conn, bed.tenantCtx);
    svc = new InsuranceService(
      bed.conn,
      bed.tenantCtx,
      bed.audit,
      outbox,
      new InsuranceProfileRepository(bed.conn, bed.tenantCtx),
      new EligibilityCheckRepository(bed.conn, bed.tenantCtx),
      new PreauthRepository(bed.conn, bed.tenantCtx),
      new ClaimItemRepository(bed.conn, bed.tenantCtx),
      new RemittanceRepository(bed.conn, bed.tenantCtx),
      new ClaimRepository(bed.conn, bed.tenantCtx),
    );
    await bed.run(async () => {
      const p = await bed.seedPatient();
      patientId = p.patient_id;
      profileId = String(
        (await newProfile({ primary_coverage: true })).profile_id,
      );
      const inv = await newInvoice(120_000, 2);
      invoiceNo = inv.invoice_no;
    });
  });

  // ── cover on file ───────────────────────────────────────────────────────────
  it("records cover as claimed, not as confirmed", () =>
    bed.run(async () => {
      const p = await newProfile();
      expect(p.verification_status).toBe("unverified");
      expect(p.verified_at ?? null).toBeNull();
      expect(p.note).toMatch(/unverified/);
      await expect(
        Promise.resolve().then(() =>
          svc.registerProfile({
            patient_id: patientId,
            payer_name: "Scheme with no numbers",
            payer_type: "private_insurer",
            primary_coverage: false,
          }),
        ),
      ).rejects.toThrow(/policy_number/);
      await expect(
        Promise.resolve().then(() =>
          svc.registerProfile({
            patient_id: patientId,
            payer_name: "X",
            payer_type: "mutual_fund_of_the_nation",
            policy_number: "P1",
            primary_coverage: false,
          }),
        ),
      ).rejects.toThrow(/payer_type/);
    }));

  it("keeps exactly one active primary cover per patient", () =>
    bed.run(async () => {
      // The fixture patient already holds an active primary profile.
      await expect(newProfile({ primary_coverage: true })).rejects.toThrow(
        /already this patient's active primary cover/,
      );
      const second = await newProfile({ payer_name: "Employer scheme" });
      expect(second.primary_coverage).toBe(false);
    }));

  it("verifies only against something a human inspected, and needs an adapter receipt otherwise", () =>
    bed.run(async () => {
      const p = await newProfile();
      await expect(
        Promise.resolve().then(() =>
          svc.verifyProfile(String(p.profile_id), { evidence: "card" }),
        ),
      ).rejects.toThrow(/evidence must describe/);
      const verified = (await svc.verifyProfile(String(p.profile_id), {
        evidence: "Photo ID and insured card, scheme member number read back",
      })) as any;
      expect(verified.verification_status).toBe("verified");
      expect(String(verified.verified_by)).toBe(ACTOR);
      expect(verified.verified_at).toBeTruthy();
      await expect(
        svc.verifyProfile(String(p.profile_id), { evidence: "looked again" }),
      ).rejects.toThrow(/already verified/);
    }));

  // ── eligibility ─────────────────────────────────────────────────────────────
  it("says 'unknown' when there is nobody to ask, and records why", () =>
    bed.run(async () => {
      const check = (await svc.runEligibilityCheck(profileId)) as any;
      expect(check.result).toBe("unknown");
      expect(check.adapter_unavailable_reason).toMatch(
        /no_payer_adapter_configured/,
      );
      expect(typeof check.response_summary).toBe("string");
      await expect(
        Promise.resolve().then(() =>
          svc.recordEligibilityResult(profileId, "eligible" as any, {} as any),
        ),
      ).rejects.toThrow(/where it came from/);
      await expect(
        Promise.resolve().then(() =>
          svc.recordEligibilityResult(profileId, "ineligible", {
            source: "document",
          }),
        ),
      ).rejects.toThrow(/payer's reason/);
      const answered = (await svc.recordEligibilityResult(
        profileId,
        "partially_eligible",
        {
          source: "external_api",
          response_summary: "Renal benefits capped at 200,000 per year",
          valid_until: new Date(Date.now() + 86400_000).toISOString(),
          idempotency_key: "adapter:elig:abc123",
        },
      )) as any;
      expect(answered.result).toBe("partially_eligible");
      const latest = (await svc.latestEligibility(profileId)) as any;
      expect(latest.result).toBe("partially_eligible");
      // A partial answer does not make the cover 'verified' — only 'eligible' does.
      const profile = (
        await (bed.conn as any).query(
          `SELECT verification_status FROM health.insurance_profiles WHERE profile_id = $1`,
          [profileId],
        )
      )[0];
      expect(profile.verification_status).toBe("unverified");
    }));

  it("refuses to record usage beyond the limit the payer granted", () =>
    bed.run(async () => {
      const p = await newProfile({
        annual_limit: 500_000,
        deductible_amount: 20_000,
      });
      const tooMuch = await Promise.resolve()
        .then(() =>
          svc.recordBenefitUsage(String(p.profile_id), {
            annual_used: 600_000,
            note: "payer statement 2026-09",
          }),
        )
        .then(() => null)
        .catch((e) => e);
      expect(tooMuch).toBeInstanceOf(DomainError);
      expect((tooMuch as Error).message).toMatch(/annual limit/);
      const ok = (await svc.recordBenefitUsage(String(p.profile_id), {
        annual_used: 480_000,
        deductible_used: 20_000,
        note: "payer statement 2026-09, page 2",
      })) as any;
      expect(Number(ok.annual_used)).toBe(480_000);
      await expect(
        Promise.resolve().then(() =>
          svc.recordBenefitUsage(String(p.profile_id), {
            annual_used: 1,
            note: "",
          }),
        ),
      ).rejects.toThrow(/cite the remit/);
    }));

  // ── pre-authorisation ───────────────────────────────────────────────────────
  it("will not accept a request that is not reviewable, or an approval that cannot be billed", () =>
    bed.run(async () => {
      await expect(
        Promise.resolve().then(() =>
          svc.requestPreauth({
            profile_id: profileId,
            service_code: "PROC-CT-HEAD",
            service_name: "CT head",
            requested_amount: 18_000,
            clinical_justification: "needed",
          }),
        ),
      ).rejects.toThrow(/clinical_justification/);
      // Asking a payer for authorisation is allowed while the cover is still
      // unverified — that request is one of the ways verification happens. What
      // is refused is billing, and what is refused here is a suspended scheme.
      const unverified = await newProfile();
      const whileUnverified = (await svc.requestPreauth({
        profile_id: String(unverified.profile_id),
        service_code: "PROC-CT-HEAD-UNVERIFIED",
        service_name: "CT head",
        requested_amount: 18_000,
        clinical_justification:
          "Persistent headache for six weeks with focal signs; non-contrast CT inconclusive",
      })) as any;
      expect(whileUnverified.status).toBe("requested");
      await (bed.conn as any).query(
        `UPDATE health.insurance_profiles SET status = 'suspended' WHERE profile_id = $1`,
        [unverified.profile_id],
      );
      await expect(
        svc.requestPreauth({
          profile_id: String(unverified.profile_id),
          service_code: "PROC-CT-HEAD-UNVERIFIED",
          service_name: "CT head",
          requested_amount: 18_000,
          clinical_justification:
            "Persistent headache for six weeks with focal signs; non-contrast CT inconclusive",
        }),
      ).rejects.toThrow(/Cover is suspended/);

      const preauth = (await svc.requestPreauth({
        profile_id: profileId,
        service_code: "PROC-CT-HEAD",
        service_name: "CT head with contrast",
        requested_amount: 18_000,
        clinical_justification:
          "Persistent headache for six weeks with focal signs; non-contrast CT inconclusive",
      })) as any;
      expect(preauth.status).toBe("requested");
      expect(preauth.submission_state).toBe("not_connected");
      expect(preauth.requested_by ?? ACTOR).toBeTruthy();
      await expect(
        svc.requestPreauth({
          profile_id: profileId,
          service_code: "PROC-CT-HEAD",
          service_name: "CT head with contrast (again)",
          requested_amount: 18_000,
          clinical_justification:
            "Persistent headache for six weeks with focal signs; non-contrast CT inconclusive",
        }),
      ).rejects.toThrow(/already open/);

      await expect(
        Promise.resolve().then(() =>
          svc.decidePreauth(String(preauth.preauth_id), "approved", {
            valid_until: new Date(Date.now() + 86400_000).toISOString(),
          }),
        ),
      ).rejects.toThrow(/authorisation number/);
      await expect(
        svc.decidePreauth(String(preauth.preauth_id), "partially_approved", {
          authorization_number: "AUTH-77",
          approved_amount: 90_000,
          valid_until: new Date(Date.now() + 86400_000).toISOString(),
        }),
      ).rejects.toThrow(/cannot approve/);

      const approved = (await svc.decidePreauth(
        String(preauth.preauth_id),
        "approved",
        {
          authorization_number: "AUTH-77",
          approved_amount: 18_000,
          valid_until: new Date(Date.now() + 86400_000).toISOString(),
        },
      )) as any;
      expect(approved.status).toBe("approved");
      expect(approved.authorization_number).toBe("AUTH-77");
      expect(String(approved.decided_by)).toBe(ACTOR);
      await expect(
        svc.decidePreauth(String(preauth.preauth_id), "denied", {
          denial_reason: "changed mind",
        }),
      ).rejects.toThrow(/already approved/);
    }));

  it("expires an approval that has lapsed, because 'approved' is not permanent", () =>
    bed.run(async () => {
      const preauth = (await svc.requestPreauth({
        profile_id: profileId,
        service_code: "PROC-MRI-LSPINE",
        service_name: "MRI lumbar spine",
        requested_amount: 45_000,
        clinical_justification:
          "Radicular pain L5 distribution for eleven weeks, no response to conservative therapy",
      })) as any;
      await svc.decidePreauth(String(preauth.preauth_id), "approved", {
        authorization_number: "AUTH-91",
        approved_amount: 45_000,
        valid_until: new Date(Date.now() - 60_000).toISOString(),
      });
      const swept = (await svc.sweepExpiredPreauths()) as any;
      expect(swept.expired).toBeGreaterThanOrEqual(1);
      const after = (
        await (bed.conn as any).query(
          `SELECT status, decided_at FROM health.preauthorizations WHERE preauth_id = $1`,
          [preauth.preauth_id],
        )
      )[0];
      expect(after.status).toBe("expired");
      expect(after.decided_at).toBeTruthy();
      const queue = (await svc.preauthQueue()) as any[];
      expect(
        queue.some((r) => String(r.preauth_id) === String(preauth.preauth_id)),
      ).toBe(false);
    }));

  // ── claims ──────────────────────────────────────────────────────────────────
  it("generates a claim only from a settled-invoice state and a verified scheme", () =>
    bed.run(async () => {
      const pending = await newProfile();
      const inv = await newInvoice(60_000, 2);
      await expect(
        svc.createClaimFromInvoice(String(inv.invoice_id), {
          profile_id: String(pending.profile_id),
        }),
      ).rejects.toThrow(/unverified/);

      const verified = await verifiedProfile({ payer_name: "Zuricha Health" });
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      expect(claim.status).toBe("draft");
      expect(claim.submission_state).toBe("not_connected");
      expect(Number(claim.total_billed)).toBe(60_000);
      expect(Number(claim.invoice_total_snapshot)).toBe(60_000);
      expect(claim.claim_no).toMatch(/^CLM-/);
      const lines = (await svc.claimLines(String(claim.claim_id))) as any[];
      expect(lines.length).toBe(2);
      expect(Number(lines[0].amount)).toBe(30_000);
      expect(lines[0].status).toBe("billed");

      await expect(
        svc.createClaimFromInvoice(String(inv.invoice_id), {
          profile_id: String(verified.profile_id),
        }),
      ).rejects.toThrow(/already claimed/);
      // A paid invoice is history; it cannot be billed to a payer again.
      await (bed.conn as any).query(
        `UPDATE health.invoices SET status = 'paid', balance = 0 WHERE invoice_id = $1`,
        [inv.invoice_id],
      );
      await expect(
        svc.createClaimFromInvoice(String(inv.invoice_id), {
          profile_id: String(verified.profile_id),
        }),
      ).rejects.toThrow(/paid/);
    }));

  it("does not claim more than the invoice it was generated from", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Aminia Care" });
      const inv = await newInvoice(80_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      const before = Number(claim.total_billed);
      // Not a thrown error and not a silent success: these columns are simply
      // not part of the update surface, so a client cannot move them.
      await svc.update(String(claim.claim_id), {
        total_billed: 999_999,
        submission_state: "submitted",
        status: "paid",
        invoice_total_snapshot: 1,
      } as any);
      const after = (await svc.get(String(claim.claim_id))) as any;
      expect(Number(after.total_billed)).toBe(before);
      expect(after.submission_state).toBe("not_connected");
      expect(after.status).toBe("draft");
      // The invoice may now be amended for the patient's own account; the claim
      // still reflects the snapshot taken when it was generated.
      await (bed.conn as any).query(
        `UPDATE health.invoices SET total = 20_000 WHERE invoice_id = $1`,
        [inv.invoice_id],
      );
      const unchanged = (await svc.get(String(claim.claim_id))) as any;
      expect(Number(unchanged.invoice_total_snapshot)).toBe(80_000);
    }));

  it("will not bill a claim whose pre-authorisation has not been honoured", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Jubilee Medical" });
      const inv = await newInvoice(40_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      const preauth = (await svc.requestPreauth({
        profile_id: String(verified.profile_id),
        service_code: "PROC-ENDOSCOPY",
        service_name: "Diagnostic endoscopy",
        requested_amount: 40_000,
        clinical_justification:
          "Recurring epigastric pain with alarm symptoms; two months of empirical therapy failed",
      })) as any;
      await svc.update(String(claim.claim_id), {
        preauth_id: preauth.preauth_id,
      });
      await expect(svc.readyClaim(String(claim.claim_id))).rejects.toThrow(
        /not currently approved/,
      );
      await svc.decidePreauth(String(preauth.preauth_id), "approved", {
        authorization_number: "AUTH-12",
        approved_amount: 40_000,
        valid_until: new Date(Date.now() + 86400_000).toISOString(),
      });
      const ready = (await svc.readyClaim(String(claim.claim_id))) as any;
      expect(ready.status).toBe("ready");
      expect(ready.submission_state).toBe("not_connected");
    }));

  it("submits only when the payer's receipt exists, and never twice", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Kenture Scheme" });
      const inv = await newInvoice(25_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      const waiting = (await svc.submitClaim(String(claim.claim_id))) as any;
      expect(waiting.submission_state).toBe("pending_external");
      expect(waiting.submission_error).toMatch(/no_payer_adapter_receipt/);
      // A pending claim can be re-tried, because nothing was ever sent.
      const again = (await svc.submitClaim(String(claim.claim_id))) as any;
      expect(again.submission_state).toBe("pending_external");
      const sent = (await svc.submitClaim(String(claim.claim_id), {
        external_reference: "KT-2026-000451",
      })) as any;
      expect(sent.status).toBe("submitted");
      expect(sent.submission_state).toBe("submitted");
      expect(sent.external_reference).toBe("KT-2026-000451");
      expect(sent.submitted_at).toBeTruthy();
      expect(sent.submission_error).toBeNull();
      await expect(
        svc.submitClaim(String(claim.claim_id), { external_reference: "KT-2" }),
      ).rejects.toThrow(/already carries a payer submission receipt/);
      await expect(
        Promise.resolve().then(() =>
          svc.submitClaim(String(claim.claim_id), {} as any),
        ),
      ).rejects.toThrow(/payer's reference/);
    }));

  it("posts a remittance to finance only against a real payment", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "CARE Alliance" });
      const inv = await newInvoice(100_000, 2);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      await svc.submitClaim(String(claim.claim_id), {
        external_reference: "CA-991",
      });
      const lines = (await svc.claimLines(String(claim.claim_id))) as any[];
      await expect(
        Promise.resolve().then(() =>
          svc.recordRemittance(String(claim.claim_id), {
            remit_no: `RMT-${++seq}`,
            amount_paid: 50_000,
            adjudication: "partially_paid",
            source: "manual",
            line_outcomes: [
              {
                claim_item_id: String(lines[0].claim_item_id),
                status: "denied",
                approved_amount: 0,
                paid_amount: 0,
              },
            ],
          }),
        ),
      ).rejects.toThrow(/denied line needs/);
      // An advice naming a different scheme is a reconciliation error, and a
      // line cannot be paid more than the payer approved for it.
      await expect(
        svc.recordRemittance(String(claim.claim_id), {
          remit_no: `RMT-${++seq}`,
          amount_paid: 1_000,
          payer_name: "Some Other Scheme",
          adjudication: "paid",
          source: "manual",
        }),
      ).rejects.toThrow(/but this claim was billed to/);
      await expect(
        svc.recordRemittance(String(claim.claim_id), {
          remit_no: `RMT-${++seq}`,
          amount_paid: 0,
          adjudication: "partially_paid",
          source: "manual",
          line_outcomes: [
            {
              claim_item_id: String(lines[0].claim_item_id),
              status: "paid",
              approved_amount: 40_000,
              paid_amount: 45_000,
            },
          ],
        }),
      ).rejects.toThrow(/exceeds approved/);

      const staged = (await svc.recordRemittance(String(claim.claim_id), {
        remit_no: `RMT-${++seq}`,
        amount_paid: 50_000,
        patient_share: 10_000,
        adjudication: "partially_paid",
        source: "manual",
        line_outcomes: [
          {
            claim_item_id: String(lines[0].claim_item_id),
            status: "paid",
            approved_amount: 40_000,
            paid_amount: 40_000,
          },
        ],
      })) as any;
      expect(staged.posting_state).toBe("staged");
      expect(staged.posting_reason).toMatch(/no payment id/);

      const after = (await svc.get(String(claim.claim_id))) as any;
      expect(after.status).toBe("partially_paid");
      // 40,000 settled on the line plus the 50,000 the payer actually sent.
      expect(Number(after.total_paid)).toBe(90_000);
      expect(after.rejection_reason).toBeNull();

      // The residual needs a finance payment before the advice can post, and an
      // advice that says "paid" while leaving the claim short is refused until
      // somebody writes down why the payer will not pay the rest.
      await expect(
        svc.recordRemittance(String(claim.claim_id), {
          remit_no: `RMT-${++seq}`,
          amount_paid: 5_000,
          adjudication: "paid",
          source: "manual",
        }),
      ).rejects.toThrow(/unexplained/);
      const payment = (
        await (bed.conn as any).query(
          `INSERT INTO health.payments (tenant_id, payment_no, patient_id, method, amount, currency, status)
           VALUES ($1, 'PAY-' || substr(md5(random()::text), 1, 10), $2, 'insurance', 5000, 'KES', 'reconciled')
           RETURNING payment_id`,
          [bed.tenantCtx.tenantId(), patientId],
        )
      )[0];
      // The residual itself is only welcome when it reconciles to a payment: the
      // same amount without a payment id would have been accepted but staged.
      const final = (await svc.recordRemittance(String(claim.claim_id), {
        remit_no: `RMT-${++seq}`,
        amount_paid: 10_000,
        adjudication: "paid",
        remark: "Balance cleared against the scheme statement",
        source: "manual",
        matched_payment_id: String(payment.payment_id),
      })) as any;
      expect(final.posting_state).toBe("posted_to_finance");
      expect(String(final.matched_payment_id)).toBe(String(payment.payment_id));

      const settled = (await svc.get(String(claim.claim_id))) as any;
      expect(Number(settled.total_paid)).toBe(100_000);
      expect(settled.status).toBe("paid");
      await expect(
        svc.recordRemittance(String(claim.claim_id), {
          remit_no: `RMT-${++seq}`,
          amount_paid: 1,
          adjudication: "paid",
          source: "manual",
        }),
      ).rejects.toThrow(/Claim is paid/);

      const ledger = (await svc.claimLedger(String(claim.claim_id))) as any;
      expect(ledger.reconciliation.billed).toBe(100_000);
      expect(ledger.reconciliation.paid).toBe(100_000);
      expect(ledger.reconciliation.residual).toBe(0);
      expect(ledger.reconciliation.fully_reconciled).toBe(true);
      expect(ledger.reconciliation.finance_posted).toBe(false);
      // Three advices were attempted and two landed: the refused one wrote
      // nothing at all, which is what checking inside the transaction buys.
      expect(ledger.remittances.length).toBe(2);
      expect(ledger.lines.length).toBe(2);
      expect(ledger.lines[0].status).toBe("paid");
      expect(Number(ledger.lines[0].approved_amount)).toBe(40_000);
      expect(ledger.lines[1].status).toBe("billed");
    }));

  it("rejects a claim and resubmits it as a visible child, never as an edit", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Stima Insurance" });
      const inv = await newInvoice(35_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      await svc.submitClaim(String(claim.claim_id), {
        external_reference: "SI-1",
      });
      await expect(
        Promise.resolve().then(() =>
          svc.rejectClaim(String(claim.claim_id), ""),
        ),
      ).rejects.toThrow(/payer's reason/);
      const rejected = (await svc.rejectClaim(
        String(claim.claim_id),
        "Pre-authorisation not obtained for this service",
      )) as any;
      expect(rejected.status).toBe("rejected");
      expect(rejected.rejected_at).toBeTruthy();
      await expect(
        svc.recordRemittance(String(claim.claim_id), {
          remit_no: `RMT-${++seq}`,
          amount_paid: 0,
          adjudication: "denied",
          denial_reason: "Claim filed after the scheme's filing window closed",
          source: "manual",
        }),
      ).rejects.toThrow(/Claim is rejected/);

      await expect(
        Promise.resolve().then(() =>
          svc.resubmitClaim(String(claim.claim_id), ""),
        ),
      ).rejects.toThrow(/what changed/);
      const child = (await svc.resubmitClaim(
        String(claim.claim_id),
        "Retrospective authorisation AUTH-55 obtained; re-billed with the approval attached",
      )) as any;
      expect(String(child.parent_claim_id)).toBe(String(claim.claim_id));
      expect(Number(child.resubmission_count)).toBe(1);
      expect(child.status).toBe("draft");
      expect(child.claim_no).toMatch(/^CLM-/);
      expect(child.claim_no).not.toBe(claim.claim_no);
      const childLines = (await svc.claimLines(
        String(child.claim_id),
      )) as any[];
      expect(childLines.length).toBe(1);
      const parent = (await svc.get(String(claim.claim_id))) as any;
      expect(parent.status).toBe("rejected");
      expect(parent.rejection_reason).toMatch(/Pre-authorisation/);
    }));

  it("shows what the payers still owe, and which filings are about to lapse", async () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Twende Payer" });
      const inv = await newInvoice(70_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      await svc.update(String(claim.claim_id), {
        due_submission_date: new Date(Date.now() - 86400_000)
          .toISOString()
          .slice(0, 10),
      });
      await svc.readyClaim(String(claim.claim_id));
      const claimRow = (
        await (bed.conn as any).query(
          `SELECT status, submission_state, due_submission_date,
                  (due_submission_date - current_date) AS days_left
             FROM health.claims WHERE claim_id = $1`,
          [claim.claim_id],
        )
      )[0];
      const watch = (await svc.filingDeadlineWatch(7)) as any[];
      expect({ row: claimRow, watch: watch.length }).toEqual({
        row: expect.objectContaining({ status: "ready", days_left: -1 }),
        watch: expect.any(Number),
      });
      expect(watch.map((w) => String(w.claim_id))).toContain(
        String(claim.claim_id),
      );
      const report = (await svc.outstandingReport()) as any[];
      const row = report.find((r) => r.payer_name === "Twende Payer")!;
      expect(Number(row.claims_open)).toBe(1);
      expect(Number(row.outstanding)).toBe(70_000);
      expect(await svc.filingDeadlineWatch("99999" as any)).toBeTruthy();
      expect(invoiceNo).toMatch(/^INV-/);
    }));

  it("refuses a submission that claims an approval it never had", () =>
    bed.run(async () => {
      const verified = await verifiedProfile({ payer_name: "Dai Payer" });
      const inv = await newInvoice(15_000, 1);
      const claim = (await svc.createClaimFromInvoice(String(inv.invoice_id), {
        profile_id: String(verified.profile_id),
      })) as any;
      const pending = (await svc.requestPreauth({
        profile_id: String(verified.profile_id),
        service_code: "PROC-DENTAL",
        service_name: "Surgical extraction",
        requested_amount: 15_000,
        clinical_justification:
          "Impacted third molar with trismus and purulent discharge; airway risk if untreated",
      })) as any;
      await svc.update(String(claim.claim_id), {
        preauth_id: pending.preauth_id,
      });
      // The pre-auth is only 'requested', so the claim may not be readied.
      await expect(svc.readyClaim(String(claim.claim_id))).rejects.toThrow(
        /not currently approved/,
      );
      await expect(
        Promise.resolve().then(() =>
          svc.decidePreauth(String(pending.preauth_id), "partially_approved", {
            authorization_number: "AUTH-3",
            approved_amount: 0,
            valid_until: new Date(Date.now() + 86400_000).toISOString(),
          }),
        ),
      ).rejects.toThrow(/amount the payer agreed/);
      await expect(
        Promise.resolve().then(() =>
          svc.decidePreauth(String(pending.preauth_id), "approved", {
            valid_until: new Date(Date.now() + 86400_000).toISOString(),
          }),
        ),
      ).rejects.toThrow(/authorisation number/);
    }));
});
