# BEYU-SCG-04 — Automation Governance

Document ID: `BEYU-SCG-04`
Title: Automation Governance
Version: 1.0 (draft)
Date: 2026-10-15
Status: **`PRELIMINARY_FRAMEWORK`** — the classes, prohibitions and register rules are drafted; the
per-automation authorisations (`[TO BE DECIDED]`) and the board decisions in SC-RM-07 are not taken.
Owner (proposed): Chief Governance Officer with the Group CFO and the HIVE/Noelia platform owner `[TO BE APPOINTED]`
Approving authority (proposed): BEYU Holding Company board `[NOT REPRESENTED IN THIS REPOSITORY AS LEGALLY CONSTITUTED]`
Next review date: `[SET ON APPROVAL]`, and on **every** change to the automation inventory
Classification: `INTERNAL`
Related documents: `BEYU-SCG-01`, `BEYU-SCG-02`, `BEYU-SCG-05`, `BEYU-SCG-07`, `BEYU-SCG-08`, `BEYU-SCG-09`, `BEYU-SCG-04A`; legal pack: `BEYU-LF-D27`, `BEYU-LF-D61`, `BEYU-LF-D62`, `BEYU-LF-D73`
Depends on: the inventory (`BEYU-SCG-04A`); board decisions under SC-RM-07; counsel's answers on automated agency (`BEYU-SCG-10` Q-SCG-11)

> **CONTROL BLOCK.**
> **This is** the governance of software that acts without a human in the loop **for that act**:
> what each automation may do unattended, what is forbidden to all of them, where a human decision
> must bind, and how the whole set is inventoried and reviewed.
> **This is not** a grant of autonomy. No automation is authorised by this document; the register
> states what exists, and the board decides what may act.
> **Prohibited content:** no claim that an automation "approves", "authorises" or "decides" anything;
> no model scoring presented as a risk assessment; no automation presented as a substitute for a
> human act that law, an instrument or a fiduciary duty requires.

---

## 1. Scope: what counts as an automation

An **automation** is any software behaviour that produces an effect **without a human decision in
that specific act**. Scheduled briefings, inbound webhook processing, deterministic rule evaluation,
reconciliation passes, retention-eligibility calculation and simulation runs all qualify. A human
clicking "confirm" does not.

Three categories are explicitly **out of scope** because a human act is present in each: interactive
governed mutations (a permissioned user acting through a service), human reviews and approvals, and
simulation runs that a human deliberately triggers for analysis.

**What the Phase 0 audit established about the current posture (verified):**

| Property | Measured state |
|---|---|
| In-process timers, cron expressions, worker threads, queue consumers | **None in `src/`** |
| The only scheduler entry point | `POST /api/v1/ai/noelia/schedules/tick` — permission `ai:schedule.manage`, rate-limited, idempotent; due schedules emit outbox events that a consumer processes idempotently; **"No in-process timer executes anything"** |
| Scheduled briefings | Run **as the schedule's recorded owner** and re-check authorisation per tool |
| Noelia tool surface | **43 tools**; **38** declare `sideEffects: "NONE"`; **5** declare `DOMAIN_WRITE` (`knowledge.ingest`, `knowledge.replace`, `knowledge.publish`, `memory.write`, `ai.model.route`) — listing grants nothing |
| Payment ingestion | HMAC-authenticated over `${timestamp}.${rawBody}` with constant-time compare and a clock-skew window; durable dedupe on (connection, provider event id); unauthenticated and unparseable bodies are **recorded and refused** |
| Payment risk rules | Deterministic rules with published weights (`payment-risk-1.0.0`); a rule firing marks a row **non-auto-postable** and never rejects the money record ("losing the record is worse than the risk of reviewing it") |
| Payment reconciliation pass | May record candidates and set `RECONCILED` at or above the governed confidence floor; **"NEVER SILENTLY ADJUST"** is imported from the finance reconciliation rule |
| Settlement trust raising | The one place trust may rise without a human, bounded: only a settlement batch or a bank credit raises trust, and never above what the artefact supports |
| Contract obligation escalation | Deterministic lead times by severity (LOW 14, MEDIUM 10, HIGH 5, CRITICAL 2 days) and a 30-day post-delivery verification window |
| Retention | Eligibility is computed from `uploaded_at` and the policy; **legal holds block deletion**; destruction is a separate governed process requiring human approval |
| Authority verdicts | Fail-closed; only `ACTIVATED` is executable; `REFERENCE_DATA` never authorises |
| Simulation | `mutatedProductionState: false` structurally; never imports the DB; never returns `RATIFIED`/`APPROVED`/`EFFECTIVE` |
| Idempotency | Scoped to tenant + actor + endpoint; in-flight claims are **never auto-reclaimed** by design |

