// ─────────────────────────────────────────────────────────────────────────────
// BEYU TAX ORCHESTRATION & ANTI-DOUBLE-TAXATION ENGINE — TANZANIA
// One transaction = one tax outcome. Every potential conflict detected,
// recorded, and either prevented or routed to credit/refund.
// ─────────────────────────────────────────────────────────────────────────────

export type TaxCode =
  | "VAT"           // Value-Added Tax 18% (TRA)
  | "VAT-EXEMPT"    // Healthcare services explicitly exempt
  | "VAT-ZERO"      // Zero-rated (exports, certain medicines)
  | "WHT"           // Withholding Tax (5% resident, 15% non-resident services)
  | "SDL"           // Skills Development Levy 4% of payroll
  | "PAYE"          // Pay-As-You-Earn
  | "NSSF"          // National Social Security 10%
  | "WCF"           // Workers Compensation 1%
  | "SERVICE-LEVY"  // City/Municipal 0.3% of gross turnover
  | "EXCISE"        // Excise duty
  | "STAMP-DUTY"    // 1% on contracts
  | "CUSTOMS"       // Import duty (medicines often 0%)
  | "CIT"           // Corporate Income Tax 30%
  | "ALT-MIN-TAX"   // Alternative Minimum Tax 0.3% (loss-makers)
  | "PROPERTY"      // Land Rent / Property Tax
  | "DST";          // Digital Services Tax (foreign providers)

export interface TaxDef {
  code: TaxCode;
  name: string;
  authority: "TRA" | "Local Government" | "NSSF" | "WCF" | "OSHA";
  rate: string;
  base: string;
  description: string;
  color: string;
}

export const TAXES: TaxDef[] = [
  { code: "VAT",          name: "Value-Added Tax",          authority: "TRA",              rate: "18%",   base: "Taxable supplies",   description: "Standard rate on goods & services unless exempted/zero-rated.", color: "#0B1D3A" },
  { code: "VAT-EXEMPT",   name: "VAT Exempt (Healthcare)",  authority: "TRA",              rate: "0%",    base: "Health services + exempt drugs", description: "Sec 6, VAT Act 2014 + 2nd Schedule — most clinical services exempt.", color: "#059669" },
  { code: "VAT-ZERO",     name: "VAT Zero-Rated",           authority: "TRA",              rate: "0%",    base: "Exports + essentials", description: "Input VAT recoverable but no output charged.", color: "#10b981" },
  { code: "WHT",          name: "Withholding Tax",          authority: "TRA",              rate: "5–15%", base: "Service payments",    description: "Resident services 5%; non-resident 15%.", color: "#7c3aed" },
  { code: "SDL",          name: "Skills Development Levy",  authority: "TRA",              rate: "4%",    base: "Gross monthly emoluments", description: "Employer pays on payroll.", color: "#b45309" },
  { code: "PAYE",         name: "Pay-As-You-Earn",          authority: "TRA",              rate: "0–30%", base: "Employee income (banded)", description: "Progressive tax on salaries.", color: "#1E3A8A" },
  { code: "NSSF",         name: "Social Security",          authority: "NSSF",             rate: "10%+10%", base: "Gross salary",      description: "Employer 10% + Employee 10%.", color: "#0891b2" },
  { code: "WCF",          name: "Workers Compensation",     authority: "WCF",              rate: "1%",    base: "Gross payroll",       description: "Workers Compensation Fund contribution.", color: "#be123c" },
  { code: "SERVICE-LEVY", name: "City Service Levy",        authority: "Local Government", rate: "0.3%",  base: "Gross turnover",      description: "Charged by city/municipal councils.", color: "#b45309" },
  { code: "EXCISE",       name: "Excise Duty",              authority: "TRA",              rate: "varies",base: "Excisable goods",     description: "Generally not applicable to medical supplies.", color: "#475569" },
  { code: "STAMP-DUTY",   name: "Stamp Duty",               authority: "TRA",              rate: "1%",    base: "Contracts / instruments", description: "Charged on certain legal instruments.", color: "#94a3b8" },
  { code: "CUSTOMS",      name: "Customs / Import Duty",    authority: "TRA",              rate: "0–25%", base: "CIF value of imports",description: "Most medicines + essential medical devices: 0%.", color: "#0d9488" },
  { code: "CIT",          name: "Corporate Income Tax",     authority: "TRA",              rate: "30%",   base: "Taxable profit",      description: "Annual corporate income tax.", color: "#dc2626" },
  { code: "ALT-MIN-TAX",  name: "Alternative Minimum Tax",  authority: "TRA",              rate: "0.3%",  base: "Turnover (loss-makers)", description: "Applies when CIT < AMT (perpetual loss-makers).", color: "#f59e0b" },
  { code: "PROPERTY",     name: "Property Tax / Land Rent", authority: "Local Government", rate: "varies",base: "Property value / area",description: "Annual property charges.", color: "#64748b" },
  { code: "DST",          name: "Digital Services Tax",     authority: "TRA",              rate: "2%",    base: "Digital revenues (non-resident)", description: "Applies to non-resident digital service providers.", color: "#7c3aed" },
];

