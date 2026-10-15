# BEYU-LF-D35 — Family Office Authority, Custody, Payment, Expense and Reconciliation Controls

Document ID: `BEYU-LF-D35` · Version 1.0 (draft) · Date 2026-10-15
Status: **`COMPLETE_DRAFT`** — **no mandate exists, no account has been opened, no payment made, no reconciliation performed. Nothing in this document is in force.**
Owner (proposed): Family Office Principal with the Finance authority of record. Approving authority: the board, and the Trustees for Trust-serviced work.
Classification: `CONFIDENTIAL`. Related: `D08`, `D24`, `D27` (F-05, F-11, F-13, L-12), `D31`, `D32`, `D33`, `D37`, `D67`, `D72`, `D73`, `D74`. Depends on: `DAA-FO-002`, `DAA-FO-003`; `Q-FO-01`, `Q-FO-02`, `Q-LEG-03`; **`FIR-018`** (no shadow ledger).

> **⚠ FOUR ABSOLUTE RULES.**
> **1. Authority comes from a written mandate, nothing else.** The Family Office acts only where the mandating body has delegated a specific function, to a specific limit, in writing (`D31` §3, `D34` §3).
> **2. A payment without a recorded decision is unauthorised.** No exception, no "it was urgent", no "the family approved it verbally".
> **3. Two signatures, always** — for every payment, transfer, mandate change and new account (`D27` F-11/F-13).
> **4. No parallel ledger, spreadsheet or "our own record"** of balances, obligations or payments (`FIR-018`). The accounting authority is the record; the Family Office holds **reconciliation evidence**, not books.

---

## 1. Scope

Covers, for every body the Family Office serves: **what it may authorise; how custody works; how payments are made; how expenses are approved; and how everything is reconciled and evidenced.** It does **not** grant authority — it constrains it.

## 2. The authority matrix (mandate-driven)

| # | Action | Permitted? | Condition |
|---|---|---|---|
| A-01 | Prepare a payment instruction | ✔ | Cites the recorded decision reference |
| A-02 | Instruct a bank payment | ✔ | Within the mandate limit; two signatures; decision cited |
| A-03 | Approve a payment above limits | ✘ | Escalate to the owning body |
| A-04 | Approve **any** payment to itself, an employee or a connected person | ✘ | `D72` + disinterested approval |
| A-05 | Open/close accounts or change mandates | ✘ alone | Board (and Trustees where Trust-serviced) |
| A-06 | Hold assets, securities or title documents **in its own name** | ✘ | Prohibited |
| A-07 | Hold custody **records** and evidence | ✔ | As administrator (`D31` §6.2) |
| A-08 | Reconcile accounts and report exceptions | ✔ | Mandatory duty, not an option |
| A-09 | Write off, net off or defer an obligation | ✘ | Board |
| A-10 | Act on a family member's instruction about a body's assets | ✘ | Route to the correct body; record the request |
| A-11 | Approve expenses of a family member | ✘ | Personal expenses are not a body expense (E-04) |
| A-12 | Use an AI tool to execute, approve or reconcile without human review | ✘ | `D02` cl. 7.4 |

**2.1 The three-line rule.** **Preparer ≠ Approver ≠ Reconciler.** Where staffing makes this impossible, the
body must **record the compensating control** (e.g. an external bookkeeper, a director review) — **and the
control must be real, not documented and ignored.**

## 3. Custody

| # | Control |
|---|---|
| 3.1 | Assets are held in the **owner's** name, at an institution in the owner's name; the Family Office is a correspondent and record-keeper only |
| 3.2 | A **custody schedule** per body: institution, account, signatories, assets, statements' location |
| 3.3 | **Documents of title** (certificates, deeds, policies) are held per `D74`'s custody rules, not in a personal drawer or an email inbox |
| 3.4 | **Online access** is role-based, least-privilege, MFA-enabled, and reviewed at least annually and on every departure |
| 3.5 | **Credentials** are stored in an approved credential store, never in a document, a chat, an email or a spreadsheet |
| 3.6 | Any **change of institution or custodian** is a board decision, evidenced and diarised (`D68`) |

## 4. Payments and expenses

**4.1 The payment chain (every payment, without exception).**

`Recorded decision → instruction prepared → ownership and amount verified → two signatures → execution → recorded in the accounting authority → reconciled → evidence filed.`

**4.2 Standing controls.**

