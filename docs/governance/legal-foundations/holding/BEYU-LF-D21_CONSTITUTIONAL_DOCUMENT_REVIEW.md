# BEYU-LF-D21 — Holding Company Constitutional-Document Review and Proposed Amendment Schedule

Document ID: `BEYU-LF-D21`
Title: Holding Company Constitutional-Document Review and Proposed Amendment Schedule
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`BLOCKED`** — **cannot be completed. The documents to be reviewed do not exist and were not
supplied. Nothing in this file may be treated as a completed review.**
Document owner: Company Secretary function (proposed)
Approving authority (proposed): the board and the shareholders of the holding company (neither exists)
Next review date: **On blocker resolution** (see §4)
Classification: `INTERNAL`
Related documents: `D20`, `D22`, `D23`, `D24`, `D25`, `D27`, `D63`, `D64`, `D74`
Depends on: the **actual** memorandum and articles of association (or equivalent) of the holding company

---

## 1. Why this document is blocked

**1.1** This document's purpose is to review **existing** constitutional documents — the memorandum and
articles of association (or the equivalent constitutive documents) of the holding company — and to propose
an amendment schedule to bring them into line with the intended governance (`D22`, `D23`, `D25`, `D27`,
`D29`).

**1.2** **There are no such documents.** No holding company has been incorporated (`DAA-HOLD-001`), no
constitutional document exists in this repository, and none was supplied.

**1.3** The repository contains **no** constitutional documents for any entity. What it contains is: a
seeded entity called `BEYU Holding Company` (jurisdiction DIFC, registration number `DIFC-4471`) in
`src/db/seed.ts`, and a document-classification fixture that names "Memorandum & Articles of Association"
as a document type in the health sector's demonstration data. **Neither is a constitutional document.**
The seed's registration number is synthetic demonstration data and must never be cited as a registration.

**1.4 The rule this document applies.** **A review of a document that does not exist cannot be written, and
must not be faked.** Writing a "review" against an imagined set of articles would produce the most
dangerous kind of artifact in this pack: a document that *reads* like a legal review and is in fact an
invention. It would also anchor the family to a structure nobody chose.

**1.5 Therefore:** this document is **`BLOCKED`**, and the pack must not include a review, an amendment
schedule, an article-by-article commentary, or a "typical provisions" analysis that could be mistaken for
one.

---

## 2. What the family might reasonably expect this document to contain (and will not get, yet)

Listed here so that the gap is visible and cannot be quietly forgotten:

| Expected content | Why it cannot be provided now |
|---|---|
| Article-by-article commentary on the current documents | No documents |
| A table of provisions that conflict with `D22`/`D23`/`D27` | No documents to compare against |
| A list of provisions that conflict with the intended dual-class arrangement | No documents; and the arrangement itself is only a proposal (`DC-01`) |
| A list of "mandatory" clauses the Act requires | Depends on the **current** consolidated revision and the company's type — a counsel question (`Q-H-01(a)`) |
| An amendment procedure and timeline | Depends on the documents, on the Act, and on whether the company exists |
| A special-resolution drafting set | Depends on the above |

---

## 3. What this document *does* provide (and it is not nothing)

**3.1 A precise blocker statement** — so the pack's own completeness can be audited honestly
(`MASTER_DOCUMENT_REGISTER.md` §11).

**3.2 The review protocol that will be applied the moment the documents exist.** When the documents are
obtained (or when the company is incorporated and the documents are drafted), the review will follow this
protocol **in this order**:

| Step | Action | Output |
|---|---|---|
| **R1** | Obtain the **executed and filed** documents, with the registry acknowledgement | A verified copy file, indexed in `D74` |
| **R2** | Confirm the **legal form** and the **current consolidated revision** of the governing Act that applies to that form | A written confirmation from counsel (`Q-H-01(a)`) |
| **R3** | Confirm the **share capital**: authorised/issued, classes, rights, restrictions, and the beneficial ownership position | A schedule compared against `D22` and `D64` |
| **R4** | Compare each of the following against the intended governance, and record **every** difference: (a) share classes and rights; (b) transfer restrictions and pre-emption; (c) board composition, appointment and removal; (d) reserved matters and consent rights; (e) conflict and disclosure rules; (f) amendment and variation procedure; (g) dividend and distribution rules; (h) deadlock and dispute forum; (i) indemnity and insurance; (j) winding-up and surplus; (k) any provisions that cannot be amended or that entrench a right | A difference schedule with a **lawfulness** assessment and a **risk** rating for each |
| **R5** | Identify provisions that are **inconsistent with a mandatory rule**, or with a right of a class or a member, and flag them for counsel | A flagged list |
| **R6** | Identify any provision that a **proposed** new right (e.g. the dual-class arrangement) would need to displace | A dependency list |
| **R7** | Draft the **amendment schedule**: each amendment, the reason, the required resolution, the required consents, the filing, and the effective date | A proposed amendment schedule, for counsel |
| **R8** | Confirm the **procedure**: the resolution type, the class consents, any court or registry step, and the timing | A procedure note |
| **R9** | Execute and file; record in `D74`, `D63`, `D64`, `D68` | Evidence file |