/* ─────────────────────────── Double-Taxation Patterns ─────────────────────────── */

export type ConflictSeverity = "BLOCKED" | "REROUTED" | "CREDITED" | "INFO";

export interface DoubleTaxRule {
  id: string;
  name: string;
  /** Tax codes involved in the conflict */
  codes: TaxCode[];
  /** Why this would be double-taxation */
  reason: string;
  /** How BEYU resolves it automatically */
  resolution: string;
  /** Legal authority cited */
  authority: string;
  severity: ConflictSeverity;
}

export const ANTI_DT_RULES: DoubleTaxRule[] = [
  {
    id: "DT-001", name: "VAT on already-VAT-exempt healthcare service",
    codes: ["VAT", "VAT-EXEMPT"],
    reason: "Healthcare services are VAT-exempt under VAT Act Sec 6 + 2nd Schedule. Charging VAT again duplicates the tax burden.",
    resolution: "Classifier flags service as exempt and prevents 18% VAT from being added. EFD receipt issued with exempt-supply code.",
    authority: "VAT Act 2014 · Section 6 · Second Schedule",
    severity: "BLOCKED",
  },
  {
    id: "DT-002", name: "Output VAT charged when input VAT already paid by patient via insurer",
    codes: ["VAT", "VAT"],
    reason: "If an insurer paid VAT on a service component, billing the patient VAT on the same component duplicates output VAT.",
    resolution: "Tax orchestrator splits the invoice into 'paid-by-insurer' vs 'patient-portion' lines. VAT charged only on patient portion (if non-exempt).",
    authority: "VAT Act 2014 · Sections 17, 28",
    severity: "REROUTED",
  },
  {
    id: "DT-003", name: "WHT deducted by client but supplier also charges VAT on gross",
    codes: ["WHT", "VAT"],
    reason: "If WHT is withheld from a service fee, the supplier should issue an invoice net of WHT — not include VAT on the original gross.",
    resolution: "WHT and VAT bases reconciled. Engine computes VAT on the service fee and WHT on the net. Supplier sees WHT certificate as a tax credit.",
    authority: "Income Tax Act 2004 · Section 83",
    severity: "CREDITED",
  },
  {
    id: "DT-004", name: "Service Levy + VAT on same gross turnover line",
    codes: ["SERVICE-LEVY", "VAT"],
    reason: "City Service Levy (0.3%) is computed on gross turnover. If VAT is also computed on the same gross, the levy is applied to an inflated VAT-inclusive base.",
    resolution: "Service Levy base recomputed on VAT-exclusive turnover (statutory practice). Avoids levying tax on tax.",
    authority: "Local Government Finances Act · TRA Practice Note",
    severity: "REROUTED",
  },
  {
    id: "DT-005", name: "Inter-tenant transfer treated as taxable supply",
    codes: ["VAT", "WHT"],
    reason: "Movement of supplies between two facilities of the same legal entity (intra-group, intra-tenant) is not a taxable supply.",
    resolution: "Inter-tenant transfers tagged as 'INTRA-GROUP NON-SUPPLY'. No VAT, no WHT. Recorded as inventory transfer only.",
    authority: "VAT Act 2014 · Section 4 — definition of supply",
    severity: "BLOCKED",
  },
  {
    id: "DT-006", name: "Cross-border WHT without applying DTA relief",
    codes: ["WHT"],
    reason: "Tanzania has Double Taxation Agreements (DTAs) with several countries. Without applying the DTA, the supplier is taxed in Tanzania at 15% AND in home country.",
    resolution: "DTA registry consulted automatically. Reduced WHT rate applied (often 5–10%); residual tax credited in supplier's home jurisdiction.",
    authority: "Income Tax Act 2004 · DTA Treaties (Kenya, UK, India, South Africa, etc.)",
    severity: "CREDITED",
  },
  {
    id: "DT-007", name: "NHIF claim + cash co-pay both charged full VAT",
    codes: ["VAT-EXEMPT", "VAT"],
    reason: "Healthcare service is VAT-exempt regardless of payer. Charging VAT on the patient co-pay portion duplicates an already-exempt service.",
    resolution: "Co-pay portion inherits the same exempt classification as the NHIF-paid portion. EFD receipts issued under exempt-supply code.",
    authority: "VAT Act 2014 · Second Schedule",
    severity: "BLOCKED",
  },
  {
    id: "DT-008", name: "Excise + VAT computed on EXCISE-INCLUSIVE base (correct method ignored)",
    codes: ["EXCISE", "VAT"],
    reason: "VAT must be computed on excise-inclusive base — this is the law, not double-taxation. The engine simply ensures the correct sequencing.",
    resolution: "Engine sequences Excise → VAT computation in the correct order. Logged as INFO so finance auditors see the reasoning.",
    authority: "VAT Act 2014 · Excise Duty Act",
    severity: "INFO",
  },
  {
    id: "DT-009", name: "Same input VAT claimed in two different VAT periods",
    codes: ["VAT"],
    reason: "Claiming an input VAT credit in two periods would constitute a duplicate refund claim.",
    resolution: "Input VAT credit ledger is append-only and indexed by invoice hash. Re-claim attempts blocked at submission.",
    authority: "VAT Act 2014 · Sections 68–70",
    severity: "BLOCKED",
  },
  {
    id: "DT-010", name: "PAYE + WHT on same individual payment",
    codes: ["PAYE", "WHT"],
    reason: "If a payment to an individual is classified as employment income (PAYE applies) it cannot also be classified as a service fee (WHT applies).",
    resolution: "Counterparty classifier assigns either Employee or Contractor status, never both. PAYE OR WHT — never both on same payment.",
    authority: "Income Tax Act 2004 · Sections 7, 81–83",
    severity: "BLOCKED",
  },
  {
    id: "DT-011", name: "City Service Levy charged in two jurisdictions",
    codes: ["SERVICE-LEVY"],
    reason: "Multi-branch businesses risk paying City Service Levy to each council on the same turnover.",
    resolution: "Turnover allocated by branch (geo-fenced). Each branch's levy paid only to its own city/municipal council.",
    authority: "Local Government Finances Act",
    severity: "REROUTED",
  },
  {
    id: "DT-012", name: "Digital Services Tax + WHT on non-resident invoice",
    codes: ["DST", "WHT"],
    reason: "Non-resident digital service provider could face both 2% DST and 15% WHT. Tax law allows DST to be credited against WHT.",
    resolution: "DST automatically credited; net WHT obligation computed.",
    authority: "Income Tax Act 2004 · Finance Act 2022",
    severity: "CREDITED",
  },
];

