"use client";

import { useEffect, useState } from "react";

type Entity = { id: string; name: string; country: string };
type TaxType = "PAYE" | "CORPORATE_INCOME_TAX" | "PERSONAL_INCOME_TAX" | "PRESUMPTIVE_INCOME_TAX" | "VAT" | "VAT_WITHHOLDING" | "WITHHOLDING_TAX" | "CUSTOMS_PROCESSING_FEE";
type SavedDraft = { id: string; legalEntityId: string; taxType: string; periodStart: string; periodEnd: string; dueDate: string | null; amountPayable: string; currency: string; status: string; createdAt: string };
type Result = {
  calculation: {
    status: string;
    taxType: string;
    taxBaseTzs: number;
    taxAmountTzs: number;
    effectiveRateBps: number;
    breakdown: Array<{ label: string; baseTzs: number; rateBps: number; taxTzs: number }>;
    sourceRefs: Array<{ code: string; title: string; uri: string; provision: string; effectiveFrom?: string }>;
    warnings: string[];
  };
  filingPack: { status: string; dueDate: string | null; periodEnd: string; checklist: string[]; paymentMilestones: Array<{ dueDate: string; label: string }>; submission: { status: string }; taxpayer: { tin: string } } | null;
  draftId: string | null;
  filingReadiness: string;
  governance: { specialistReviewRequired: boolean; canSubmit: boolean; canPost: boolean; reason: string };
};

const money = (value: number) => new Intl.NumberFormat("en-TZ", { style: "currency", currency: "TZS", maximumFractionDigits: 0 }).format(value);
const inputClass = "mt-1 w-full rounded-lg border border-[color:var(--beyu-line)] bg-transparent px-3 py-2 text-[13px] outline-none focus:border-[#d4af37]";

