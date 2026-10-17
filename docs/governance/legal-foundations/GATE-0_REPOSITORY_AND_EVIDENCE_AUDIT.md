# GATE 0 — Repository and Evidence Audit

Document ID: `BEYU-LF-GATE0`
Version: 1.0
Date: 2026-10-15
Status: `INFORMATIONAL`
Classification: `INTERNAL`

> This is the audit that had to precede all drafting. It records what was **actually** inspected,
> what was found, which sources were relied on, and — critically — which artefacts in the repository
> **must not be mistaken for legal facts**.

---

## 1. Audit scope and method

| Item | Value |
|---|---|
| Repository | `https://github.com/yumvalila-bot/BEYU-OS-1.0` |
| Local checkout | `/home/user/BEYU-OS-1.0` |
| Branch audited | `arena/8fbc8030-beyu-os-1-0`, branched from `main` |
| Baseline commit | `05e2fbabb9d2aa5292846e6acc092984d01ea468` ("fix(health): make the post-sign-in load failure diagnosable instead of blaming permissions (#106)") |
| Working tree at audit start | **clean** (`git status` → "nothing to commit, working tree clean") |
| Clone depth | Full history available for `main` and the session branch as provided |
| Method | Directory and file inventory; targeted content reading; identifier scans (`LEN_*`, `TEN_*`, `FIR-*`, `MIGRATION`); schema reading; documentation cross-reading |
| What was **not** done | No code executed; no migrations run; no database contacted; no production system accessed; no live business record read or modified; no entity register queried at a registry |

**Honest limitation.** This audit read the repository. It did **not** verify anything against a
government registry, a bank, a land registry, an IP register or a filed instrument. Statements about
entities, shares, ownership, registrations and IP in the repository are therefore *repository
content*, not verified legal facts, unless a document explicitly says otherwise.

---

## 2. Repository shape (what was found)

~3,900 tracked files. Relevant top-level structure:

| Path | Relevance to this engagement |
|---|---|
| `docs/governance/` (39 files) | Highest-authority governance process documents: decision authority, charters, bodies, memberships, appointments, ratification queue, gap register |
| `docs/architecture/` (35 files) | Family-institution Phase 2.5 contract, policy ratification register (27 decisions), Phase 3 readiness gate, allowlist/denylist, Family Office protection architecture, Foundation OS architecture |
| `docs/foundation/` | `FOUNDATION_OS_GAP_REGISTER.md` |
| `docs/compliance/README.md` | Compliance-engine model, jurisdictions, privacy-by-design, retention |
| `docs/branding/` | Institutional identity, canonical logo sources, SHA-256 pins, motto, "supplied by the BEYU Family Trust" provenance note |
| `docs/constitution/README.md` | BEYU OS Constitution (12 articles, DB-stored), amendment procedure |
| `docs/domain-model/README.md` | Authoritative schema map: `legal_entities`, `ownership_records`, `entity_appointments`, `beneficiaries`, `family_members`, `trust_*` |
| `docs/ECOSYSTEM_STATUS.md` | **The one canonical current ecosystem status** |
| `docs/migration/BEYU_OS_2_0_*.md` | Migration programme documents (engineering, not legal) |
| `docs/audit/FAMILY_OFFICE_COMPLETENESS_AUDIT.md` | Execution-verified Family Office completeness, FIR gates, engineering non-claims |
| `drizzle/0000…0075*.sql` (76 migrations) | The control plane's relational model |
| `src/db/seed.ts` (2,203 lines) | **Seeded reference/demonstration data — see §6** |
| `sectors/health/...` | A Sector OS; contains **fictional legal-document fixtures — see §7** |
| `tests/` (48 suites) | Executable behaviour, including family-office fail-closed tests |
| Root `*.md` (~70 files) | Historical reports and certifications; explicitly labelled HISTORICAL STATE |

## 3. Which sources are authoritative (and in what order)

Used for this pack, in this order:

| Rank | Source | Why authoritative for this engagement |
|---|---|---|
| 1 | `docs/ECOSYSTEM_STATUS.md` | Self-declared **one canonical current ecosystem status**; states that older reports "are HISTORICAL STATE… not proof of current state". |
| 2 | Source code + migrations (`src/**`, `drizzle/**`) | The system's actual behaviour and schema. Overrides any prose. |
| 3 | `docs/domain-model/README.md`, `docs/architecture/*` | Canonical schema/architecture descriptions. |
| 4 | `docs/governance/*` | Governance process contracts, ratification queue, authority gaps. |
| 5 | `docs/architecture/phase-2.5-*`, `phase-3-*` | Family-institution domain contract, 27-decision register, Phase 3 gate. |
| 6 | Root `*_REPORT.md`, `*_CERTIFICATION*.md`, `*_AUDIT*.md` | **HISTORICAL STATE only.** Not relied on for any legal proposition. |
| 7 | `src/db/seed.ts`, `sectors/health/src/data/*` | **Demonstration data. Relied on only as evidence of what is seeded, never as legal fact.** |
| 8 | This pack | Drafting work product. Subordinate to all of the above for facts; it adds no facts of its own. |

### 3.1 Conflicts found between documentary sources (reconciled or logged)

| # | Conflict | Resolution taken |
|---|---|---|
| C-1 | Root `*_CERTIFICATION*.md` reports assert production/engineering certification; `README.md` §"BEYU OS 2.0 migration status" says the migration/release programme is **NOT certified**; `docs/ECOSYSTEM_STATUS.md` labels older reports HISTORICAL. | Rely on `ECOSYSTEM_STATUS.md` + source. Certifications not relied on. |
| C-2 | `CURRENT_STATE.md` self-labels "HISTORICAL STATE (superseded…)" yet remains at repository root with an audit-style title. | Treated as historical. Logged as a usability hazard in the consistency report. |
| C-3 | The engagement brief's canonical chain includes a **"Sector LLCs"** layer. Repository documentation (`docs/branding/README.md`) states "*BEYU Family Trust → BEYU Holding Company → country holdings / sector operating companies*" — no Sector LLC layer. | **Not silently resolved.** Logged as `DAA-ARCH-005` (Class B/E) and raised in the consistency report. This pack uses "Sector Operating Companies"; "Sector LLC" is not used as a defined term. |
| C-4 | Seed data places the Family Trust in **Mauritius** (`countryCode: "MU"`), the Holding company in **DIFC/AE**, and describes a "Tanzania-first" enterprise elsewhere. | **Not silently resolved.** Logged as `DAA-ARCH-006`. Seed data is not law and is not a decision. |
| C-5 | `docs/architecture/HOLOGRAPH_AND_FAMILY_OFFICE_REALITY_AUDIT.md` vs `docs/audit/FAMILY_OFFICE_COMPLETENESS_AUDIT.md` on Family Office completeness. | Both treated as engineering records; neither is a legal instrument. Family Office legal status is left open (`DAA-FO-001`). |
| C-6 | Migration snapshot chain: `drizzle/0040` and `drizzle/0041` headers record that the drizzle-kit meta snapshot chain has been stale since 0039. | Recorded; **not touched** (documentation-only scope). |

## 4. Governing architecture as recorded in the repository (Class B)

These are **architectural intentions**, not proof of legal formation.

| Principle | Repository evidence |
|---|---|
| Control plane: BEYU OS = constitutional control plane, enterprise kernel, governed intelligence layer | `README.md`; `docs/constitution/README.md` |
| Exactly four Sector OSs: `HEALTH_OS`, `FINANCE_OS`, `AGRICULTURE_OS`, `UJENZI_OS` | `README.md` ("Exactly four Sector OSs—Health, Finance, Agriculture and Ujenzi"); `docs/ECOSYSTEM_STATUS.md` §3 |
| `SHARED_FAMILY_OFFICE` and `SHARED_HCM` are **shared capabilities, never OSs**; no `FAMILY_OFFICE_OS` or `HCM_OS` exists | `docs/ECOSYSTEM_STATUS.md` §3 |
| BEYU Foundation is a **separate nonprofit sister organisation**, root legal-entity tenant, never a subsidiary tenant, never a Sector OS | `src/db/seed.ts` tenant comment; `docs/architecture/foundation-os.md` §1 & §10 |
| Chain: Trust → Holding → country holdings → operating companies | `docs/branding/README.md` §Constitutional context; `src/db/seed.ts` `parentEntityId` chain |
| NOELIA/HIVE has no authority; AI is never an authority | `docs/ECOSYSTEM_STATUS.md` §9; `src/lib/family/office/authority.ts` (`FIR-017`) |
| Finance OS is the sole accounting authority; `CAP_POSTING` LOCKED and fail-closed | `docs/ECOSYSTEM_STATUS.md` §7; `docs/architecture/foundation-os.md` §3 |
| Identity: one `GlobalUserID`; Party → User → Tenant → Entity graph | `docs/ECOSYSTEM_STATUS.md` §1 |
| Motto: "Bridging Care. Building Trust."; values Trust, Care, Integrity, Innovation, Impact | `docs/branding/README.md` |
| Brand assets supplied by the BEYU Family Trust; two distinct institutional marks pinned by SHA-256 | `src/components/brand-assets.ts`; `docs/branding/README.md` |
| Digital ≠ legal: UI visibility and hostnames are never authorization | `docs/ECOSYSTEM_STATUS.md` §2, §3 |

