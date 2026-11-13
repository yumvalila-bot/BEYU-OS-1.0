# FINANCE_OS Tax Intelligence — Capability and Authority Architecture

## Placement and scope

All six capabilities live inside the existing `FINANCE_OS` Tax workspace and specialist boundary. There is no Tax OS, new kernel, duplicate document database or second NOELIA knowledge registry.

The implementation reuses:
- `knowledge_sources` as the canonical governed knowledge registry;
- `documents` for original file storage metadata and original-file checksums;
- the existing `knowledge.ingest`, `knowledge.replace` and `knowledge.publish` approval workflow;
- existing tenant/entity/country/classification scope and RLS;
- existing audit/event and NOELIA retrieval controls;
- `src/lib/specialist/tax-intelligence.ts` as the tax specialist boundary.

The additive migration `0076_tax_legal_authority_metadata.sql` extends `knowledge_sources` with legal instrument metadata. It does not create a parallel tax-source table. `original_source_sha256` identifies the acquired source file; `content_digest` continues to identify the normalized text content.

## Six capabilities

| Capability | Responsibility | Activation boundary |
|---|---|---|
| Tax Law Intelligence | Legislation, interpretations, amendments, exemptions, rulings, judgments, effective dates and legal relationships | Source authentication and specialist review |
| Tax Computation Engine | Personal/corporate income tax, PAYE, VAT, withholding, presumptive, excise, stamp duty and other applicable taxes | Verified effective rules + capability activation + specialist approval |
| Customs & HS Intelligence | HS classification, origin, valuation, customs procedure, duties, exemptions, controls and processing fees | Official tariff/legal sources + customs specialist approval |
| Tax Compliance Management | Filing periods, due dates, returns, payment obligations, certificates and compliance monitoring | Each obligation linked to an authenticated provision and confirmed deadline |
| Tax Audit & Dispute Intelligence | Audit preparation, evidence register, notices, objections, appeals, judgments and risk | Checksummed evidence + verified law/case sources + specialist review |
| NOELIA Tax Intelligence | Explain, compare, cite, show effective dates, explain calculation paths and surface compliance risk | Authenticated source retrieval only; always advisory and reviewable |

## Source authentication lifecycle

The domain contract models these states:

1. `DISCOVERED` — title or source lead only.
2. `OFFICIAL_METADATA_VERIFIED` — an official catalogue record is confirmed; full text is not yet authenticated.
3. `ORIGINAL_ACQUIRED` — original signed/gazetted PDF or judgment acquired.
4. `CHECKSUM_VERIFIED` — SHA-256 of the original file recorded.
5. `TEXT_VALIDATED` — OCR/extracted text reconciled against page images; reviewer recorded.
6. `SPECIALIST_REVIEWED` — named tax/legal specialist confirms identity, provisions, dates and relationships.
7. `AUTHORITATIVE` — promoted through the existing human-approved `knowledge.publish` action.
8. `SUPERSEDED` / `REJECTED` — source no longer current or fails review.

An official metadata listing is not a substitute for the original instrument. A third-party transcription, search result, professional update, or owner-supplied title is discovery evidence only. It cannot satisfy source authentication by itself.

### Required legal metadata

Tax legal sources are registered as `source_type = TAX_LEGAL_AUTHORITY` in `knowledge_sources`. They carry:
- instrument kind and jurisdiction;
- official source URI and exact host;
- reference to the original uploaded document in the governed `documents` registry, with its stored SHA-256 checked against the supplied digest;
- publication, commencement, effective-from and effective-to dates;
- text-validation date and reviewer;
- specialist-review date and reviewer identity;
- enabling provision for regulations/orders;
- amendments, repeals and supersession links;
- page/section/regulation/article references.

