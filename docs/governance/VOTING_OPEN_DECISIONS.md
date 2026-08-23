# Governance voting — unresolved constitutional decisions

Status: **PARTIALLY RESOLVED — see §1, now closed by the decision transaction.**
Raised by: post-implementation hardening audit of the vote transaction (2026-08-20).
Updated by: the governance decision/closure implementation (2026-08-20).

The vote transaction is implemented and enforced. The questions below are ones the
constitution does not currently answer. They are recorded here rather than resolved
in code, because guessing at them would silently invent governance rules.

Until each is decided, the implementation takes the **conservative** option: it
refuses to act rather than inferring an outcome.

---

## 1. Window expiry has no closing actor — **RESOLVED**

> **Resolution (2026-08-20).** Option B was implemented: closure is an explicit
> governed transaction, `decideResolutionClosure`, performed by the presiding
> officer of the owning body (`CHAIR` or `SECRETARY`) holding
> `governance:resolution.approve`. It reuses the existing capability rather than
> inventing `governance:resolution.decide`. No scheduler was built; option C
> remains a future capability. The original analysis is retained below.

### Original analysis

**Facts.**

- A resolution carries `voting_opens_at` / `voting_closes_at`.
- A decision is only computed when voting has *concluded*, which today means
  every eligible member has voted (`allEligibleVoted`) — or the window has
  closed, evaluated at the moment of a write.
- BEYU OS has **no scheduler, job queue or workflow runner**. `workflow_instances`
  exists as a table, but nothing executes it. There is no cron, no worker, no
  timer, and none was added by this work.

**Consequence.** When a window closes with votes outstanding, nothing runs. The
resolution stays `TABLED` for ever, undecided, and no further vote can be cast.