## 5. Existing legal/governance machinery in the control plane (Class A — verified in schema)

The control plane already models — **as software records, not legal acts** — the following. This
matters because the pack must align with, not duplicate, these records.

| Model | Migration | Legal-relevant fields |
|---|---|---|
| `core.legal_entities` | `0000` baseline | effective-dated, self-referencing parent/child, `registration_number`, `tax_identifier`, `incorporation_date`, `jurisdiction_id`, `entity_type` (`TRUST`, `HOLDING`, `COUNTRY_HOLDING`, `OPERATING_COMPANY`, `FOUNDATION`, `SUBSIDIARY`) |
| `core.ownership_records` | `0000` | `economic_pct`, `voting_pct`, `ownership_type` (incl. `BENEFICIAL`), `provenance`, effective dating |
| `core.entity_appointments` | `0000` | directors, officers, **trustees**, `PROTECTOR` role |
| `share_classes` | `0040` | `code`, `class_type`, `authorized_shares`, `issued_shares`, **`votes_per_share numeric(9,4)`**, `rights_summary`, `instrument_document_ref`, `approval_ref` |
| `equity_positions`, `vesting_schedules/events`, `change_of_control_events`, `leaver_cases`, `esop_*`, `cap_table_snapshots`, `dilution_scenarios` | `0040` | All carry `legal_review_status` default `REQUIRES_LEGAL_REVIEW` |
| `trust_instruments`, `trust_provisions`, `trust_decisions`, `trust_distributions` | `0041` | Provision `legal_effect_status` default **`INERT`**; `enforceability_assumed` default **`false`**; `trust_distributions.authoritative_owner` default `FINANCE_OS` |
| Foundation operations substrates (40 tables, all RLS-bound) | `0035`, `0069` | `foundations`, funds, grants, donors, programs, suppliers, POs, assets; **no posting path** |
| `people.family_members`, `people.beneficiaries`, `people.family_vault_items` | kernel | beneficiary records require approving resolution; vault is an index, not a document store |
| `governance.*` | kernel + `0049`–`0061` | bodies, charters, meetings, resolutions, votes, appointments, lifecycle |
| `assurance.*` | kernel | risk, controls, `compliance_obligations` (TRA VAT/PAYE, TZ PDPA 2022, ISO 27001, AML/KYC, NHIF, IFRS 10, GDPR), legal matters, continuity |

**Design decisions in the schema that the pack must respect and not contradict:**

- A trust provision without a ratified legal-effect reference is **INERT**; the software never
  assumes enforceability (`0041` header, §48 of the X10THINK programme).
- `trust_distributions` carries `authoritative_owner = FINANCE_OS` and a nullable `finance_record_ref`
  — the trust layer records structure, Finance OS owns the money.
- Foundation operations **cannot** call the posting engine (`journalsPosted: false`,
  `capPosting: LOCKED`).
- Every family-institution persistence table is **gated on unratified decisions** and
  `materialized: false` (`src/lib/family/office/persistence.ts` §FIR-001…027).

## 6. ⚠ Finding: seeded data that reads like legal fact (`src/db/seed.ts`)

**This is the single most dangerous artefact for a legal-drafting exercise.** `src/db/seed.ts`
contains a synthetic corporate group that reads exactly like a real one:

| Seeded as | Seeded values that read as legal fact | Audit conclusion |
|---|---|---|
| `BEYU Family Trust` | `registrationNumber: "MU-TR-100241"`, `incorporationDate: "2014-03-11"`, jurisdiction `MU-NAT` (Mauritius), currency USD | **Synthetic.** Must not be cited as an existing trust or registration. Also conflicts with "Tanzania-first" (see `DAA-ARCH-006`). |
| `BEYU Holdings Ltd` | `registrationNumber: "DIFC-4471"`, `incorporationDate: "2015-06-02"`, jurisdiction `AE-DIFC` | **Synthetic.** |
| `BEYU Tanzania Holding Company Ltd` | `registrationNumber: "TZ-138002211"`, `taxIdentifier: "TIN-114-882-991"`, `incorporationDate: "2016-01-20"` | **Synthetic.** A fabricated TIN is especially hazardous: it looks like a TRA identifier. |
| Operating companies (Health/FinTech/Agriculture/Ujenzi/Mining) | `registrationNumber: "TZ-…"`, TINs, incorporation dates | **Synthetic.** |
| `BEYU Foundation` | `registrationNumber: "TZ-NGO-00891"` | **Synthetic.** Must not be represented as an NGO certificate number. |
| `ownership_records` | `provenance: "Share register + trust deed schedule 2"`, `"BRELA filing 2016/0221"`, `"JV agreement clause 4.2"`, `"Mining JV deed"`, `"Share certificate H-001"`; percentages 96%, 85%, 70%, 60%, and a "look-through calculation 100% × 96% × 85%" producing 81.6% beneficial | **Synthetic.** These provenance strings *imitate* real chain-of-title evidence. They are **not** evidence. No share register, trust deed schedule, certificate or BRELA filing was inspected. |
| `compliance_obligations` | statutory references (e.g. "VAT Act Cap 148 s.66", "Income Tax Act s.81", "Personal Data Protection Act 2022 s.30") and due dates | Seeded **configuration examples**. The statutory citations must be verified by a Tanzanian tax professional before operational reliance. |

**Required consequence for the pack:** every register in `registers/` opens with a standing warning
that *seeded control-plane rows are not legal facts*, and the Decision and Assumptions Register
records each of the above as **Class A-repository-content / Class F-not-completed**, never as
Class A verified legal fact.

## 7. ⚠ Finding: fictional executed legal documents inside the Health OS fixture data

`sectors/health/src/data/documents.ts` self-describes as *"Realistic templated content for every
legal / corporate document in the BEYU vault"*. It contains fixture documents presented with
`status: "Signed"` / `"Active"`, a fabricated hash and an `onChain: true` flag, including:

| Fixture | What it falsely implies |
|---|---|
| `DOC-IP-001` "Intellectual Property Assignment Agreement", parties `["All 42 BEYU Engineers", "BEYU Holding Co."]`, status **"Signed"** | That an executed IP assignment to a holding company exists. **No such assignment exists in this repository**, and no assignee entity is evidenced as legally constituted. |
| `DOC-TM-001` "Trademark Registration — 'BEYU' (TZ-2025-4421)", status **"Active"**, "Registered… under the Tanzania Trade and Service Marks Act", renewal "every 10 years" | That a Tanzanian trademark registration exists with that number. **No evidence supports it.** The claimed renewal cycle also conflicts with the term stated in some authorities (see `DAA-IP-004`). |
| "Related Filings" claiming a **Madrid Protocol** designation of KE, UG, RW, ZA, NG | Madrid designation of Tanzania is not available — Tanzania is **not** a Madrid System member and the ARIPO Banjul Protocol has not been domesticated for marks. The fixture describes an impossible filing. See `LEGAL_SOURCES_REGISTER` §IP-4. |
| Fixture "Founders Agreement", "SHA", "Cap Table", "ESOP", "NDA" with statuses `Signed`/`Active` | Suggests a documented cap table and shareholder agreement. **None is evidenced.** |

**Required consequence for the pack:** these are **fixtures, not instruments**. They are treated as
(a) a material documentation-integrity risk, and (b) the reason the IP register
(`ip/BEYU-LF-D40_IP_INVENTORY_AND_CHAIN_OF_TITLE_REGISTER.md`) is opened at **zero verified entries**
with the fixture list recorded as "claimed but unevidenced". This is logged as `DAA-RISK-003`.

## 8. Existing unratified governance decisions this pack must not bypass

The repository maintains a formal, fail-closed register of **27 unratified family-institution
decisions** (`docs/architecture/phase-2.5-family-institution-policy-ratification-register.md`,
`docs/architecture/phase-3-unratified-denylist.md`), of which 24 are recorded as **BLOCKING**.

