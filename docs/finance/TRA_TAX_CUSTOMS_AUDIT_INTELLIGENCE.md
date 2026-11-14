# FINANCE_OS — TRA Legal, Tax, Customs & Audit Intelligence

## Status

This change adds the initial TRA source-title inventory and surfaces it in the existing
Finance OS tax workspace. It does **not** claim that source PDFs, judgments, audit reports,
or operative tax rates have been downloaded, parsed, indexed, or legally verified.

The inventory was transcribed from owner-supplied TRA archive listings. Each record is
explicitly marked:

- `sourceAuthority = TRA_ARCHIVE_LISTING`
- `ingestionStatus = SOURCE_REQUIRED`
- `authorityStatus = UNVERIFIED`

The catalog is discovery metadata, not a legal source of truth. Do not use it to calculate
tax liabilities or state that an instrument is currently in force.

## Collections

1. Primary legislation and Finance Acts (the supplied Finance Acts 2007–2023 and named Acts).
2. Regulations and statutory orders.
3. Historical income tax tables.
4. International tax treaty inventory.
5. Tax case-law inventory.
6. TRA audited financial and revenue statements for FY2022–FY2024.
7. EAC customs and domestic revenue forms.
8. TRA practice notices (15 supplied titles).

## Canonical storage and retrieval

The repository already has the governed `knowledge_sources` registry, source provenance,
scope, classification, effective dates, review windows, supersession and NOELIA retrieval
controls. This feature deliberately reuses that registry rather than creating a duplicate
document database or a separate Tax OS.

When original sources are obtained, ingest them through the existing authorized knowledge
ingestion process. Preserve the original file and checksum; store extracted text as a
traceable derivative; retain page/section/article references; classify and scope each source;
and require authorized review before authority promotion.

## Legal authority model

- Acts and Finance Acts: primary legislation, subject to amendment, commencement, repeal,
  transitional provisions and applicable consolidation.
- Regulations and orders: subsidiary legislation, subject to enabling Act, commencement,
  amendments and revocation.
- Tax tables: historical year-specific material; never apply outside the verified tax year.
- Treaties: verify text, protocol, ratification, entry into force, effective date and termination.
- Cases: retrieve actual judgments; distinguish ratio, obiter, submissions and later appellate
  treatment.
- Audited reports: distinguish financial statements, auditor opinions, revenue reports,
  management reports and internal audit evidence.
- Forms: preserve official form revision; do not confuse TRA forms with internal worksheets.
- Practice notices: administrative interpretation, not automatically legislation or binding
  judicial precedent.

## NOELIA and financial authority

NOELIA may provide scoped, cited, explanatory decision support and draft checklists. It may not
approve or post journals, authorize payments, submit tax returns or customs declarations, or
issue professional legal opinions. Tax answers require human specialist review. Finance remains
the operational financial system of record. BEYU OS retains strategic capital governance.
`CAP_POSTING` remains locked and fail-closed.

## Next implementation gates

1. Obtain and checksum original TRA PDFs and actual judgments.
2. OCR scanned files and validate extracted text against page images.
3. Verify legal status, effective dates, amendment chains and treaty entry into force.
4. Ingest through the existing governed `knowledge_sources` process.
5. Add source-linked tests for retrieval, version selection, tax-year boundaries, scope isolation
   and NOELIA citations.
6. Implement calculations only from specialist-verified, effective-dated rules and only after
   the existing authority gate permits them.

The later six-capability expansion adds migration 0076 to extend the existing knowledge_sources
metadata; it still does not create a separate tax document table or permit direct writes.

## 2026 subsidiary legislation verification

A separate source-verification dossier and read-only FINANCE_OS panel now cover:
- GN 158F of 2026, the Income Tax (Single Instalment Tax on Forest Produce) Regulations: reproduced text located, but the official Gazette PDF and exact issue/supplement match remain pending.
- GN 158G of 2026, the Tax Administration (General) (Amendment) Regulations: OAG MIS metadata confirms the GN number, publication date (30 June 2026) and commencement date (1 July 2026), but the complete official instrument text remains pending.