**3.3 The checklist of matters to look for, in the current documents (to be filled in only from the real
documents).** No findings are recorded here; the table is deliberately empty.

| # | Matter | Found? | Location in the document | Conflicts with | Counsel flag |
|---|---|---|---|---|---|
| 1 | Authorised share capital / class structure | — | — | `D22` | — |
| 2 | Voting rights per class | — | — | `D22`, `DC-01` | — |
| 3 | Transfer restriction (private company) | — | — | `D24`, `D29` | — |
| 4 | Pre-emption on issue and on transfer | — | — | `D24` | — |
| 5 | Board size, appointment, removal, quorum | — | — | `D25` | — |
| 6 | Reserved matters / consent rights | — | — | `D27` | — |
| 7 | Class-variation procedure | — | — | `D22` | `Q-H-01(f)` |
| 8 | Amendment procedure and entrenchment | — | — | `D22`, `D23` | — |
| 9 | Dividend policy | — | — | `D33` | — |
| 10 | Conflicts and disclosures | — | — | `D25`, `D14` | — |
| 11 | Deadlock and dispute forum | — | — | `D29` | — |
| 12 | Indemnity, insurance, exculpation | — | — | `D25` | — |
| 13 | Winding-up and surplus | — | — | — | — |
| 14 | Any provision inconsistent with a mandatory rule | — | — | — | — |

---

## 4. Blocker resolution — exactly what is needed

**4.1 Path A — the company exists.** Provide: the **certificate of incorporation**; the **memorandum and
articles** as filed (and any amended/replaced version, with the filing acknowledgements); the **share
register**; any **shareholders' agreement** in force; any **board or shareholder resolutions** that vary the
constitution; and confirmation of the **current consolidated revision** of the governing Act that counsel
relies on. **Nothing may be reviewed in part** — a review against an incomplete set produces false comfort.

**4.2 Path B — the company does not yet exist.** Then this document is **superseded**: there is nothing to
review, and the work becomes a **drafting task** under `D20`/`D22`/`D23` (constitutional documents drafted
to the intended governance from the outset). In that case:
(a) `D21` is re-titled and re-scoped as a **"Constitutional-Document Drafting Brief"** — but only by an
explicit, recorded decision, because a document may not silently change its own purpose; and
(b) the amendment schedule becomes unnecessary.

**4.3 The verification required before either path is taken.** Counsel must confirm, in writing, which
revision of the governing Act applies, so that any review, or any new draft, is against the right text.

---

## 5. What must NOT happen while this document is blocked

1. **No invented review.** Do not write an article-by-article commentary for a document that has not been
   seen.
2. **No inference from seed data.** The seeded `BEYU Holding Company` row (jurisdiction, registration
   number, ownership percentages) is demonstration data. **It is not a source for this review.**
3. **No amendment schedule built on assumptions** about what the articles "probably" say.
4. **No reliance on this document** to confirm that any provision is or is not compliant.
5. **No statement anywhere in the repository** that the constitutional documents have been reviewed.

---

## 6. Decisions required from the user / family / governing bodies

| # | Decision | Needed by |
|---|---|---|
| 1 | Confirm whether the holding company **exists**. If yes: produce the documents (§4.1). If no: confirm Path B. | Immediately |
| 2 | If Path B: instruct counsel on the constitutional documents' drafting brief (with `D20`, `D22`, `D23`, `D25`, `D27`, `D29`). | Before GATE 2 |
| 3 | Confirm the **current consolidated revision** of the governing Act (counsel). | Before any drafting |
| 4 | Decide whether to retain or replace `D21` with a drafting brief (recorded decision). | On Path B confirmation |

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Which **revision** of the Companies Act (or other governing law) applies, and the correct **section
   numbering** to be cited in any review or draft. (The pack's own reading found numbering differences
   between revisions — e.g. the private-company test appearing as s.27 in one numbering and s.29 in the
   R.E. 2023 text. **This is exactly why no review may be written against an assumed revision.**)
2. The **mandatory** clauses that any Tanzanian private company's articles must contain, and which of the
   intended governance provisions (reserved matters, class consents, board appointment rights, dual-class
   rights, deadlock mechanics) may lawfully be placed in the articles.
3. Whether any intended provision may lawfully be placed **only** in a shareholders' agreement, and the
   consequence of that limitation for binding a future shareholder.
4. The **amendment and class-variation procedure**, including any dissentient right and court confirmation
   step (`Q-H-01(f)`).
5. Whether **entrenchment** of a provision is effective, and how.
6. Whether the founding documents of a **foreign** holding company (if that route is chosen) require a
   separate review by local counsel — the pack asserts nothing about any foreign jurisdiction.

**`BLOCKED`. This document contains no review, no findings and no amendment schedule, because the
documents to be reviewed do not exist. Resolve the blocker per §4 before relying on anything here.**
