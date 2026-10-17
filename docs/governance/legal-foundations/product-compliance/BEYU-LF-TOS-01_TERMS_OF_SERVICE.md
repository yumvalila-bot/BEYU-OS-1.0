# BEYU-LF-TOS-01 — Terms of Service (grounded in the actual product and entity)

Document ID: `BEYU-LF-TOS-01`
Title: Terms of Service — conditional template, grounded in the actual product and contracting entity
Version: 1.0 (draft) · Date 2026-10-15
Status: **`CONDITIONAL_DRAFT` / `PENDING_USER_INPUT` / `PENDING_COUNSEL`** — **UNPUBLISHED. NOT IN FORCE. The
product has not been defined, no user exists, and no entity is verified.**
Owner (proposed): Company Secretary function with the product owner · Approving authority (proposed): the board
Next review date: On the structure decision and the product definition; then annually
Classification: `PUBLIC` when finalised (this draft is `CONFIDENTIAL`)
Related: `PRIV-01`, `PRIV-02`, `TOS-01` annexes, `CMP-01`, `D47`, `D45`, `D39`–`D47`, `FIN-01`, `EMP-04`
Depends on: **the contracting entity (`INC-01`); the actual product and its real features; `PRIV-02`; counsel
on consumer, health-sector, finance-sector and data-protection rules**

> **⚠⚠ THE TERMS CONTROL.**
> **1. TERMS OF SERVICE ARE A CONTRACT WITH USERS.** They must describe **the product that actually exists**,
> be issued by **an entity that actually exists**, and impose obligations **the group can actually perform**.
> Today: **no entity is verified, the product is not defined, and there is no `/terms` route in the
> application.** Any published terms would therefore be a false statement about a service and a counterparty.
> **2. DESCRIBE ONLY WHAT EXISTS.** The repository's product-adjacent text (ToS/privacy/pitch-deck boilerplate
> in `sectors/health/src/data/*`) is **fictional fixture content** and **must never be migrated, adapted or
> published** (`GATE-0_REPOSITORY_AND_EVIDENCE_AUDIT.md` §6). **A feature described in terms of service is a
> promise.**
> **3. NO IMPLIED FEATURES, NO IMPLIED COMMITMENTS.** No service-level promise, no uptime figure, no "24/7
> support", no "we will notify you within X hours", no clinical claim, no financial-service claim — **unless
> the group has decided it, funded it, and can evidence it.**
> **4. THE SECTOR QUESTION IS NOT A FORMALITY.** If the product touches health, finance, agriculture or
> construction, the sector regulator's rules may apply in addition to consumer and data-protection law, and
> may determine what the entity may even say. **`[COUNSEL TO CONFIRM]` — and no claim of licensure or
> authorisation may be made unless the licence exists.**

---

## 1. Publication gate

| # | Gate | Status |
|---|---|---|
| 1.1 | The **contracting entity** identified and verified | **NOT MET** (`INC-01`) |
| 1.2 | The **product defined**: what it does, for whom, in what countries, on what devices | **NOT MET** |
| 1.3 | The **user categories** identified (consumer, business, patient, clinician, employee, family member, partner) | **NOT MET** |
| 1.4 | **`PRIV-02` complete** and `PRIV-01` publishable (the two are published together) | **NOT MET** |
| 1.5 | The **sector position** confirmed (which regulator, which licence, which rule) | **NOT MET** |
| 1.6 | **Payment, refund and cancellation mechanics** confirmed (if any payment is taken) | **NOT MET** |
| 1.7 | **Support, availability and incident** positions confirmed and resourced | **NOT MET** |
| 1.8 | A **published route** with a version and effective date | **NOT MET — no `/terms` route exists** |
| 1.9 | **Counsel review**, including the enforceability of the liability, dispute and governing-law clauses | **NOT MET** |
| 1.10 | The **Kiswahili** position settled (`EMP-04` §5) | **NOT MET** |

## 2. The terms (shell — every substantive field a placeholder)