## 2. Automation classes

| Class | What it does | May it act unattended? | Examples (from the inventory) |
|---|---|---|---|
| **A1 — Ingest** | Accepts, authenticates, deduplicates and records an inbound event | **Yes**, within its authentication and dedupe rules; it may refuse | Payment webhook ingestion; enterprise-event ingestion (exactly-once acceptance) |
| **A2 — Observe & compute** | Reads governed data and produces analysis, posture or findings | **Yes** — and it may not mutate | Execution posture; oracle usability; health/observation services; simulation |
| **A3 — Record & verify** | Writes a determined platform fact with evidence | **Yes**, when the write is a determination the code can compute from recorded inputs | Anchor verification; obligation timing; registry transition validation |
| **A4 — Bounded domain write** | Writes governed content of a non-authoritative kind | **Yes, narrowly** — only for the enumerated tools and only under per-tool permission | The five `DOMAIN_WRITE` Noelia tools |
| **A5 — Trust raising** | Raises the platform's confidence in a money record | **Yes, only where enumerated and bounded** | Settlement ingestion raising trust to `VERIFIED_PROVIDER` / `RECONCILED_BANK`; reconciliation setting `RECONCILED` at/above the floor |
| **A6 — Escalate & notify** | Raises an escalation, opens an exception, puts a named human on a case | **Yes** | Payment exceptions; governance escalations; obligation escalation clocks |
| **A7 — External execution** | Signs, submits, broadcasts, posts, pays or transfers | **NO — none exists**, and none may be created without the SC-RM decisions | — |

**Rule AU-1 `[MANDATORY]`.** An automation may only ever act within the class it is registered under.
Using an A4 write to achieve an A7 effect is prohibited regardless of the mechanism.

## 3. Prohibitions binding every automation `[MANDATORY]`

| # | Prohibited |
|---|---|
| AU-2 | Signing, submitting, broadcasting or preparing-to-broadcast any transaction; holding or using key material |
| AU-3 | Posting a journal entry, recognising revenue or expense, or moving money in any form (`CAP_POSTING` is LOCKED and no automation may substitute for it) |
| AU-4 | Approving, closing a human review gate, or closing a legal-review determination |
| AU-5 | Creating, granting or transferring authority, ownership, title, office or beneficiary status |
| AU-6 | Raising trust or verification beyond the enumerated bounds; marking a payment "settled" |
| AU-7 | Deleting, mutating or overwriting evidence, audit records, lifecycle events or reconciliation findings (append-only by design) |
| AU-8 | Silently adjusting an amount, balance or quantity to make anything agree |
| AU-9 | Retrying a failed **external** act autonomously; a retry is a new, human-authorised act |
| AU-10 | Introducing an in-process timer, cron expression, watcher or queue consumer as a scheduling mechanism; scheduling stays a recorded, permissioned, idempotent entry point |
| AU-11 | Presenting a model-derived score, probability or prediction as a risk assessment, a fraud determination or a credit decision |
| AU-12 | Acting on a `REFERENCE_DATA` provenance, a seed row, a fixture or a demo identifier |
| AU-13 | Bypassing idempotency, tenant scope, RLS, rate limiting or the audit ledger to get an effect |
| AU-14 | Treating a missing reading as a default value: absent data is `DATA_NOT_AVAILABLE`, never `0` and never "no limit" |

## 4. Where a human must bind

| Situation | Required human binding |
|---|---|
| Any A5 trust raising above the enumerated artefacts | A human review (`payments/review.ts`) — confirmation is a named human act with separation of duties (`prepare ≠ confirm`) |
| Any approval a gate requires | A digest-bound approval naming the payload version, with an expiry (`noelia/human-approval.ts` semantics) |
| Any act in the reserved-matter schedule | A recorded decision under `BEYU-SCG-01` §5 |
| Any destruction of a retained record | Human approval; legal holds block regardless of expiry |
| Any execution of an on-chain package | Human execution decision recorded before an external signer acts (`BEYU-SCG-02` L-12) |
| Any incident response | The runbook in `BEYU-SCG-07` — incident commander `[TO BE APPOINTED]` |

## 5. Failure behaviour `[MANDATORY]`