| # | Control |
|---|---|
| 4.2.1 | The **decision reference** appears on the instruction and in the accounting record |
| 4.2.2 | **Beneficiary verification** against an approved supplier list; **any change to bank details is verified by a callback to a known contact** — the single most effective anti-fraud control |
| 4.2.3 | **Two signatures** from the authorised list; a signatory may not sign their own reimbursement or a payment to a connected person |
| 4.2.4 | **No cash** beyond `[USER TO SUPPLY]`; no payment to a personal account of an employee, director or family member |
| 4.2.5 | **Intercompany payments** require both bodies' approvals and the `D53`/`D30` §5.4 basis |
| 4.2.6 | **Trust payments** are made only against a Trustee decision; the Family Office has no discretion over Trust money |
| 4.2.7 | **Emergency payments** are made only under `D62` E-01/E-02, then reported within `[N]` hours |
| 4.2.8 | **A payment instruction from a family member** is not authority: it is routed, logged and answered in writing |
| 4.2.9 | **Expenses**: receipts required; personal expenses excluded; a family member's business travel must be for a documented body purpose; **approval by someone who is not the claimant and not connected to them** |
| 4.2.10 | **Every payment above `[LARGE PAYMENT]`** is reported to the board or Trustees in the next monthly pack |

**4.3 Suspected fraud or diversion.** Stop; preserve evidence (do not delete emails or messages); report to the
board, the Audit and Risk Committee and the auditors; involve counsel; **notify the bank and, where
appropriate, the police**; and **do not settle or conceal internally** (`D71`).

## 5. Reconciliation

| # | Requirement |
|---|---|
| 5.1 | **Every bank, custody and loan account** is reconciled **monthly**, by a person who is not the sole preparer of the payments |
| 5.2 | **Every reconciliation is evidenced**: the statement, the working, the exceptions, the preparer, the reviewer, the date |
| 5.3 | **Exceptions are listed with an owner and a due date**; an ageing exception above `[N]` days escalates to the board |
| 5.4 | **Intercompany balances** are reconciled **between the two bodies**, not in one body's favour; a mismatch is a defect, not a rounding |
| 5.5 | **Trust distributions** are reconciled to the Trustee decisions and the beneficiaries' records |
| 5.6 | The **reporting** produced by the Family Office (`D33`, `D38`) must carry the reconciliation status; **an unreconciled figure is labelled `UNRECONCILED`** |
| 5.7 | **Quarterly**, the Family Office certifies to the Audit and Risk Committee: accounts reconciled; signatures verified current; no unresolved exceptions above the threshold; and any control that failed |

## 6. Records, control plane and AI

| # | Provision |
|---|---|
| 6.1 | The Family Office keeps **evidence and workpapers**, not books. Its files are the **body's** records, held as administrator (`D31` §6.2) |
| 6.2 | **Shadow-ledger prohibition (`FIR-018`)**: no ledger, spreadsheet or tracker of balances, obligations or payments may be maintained outside the accounting authority. Where one exists, it is **preserved, reported and unwound** — not deleted |
| 6.3 | **Control plane**: it may support the workflow, record the decision reference and hold the reconciliation status. It creates **no** authority and holds **no** competing ledger. In the software's own statuses: `legal_effect_status` remains `INERT` for trust provisions, `enforceability_assumed` remains false, and `CAP_POSTING` remains LOCKED** — this document changes none of that |
| 6.4 | **AI**: may prepare, transcribe, reconcile and flag. **May not** authorise, sign, be a named approver, or be the sole reviewer. **No AI on privileged material** (`D36` §4 S-04) |
| 6.5 | **Access to banking** is never granted to an AI agent, a chatbot, or a third-party automation without a recorded decision and a human confirmation step |

## 7. Decisions required from the user / family / governing bodies

1. The **mandate limits** (what the Family Office may instruct without further approval) — `[USER TO SUPPLY]`.
2. The **authorised signatories** and the two-signature pairs, per account.
3. The **payment approval levels** and the large-payment reporting threshold.
4. The **reconciler** (and, where staff are few, the compensating control).
5. The **expense policy** for the Family Office, including the treatment of family travel.
6. Whether the family will accept that a **verbal instruction has no effect** — the single hardest cultural rule in this document.

## 8. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether the proposed **mandate** creates an agency or fiduciary relationship, and its consequences.
2. The **payment authority** requirements for each bank and the validity of a two-signature mandate (`Q-LEG-03`).
3. Whether **exchange-control** or tax approval is required for any payment or transfer contemplated.
4. The **treatment of family loans, support payments and personal expenses** — and their tax consequences (`Q-FO-02`).
5. Whether **Trust distributions** may be made to a third party on a beneficiary's instruction, and the formalities.
6. The **documentary requirements** for a payment to a related party.
7. Whether the **reconciliation and reporting** duties conflict with any statutory accounting duty.
8. What the law requires on **suspected fraud** (reporting, freezing, evidence preservation).

**No mandate exists. No payment authority exists. Nothing in this document is in force.**