/* ─────────────────────────── DTA Registry (Cross-Border) ─────────────────────────── */

export interface DTA {
  country: string;
  flag: string;
  signed: string;
  status: "IN FORCE" | "RATIFIED" | "PROVISIONAL";
  whtServices: string;      // reduced rate vs default 15%
  whtRoyalties: string;
  whtDividends: string;
  applicableTo: string;
}

export const DTAS: DTA[] = [
  { country: "Kenya",        flag: "🇰🇪", signed: "1989", status: "IN FORCE", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "EAC services, royalties" },
  { country: "Uganda",       flag: "🇺🇬", signed: "1989", status: "IN FORCE", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "EAC services" },
  { country: "Rwanda",       flag: "🇷🇼", signed: "2019", status: "IN FORCE", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "EAC services" },
  { country: "South Africa", flag: "🇿🇦", signed: "2005", status: "IN FORCE", whtServices: "10%", whtRoyalties: "10%", whtDividends: "10%", applicableTo: "Technical services, dividends" },
  { country: "United Kingdom", flag: "🇬🇧", signed: "1947", status: "IN FORCE", whtServices: "10%", whtRoyalties: "12.5%", whtDividends: "10%", applicableTo: "Professional services" },
  { country: "India",        flag: "🇮🇳", signed: "1979", status: "IN FORCE", whtServices: "10%", whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "Tech services, dividends" },
  { country: "Canada",       flag: "🇨🇦", signed: "1995", status: "IN FORCE", whtServices: "10%", whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "Professional fees" },
  { country: "Denmark",      flag: "🇩🇰", signed: "1976", status: "IN FORCE", whtServices: "10%", whtRoyalties: "12.5%", whtDividends: "10%", applicableTo: "Services" },
  { country: "Italy",        flag: "🇮🇹", signed: "1973", status: "IN FORCE", whtServices: "10%", whtRoyalties: "12.5%", whtDividends: "10%", applicableTo: "Services" },
  { country: "Zambia",       flag: "🇿🇲", signed: "2016", status: "IN FORCE", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "SADC services" },
  { country: "UAE",          flag: "🇦🇪", signed: "2022", status: "IN FORCE", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "Financial services" },
  { country: "Mauritius",    flag: "🇲🇺", signed: "2024", status: "RATIFIED", whtServices: "5%",  whtRoyalties: "10%", whtDividends: "5%",  applicableTo: "Holding company structures" },
];

