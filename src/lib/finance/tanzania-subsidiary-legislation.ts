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
