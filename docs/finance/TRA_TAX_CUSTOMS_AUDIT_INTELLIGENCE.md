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

## Deployment isolation

The feature branch uses root `vercel.json` `git.deploymentEnabled` with the branch pattern
`finance-os/*: false`. Vercel documents this as a branch-specific deployment opt-out;
unspecified branches retain their default behavior. Do not remove this guard until the owner
explicitly authorizes a deployment workflow for this branch.
