# FINANCE_OS — Tanzania Mainland tax computation and filing engine

**Implementation:** PR #117 · **Engine:** `TZ-MAINLAND-TAX-2026.1` · **Evidence reviewed:** 12 November 2026

This is an extension of FINANCE_OS. It is not a Tax OS.

## 1. What now executes

The new deterministic module is `src/lib/finance/tanzania-tax-computation-engine.ts`. It uses whole-TZS integer arithmetic, rounded to the nearest shilling, validates safe integer inputs and emits a calculation breakdown, formula version, legal-source links and explicit limitations.

| Tax / fee | Executable operation | Evidence / limitations |
|---|---|---|
| PAYE | Resident primary progressive monthly bands; non-resident employee 15%; secondary employment 30%; non-full-time director 15% | Monthly Mainland bands are published by TRA under Income Tax for Individuals; special categories and benefits-in-kind need additional schedules/review. |
| Corporate income tax | Standard 30% of supplied taxable income | Income Tax Act Cap. 332 R.E.2023 First Schedule para 3(1). Incentives, sector regimes, loss rules, credits and PE repatriated income are not computed. |
| Personal income tax | Resident annual progressive bands; non-resident 30% | Income Tax Act Cap. 332 R.E.2023 First Schedule para 1. Special investment-gain/pension rules, reliefs and credits excluded. |
| Presumptive income tax | Finance Act 2026 First Schedule: up to TZS 200m; 4% turnover above TZS 11m; 3% marginal/flat amounts in lower bands | Uses enacted Finance Act 2026 table; the first-12-month new-business exemption is not applied without verified application/Commissioner approval and authenticated GN 158B procedure. Eligibility/excluded professions need specialist confirmation. |
| VAT | Mainland standard 18%, zero-rated supplies, verified input-credit subtraction | TRA VAT guidance. Input credits are excluded at the API boundary unless server-side evidence verification is added. Exempt/mixed supplies, reverse charge, imports, apportionment and special relief require further rule modules. |
| VAT withholding | TRA guidance: 3% of consideration withheld for goods and 6% for services; Finance Act 2026 s.91 specifies supplier share 15% / 12% and mixed supply taxable value apportioned 3:2 | Requires appointed withholding-agent status and transaction validation. Finance Act 2026 s.95: pay withheld VAT within ten days after the tax period and file the statement within ten days of the following month. |
| Income-tax withholding | Published TRA payment-category schedule for supported categories and residency | Treaty relief is rejected unless a separately authenticated treaty workflow exists. Exemptions and category characterization require review. |
| Customs processing fee | GN 158D 1% FOB dry cargo other than petroleum; TZS 20m per vessel for specified wet petroleum cargo | Fee estimate only. Requires covered home-consumption import, verified origin facts where EAC goods are concerned, cargo characterization and exemption review. No customs duty is calculated. |

Sources:
- TRA PAYE guide: https://www.tra.go.tz/page/pay-as-you-earn
- TRA VAT guide: https://www.tra.go.tz/page/value-added-tax-vat
- TRA withholding-tax guide: https://www.tra.go.tz/page/withholding-tax
- TRA individual-income/presumptive guide: https://www.tra.go.tz/page/income-tax-for-individuals
- TRA corporation-tax guide: https://www.tra.go.tz/page/corporation-tax
- TRA-hosted Income Tax Act Cap. 332 R.E.2023 PDF: https://www.tra.go.tz/images/uploads/acts/The_Income_Tax_Act.pdf\n- Office of the Solicitor General — Finance Act No. 2 of 2026 (official 57-page Act PDF): https://elibrary.osg.go.tz/bitstreams/631b33c8-8b1f-4f86-a238-af89659d06ec/download
- OAG GN 158D of 2026: https://oagmis.oag.go.tz/portal/legislation/4645/download

## 2. API and workspace

