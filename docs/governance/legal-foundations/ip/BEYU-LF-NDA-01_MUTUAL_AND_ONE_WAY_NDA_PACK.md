# BEYU-LF-NDA-01 — Confidentiality Agreement Pack (Mutual and One-Way, Six Counterparty Variants)

Document ID: `BEYU-LF-NDA-01`
Title: Non-Disclosure and Confidentiality Agreement Pack — mutual and one-way, with counterparty variants
Version: 1.0 (draft) · Date 2026-10-15
Status: **`TEMPLATE_NOT_EXECUTED`** — **no NDA has been signed by anyone, and no counterparty exists.**
Owner (proposed): Company Secretary function · Approving authority (proposed): the board (delegated to a named
officer within limits — `D27`)
Next review date: On counsel's markup; then annually
Classification: `CONFIDENTIAL`
Related: `D12` §5, `D14`, `D43`, `D44`, `D45`, `D47`, `D71`, `D74`, `PRIV-01`, `EMP-01`, `RC-01`, `FA-01`,
`FIN-03`
Depends on: counsel on the chosen law, on the treatment of a trust/family office as a party, and on the
interaction with `PRIV-01` where personal data is disclosed

> **⚠ THE TWO MISTAKES THAT MAKE AN NDA USELESS.**
> **1. It protects the wrong thing.** An NDA protects **information**; it does not protect **IP ownership**
> (`D41`), does not stop a person from working for a competitor (that is `RC-01`, and its enforceability is
> not assumed), and does not stop a counterparty from using what they already knew.
> **2. It cannot be used.** It is signed by the wrong entity (a company that may not exist, or a person with
> no authority), or it is never actually signed before the disclosure happens, or the family standardly signs
> a **mutual** NDA when it is the one disclosing.
> **Neither mistake is visible until the dispute. Both are prevented by routine discipline: identify the
> disclosing party, the receiving party, the information, the purpose, the period — then sign before you talk.**

---

## 1. When a written NDA is required (the pack's rule — no exceptions by convenience)

| # | Situation | Requirement |
|---|---|---|
| 1.1 | **Before any disclosure** of non-public business, financial, technical, product, customer, personnel or family information to a person outside the group | **Written NDA required before disclosure** |
| 1.2 | **Before granting data-room or system access** (including a read-only account, a demo environment, or a shared drive) | **Written NDA + access control** (`D70`) |
| 1.3 | **Before a vendor, contractor or adviser sees live personal data** | **NDA + a data-processing position under `PRIV-01`** |
| 1.4 | **With a potential investor** before any material disclosure | **NDA + a confidentiality clause in the term sheet (`FIN-03` §14)** |
| 1.5 | **With a potential acquirer** | **NDA**, plus a standstill if required |
| 1.6 | **With a regulator or an authority** | **NO NDA is required or appropriate** — and a request for confidentiality must not be used to impede a lawful enquiry |
| 1.7 | **With a person making a protected disclosure, or in a whistleblowing channel** | **NEVER an NDA.** An NDA may not be used to silence a report (`D71` §7) |
| 1.8 | **With an employee, director or officer** | The employment/office documents contain confidentiality (`EMP-01`), not a separate NDA, unless counsel advises otherwise |
| 1.9 | **With a founder** | The cohort variant (§2.7) plus `FA-01` §5.1 |

**1.10 The signature rule.** **The NDA is signed before the information is disclosed, by a person with actual
authority** (the authority register, `D73`). **A draft NDA in a folder protects nothing.**

## 2. The variants

| Variant | Use | Direction | Key differences |
|---|---|---|---|
| 2.1 **Mutual (short form)** | Early commercial discussion | Two-way | Symmetrical; a short definition; a 2–3 year term; no non-solicit |
| 2.2 **One-way (disclosing)** | The group is disclosing: investor pitch, pilot, vendor evaluation | One-way | Stronger; includes a **residual-information** clause only if counsel advises |
| 2.3 **One-way (receiving)** | The group is receiving (e.g. evaluating a purchased dataset or software) | One-way | Must be checked against `PRIV-01` before accepting personal data |
| 2.4 **Vendor / service provider** | Procurement | Mutual or one-way | Includes **data-processing** terms where personal data is involved (`PRIV-01` §6) |
| 2.5 **Counterparty / strategic partner** | A joint pilot or integration | Mutual | Includes each party's **IP position** (no implied licence — §3.4) |
| 2.6 **Adviser / professional** | Counsel, accountant, valuer, broker | One-way (adviser receiving) | Advisers often use **their own** form — the family must check that it does not contain an implied licence, an unlimited liability cap or a conflicting dispute clause |
| 2.7 **Founder / officer cohort** | Pre-incorporation and ongoing | Mutual | Survives departure; coordinated with `FA-01` §5.1, `EMP-01` and `D41` |

## 3. Clause set (the common body — every variant uses it, with the marked variations)

