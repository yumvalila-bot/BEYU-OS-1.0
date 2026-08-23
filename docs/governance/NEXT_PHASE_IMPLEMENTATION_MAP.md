# Next-Phase Implementation Map

**Status:** planning artifact. `[NOT AUTHORITY]` — nothing here authorises implementation.
**Phase:** 5R · Branch `arena/01a01b69-beyu-os-1-0`

---

## 1. Dependency graph

```
        GOVERNANCE AUTHORITY                     <-- BLOCKING EVERYTHING BELOW
        (C-1 policy provenance, C-5 ratification semantics)
                  |
                  v
        ACCOUNTING RATIFICATION                  <-- Board / CFO / specialists
        (P1-P11; only P4 partially authorised)
                  |
                  v
            P1 / P2 / P3                         <-- entity, CoA, period framework
                  |
                  v
            P5 / P6 / P7                         <-- recognition, FX, period control
                  |
                  v
            P8 / P9 / P10                        <-- execution authority, maker/checker
                  |
                  v
        ACCOUNTING SUBSTRATE                     <-- CoA rows, periods, opening balances
                  |
                  v
             POSTING SERVICE                     <-- the only writer of journal rows
                  |
                  v
     CAPITAL / TREASURY EXECUTION                <-- money movement
```

The graph is strictly ordered. Every arrow is a hard dependency: no lower box may be built while
any higher box is unratified, because the lower box would have to invent the rule the higher box
exists to decide.

---

## 2. What may safely proceed now

These require no accounting judgement and no new governance semantics.

| Workstream | Why it is safe |
|---|---|
| Referential and scope integrity hardening | asserts only that referenced objects exist / stay in scope |
| Audit and event immutability hardening | Art. 8 is already ratified |
| Hostile-test coverage expansion | observation only |
| Test-harness safety (control restoration) | affects tests, never production behaviour |
| Tenant / entity / jurisdiction isolation tests | Art. 9 is already ratified |
| Migration determinism and drift verification | mechanical |
| Documentation of gaps and decision packages | explicitly non-authoritative |
| Read-only governance and capital surfaces | no mutation |

## 3. What must remain blocked

| Blocked item | Blocking dependency |
|---|---|
| `RATIFIED` state, execution-authority mapping | C-5 — defining it *is* the decision |
| Mandatory policy provenance (NOT NULL) | C-1 — would disable `CONST-AI-001` |
| Requiring cited resolutions be APPROVED | C-2 — `CAP-2025-004` cites a TABLED resolution |
| Policy status state machine | C-3 — legal transitions undefined |
| Freezing approved resolutions | C-4 — no amendment procedure exists |
| Chart of accounts, financial periods | P1–P3 |
| Posting service, recognition, FX, tax | P5–P7 |
| `finance:ledger.approve`, maker/checker | P8–P10 |
| Capital execution, treasury settlement | full chain |
| Opening balances | OB-EV evidence decision |

---

## 4. Critical path

The single highest-value unblocking action is **not engineering**. It is a governance decision on
**C-1**: retro-link the five ACTIVE policies to real resolutions, or formally record that policy
provenance is optional in BEYU OS.

Until then the system is structurally sound but cannot *prove* its own authority, and every
downstream box in §1 stays blocked. No amount of further hardening changes this — the remaining
policy-independent work is close to exhausted, which is precisely why the gate is YELLOW rather
than RED.

---

## 5. Phase 5S update — authority verification inserted

Phase 5S verified the firewalls that must hold *before* any ratification is consumed, and added a
step the original graph omitted: **AUTHORITY VERIFICATION**. Ratification alone is not enough; the
system must be able to *check* a ratification before acting on it.

```
      GOVERNANCE DECISION              C-1 .. C-5  [PENDING]
               |
               v
      FORMAL RATIFICATION              APPROVED resolution recorded in BEYU OS
               |
               v
      AUTHORITY VERIFICATION           <-- ADDED 5S
      (provenance is checkable, GOVERNED not REFERENCE_DATA)
               |
               v
            P1 / P2 / P3
               |
               v
            P5 / P6 / P7
               |
               v
            P8 / P9 / P10
               |
               v
      ACCOUNTING SUBSTRATE
               |
               v
         POSTING ENGINE
               |
               v
   CAPITAL / TREASURY EXECUTION
```

**Why AUTHORITY VERIFICATION is a distinct step.** All four seeded resolutions currently evaluate
to `provenance = REFERENCE_DATA`, meaning they have no audit-ledger trail. The capital gate
already refuses to act on `REFERENCE_DATA`, so **even a correctly APPROVED seeded resolution
cannot authorise execution today**. Any future ratification must therefore be *enacted through the
governed voting/decision path* so that it acquires a `GOVERNED` audit trail — not inserted as
seed data. Ratifying by direct data edit would produce a decision the system correctly refuses to
honour.

**Implementable before ratification** (unchanged, and now close to exhausted): referential and
scope integrity, audit immutability, firewall regression tests, harness safety, migration
determinism, decision-ready documentation, read-only surfaces.

**The one thing that must not happen:** encoding an accounting judgement — an account code, a
threshold, a fiscal year, an FX source, a recognition rule — in advance "so it is ready". That
converts an engineering default into de facto policy.