The database constraint prevents a tax legal source from being promoted to `AUTHORITATIVE` unless these required evidence fields, including the original uploaded document link, are present. The ingest/publish workflow verifies the linked original document is in the same tenant scope, checks its stored SHA-256 against the submitted digest, binds the named specialist reviewer to the authenticated ingest actor, and validates the official source host against the deployment configuration `TAX_OFFICIAL_SOURCE_HOSTS` (comma-separated hostnames). An empty host register fails closed. Publication remains a separate existing human-approved action. The dedicated Tax Specialist role/appointment mapping and persisted capability activation approvals are not yet provisioned; capability operations therefore remain inactive.

### Effective-date rules

- Applicability is evaluated against the requested transaction/tax date, not merely today's date.
- Publication, commencement and tax-effective dates remain distinct.
- A Finance Act amendment does not erase the previous wording: prior and amended provisions remain separately versioned.
- A regulation must identify its enabling Act/provision.
- Treaties require entry-into-force and effective-date evidence for the relevant taxes and parties; a country list is not proof of treaty applicability.
- Judgments require the actual judgment, court, case number, date, ratio/holding and subsequent appellate treatment.
- Practice notices remain administrative interpretation, not primary legislation or binding precedent.
- Historical tax tables and rates must never be projected into another tax year.

## NOELIA controls

For `domain = TAX`, the legal knowledge service now retrieves only records that are both:
- `source_type = TAX_LEGAL_AUTHORITY`;
- `source_authentication_status = AUTHORITATIVE`;
- `authority_status = AUTHORITATIVE`;
- within the effective window, review window and classification/scope envelope.

Existing legacy TAX knowledge summaries remain in the registry for historical context but are not presented by the Tax legal service as authenticated legal authority. NOELIA must state when no authenticated source matches. Generated model text is inference, not authority.

## Computation and compliance activation

The capability contracts deliberately separate a readiness decision from execution. A ready gate requires:
1. the capability itself is marked ACTIVE with an activation approval reference;
2. a current, capability-specific specialist approval exists;
3. the approver role is permitted for that capability;
4. the approval explicitly covers the currently effective authenticated source codes;
5. source jurisdiction and effective dates match the operation.

Even a passing gate returns no liability. A separate deterministic formula/rule implementation, test evidence and specialist sign-off are still required. No rates, thresholds, HS classifications, customs duty amounts or filing deadlines are seeded by this work.

Compliance obligations must carry an explicit due date and a provision reference in the authenticated source. Draft obligations are not silently converted into authoritative calendar entries. No return submission, payment, customs declaration or clearance is automated.

## Audit and evidence

Audit evidence must have an identifier, secure source URI, SHA-256 and capture date. Evidence remains subject to classification, legal entity, tenant and country scope. An audit/dispute dossier should preserve original returns, payment receipts, invoices, contracts, ledger extracts, customs entries, TRA correspondence and actual judgments without modifying originals.

## Current Tanzania source position

The existing PR inventory contains owner-supplied source titles, Finance Act 2025/2026 authority records and seven 2026 subsidiary-instrument dossiers. Current acquisition limitations remain:
- GN 158A, 158C, 158D and 158G have OAG metadata evidence but their complete official instrument texts were not acquired in this work.
- GN 158B, 158E and 158F remain reproduced-copy leads pending exact official Gazette matching.
- The existing inventory and professional summaries are not promoted as authoritative tax rules.
- No tax rule registry is seeded; no tax liability, customs duty or filing deadline is activated.

This architecture provides the traceability and fail-closed controls. It does not claim that the missing Gazette PDFs, treaty texts, judgments or historical TRA source files have already been authenticated.

## Implementation sequence

1. Acquire official original PDFs/judgments and store originals with SHA-256.
2. Validate OCR/text against source page images and record exact provision references.
3. Complete specialist review and legal relationship mapping.
4. Ingest via governed `knowledge.ingest`; publish only via approved `knowledge.publish`.
5. Add version-selection, retrieval, tenant/entity/country isolation and audit tests.
6. Build deterministic tax and customs rules only from authenticated sources.
7. Build filing calendars from verified obligation provisions and due-date logic.
8. Enable NOELIA answers only against the authenticated corpus, with citations and mandatory human review for material positions.

