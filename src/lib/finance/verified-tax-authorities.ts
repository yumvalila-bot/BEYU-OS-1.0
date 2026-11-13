/**
 * Verified primary-source metadata for Tanzania tax law and East African Community customs law.
 *
 * These records distinguish Bills from enacted Acts, regulations and tariff schedules. Source
 * discovery does not itself ingest content into knowledge_sources or authorize
 * NOELIA to rely on a legal proposition.
 */
export type VerifiedTaxAuthorityRecord = {
  code: string;
  title: string;
  instrumentKind: "ACT" | "BILL" | "REGULATION" | "CUSTOMS_TARIFF";
  jurisdictionCode: string;
  status: "ENACTED" | "BILL_NOT_LAW";
  publicationDate?: string;
  enactmentDate?: string;
  commencementDate?: string;
  enactmentNumber?: string;
  officialMetadataUri: string;
  officialDocumentUri: string;
  ingestionStatus: "SOURCE_LINKED_NOT_INGESTED";
  noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW";
  supersededBy?: string;
  notes: string[];
};

export const VERIFIED_TAX_AUTHORITIES: readonly VerifiedTaxAuthorityRecord[] = [
  {
    code: "TZ_FINANCE_ACT_2025_NO_11",
    title: "The Finance Act, No. 11 of 2025",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    enactmentNumber: "11 of 2025",
    enactmentDate: "2025-06-25",
    publicationDate: "2025-06-30",
    commencementDate: "2025-07-01",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/acts/329",
    officialDocumentUri: "https://oagmis.oag.go.tz/portal/acts/329/download",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "Official Office of the Attorney General metadata identifies this as Enactment No. 11 of 2025.",
      "Section 58 inserted the original Income Tax Act section 116A forest-produce single-instalment provision at two percent, with that section commencing on 1 January 2026.",
      "The section 116A text was later repealed and replaced by Finance Act No. 2 of 2026, section 25; preserve both versions for temporal legal analysis.",
    ],
  },
  {
    code: "TZ_FINANCE_ACT_2026_NO_2",
    title: "The Finance Act, No. 2 of 2026",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    enactmentNumber: "2 of 2026",
    enactmentDate: "2026-06-25",
    publicationDate: "2026-06-30",
    commencementDate: "2026-07-01",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/acts/337",
    officialDocumentUri: "https://elibrary.osg.go.tz/bitstreams/631b33c8-8b1f-4f86-a238-af89659d06ec/download",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "Official Office of the Attorney General metadata identifies this as Enactment No. 2 of 2026.",
      "Publication and commencement dates are recorded separately; do not infer that every provision has identical application beyond the Act's commencement and any specific transitional wording.",
      "The official OSG e-Library record identifies the enacted 57-page Act PDF, published 30 June 2026 as Act Supplement No. 2 of 2026; do not substitute the earlier Special Bill Supplement.",
      "Section 27 amends the presumptive threshold to TZS 200m and substitutes the First Schedule table, including 4.0% of turnover above TZS 11m and a first-twelve-month exemption subject to application and Commissioner satisfaction.",
      "Section 91 specifies supplier entitlement proportions of 15% for goods and 12% for services and apportions mixed supplies 3:2 (goods:services). The current TRA VAT guide states that the actual withholding deduction is 3% of consideration for goods and 6% for services. Section 95 requires payment within ten days after the tax period and a withholding VAT statement within ten days of the following month.",
      "The original PDF is text-inspected but its bytes/checksum have not yet been ingested into the governed documents registry; NOELIA reliance remains blocked pending ingestion and specialist review.",
    ],
  },
  {
    code: "TZ_INCOME_TAX_ACT_CAP332_AS2025",
    title: "Income Tax Act, Chapter 332 (R.E. 2023 A.S. 2025)",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    publicationDate: "2025-08-28",
    officialMetadataUri: "https://elibrary.osg.go.tz/items/b58cb587-a493-408d-9ff7-6d17846f37c5/full",
    officialDocumentUri: "https://elibrary.osg.go.tz/items/b58cb587-a493-408d-9ff7-6d17846f37c5",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "OSG e-Library identifies the 2025 Annual Supplement to Chapter 332 and states that it incorporates amendments through 1 July 2025.",
      "Finance Act No. 2 of 2026 and later subsidiary instruments must be applied as effective-dated amendments; this consolidation alone is not the law snapshot for periods after 1 July 2025.",
      "Original PDF bytes, SHA-256, provision extraction and specialist review must be registered through the governed documents/knowledge workflow before NOELIA reliance.",
    ],
  },
  {
    code: "TZ_VAT_ACT_CAP148_AS2025",
    title: "Value Added Tax Act, Chapter 148 (R.E. 2023 A.S. 2025)",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    publicationDate: "2025-10-28",
    officialMetadataUri: "https://elibrary.osg.go.tz/items/6def8b8b-1438-40bc-befb-9c7f687be499/full",
    officialDocumentUri: "https://elibrary.osg.go.tz/items/6def8b8b-1438-40bc-befb-9c7f687be499",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "OSG e-Library identifies the 2025 Annual Supplement to Chapter 148; later Finance Act amendments and VAT subsidiary legislation require an effective-dated crosswalk.",
      "Do not treat the 2025 consolidated text as incorporating Finance Act No. 2 of 2026.",
      "Original PDF bytes, SHA-256, provision extraction and specialist review remain outstanding.",
    ],
  },
  {
    code: "TZ_TAX_ADMINISTRATION_ACT_CAP438_AS2025",
    title: "Tax Administration Act, Chapter 438 (R.E. 2023 A.S. 2025)",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    publicationDate: "2025-10-28",
    officialMetadataUri: "https://elibrary.osg.go.tz/items/719420c4-f514-4d5a-83d0-b07791e13523/full",
    officialDocumentUri: "https://elibrary.osg.go.tz/items/719420c4-f514-4d5a-83d0-b07791e13523",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "OSG e-Library identifies the 2025 Annual Supplement to Chapter 438.",
      "Objection, appeal, interest, penalty, record-keeping, assessment and limitation provisions require provision-level extraction and specialist validation before operational reliance.",
      "Original PDF bytes, SHA-256 and governed specialist review remain outstanding.",
    ],
  },
  {
    code: "TZ_EXCISE_MANAGEMENT_TARIFF_ACT_CAP147_RE2023",
    title: "Excise (Management and Tariff) Act, Chapter 147 (R.E. 2023)",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    publicationDate: "2025-04-25",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/revised-acts/revised/252",
    officialDocumentUri: "https://oagmis.oag.go.tz/portal/acts/revised/252/download",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "OAG MIS identifies the revised Chapter 147 text published 25 April 2025.",
      "Finance Act amendments and excise subsidiary legislation must be linked by provision and effective date; this revised Act alone is not a current rate book.",
      "Original PDF bytes, SHA-256 and specialist review remain outstanding.",
    ],
  },
  {
    code: "TZ_CUSTOMS_MANAGEMENT_TARIFF_ACT_CAP403_RE2023",
    title: "Customs (Management and Tariff) Act, Chapter 403 (R.E. 2023)",
    instrumentKind: "ACT",
    jurisdictionCode: "TZ",
    status: "ENACTED",
    publicationDate: "2025-04-25",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/revised-acts/revised/507",
    officialDocumentUri: "https://oagmis.oag.go.tz/portal/acts/revised/507/download",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "OAG MIS identifies the revised Chapter 403 text. It describes domestic customs administration and its relationship with East African Community customs law.",
      "The East African Community Customs Management Act and applicable EAC instruments are separate sources and must not be inferred from this national Act.",
      "Original PDF bytes, SHA-256 and specialist review remain outstanding.",
    ],
  },
  {
    code: "EAC_CUSTOMS_MANAGEMENT_ACT_2004_REVISED_2009",
    title: "East African Community Customs Management Act, 2004 (Revised Edition 2009)",
    instrumentKind: "ACT",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    officialMetadataUri: "https://www.eac.int/documents/category/eac-customs-management-act",
    officialDocumentUri: "https://www.eac.int/documents/category/eac-customs-management-act",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "EAC official document catalogue identifies the 2004 Act and later amendment instruments.",
      "The 2009 revised edition is not a complete current consolidated text: the 2011, 2012, 2019 and 2025 amendment instruments must be acquired and cross-referenced.",
      "Do not infer Tanzania tariff rates from this Act alone; the EAC Common External Tariff and product-specific schedules are separate authorities.",
    ],
  },
  {
    code: "EAC_CUSTOMS_MANAGEMENT_AMENDMENT_ACT_2025",
    title: "East African Community Customs Management (Amendment) Act, 2025",
    instrumentKind: "ACT",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    publicationDate: "2025-09-26",
    officialMetadataUri: "https://www.eac.int/documents/category/eac-customs-management-act",
    officialDocumentUri: "https://www.eac.int/documents/category/eac-customs-management-act",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "The EAC official catalogue lists this amendment dated 26 September 2025.",
      "The exact commencement provisions, amendment text and provision crosswalk must be extracted from the official PDF before operative customs reliance.",
    ],
  },
  {
    code: "EAC_CUSTOMS_MANAGEMENT_REGULATIONS_2010",
    title: "East African Community Customs Management Regulations, 2010",
    instrumentKind: "REGULATION",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    publicationDate: "2010-12-01",
    officialMetadataUri: "https://www.eac.int/documents/type/rules-regulations",
    officialDocumentUri: "https://www.eac.int/documents?controller=download&file=67723f18-67c4-4fb4-b176-d47ed594166c&name=EAC+Customs+Management+Regulations.pdf&task=download.file",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "The official EAC PDF states that different parts may commence on dates appointed by the Council; commencement must be validated provision by provision.",
      "Subsequent amendments and notices must be cross-linked before this regulation is used for a current customs determination.",
    ],
  },
  {
    code: "EAC_RULES_OF_ORIGIN_2015",
    title: "East African Community Customs Union Rules of Origin, 2015 (Legal Notice EAC/139/2022)",
    instrumentKind: "REGULATION",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    publicationDate: "2022-07-01",
    officialMetadataUri: "https://www.eac.int/documents/type/rules-regulations",
    officialDocumentUri: "https://www.eac.int/documents/type/rules-regulations",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "The EAC official catalogue identifies Legal Notice EAC/139/2022 and an in-force date of 1 July 2022.",
      "Origin eligibility requires product-specific rules, cumulation and documentary evidence; country of dispatch alone does not establish EAC origin.",
    ],
  },
  {
    code: "EAC_COMMON_EXTERNAL_TARIFF_2022",
    title: "East African Community Common External Tariff (2022 structure and subsequent amendments)",
    instrumentKind: "CUSTOMS_TARIFF",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    publicationDate: "2022-07-01",
    officialMetadataUri: "https://www.eac.int/?catid=243&id=2464%3Atrade-regime&view=article",
    officialDocumentUri: "https://www.eac.int/?catid=65&id=2292%3Aonline-tariff&view=article",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "The EAC describes the Common External Tariff as the regional tariff schedule and provides an online tariff browser and duty estimator.",
      "The 0/10/25/35 percent bands are broad structure only; sensitive-product lines and amendments can exceed or differ from these bands. Do not compute duty from the four bands without the current tariff line, legal notes, origin and relief data.",
    ],
  },
  {
    code: "EAC_ASSEMBLING_MANUFACTURING_REGULATIONS_2025",
    title: "East African Community Assembling and Manufacturing of Products Regulations, 2025",
    instrumentKind: "REGULATION",
    jurisdictionCode: "EAC",
    status: "ENACTED",
    officialMetadataUri: "https://www.eac.int/documents/type/rules-regulations",
    officialDocumentUri: "https://www.eac.int/documents/type/rules-regulations",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "The EAC official catalogue states that these Regulations come into force on 1 July 2026.",
      "The full regulation, eligibility criteria, transitional rules and interaction with origin/duty remission provisions must be acquired and reviewed before customs relief is calculated.",
    ],
  },
  {
    code: "TZ_FINANCE_BILL_2026_NO_3",
    title: "The Finance Bill, 2026 (Bill No. 3 of 2026)",
    instrumentKind: "BILL",
    jurisdictionCode: "TZ",
    status: "BILL_NOT_LAW",
    publicationDate: "2026-06-15",
    officialMetadataUri: "https://oagmis.oag.go.tz/portal/bills/eyJpdiI6IkpHcXpHalBJREZsSngwcXZxZWRvR2c9PSIsInZhbHVlIjoicDg1Nk1GTXZMOWdWVzl5Wjl5ZzgxQT09IiwibWFjIjoiMjU2YmI4MTQ5ODMwOTM1MmYwNDE4MmQwZjUzYTAzZjQ4Mzg0MGE0ZjZjNzQxYTUxZjk1ODU0Y2FjZDQ0NGNhZSIsInRhZyI6IiJ9",
    officialDocumentUri: "https://polis.parliament.go.tz/uploads/bills/1781852249-Muswada_wa_Sheriia_ya_Fedha_wa_Mwaka_2026_%28The_Finance_Bill%2C_2026%29.pdf",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    supersededBy: "TZ_FINANCE_ACT_2026_NO_2",
    notes: [
      "Preserve as legislative history only. A Bill is not the enacted law.",
      "The owner-supplied 15 June 2026 Special Bill Supplement is a Bill; its running header saying 'The Finance Act, 2026' must not cause it to be mistaken for the final Act.",
      "The enacted Act differs from the Bill on tax-relevant wording and figures. Never ingest the Bill as the operative source when the enacted Act is available.",
    ],
  },
] as const;

export function getVerifiedTaxAuthorities() {
  return VERIFIED_TAX_AUTHORITIES;
}

export function getEnactedTaxAuthorities() {
  return VERIFIED_TAX_AUTHORITIES.filter((record) => record.status === "ENACTED");
}
