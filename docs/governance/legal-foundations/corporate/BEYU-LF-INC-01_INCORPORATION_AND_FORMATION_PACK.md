# BEYU-LF-INC-01 — Incorporation and Formation Pack (Companies, Checklist and Resolutions)

Document ID: `BEYU-LF-INC-01`
Title: Incorporation Documents, Formation Checklist and Required Resolutions/Consents
Version: 1.0 (draft) · Date 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK` / `BLOCKED (in part)`** — **no company has been incorporated, no name has
been reserved, no form has been filed, no certificate exists. The jurisdiction and structure decisions
(`DAA-ARCH-005`, `DAA-ARCH-006`) are unresolved, and until they are resolved this pack cannot be completed.**
Owner (proposed): Company Secretary function with counsel · Approving authority (proposed): the founder, then
the first board
Next review date: On the structure decision
Classification: `CONFIDENTIAL`
Related: `D20`, **`D21` (remains `BLOCKED`)**, `D22`, `D23`, `D24`, `D25`, `D26`, `D27`, `D28`, `D30`, `D64`,
`D65`, `D66`, `D68`, `D69`, `D74`, `FA-01`, `CAP-01`
Depends on: counsel (`Q-H-02`, `Q-R-01`) on the registry, forms, fees, periods and the constitutional
requirements of the chosen jurisdiction

> **⚠ THE INCORPORATION CONTROL (the pack's hardest rule on this subject).**
> **No fabricated certificate, registration number, form, receipt, seal, signature or registry
> acknowledgement may be produced, drafted, illustrated or implied — by this document, by any other document
> in this pack, by the software, or by an AI output.** The repository contains **synthetic** entity rows,
> registration numbers and TINs (`src/db/seed.ts`) and **fictional** fixture documents
> (`sectors/health/.../documents.ts`). **They establish nothing** (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md`
> §6–§7). **What this document provides is the checklist, the sequence and the resolution set — the paperwork
> that must be *completed* with real information at a real registry, by a real person, on real advice.**

---

## 1. Prerequisites before any incorporation step

| # | Prerequisite | Status | Why it gates everything |
|---|---|---|---|
| 1.1 | **The jurisdiction of the holding/operating company** | **OPEN** (`DAA-ARCH-006`) | Determines the registry, the law, the tax position and the cost |
| 1.2 | **The structure decision** — whether a holding company is interposed at all, and where | **OPEN** (`D20` Options; `DAA-ARCH-005`) | Determines how many entities and in what order |
| 1.3 | **What "Sector LLC" means** | **OPEN** (`DAA-ARCH-005`) | Determines whether a separate form is intended |
| 1.4 | The **share capital plan** (who subscribes, how much, for what consideration) | **OPEN** (`D24` §9) | Determines the formation documents and the first filings |
| 1.5 | Whether the **Trust** is to hold the shares, and whether it must first exist | **OPEN** (`D01`, `D02`) | Determines the sequencing (see §2) |
| 1.6 | The **beneficial ownership** position, and who must be disclosed and when | **OPEN** (`D65`; `Q-H-05(b)`) | A filing deadline the family cannot miss |
| 1.7 | **Name availability** and any **name restriction** (e.g. a name implying a government connection) | Not checked | Rejection risk |
| 1.8 | **Licensing/permit** requirements to carry on the intended business | **OPEN** (`Q-LEG-04`) | Can determine the entity form and the timeline |
| 1.9 | The **tax registrations** and any registration threshold | **OPEN** (`Q-TAX-01`) | Post-incorporation steps |
| 1.10 | Whether the **Foundation** is being formed, and separately | **OPEN** (`D48`) | A different regime entirely |

**1.1 The rule.** **No incorporation step may begin before 1.1–1.4 are decided.** Proceeding before them is how
groups end up with an entity in the wrong place, a share structure that cannot hold the intended rights, and a
registration that has to be undone.

## 2. Sequencing (the dependency order)

```
1. Decide the jurisdiction + structure (1.1–1.3).
2. Instruct counsel; obtain the registry requirements, forms, fees and periods (Q-R-01).
3. If the Trust is to hold the shares: settle the trust instrument and constitute the Trust FIRST (D02),
   or record the alternative (the founder holds initially and settles later — a transfer, with tax
   and filing consequences).
4. Reserve the name.
5. Prepare the constitutional documents (Articles/M&A) with the class rights decided (D22) — and with the
   dual-class proposal NOT inserted until Q-H-01 is answered.
6. File the formation documents; pay the fees; obtain the certificate.
7. Constitute the first board (consents, first resolution) and appoint the secretary (D25, D28).
8. Adopt the authority allocation and the delegation schedule (D27, D73).
9. Issue the initial shares and deal with the consideration (D24 §1.3 S1–S5) — THEN record them (D64).
10. Make the statutory post-incorporation filings, and the beneficial-ownership filing (D65, D68).
11. Register for tax and any other mandatory registration (D69, D68).
12. Open the bank account with the two-signature mandate (D35 §3).
13. Record the entity in the register (D63) with its certificate reference.
```