## Explicitly not done

No production migration, deployment, Vercel setting, domain/DNS change, return submission, tax payment, customs filing, ledger posting or activation of tax computation/compliance was performed by this implementation.


## Operational estimate and filing workflow extension — 12 November 2026

The FINANCE_OS tax workbench now exposes `POST /api/v1/finance/tax/compute`, persists TIN-backed draft packs in `tax_return_drafts`, lists them through `GET /api/v1/finance/tax/returns`, and supports specialist provisional review plus a second-person CFO approval gate. The calculation module is `tanzania-tax-computation-engine.ts`; source schedules, formula version and warnings are attached to every result. See `TANZANIA_TAX_COMPUTATION_AND_FILING_ENGINE.md`.

The calculator's PAYE monthly brackets are cross-checked to the current TRA Individual Income Tax guide; standard VAT and income-tax WHT to TRA guides; presumptive threshold/rate and VAT withholding to the enacted Finance Act No. 2 of 2026 (OSG e-Library PDF); standard CIT to the Income Tax Act; GN 158D processing fee to the official OAG PDF endpoint. All remain provisional pending original-document checksum ingestion, complete statutory amendment crosswalk and specialist ratification.

The Group CFO approval endpoint requires calculation authority status AUTHORITATIVE, a rule approval reference and every source reference at AUTHORITATIVE. No current estimate satisfies those conditions. No TRA filing API/credential integration is enabled, no external receipt is fabricated, and CAP_POSTING remains untouched.


### Domain engines added in the engineering continuation — 13 November 2026

- `tax-compliance-engine.ts`: deterministic monthly/annual obligation planner for VAT, VAT withholding (separate payment and statement dates), PAYE, income-tax withholding, corporate provisional instalments and annual final returns, and individual returns. Every obligation remains `PLANNED_UNCONFIRMED`; weekend/holiday adjustments, extensions and portal-specific calendars are not inferred.
- `customs-classification-workflow.ts`: structured product facts, origin, valuation method, evidence and specialist/ruling workflow. It intentionally never infers an HS code or enables duty calculation.
- `tax-audit-dispute-dossier.ts`: tenant/entity-scoped dossier contract, checksum and period validation, notice/assessment/objection/appeal deadline evidence requirements, and transparent risk-triage factors. A risk band is not a finding of fraud or liability.
- `noelia/tax-intelligence.ts`: reusable source filter for jurisdiction, as-of date, effective window, authoritative legal status, authenticated source status and URI. The existing NOELIA legal/tax knowledge retrieval now applies this filter before returning tax findings.
- `tax-domain-engines.test.ts`: regression coverage for monthly/annual compliance dates, fail-closed HS classification, audit evidence and risk triage, and NOELIA effective-source filtering.

The computation API now rejects use of the post-1 July 2026 presumptive, forest-produce, VAT-withholding and customs schedules for periods beginning before commencement. A historical or split-period computation must be added from authenticated pre-commencement rules rather than applying the current schedule retrospectively.

### VAT withholding interpretation guard

The deterministic VAT-withholding estimate uses the current TRA guidance amounts (3% of consideration for goods and 6% for services). Finance Act No. 2 of 2026 section 91 records the supplier's VAT-credit entitlement proportions (15% goods / 12% services) and 3:2 mixed-supply apportionment; section 95 sets the payment and statement deadline. These are distinct concepts and must not be conflated. Appointment as a withholding agent and the transaction facts require verification. The two ten-day milestones are recorded separately in the filing pack.


## Expanded primary-law catalogue and operational safeguards — 13 November 2026