/* ─────────────────────────── Tax Transactions (Demo) ─────────────────────────── */

export type TaxTxStatus = "CLEARED" | "PREVENTED" | "REROUTED" | "CREDITED" | "EXEMPTED" | "REVIEW";

export interface TaxTransaction {
  id: string;
  date: string;
  description: string;
  party: string;
  grossAmount: number;   // TZS
  proposedTaxes: { code: TaxCode; amount: number }[];
  finalTaxes: { code: TaxCode; amount: number }[];
  saved: number;          // amount of duplicate tax prevented
  status: TaxTxStatus;
  conflictRule?: string;  // DT-xxx
  efdReceipt?: string;
  notes?: string;
}

export const TAX_TRANSACTIONS: TaxTransaction[] = [
  {
    id: "TX-T-001", date: "2026-05-04", description: "Outpatient consultation + lab",
    party: "Amina Hassan (NHIF) · INV-77821", grossAmount: 184000,
    proposedTaxes: [{ code: "VAT", amount: 33120 }],
    finalTaxes: [{ code: "VAT-EXEMPT", amount: 0 }],
    saved: 33120, status: "EXEMPTED", conflictRule: "DT-001",
    efdReceipt: "EFD/MUH/2026/77821", notes: "Healthcare exempt — 2nd Schedule",
  },
  {
    id: "TX-T-002", date: "2026-05-04", description: "Inter-facility supply transfer",
    party: "MUH-DSM-01 → AGA-DSM-02 · Surgical kits", grossAmount: 2400000,
    proposedTaxes: [{ code: "VAT", amount: 432000 }, { code: "WHT", amount: 120000 }],
    finalTaxes: [],
    saved: 552000, status: "PREVENTED", conflictRule: "DT-005",
    notes: "Intra-group non-supply — neither VAT nor WHT applies",
  },
  {
    id: "TX-T-003", date: "2026-05-04", description: "Hospitality / executive meals",
    party: "Serengeti Catering · INV-9921", grossAmount: 480000,
    proposedTaxes: [{ code: "VAT", amount: 86400 }, { code: "WHT", amount: 24000 }],
    finalTaxes: [{ code: "VAT", amount: 86400 }, { code: "WHT", amount: 24000 }],
    saved: 0, status: "CLEARED",
    efdReceipt: "EFD/SRG/2026/9921",
  },
  {
    id: "TX-T-004", date: "2026-05-03", description: "IT consulting (UK supplier)",
    party: "Holborn Tech Ltd · INV-UK-441", grossAmount: 18400000,
    proposedTaxes: [{ code: "WHT", amount: 2760000 }],  // 15% non-resident
    finalTaxes: [{ code: "WHT", amount: 1840000 }],     // 10% under UK DTA
    saved: 920000, status: "CREDITED", conflictRule: "DT-006",
    notes: "UK DTA applied — reduced WHT 15% → 10%",
  },
  {
    id: "TX-T-005", date: "2026-05-03", description: "Pharmacy retail sale (OTC)",
    party: "Walk-in customer", grossAmount: 65000,
    proposedTaxes: [{ code: "VAT", amount: 11700 }],
    finalTaxes: [{ code: "VAT-EXEMPT", amount: 0 }],
    saved: 11700, status: "EXEMPTED", conflictRule: "DT-001",
    efdReceipt: "EFD/MUH/2026/9922",
    notes: "Medicines on NEMLIT list — VAT exempt",
  },
  {
    id: "TX-T-006", date: "2026-05-03", description: "City service levy reconciliation",
    party: "Dar es Salaam City Council", grossAmount: 84000000,
    proposedTaxes: [{ code: "SERVICE-LEVY", amount: 297360 }], // 0.3% on VAT-inclusive
    finalTaxes: [{ code: "SERVICE-LEVY", amount: 252000 }],    // 0.3% on VAT-exclusive
    saved: 45360, status: "REROUTED", conflictRule: "DT-004",
    notes: "Recomputed levy on VAT-exclusive base per TRA practice",
  },
  {
    id: "TX-T-007", date: "2026-05-02", description: "External laboratory referral",
    party: "Lancet Tanzania · INV-22884", grossAmount: 320000,
    proposedTaxes: [{ code: "VAT", amount: 57600 }, { code: "WHT", amount: 16000 }],
    finalTaxes: [{ code: "VAT-EXEMPT", amount: 0 }, { code: "WHT", amount: 16000 }],
    saved: 57600, status: "EXEMPTED", conflictRule: "DT-007",
    efdReceipt: "EFD/LAN/2026/22884", notes: "Lab service exempt; WHT 5% applies",
  },
  {
    id: "TX-T-008", date: "2026-05-02", description: "Software licence (USA)",
    party: "Cleveland TeleMed Co. · USD 12,000", grossAmount: 28800000,
    proposedTaxes: [{ code: "WHT", amount: 4320000 }, { code: "DST", amount: 576000 }],
    finalTaxes: [{ code: "WHT", amount: 3744000 }],  // DST credited
    saved: 1152000, status: "CREDITED", conflictRule: "DT-012",
    notes: "DST 2% credited against WHT",
  },
  {
    id: "TX-T-009", date: "2026-05-02", description: "Insurance co-pay portion",
    party: "Joseph Mwakyusa (AAR co-pay)", grossAmount: 42000,
    proposedTaxes: [{ code: "VAT", amount: 7560 }],
    finalTaxes: [{ code: "VAT-EXEMPT", amount: 0 }],
    saved: 7560, status: "EXEMPTED", conflictRule: "DT-007",
    efdReceipt: "EFD/MUH/2026/9923",
  },
  {
    id: "TX-T-010", date: "2026-05-01", description: "Duplicate input VAT claim attempt",
    party: "Sysmex Tanzania · Reagent PO-44128", grossAmount: 8400000,
    proposedTaxes: [{ code: "VAT", amount: 1512000 }],   // attempted re-claim
    finalTaxes: [],
    saved: 1512000, status: "PREVENTED", conflictRule: "DT-009",
    notes: "Input VAT for this invoice already claimed in March 2026 period",
  },
  {
    id: "TX-T-011", date: "2026-05-01", description: "Payroll · monthly statutory",
    party: "84 employees · payroll run", grossAmount: 184000000,
    proposedTaxes: [
      { code: "PAYE", amount: 36800000 },
      { code: "SDL", amount: 7360000 },
      { code: "NSSF", amount: 18400000 },
      { code: "WCF", amount: 1840000 },
    ],
    finalTaxes: [
      { code: "PAYE", amount: 36800000 },
      { code: "SDL", amount: 7360000 },
      { code: "NSSF", amount: 18400000 },
      { code: "WCF", amount: 1840000 },
    ],
    saved: 0, status: "CLEARED",
    notes: "All statutory deductions on distinct bases — no overlap",
  },
  {
    id: "TX-T-012", date: "2026-05-01", description: "Consultant payment (was tagged Employee too)",
    party: "Dr. P. Okello (locum)", grossAmount: 4200000,
    proposedTaxes: [{ code: "PAYE", amount: 1260000 }, { code: "WHT", amount: 210000 }],
    finalTaxes: [{ code: "WHT", amount: 210000 }],  // contractor, not employee
    saved: 1260000, status: "PREVENTED", conflictRule: "DT-010",
    notes: "Classifier confirmed Contractor (not Employee) — WHT only",
  },
];

