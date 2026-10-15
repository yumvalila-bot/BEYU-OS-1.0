# BEYU-LF-D47 — Brand Use, Reputation, Domain and Digital Asset Stewardship Policy

Document ID: `BEYU-LF-D47`
Title: Brand Use, Reputation, Domain and Digital Asset Stewardship Policy
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`COMPLETE_DRAFT`** — the policy is drafted. **It is not adopted. No brand rule is in force, no
domain is inventoried, no account is under the described controls, and no approval process exists.**
Document owner: Brand owner function (proposed) with the CTO function
Approving authority (proposed): each board; the Trustees for Trust-identity matters
Next review date: Annually
Classification: `INTERNAL` (the domain/account inventory is `CONFIDENTIAL`)
Related documents: `D39`, `D40`, `D42`, `D44`, `D46`, `D61`, `D62`, `D70`
Depends on: `docs/branding/README.md` (the repository's existing identity rules — see §2)

> **⚠ THE BRAND IS NOT A LOGO FILE.**
> The mark, the domain, the handles, the visual identity, the tone and the **promises the group makes** are
> one asset. Damage to the reputation is **not recoverable by deleting a post**, and **an AI impersonation,
> a lookalike domain or a leaked credential can do more harm in an hour than a competitor can in a year.**
> **Two further rules matter here: (1) the Trust's identity is not the group's marketing identity, and it
> must not be used as if it were; and (2) nothing may be published that discloses a trade secret or
> pre-empts a registration (`D46` §2.5).**

---

## 1. Purpose

To define who may use the BEYU identity, how, where, and under whose authority; to keep the digital estate
(domains, DNS, accounts, handles, app-store and payment accounts) under the **entities'** control; and to set
the response to brand-risk events.

## 2. The existing repository identity rules (authoritative for the software face of the brand)

The repository already contains a brand discipline that this policy **adopts rather than duplicating**. Its
rules, as recorded in `docs/branding/README.md`:

| # | Existing rule | Effect here |
|---|---|---|
| 1 | **Two canonical sources, no new artwork**: the BEYU FAMILY TRUST mark (`public/brand/beyu-family-trust-logo.png`) presented by `FamilyTrustLogo`, and the BEYU OS / operating-ecosystem mark (`public/brand/beyu-os-logo.png`) presented by `BeyuOsLogo`, each with a recorded SHA-256 | **The marks used in software are fixed; no alternative artwork may be created** |
| 2 | **No cropping, recolouring, tracing, filters or alternate dark-mode artwork**; no modification of the files | A branding change is a **controlled change**, not a design decision |
| 3 | **Family Trust mark only where the Trust itself is represented** (the Family Office workspace's Trust-labelled panel; Health's Trustee Command constitutional-authority panel); the surrounding shell is **operating identity** | **The Trust's mark must never be used as product branding** |
| 4 | **All operating domains use the same OS mark**; domain icons are technical navigation icons, not institutional logos; no new brand engine | Sub-brands do not get their own logos by default |
| 5 | `npm run brand:sync` / `brand:check` maintain and verify the web derivatives against the canonical source; the root build runs the check | **A brand-asset change follows the asset-update process, with byte-integrity tests** |
| 6 | Historical SVG assets are retained as historical, **not referenced**; `BeyuLogo` is a deprecated compatibility adapter | Deprecated identity must not reappear in new work |
| 7 | Identity and branding **never** affect authorization: "Noelia/HIVE governance and all authorization remain independent of branding"; the OS label changes by pathname, "never access rights" | **A logo grants nothing. A look-alike does not create authority either** |

**2.1 The constitutional line the repository already draws** (restated because brand documents get it wrong):
`BEYU Family Trust → BEYU Holding Company → country holdings / sector operating companies`; the Foundation is
the **separate nonprofit sister organization**; the **Family Office is a shared capability, not an OS**.
**Branding must never contradict the structure** — a page must not imply that the Trust operates a business,
that the Foundation is part of the group, or that a Sector OS is a legal entity.

## 3. Use of the brand by category

| # | User | May use? | Conditions |
|---|---|---|---|
| 1 | Group entities in the ordinary course | ✔ | Within this policy and the existing identity rules |
| 2 | The Foundation | ✔ **for its own purposes only** | Its own identity must be **clearly distinguishable** — the Foundation must not be presented as part of the business group (`D49`, `D51`) |
| 3 | The Family Office | ✔ **for services to the family only** | **Never as a business brand**; never as an OS |
| 4 | Family members personally | ⚠ limited | Only for their own identification (e.g. a role description), **never to imply authority, ownership, or to speak for the group** |
| 5 | Employees | ✔ in a professional capacity | Within role; no personal accounts purporting to be official |
| 6 | Advisers, agents, partners, resellers | ⚠ by licence only | `D42`; quality control; no sub-branding without approval |
| 7 | Customers / clients | ✔ nominative use | Describing the relationship factually; no implied endorsement |
| 8 | Journalists, analysts, researchers | ✔ nominative use | Factual reference; **no logo licence implied** |
| 9 | **Any use that suggests a relationship that does not exist** | ✘ | Prohibited |
| 10 | **Any use by a person or entity connected to a dispute, a fraud, or an impersonation event** | ✘ | Prohibited; `D46` §6 |

## 4. Digital asset stewardship (domains, DNS, accounts)

| # | Rule |
|---|---|
| D-01 | **Domains are registered in the operating entity's name**, on an entity-controlled registrar account (`D44` §2.3) |
| D-02 | **A registrar account, DNS account, app-store account or payment account must never be under the control of one individual alone** — two-person control, entity-held recovery details (`D35` §2 C-05) |
| D-03 | **Auto-renew + entity payment method** for every operational domain; **at least two reminders** in `D68` |
| D-04 | **A domain lapse is a security incident**, not an admin error — it can be re-registered and used for phishing against the group's own customers |
| D-05 | **DNS changes require a recorded approval** (the requester, the approver, the change, the reason); the DNS provider's audit log is retained |
| D-06 | **Email authentication** (SPF/DKIM/DMARC) is configured and monitored — an unauthenticated domain is a phishing vector that damages the brand |
| D-07 | **Lookalike-domain monitoring** is performed periodically; a suspected typosquat is escalated to `D46`, not handled informally |
| D-08 | **Admin access is revoked on departure**, in the same 24-hour discipline as other access (`D08` §8.3) |
| D-09 | **Social handles and app-store accounts**: entity-owned, with an owner and a backup; a personal account that has become the brand's presence must be migrated |
| D-10 | **Delegated external agencies** get scoped access, never super-admin, and lose it on termination — with a verified revocation |

## 5. Publication and approval

| # | Content | Approval |
|---|---|---|
| 1 | Anything using the **Trust's mark or name** | Trustees |
| 2 | Anything using the **Foundation's** identity | Foundation governing body |
| 3 | Anything that states a **structure, an ownership or a legal fact** | Company Secretary + counsel review — **because a public misstatement of the structure is a real risk** |
| 4 | A **new sub-brand, product name, or tagline** | Board, **after a clearance search** (`D46` §6.5) |
| 5 | Anything that **discloses** code, architecture, data, security detail, pricing or a trade secret | CTO + board (`D46` §2.5) |
| 6 | Announcements of **transactions, partnerships or funding** | Board; counsel review of any regulated statement |
| 7 | Anything published **on behalf of** an entity by an external agency | Named approver inside the group |

**5.1 Absolute rules.** No publication may: imply a relationship that does not exist; state a legal fact that
is not evidenced; use the Trust's or Foundation's identity in a commercial marketing context; or be issued by
anyone who is not authorised. **And: no AI tool may publish, schedule or answer on behalf of the group**
(AI may draft; a human approves and publishes — `D02` cl. 7.4).

## 6. Brand-risk and reputation events

| # | Event | Immediate response | Authority |
|---|---|---|---|
| 1 | **Impersonation / fake account / phishing site** | Preserve evidence; platform take-down (via the authorised route); alert customers/server teams; **do not engage the impersonator publicly**; escalate if customers may be defrauded | CTO + Company Secretary; counsel if a demand is needed |
| 2 | **Lookalike domain** | Preserve; consider a defensive registration; monitor mail/DNS; escalate to `D46` | CTO |
| 3 | **Negative press or a viral complaint** | **One named spokesperson only**; no improvised comments; no argument in public; record the facts | Board-nominated spokesperson |
| 4 | **Customer-facing incident** (outage, data, safety) | Follow the incident and continuity plans (`D60`, `D62`); the **technical** response leads, the brand follows; **never promise more than is known** | Incident authority (`D62`) |
| 5 | **Employee or family-member post** affecting the brand | Address privately first; public correction only if a factual misstatement needs correcting; **never a public family argument** | Board / Family Council |
| 6 | **A leaked credential, repository or document** | Treat as a security incident **and** a confidentiality incident; rotate; assess the trade-secret consequence; report per `D71` | CTO |
| 7 | **A forged document bearing the brand or the Trust's name** | Preserve; legal assessment; consider notifying the registry/bank/affected parties; record | Company Secretary + counsel |
| 8 | **A dispute made public by the other side** | Counsel's advice first; **no retaliatory publication** | Board |

**6.1 The preservation rule.** In every event above: **preserve evidence before acting, never delete the
group's own records, and never "correct" a public record by deleting it silently** (a correction is a new,
dated statement — `D33` §7.1).

