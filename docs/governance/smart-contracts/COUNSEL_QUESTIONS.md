# BEYU-SCG-10 — Counsel Questions (Smart Contract and Automation Domain)

Document ID: `BEYU-SCG-10`
Title: Counsel Questions — Smart Contract and Automation Domain
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`INFORMATIONAL`** — a question list. **None of these questions is answered.**
Owner (proposed): Chief Governance Officer / General Counsel function `[TO BE APPOINTED]`
Approval required: none (a question list requires no approval); **answers require a qualified
Tanzanian advocate's written opinion**
Classification: `CONFIDENTIAL` — questions reveal intended structure
Related documents: `BEYU-SCG-01`…`BEYU-SCG-09`, `BEYU-SCG-13`; legal pack: `LEGAL_QUESTIONS_FOR_TANZANIAN_COUNSEL.md`, `LEGAL_SOURCES_REGISTER.md`, `DECISION_AND_ASSUMPTIONS_REGISTER.md`
Depends on: instruction of counsel

> **CONTROL BLOCK.**
> **This is** the list of legal questions the smart-contract and automation domain raises, prepared so
> that counsel can answer them in one pass rather than serially.
> **This is not** legal advice, and **no answer may be inferred from anything in this repository.**
> **No statutory provision, section, regulation, fee, deadline or official requirement is asserted in
> this document.** Where a question touches a regime, the regime is named only as the subject to be
> researched — never as a conclusion. The legal pack's verified-source discipline (and its records of
> what could not be verified) governs any answer that relies on it.

---

## 1. How to use this list

- Answer in writing, with the provisions actually relied upon, so the answer can be filed and the
  register updated (`BEYU-SCG-08` `R-DEC-01`).
- Where the answer is "it depends", state on what, and what BEYU should do until it is resolved. The
  fail-closed default in this pack is: **do not act, do not publish, do not sign.**
- Questions marked `[BLOCKING]` currently stop a stated BEYU intention. Questions marked
  `[AWARENESS]` shape design but stop nothing today.

## 2. Electronic signatures, writing and evidence

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-01 | Does Tanzanian law recognise electronic signatures for the instrument classes BEYU would use (commercial contracts, employment, IP assignment, board resolutions, trust-side documents), and are there classes where an electronic signature is insufficient or requires a particular formality? | The platform models seven signature methods and treats method as metadata; whether any is legally sufficient is unknown | `[BLOCKING]` |
| Q-SCG-02 | What is the evidentiary status of a cryptographic digest (a hash of a document) as proof that a document existed in a particular form at a particular time — and what additional evidence is required for a court or an authority to accept it? | Anchors are sold as "evidence"; the pack must not claim more than the law gives | `[BLOCKING]` |
| Q-SCG-03 | What is the status of a distributed-ledger transaction record or an indexed event log as evidence of a payment, a delivery, a commitment or an authorisation? | Execution gates and reconciliation findings rest on this | `[BLOCKING]` |
| Q-SCG-04 | If a document containing personal data is hashed and the hash is published, does the immutability of the commitment create any obligation or difficulty under Tanzanian data-protection law (including any right of erasure or correction)? | The platform deliberately publishes hashes only; the legal consequence must be stated | `[BLOCKING]` |
| Q-SCG-05 | Are there record-keeping, retention or form requirements that a signed electronic instrument must satisfy to remain admissible after a period of years? | Retention is governed internally; the legal minimum is unknown to us | `[AWARENESS]` |
| Q-SCG-06 | Where BEYU relies on a third-party data source (a rate, a price, a delivery confirmation, a government verification), what liability or disclaimer should govern that reliance, and what must the counterparty be told? | Oracles drive automated gates | `[AWARENESS]` |

## 3. Data protection and cross-border

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-07 | Does processing identity-verification data through an external source or an on-chain commitment engage any registration, notification or transfer-permission requirement under the regime recorded in the legal pack's sources register? | `IDENTITY_VERIFICATION` is a governed feed with personal data | `[BLOCKING]` for that feed |
| Q-SCG-08 | Where a hash commitment, an event log or an anchor record is stored or published outside Tanzania, does that constitute a transfer of personal data requiring a permit or a condition? | Cross-border data handling is unresolved in the legal pack as well | `[AWARENESS]` |

