// Realistic templated content for every legal / corporate document in the BEYU vault.
// Each document is linked to one or more modules so it surfaces in the right places.

export type DocModule =
  | "smart-contracts" | "hr" | "vault" | "planning" | "hive"
  | "sovereign" | "hierarchy" | "settings" | "public-policies" | "ip";

export interface BeyuDoc {
  id: string;
  title: string;
  type:
    | "Founders Agreement" | "Incorporation" | "Exit Clause"
    | "SHA" | "Cap Table" | "ESOP" | "NDA" | "IP Assignment"
    | "Trademark" | "Employment Contract" | "Offer Letter"
    | "HR Policy" | "Terms of Service" | "Privacy Policy"
    | "Legal Compliance" | "Pitch Deck" | "Financial Model" | "Term Sheet";
  category: string;
  status: "Active" | "Draft" | "Signed" | "Pending Signature" | "Expiring";
  version: string;
  effective: string;
  parties?: string[];
  hash: string;
  onChain: boolean;
  smartContract?: string;
  modules: DocModule[];
  summary: string;
  sections: { heading: string; body: string }[];
}

export const BEYU_DOCS: BeyuDoc[] = [
  /* ─── 1. FOUNDERS AGREEMENT ─── */
  {
    id: "DOC-FND-001",
    title: "BEYU Founders' Agreement",
    type: "Founders Agreement",
    category: "Founding Documents",
    status: "Signed",
    version: "v2.1",
    effective: "2024-06-01",
    parties: ["Dr. John Doe (Founder)", "Edith Sanga (Co-Founder)", "Dr. M. Achieng (Co-Founder)"],
    hash: "0x65dd...41ec",
    onChain: true,
    smartContract: "BeyuTrustRegistry.sol",
    modules: ["smart-contracts", "vault", "hierarchy"],
    summary:
      "Defines the initial equity split, roles, responsibilities, vesting and decision-making among the three founders of the BEYU Family Trust ecosystem.",
    sections: [
      { heading: "1. Parties & Founding Roles",
        body: "This Founders' Agreement is entered into on 1 June 2024 by Dr. John Doe (CEO), Edith Sanga (CFO) and Dr. M. Achieng (CMO), collectively 'the Founders', to govern the formation and early operation of BEYU Holding Company Ltd, the operating arm of the BEYU Family Trust." },
      { heading: "2. Equity Allocation at Founding",
        body: "Founders shall receive Class A Common Shares of BEYU Holding Co. as follows: Dr. John Doe — 40%; Edith Sanga — 30%; Dr. M. Achieng — 30%. All Founder shares are held under the BEYU Family Trust for the benefit of the Founders and their nominated heirs." },
      { heading: "3. Vesting Schedule",
        body: "All Founder shares vest over four (4) years with a one (1) year cliff. Upon the cliff date, 25% of each Founder's shares vest. Thereafter shares vest monthly in equal instalments. Acceleration of vesting occurs only on (a) qualifying acquisition, or (b) involuntary termination without Cause as defined in §7." },
      { heading: "4. Roles & Time Commitment",
        body: "Each Founder commits full-time to BEYU. Outside engagements require written approval from the other Founders. Time commitment is reviewed quarterly by the Board." },
      { heading: "5. Decision-Making",
        body: "Day-to-day decisions are made by the CEO. Strategic decisions (fundraising, acquisitions, clinical safety policy, sovereign jurisdiction entry) require unanimous Founder consent until Series A close, and majority Board consent thereafter." },
      { heading: "6. Intellectual Property",
        body: "All IP created by a Founder before, during or in connection with BEYU activities is irrevocably assigned to BEYU Holding Co. via the IP Assignment Agreement (DOC-IP-001)." },
      { heading: "7. Cause Termination",
        body: "A Founder may be removed for Cause: (a) material breach of fiduciary duty; (b) felony conviction; (c) gross negligence; (d) prolonged incapacity > 180 days. Removal requires unanimous consent of the remaining Founders and the Board." },
      { heading: "8. Anchor & Governance",
        body: "This Agreement is hashed and anchored to BeyuTrustRegistry.sol. Any amendment requires re-signing by all Founders and re-anchoring on-chain." },
    ],
  },

  /* ─── 2. INCORPORATION DOCUMENTS ─── */
  {
    id: "DOC-INC-001",
    title: "Certificate of Incorporation — BEYU Holding Co. Ltd",
    type: "Incorporation",
    category: "Company Records",
    status: "Active",
    version: "Original",
    effective: "2024-08-12",
    hash: "0x9a4f...c12e",
    onChain: true,
    smartContract: "BeyuTrustRegistry.sol",
    modules: ["smart-contracts", "vault", "hierarchy"],
    summary:
      "Certificate of incorporation issued by the Business Registrations and Licensing Agency (BRELA) of the United Republic of Tanzania.",
    sections: [
      { heading: "Certificate Particulars",
        body: "Company Name: BEYU HOLDING COMPANY LIMITED · Registration No: 169283042 · Date of Incorporation: 12 August 2024 · Place: Dar es Salaam, United Republic of Tanzania · Issued by: BRELA under the Companies Act, Cap 212 R.E. 2002." },
      { heading: "Memorandum & Articles of Association",
        body: "Filed concurrently. Authorised share capital: TZS 100,000,000 divided into 10,000,000 ordinary shares of TZS 10 each. Two share classes: Class A Common (Founders + ESOP) and Class B Preferred (Investors)." },
      { heading: "Registered Office",
        body: "Plot No. 482, Bagamoyo Road, Mikocheni B, P.O. Box 12345, Dar es Salaam, Tanzania." },
      { heading: "Directors at Incorporation",
        body: "Dr. John Doe (Chairman & CEO), Edith Sanga (CFO), Dr. M. Achieng (CMO), Mama Doe (Trustee — BEYU Family Trust)." },
      { heading: "Linked Filings",
        body: "BRELA Annual Returns (DOC-COMP-001), TRA Tax Clearance (DOC-COMP-002), TRA VAT Registration (DOC-COMP-003), UBO Filing (DOC-COMP-004), MoH Software License Approval (DOC-COMP-005), TCRA Data Service Provider Approval (DOC-COMP-006)." },
    ],
  },

  /* ─── 3. CO-FOUNDER EXIT CLAUSE ─── */
  {
    id: "DOC-FND-002",
    title: "Co-Founder Exit & Vesting Acceleration Clause",
    type: "Exit Clause",
    category: "Founding Documents",
    status: "Signed",
    version: "v1.0",
    effective: "2024-06-01",
    parties: ["All 3 Founders"],
    hash: "0x54ee...52fb",
    onChain: true,
    smartContract: "BeyuESOPVesting.sol",
    modules: ["smart-contracts", "vault", "hr"],
    summary:
      "Defines what happens to a departing co-founder's equity, IP and obligations under good-leaver and bad-leaver scenarios.",
    sections: [
      { heading: "1. Good Leaver Events",
        body: "Death, permanent disability, mutually agreed amicable departure, or removal without Cause. Good Leavers retain 100% of vested shares; unvested shares revert to the ESOP Pool. A 6-month transition period applies." },
      { heading: "2. Bad Leaver Events",
        body: "Voluntary departure within the first 36 months, breach of restrictive covenants, or termination for Cause as defined in the Founders' Agreement (DOC-FND-001 §7). Bad Leavers forfeit 50% of vested shares and 100% of unvested shares back to the Company at par value (TZS 10/share)." },
      { heading: "3. Right of First Refusal (ROFR)",
        body: "Any transfer of Founder shares (including by Good Leaver) is subject to ROFR by the remaining Founders pro-rata, then by the Company, then by Class B Investors. Transfer permitted only after ROFR window of 30 days has lapsed." },
      { heading: "4. Restrictive Covenants",
        body: "Departing Founders are bound for 24 months by (a) non-compete in healthcare SaaS in East Africa, (b) non-solicitation of BEYU employees and clinical tenants, and (c) non-disparagement." },
      { heading: "5. IP & Confidentiality on Exit",
        body: "All IP, source code, datasets, models, customer lists and trade secrets remain BEYU property. NDA (DOC-NDA-001) continues indefinitely for trade secrets and 5 years for confidential information." },
      { heading: "6. On-Chain Execution",
        body: "Vesting acceleration / forfeiture is executed automatically by BeyuESOPVesting.sol upon a Trustee-signed exit transaction. Disputes resolve to arbitration under §9." },
    ],
  },

  /* ─── 4. SHAREHOLDERS AGREEMENT ─── */
  {
    id: "DOC-SHA-001",
    title: "Shareholders Agreement (SHA)",
    type: "SHA",
    category: "Founding Documents",
    status: "Signed",
    version: "v3.0 (post-Seed)",
    effective: "2025-03-15",
    parties: ["BEYU Family Trust (Class A)", "Acumen Fund", "Novastar Ventures", "Angel Syndicate", "Advisors"],
    hash: "0x43ff...630a",
    onChain: true,
    smartContract: "BeyuCapTable.sol",
    modules: ["smart-contracts", "vault", "planning", "hierarchy"],
    summary:
      "Governs the relationship between all shareholders of BEYU Holding Co., including board composition, protective provisions, transfer restrictions and exit rights.",
    sections: [
      { heading: "1. Share Classes & Rights",
        body: "Class A (Common): 1 vote per share, ordinary dividend. Class B (Preferred): 1 vote per share + 1× non-participating liquidation preference, anti-dilution (broad-based weighted average), pro-rata participation rights." },
      { heading: "2. Board Composition",
        body: "Five (5) directors: 2 nominated by Class A (Founders/Trust), 1 by Acumen, 1 by Novastar, 1 Independent appointed by majority. CEO chairs the Board." },
      { heading: "3. Protective Provisions (Investor Consent Required)",
        body: "(a) Change to share structure; (b) Issuance of senior security; (c) Sale of >25% of assets; (d) Acquisition or merger; (e) Annual budget approval; (f) Hiring/firing C-suite; (g) Material change to clinical safety policy; (h) Cross-border PHI transfer." },
      { heading: "4. Transfer Restrictions",
        body: "ROFR + co-sale (tag-along) rights apply to all share transfers. Drag-along applies above 60% acceptance for an exit transaction." },
      { heading: "5. Reserved Founder Matters",
        body: "Despite the above, the BEYU Family Trust retains a constitutional veto on matters touching: patient safety, AI Hive kill-switch, ownership succession and trust-deed amendments." },
      { heading: "6. Information Rights",
        body: "All shareholders receive quarterly financials and annual audited accounts. Class B receives monthly KPIs, board pack and budget vs. actual." },
      { heading: "7. Exit",
        body: "Investors may request a liquidity event after 5 years (IPO, secondary sale, or trade sale). The Board shall in good faith pursue an exit yielding ≥ 3× preferred return." },
    ],
  },

  /* ─── 5. CAP TABLE ─── */
  {
    id: "DOC-CAP-001",
    title: "Capitalization Table — Q1 2026",
    type: "Cap Table",
    category: "Equity & Cap Table",
    status: "Active",
    version: "Q1-2026",
    effective: "2026-03-31",
    hash: "0x2111...8528",
    onChain: true,
    smartContract: "BeyuCapTable.sol (ERC-1400)",
    modules: ["smart-contracts", "vault", "planning"],
    summary:
      "Live ownership register of BEYU Holding Co. tokenized as security tokens on a private EVM ledger with transfer restrictions per the SHA.",
    sections: [
      { heading: "Issued Shares (Post-Money)",
        body: "Total: 10,000,000 shares. BEYU Family Trust 5,500,000 (55.0%, Class A); ESOP Pool 1,500,000 (15.0%, reserved); Acumen Fund 1,200,000 (12.0%, Class B); Novastar Ventures 800,000 (8.0%, Class B); Angel Syndicate (10) 500,000 (5.0%, Class B); Advisors (vested) 300,000 (3.0%, Class A); Unallocated 200,000 (2.0%)." },
      { heading: "Round History",
        body: "Founding (Jun 2024) — Post: TZS 200M. Friends & Family (Nov 2024) — Raised TZS 180M, Post: TZS 500M. Seed SAFE (Nov 2025) — Raised USD 1.2M, Cap USD 8M. Series A Term Sheet (Mar 2026) — Pre USD 20M, raising USD 5M." },
      { heading: "Fully Diluted Calculation",
        body: "Includes all issued shares + ESOP pool + outstanding SAFEs (converted at cap) + advisor options vested and unvested. Recalculated automatically on any BeyuCapTable.sol event." },
      { heading: "Transfer Restrictions",
        body: "All transfers gated by the SHA (DOC-SHA-001) and enforced at the smart-contract level (ERC-1400 partitions). Off-ledger transfers are deemed void." },
    ],
  },

  /* ─── 6. ESOP AGREEMENT ─── */
  {
    id: "DOC-ESOP-001",
    title: "BEYU 2025 Equity Incentive Plan (ESOP)",
    type: "ESOP",
    category: "Equity & Cap Table",
    status: "Active",
    version: "v1.2",
    effective: "2025-09-10",
    parties: ["BEYU Holding Co.", "Eligible Employees & Consultants"],
    hash: "0x1022...9637",
    onChain: true,
    smartContract: "BeyuESOPVesting.sol",
    modules: ["smart-contracts", "vault", "hr"],
    summary:
      "Stock option pool of 1,500,000 Class A shares with a standard 4-year vesting, 1-year cliff schedule, governed by Board-approved grants.",
    sections: [
      { heading: "1. Pool Size & Eligibility",
        body: "Total pool: 1,500,000 Class A shares. Eligible: full-time employees (≥ 6 months tenure), key consultants, advisors, and clinical leadership. Patient-facing staff at tenant hospitals are NOT eligible." },
      { heading: "2. Vesting Schedule",
        body: "Standard: 4-year monthly vest with 1-year cliff. On cliff date 25% vest; thereafter 1/48 vests on each subsequent month-end. Vesting tracked on BeyuESOPVesting.sol; tokens become transferable upon vesting." },
      { heading: "3. Exercise",
        body: "Exercise price = fair market value at grant. Exercise window 90 days post-departure (Good Leaver) or immediate forfeiture (Bad Leaver). Cashless exercise via tender offer permitted." },
      { heading: "4. Acceleration",
        body: "Single-trigger: none. Double-trigger: 100% acceleration on (a) change of control AND (b) termination without Cause within 12 months." },
      { heading: "5. Grant Process",
            body: "All grants approved by the Compensation Committee. Top 5 active grants: Dr. M. Achieng 120,000; Edith Sanga 90,000; Dr. Salim Said 50,000; Grace Mushi 30,000; Ahmed Bakari 25,000." },
      { heading: "6. Tax Treatment",
        body: "Grants are structured as Stock Options under Tanzanian Income Tax Act. Withholding handled by BEYU payroll at exercise. Employees are advised to seek independent tax advice." },
    ],
  },

  /* ─── 7. NDA ─── */
  {
    id: "DOC-NDA-001",
    title: "Mutual Non-Disclosure Agreement (NDA) — Template",
    type: "NDA",
    category: "IP & Confidentiality",
    status: "Active",
    version: "v3.4",
    effective: "2026-01-22",
    hash: "0xed55...c964",
    onChain: true,
    smartContract: "BeyuDocSign.sol",
    modules: ["smart-contracts", "vault", "ip", "hr"],
    summary:
      "Mutual NDA used with every counterparty (investors, tenants, suppliers, consultants) before exchanging confidential information.",
    sections: [
      { heading: "1. Parties & Purpose",
        body: "This Mutual NDA is entered between [Counterparty] and BEYU HOLDING COMPANY LIMITED for the purpose of evaluating a potential business relationship in healthcare technology." },
      { heading: "2. Definition of Confidential Information",
        body: "Includes (a) source code, AI models, architectures; (b) clinical workflows and tenant data flows; (c) financial information and cap table; (d) patient identifiers (always treated as PHI under DPA 2022); (e) any marked 'Confidential' or reasonably understood to be confidential." },
      { heading: "3. Obligations",
        body: "Each Party shall (a) use Confidential Information solely for the Purpose; (b) protect it with at least the same degree of care as its own confidential information (and never less than reasonable care); (c) restrict access to a need-to-know basis under written confidentiality obligations." },
      { heading: "4. Exclusions",
        body: "Information that is (i) publicly known, (ii) independently developed, (iii) lawfully received from a third party, or (iv) required to be disclosed by law (with prior notice where possible)." },
      { heading: "5. Term",
        body: "5 years from disclosure for Confidential Information; INDEFINITE for trade secrets and any PHI." },
      { heading: "6. Patient Health Information",
        body: "PHI is subject to additional safeguards under the Tanzania Data Protection Act 2022, GDPR (where applicable) and the BEYU Privacy Policy (DOC-POL-002). De-identification per Safe Harbor + Expert Determination." },
      { heading: "7. Remedies",
        body: "Injunctive relief is available in addition to damages. Governing law: Tanzania. Disputes resolved by arbitration in Dar es Salaam under TIAC rules." },
    ],
  },

  /* ─── 8. IP ASSIGNMENT ─── */
  {
    id: "DOC-IP-001",
    title: "Intellectual Property Assignment Agreement",
    type: "IP Assignment",
    category: "IP & Confidentiality",
    status: "Signed",
    version: "v2.0",
    effective: "2026-02-10",
    parties: ["All 42 BEYU Engineers", "BEYU Holding Co."],
    hash: "0xdc66...da73",
    onChain: true,
    smartContract: "BeyuDocSign.sol",
    modules: ["smart-contracts", "vault", "ip", "hr"],
    summary:
      "Irrevocable assignment of all work-product, inventions, copyrights and AI model weights created by employees and contractors to BEYU Holding Co.",
    sections: [
      { heading: "1. Scope of Assignment",
        body: "Assignee irrevocably assigns to BEYU Holding Co. all right, title and interest in all Inventions, software, AI model weights, datasets, prompts, prompt-engineering chains, designs, written works, trademarks and improvements conceived during the term of engagement." },
      { heading: "2. Prior Inventions",
        body: "Schedule A lists any prior inventions excluded from this assignment. If left blank, Assignee warrants that no prior inventions exist." },
      { heading: "3. Moral Rights Waiver",
        body: "To the maximum extent permitted by law, Assignee waives moral rights in the Work Product and consents to its modification, attribution and use by BEYU." },
      { heading: "4. Open-Source Compliance",
        body: "Assignee shall not incorporate open-source code under copyleft licenses (GPL, AGPL) into BEYU products without prior written consent of the CTO. Permitted licenses: MIT, Apache-2.0, BSD." },
      { heading: "5. Government Rights",
        body: "Where work is funded by grants (e.g., MoH, EAC, NIH), BEYU complies with applicable grantor IP terms while preserving commercial rights wherever permitted." },
      { heading: "6. Survival",
        body: "Sections 1, 2, 3 and 4 survive termination of engagement." },
    ],
  },

  /* ─── 9. TRADEMARK ─── */
  {
    id: "DOC-TM-001",
    title: "Trademark Registration — “BEYU” (TZ-2025-4421)",
    type: "Trademark",
    category: "IP & Confidentiality",
    status: "Active",
    version: "Granted",
    effective: "2025-05-12",
    hash: "0xcb77...eb82",
    onChain: true,
    modules: ["vault", "ip"],
    summary:
      "Registered trademark of the BEYU wordmark and Family Trust logo (tree-in-circle) under the Tanzania Trade and Service Marks Act.",
    sections: [
      { heading: "Mark Particulars",
        body: "Mark: BEYU (and design — circular B with tree of leaves, gold/navy palette). Class 9 (software), Class 42 (SaaS), Class 44 (medical services). Registration No: TZ-2025-4421. Granted: 12 May 2025. Renewal: every 10 years (next 12 May 2035)." },
      { heading: "Related Filings",
        body: "BEYU Health OS (EAC regional filing, DOC-TM-002); Madrid Protocol designating KE, UG, RW, ZA, NG (filed 2025-09-30, pending)." },
      { heading: "Brand Usage Guidelines",
        body: "All public usage must follow the BEYU Brand Guidelines. Logo must be reproduced exactly as registered. Misuse should be reported to brand@beyu.health." },
      { heading: "Enforcement",
        body: "Watch service active via TRA-IP Bureau and Markify. Two cease-and-desist letters issued in 2025 (both resolved amicably)." },
    ],
  },

  /* ─── 10. EMPLOYEE CONTRACT ─── */
  {
    id: "DOC-HR-001",
    title: "Employee Contract — Standard Template v4",
    type: "Employment Contract",
    category: "Employment",
    status: "Active",
    version: "v4.1",
    effective: "2026-02-01",
    hash: "0x98aa...1ebf",
    onChain: false,
    modules: ["hr", "vault"],
    summary:
      "Standard employment contract used for all BEYU staff under the Tanzanian Employment and Labour Relations Act 2004.",
    sections: [
      { heading: "1. Position & Reporting",
        body: "Employee is engaged in the position of [Role] reporting to [Manager]. Place of work: [Office / Hospital]. Effective date: [Date]." },
      { heading: "2. Probation",
        body: "Six (6) months probation. During probation, either party may terminate on 7 days' written notice." },
      { heading: "3. Compensation",
        body: "Gross monthly salary: TZS [Amount]. Payable on or before the 28th of each month by direct deposit. Annual review aligned with calendar year." },
      { heading: "4. Benefits",
        body: "Medical insurance covering employee + 3 dependents (NHIF top-up via Jubilee). NSSF and PSSSF contributions per statute. 28 days paid leave per year. 12 days sick leave. 84 days maternity / 7 days paternity." },
      { heading: "5. Confidentiality & IP",
        body: "Employee is bound by the Mutual NDA (DOC-NDA-001) and the IP Assignment Agreement (DOC-IP-001), both of which are incorporated by reference." },
      { heading: "6. Restrictive Covenants",
        body: "12-month non-solicitation of BEYU employees, tenants and patients. 6-month non-compete in East African healthcare SaaS, geographically limited to operating jurisdictions." },
      { heading: "7. Termination",
        body: "Notice period after probation: 30 days. Summary dismissal for gross misconduct as defined in the Employment Act. Severance per statute." },
      { heading: "8. Code of Conduct",
        body: "Employee agrees to comply with the BEYU HR Policy Handbook (DOC-POL-001), Code of Conduct, Anti-Bribery Policy, and all applicable clinical and regulatory standards." },
    ],
  },

  /* ─── 11. OFFER LETTER ─── */
  {
    id: "DOC-HR-002",
    title: "Senior Offer Letter — Template",
    type: "Offer Letter",
    category: "Employment",
    status: "Active",
    version: "v4.1",
    effective: "2026-02-01",
    hash: "0x87bb...2fce",
    onChain: false,
    modules: ["hr", "vault"],
    summary:
      "Standard offer letter template for senior hires, including base salary, signing bonus, ESOP grant and start date.",
    sections: [
      { heading: "Subject",
        body: "Offer of Employment — [Position] at BEYU Holding Company Ltd" },
      { heading: "Dear [Candidate Name],",
        body: "We are delighted to extend you the following offer to join BEYU and help us bridge care, build trust, and transform healthcare for generations." },
      { heading: "1. Position",
        body: "[Position Title], reporting to [Reporting Manager]. Start date: [Date]. Location: Dar es Salaam (hybrid)." },
      { heading: "2. Compensation",
        body: "Gross annual salary: TZS [Amount], payable monthly. Annual performance bonus: target 20% of base, subject to Board approval. Signing bonus: TZS [Amount] payable on completion of probation." },
      { heading: "3. Equity (ESOP)",
        body: "You will be granted [Shares] options under the BEYU 2025 Equity Incentive Plan (DOC-ESOP-001) with a 4-year monthly vest and 1-year cliff. Strike price set on the grant date by the Compensation Committee." },
      { heading: "4. Benefits",
        body: "Full benefits package per Employee Contract (DOC-HR-001) §4. Includes medical, retirement, leave and continuous-education allowance of TZS 2,000,000/year." },
      { heading: "5. Conditions Precedent",
        body: "This offer is conditional on (a) satisfactory references; (b) verified credentials (MCT, professional licenses); (c) execution of Employee Contract, NDA (DOC-NDA-001) and IP Assignment (DOC-IP-001)." },
      { heading: "6. Acceptance",
        body: "Please confirm acceptance by signing below within 7 days. We look forward to welcoming you to the BEYU family." },
      { heading: "Signed", body: "_______________________ Dr. John Doe, CEO · BEYU Holding Co." },
    ],
  },

  /* ─── 12. HR POLICY ─── */
  {
    id: "DOC-POL-001",
    title: "HR Policy Handbook 2026",
    type: "HR Policy",
    category: "Employment",
    status: "Active",
    version: "2026.1",
    effective: "2026-01-15",
    hash: "0x65dd...41ec",
    onChain: false,
    modules: ["hr", "vault", "settings"],
    summary:
      "Master handbook governing employment policies, conduct, leave, performance, grievance and disciplinary procedures at BEYU.",
    sections: [
      { heading: "1. Working Hours & Remote Work",
        body: "Standard hours 08:00–17:00 Mon–Fri with a one-hour lunch break. Clinical staff follow ward roster patterns. Knowledge workers may work hybrid (3 days office, 2 days remote) subject to manager approval." },
      { heading: "2. Leave Policies",
        body: "Annual: 28 days. Sick: 12 days (medical certificate after 2 days). Maternity: 84 days at full pay. Paternity: 7 days. Compassionate: 5 days. Sabbatical: unpaid, after 5 years, max 6 months." },
      { heading: "3. Performance Management",
        body: "Quarterly OKRs (DOC-PLAN-001 framework). Annual reviews in November with calibration. Underperformance: Performance Improvement Plan (PIP) of 60 days before termination consideration." },
      { heading: "4. Code of Conduct",
        body: "Zero tolerance for harassment, discrimination, bribery, falsification of clinical records, and unauthorized PHI access. Violations reported via whistleblower@beyu.health (anonymous channel)." },
      { heading: "5. Clinical Conduct",
        body: "All clinical staff must hold active professional licenses (MCT, TNMC, PCT). Annual CPD requirements per regulator. All clinical decisions logged in EMR with timestamp and signature." },
      { heading: "6. Health & Safety",
        body: "Mandatory training: infection control, fire safety, BLS (clinical staff also ACLS / PALS where applicable). Incident reporting via Hive AI Incident module." },
      { heading: "7. Grievance & Discipline",
        body: "Three-stage grievance: informal → formal written → HR Director appeal. Disciplinary: verbal warning → written warning → final warning → dismissal. Right to representation throughout." },
      { heading: "8. Data Protection",
        body: "All employees must complete annual DPA training. PHI access governed by least-privilege RBAC and audited via the Hive Audit module." },
    ],
  },

  /* ─── 13. TERMS OF SERVICE ─── */
  {
    id: "DOC-POL-002",
    title: "Terms of Service — beyuhealth.org",
    type: "Terms of Service",
    category: "Policies & Public",
    status: "Active",
    version: "v5.0",
    effective: "2026-02-28",
    hash: "0x43ff...630a",
    onChain: false,
    modules: ["public-policies", "vault", "settings"],
    summary:
      "Terms governing use of the BEYU Health OS platform, patient mobile app, and the BEYU website by tenants, clinicians and patients.",
    sections: [
      { heading: "1. Acceptance of Terms",
        body: "By accessing or using BEYU Health OS, you agree to these Terms. If you are using on behalf of an organization (tenant hospital, clinic, lab), you represent that you are authorized to bind that organization." },
      { heading: "2. Service Description",
        body: "BEYU Health OS is a multi-tenant healthcare operating platform providing EMR, ERP, AI Co-Pilot, telemedicine, NHIF integration, and related services. Service availability target: 99.95% measured monthly." },
      { heading: "3. User Accounts & RBAC",
        body: "All access is via authenticated accounts with role-based permissions. Tenants are responsible for managing user roles within their organization." },
      { heading: "4. Clinical Disclaimer",
        body: "BEYU AI Co-Pilot provides decision SUPPORT only. All clinical decisions and final authority rest with the licensed healthcare provider. BEYU is not a substitute for clinical judgment." },
      { heading: "5. Acceptable Use",
        body: "You shall not (a) attempt to access another tenant's data; (b) reverse-engineer the Hive Runtime; (c) introduce malware; (d) use the Service to harass or defraud; (e) violate applicable laws including the DPA 2022." },
      { heading: "6. Fees & Payment",
        body: "Subscription fees per the Order Form. Patient-facing services are free for patients; tenants are billed per active patient per month (PAPM)." },
      { heading: "7. Limitation of Liability",
        body: "To the maximum extent permitted by law, BEYU's aggregate liability is capped at fees paid in the 12 months preceding the claim. No liability for indirect or consequential damages." },
      { heading: "8. Termination",
        body: "Either party may terminate for material breach uncured within 30 days. On termination, tenants receive an export of their data within 30 days in FHIR R5 format." },
      { heading: "9. Governing Law",
        body: "Tanzania. Disputes: arbitration in Dar es Salaam under TIAC rules. Class action waiver applies." },
    ],
  },

  /* ─── 14. PRIVACY POLICY ─── */
  {
    id: "DOC-POL-003",
    title: "Privacy Policy (Patient + Tenant)",
    type: "Privacy Policy",
    category: "Policies & Public",
    status: "Active",
    version: "v5.0",
    effective: "2026-02-28",
    hash: "0x3200...7419",
    onChain: false,
    modules: ["public-policies", "vault", "settings", "sovereign"],
    summary:
      "How BEYU collects, processes, stores and shares personal health information under the Tanzania Data Protection Act 2022 and GDPR.",
    sections: [
      { heading: "1. Data Controller & Processor",
        body: "For patient records, the tenant hospital is the Data Controller; BEYU Holding Co. is the Data Processor under a Data Processing Agreement (DOC-COMP-007). For platform-level data, BEYU is the Controller." },
      { heading: "2. Categories of Data Collected",
        body: "(a) Identity: name, NIDA, contact details, biometrics. (b) Health: diagnoses, treatments, prescriptions, imaging, lab results. (c) Insurance: NHIF #, scheme details, claims. (d) Usage: audit logs of platform access." },
      { heading: "3. Lawful Basis",
        body: "Provision of healthcare services (contract / vital interests); legal obligation (MTUHA reporting); consent (cross-tenant sharing, telemedicine recording, research participation)." },
      { heading: "4. Patient Rights",
        body: "Right to access, rectification, erasure (where legally permitted), restriction, portability (FHIR export) and objection. Requests handled within 30 days via privacy@beyu.health." },
      { heading: "5. Cross-Border Transfers",
        body: "PHI does NOT leave its sovereign cluster unless the patient grants explicit consent via BeyuConsent.sol. Backups remain within jurisdiction." },
      { heading: "6. Retention",
        body: "Clinical records: minimum 10 years from last encounter per Tanzanian regulation. Audit logs: 7 years. Deleted on tenant offboarding per data deletion certificate." },
      { heading: "7. Security",
        body: "AES-256 at rest, TLS 1.3 in transit, field-level encryption for PHI. Zero-trust architecture, MFA mandatory, biometric for clinical access." },
      { heading: "8. Breach Notification",
        body: "BEYU notifies affected tenants within 24 hours and regulators (DPA, MoH) within 72 hours of confirmed breach involving PHI." },
      { heading: "9. Contact",
        body: "Data Protection Officer: dpo@beyu.health · P.O. Box 12345, Dar es Salaam, Tanzania." },
    ],
  },

  /* ─── 15. LEGAL COMPLIANCE DOCS ─── */
  {
    id: "DOC-COMP-001",
    title: "Legal Compliance Register — 2026",
    type: "Legal Compliance",
    category: "Compliance",
    status: "Active",
    version: "2026.Q1",
    effective: "2026-01-01",
    hash: "0x2b77...e538",
    onChain: false,
    modules: ["vault", "settings"],
    summary:
      "Master register of all legal and regulatory obligations across the jurisdictions BEYU operates in, with renewal dates and responsible owners.",
    sections: [
      { heading: "Statutory Filings (Tanzania)",
        body: "BRELA Annual Returns (Jan 31). TRA Tax Clearance (renewal Jul 10). TRA VAT (monthly returns by 20th). UBO Filing (annual, Feb 5). NSSF & PSSSF monthly remittance. SDL (Skills Development Levy) monthly. WCF annual contribution." },
      { heading: "Sector Approvals",
        body: "Ministry of Health Software License (renewal Nov 22, 2027). TCRA Data Service Provider Approval. Medical Council of Tanganyika professional licenses for all clinical staff. TFDA where dispensing medications." },
      { heading: "Data Protection",
        body: "Registration with the Personal Data Protection Commission. Annual DPIA refresh. Cross-border transfer mechanisms documented. Standard Contractual Clauses with cloud processors." },
      { heading: "Insurance Cover (Active)",
        body: "Professional Indemnity (Sanlam TZ) — TZS 5 Bn cover. Cyber Liability (Jubilee) — USD 2M cover. Workers' Compensation (WCF). Directors & Officers — pending Series A close." },
      { heading: "Contractual Compliance",
        body: "Master Supplier Terms (DOC-SUP-001) signed with 28 suppliers. Data Processing Agreements with all sub-processors. Tenant Service Agreements with 5 active hospitals." },
    ],
  },

  /* ─── 16. PITCH DECK ─── */
  {
    id: "DOC-INV-001",
    title: "BEYU Health OS — Series A Pitch Deck (v12)",
    type: "Pitch Deck",
    category: "Investor Materials",
    status: "Active",
    version: "v12",
    effective: "2026-03-20",
    hash: "0x0f33...a746",
    onChain: false,
    modules: ["planning", "vault"],
    summary:
      "14-slide pitch deck used in the Series A roadshow — problem, solution, traction, market, business model, team and ask.",
    sections: [
      { heading: "Slide 1 — Cover",
        body: "BEYU Health OS — Bridging Care. Building Trust. Transforming Healthcare for Generations. Series A · USD 5M @ USD 20M pre." },
      { heading: "Slide 2 — Problem",
        body: "African healthcare runs on paper or disconnected legacy software. 78% of African hospitals lack an integrated EMR. NHIF claim denial rates exceed 30% due to manual coding errors. Patient records die at the gate of every hospital." },
      { heading: "Slide 3 — Solution",
        body: "One healthcare operating platform: EMR + ERP + AI + Patient ID + Telemedicine + NHIF. Multi-tenant, offline-first, sovereign by jurisdiction. Hive AI Runtime — specialized agents, human-controlled." },
      { heading: "Slide 4 — Product Demo",
        body: "Screens: CEO dashboard, doctor workstation, patient mobile app, Dental AI odontogram, Radiology PACS with AI triage." },
      { heading: "Slide 5 — Traction (T-12)",
        body: "5 tenants live (Muhimbili, Aga Khan, Arusha LMC, BEYU Mwanza, Moshi RRH). 12,458 active patients. TZS 324M MRR equivalent. 92.4% NHIF claim success vs 70% market average. 99.97% uptime." },
      { heading: "Slide 6 — Market",
        body: "TAM (East Africa healthcare IT): USD 1.4 Bn growing 18% CAGR. SAM (clinical SaaS): USD 380M. SOM (multi-tenant cloud): USD 92M by 2028." },
      { heading: "Slide 7 — Business Model",
        body: "PAPM (Per Active Patient Per Month): USD 0.45 base. Add-ons: Dental AI USD 0.10, Radiology AI USD 0.15, Telemed USD 0.05. Average tenant ARPU: USD 3,800/month." },
      { heading: "Slide 8 — Unit Economics",
        body: "CAC USD 4,200 per tenant · Payback 14 months · Gross margin 78% · NRR 128%." },
      { heading: "Slide 9 — Competition",
        body: "Versus Epic/Cerner (too expensive, no African workflows), OpenMRS (DIY), local point solutions (fragmented). BEYU is the only multi-tenant, AI-native, sovereign-ready stack built for Africa." },
      { heading: "Slide 10 — Hive AI & Governance",
        body: "Hive Runtime: 12 specialized agents, deterministic orchestration, human-in-the-loop, dual sign-off kill switch. Governed by trust hierarchy and DAO with Trustee veto." },
      { heading: "Slide 11 — Team",
        body: "Dr. John Doe (CEO, ex-Aga Khan), Edith Sanga (CFO, ex-CRDB), Dr. M. Achieng (CMO, ex-Muhimbili). 42 engineers, 12 clinical advisors." },
      { heading: "Slide 12 — Financial Model",
        body: "Detailed in DOC-INV-002. Path to USD 18M ARR by 2028. Break-even Q4 2027." },
      { heading: "Slide 13 — Use of Funds",
        body: "40% engineering (AI + offline-first), 25% clinical onboarding, 20% expansion KE/UG/RW, 10% compliance & security, 5% reserve." },
      { heading: "Slide 14 — Ask",
        body: "USD 5M Series A · 20% dilution · Lead: Acumen + Novastar (term sheet signed). Closing target: Q2 2026." },
    ],
  },

  /* ─── 17. FINANCIAL MODEL ─── */
  {
    id: "DOC-INV-002",
    title: "5-Year Financial Model (Series A)",
    type: "Financial Model",
    category: "Investor Materials",
    status: "Active",
    version: "v8.3",
    effective: "2026-03-20",
    hash: "0xfe44...b855",
    onChain: false,
    modules: ["planning", "vault"],
    summary:
      "Bottoms-up financial model from 2026 to 2030 with revenue build, OpEx, headcount, cash flow and sensitivity analysis.",
    sections: [
      { heading: "Revenue Build (PAPM)",
        body: "2026: USD 1.4M · 2027: USD 4.2M · 2028: USD 9.8M · 2029: USD 18.6M · 2030: USD 31.4M. Drivers: tenants (5→48), avg patients/tenant (2,500→4,800), ARPU growth via AI add-ons." },
      { heading: "Gross Margin",
        body: "78% Y1 → 84% Y5 as cloud unit costs decline with scale and offline-first reduces redundant infra." },
      { heading: "Operating Expenses",
        body: "Engineering 42% → 32%, Clinical Onboarding 18% → 14%, S&M 12% → 18%, G&A 10% → 8%, Compliance 8% → 6%." },
      { heading: "Headcount Plan",
        body: "2026: 84 → 2027: 142 → 2028: 218 → 2029: 312 → 2030: 408. Engineering + clinical the bulk; expansion of GTM in Y3+." },
      { heading: "Cash Flow & Funding",
        body: "Series A USD 5M (Q2 2026). Series B target USD 15M (Q4 2027). Break-even Q4 2027. Free cash flow positive from 2028 onwards." },
      { heading: "Sensitivity Analysis",
        body: "Tornado on (a) tenant ARPU ±20%, (b) sales cycle ±3 months, (c) churn 5–12%, (d) FX TZS/USD. Worst-case extends break-even by 4 quarters." },
      { heading: "Key Assumptions",
        body: "Tenant churn: 5% annual. Patient growth per tenant: 8% quarterly. AI add-on attach rate: 60% Y1 → 90% Y5. NHIF reimbursement timing: 60 days DSO." },
    ],
  },

  /* ─── 18. TERM SHEET ─── */
  {
    id: "DOC-INV-003",
    title: "Series A Term Sheet — Acumen / Novastar",
    type: "Term Sheet",
    category: "Investor Materials",
    status: "Pending Signature",
    version: "v3 (executed by Lead)",
    effective: "2026-03-28",
    parties: ["Acumen Fund (Lead)", "Novastar Ventures", "BEYU Holding Co."],
    hash: "0xed55...c964",
    onChain: true,
    smartContract: "BeyuDocSign.sol",
    modules: ["smart-contracts", "vault", "planning"],
    summary:
      "Non-binding term sheet for the Series A round. Binding sections: confidentiality, exclusivity, expenses, governing law.",
    sections: [
      { heading: "Issuer",
        body: "BEYU Holding Company Limited, a private company limited by shares incorporated in Tanzania (Reg No. 169283042)." },
      { heading: "Securities",
        body: "Series A Preferred Shares (Class B) with rights as outlined in the Amended & Restated Shareholders Agreement (DOC-SHA-001 amendment)." },
      { heading: "Round Size",
        body: "USD 5,000,000. Lead Investor: Acumen Fund (USD 3,000,000). Co-investors: Novastar Ventures (USD 1,500,000), existing shareholders pro-rata (USD 500,000)." },
      { heading: "Valuation",
        body: "Pre-money: USD 20,000,000. Post-money: USD 25,000,000. Implied dilution: 20%. Option pool top-up to 15% (pre-money)." },
      { heading: "Liquidation Preference",
        body: "1× non-participating, with broad-based weighted average anti-dilution protection." },
      { heading: "Board Composition",
        body: "Total 5 seats: 2 Class A (Founders/Trust), 1 Acumen, 1 Novastar, 1 Independent (mutually agreed). CEO chairs." },
      { heading: "Protective Provisions",
        body: "Standard NVCA-style + Africa-specific: (i) cross-border PHI transfer requires Lead consent, (ii) any change to Hive AI safety policy requires Lead consent." },
      { heading: "Information Rights",
        body: "Monthly KPI pack, quarterly financials, annual audited accounts, board pack 5 days before each meeting." },
      { heading: "Founder Vesting",
        body: "Existing founder vesting (DOC-FND-001) confirmed and continues. Double-trigger acceleration on change of control." },
      { heading: "Closing Conditions",
        body: "(a) Satisfactory legal & technical DD; (b) Refreshed cap table and SHA; (c) Renewal of insurance cover; (d) IP Assignment from all founders/employees confirmed; (e) Trust deed reviewed by Investor counsel." },
      { heading: "Exclusivity & Confidentiality",
        body: "Exclusivity: 60 days from signature. Confidentiality: binding until Closing or 12 months from signature, whichever later." },
      { heading: "Expenses",
        body: "BEYU to pay Investor legal expenses up to USD 50,000 (capped) on Closing." },
      { heading: "Governing Law",
        body: "Mauritius for the share subscription documents; Tanzania for the operating entity. Disputes: LCIA arbitration in London." },
    ],
  },
];

/* ─────────────────────────── Helpers ─────────────────────────── */

export function docsForModule(m: DocModule): BeyuDoc[] {
  return BEYU_DOCS.filter((d) => d.modules.includes(m));
}

export function docById(id: string): BeyuDoc | undefined {
  return BEYU_DOCS.find((d) => d.id === id);
}

export const DOC_TYPE_ICON: Record<BeyuDoc["type"], string> = {
  "Founders Agreement": "star",
  "Incorporation": "building",
  "Exit Clause": "logout",
  "SHA": "scale",
  "Cap Table": "cash",
  "ESOP": "cash",
  "NDA": "lock",
  "IP Assignment": "bulb",
  "Trademark": "star",
  "Employment Contract": "users",
  "Offer Letter": "doc",
  "HR Policy": "doc",
  "Terms of Service": "globe",
  "Privacy Policy": "shield",
  "Legal Compliance": "check",
  "Pitch Deck": "analytics",
  "Financial Model": "analytics",
  "Term Sheet": "doc",
};