```
TERMS OF SERVICE — [ENTITY NAME]
Version [ ] | Effective date [ ] | Last updated [ ]

[0] WHO WE ARE AND WHAT THESE TERMS ARE. These terms are between you and [ENTITY NAME], [regulatory
    status if any — ONLY if verified]. By [using the service / creating an account / clicking accept], you
    agree to these terms. If you do not agree, do not use the service.
    Governing language [ ]; a Kiswahili version is [available/not available and why].

[1] DEFINITIONS. (User, Account, Service, Content, Subscription, Fee, Applicable Law, Force Majeure...)

[2] WHAT THE SERVICE IS. [Describe ONLY the real features. State plainly what it is NOT — e.g. it is not a
    medical diagnosis, not financial advice, not a substitute for professional judgement — where that is
    true. Do not describe a roadmap as if it were live.]

[3] ELIGIBILITY AND ACCOUNTS. Age/minor rules (§PRIV-01 §12); accurate information; account security; the
    user's responsibility for their credentials; the prohibition on sharing accounts where applicable;
    the entity's right to suspend for misuse (with the safeguards in [ ]).

[4] ACCEPTABLE USE. What the user must not do: unlawful use; infringing IP; uploading malware; attempting
    to access others' data; scraping; reverse engineering where prohibited; using the service to harm any
    person; using it for an unauthorised regulated activity.

[5] FEES, BILLING AND CHARGES. [Only if fees exist. Price, currency, tax treatment, billing cycle, the
    renewal rule, the cancellation route, the refund rule — all as ACTUALLY operated.]

[6] THE USER'S CONTENT. Ownership stays with the user; the licence the user grants to operate the service;
    the user's warranties that they have the rights to what they upload; the treatment of data on
    termination; the data-protection cross-reference (PRIV-01).

[7] OUR INTELLECTUAL PROPERTY. Ownership of the service, the software, the marks (`IP-TM-01` — **no claim of
    registration unless it exists**); no implied licence beyond using the service; the treatment of feedback.

[8] THIRD-PARTY SERVICES AND INTEGRATIONS. Only what exists. Each third party's own terms apply; the group
    is not responsible for them; no claim that an integration exists unless it does.

[9] AVAILABILITY, CHANGES AND SUPPORT. What is actually promised — **if nothing is promised, say so.** No
    invented uptime, no invented response times.

[10] SUSPENSION AND TERMINATION. By the user; by the group for breach; the effect on data (per PRIV-01 §8);
    the survival of the clauses that must survive.

[11] DISCLAIMERS. **Only lawful disclaimers.** Nothing here may exclude liability for fraud, for death or
     personal injury caused by negligence, for a statutory right, or for anything else the law does not
     permit to be excluded. [COUNSEL TO CONFIRM the local limits on exclusion — this is jurisdiction-
     specific and must NOT be copied from another country's template.]

[12] LIMITATION OF LIABILITY. **Caps and exclusions that the law permits.** [COUNSEL TO CONFIRM. A cap
     imported from a foreign template may be unenforceable, unconscionable or simply wrong.]

[13] INDEMNITY. [Only where lawful and, where the user is a consumer, only where permitted.]

[14] COMPLAINTS AND DISPUTE RESOLUTION. The internal route, then mediation, then the forum counsel
     advises. Any mandatory consumer forum or ADR route is stated. **Nothing here obstructs a user's
     statutory rights or a report to a regulator.**

[15] GOVERNING LAW AND JURISDICTION. [Counsel to settle.] The effect of a mandatory local rule is stated.

[16] CHANGES TO THESE TERMS. How changes are made, notice, and the user's option to stop using the service.

[17] GENERAL. Notices; assignment (the user may not assign; the group may only as the law permits);
     severability; entire agreement; no waiver; force majeure; third-party rights; contact.

[18] SECTOR-SPECIFIC SCHEDULE (if applicable). [Health / finance / other — ONLY if the sector rules and the
     licences exist. NO claim of licensure, authorisation or regulatory approval may be made unless the
     instrument exists.]

NOT PUBLISHED. NOT IN FORCE. NOT REVIEWED. EVERY SUBSTANTIVE FIELD IS A PLACEHOLDER.
```

## 3. Sera ya Matumizi (Kiswahili — kwa muhtasari; kiolezo)

