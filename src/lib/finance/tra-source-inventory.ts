/**
 * Initial TRA source inventory for FINANCE_OS.
 *
 * Titles originate from the owner-supplied TRA archive listings. They are
 * discovery records only: no source PDF, legal status, current rate or holding
 * is asserted by this catalog. Authoritative ingestion uses knowledge_sources.
 */
export type TraSourceCollection =
  | "PRIMARY_LEGISLATION"
  | "REGULATIONS_ORDERS"
  | "INCOME_TAX_TABLES"
  | "INTERNATIONAL_TREATIES"
  | "TAX_CASE_LAW"
  | "AUDIT_REPORTS"
  | "CUSTOMS_DOMESTIC_FORMS"
  | "PRACTICE_NOTICES";

export type TraSourceInventoryItem = {
  code: string;
  title: string;
  collection: TraSourceCollection;
  jurisdictionCode: "TZ" | "EAC" | "MULTI";
  sourceAuthority: "TRA_ARCHIVE_LISTING";
  ingestionStatus: "SOURCE_REQUIRED";
  authorityStatus: "UNVERIFIED";
  note?: string;
};

const item = (
  code: string,
  title: string,
  collection: TraSourceCollection,
  jurisdictionCode: TraSourceInventoryItem["jurisdictionCode"] = "TZ",
): TraSourceInventoryItem => ({
  code, title, collection, jurisdictionCode,
  sourceAuthority: "TRA_ARCHIVE_LISTING",
  ingestionStatus: "SOURCE_REQUIRED",
  authorityStatus: "UNVERIFIED",
});

const primary = [
  ["FINANCE_ACT_2023", "Finance Act 2023"],
  ["FINANCE_ACT_2022", "Finance Act 2022"],
  ["FINANCE_ACT_2021", "Finance Act 2021"],
  ["FINANCE_ACT_2020", "Finance Act 2020"],
  ["FINANCE_ACT_2019", "Finance Act 2019"],
  ["FINANCE_ACT_2018", "Finance Act 2018"],
  ["FINANCE_ACT_2017", "Finance Act 2017"],
  ["FINANCE_ACT_2016", "Finance Act 2016"],
  ["FINANCE_ACT_2015", "Finance Act 2015"],
  ["FINANCE_ACT_2014", "Finance Act 2014"],
  ["FINANCE_ACT_2013", "Finance Act 2013"],
  ["FINANCE_ACT_2012", "Finance Act 2012"],
  ["FINANCE_ACT_2011", "Finance Act 2011"],
  ["FINANCE_ACT_2010", "Finance Act 2010"],
  ["FINANCE_ACT_2009", "Finance Act 2009"],
  ["FINANCE_ACT_2008", "Finance Act 2008"],
  ["FINANCE_ACT_2007", "Finance Act 2007"],
  ["INCOME_TAX_ACT_CAP_332", "Income Tax Act, Cap 332 R.E. 2019"],
  ["VAT_ACT_CAP_148", "Value Added Tax Act, Cap 148 R.E. 2019"],
  ["TAX_ADMIN_ACT_CAP_438", "Tax Administration Act, Cap 438 R.E. 2019"],
  ["STAMP_DUTY_ACT_CAP_189", "Stamp Duty Act, Cap 189 R.E. 2019"],
  ["EXCISE_ACT_CAP_147", "Excise (Management and Tariff) Act, Cap 147 R.E. 2019"],
  ["CUSTOMS_ACT_CAP_403", "Customs (Management and Tariff) Act, Cap 403 R.E. 2019"],
  ["EAC_CMA_REV_2017", "East African Community Customs Management Act (Rev. 2017)"],
  ["TRA_ACT_CAP_399", "Tanzania Revenue Authority Act, Cap 399 R.E. 2019"],
  ["TAX_APPEALS_ACT_CAP_408", "Tax Revenue Appeals Act, Cap 408 R.E. 2019"],
  ["LOCAL_GOV_FINANCES_CAP_290", "Local Government Finances Act, Cap 290 R.E. 2019"],
  ["OIL_GAS_REVENUES_CAP_328", "Oil and Gas Revenues Management Act, Cap 328 R.E. 2019"],
  ["VETA_ACT_CAP_82", "Vocational Education and Training Act, Cap 82 R.E. 2019"],
  ["FOREIGN_VEHICLE_TRANSIT_CAP_84", "Foreign Vehicle Transit Charges Act, Cap 84 R.E. 2019"],
  ["GAMING_ACT_CAP_41", "Gaming Act, Cap 41 R.E. 2019"],
  ["ROAD_FUEL_TOLL_CAP_220", "Road and Fuel Toll Act, Cap 220 R.E. 2019"],
  ["MOTOR_VEHICLE_TAX_CAP_124", "Motor Vehicle (Tax Registration and Transfer) Act, Cap 124 R.E. 2019"],
  ["AIRPORT_SERVICE_CHARGES_CAP_365", "Airport Service Charges Act, Cap 365 R.E. 2019"],
  ["PORT_SERVICE_CHARGES_CAP_264", "Port Service Charges Act, Cap 264 R.E. 2019"],
  ["EAC_CMA_AMENDMENT_2011", "East African Community Customs Management (Amendment) Act, 2011"],
] as const;