- UI: existing `/os/tax`, component `computation-workbench.tsx`.
- API: `POST /api/v1/finance/tax/compute`.
- Authorization: existing `finance:tax.assess`, canonical tenant scope, legal-entity scope, classification clearance, explicit Tanzania Mainland jurisdiction assignment and policy evaluation.
- Filing pack: requires a nine-digit TIN registered on the selected legal entity. If the entity has no TIN, the calculation still runs but no filing pack is saved.
- Monthly VAT/PAYE/withholding packs require a complete calendar-month period.
- The workbench displays formula breakdown, sources, warnings and the computed provisional amount. A saved pack is downloadable as JSON.

## 3. Persisted return drafts

Migration `0077_tax_return_drafts.sql` and schema `taxReturnDrafts` add tenant/entity-scoped working papers. Each draft stores:
- legal entity, jurisdiction, tax type and tax period;
- due date where a published deadline is available;
- amount payable, formula version and complete calculation JSON;
- complete draft filing-pack JSON and source references;
- creator, classification, idempotency reference and lifecycle fields.

PostgreSQL ENABLE + FORCE RLS uses `beyu_tenant_ids()`, classification context and legal-entity/tenant consistency. Runtime grants omit DELETE. Database constraints prevent a draft from becoming APPROVED_FOR_SUBMISSION, SUBMITTED or ACCEPTED without named specialist review/approval and, for submission/acceptance, an external TRA reference and timestamps.

The compute API creates DRAFT records. A separate specialist-review endpoint can record a provisional review, and a second-person Group CFO approval endpoint exists. The CFO endpoint deliberately rejects every current provisional calculation until source references are AUTHORITATIVE and the calculation carries an approved rule-set reference. Manual submission recording and verified receipt recording endpoints are implemented. The Filing Officer records the TRA reference only after filing externally; a specialist records ACCEPTED/REJECTED only with a same-tenant/entity/jurisdiction, checksum-backed and AUTHORITATIVE `TAX_FILING_RECEIPT` document. BEYU still does not submit to TRA.

## 4. Filing-calendar rules currently encoded

- VAT: 20th day of the following month, per TRA VAT guidance.
- PAYE / income-tax withholding: 7 days after month-end, based on Income Tax Act section 109 and TRA withholding guidance. VAT withholding: payment within ten days after the tax period and statement within ten days of the following month, under Finance Act 2026 section 95.
- Corporate/personal annual return: six months after the end of the accounting/year-of-income period, as described by TRA corporation-tax guidance.

These dates are used only to prefill draft packs. The UI asks for the period; the engine does not silently invent a period. For calendar-year corporate, individual and presumptive cases, the pack also lists TRA's four estimated-tax instalment dates (31 March, 30 June, 30 September, 31 December). Presumptive taxpayers with assessed tax not exceeding TZS 50,000 receive no instalment schedule. The taxpayer's approved accounting period, public holidays/business-day treatment, filing extensions and current portal instructions still need confirmation.

## 5. Why calculations remain provisional

The source registry now knows about official legal sources, but the original PDF bytes for GN 158A/C/D/G are not yet stored in the governed `documents` registry and checksum-verified; GN 158B/E/F still need official Gazette matching. The Income Tax Act R.E.2023 also needs a complete amendment crosswalk through Finance Act 2026 and subsequent instruments before all rates/exceptions can be marked current authority.

Therefore every result is `PROVISIONAL_ESTIMATE`, not an approved tax liability. The code does not write to the ledger, alter `CAP_POSTING`, make payments, assert compliance or submit to TRA. A specialist must validate source text, effective dates, taxpayer facts, exemptions and calculations before any legal reliance.

## 6. Explicitly not yet operational

- Full corporate tax adjustments, capital allowances/depreciation pools, loss carryforwards, alternative minimum tax, incentives and tax credits.
- Complete VAT return line mapping, input-tax eligibility/apportionment, reverse charge, refund schedules, VAT withholding agent calculations and reduced 16% category/public-notice logic.
- PAYE benefits-in-kind valuation, pension deductions, terminal/lump-sum spreading, director edge cases and multiple employment reconciliation.
- Treaty-relief determination, beneficial ownership, withholding exemptions, every WHT category edge case and 2026 statutory amendments.
- Excise duty, stamp duty, gaming tax, SDL, digital service tax and other sector taxes.
- EAC CET tariff database, binding HS classification, customs valuation adjustments, rules-of-origin decision engine, import-control permits and all customs exemptions.
- Automated filing submission, payment, tax-certificate retrieval or TRA IDRAS integration. The TRA VAT guide says registered traders submit returns online through the TRA Taxpayer Portal/IDRAS. No supported public submission API or authorized BEYU credential integration has been established.
- Persisted specialist approval workflow and accepted/rejected filing receipt lifecycle.

