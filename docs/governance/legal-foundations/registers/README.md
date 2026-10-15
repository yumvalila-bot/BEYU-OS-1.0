# BEYU-LF — Section I: Registers, Templates and Operating Records

Document ID: `BEYU-LF-REG-REGISTERS-INDEX`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL` — **index**
Owner: Chief Governance Officer (proposed) — custodian of the register set
Classification: `INTERNAL` (this index) — the populated registers are `RESTRICTED` to `HIGHLY_RESTRICTED`

---

## The five rules that apply to every register in this section

1. **A register is a record, not a source of rights.** A register entry does not create an entity, a share, an
   office, a title, a trust, an entitlement or an authority. **The instrument creates; the register records**
   (`DEFINED_TERMS.md` §2, legal-effect ladder).
2. **No entry without a source document.** Every populated row must cite the executed instrument, the
   official record or the decision it derives from. **An unsupported entry is marked `UNSUPPORTED` and must
   not be relied on.**
3. **Demonstration data never enters a register.** The repository's seeded entities, registration numbers,
   TINs, ownership percentages and provenance strings are synthetic (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md`
   §6). The sector fixtures are fictional (§7). **Neither may be imported, and neither may appear in any
   register.**
4. **Every register states its owner.** The body that owns the register is named in it. A Trust register is
   the **Trustees'**; a company register is the **company's**; the Family Office holds registers only as
   **administrator** (`D31` §6.2).
5. **Access is controlled and personal data is protected.** Registers containing personal, beneficiary,
   health, conflict or dispute information are `HIGHLY_RESTRICTED` and are **never** placed in a public or
   open repository (`D19` §4.3, `D70`).

## The register set

| ID | Register | Owner | File |
|---|---|---|---|
| `BEYU-LF-D63` | Master Legal Entity Register | Chief Governance Officer | `BEYU-LF-D63_MASTER_LEGAL_ENTITY_REGISTER.md` |
| `BEYU-LF-D64` | Ownership and Share Capital Register | Company Secretary | `BEYU-LF-D64_OWNERSHIP_AND_SHARE_CAPITAL_REGISTER.md` |
| `BEYU-LF-D65` | Beneficial Ownership and Disclosure Register | Company Secretary + counsel | `BEYU-LF-D65_BENEFICIAL_OWNERSHIP_REGISTER.md` |
| `BEYU-LF-D66` | Trustee, Director, Officer and Authorised-Signatory Register | Company Secretary | `BEYU-LF-D66_OFFICEHOLDER_AND_SIGNATORY_REGISTER.md` |
| `BEYU-LF-D67` | Asset and Liability Register | Finance authority of record | `BEYU-LF-D67_ASSET_AND_LIABILITY_REGISTER.md` |
| `BEYU-LF-D68` | Contract, Obligation, Renewal and Filing Calendar | Company Secretary | `BEYU-LF-D68_OBLIGATION_AND_FILING_CALENDAR.md` |
| `BEYU-LF-D69` | Tax and Accounting Obligations Checklist | Finance authority + tax adviser | `BEYU-LF-D69_TAX_AND_ACCOUNTING_CHECKLIST.md` |
| `BEYU-LF-D70` | Data Protection and Information Governance Checklist | Chief Governance Officer + DPO | `BEYU-LF-D70_DATA_PROTECTION_CHECKLIST.md` |
| `BEYU-LF-D71` | Litigation, Claims, Insurance and Regulatory Register | Company Secretary | `BEYU-LF-D71_LITIGATION_CLAIMS_INSURANCE_REGISTER.md` |
| `BEYU-LF-D72` | Related-Party Transaction Register | Company Secretary | `BEYU-LF-D72_RELATED_PARTY_TRANSACTION_REGISTER.md` |
| `BEYU-LF-D73` | Decision, Resolution, Consent and Delegation Register | Company Secretary | `BEYU-LF-D73_DECISION_AND_DELEGATION_REGISTER.md` |
| `BEYU-LF-D74` | Legal Document Execution and Custody Register | Company Secretary | `BEYU-LF-D74_LEGAL_DOCUMENT_EXECUTION_AND_CUSTODY_REGISTER.md` |
| `BEYU-LF-D75` | Annual Governance Review Checklist | Chief Governance Officer | `BEYU-LF-D75_ANNUAL_GOVERNANCE_REVIEW_CHECKLIST.md` |

## Status of every register

**Every register in this section is a BLANK TEMPLATE. No register has been populated. No row in any
register describes a real entity, share, office, asset, liability, obligation, insurance policy, claim,
transaction, decision or document.** Each register states its own status and records what it is waiting for.

## The register-interdependence rule

Where two registers refer to the same item (for example, an asset in `D67` held by an entity in `D63`, under
a document in `D74`, subject to a decision in `D73`), **the entries must cross-reference each other by ID,
and an inconsistency is a defect** to be logged and corrected — not explained away.