const regulations = [
  "The Electronic Transactions (Mandatory Electronic Payments for Specified Transactions) Order, 2026",
  "Income Tax (Presumptive Tax Relief for New Traders) Regulations, 2026",
  "VAT (Requirements for Deferment on Trailers) Order, 2026",
  "Tax Administration (General) (Amendment) Regulations, 2026",
  "Income Tax (Single Instalment Tax on Forest Produce) Regulations, 2026",
  "Excise (Non-Resident Service Provider) Regulations, 2026",
  "TRA (Customs Processing Fee) Regulations, 2026",
  "VAT (General) (Amendment) Regulations, 2025",
  "Tourism Development Levy Amendment Regulations, 2025",
  "Tourism Fees and Charges Amendment Regulations, 2025",
  "Tax Administration (General) Amendment Regulations, 2025",
  "Road Traffic (Motor Vehicles Registration) Amendment Regulations, 2025",
  "Excise (Management and Tariff) (Offset of Duty) Amendment Regulations, 2025",
  "Income Tax (Amendment) Regulations, 2025",
  "Income Tax and VAT Registration of Non-Resident Electronic Service Providers, 2024",
  "East African Community Customs Management Regulations, 2010",
  "VAT (General) Regulations, 2015",
  "Income Tax (Transfer Pricing) Regulations, 2014",
  "Transfer Pricing Guidelines, 2014",
  "Tax Administration (General) Regulations, 2016",
  "Tax Administration (Registration of Small Vendors and Service Providers) Regulations, 2020",
  "Electronic Tax Stamps Regulations, 2018",
];

