/**
 * Verified primary-source metadata for Tanzania's 2026 finance legislation.
 *
 * These records distinguish the June 2026 Bill from the enacted Act. Source
 * discovery does not itself ingest content into knowledge_sources or authorize
 * NOELIA to rely on a legal proposition.
 */
export type VerifiedTaxAuthorityRecord = {
  code: string;
  title: string;
  instrumentKind: "ACT" | "BILL";
  jurisdictionCode: "TZ";
  status: "ENACTED" | "BILL_NOT_LAW";
  publicationDate: string;
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
    officialDocumentUri: "https://oagmis.oag.go.tz/portal/acts/337/download",
    ingestionStatus: "SOURCE_LINKED_NOT_INGESTED",
    noeliaReliance: "BLOCKED_PENDING_GOVERNED_INGESTION_AND_REVIEW",
    notes: [
      "Official Office of the Attorney General metadata identifies this as Enactment No. 2 of 2026.",
      "Publication and commencement dates are recorded separately; do not infer that every provision has identical application beyond the Act's commencement and any specific transitional wording.",
      "The official PDF is the enacted Act, not the earlier Special Bill Supplement.",
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