export function TaxComputationWorkbench({ entities, canCompute, canReview }: { entities: Entity[]; canCompute: boolean; canReview: boolean }) {
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [taxType, setTaxType] = useState<TaxType>("PAYE");
  const [amount, setAmount] = useState("1000000");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState("RESIDENT_PRIMARY");
  const [records, setRecords] = useState("COMPLETE");
  const [whtCategory, setWhtCategory] = useState("SERVICE_FEE");
  const [vatSupplyType, setVatSupplyType] = useState("GOODS");
  const [payeeResidency, setPayeeResidency] = useState("RESIDENT");
  const [cargoType, setCargoType] = useState("DRY_NON_PETROLEUM");

  const [result, setResult] = useState<Result | null>(null);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function downloadDraftPack() {
    if (!result?.filingPack) return;
    const payload = JSON.stringify({ filingPack: result.filingPack, calculation: result.calculation }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `BEYU-TAX-DRAFT-${result.calculation.taxType}-${result.filingPack.periodEnd}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/v1/finance/tax/returns")
      .then(async (response) => response.ok ? response.json() : null)
      .then((json) => { if (active && json?.data?.drafts) setDrafts(json.data.drafts as SavedDraft[]); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function reviewDraft(draftId: string) {
    setReviewBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/finance/tax/returns/${draftId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "CONFIRM_PROVISIONAL", notes: reviewNotes }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Specialist review failed.");
      setReviewNotes("");
      const saved = await fetch("/api/v1/finance/tax/returns");
      const savedJson = await saved.json();
      if (saved.ok && savedJson?.data?.drafts) setDrafts(savedJson.data.drafts as SavedDraft[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record specialist review.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function calculate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const common = { legalEntityId: entityId, jurisdictionCode: "TZ_MAINLAND", periodStart, periodEnd, taxType };
      const value = Number(amount);
      const payload = taxType === "PAYE"
        ? { ...common, monthlyTaxablePayTzs: value, employeeStatus }
        : taxType === "CORPORATE_INCOME_TAX"
          ? { ...common, taxableIncomeTzs: value }
          : taxType === "PERSONAL_INCOME_TAX"
            ? { ...common, annualTaxableIncomeTzs: value }
            : taxType === "PRESUMPTIVE_INCOME_TAX"
              ? { ...common, annualTurnoverTzs: value, records }
              : taxType === "VAT"
                ? { ...common, taxableSuppliesTzs: value }
                : taxType === "VAT_WITHHOLDING"
                  ? { ...common, taxableValueTzs: value, supplyType: vatSupplyType }
                  : taxType === "WITHHOLDING_TAX"
                  ? { ...common, grossPaymentTzs: value, category: whtCategory, payeeResidency }
                  : { ...common, cargoType, importOrigin: "NON_EAC", ...(cargoType === "DRY_NON_PETROLEUM" ? { fobValueTzs: value } : { vesselCount: value }) };
      const response = await fetch("/api/v1/finance/tax/compute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error?.message ?? "Tax calculation rejected.");
      setResult(json.data as Result);
      const saved = await fetch("/api/v1/finance/tax/returns");
      const savedJson = await saved.json();
      if (saved.ok && savedJson?.data?.drafts) setDrafts(savedJson.data.drafts as SavedDraft[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to calculate tax.");
    } finally {
      setBusy(false);
    }
  }

  if (!canCompute) return <div className="beyu-panel px-5 py-4 text-[12px] beyu-muted">finance:tax.assess permission is required to calculate tax estimates.</div>;

  return (
    <section className="beyu-panel p-5 space-y-4">
      <div>
        <div className="beyu-kicker text-[#b08d1c]">Deterministic tax calculator</div>
        <h2 className="mt-1 text-[17px] font-semibold">Calculate and prepare a filing pack</h2>
        <p className="mt-1 text-[12px] beyu-muted">Tanzania Mainland · TZS · version TZ-MAINLAND-TAX-2026.1 · provisional estimates only</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[11.5px]">Legal entity
          <select className={inputClass} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
            {entities.filter((entity) => entity.country === "TZ").map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}
          </select>
        </label>
        <label className="text-[11.5px]">Tax type
          <select className={inputClass} value={taxType} onChange={(e) => setTaxType(e.target.value as TaxType)}>
            <option value="PAYE">PAYE — monthly payroll</option>
            <option value="CORPORATE_INCOME_TAX">Corporate income tax</option>
            <option value="PERSONAL_INCOME_TAX">Personal income tax — annual</option>
            <option value="PRESUMPTIVE_INCOME_TAX">Presumptive income tax — annual</option>
            <option value="VAT">VAT — taxable supplies</option>
            <option value="VAT_WITHHOLDING">VAT withholding — Finance Act 2026</option>
            <option value="WITHHOLDING_TAX">Withholding tax</option>
            <option value="CUSTOMS_PROCESSING_FEE">Customs processing fee — GN 158D</option>
          </select>
        </label>
        <label className="text-[11.5px]">{taxType === "PAYE" ? "Monthly taxable pay (TZS)" : taxType === "VAT" ? "Taxable supplies (TZS)" : taxType === "VAT_WITHHOLDING" ? "Taxable supply value (TZS)" : taxType === "WITHHOLDING_TAX" ? "Gross payment (TZS)" : taxType === "PRESUMPTIVE_INCOME_TAX" ? "Annual turnover (TZS)" : taxType === "CUSTOMS_PROCESSING_FEE" ? (cargoType === "DRY_NON_PETROLEUM" ? "FOB value (TZS)" : "Number of vessels") : "Taxable income (TZS)"}
          <input className={inputClass} type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="text-[11.5px]">Period start
          <input className={inputClass} type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
        </label>
        <label className="text-[11.5px]">Period end
          <input className={inputClass} type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
        {taxType === "PAYE" && (
          <label className="text-[11.5px]">Employment category
            <select className={inputClass} value={employeeStatus} onChange={(e) => setEmployeeStatus(e.target.value)}>
              <option value="RESIDENT_PRIMARY">Resident — primary employment</option>
              <option value="RESIDENT_SECONDARY">Resident — secondary employment</option>
              <option value="NON_RESIDENT">Non-resident employee</option>
              <option value="NON_FULL_TIME_DIRECTOR">Non-full-time director</option>
            </select>
          </label>
        )}
        {taxType === "PRESUMPTIVE_INCOME_TAX" && (
          <label className="text-[11.5px]">Record keeping
            <select className={inputClass} value={records} onChange={(e) => setRecords(e.target.value)}>
              <option value="COMPLETE">Complete records</option>
              <option value="INCOMPLETE">Incomplete records</option>
            </select>
          </label>
        )}
        {taxType === "VAT_WITHHOLDING" && (
          <label className="text-[11.5px]">Supply type
            <select className={inputClass} value={vatSupplyType} onChange={(e) => setVatSupplyType(e.target.value)}>
              <option value="GOODS">Goods — 15%</option>
              <option value="SERVICES">Services — 12%</option>
              <option value="MIXED">Mixed — statutory 3:2 split</option>
            </select>
          </label>
        )}
        {taxType === "CUSTOMS_PROCESSING_FEE" && (
          <>
            <label className="text-[11.5px]">Cargo type
              <select className={inputClass} value={cargoType} onChange={(e) => setCargoType(e.target.value)}>
                <option value="DRY_NON_PETROLEUM">Dry cargo — non-petroleum</option>
                <option value="WET_PETROLEUM">Wet petroleum cargo</option>
              </select>
            </label>
            <p className="self-end text-[10.5px] beyu-muted">Current estimate is limited to imports from outside EAC. EAC origin claims and exemptions are blocked until source documents are verified server-side.</p>
          </>
        )}
        {taxType === "WITHHOLDING_TAX" && (
          <>
            <label className="text-[11.5px]">Payment category
              <select className={inputClass} value={whtCategory} onChange={(e) => setWhtCategory(e.target.value)}>
                <option value="SERVICE_FEE">Service fee</option><option value="DIVIDEND_LISTED">Listed-company dividend</option><option value="DIVIDEND_OTHER">Other dividend</option><option value="INTEREST">Interest</option><option value="ROYALTY">Royalty</option><option value="COMMERCIAL_RENT">Commercial rent</option><option value="OTHER_INVESTMENT_RETURN">Other investment return</option><option value="MINING_TECHNICAL_SERVICE">Mining technical service</option><option value="NATURAL_RESOURCE_PAYMENT">Natural resource payment</option><option value="NON_FULL_TIME_DIRECTOR_FEE">Non-full-time director fee</option><option value="GOVERNMENT_GOODS_SUPPLY">Goods supplied to Government</option><option value="FOREST_PRODUCE">Forest produce</option><option value="PRECIOUS_METALS">Precious metals / gemstones</option>
              </select>
            </label>
            <label className="text-[11.5px]">Payee residency
              <select className={inputClass} value={payeeResidency} onChange={(e) => setPayeeResidency(e.target.value)}>
                <option value="RESIDENT">Resident</option><option value="NON_RESIDENT">Non-resident</option>
              </select>
            </label>
          </>
        )}
      </div>
      <button type="button" disabled={busy || !entityId || !periodStart || !periodEnd || !Number.isSafeInteger(Number(amount)) || Number(amount) < 0} onClick={calculate} className="rounded-lg bg-[#0b1d3a] px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
        {busy ? "Calculating…" : "Calculate and prepare draft"}
      </button>
      {error && <p role="alert" className="text-[12px] text-rose-600">{error}</p>}
      <div className="rounded-xl border border-[color:var(--beyu-line)] p-4 space-y-2">
        <div className="flex items-center justify-between gap-2"><strong className="text-[12px]">Saved tax return drafts</strong><span className="text-[10px] beyu-muted">{drafts.length} shown · maximum 50</span></div>
        {canReview && <label className="block text-[10.5px] beyu-muted">Specialist review note (minimum 10 characters)
          <textarea className={inputClass} rows={2} value={reviewNotes} onChange={(e) => setReviewNotes(e.target.value)} placeholder="Record the review performed and any limitations acknowledged." />
        </label>}
        {drafts.length === 0 ? <p className="text-[11px] beyu-muted">No saved drafts in your authorized entity scope.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[10.5px]">
              <thead><tr className="beyu-muted"><th className="py-1 pr-3">Tax type</th><th className="py-1 pr-3">Period</th><th className="py-1 pr-3">Due</th><th className="py-1 pr-3">Amount</th><th className="py-1 pr-3">Status</th><th className="py-1">Action</th></tr></thead>
              <tbody>{drafts.map((draft) => <tr key={draft.id} className="border-t border-[color:var(--beyu-line)]"><td className="py-2 pr-3">{draft.taxType.replaceAll("_", " ")}</td><td className="py-2 pr-3">{draft.periodStart} – {draft.periodEnd}</td><td className="py-2 pr-3">{draft.dueDate ?? "—"}</td><td className="py-2 pr-3 tabular-nums">{money(Number(draft.amountPayable))}</td><td className="py-2">{draft.status}</td><td className="py-2">{canReview && draft.status === "DRAFT" ? <button type="button" disabled={reviewBusy || reviewNotes.trim().length < 10} onClick={() => reviewDraft(draft.id)} className="rounded border border-[color:var(--beyu-line)] px-2 py-1 disabled:opacity-40">Review provisional</button> : draft.status === "SPECIALIST_REVIEWED_PROVISIONAL" ? <span className="text-amber-700">CFO approval gated</span> : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
      {result && (
        <div className="space-y-3 rounded-xl border border-[color:var(--beyu-line)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><div className="beyu-kicker beyu-muted">Estimated tax amount</div><div className="text-[24px] font-semibold tabular-nums">{money(result.calculation.taxAmountTzs)}</div></div>
            <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[10px] font-semibold">PROVISIONAL · REVIEW REQUIRED</span>
          </div>
          <div className="text-[11.5px] beyu-muted">Effective rate {(result.calculation.effectiveRateBps / 100).toFixed(2)}% · base {money(result.calculation.taxBaseTzs)} · source snapshot {result.calculation.sourceSnapshotDate}</div>
          <div className="space-y-1">
            {result.calculation.breakdown.map((line, index) => <div key={index} className="flex justify-between gap-3 text-[11.5px]"><span>{line.label} ({(line.rateBps / 100).toFixed(2)}%)</span><strong className="tabular-nums">{money(line.taxTzs)}</strong></div>)}
          </div>
          {result.filingPack ? (
            <div className="rounded-lg bg-[color:var(--beyu-surface)] p-3 text-[11.5px] space-y-2">
              <strong>Draft filing pack</strong>
              <div>Due date: {result.filingPack.dueDate ?? "Not calculated"}</div>
              <div>Status: {result.filingPack.status}</div>
              <div>Saved draft reference: <span className="font-mono">{result.draftId ?? "Not saved"}</span></div>
              <div>Submission: {result.filingPack.submission.status}</div>
              {result.filingPack.paymentMilestones.length > 0 && <ul className="list-disc pl-4">{result.filingPack.paymentMilestones.map((item) => <li key={item.dueDate}>{item.dueDate} — {item.label}</li>)}</ul>}
              <button type="button" onClick={downloadDraftPack} className="rounded-lg border border-[color:var(--beyu-line)] px-3 py-2 font-semibold">Export draft filing pack (JSON)</button>
            </div>
          ) : <div className="rounded-lg border border-amber-500/30 p-3 text-[11.5px]">Calculation completed. A filing pack cannot be prepared until the legal entity has a valid nine-digit TIN registered in BEYU.</div>}
          <div className="space-y-1 text-[11px]"><strong>Legal sources</strong>{result.calculation.sourceRefs.map((source) => <div key={source.code}><a className="underline underline-offset-2" href={source.uri} target="_blank" rel="noreferrer">{source.title}</a> · {source.provision}{source.effectiveFrom ? ` · effective from ${source.effectiveFrom}` : ""}</div>)}</div>
          <ul className="list-disc space-y-1 pl-5 text-[10.5px] beyu-muted">{result.calculation.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
          <p className="text-[11px] font-semibold text-amber-700">{result.governance.reason}</p>
        </div>
      )}
    </section>
  );
}
