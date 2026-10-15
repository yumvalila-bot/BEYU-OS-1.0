# BEYU-LF-D45 — Open-Source and Third-Party Software Compliance Policy

Document ID: `BEYU-LF-D45`
Title: Open-Source and Third-Party Software Compliance Policy
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`COMPLETE_DRAFT`** — the policy is drafted. **It is not adopted. No inventory has been produced, no
SBOM exists, no scan has been run, and no component's licence has been reviewed.**
Document owner: Group CTO function (proposed) with counsel
Approving authority (proposed): each board
Next review date: Annually, and on any change in the toolchain, the build pipeline or the AI stack
Classification: `INTERNAL` — the SBOM and licence inventory are `CONFIDENTIAL`
Related documents: `D39`, `D40`, `D41`, `D42`, `D43`, `D44`, `D46`, `D69` (tax/accounting software), `D70`
Depends on: `Q-IP-06` (protection of software architecture, datasets and trade secrets); `Q-IP-04` (assignment formalities)

> **⚠ THE PLAIN-WORDS WARNING.**
> **Open-source software is not free of obligations, and it is not "nobody's".** Every component comes with
> a licence, and a licence is a **contract** (and sometimes a condition of copyright). The two ways a small
> group gets burned are:
> **(1) Copyleft** — a component whose terms may require the group to release its own code (or more, in
> aggressive readings), shipped into a proprietary product.
> **(2) Licence mismatch or absence** — a component with **no licence at all** (which is *not* permission to
> use), a non-commercial licence used commercially, or an attribution obligation nobody satisfied.
> **The consequence in a financing, an acquisition or a dispute can be the forced removal or re-licensing of
> a core product feature. That is an avoidable, self-inflicted risk.**

---

## 1. Scope

All software and models the group **uses, ships, deploys, modifies, embeds or links**, including:
server and mobile application code; libraries and frameworks; build tools and scripts; containers and base
images; infrastructure-as-code; database and middleware; client-side assets; **AI models, weights,
inference runtimes, training frameworks, prompt libraries and embedding models**; datasets bundled with
software; and any component **redistributed** to customers or partners (including in an appliance or a
self-hosted deployment).

**Out of scope:** open **content** (images, fonts, text, media) — which carries its own licence obligations,
and is covered by the same discipline **but is often forgotten** — a specific caution: **fonts and icons are
licensed assets, not free decoration.**

## 2. Licence categories and the group's default position

| # | Category | Examples (illustrative only — **verify the actual text, and the version**) | Default position |
|---|---|---|---|
| L-A | **Permissive** | MIT, BSD-2/3-Clause, Apache-2.0, ISC | **Permitted** with attribution and notice obligations satisfied |
| L-B | **Weak copyleft** | LGPL, MPL-2.0, EPL | **Permitted with controls** — dynamic linking/limited modification strategy; **legal review before use in a shipped product** |
| L-C | **Strong copyleft** | GPL-2.0/3.0 | **Prohibited in a proprietary shipped product** without specific written counsel approval and an architectural plan (e.g. genuine process separation) |
| L-D | **Network copyleft** | AGPL-3.0 | **Prohibited** without specific written counsel approval — **it can reach a hosted service** |
| L-E | **Non-commercial / research / academic** | "non-commercial", "research only", "evaluation" | **Prohibited** in any commercial or production use |
| L-F | **Source-available but restrictive** | Business Source, SSPL, Commons Clause, "no competing use" | **Prohibited** without written counsel approval |
| L-G | **Unlicensed / no licence file** | A repository or gist with no licence | **Prohibited.** No licence means **no permission** — copyright is reserved by default |
| L-H | **Model / weight / dataset terms** | Model cards, acceptable-use policies, dataset licences | **Review required** — these are **contracts**, not copyright, and they may prohibit the group's intended use or the training of derivative models |
| L-I | **Public domain / CC0** | — | Permitted; **record the evidence** that it is genuinely public domain |

**2.1 Version and text matter.** A licence's **version** changes its terms (GPL-2.0 vs GPL-3.0; a licence
with a later-added restriction; a "MIT" repository whose `LICENSE` file was changed). **Record the exact
version, and the copy of the licence text, in the inventory.**

**2.2 The "we only use it internally" relaxation.** L-C and L-D components may be permissible **for internal
tools that are never distributed and never offered to third parties as a service** — but **only** with a
recorded approval, an architectural note confirming the separation, and a periodic re-check (because
internal tools become products). **AGPL in a hosted service is the classic trap; nothing here authorises it
without advice.**

## 3. Controls