| Rule | Statement |
|---|---|
| AU-15 | **Fail closed.** A missing input, an unverifiable timestamp, an unparseable payload, an unauthenticated body or an absent approval produces a refusal plus a record — never a default action. |
| AU-16 | **A failed run mutates nothing.** Failures are recorded with evidence; the run is retried only as a human act, and for safe classes only under an explicit retry policy. |
| AU-17 | **An uncertain outcome is never auto-reclaimed.** Where a process may have committed before its response was lost, the claim is left in flight for a human, by design. |
| AU-18 | **Refusal reasons are recorded precisely**, listing which gates were missing, so a human can act — and so a refusal cannot be mistaken for an error. |
| AU-19 | **Nothing about a failure may be hidden.** Suppressing a failed run, a finding or an exception is a governance incident (`BEYU-SCG-07`). |

## 6. The automation register and the machine-readable inventory

Two artefacts, one truth:

1. **`R-AUT-01` — the automation register** (`BEYU-SCG-08`): one row per automation, with owner
   `[TO BE APPOINTED]`, class, authorisation decision reference, review date and status. It opens with
   **zero authorised automations**: the inventory records what exists; the register records what the
   board has authorised, which today is **nothing**.
2. **`BEYU-SCG-04A` — `AUTOMATION_INVENTORY.json`**: a machine-readable inventory **derived from the
   repository**, listing each automation's entry point, trigger, class, side effects, human-binding
   points, refusal behaviour, evidence, source paths and verification status, with
   `"grants_authority": false` on every entry.

**Rules**

| Rule | Statement |
|---|---|
| AU-20 `[MANDATORY]` | **The inventory is not authority.** An entry describes behaviour that exists; it authorises nothing, and a reader must not treat presence in the inventory as approval. |
| AU-21 `[MANDATORY]` | **The inventory is kept true.** Any change to an automation's behaviour, entry point, class or side effects updates the inventory **in the same change**; a stale inventory is a defect to be reported, not tolerated. |
| AU-22 `[MANDATORY]` | **The inventory is derived, never aspirational.** An entry may not describe planned, disabled or speculative behaviour; proposals belong in `R-AUT-01` as proposals. |
| AU-23 `[PROPOSED]` | A refusal test accompanies every new automation or material change to one (see `BEYU-SCG-09`), and the test is named in the inventory entry. |

## 7. Adding or changing an automation

1. **Proposal** — what it does, which class, which data, which failure modes, what it may never do.
2. **Threat and abuse assessment** — how it could be turned against BEYU (including by an insider and
   by a manipulated input).
3. **Refusal tests** — the tests that prove it refuses without authority, and fails closed.
4. **Register entry** — `R-AUT-01` with the class, owner and decision reference; `SC-RM-07`
   decision where the automation would act without a human in a new way.
5. **Inventory update** — `BEYU-SCG-04A` in the same change.
6. **Review** — periodic, and on every incident that involves it.

**Rule AU-24 `[MANDATORY]`.** If a proposal cannot state what the automation may **never** do, it is
not ready to be considered.

## 8. Open items

| ID | Open item | Needs |
|---|---|---|
| AU-OPEN-01 | No automation is authorised in `R-AUT-01`; the register must be populated by decisions, not by this pack | `[TO BE DECIDED]`, board |
| AU-OPEN-02 | Owners for every inventory entry | `[TO BE APPOINTED]` |
| AU-OPEN-03 | Whether any automation may act on a schedule in production at all, and under whose name | `[TO BE DECIDED]` |
| AU-OPEN-04 | Whether automated acts bind the entity, and the basis of that view | `[COUNSEL TO CONFIRM]` — Q-SCG-11 |
| AU-OPEN-05 | Retry policy per class for failed runs | `[TO BE DECIDED]` |
| AU-OPEN-06 | Two documentation-drift observations recorded by the audit (a stale "four rules" comment in `payments/risk.ts`; one import statement left inside the leading comment of `payments/ingest.ts`) — cosmetic, **unfixed by choice** in the Phase 1 documentation-only change set. **CLOSED in Phase 2** (`BEYU-SCG-12` `D-5`, `D-6`): both were fixed, with no behavioural change, once the change set was no longer documentation-only | **Closed.** Recorded in `AUTOMATION_INVENTORY.json` `inventory_observations`; the inventory and the source were updated in the same change set |

## 9. What this document does not establish

No automation is granted any right by this document. It creates no autonomy, no schedule, no
integration, no credential and no authority; and it does not claim that any automation has been
reviewed, tested for refusal or approved.
