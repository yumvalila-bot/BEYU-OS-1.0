# FINANCE_OS tax engine — release and activation gates

Updated: 12 November 2026

## Operational functions implemented in this branch

- Effective-dated tax-law source metadata in the canonical `knowledge_sources` registry, including original-document linkage, SHA-256, official host, commencement/effective dates, text validation, specialist review, amendments and repeals.
- Provisional Tanzania Mainland estimates for PAYE, standard corporate income tax, individual income tax, presumptive income tax, standard VAT, VAT withholding, selected income-tax withholding categories, GN 158D customs processing fee and forest-produce single instalment tax.
- Effective-date guard for VAT withholding, customs processing fee and forest-produce rules from 1 July 2026.
- Filing-pack generation with tax-period validation, source references, calculation breakdown, due dates and selected instalment milestones.
- Tenant/entity/classification-scoped tax return drafts, specialist review, Group CFO approval gate, manual TRA submission recording and checksum-backed TRA receipt acceptance/rejection.
- NOELIA tax-law retrieval gate: unverified/legacy tax summaries cannot be represented as authoritative law.

## Legal-source evidence boundary

The official OSG e-Library Finance Act No. 2 of 2026 PDF has been text-inspected and its effective date and relevant provisions cross-walked. The original PDF bytes have not yet been ingested into the governed `documents` registry or SHA-256 verified. GN 158A, 158C, 158D and 158G official OAG PDF endpoints have been inspected, but their original PDF bytes/checksums are also outstanding. GN 158B, 158E and 158F remain reproduced-copy leads pending official Gazette matching. No such source is promoted to `AUTHORITATIVE` in this branch.

VAT withholding distinction: the current TRA VAT guidance describes the amount actually withheld as 3% of consideration for goods and 6% for services. Finance Act 2026 section 91 specifies the supplier's entitlement proportions (15% / 12%) and the 3:2 apportionment for mixed supplies. Do not treat 15% / 12% as the amount withheld.

## What remains disabled

- Final liability determination and approval for filing remain blocked until every relied-on source has original-file authentication, checksum verification, provision-level text validation and named specialist review.
- Input VAT credit deduction is not enabled through the public compute API because invoice eligibility/evidence is not yet verified server-side.
- Commissioner-approved new-trader relief, treaty relief, exemptions and special regimes are not automatically applied.
- HS classification, customs duty/valuation, import-control decisions, non-resident digital excise and other unimplemented schedules remain out of scope.
- GN 158F certificate issuance, buyer-payment, transport-clearance and inspection workflows remain disabled pending official Gazette authentication.
- NOELIA may explain only verified sources after ingestion; it cannot approve, submit, post or pay.
- No automated TRA portal submission, payment, customs declaration, accounting posting or `CAP_POSTING` action is enabled.

## Filing workflow and segregation of duties

1. An authorized Finance user prepares a draft and filing pack.
2. A Tax Specialist records a provisional review.
3. A different Group CFO approves only when every relied-on legal source is authoritative.
4. A different Tax Filing Officer manually submits through the official TRA portal and records the external reference.
5. A different Tax Specialist, Tax Manager or Filing Officer records ACCEPTED/REJECTED only with a same-tenant/entity/jurisdiction, checksum-backed, AUTHORITATIVE `TAX_FILING_RECEIPT` document.
6. Database constraints and a trigger enforce approval/submission/receipt evidence and receipt-document scope.

The submission and receipt endpoints only record actions completed outside BEYU. They do not authenticate to or transact with TRA.

## Release conditions

- Current-head typecheck, lint, build and all focused Finance tests pass.
- PostgreSQL 16 migration installation, migration-integrity/snapshot chain and schema-drift checks pass on the current PR head.
- Root PostgreSQL security gate and dependency audit are cleared; pre-existing Next.js/Zod advisories must be resolved in a separately verified dependency update if still present.
- Specialist legal review signs off the source dossier and approved effective-dated rule schedule.
- Administrator appoints named users to TAX_SPECIALIST, TAX_MANAGER, TAX_FILING_OFFICER and GROUP_CFO roles with separation of duties.
- Human approval of the production migration and deployment is obtained. This branch does not apply production migrations or deploy.

## Current PR posture

PR #117 remains draft, unmerged and non-production. Migration 0076/0077 and their Drizzle snapshots are branch-only. The PR-triggered database workflow is for scratch PostgreSQL validation only; no production database migration or Vercel production deployment has been performed.
