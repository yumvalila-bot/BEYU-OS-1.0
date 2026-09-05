# P7 — Period Linkage — Decision Package

**Decision ID:** P7  
**Title:** Period-Mandatory Rule  
**Authority Required:** Group CFO (Constitution Art. 5)  
**Status:** **PENDING — NOT RATIFIED**  
**Date Prepared:** 2026-09-05  
**Baseline Commit:** 7481263  

---

## 1. Policy Question

Must every journal posting belong to an open, entity-valid financial period?

---

## 2. Current Authoritative Facts

- **[FACT]** `journal_entries.period_id` is **NULLABLE** — the schema permits a journal entry with **no period at all**
- **[FACT]** `journal_entries.legal_entity_id` is NOT NULL, so entity validity is enforceable
- **[FACT]** Currency lives on the entry (`currency`, `fx_rate`), not on the period
- **[FACT]** `financial_periods` table exists with statuses `OPEN|CLOSING|CLOSED|LOCKED` (no defined semantics)
- **[FACT]** 0 periods exist
- **[FACT]** **No period-management permission exists in the 47-permission catalogue** — nobody can currently open a period

---

## 3. Options

| Option | Description | Control Strength | Implementation |
|--------|-------------|-----------------|----------------|
| **A** | Mandatory OPEN period | Strongest | Requires period-management permission |
| **B** | Optional period | Weak | No change required |
| **C** | Mandatory but any status | Medium | Defeats period close control |

---

## 4. Required Determinations

**(a)** Must an **open** period exist?  
**(b)** Must the period belong to the **same legal entity** as the entry?  
**(c)** Is there any **currency** validity requirement on a period?

---

## 5. Edge Cases (All PENDING)

| Edge Case | Required Decision |
|-----------|------------------|
| No period exists | Reject the posting, or auto-create? |
| Period is closed | Reject, or route to the next open period? |
| Period is reopened | Are new postings permitted, or only reversals? |
| Transaction date differs from posting date | Which date selects the period? |

---

## 6. Consequences

- A nullable period is a **control gap**: entries could evade period close entirely, defeating cut-off
- Period boundaries drive cut-off, comparability and VAT reconciliation
- Reopening a closed period is a classic audit red flag

---

## 7. Recommendation

**[RECOMMENDATION]** Every entry must reference a period in status OPEN belonging to the same legal entity; reject when absent or closed; the **transaction date** selects the period.

**Not a decision.**

---

## 8. Required Authority

**Group CFO** (Constitution Art. 5)

---

## 9. Exact Decision Wording

*"Every journal entry must reference a financial period of the same legal entity in status `<OPEN>`. Postings are rejected where no such period exists. The period is selected by the `<transaction / posting>` date. Where a period is reopened, `<only reversing entries / all entries>` may be posted."*

---

## 10. Evidence Summary

| Evidence Type | Found? | Source |
|---------------|--------|--------|
| Authoritative policy document | ❌ NONE | — |
| CFO ratification | ❌ NONE | — |
| Governance resolution | ❌ NONE | — |
| Nullable period_id | ✅ Supporting | Schema |
| Monthly filing obligation | ✅ Supporting | `OBL-TZ-VAT` |

---

## 11. Dependencies

P7 blocks: the posting service design and all period-aware posting.

---

## 12. Historical Impact

- **Current ledger state:** Empty (0 periods, 0 entries)
- **Reversibility:** High before posting begins
- **Audit impact:** A nullable period is a permanent control weakness

---

## 13. Decision Sheet (Blank — For Authority Completion)

```
DECISION ID:            P7 — Period-mandatory rule
QUESTION:               Must every posting belong to an open, entity-valid period?
RECOMMENDED OPTION:     [RECOMMENDATION] Yes; reject when absent or closed; transaction date selects
ALTERNATIVES:           Mandatory OPEN · optional · mandatory but any status
CONSEQUENCES:           period_id is NULLABLE today, so entries could evade period close entirely.
EXACT RATIFICATION WORDING:
    "Every journal entry must reference a financial period of the same legal entity in status
     <OPEN>. Postings are rejected where no such period exists. The period is selected by the
     <transaction / posting> date."
STATUS:                 PENDING
SIGNATORY:              __________
DATE:                   __________
EFFECTIVE DATE:         __________
SCOPE:                  __________
```

---

## 14. Ratification Status

**P7 = PENDING — NOT RATIFIED**

**END OF DECISION PACKAGE**