| # | Clause | Notes |
|---|---|---|
| 3.1 | **Parties** — full legal names, and the **capacity** in which each signs | `[COUNSEL TO CONFIRM whether a Trust (or its Trustees) or a family office may sign, and in what capacity — a trustee signs as trustee of the trust, not personally]` |
| 3.2 | **Definitions**: Confidential Information; Purpose; Representatives; Affiliate; Personal Data | **Purpose must be narrow** ("evaluating a potential pilot for X"), not "any business purpose" |
| 3.3 | **Exclusions** (information that is public, already known without a duty, independently developed, or lawfully received from a third party) | The receiving party always asks for these; they are reasonable |
| 3.4 | **No implied licence or assignment** of IP — disclosure gives no right beyond the Purpose | **Critical**; without it an NDA can be argued to imply a licence |
| 3.5 | **Permitted use** limited to the Purpose; **no reverse engineering, no competitive use, no scraping, no training a model on the information** | The model-training carve-out is now essential; add it expressly |
| 3.6 | **Obligations of care**: at least the care used for its own confidential information; access limited to Representatives who need to know and are bound |
| 3.7 | **Compelled disclosure** — permitted where required by law, with notice to the disclosing party **where lawful**, and the minimum disclosure | **Never a clause that obstructs a regulator or a court** |
| 3.8 | **Term and survival** — typically `[2–5]` years, with **trade-secret protection continuing while the information remains a trade secret** | |
| 3.9 | **Return and destruction** on request — **with exceptions for the copies a party must keep for legal, regulatory, tax or archiving purposes, and for litigation holds** | Must be drafted to be performable; a clause that requires deleting regulated records cannot be obeyed |
| 3.10 | **No warranty of accuracy; no obligation to proceed; no partnership or agency created** | Prevents an implied joint venture |
| 3.11 | **Remedies** — an acknowledgement that damages may be inadequate, and the availability of injunctive relief **if the law permits** | `[COUNSEL TO CONFIRM whether a mandatory-injunction clause is enforceable]` |
| 3.12 | **Data protection** — where personal data is disclosed, the **roles** (each party's position), the **lawful basis**, the **security** expectation and the **breach notification** channel | `PRIV-01` §6; `[COUNSEL TO CONFIRM the controller/processor analysis]` |
| 3.13 | **Personal-data-specific limits**: no further disclosure, no transfer outside `[TERRITORY]` without consent and lawful basis, no use for marketing | |
| 3.14 | **Non-solicitation (optional)** — only where needed, and **always narrower than a general non-hire** | `RC-01` §2; `[COUNSEL TO CONFIRM ENFORCEABILITY]` |
| 3.15 | **No obligation to disclose; no exclusivity** unless expressly agreed (and then in a separate, clearly marked clause) | |
| 3.16 | **Announcements / use of name or logo** — prohibited without written consent | |
| 3.17 | **Governing law, jurisdiction, notices, assignment (no assignment without consent), counterparts, entire agreement, waiver** | `Q-R-02` |
| 3.18 | **Whistleblowing / regulator carve-out. [MANDATORY — non-negotiable in every variant.]** **Nothing in this agreement prevents or restricts any person from making a report, disclosure or notification to a regulator, a court, a law-enforcement or tax authority, from cooperating with an investigation, or from making a protected disclosure under applicable law.** | This clause may **never** be deleted, softened or made subject to prior notice |
| 3.19 | **Interplay with a party's own obligations** (e.g. an adviser's duties to its regulator) | |

## 4. Execution and administration

| # | Step | Evidence |
|---|---|---|
| 4.1 | Identify the **actual disclosing entity** (from `D63`; if no entity exists, the individual founders, personally — `INC-01` §7) | The register entry |
| 4.2 | Confirm the **signatory's authority** | `D73` |
| 4.3 | Use the **executed** version; check for handwritten amendments; initial every page where required | The executed original |
| 4.4 | Record the **effective date** and the **expiry date** in the obligations calendar | `D68` |
| 4.5 | File the original in the custody register; note where the counterparty's original is | `D74` |
| 4.6 | Record **what was disclosed, to whom and when** (a disclosure log — the evidence an NDA is actually needed for) | The disclosure log |
| 4.7 | On expiry or termination: confirm return/destruction and record it | The confirmation |
| 4.8 | On breach: preserve evidence, escalate, and record in `D71` §3 | The incident record |

## 5. Decisions required from the user / family / governing bodies

1. Who is the **disclosing party** in a typical case — the Trust, the holding company, the operating company,
   the family office, or a family member personally? (`D20`, `D55`)
2. The **standard term** and the **standard carve-outs** (the family should agree its default position once,
   not per document).
3. Whether an **executed NDA is required before any disclosure** (recommended) or whether an internal summary
   is sufficient for a first meeting.
4. Whether the group will accept a **counterparty's own NDA** — and, if so, who reviews it.
5. Whether the **model-training carve-out** is required in every variant (**recommended**).
6. Whether any **non-solicit** is included, and in which variants.

## 6. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether the chosen **governing law** supports the intended remedies.
2. Whether a **Trust or its Trustees** may be a party, and how it should sign.
3. The **enforceability of confidentiality** against a **former** employee, contractor or adviser.
4. Whether a **residuals** or **memory** clause is advisable or dangerous.
5. Whether the **injunctive relief** clause is enforceable as drafted.
6. The **controller/processor** position where personal data is disclosed, and the required **processing terms**
   under the data-protection regime (`PRIV-01`; `Q-DP-01`…`Q-DP-06`).
7. Whether **trade-secret** protection requires additional steps (access controls, markings, segregation).
8. Whether the **non-solicit** is enforceable — **and, if not, what the narrower alternative is** (`RC-01` §2).
9. Whether the **whistleblowing carve-out** (3.18) satisfies the applicable protected-disclosure regime.

**No NDA has been signed. No counterparty exists. No information has been disclosed under any instrument in
this pack.**