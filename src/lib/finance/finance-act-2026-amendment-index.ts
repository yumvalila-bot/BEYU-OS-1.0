/**
 * Non-executable index of selected tax-relevant amendments in Tanzania's
 * Finance Act No. 2 of 2026. This is not a tax-rule registry.
 *
 * Every item requires consolidation against the amended principal Act,
 * relevant regulations/Gazette notices and specialist review before use.
 */
export type FinanceAct2026Domain =
  | "INCOME_TAX"
  | "TAX_ADMINISTRATION"
  | "VAT"
  | "EXCISE"
  | "CUSTOMS_AND_IMPORTS";

export type FinanceAct2026Change = {
  code: string;
  domain: FinanceAct2026Domain;
  principalAct: string;
  principalProvision: string;
  financeActProvision: string;
  summary: string;
  sourcePages: string;
  reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED";
  operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE";
  caveat: string;
};

const commonCaveat =
  "Do not use as a calculation or filing instruction. Confirm the consolidated principal Act, commencement/transitional provisions, applicable Gazette instruments and taxpayer facts with an authorized tax specialist.";

export const FINANCE_ACT_2026_CHANGE_INDEX: readonly FinanceAct2026Change[] = [
  {
    code: "FA2026_IT_S10_FRAMEWORK_AGREEMENTS",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 10(3)(b)",
    financeActProvision: "Finance Act No. 2 of 2026, section 21",
    summary: "Revises the agreement-based exemption categories, including specified mining framework agreements and strategic investments. The mining framework agreement exemption is limited to the construction phase and ceases when production commences.",
    sourcePages: "Printed pages 28–29",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_IT_S33A_DEEMED_DISTRIBUTION",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 33A",
    financeActProvision: "Finance Act No. 2 of 2026, section 22",
    summary: "Changes the percentage in section 33A(1) from thirty to fifteen and adds exclusions for DSE-listed companies, financial institutions, insurance companies and qualifying mining companies with a Government framework agreement.",
    sourcePages: "Printed page 29",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "Eligibility, the statutory definition of deemed distribution, exceptions and interaction with section 96(6) must be verified before any taxpayer-level assessment. " + commonCaveat,
  },
  {
    code: "FA2026_IT_S44_EXEMPT_GAIN_COST_BASIS",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 44(1)",
    financeActProvision: "Finance Act No. 2 of 2026, section 23",
    summary: "Replaces the proviso dealing with a later realization or transfer of an asset where an earlier gain was exempt, specifying the cost basis to be used for section 36 gain or loss purposes.",
    sourcePages: "Printed page 29",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "Asset history, exempt transfer basis and the full amended sections 36 and 44 must be reviewed together. " + commonCaveat,
  },
  {
    code: "FA2026_IT_S116_WORDING_CHANGE",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 116(1)",
    financeActProvision: "Finance Act No. 2 of 2026, section 24",
    summary: "Changes the word 'two' to 'three' in section 116(1). The operative period must be interpreted from the complete consolidated section before any due-date logic is changed.",
    sourcePages: "Printed page 29",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_IT_S116A_FOREST_PRODUCE",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 116A",
    financeActProvision: "Finance Act No. 2 of 2026, section 25",
    summary: "Replaces section 116A with a single-instalment regime for a defined instalment payer who is not a corporation and sells forest resources or forest produce. The Act states an instalment equal to two percent of gross payment, identifies payment-trigger events, defines gross payment by reference to the greatest of specified values, and provides for a certificate.",
    sourcePages: "Printed pages 29–31",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "Finance Act No. 11 of 2025, section 58, inserted the earlier section 116A at two percent and set its commencement for 1 January 2026. Finance Act No. 2 of 2026, section 25, repeals and replaces that section, retaining two percent but changing payment triggers and definitions. Reconcile transactions across the 1 July 2026 transition; verify the 2026 regulations and Local Government Finance Act forest-cess interface. Do not generalize to corporations or other forest-sector transactions. " + commonCaveat,
  },
  {
    code: "FA2026_IT_S118_SINGLE_INSTALMENT_LINK",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "Section 118(a)",
    financeActProvision: "Finance Act No. 2 of 2026, section 26",
    summary: "Adds a reference to a person who has paid single-instalment tax under section 116A to the specified section 118 category.",
    sourcePages: "Printed page 31",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_IT_FIRST_SCHEDULE_PRESUMPTIVE",
    domain: "INCOME_TAX",
    principalAct: "Income Tax Act, Cap. 332",
    principalProvision: "First Schedule, paragraph 2",
    financeActProvision: "Finance Act No. 2 of 2026, section 27",
    summary: "Raises the presumptive turnover threshold from TZS 100m to TZS 200m and substitutes the First Schedule table: NIL up to TZS 4m; TZS 100k or 3% of excess over TZS 4m for TZS 4m–7m depending on section 43 compliance; TZS 250k or TZS 90k plus 3% of excess over TZS 7m for TZS 7m–11m; and 4.0% of turnover above TZS 11m to TZS 200m. A qualifying new business may apply for a first-twelve-month exemption, subject to Commissioner satisfaction.",
    sourcePages: "Printed pages 31–33",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The enacted Act table is transcribed from the official OSG PDF; the new-business exemption still requires an application and Commissioner decision, and eligibility, exclusions, section 43 compliance evidence and effective-date treatment require specialist validation. " + commonCaveat,
  },
  {
    code: "FA2026_TA_S8A_FRAMEWORK_AGREEMENT",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "Section 8A",
    financeActProvision: "Finance Act No. 2 of 2026, section 71",
    summary: "Adds section 8A requiring the Minister to specify a framework agreement for tax-law purposes by notice published in the Gazette.",
    sourcePages: "Printed page 47",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The enabling Gazette notice and the exact approved framework agreement must be located; the existence of an agreement alone is not proof of eligibility. " + commonCaveat,
  },
  {
    code: "FA2026_TA_S22_TIN_APPLICATION",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "Section 22(1)",
    financeActProvision: "Finance Act No. 2 of 2026, section 72",
    summary: "Replaces section 22(1) with a requirement for a person potentially liable to tax through employment, business or investment to apply for a TIN within fifteen days from commencing that activity.",
    sourcePages: "Printed page 47",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_TA_S54_CONTRACTOR_DISCLOSURE",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "Section 54",
    financeActProvision: "Finance Act No. 2 of 2026, section 73",
    summary: "Requires entities in construction and extractive industries to electronically disclose contracted and subcontracted persons within thirty days of executing the contract, including identity, contract particulars and expected withholding-tax obligations.",
    sourcePages: "Printed pages 47–48",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The prescribed electronic form, scope of covered entities and any subsequent regulations must be verified. " + commonCaveat,
  },
  {
    code: "FA2026_TA_S90_TRANSFER_PRICING_PENALTY",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "Section 90(2)(c)",
    financeActProvision: "Finance Act No. 2 of 2026, section 77",
    summary: "Revises the transfer-pricing penalty measure to thirty percent of the adjustment resulting from a non-arm's-length transaction or one hundred percent of the tax shortfall, whichever is greater.",
    sourcePages: "Printed page 49",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The full penalty provision, applicable period, procedural safeguards and any later amendments must be reviewed before risk quantification. " + commonCaveat,
  },
  {
    code: "FA2026_TA_S94A_FRAMEWORK_ABUSE",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "Section 94A",
    financeActProvision: "Finance Act No. 2 of 2026, section 78",
    summary: "Creates an offence for specified abuse of framework-agreement tax exemptions or remissions, including misuse of exempted goods, unauthorized transfer or false/misleading statements; the stated fine is equal to the exempted tax and the exemption/remission becomes payable.",
    sourcePages: "Printed page 49",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_TA_FIRST_SCHEDULE_VAT_STATEMENT",
    domain: "TAX_ADMINISTRATION",
    principalAct: "Tax Administration Act, Cap. 438",
    principalProvision: "First Schedule, paragraph 1(b)",
    financeActProvision: "Finance Act No. 2 of 2026, section 80",
    summary: "Adds the withholding VAT statement filed under section 71(6) to the specified tax-return wording.",
    sourcePages: "Printed page 50",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: commonCaveat,
  },
  {
    code: "FA2026_VAT_S5_WITHHOLDING",
    domain: "VAT",
    principalAct: "Value Added Tax Act, Cap. 148",
    principalProvision: "Section 5(5) and new section 5(7)",
    financeActProvision: "Finance Act No. 2 of 2026, section 91",
    summary: "Amends withholding VAT wording to specify fifteen percent for goods and twelve percent for services supplied to a taxable person; where a supply contains both, the taxable value subject to withholding is apportioned three to two for goods and services respectively.",
    sourcePages: "Printed pages 52–53",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "This describes withholding VAT under the cited subsection, not the general VAT rate. Verify withholding-agent status, transaction classification and the consolidated Act before any calculation. " + commonCaveat,
  },
  {
    code: "FA2026_VAT_S6_MINING_FRAMEWORK",
    domain: "VAT",
    principalAct: "Value Added Tax Act, Cap. 148",
    principalProvision: "Section 6(3)(j) and section 6(8)(h)",
    financeActProvision: "Finance Act No. 2 of 2026, section 92",
    summary: "Adds specified VAT exemption treatment for qualifying mining or special mining licence holders with a Cabinet-approved Government framework agreement, limited to eligible goods or services used exclusively for project construction and ending on commencement of production.",
    sourcePages: "Printed pages 53–54",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The actual framework agreement, Cabinet approval, goods/services schedules and any required TRA approval must be examined. " + commonCaveat,
  },
  {
    code: "FA2026_VAT_S51_DIGITAL_INTERMEDIARY",
    domain: "VAT",
    principalAct: "Value Added Tax Act, Cap. 148",
    principalProvision: "Section 51",
    financeActProvision: "Finance Act No. 2 of 2026, section 94",
    summary: "Adds a digital-intermediary rule under which an operator of an online intermediation service or marketplace is deemed the supplier for specified electronic services supplied to an unregistered person in Mainland Tanzania.",
    sourcePages: "Printed pages 54–55",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "Confirm territorial scope, registration status, the complete amended list of services and the applicable non-resident registration regulations. " + commonCaveat,
  },
  {
    code: "FA2026_VAT_S71_WITHHOLDING_DEADLINES",
    domain: "VAT",
    principalAct: "Value Added Tax Act, Cap. 148",
    principalProvision: "Section 71(5) and (6)",
    financeActProvision: "Finance Act No. 2 of 2026, section 95",
    summary: "Requires a withholding agent to pay VAT withheld within ten days after the end of each tax period and to file the withholding VAT statement within ten days of the month following the relevant tax period.",
    sourcePages: "Printed pages 54–55",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "Verify the definition of tax period, prescribed form and filing/payment calendar before configuring reminders. " + commonCaveat,
  },
  {
    code: "FA2026_EXCISE_S126_RATE_ADJUSTMENT",
    domain: "EXCISE",
    principalAct: "Excise (Management and Tariff) Act, Cap. 147",
    principalProvision: "Section 126(3)–(5)",
    financeActProvision: "Finance Act No. 2 of 2026, section 8",
    summary: "Changes the annual adjustment basis for specific excise duties to year-on-year actual inflation for the period ending March plus two percent, and adds provisions addressing specified services delivered electronically by non-residents to resident persons.",
    sourcePages: "Printed pages 5–6",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "The full list of covered services, applicable rates and subsidiary regulations must be verified; no general digital-services rate is inferred. " + commonCaveat,
  },
  {
    code: "FA2026_EXCISE_S146B_FRAMEWORK",
    domain: "EXCISE",
    principalAct: "Excise (Management and Tariff) Act, Cap. 147",
    principalProvision: "New section 146B",
    financeActProvision: "Finance Act No. 2 of 2026, section 9",
    summary: "Allows excise remission by Ministerial order following Cabinet approval for qualifying mining framework-agreement goods used during construction, expressly excluding petroleum products.",
    sourcePages: "Printed pages 6–7",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "A framework agreement alone does not grant remission; verify the Gazette order, goods list, time limit and conditions. " + commonCaveat,
  },
  {
    code: "FA2026_IMPORTS_S18A_EAC_ORIGIN",
    domain: "CUSTOMS_AND_IMPORTS",
    principalAct: "Imports Control Act, Cap. 276",
    principalProvision: "Section 18A",
    financeActProvision: "Finance Act No. 2 of 2026, section 18",
    summary: "Adds an exception to the specified levy for qualifying goods originating in EAC Partner States under EAC Rules of Origin, subject to the stated reciprocal trade-barrier proviso.",
    sourcePages: "Printed page 27",
    reviewGate: "CONSOLIDATION_AND_SPECIALIST_REVIEW_REQUIRED",
    operationalStatus: "INDEX_ONLY_NOT_A_TAX_RULE",
    caveat: "This is an Imports Control Act amendment, not a general customs-duty exemption. Verify origin evidence and the reciprocal proviso for the relevant transaction. " + commonCaveat,
  },
] as const;

export function getFinanceAct2026ChangeIndex() {
  return FINANCE_ACT_2026_CHANGE_INDEX;
}

export function getFinanceAct2026ChangesByDomain() {
  return [...new Set(FINANCE_ACT_2026_CHANGE_INDEX.map((change) => change.domain))].map((domain) => ({
    domain,
    changes: FINANCE_ACT_2026_CHANGE_INDEX.filter((change) => change.domain === domain),
  }));
}