## 4. Regulated activity, tokens and financial characterisation

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-09 | If BEYU ever records a token, a unit or an on-chain position representing an economic interest, would that be characterised as a security, a payment instrument, a deposit-taking arrangement, an investment contract or none of these under Tanzanian law — and what would the characterisation require before issuance? | The platform has token-position tables and no issuance capability; the question must be settled before any is built | `[BLOCKING]` for issuance |
| Q-SCG-10 | Do the payments, settlement and reconciliation behaviours that already exist (receiving provider webhooks, raising trust on a settlement batch) engage any licensing, reporting or AML/CFT obligation on BEYU's side, as distinct from the provider's? | BEYU is not the payment provider, but the software is not the whole answer | `[AWARENESS]` |
| Q-SCG-11 | How are automated acts characterised: where software records a transaction, raises a confidence level or opens an exception without a human, does that act engage BEYU's legal responsibility, and on what basis? | Automation governance rests on this | `[BLOCKING]` for any new autonomy |
| Q-SCG-12 | What notification duties arise on a smart-contract incident (unauthorised transfer, key compromise, oracle manipulation) — to regulators, counterparties, data subjects or insurers — and within what period? | The incident runbook deliberately asserts no deadline | `[BLOCKING]` for the runbook's notification section |

## 5. Tax

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-13 | If any on-chain position, token or settlement flow exists in future, how is it characterised for Tanzanian income tax, capital gains and withholding, and what records must BEYU keep? | Tax treatment cannot be designed from the software side | `[AWARENESS]` |
| Q-SCG-14 | Do the costs of blockchain infrastructure, audits, oracle subscriptions and custody attract any particular treatment? | Affects the financial reporting pack's inputs | `[AWARENESS]` |

## 6. Contracting, disputes and forum

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-15 | Where an agreement is partly expressed in code and partly in prose, how should the instruments allocate meaning, priority and risk of discrepancy — and does Tanzanian law permit a clause resolving textual/code conflicts in a stated order? | The legal pack drafts the prose instruments; this is the join | `[BLOCKING]` for any code-executed agreement |
| Q-SCG-16 | Is an arbitration or jurisdiction clause effective for disputes arising from an automated or on-chain act, and what would a court require before it applies? | `BEYU-LF-D17` sets dispute policy; the domain needs the forum answer | `[AWARENESS]` |
| Q-SCG-17 | What is the correct forum and process for challenging or unwinding an automated act that was executed in error? | Rollback expectations must be realistic | `[AWARENESS]` |

## 7. IP in code, open source and confidentiality

| ID | Question | Why it matters | Status |
|---|---|---|---|
| Q-SCG-18 | What is required for BEYU to hold enforceable copyright in the smart-contract code, deployment scripts and documentation, given contributor and contractor involvement — and what must the assignment documents contain? | `BEYU-LF-D39`/`D41` address this; the code side needs a specific answer | `[AWARENESS]` |
| Q-SCG-19 | Does publication of code or an ABI to a public repository or a block explorer affect confidentiality, trade secrets or the patentability of anything BEYU deploys? | Publication is irreversible | `[BLOCKING]` before any public deployment |
| Q-SCG-20 | What are the licence-compatibility requirements for the open-source dependencies and any public deployment, and what must the open-source review record contain? | `BEYU-LF-D45` governs; the smart-contract side adds deployment-specific questions | `[AWARENESS]` |

## 8. What happens with the answers

1. Answers are filed with references and recorded in `BEYU-SCG-08` `R-DEC-01` (`ANSWERED`), and the
   relevant paragraph in this pack is amended to cite the opinion — **never to paraphrase it into a
   conclusion the opinion does not support.**
2. A `[BLOCKING]` question answered in the negative does not merely amend a sentence: it changes what
   BEYU may intend to do, and the pack must say so explicitly.
3. Until answered, the pack's fail-closed defaults stand: **no deployment, no signing, no token
   issuance, no reliance on a feed, no public statement.**

## 9. What this document does not establish

It establishes no legal position, asserts no provision and answers none of its own questions. It is
an instruction list for a qualified professional.