The verified-authority metadata register now also links the following OSG/OAG consolidated primary statutes:
- Income Tax Act, Cap. 332 (R.E. 2023 A.S. 2025), OSG Annual Supplement incorporating amendments through 1 July 2025.
- Value Added Tax Act, Cap. 148 (R.E. 2023 A.S. 2025), OSG Annual Supplement.
- Tax Administration Act, Cap. 438 (R.E. 2023 A.S. 2025), OSG Annual Supplement.
- Excise (Management and Tariff) Act, Cap. 147 (R.E. 2023), OAG revised legislation.
- Customs (Management and Tariff) Act, Cap. 403 (R.E. 2023), OAG revised legislation.

The catalogue is deliberately not labelled as a complete current law set. Each consolidated Act must be cross-linked to later Finance Acts, subsidiary instruments and relevant EAC customs law. Every record remains SOURCE_LINKED_NOT_INGESTED until the original PDF is uploaded to the existing documents registry, its checksum verified, extracted text/page references validated and specialist review published through the governed knowledge pipeline.

Engineering controls added in this work:
- Draft filing-pack creation is idempotent across retries for the same tenant, entity, tax type, period, formula version and calculation.
- Tanzania TINs are normalized from common display formats such as TIN-121-441-002 before draft creation; invalid identifiers do not produce a filing pack.
- The 2026 presumptive year crossing 1 July is blocked until the transition treatment is reviewed and encoded.
- Compliance instalments have unique identities, period-relative corporate dates, and no longer repeat the entire annual liability as each quarterly payment amount.
- NOELIA tax citations are restricted to the exact requested jurisdiction and valid as-of date.
- Customs specialist HS codes and determination effective dates are validated; duty remains disabled until authenticated tariff schedules and specialist approval are present.
- Audit/dispute dossiers require valid calendar periods, statutory deadlines, evidence identity, collector, checksum and specialist ownership.

These changes improve draft preparation and evidence handling; they do not activate unauthenticated tax rules, authorize final liability, file returns with TRA or enable CAP_POSTING.


### Official-source host allowlist

Tax-source ingestion and publication fail closed when TAX_OFFICIAL_SOURCE_HOSTS is empty. The initial administrator-reviewed allowlist for the registered Tanzania sources is: oagmis.oag.go.tz, elibrary.osg.go.tz, tra.go.tz, polis.parliament.go.tz, and eac.int. Configure this only through the deployment's approved environment/configuration process after verifying each host; never use a wildcard, URL suffix match or user-provided host. No production environment variable was changed by this PR.


NOELIA's finance-scoped tax.knowledge.query tool now routes through the same authenticated TAX_LEGAL_AUTHORITY retrieval service as the legal-domain query. It requires a two-letter jurisdiction and supports an explicit as-of date; authenticated SUPERSEDED sources may be cited only inside their historical effective window. The older tax-strategy summary reader is not used as a substitute for primary tax law.


### Regional customs-law sources

The primary-source register now includes EAC Customs Management Act 2004 and its 2025 amendment, EAC Customs Management Regulations 2010, EAC Rules of Origin 2015 (Legal Notice EAC/139/2022), the EAC Common External Tariff online schedule, and the EAC Assembling and Manufacturing of Products Regulations 2025 (catalogue states commencement 1 July 2026). EAC is represented as a regional jurisdiction code, distinct from Tanzania's national legislation. These sources remain SOURCE_LINKED_NOT_INGESTED: the full legal text, amendment/commencement crosswalk, current tariff-line data, product legal notes, rules of origin and customs relief schedules must be ingested and specialist-verified before any HS classification or duty estimate is activated. The four headline CET bands must never be used as a substitute for the current tariff line and sensitive-product schedule.


For Tanzania customs questions, NOELIA retrieval adds the EAC jurisdiction as a regional legal overlay while preserving Tanzania national authorities. General Tanzania income-tax queries do not automatically pull EAC sources. This overlay is limited to customs/import/export/HS/tariff/origin/duty queries and still requires each source to be authenticated, effective-dated and specialist-reviewed.