Only three are *resolved*, and all three are **boundaries that constrain, never grants**:

| ID | Resolved boundary |
|---|---|
| FIR-017 | Noelia/HIVE has no constitutional, fiduciary, entitlement, approval, financial-truth or policy-making authority. |
| FIR-018 | Finance OS is the canonical financial truth; Family Office is policy/instruction/assessment/reference only. |
| FIR-019 | Identity, tenants, legal entities, delegations, documents, audit and events are canonical BEYU primitives. |

Plus the separate accounting-authority queue (`docs/governance/HUMAN_RATIFICATION_QUEUE.md`):
**"ACCOUNTING AUTHORITY = NOT RATIFIED"**; 0 signed ratification documents; every `STATUS:` reads
`PENDING`, every `SIGNATORY:`/`DATE:` blank.

**Consequence:** this pack **must not** fill, answer, pre-empt or "ratify" any FIR, any `PENDING`
accounting decision, or any `C-1…C-5` question. It documents them, maps them to the documents that
depend on them, and routes them to the human/professional gate. Every relevant document in this pack
names the FIRs that block it.

## 9. Legal research: what could and could not be verified

**Environment limitation (recorded honestly).** The sandbox shell has outbound network access only
to `github.com`, `codeload.github.com`, `api.github.com`, `registry.npmjs.org`, `pypi.org` and
`files.pythonhosted.org`. Tanzanian official sites (`rita.go.tz`, `brela.go.tz`, `tra.go.tz`,
`mawasiliano.go.tz`, `nps.go.tz`, `pdpc.go.tz`) were therefore **not reachable by direct fetch from
the shell**. Research was performed through the agent's web-search/retrieval tooling, which returned
primary-source text for several instruments (including official PDF text served from
`rita.go.tz`, `brela.go.tz`, `tra.go.tz`, `mawasiliano.go.tz` and `tanzlii.org`). Where only
secondary commentary was retrievable, the entry is marked `VERIFIED_SECONDARY` or
`REQUIRES VERIFICATION`.

**Nothing in this pack asserts a fee, deadline, rate, threshold or filing requirement as settled
law.** Each such item is either attributed to a retrieved source with its URL, or marked
`[COUNSEL TO CONFIRM]`.

Detailed source-by-source results are in `LEGAL_SOURCES_REGISTER.md`.

## 10. What this audit could not inspect (explicit gaps)

| Missing | Consequence for the pack |
|---|---|
| Any executed trust deed, constitution, MOA/AOA, shareholder agreement, IP assignment or licence | All such instruments are drafted here **from zero**; no existing instrument was reviewed or reconciled. |
| Any registry extract (BRELA, RITA, TRA, PDPC, BRELA IP) | No registration number, class, status or title is asserted. Every register field is a placeholder. |
| Any valuation, audited account, bank statement, or asset schedule | No value, basis or custody of any asset is asserted. |
| Any tax ruling, transfer-pricing file or residency determination | Tax positions are raised as questions only. |
| Any family-member identity, lineage evidence or beneficiary nomination | Beneficiary classes remain `[BENEFICIARY CLASS]`. |
| Production infrastructure, DNS, Vercel, Supabase | Not accessed (correctly out of scope). |
| Whether the person(s) behind the project are the same parties as the seeded "founder" | `[FOUNDER NAME]` remains a placeholder. |

## 11. Gate 0 conclusion

| Criterion | Result |
|---|---|
| Repository audit actually performed | **Yes** — §2–§9; limitations recorded in §1, §9, §10. |
| Authoritative sources identified and ranked | **Yes** — §3, with six conflicts logged (§3.1) and two not silently resolved. |
| Fabricated/seed artefacts identified and quarantined | **Yes** — §6, §7. This was the highest-value finding of the audit. |
| Existing unratified gates preserved | **Yes** — §8. |
| Existing work preserved | **Yes** — no file moved, renamed or deleted; no code changed. |
| Legal sources verified where verifiable | **Partially** — see `LEGAL_SOURCES_REGISTER.md`; official text retrieved for several instruments, others marked `REQUIRES VERIFICATION`. |

**Gate 0 status: COMPLETE (with the recorded limitations above).** GATE 1 output is
`DECISION_AND_ASSUMPTIONS_REGISTER.md`.