## 7. Activation sequence

1. Store original official sources in the existing governed document vault and verify SHA-256 against the uploaded bytes.
2. Complete statutory amendment crosswalks and page-level text validation.
3. Obtain named Tax Specialist / Tax Manager review and record role appointment plus source-specific approval.
4. Expand tax schedules and edge-case tests per tax type.
5. Add specialist review/approval APIs and state transitions for persisted drafts.
6. Establish an approved, least-privilege TRA submission integration if TRA provides/authorizes one; otherwise retain controlled manual submission with receipt upload.
7. Only after all evidence and governance gates pass, enable final tax determinations. CAP_POSTING remains locked unless its separate constitutional approval is granted.

## 8. Verification

Tests added:
- `tests/finance/tanzania-tax-computation-engine.test.ts`
- `tests/finance/tax-return-drafts-migration.test.ts`

Required CI still includes typecheck, lint, production build, focused tax tests, full PostgreSQL-backed regression, migration integrity/schema drift and database security gates. A code commit alone is not evidence of successful migration application or operational deployment.


## 9. Current public guidance cross-check — 12 November 2026

The current TRA Individual Income Tax guide expressly publishes Mainland monthly bands (TZS 270,000; 520,000; 760,000; 1,000,000), the presumptive turnover/record-keeping schedule, eligibility criteria, first-year relief application, and the four instalment dates. The calculator uses the enacted 4% turnover rate above TZS 11m and does not auto-apply new-trader relief; the exemption requires an application and Commissioner satisfaction under Finance Act 2026 First Schedule paragraph 2.

The current TRA VAT guide publishes the 18% Mainland standard rate and 20th-of-following-month VAT return/payment deadline. Finance Act No. 2 of 2026 section 91 specifies the supplier's entitlement proportions (15% of consideration for goods and 12% for services) and the 3:2 goods/services apportionment for mixed supplies. The current TRA VAT guide continues to state that the withholding agent actually withholds 3% of consideration for goods and 6% for services; the supplier receives the remaining 15% / 12% respectively. Section 95 provides the ten-day VAT-withholding payment and statement deadlines. The current TRA withholding guide publishes income-tax WHT categories/rates and the seven-day-after-month-end remittance deadline. The current TRA corporation-tax guide publishes quarterly estimated-tax dates and final-return filing within six months of the accounting-period end.

These pages are official administrative guidance, not a substitute for original statutory text, gazetted notices, taxpayer-specific facts or specialist interpretation. They can change without this code changing. Every calculation therefore remains provisional and must be revalidated against the governed source registry before legal reliance.


### Enacted Finance Act 2026 source crosswalk

The official Office of the Solicitor General e-Library PDF is the enacted Finance Act No. 2 of 2026 (57 pages; assent 30 June 2026; commencement 1 July 2026). Relevant provisions include:
- First Schedule paragraph 2 amendment: presumptive turnover threshold raised from TZS 100m to TZS 200m; turnover table retains 4.0% above TZS 11m; new-business 12-month exemption requires application and Commissioner satisfaction (sections 27 and page 31–32 of the Act).
- VAT Act section 5(5): Finance Act 2026 section 91 specifies supplier entitlement proportions of 15% for goods and 12% for services and mixed-supply apportionment 3:2 (goods:services). The actual withholding deduction remains 3% of consideration for goods and 6% for services under the current TRA VAT guide.
- VAT Act section 71(5)–(6): VAT withheld is paid within ten days after the tax period and the withholding VAT statement filed within ten days of the month following the tax period, section 95.

The OSG-hosted original PDF text has been inspected, but its original bytes have not yet been stored/checksummed in the governed `documents` registry. This source is therefore not yet AUTHORITATIVE for NOELIA or final liability activation.
