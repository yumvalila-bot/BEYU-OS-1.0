# Tanzania Finance Act 2026 — primary-source verification

## Verified legislative identity

The Office of the Attorney General's OAG MIS record identifies **The Finance Act, 2026** as
**Enactment No. 2 of 2026**, enacted on **25 June 2026**, published on **30 June 2026**, and
commencing on **1 July 2026**. The official Act PDF is available from the OAG MIS download
endpoint.

- OAG MIS record: https://oagmis.oag.go.tz/portal/acts/337
- Official enacted Act PDF: https://oagmis.oag.go.tz/portal/acts/337/download
- OSG e-Library record: https://elibrary.osg.go.tz/items/76001fca-3ffd-4ce4-bf7e-08419024e649/full

## Bill is not the Act

The 15 June 2026 Special Bill Supplement is **The Finance Bill, 2026 (Bill No. 3 of 2026)**.
The notice on its opening pages says it is a Bill to be submitted to the National Assembly.
It is legislative history, not the final operative Act.

- OAG MIS Bill record: https://oagmis.oag.go.tz/portal/bills/eyJpdiI6IkpHcXpHalBJREZsSngwcXZxZWRvR2c9PSIsInZhbHVlIjoicDg1Nk1GTXZMOWdWVzl5Wjl5ZzgxQT09IiwibWFjIjoiMjU2YmI4MTQ5ODMwOTM1MmYwNDE4MmQwZjUzYTAzZjQ4Mzg0MGE0ZjZjNzQxYTUxZjk1ODU0Y2FjZDQ0NGNhZSIsInRhZyI6IiJ9
- Parliament Bill PDF: https://polis.parliament.go.tz/uploads/bills/1781852249-Muswada_wa_Sheriia_ya_Fedha_wa_Mwaka_2026_%28The_Finance_Bill%2C_2026%29.pdf

The owner-supplied Library PDF named `Muswada_wa_Sheriia_ya_Fedha_wa_Mwaka_2026_(The_Finance_Bill,_2026).pdf`
is this earlier Bill/Special Bill Supplement. Its running header says “The Finance Act, 2026”,
but its cover and notice identify it as a Special Bill Supplement and a Bill. Do not ingest or
cite it as the enacted Act.

## Why version separation matters

The final Act is not a metadata-only reprint of the Bill. Examples confirmed by comparing the
official final Act PDF with the June Bill include:

- Excise duty annual adjustment: the Bill's wording refers to the **projected inflation rate**;
  the enacted Act refers to the **year-on-year actual inflation rate for the period ending March**,
  plus 2%.
- Imported vehicle age bands: the Bill text shows 20%, 40% and 50% bands; the enacted Act text
  shows 18%, 35% and 40% for the corresponding age bands.

These examples are evidence of why Bill text must not be promoted into the operative tax rule
set. This document does not convert those provisions into machine tax rates or determine
application to any taxpayer.

## BEYU ingestion and NOELIA controls

The new `verified-tax-authorities.ts` register records both instruments and their official links.
It intentionally reports `SOURCE_LINKED_NOT_INGESTED` for both. The metadata record is not the
PDF content and does not populate `knowledge_sources`.

Required next steps before NOELIA may rely on the Act:

1. Acquire the final official Act PDF and record its SHA-256 checksum, file size, retrieval time,
   source URL and immutable original artifact.
2. Extract/OCR text and validate it against the page images; retain page and section locators.
3. Compare the enacted Act against the Bill and the pre-amendment principal Acts.
4. Build an amendment map for each affected principal Act, with commencement and transitional
   provisions, and separately locate any regulations/Gazette orders required for implementation.
5. Submit the document through the existing governed `knowledge.ingest` action. Do not write
   directly to `knowledge_sources`.
6. Require the prescribed human approval and independent specialist review before authoritative
   publication. Keep the Bill as non-authoritative legislative history.
7. Only after legal verification may tax specialists propose effective-dated rules. The tax
   specialist registry remains empty and liability computation remains disabled until the
   applicable authority gates are formally satisfied.

## Source-status discipline

- **ENACTED** describes the legislative status of the Act, not completion of BEYU ingestion.
- **BILL_NOT_LAW** describes the Bill's status and prevents it being confused with enacted text.
- **SOURCE_LINKED_NOT_INGESTED** means an official source location is known, but no document
  content has been ingested into BEYU's governed knowledge registry.
- **NOELIA reliance remains blocked** until ingestion, checksum verification, scope/classification
  controls, legal review, and specialist approval are complete.

No tax rate, deduction, threshold, exemption, filing instruction or liability calculation is
activated by this source-register addition. `CAP_VAT` and `CAP_POSTING` remain governed and
fail-closed.
