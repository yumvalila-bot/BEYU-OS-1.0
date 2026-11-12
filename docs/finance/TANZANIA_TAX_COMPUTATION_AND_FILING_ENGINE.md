# FINANCE_OS — Tanzania Mainland tax computation and filing engine

**Implementation:** PR #117 · **Engine:** `TZ-MAINLAND-TAX-2026.1` · **Evidence reviewed:** 12 November 2026

This is an extension of FINANCE_OS. It is not a Tax OS.

## 1. What now executes

The new deterministic module is `src/lib/finance/tanzania-tax-computation-engine.ts`. It uses whole-TZS integer arithmetic, rounded to the nearest shilling, validates safe integer inputs and emits a calculation breakdown, formula version, legal-source links and explicit limitations.

| Tax / fee | Executable operation | Evidence / limitations |
|---|---|---|
| PAYE | Resident primary progressive monthly bands; non-resident employee 15%; secondary employment 30%; non-full-time director 15% | Current TRA PAYE guidance. Benefits-in-kind, approved retirement contributions, lump sums, multiple employments and special cases require additional schedules/review. |
| Corporate income tax | Standard 30% of supplied taxable income | Income Tax Act Cap. 332 R.E.2023 First Schedule para 3(1). Incentives, sector regimes, loss rules, credits and PE repatriated income are not computed. |
| Personal income tax | Resident annual progressive bands; non-resident 30% | Income Tax Act Cap. 332 R.E.2023 First Schedule para 1. Special investment-gain/pension rules, reliefs and credits excluded. |
| Presumptive income tax | Published TRA turnover/records schedule up to TZS 200m | Uses current TRA public guide. New-trader 12-month relief is deliberately not applied because GN 158B official Gazette authentication and Commissioner approval are outstanding. Eligibility/excluded professions need specialist confirmation. |
| VAT | Mainland standard 18%, zero-rated supplies, verified input-credit subtraction | TRA VAT guidance. Input credits are excluded unless the caller explicitly marks evidence verified. Exempt/mixed supplies, reverse charge, imports, apportionment and special relief require further rule modules. |
| Income-tax withholding | Published TRA payment-category schedule for supported categories and residency | Treaty relief is rejected unless a separately authenticated treaty workflow exists. Exemptions and category characterization require review. |
| Customs processing fee | GN 158D 1% FOB dry cargo other than petroleum; TZS 20m per vessel for specified wet petroleum cargo | Fee estimate only. Requires covered home-consumption import, verified origin facts where EAC goods are concerned, cargo characterization and exemption review. No customs duty is calculated. |

Sources:
- TRA PAYE guide: https://www.tra.go.tz/page/pay-as-you-earn
- TRA VAT guide: https://www.tra.go.tz/page/value-added-tax-vat
- TRA withholding-tax guide: https://www.tra.go.tz/page/withholding-tax
- TRA individual-income/presumptive guide: https://www.tra.go.tz/page/income-tax-for-individuals
- OAG Income Tax Act Cap. 332 R.E.2023: https://oagmis.oag.go.tz/portal/acts/revised/436/download
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

The current API creates DRAFT records only. The specialist approval, TRA submission, external receipt reconciliation and accepted-return lifecycle endpoints remain to be implemented and independently reviewed.

## 4. Filing-calendar rules currently encoded

- VAT: 20th day of the following month, per TRA VAT guidance.
- PAYE / income tax withheld: 7 days after month-end, based on Income Tax Act section 109 and TRA withholding guidance.
- Corporate/personal annual return: six months after the end of the accounting/year-of-income period, as described by TRA corporation-tax guidance.

These dates are used only to prefill draft packs. The UI asks for the period; the engine does not silently invent a period. The taxpayer's approved accounting period, public holidays/business-day treatment, filing extensions and current portal instructions still need confirmation. Provisional instalment-tax calendars are not generated.

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
- Automated filing submission, payment, tax-certificate retrieval or TRA IDRAS integration. The TRA guide describes online taxpayer-portal filing; no supported public submission API or authorized BEYU credential integration has been established.
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