## 3. Constitutional documents — clause checklist

| # | Clause | Purpose | Source |
|---|---|---|---|
| 3.1 | Name, registered office, objects/purpose (where a objects clause is required or useful) | Identity and capacity | `Q-R-01` |
| 3.2 | **Share capital**: classes, numbers, nominal value, and **the rights attaching to each class** — voting, dividends, return of capital, conversion, redemption | The rights the family actually wants | `D22`; **`Q-H-01` for any dual-class element** |
| 3.3 | **Variation of class rights** and any class-consent (veto) rights | Protection of a minority class | `D22` §9.3; the observed **s.73-style** class-variation process (`LEGAL_SOURCES_REGISTER.md` `CO-2`) |
| 3.4 | **Issue, transfer, transmission, pre-emption, buy-back** provisions | The mechanics `D24` assumes | `D24`, `D22` §6 |
| 3.5 | **Board**: composition, appointment, removal, quorum, casting vote, written resolutions, delegation | The governance `D25`/`D27` assume | `D25`, `D27` |
| 3.6 | **Reserved matters** embedded in the Articles (as opposed to the SHA) | Which protections bind the **company** and an unwilling future member | `D23` clause 2.3; `D27` §5.1 |
| 3.7 | **Conflicts** and interested-director rules (to the extent the law permits private ordering) | The conflict framework `D25` §6 assumes | `D25` §6 |
| 3.8 | **Meetings and written resolutions** of members | Practicality | `D28` |
| 3.9 | **Indemnities and insurance** for directors, and the exclusions | Protection that does not cover dishonesty | `D25` §8.5 |
| 3.10 | **Dividends and distributions**, and the solvency test | `D24` §6, `D33` §5 | `D24` |
| 3.11 | **Winding up** and the surplus distribution | `D29` §5 | `D29` |
| 3.12 | **Amendment** procedure and the entrenchment (if any) | `D22` §10 | `D09`, `D27` |
| 3.13 | **Dispute resolution** obligations (to the extent enforceable in constitutional documents) | `D29` §4 | `D29` |
| 3.14 | **Governing law and forum** | — | `Q-R-02` |
| 3.15 | **No provision** that contradicts the Trust instrument, the SHA or a mandatory rule | Consistency | `CROSS_DOCUMENT_CONSISTENCY_REPORT.md` |

## 4. Formation checklist (per entity — to be completed with real information)

| # | Step | Owner | Evidence produced | Status |
|---|---|---|---|---|
| 4.1 | Jurisdiction, form and name decided | Founder + counsel | Recorded decision | ☐ |
| 4.2 | Name reserved/searched at the registry | Counsel/agent | The reservation acknowledgement | ☐ |
| 4.3 | Constitutional documents settled by counsel | Counsel | The final documents | ☐ |
| 4.4 | Formation application prepared with the **required documents** | Counsel/agent | The application pack | ☐ |
| 4.5 | **Fees paid** (from a lawful source; through the `D35` payment chain) | CFO | The receipt | ☐ |
| 4.6 | **Certificate of incorporation/registration** obtained | Counsel/agent | **The certificate** (inspected, and its reference recorded) | ☐ |
| 4.7 | Constitutional documents **filed** where required, and the filed version obtained | Counsel | The filed copy | ☐ |
| 4.8 | **First board constituted** (consents obtained, meeting held, officers appointed) | Secretary | Consents + minutes (`D28`) | ☐ |
| 4.9 | **Registers opened** (members, directors, secretaries, charges as applicable) | Secretary | The statutory registers (`D64`, `D66`) | ☐ |
| 4.10 | **Shares issued** and consideration dealt with; members registered | Board | Register entries, certificates, evidence of payment (`D24`) | ☐ |
| 4.11 | **Beneficial-ownership analysis** completed and filings made | Secretary + counsel | The filing acknowledgement (`D65`, `D68`) | ☐ |
| 4.12 | **Tax registration** and any other mandatory registration | CFO | The registration certificates | ☐ |
| 4.13 | **Bank account** opened; two-signature mandate recorded | CFO | The mandate (`D35`) | ☐ |
| 4.14 | **Insurance** placed (D&O as decided) | Secretary | The policy (`D71`) | ☐ |
| 4.15 | **Licences/permits** applied for where required | CEO | The licence(s) | ☐ |
| 4.16 | **Compliance calendar** entries created **from official sources** | Secretary | `D68` entries | ☐ |
| 4.17 | **Entity recorded in `D63`** with the certificate reference | Secretary | The register | ☐ |
| 4.18 | **Documents filed in `D74`** | Secretary | The custody register entry | ☐ |