/* ─────────────────────────── Tax KPIs ─────────────────────────── */

export const TAX_KPIS = (() => {
  const txs = TAX_TRANSACTIONS;
  return {
    transactions: txs.length,
    prevented: txs.filter(t => t.status === "PREVENTED").length,
    exempted: txs.filter(t => t.status === "EXEMPTED").length,
    rerouted: txs.filter(t => t.status === "REROUTED").length,
    credited: txs.filter(t => t.status === "CREDITED").length,
    totalGross: txs.reduce((s, t) => s + t.grossAmount, 0),
    totalSaved: txs.reduce((s, t) => s + t.saved, 0),
    totalTaxesAfter: txs.reduce((s, t) => s + t.finalTaxes.reduce((x, f) => x + f.amount, 0), 0),
    efdReceiptsToday: 284,
    dtaCountries: DTAS.length,
    activeRules: ANTI_DT_RULES.length,
    cleanRatio: 100, // every transaction goes through the engine
  };
})();

export function statusStyle(s: TaxTxStatus) {
  switch (s) {
    case "CLEARED":   return { bg: "bg-slate-100",   text: "text-slate-700",   dot: "bg-slate-500",   label: "CLEARED" };
    case "PREVENTED": return { bg: "bg-rose-100",    text: "text-rose-700",    dot: "bg-rose-500",    label: "PREVENTED" };
    case "REROUTED":  return { bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-500",   label: "REROUTED" };
    case "CREDITED":  return { bg: "bg-violet-100",  text: "text-violet-700",  dot: "bg-violet-500",  label: "CREDITED" };
    case "EXEMPTED":  return { bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500", label: "EXEMPTED" };
    case "REVIEW":    return { bg: "bg-gold-100",    text: "text-gold-700",    dot: "bg-gold-500",    label: "REVIEW" };
  }
}