## 7. Controls

| # | Control |
|---|---|
| C-01 | A **brand asset register** listing the canonical assets, their hashes and their approved uses (the repository's existing discipline, adopted) |
| C-02 | The **digital asset inventory** (`D44` §2.3) is complete, and every account has a named owner and a second controller |
| C-03 | Access reviews at least annually and on every departure |
| C-04 | Spokesperson authorisation is **written, named and reviewed**; social-media account holders are named |
| C-05 | Every published legal/structural statement is reviewed once, and the approval is recorded |
| C-06 | Brand-risk events are registered in `D71` (excluding privileged material) |
| C-07 | **The repository's existing `brand:check` build gate is not weakened** by this policy; a brand change follows the asset-update process |

## 8. Decisions required from the user / family / governing bodies

1. Who is the **brand owner** function, and who is the second controller.
2. Who is the **authorised spokesperson** for each entity (and the backup).
3. Whether the group will use **sub-brands** at all, and how they relate to the master mark.
4. Whether the **Foundation's** identity is sufficiently distinct (a governance point, not a design point).
5. Whether the group will **publish** anything about the family or the structure, ever.
6. The **defensive domain policy** (which lookalikes/territories to hold).
7. Whether any family member may use the brand personally, and in what form.

## 9. Counsel review note — `[COUNSEL TO CONFIRM]`

1. What steps are legally available against an **impersonator or a typosquatter**, and the evidence needed.
2. Whether a **platform takedown** requires a particular form of notice or an authorised agent.
3. Whether a **public statement** about a dispute or a counterparty creates defamation or
   interference exposure.
4. Whether the group's **email-authentication** and anti-phishing posture has a legal or regulatory
   dimension (data protection, consumer protection).
5. Whether **competitor lookalike branding** is actionable, and whether a search/opposition strategy is
   warranted (`D46`).
6. Whether the group's **own** use of third-party names (comparisons, "compatible with", partner logos)
   creates exposure.
7. Whether a **family member's personal use** of the mark requires a written licence.
8. The position on **AI-generated media** depicting the group, its people or its marks.

**No brand rule is in force. No domain or account is inventoried. Nothing in this policy has been applied to
any publication.**