const treatyCountries = ["India", "Zambia", "Sweden", "Norway", "Italy", "Finland", "Denmark", "Canada", "South Africa"];
const notices = [
  "Taxation of Income from Employment",
  "Depreciation Allowance for Depreciable Assets",
  "Determination of Charitable and Religious Organisations Status and Taxation of Respective Charitable Business Income",
  "Taxation of Income of a Permanent Establishment and Repatriated Income of Domestic Permanent Establishment",
  "Taxation of Controlled Foreign Trusts or Corporations (CFC or CFT)",
  "Withholding Tax on Goods, Services Fees and Contract Payment",
  "VAT Treatment on Trusts, Vouchers and Options",
  "VAT on Representative of Non-Resident Person",
  "Input Tax Credit for Partial Exempt Economic Activity",
  "VAT on Insurance Business",
  "VAT on Immovable Properties",
  "Determination of Dutiable Value of Service",
  "Determination of Bed Night Levy",
  "Taxation of a Representative Assessee",
  "Taxation of Gains from Realisation of Assets",
];
const incomeYears = ["2023/2024", "2021/2022", "2018/2019", "2017/2018", "2016/2017", "2015/2016", "2014/2015", "2013/2014", "2012/2013"];
const auditYears = ["2024", "2023", "2022"];
const customsForms = [
  "C01 Overtime Request", "C02 Cargo Manifest", "C03 Parcels List Vessels", "C04 General Declaration Aircraft",
  "C05 Passenger List", "C06 Declaration Advice Customer Stores", "C07 Crew Declaration", "C08 Break Bulk Before Report",
  "C09 Amend Manifest", "C10 Proceed to Sufferance Wharf", "C11 Landing Certificate",
  "C12 Release Perishables or Other Goods Prior to Duty", "C13 Inward/Outward Processing", "C14 Certificate of Clearance",
  "C15 Repack Warehoused Goods", "C16 Transfer Ownership of Warehoused Goods", "C18 Premises Licence Application",
  "C19 Bonded Warehouse/Factory/ICD Licence", "C20 Customs Agent Licence Application", "C21 Customs Agent Licence",
  "C22 Ship Goods Prior to Entry", "C23 Reload Goods Unloaded in Error", "C24 Ship Stores",
  "C25 Transfer Stores Aircraft/Vessel", "C26 Refund Deposit/Cancel Bond", "C27 Transire",
  "C28 Vehicle/Vessel Conveying Transit Goods", "C29 Licensed Motor Vehicle/COMESA/SADC Vehicle Certificate",
  "C30 Duty Drawback Rate of Yield Notification", "C31 Duty Drawback Debenture/Claim", "C32 Temporary Export/Import Motor Vehicles",
  "C33 EAC Rebate/Refund and COMESA/SADC Temporary Importation", "C34 Other Refunds", "C35 Settlement of Case",
  "C36 Customs Value Particulars", "C37 Notice of Seizure", "C38 Payment Proceeds of Sale of Goods",
  "C39 Licence Application for Vehicles/Vessels under Customs Control", "C40 Licence for Vehicles/Vessels",
  "CB0 Bond to Secure Customs Duties", "CB1 Bond for Delivery Prior to Duty", "CB2 Bond for Removal to Another Port",
  "CB3 Warehousing/Removal Bond", "CB4 Exportation Bond", "CB5 Shipment Stores Bond", "CB6 General Warehousing Bond",
  "CB7 Goods Shipped Prior to Entry Bond", "CB8 Transit Bond", "CB9 Transhipment Bond",
  "CB10 Re-exportation Bond", "CB11 Customs Agents Bond", "CB12 Conveyance under Customs Control Bond",
  "CB13 General Bond for ICD Compliance",
  "Customs License Management System User Access Form", "TANCIS User Access Form", "Duty Remission Quarterly Return",
];
const domesticForms = [
  "Single Instalment Tax Certificate (Sale of Forest Produce)", "ITX255.01.E Excise Duty Return",
  "ITX902.01.E Application for Private/Class Ruling", "VAT 220/223/224 VAT Relief (excluding diplomats)",
  "VAT222 VAT Relief to Diplomatic Missions on Local Supplies", "ITX263.02.E Application for Utilisation of VAT Relief",
  "ITX262.02.E Claim for VAT Refund", "ITX248.01.E Additional VAT Assessment", "ITX241.01.B VAT Monthly Return Supplement",
  "ITX261.02.E Checklist for Claimants of Negative Amount", "ITX247.02.E VAT Deferment",
  "ITX303.01.E Payment Notice/Deposit Slip",
  "Customs/Excise Duty Remission for Public Officials' Motor Vehicles, Motorcycles and Bicycles",
  "ITX251.01.E Money Transfer Levy Return", "Application for Registration as Tax Consultant",
];
const caseTitles = [
  "Commissioner General TRA v Vodacom Tanzania PLC, Civil Appeal No. 485 of 2023 [2025] TZCA 343",
  "Dominion Tanzania Ltd v Commissioner General TRA, Civil Appeal No. 159/2021",
  "Mwenga Hydro Ltd, Civil Appeal No. 356/2021",
  "Mlimani Holdings Ltd, Civil Appeal No. 265/2021",
  "Q-Bar Ltd, Civil Appeal No. 163/2021",
  "Tanga Cement PLC, Civil Appeal No. 146/2021",
  "Mantra Tanzania Ltd, Civil Appeal No. 430/2020",
  "Unilever Tea Tanzania Ltd, Civil Appeal No. 401/2020",
  "Establishments Maurel & Prom, Civil Appeal No. 391/2020",
  "John Epimaki Kessy, Civil Appeal No. 388/2020",
  "Statoil Tanzania AS (now Equinor Tanzania AS), Civil Appeal No. 372/2020",
  "Shana General Store, Civil Appeal No. 308/2020",
  "Pan African Energy Tanzania Ltd, Civil Appeal No. 172/2020",
  "Vodacom Tanzania PLC, Civil Appeal No. 107/2020",
  "Ophir Tanzania (Block 1) Ltd, Civil Appeal No. 58/2020",
  "Singita Trading Store EA Ltd, Civil Appeal No. 57/2020",
  "Kilombero Sugar Co. Ltd, Civil Appeal No. 218/2019",
  "Jovet Tanzania Ltd, Civil Appeal No. 217/2019",
  "Star Media (Tanzania) Ltd, Civil Appeal No. 211/2019",
  "Tanzania Tobacco Processors Ltd, Civil Appeal No. 174/2019",
  "Vodacom Tanzania PLC, Civil Appeal No. 117/2019",
  "Geita Gold Mining Ltd, Civil Appeal No. 89/2019",
  "Pan African Energy Tanzania Ltd, Civil Appeal No. 81/2019",
  "Samson Ngw'alida, Civil Appeal No. 86 of 2008",
  "Mbeya Cement Company Ltd, Civil Appeal No. 19 of 2008",
  "MS Skylink Travels, Civil Appeal No. 8 of 2007",
  "ISGNIA Ltd v Commissioner General TRA",
  "BIDCO Oil and Soap Ltd, Civil Appeal No. 89 of 2007",
];

