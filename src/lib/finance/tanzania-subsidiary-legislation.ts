/**
 * Tanzania 2026 tax subsidiary-legislation source verification.
 *
 * The GN 158F record is intentionally provisional: its text is available from
 * reproduced copies, but an official Gazette PDF / OAG MIS record has not yet
 * been directly acquired and matched. GN 158G has official OAG MIS metadata,
 * but its complete instrument text has not yet been acquired here.
 *
 * Neither record is ingested into knowledge_sources or usable as a tax rule.
 */
export type SubsidiaryLegislationSourceStatus =
  | "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED"
  | "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING";

export type TanzaniaTaxSubsidiaryInstrument = {
  code: string;
  title: string;
  governmentNotice: string;
  publicationDate: string;
  commencementDate: string;
  sourceStatus: SubsidiaryLegislationSourceStatus;
  officialMetadataUri?: string;
  reproducedTextUris: readonly string[];
  supportingAnalysisUris?: readonly string[];
  ingestionStatus: "SOURCE_LINKED_NOT_INGESTED";
  noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW";
  notes: readonly string[];
};

export const TANZANIA_TAX_SUBSIDIARY_INSTRUMENTS: readonly TanzaniaTaxSubsidiaryInstrument[] = [
  {
    code: "TZ_GN_158F_2026_FOREST_PRODUCE",
    title: "The Income Tax (Single Instalment Tax on Forest Produce) Regulations, 2026",
    governmentNotice: "158F of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING",
    reproducedTextUris: [
      "https://lysonlaw.co.tz/index.php/guidelines/the-income-tax-single-instalment-tax-on-forest-produce-regulations-2026",
      "https://www.scribd.com/document/1076424672/Gn-158f-The-Income-Tax-Single-Instalment-Tax-on-Forest-Produce-Regulations-2026-Tgpa",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: [
      "Reproduced text identifies Government Notice No. 158F, published 30 June 2026 and commencing 1 July 2026.",
      "The reproduced text is a discovery and transcription aid only. It is not an authenticated official Gazette copy.",
      "The Office of the Attorney General OAG MIS record for Finance Act No. 2 of 2026 does not list subsidiary legislation under that Act; do not mistake that empty list for proof that GN 158F does not exist.",
      "Official Gazette PDF, Gazette issue/supplement number, full page range and checksum remain outstanding.",
    ],
  },
  {
    code: "TZ_GN_158G_2026_TAX_ADMIN_GENERAL",
    title: "The Tax Administration (General) (Amendment) Regulations, 2026",
    governmentNotice: "158G of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/legislation/4648",
    reproducedTextUris: [
      "https://www.scribd.com/document/1072984603/Gn_158g-Amendment-of-the-Tax-Administration-General_regulations,_2026-Tgpa",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: [
      "OAG MIS identifies GN 158G of 2026, publication 30 June 2026 and commencement 1 July 2026.",
      "The full signed / gazetted text and checksum have not yet been acquired in this repository task.",
      "A third-party transcription reports a new display obligation for persons conducting business on social media; do not operationalize this summary until the official instrument is checked.",
    ],
  },
  {
    code: "TZ_GN_158A_2026_VAT_TRAILER_DEFERMENT",
    title: "The Value Added Tax (Requirements for Deferment on Trailers) Order, 2026",
    governmentNotice: "158A of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/legislation/4642",
    reproducedTextUris: [
      "https://www.scribd.com/document/1076424796/Gn158a-The-Value-Added-Tax-Requirements-for-Deferment-Order-2026-Tgpa",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: ["OAG MIS metadata confirms GN 158A, publication 30 June 2026 and commencement 1 July 2026.", "A reproduced copy describes eligibility for manufacturers/assemblers of locally manufactured or assembled trailers under HS heading 87.16, including staffing and industrial equipment thresholds and premises inspection.", "Do not operationalize the reported 100 skilled staff, five Tanzanian engineers or equipment list until the official Order and the enabling VAT Act provisions are checked."],
  },
  {
    code: "TZ_GN_158B_2026_PRESUMPTIVE_NEW_TRADERS",
    title: "The Income Tax (Presumptive Tax Relief for New Traders) Regulations, 2026",
    governmentNotice: "158B of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING",
    reproducedTextUris: [
      "https://lysonlaw.co.tz/index.php/guidelines/the-income-tax-presumptive-tax-relief-for-new-traders-regulations-2026",
      "https://www.scribd.com/document/1076424817/Gn158b-The-Income-Tax-Presumptive-Tax-Relief-for-New-Traders-Regulations-2026-1-Tgpa",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: ["Reproduced copies identify GN 158B, publication 30 June 2026 and commencement 1 July 2026; the official Gazette match is pending.", "The reproduced text describes a 12-month relief application for qualifying new individual traders exclusively under the presumptive regime, anti-chaining conditions, a 7-working-day decision target, non-transferability, pre-expiry turnover reporting, revocation and objection rights.", "Do not treat relief as automatic or create an eligibility calculator until the official text and current Income Tax Act First Schedule are reconciled."],
  },
  {
    code: "TZ_GN_158C_2026_MANDATORY_EPAYMENTS",
    title: "The Electronic Transactions (Mandatory Electronic Payments for Specified Transactions) Order, 2026",
    governmentNotice: "158C of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/legislation/4644",
    reproducedTextUris: [
      "https://lysonlaw.co.tz/index.php/guidelines/the-electronic-transactions-mandatory-electronic-payments-for-specified-transactions-order-2026",
    ],
    supportingAnalysisUris: [
      "https://globaltaxnews.ey.com/news/2026-1753-tanzania-introduces-mandatory-electronic-payment-for-specific-identified-transactions",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: ["OAG MIS metadata confirms GN 158C, publication 30 June 2026 and commencement 1 July 2026.", "Finance Act No. 2 of 2026, section 6 enables Gazette orders prescribing payments to be made electronically and makes proof of electronic payment a requirement for specified asset-transfer application approvals.", "Reproduced text and professional analysis describe specified payment categories across transport, shopping/entertainment, education, accommodation/food/tourism, high-value property/vehicle transactions and certain agricultural cooperative transactions, with a six-month transition for existing recipients of those payments.", "Do not generalize this into a blanket ban on cash. Verify the exact schedule, transaction descriptions, exclusions, pre-existing contract protection and transition wording in the official Order.",
      "As at 12 November 2026, the reported six-month implementation transition to the end of December 2026 is still running; verify the precise start/end computation and any category-specific conditions before setting compliance deadlines."],
  },
  {
    code: "TZ_GN_158D_2026_CUSTOMS_PROCESSING_FEE",
    title: "The Tanzania Revenue Authority (Customs Processing Fee) Regulations, 2026",
    governmentNotice: "158D of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "OFFICIAL_METADATA_CONFIRMED_TEXT_NOT_ACQUIRED",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/legislation/4645",
    reproducedTextUris: [],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: ["OAG MIS metadata confirms GN 158D, publication 30 June 2026 and commencement 1 July 2026.", "Obtain the full Regulations and reconcile fee basis, covered customs entries/services, exceptions, collection mechanism and any transition from the prior fee before customs costing changes."],
  },
  {
    code: "TZ_GN_158E_2026_EXCISE_NON_RESIDENT",
    title: "The Excise (Non-Resident Service Provider) Regulations, 2026",
    governmentNotice: "158E of 2026",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    sourceStatus: "REPRODUCED_COPY_ONLY_OFFICIAL_GAZETTE_MATCH_PENDING",
    reproducedTextUris: [
      "https://lysonlaw.co.tz/index.php/guidelines/the-excise-non-resident-service-provider-regulations-2026",
    ],
    supportingAnalysisUris: [
      "https://globaltaxnews.ey.com/news/2026-1725-tanzania-issues-excise-non-resident-service-provider-regulations-2026",
      "https://www.clydeco.com/fr/insights/2026/07/the-tanzania-excise-non-resident-service-providers",
    ],
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_OFFICIAL_SOURCE_ACQUISITION_AND_SPECIALIST_REVIEW",
    notes: ["Professional tax alerts identify GN 158E, publication 30 June 2026 and commencement 1 July 2026; the official Gazette PDF / OAG metadata record remains to be matched in this workflow.", "Reproduced and professional summaries describe registration, customer-location indicators, monthly filing/payment, a 90-day transition for existing providers and an electronic fiscal device exemption.",
      "As at 12 November 2026, the reported 90-day transition period appears to have elapsed; confirm the exact statutory counting rule and any later relief before treating a provider as late.", "Do not activate non-resident registration, location sourcing, rate calculation or filing workflows from summaries; reconcile with Excise Act section 126(4)–(5), the exact regulations and other applicable tax regimes."],
  },
] as const;

export type ForestProduceRegulationControl = {
  regulation: string;
  subject: string;
  reproducedTextSummary: string;
  verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED";
  legalCrossCheck: string;
};

export const FOREST_PRODUCE_REGULATION_CONTROLS: readonly ForestProduceRegulationControl[] = [
  {
    regulation: "3",
    subject: "Assessment and electronic payment",
    reproducedTextSummary: "Instalment tax is assessed on gross payment on sale of forest produce and paid electronically.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Apply the statutory timing triggers in Income Tax Act section 116A(2), as replaced by Finance Act No. 2 of 2026 section 25. The regulation's short wording must not be read as narrowing the Act's earlier-of payment receipt, impending transport, parting with possession/use/control, or forest-cess payment events.",
  },
  {
    regulation: "4",
    subject: "Buyer payment on behalf of instalment payer",
    reproducedTextSummary: "A buyer may pay for the instalment payer if the buyer has the payer's name, address, mobile number and TIN. The payment is treated as paid by the payer; the buyer cannot claim a tax credit for it.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Verify the payer's statutory identity, consent/data handling, payment allocation and receipt evidence. Do not treat the buyer as acquiring the seller's tax liability or a credit.",
  },
  {
    regulation: "5",
    subject: "Certificate validity",
    reproducedTextSummary: "A single-instalment certificate is valid for ten days; the Commissioner may extend it on an application made before expiry.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Confirm extension procedure and how a certificate relates to a specific consignment, sale, volume or batch before building document controls.",
  },
  {
    regulation: "6",
    subject: "Fiscal receipt",
    reproducedTextSummary: "Unless the Commissioner specifies otherwise by written notice, a payer issued a certificate is not required to issue a fiscal receipt under the Tax Administration Act.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Search for subsequent written Commissioner notices and reconcile with EFD/e-receipt requirements before treating a certificate as a universal receipt substitute.",
  },
  {
    regulation: "7",
    subject: "Buyer expenditure evidence",
    reproducedTextSummary: "The certificate is proof of expenditure for the buyer if it contains the buyer's particulars, including name and TIN.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Confirm the certificate data schema and accounting/tax treatment; a certificate alone does not establish all ordinary deductibility conditions.",
  },
  {
    regulation: "8",
    subject: "Transport documentation",
    reproducedTextSummary: "Forest produce must not be transported without a certificate confirming tax payment or that no instalment tax is payable.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Confirm acceptable digital/original certificate formats, linkage to the goods and exemptions/no-tax-payable process with TRA and Tanzania Forest Services.",
  },
  {
    regulation: "9",
    subject: "Inspection and restraint",
    reproducedTextSummary: "A tax officer may stop and inspect a vehicle carrying forest produce without notice and may restrain the produce if tax has not been paid until payment is made.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Review statutory authority, officer identification, records, custody, release process, appeal/complaint safeguards and interaction with other forest/transport enforcement powers.",
  },
  {
    regulation: "10",
    subject: "Penalty",
    reproducedTextSummary: "Failure to pay instalment tax on the due date under regulation 3 attracts a penalty of 100 currency points.",
    verificationStatus: "PROVISIONAL_TRANSCRIPTION_NOT_OFFICIAL_GAZETTE_VERIFIED",
    legalCrossCheck: "Do not convert currency points to TZS or calculate a penalty until the current statutory currency-point value, applicable penalty framework, due date and any later amendment are verified.",
  },
] as const;

export function getTanzaniaTaxSubsidiaryInstruments() {
  return TANZANIA_TAX_SUBSIDIARY_INSTRUMENTS;
}

export function getForestProduceRegulationControls() {
  return FOREST_PRODUCE_REGULATION_CONTROLS;
}