**4.19 The checklist rule.** **An item is only "done" when the evidence exists and is filed.** A step in
progress is not a step completed, and no document in this pack may describe it otherwise.

## 5. Resolutions and consents required at formation (using `D28` templates)

| # | Instrument | Purpose | Template |
|---|---|---|---|
| 5.1 | **Subscriber/founder resolution** | Adoption of the constitutional documents; appointment of the first directors and secretary; authorisation to file | `D28` M-01 |
| 5.2 | **First board resolution — organisation** | Adoption of the seal (if any), the bank mandate, the accounting reference date, the registers, the auditors (if appointed), the registered office | `D28` B-01 |
| 5.3 | **First board resolution — share issue** | Allotment to the subscriber(s), the consideration, the register entry, the certificates | `D28` B-03 |
| 5.4 | **Authority and delegation resolution** | Adoption of the `D27` delegation schedule and the `D73` register | `D28` B-01 + `D73` |
| 5.5 | **Directors' consent to act** and **secretary's consent** | Statutory filings | Registry form + letter |
| 5.6 | **Conflict declarations** from each director and officer | `D14`, `D25` §6 | The register entry |
| 5.7 | **Shareholder approval** of any matter `D27` reserves at formation (e.g. an ESOP pool, an issue outside the plan) | — | `D28` M-01 |
| 5.8 | **Related-party register** established at formation if any founder, director or family entity is a counterparty | `D72` | The register |
| 5.9 | **Secretary's certificate** listing the documents filed and the register entries made | The corporate record | `D74` |

## 6. What must never be produced or implied

| # | Prohibited |
|---|---|
| 1 | **A fabricated certificate of incorporation**, registration number, TIN, licence or registry receipt |
| 2 | **A form presented as filed** when it has not been |
| 3 | **A signature, seal or notarisation** produced by anyone other than the person entitled to give it |
| 4 | **A registration number copied from the seed data** (`TZ-NGO-00891`, `TZ-138002211`, `TIN-114-882-991` are synthetic) |
| 5 | **A statement that an entity "exists"** without an inspected certificate |
| 6 | **A back-dated document** — a document created later is dated as created |
| 7 | **A "pre-incorporation contract"** presented as a company obligation unless counsel confirms how it binds |
| 8 | **An AI-generated certificate, filing or acknowledgement**, or an AI-represented registry interaction |

## 7. Pre-incorporation contracts (a specific trap)

| # | Rule |
|---|---|
| 7.1 | A contract made **before** incorporation is made by the **promoters personally** (or, in some laws, has no effect against the company), and the company is **not automatically bound** — `[COUNSEL TO CONFIRM the law and the adoption mechanism]` |
| 7.2 | Where the group must contract before incorporation, the instrument must (a) name the promoter as a party; (b) state whether the company will adopt it; (c) provide for novation; and (d) cap the promoter's exposure where possible |
| 7.3 | **Every pre-incorporation instrument is registered in `D74` and flagged in the consistency report** — because it is the category of document most often forgotten, and most often litigated |

## 8. Decisions required from the user / family / governing bodies

1. **The jurisdiction and the structure** (the gate — §1).
2. The **form** of each entity, and the **name**.
3. The **share capital plan** and the holders at formation.
4. Whether the **Trust** holds at formation or later (sequencing; tax and filing consequences).
5. The **board** at formation, and the **secretary**.
6. The **auditor** (if one is appointed at formation) and the accounting reference date.
7. The **budget** for incorporation, filings and professional fees.

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **registry, forms, documents, fees, periods and penalties** for formation and the post-formation
   filings (`Q-R-01`).
2. The **constitutional requirements** that must be included, and those that are optional (`Q-H-03`).
3. Whether a **single-member** or **small** company has particular requirements.
4. The **beneficial-ownership filing** obligations, and the position where a **trust** is the shareholder
   (`Q-H-05(b)`).
5. Whether any **foreign participation** requires an investment approval or a registration (`Q-H-02(b)`).
6. The **pre-incorporation contract** mechanism and the promoter's liability.
7. Whether the **objects/purpose** clause should be restricted, and the consequences.
8. Whether the **company seal** is required, and its execution formalities (`Q-R-03`).

**No company has been incorporated. No certificate, form, receipt or filing exists. `D21` remains `BLOCKED`
because no constitutional document has been produced for review.**