| # | Control | Requirement |
|---|---|---|
| C-01 | **An inventory exists** | A component inventory (SBOM) is produced for each product, and maintained |
| C-02 | **Scanning is automated** | Dependency/licence scanning runs in the build pipeline (existing tooling may be reused; **the policy does not mandate a specific vendor**) |
| C-03 | **Approval gate** | A new dependency of category L-B and above requires an approval before merge |
| C-04 | **Attribution is discharged** | The required notices, licence texts and attributions ship with the product where required |
| C-05 | **Modification is recorded** | Where a component is modified (an L-B obligation), the change and the publication of the modification are handled as required |
| C-06 | **No component without a licence** | L-G components must be replaced, vendored with a documented permission, or removed |
| C-07 | **Containers and images** | Base images and their contents are covered by the same discipline |
| C-08 | **AI stack** | Model, weight, dataset and prompt-library terms are reviewed **before** use; and **no client or personal data is fed to a model whose terms do not permit it** |
| C-09 | **Vendor and supplier flow-down** | `D43` requires suppliers to disclose third-party material and to deliver an SBOM |
| C-10 | **Exit plan** | For any critical L-B/L-C component, the team knows what it would take to replace it |
| C-11 | **Incident route** | A discovered violation (an AGPL component in a shipped product; a missing attribution; a non-commercial component in production) is treated as an **incident** (`D71`), escalated immediately, and remediated with counsel — **not deleted quietly** |
| C-12 | **No AI-generated licence** | No AI tool may be the authority on whether a component is compliant; and AI-generated code must be screened like any other input |

## 4. The compliance process (operational)

| Step | Action | Owner | Evidence |
|---|---|---|---|
| 1 | **Discover** — scan and inventory every dependency, transitively | Engineering | The SBOM |
| 2 | **Classify** — assign each component a category (L-A…L-I) from the **actual licence text** | Engineering + counsel for L-B and above | The classified inventory |
| 3 | **Decide** — permitted / permitted with controls / prohibited | CTO, with counsel for L-B+ | The recorded decision |
| 4 | **Remediate** — replace, isolate, obtain a commercial licence, or remove | Engineering | The change record |
| 5 | **Discharge** — notices, attributions, source offers (where required) | Engineering | The shipped notices |
| 6 | **Monitor** — re-scan on every dependency update; a **licence change in an upstream component is a trigger** | Engineering | The scan history |
| 7 | **Certify** — before a release, the product's licence position is certified | CTO | The release record |
| 8 | **Review** — annually, and on any material change in the toolchain | CTO | The review record |

## 5. The pre-release certification (what "we checked" actually means)

Before a release, the following must be answered **in writing**, for each product:

1. Is there an SBOM, and does it cover **transitive** dependencies?
2. Are there any **L-C, L-D, L-E, L-F or L-G** components — and if so, what is the approval?
3. Are all **attribution and notice** obligations satisfied in the shipped artifact?
4. Are any components used in a **hosted service** where the licence's network terms might apply?
5. Is any **model, weight or dataset** in the product subject to terms that the product's use conflicts with?
6. Is any **font, icon, image, dataset or media asset** unlicensed?
7. Are there any **unresolved** items, and who owns them?

**A release with an unresolved item 2 or 5 requires the CTO's and counsel's written position. "It's
probably fine" is not a position.**

## 6. Decisions required from the user / family / governing bodies

1. Whether the group **ships** GPG/AGPL-class components at all (the pack's default: **no**).
2. The **approval thresholds** for adding dependencies.
3. Whether the group will **publish** any of its own code (which changes the analysis considerably, and is a
   strategy decision, not a compliance one).
4. Whether to buy a **commercial licence** for a critical component rather than route around it.
5. Who is the **named licence-compliance owner**.
6. Whether the group will accept **AI-generated code** into products, and on what terms.

## 7. Counsel review note — `[COUNSEL TO CONFIRM]`

1. The **actual legal effect** of each copyleft family in the relevant jurisdiction, and whether
   **linking/aggregation** doctrine supports the group's architecture.
2. Whether **AGPL** obligations are triggered by the group's **hosted** services.
3. What **attribution/notice** compliance actually requires, in a form a customer would accept.
4. Whether a **non-commercial or research licence** can be used in any internal context without exposure.
5. Whether **model and dataset terms** are enforceable as contracts, and what they prohibit.
6. What the **remedies** are for a violation discovered retrospectively, and whether a cure is possible.
7. Whether the group's **own** licence choice for anything it publishes should be open, dual, or
   proprietary (`D42`).
8. The **tax/accounting** treatment of donations or sponsorship of open-source projects, if any.

**No inventory exists. No SBOM exists. No scan has been run. No component has been reviewed. This policy is
not in force.**