const reports = auditYears.flatMap((year) => [
  `TRA Audited Financial Statements for year ended 30 June ${year}`,
  `TRA Audited Revenue Statements for year ended 30 June ${year}`,
]);

export const TRA_SOURCE_INVENTORY: readonly TraSourceInventoryItem[] = [
  ...primary.map(([code, title]) => item(code, title, "PRIMARY_LEGISLATION", code.startsWith("EAC_") ? "EAC" : "TZ")),
  ...regulations.map((title, i) => item(`TRA_REGULATION_${String(i + 1).padStart(3, "0")}`, title, "REGULATIONS_ORDERS", title.startsWith("East African") ? "EAC" : "TZ")),
  ...incomeYears.map((year) => item(`INCOME_TAX_TABLE_${year.replace("/", "_")}`, `Income Tax Table ${year}`, "INCOME_TAX_TABLES")),
  ...treatyCountries.map((country) => item(`TANZANIA_DTA_${country.toUpperCase().replaceAll(" ", "_")}`, `Tanzania Double Taxation Agreement — ${country}`, "INTERNATIONAL_TREATIES", "MULTI")),
  ...caseTitles.map((title, i) => item(`TRA_TAX_CASE_${String(i + 1).padStart(3, "0")}`, title, "TAX_CASE_LAW")),
  ...reports.map((title, i) => item(`TRA_AUDIT_REPORT_${String(i + 1).padStart(3, "0")}`, title, "AUDIT_REPORTS")),
  ...customsForms.map((title, i) => item(`TRA_CUSTOMS_FORM_${String(i + 1).padStart(3, "0")}`, title, "CUSTOMS_DOMESTIC_FORMS", "EAC")),
  ...domesticForms.map((title, i) => item(`TRA_DOMESTIC_FORM_${String(i + 1).padStart(3, "0")}`, title, "CUSTOMS_DOMESTIC_FORMS")),
  ...notices.map((title, i) => item(`TRA_PRACTICE_NOTICE_${String(i + 1).padStart(2, "0")}`, title, "PRACTICE_NOTICES")),
];

export const TRA_SOURCE_COLLECTIONS: readonly {
  code: TraSourceCollection;
  title: string;
  description: string;
}[] = [
  { code: "PRIMARY_LEGISLATION", title: "Acts & Finance Acts", description: "Primary statutes, annual Finance Acts and amendments." },
  { code: "REGULATIONS_ORDERS", title: "Regulations & Orders", description: "Subsidiary legislation, statutory orders and transfer-pricing instruments." },
  { code: "INCOME_TAX_TABLES", title: "Income Tax Tables", description: "Historical annual tables; current-year applicability requires verification." },
  { code: "INTERNATIONAL_TREATIES", title: "International Tax Treaties", description: "Treaty texts, protocols, article-level effective dates and status." },
  { code: "TAX_CASE_LAW", title: "Tax Cases & Precedents", description: "Actual judgments, holdings, reasoning and subsequent appellate treatment." },
  { code: "AUDIT_REPORTS", title: "Audit & Revenue Assurance", description: "Audited financial and revenue statements and extracted audit evidence." },
  { code: "CUSTOMS_DOMESTIC_FORMS", title: "Customs & Domestic Revenue Forms", description: "EAC customs forms, bonds, VAT, excise and domestic revenue forms." },
  { code: "PRACTICE_NOTICES", title: "TRA Practice Notices", description: "Administrative tax interpretation linked to underlying law." },
];

export function getTraSourceInventory() {
  return TRA_SOURCE_INVENTORY;
}

export function getTraSourceCollectionCounts() {
  return TRA_SOURCE_COLLECTIONS.map((collection) => ({
    ...collection,
    count: TRA_SOURCE_INVENTORY.filter((source) => source.collection === collection.code).length,
  }));
}