```
MASHARTI YA MATUMIZI — [JINA LA TAASISI]
Toleo [ ] | Tarehe ya kuanza [ ]

[0] SISI NI NANI. Masharti haya ni kati yako na [JINA LA TAASISI]. Kwa [kutumia huduma / kufungua akaunti],
    unakubali masharti haya. Lugha inayotawala [ ].
[1] MAELEZO YA MANENO.
[2] HUDUMA NI NINI — na si nini. [Eleza yaliyopo TU. Usieleze mipango kama ilivyo hai.]
[3] SIFA NA AKAUNTI. [Umri/watoto; usahihi wa taarifa; usalama wa akaunti.]
[4] MATUMIZI YANAYOKUBALIKA. [Yasioruhusiwa: uvunjaji wa sheria, ukiukaji wa haki miliki, kuingilia
    taarifa za wengine, n.k.]
[5] MALIPO. [Kama yapo TU: bei, mzunguko, kughairi, marejesho — jinsi inavyofanya kazi kikweli.]
[6] MAUDHUI YAKO. [Umiliki unabaki kwako; leseni unayotupa; uhakikisho wa haki.]
[7] HAKI MILIKI YETU. [Umiliki wa huduma na alama za biashara — USIDAI usajili usioepo.]
[8] HUDUMA ZA WATU WENGINE. [Zilizopo TU.]
[9] Upatikanaji, mabadiliko na msaada. [Usiahidi uptime au muda wa kujibu usio na msingi.]
[10] KUSIMAMISHA NA KUSITISHA. [Kwa mtu binafsi na kwa taasisi; athari kwa taarifa.]
[11] KANUSHO. [Kisheria TU. Haki za kisheria zisizoweza kuondolewa zinalindwa.]
[12] KIKOMO CHA DHIMA. [Kwa kadiri sheria inaruhusu — wakili athibitishe.]
[13] FIDIA. [Pale inaporuhusiwa na sheria TU.]
[14] MALALAMIKO NA UTATUZI WA MIZOZANO. [Njia ya ndani, upatanishi, mahakama. Haki za kisheria
     hazizuiliwi.]
[15] SHERIA INAYOTAWALA NA MAHAKAMA.
[16] MABADILIKO YA MASHARTI.
[17] MASHARTI YA JUMLA.
[18] SEHEMU YA SEKTA. [Afya/fedha — ikiwa sheria na leseni zipo TU.]

HAIJACHAPISHWA. HAIKUTUMIKA. SEHEMU ZOTE NI VIAKI.
```

## 4. Prohibited content (publication checklist)

| # | Prohibited |
|---|---|
| 4.1 | A **contracting entity that does not exist**, or a statement about its registration or status that is unverified |
| 4.2 | A **feature, integration, service level or support commitment that does not exist** |
| 4.3 | A **clinical, diagnostic or financial-service claim**; a claim of **licensure, authorisation or regulatory approval** without the instrument |
| 4.4 | A **liability cap or exclusion copied from a foreign template** without counsel's advice on the local law |
| 4.5 | A **dispute or governing-law clause** that ousts a mandatory local forum or a consumer's statutory rights |
| 4.6 | A clause that **obstructs a report to a regulator** or a **protected disclosure** |
| 4.7 | **"You agree that we may [do something unlawful or open-ended]"** — an open-ended consent to unknown acts |
| 4.8 | A **data practice** that contradicts `PRIV-01`/`PRIV-02` |
| 4.9 | A **Kiswahili text** that diverges from the English (`EMP-04` §3) |
| 4.10 | A **fictional fixture paragraph** migrated from `sectors/health/src/data/*` |
| 4.11 | A claim of **certification, "bank-grade" security, "100% uptime", "fully compliant"** |
| 4.12 | Any **promise about money, refunds or payments the group has not implemented** |

## 5. Coordination requirements

| # | `TOS-01` term | Must align with |
|---|---|---|
| 5.1 | Data practices | `PRIV-01`, `PRIV-02` |
| 5.2 | IP ownership and licence | `D39`, `D40`, `D42`, `D45`, `IP-TM-01` |
| 5.3 | Payments, fees and refunds | `D69` (accounting), the tax position (`Q-TAX-01`) |
| 5.4 | Sector claims | `CMP-01` §5 (the obligations register and the licences actually held) |
| 5.5 | Marketing claims about the product | `FIN-01` §3 (**the same prohibition: no unverified claim**) |
| 5.6 | Support and incident commitments | `D71`, the operations plan |
| 5.7 | The entity's name and brand | `D47`, `docs/branding/README.md` |
| 5.8 | Employee/worker use of the service | `EMP-03` §P-04 |

## 6. Decisions required from the user / family / governing bodies

1. **Which entity contracts with users**, and in which countries it offers the service.
2. **What the product is**, in one page a stranger could check.
3. Whether the group is **licensed** for anything, and what it may say.
4. Whether **fees** are charged, and the refund policy actually implemented.
5. The **availability and support** position the group will actually honour.
6. The **dispute route** and the governing law.
7. Whether a **consumer** relationship exists at all (it changes the applicable protective rules).
8. The **language** position.

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. Whether the **contracting entity** must be licensed or registered to offer the service.
2. The **consumer-protection** rules: the mandatory terms, the right of withdrawal, the refund position, the
   unfair-terms rules and the permitted liability exclusions.
3. Whether **click-acceptance** is effective, and what evidence of assent is required.
4. The **sector rules** (health, finance) and the permitted claims.
5. The **governing law and forum**, and any mandatory local forum.
6. The **tax** treatment of fees (`Q-TAX-01`).
7. Whether the **Kiswahili** text must be provided, and which governs.
8. Whether any **accessibility** obligation applies.
9. Whether the terms must be **filed** with any authority.

**These terms are unpublished, unreviewed and incomplete. No product is defined, no entity is verified, no user
exists, and there is no `/terms` route in the application. Nothing here creates a contract or a commitment.**