**What is guaranteed today** (proved by
`tests/governance/vote-service.test.ts` → "permanently refuses votes after the
window closes while the resolution stays TABLED" and "refuses a vote when the
window closes between the pre-check and the transaction"):

- expiry is enforced on **every write path**, both before and *inside* the
  transaction, so it does not depend on any background process;
- an expired resolution is never silently finalised — status, decision date,
  tally and quorum flag all remain untouched;
- no ballot, audit record or event is produced by a refused vote.

**The open question.** Who closes an expired window, and how?

| Option | Description | Cost |
| --- | --- | --- |
| A. Lazy finalisation | The next read of an expired resolution computes and commits the outcome. | A read performs a state transition — an unaudited actor. Rejected unless the constitution names a system principal. |
| B. Explicit governed closure | A presiding officer invokes a `closeVoting` transaction, mirroring `tableResolution`. | Requires a named authority and a new governed action. Smallest addition; consistent with the existing model. |
| C. Scheduled finalisation | A scheduler closes windows automatically. | Requires infrastructure BEYU OS does not have. Deferred — documented as a future capability. |
| D. Status quo | Expired resolutions remain `TABLED` and inert until a human intervenes. | Safe but leaves stale governance records. |

**Recommendation:** option B, once the constitution names the closing authority.
Option C is a future capability and is deliberately not built.

---

## 2. Semantics of an expired window — **RESOLVED**

> **Resolution (2026-08-20).** Both cases are now handled by the decision
> transaction, and neither invents a state:
>
> - **Quorum met** → the outcome is recomputed from the ballots and committed as
>   `APPROVED`, `REJECTED` or `DEADLOCKED`.
> - **Quorum not met** → `DEFERRED`, the existing status meaning "voting closed
>   without quorum; no decision was reachable".
>
> An expired resolution is still never finalised implicitly: it stays `TABLED`
> until the decision authority acts. The original analysis is retained below.

### Original analysis

Two cases must be distinguished, and the constitution currently addresses neither.

**Quorum met, majority determinable.** The arithmetic already yields
`APPROVED` / `REJECTED` / `DEADLOCKED` deterministically from the ballots cast.
The only question is *who is authorised to record it*. This is question 1.

**Quorum not met.** `decideResolution` returns `DEFERRED` with the explanation
"no decision is reachable". `DEFERRED` already exists in the resolution status
enum, so no new state is required.

**Explicitly NOT done.**

- No `EXPIRED` status was added. The governance model does not distinguish
  expiry from deferral, and adding a state purely so the UI has something to
  display would be inventing governance vocabulary.
- An expired resolution is never marked `APPROVED` or `REJECTED` implicitly.

---

## 3. `resolution_votes` tenancy rests on a coding invariant, not RLS

**Facts.**

- 74 tables. 11 have row-level security. 33 carry a `tenant_id` and have **no**
  RLS — including `resolutions` itself. 30 carry no `tenant_id` at all.
- RLS in BEYU OS is therefore **selective**, applied to a chosen set of
  tenant-bearing tables, not a universal rule. Adding RLS to `resolution_votes`
  would not match the canonical model — and could not, because the table has no
  `tenant_id` column to filter on.
- `resolution_votes` is a child of `resolutions` via a foreign key, and derives
  its tenancy solely from that parent.

**The invariant** (now explicit, and previously undocumented):

> Every query against `resolution_votes` MUST be constrained by `resolution_id`
> values that were themselves resolved through `tenantScopeIds()`.

Both current call sites satisfy it: the ballot lookups in
`castVote` are scoped to `ctx.resolution.id`, which
`loadResolutionContext` obtained through `tenantScopeIds(principal)`; the list
query is scoped with `inArray(resolutionVotes.resolutionId, …)` over
already-scoped rows.

**Regression tests** (`tests/tenant-isolation/tenant-isolation.test.ts`):

- the table has no `tenant_id` and does have a foreign key to `resolutions`, so
  the parent is the only tenancy route;
- ballots reached through a scoped resolution set never include another tenant's
  resolution;
- no `.from(resolutionVotes)` in the vote service is unconstrained by
  `resolutionVotes.resolutionId`.

**The open question.** Should the canonical BEYU tenant model require either a
denormalised `tenant_id` with RLS on every tenant-sensitive child table, or a
documented parent-scoping rule? Security currently depends on the invariant
above being observed by every future developer. It is now documented and
regression-tested; it is not enforced by the database.

**Deliberately not done:** RLS was not added to `resolution_votes`. That is a
tenant-model decision, and making it unilaterally would create a second,
inconsistent isolation pattern.

---

## 4. TRUSTEE_BOARD currently has no eligible decision authority

**Raised by:** the decision/closure implementation (2026-08-20).
**Status: OPEN — a seeding/appointment question, not a code defect.**

Decision authority requires BOTH a presiding seat (`CHAIR` or `SECRETARY`) on the
owning body AND the `governance:resolution.approve` capability. For the seeded
bodies that resolves as:

| Body | CHAIR | SECRETARY | Has an eligible closer? |
| --- | --- | --- | --- |
| GROUP_BOARD | Amani Beyu (`GROUP_CEO`, has approve) | Grace Kilele (`CHIEF_GOVERNANCE_OFFICER`, has approve) | Yes — two |
| FAMILY_COUNCIL | Neema Beyu (no approve) | Grace Kilele (has approve) | Yes |
| TRUSTEE_BOARD | Neema Beyu (no approve) | *(no secretary seat)* | **No** |
| INVESTMENT_COMMITTEE | Daudi Moshi (no approve) | *(none)* | **No** |
| RISK_AUDIT_COMMITTEE | John Mrema (no approve) | *(none)* | **No** |
| TAX_GOVERNANCE_COMMITTEE | Daudi Moshi (no approve) | *(none)* | **No** |

Four of six bodies can table and vote but cannot close a resolution. Such a
resolution reaches `VOTED` and stops there.

This is deliberately NOT worked around in code. The alternatives all require a
governance decision:

1. appoint a `SECRETARY` holding `governance:resolution.approve` to each body
   (most consistent with the existing model — GROUP_BOARD and FAMILY_COUNCIL
   already work this way);
2. grant `governance:resolution.approve` to the chair roles of those bodies; or
3. define delegated closure authority.

**Deliberately not done:** granting a global override, weakening the presiding
seat rule, or letting any capability-holder close any body's resolutions. Any of
those would dissolve the separation between voting and decision authority.

---

## 5. Reversal and amendment of a decided resolution

**Status: OPEN — deliberately out of scope.**

Terminal states are immutable: vote, table and decide are all refused once a
resolution is `APPROVED`, `REJECTED`, `DEADLOCKED`, `DEFERRED` or `WITHDRAWN`
(regression-tested). Nothing in the system can currently change a decision.

If the constitution requires that a decision can be revisited, that must be its
own governed amendment transaction with its own authority, audit and event. It
was not built here, and no partial affordance for it was left behind.
