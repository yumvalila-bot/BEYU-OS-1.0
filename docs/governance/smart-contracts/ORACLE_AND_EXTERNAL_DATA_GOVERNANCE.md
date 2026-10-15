# BEYU-SCG-05 — Oracle and External Data Governance

Document ID: `BEYU-SCG-05`
Title: Oracle and External Data Governance
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the evaluation rules exist in code and are restated here; the
**source approval register is empty**, no external source is approved, and every verification status
is `REQUIRES VERIFICATION` until evidenced.
Owner (proposed): Group CFO with the Risk function `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board; trustees where a trust asset or a
beneficiary interest is affected `[NEITHER BODY IS REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`, and after any incident involving a data source
Classification: `INTERNAL`
Related documents: `BEYU-SCG-01`, `BEYU-SCG-02`, `BEYU-SCG-06`, `BEYU-SCG-07`, `BEYU-SCG-08`, `BEYU-SCG-10`; legal pack: `BEYU-LF-PRIV-02`, `BEYU-LF-D70`, `BEYU-LF-LEGAL_SOURCES_REGISTER` §3.3
Depends on: the source register (`BEYU-SCG-08` R-ORA-01), which is empty; counsel's answers on data-source reliance and personal data (Q-SCG-06, Q-SCG-07)

> **CONTROL BLOCK.**
> **This is** the governance of data that arrives from outside BEYU and can influence a governed
> decision: which sources are admissible, how freshness and deviation are policed, what happens when a
> reading is wrong, and what an oracle reading is **not**.
> **This is not** a claim that any source is verified, licensed, authoritative or even correctly
> named. **No external source is approved today.**
> **Prohibited content:** no invented authority, licence, registration, feed provider or official
> confirmation; no statement that a source is "official" without a retrieval record.

---

## 1. The single most important rule

> **An oracle reading is an INPUT. It creates no authority, no obligation, no ownership and no
> entitlement — and an unusable reading is a REFUSAL to execute, never a default.**
> (`src/lib/blockchain/model.ts`: `grantsAuthority: false`, structurally.)

## 2. Feeds, sources and the rules the platform enforces (verified)

**Feeds** (`ORACLE_FEEDS`): `FX_RATE`, `COMMODITY_PRICE`, `MILESTONE_COMPLETION`,
`DELIVERY_ACCEPTANCE`, `WEATHER_INDEX`, `PAYMENT_CONFIRMATION`, `GOVERNMENT_VERIFICATION`,
`DONOR_DISBURSEMENT`, `IDENTITY_VERIFICATION`, `REGULATORY_STATE`.

**Source kinds** (`ORACLE_SOURCE_KINDS`): `AUTHORITATIVE_PRIMARY`, `SISTER_SOURCE`, `OPEN_DATA`,
`MANUAL_EVIDENCE`, `ONCHAIN_PUSH`.

**Deviation tolerance and maximum age** (measured, per feed — basis points and seconds):

| Feed | Deviation limit (bps) | Max age (s) | Character |
|---|---|---|---|
| `FX_RATE` | 100 | 3,600 | Tight — money |
| `COMMODITY_PRICE` | 250 | 21,600 | Loose-ish — market |
| `WEATHER_INDEX` | 5,000 | 86,400 | Loose — physical world |
| `PAYMENT_CONFIRMATION` | 0 | 600 | Zero tolerance |
| `MILESTONE_COMPLETION` | 0 | 2,592,000 | Zero tolerance, long horizon |
| `DELIVERY_ACCEPTANCE` | 0 | 2,592,000 | Zero tolerance, long horizon |
| `GOVERNMENT_VERIFICATION` | 0 | 86,400 | Zero tolerance |
| `DONOR_DISBURSEMENT` | 0 | 86,400 | Zero tolerance |
| `IDENTITY_VERIFICATION` | 0 | 604,800 | Zero tolerance; personal data |
| `REGULATORY_STATE` | 0 | 604,800 | Zero tolerance |

**Evaluation outcomes** (`OracleEvaluation.status`): `CURRENT`, `STALE`, `EXPIRED`, `DISPUTED`,
`INVALID`, `MISSING`. A reading is `usable` only when it is not invalid, not future-dated, not under
dispute, `CURRENT` (age ≤ max age) and within deviation. Beyond 4× max age it becomes `EXPIRED`.

**Enforced rules, restated as governance:**

| Rule | Statement | Code behaviour |
|---|---|---|
| O-1 `[MANDATORY]` | An `AUTHORITATIVE_PRIMARY` or `ONCHAIN_PUSH` reading **must carry an `authorityRef`** — the registry record that qualifies the source | Missing reference → `INVALID`, not usable |
| O-2 `[MANDATORY]` | `MANUAL_EVIDENCE` must reference **the evidence and the verifying human decision** | Missing reference → `INVALID` |
| O-3 `[MANDATORY]` | **Open data is for monitoring only** — never the trigger for an automatic settlement | Finding added; `INVALID` |
| O-4 `[MANDATORY]` | A reading **future-dated** relative to the decision instant is refused | Refusal, never a freshness free pass |
| O-5 `[MANDATORY]` | A reading deviating beyond the feed's limit is **quarantined, not adopted** | Finding; not usable |
| O-6 `[MANDATORY]` | **An open dispute outranks the reading** | Status `DISPUTED`; not usable |
| O-7 `[MANDATORY]` | Raw on-chain readings are **never trusted as scaled**; `decimals` must be explicit and sane (0–36) | Finding otherwise |
| O-8 `[MANDATORY]` | A missing or rejected reading is **not a default** | `MISSING`/`INVALID` → execution blocked (`ORACLE_INPUT_UNUSABLE`) |
| O-9 `[MANDATORY]` | **No oracle grade exists.** `usable` is input quality; it never substitutes for the contract, approval and dispute gates in front of it | `evaluateExecutionGates` requires both |

## 3. Source governance — the register that does not exist yet

**`R-ORA-01` (specification in `BEYU-SCG-08`) opens with ZERO entries.** Nothing below has occurred.

| # | Requirement `[PROPOSED]` | Evidence required |
|---|---|---|
| O-10 | Every source used for a governed decision has a register entry **before first use** | Source name, kind, feed(s), principal, contractual basis, licence, jurisdiction |
| O-11 | Every register entry carries a **verification status**, using the legal pack's vocabulary (`VERIFIED_PRIMARY` / `VERIFIED_SECONDARY` / `REQUIRES VERIFICATION`, `BEYU-LF-LEGAL_SOURCES_REGISTER` §3.3) | The retrieval record or an explicit `REQUIRES VERIFICATION` |
| O-12 | An `AUTHORITATIVE_PRIMARY` claim requires a **retrieval record** from the source itself; secondary commentary is never enough | Retrieval log entry (URL, date, what was read) |
| O-13 | Every entry names a **fallback order** and a **manual-evidence path** for when the source is unavailable | Documented fallback; `fallbackOrder` recorded on readings |
| O-14 | Every entry names an **owner** (a role, not a person in this repository) `[TO BE APPOINTED]` | Register cell |
| O-15 | Feeds carrying **personal data** (notably `IDENTITY_VERIFICATION`) require a data-protection assessment before use | `BEYU-LF-PRIV-02` inventory entry, `BEYU-LF-D70` checklist |
| O-16 | Sources are reviewed at least annually, and after any reading that caused an incident | Review record |
| O-17 | A source that cannot be verified is used **only** for monitoring, marked `REQUIRES VERIFICATION`, and is never a settlement trigger | Register status + O-3 |

### 3.1 What the repository actually contains about external Tanzanian authorities

The repository carries a federation data file (`src/db/federation-data/tz-authorities.ts`) that lists
authorities with a deliberate `uncertain` flag and a failure policy. **Two examples matter here:**

- `UTT_AMIS` — mandate recorded as *"As discussed in BEYU architecture work"*, `uncertain: true`,
  notes: *"Official identity not confidently established — mark UNCERTAIN per failure policy; verify
  during reconciliation."*
- `TMX` and `TRAB` carry similar `uncertain: true` notes.

**Rule O-18 `[MANDATORY]`.** A federation/authority row with `uncertain: true` **may never** be used as
an `authorityRef`, as an oracle source of kind `AUTHORITATIVE_PRIMARY`, or as evidence of a filing,
a verification or a regulatory relationship. Its content is architecture intent, not a verified fact.
None of these names may appear in the register as an approved source until verified against the
authority itself.

## 4. Disputes over data `[PROPOSED]`

| # | Rule |
|---|---|
| O-19 | A dispute about a feed opens a record; while it is open, the feed is **not usable** for any governed decision (`DISPUTED`). |
| O-20 | Dispute resolution is a human act under `BEYU-LF-D17`; the platform records the dispute, not its resolution. |
| O-21 | Where a reading already influenced an act, the impact is assessed and recorded; **the platform does not silently correct history** — it records the correction as a new fact with evidence. |

## 5. Operating the feeds `[PROPOSED]`

| # | Rule |
|---|---|
| O-22 | Readings are recorded with `observedAt` and `asOf`; a reading without both is invalid. |
| O-23 | Deviation monitoring is per feed and per source; repeated quarantines trigger a source review within the review cycle, and immediately where a settlement was attempted. |
| O-24 | Manual readings are made by a named role, with the evidence attached; a manual reading by an unappointed role is invalid. |
| O-25 | Failure of a source never silently degrades a decision: the outcome is a refusal and an escalation (`BEYU-SCG-04` A6). |
| O-26 | No automation may convert an unapproved or monitoring-only source into an execution trigger (`BEYU-SCG-04` AU-2…AU-6). |

## 6. Open items

| ID | Open item | Needs |
|---|---|---|
| O-OPEN-01 | No source is approved; `R-ORA-01` is empty | `[TO BE DECIDED]` — SC-RM-05 decisions |
| O-OPEN-02 | No external source has been verified against itself in this environment | `[USER TO SUPPLY]` / counsel's verification |
| O-OPEN-03 | Personal-data assessment for `IDENTITY_VERIFICATION`-class feeds | `BEYU-LF-PRIV-02`, `BEYU-LF-D70` |
| O-OPEN-04 | Contractual/licensing basis for each source | `[TO BE DECIDED]` |
| O-OPEN-05 | Whether reliance on a third-party feed creates liability, and how it should be disclaimed | `[COUNSEL TO CONFIRM]` — Q-SCG-06 |
| O-OPEN-06 | Regulatory-State and Government-Verification feeds: whether automated reliance is permissible at all | `[COUNSEL TO CONFIRM]` |

## 7. What this document does not establish

It approves no source, verifies no authority, confirms no licence and asserts no reading. It records
how the platform evaluates external data and how BEYU intends to govern it — neither of which makes
any external fact true.