The forest-produce reproduced text is mapped clause-by-clause to the official Income Tax Act section 116A as replaced by Finance Act No. 2 of 2026, section 25. The four statutory payment triggers, forest-cess event, valuation definition and temporal version history are preserved. The shorter reproduced regulation 3 wording is explicitly not allowed to narrow the Act.

All subsidiary-instrument records remain SOURCE_LINKED_NOT_INGESTED. GN 158F is not represented as officially authenticated. No certificate workflow, tax calculation, penalty calculation, transport clearance, filing or payment automation is activated.


## Six-capability implementation

The six-capability architecture and activation contract is documented in
[`TAX_INTELLIGENCE_CAPABILITY_ARCHITECTURE.md`](./TAX_INTELLIGENCE_CAPABILITY_ARCHITECTURE.md).
The existing FINANCE_OS tax workspace now surfaces Tax Law Intelligence, Tax Computation,
Customs/HS, Compliance, Audit/Dispute and NOELIA Tax Intelligence as one integrated capability
set. They are explicitly inactive until their evidence and specialist gates are satisfied.

Migration `0080_tax_legal_authority_metadata.sql` adds legal-source provenance fields to the
existing `knowledge_sources` registry: instrument kind, publication/commencement/effective
dates, original-document SHA-256, official source host, text-validation reviewer, specialist
reviewer, enabling provision, amendment/repeal links and provision citations. It does not create
a duplicate tax document table.

The existing governed `knowledge.ingest` action accepts a strict tax-legal metadata envelope.
Tax legal sources remain UNDER_REVIEW and source-authentication status SPECIALIST_REVIEWED after
ingestion; the existing approved `knowledge.publish` action is the only promotion path. It
rechecks the original source and named review evidence against the comma-separated
`TAX_OFFICIAL_SOURCE_HOSTS` allowlist before promotion. The database constraint independently
rejects an incomplete AUTHORITATIVE tax legal source.

NOELIA's TAX knowledge and citation-status paths now exclude legacy TAX summaries and accept
only `TAX_LEGAL_AUTHORITY` records with both authority status and source-authentication status
AUTHORITATIVE, within their effective/review windows and the caller's existing scope.

Computation, customs, compliance, audit and NOELIA capability contracts are present, but this
does not activate numeric tax calculations, HS determinations, filing calendars, return/payment
actions or customs clearances. The tax rule registry remains empty until official source
authentication and specialist-approved deterministic rules are complete.


## Official OAG PDF endpoint verification — 12 November 2026

The official OAG MIS PDF download endpoints have now been opened and their parsed text inspected for GN 158A, 158C, 158D and 158G:
- GN 158A: https://oagmis.oag.go.tz/portal/legislation/4642/download
- GN 158C: https://oagmis.oag.go.tz/portal/legislation/4644/download
- GN 158D: https://oagmis.oag.go.tz/portal/legislation/4645/download
- GN 158G: https://oagmis.oag.go.tz/portal/legislation/4648/download

This confirms the official OAG PDF endpoints and enables text-level review. The original PDF bytes have not yet been stored in the governed `documents` registry, SHA-256 checksums have not been computed against those original files, and no specialist has approved ingestion. These records remain source-linked and NOELIA-blocked.

The official text confirms the GN 158A trailer-manufacturer staffing/equipment criteria, GN 158C's scheduled electronic-payment transaction categories and transition, GN 158D's 1% FOB dry-cargo fee / TZS 20m per-vessel wet petroleum fee and exemptions, and GN 158G's social-media profile display amendment. See the full source dossier in `TANZANIA_2026_TAX_SUBSIDIARY_LEGISLATION_VERIFICATION.md`. Do not activate any tax/customs calculations or compliance actions from this text review alone.
